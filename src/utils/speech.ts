import { GoogleGenAI } from '@google/genai';
import { BunnyVoiceSpeaker } from '../types';
import { getSavedGeminiApiKey, tryBackendJson } from './standaloneApi';

export type SpeechSpeakerKey = 'assistant' | BunnyVoiceSpeaker;

export interface AndroidSpeechBridgeInterface {
  isAvailable: () => boolean;
  isTtsReady: () => boolean;
  speak: (
    text: string,
    lang: string,
    pitch: number,
    rate: number,
    speakerKey: string,
    utteranceId: string
  ) => void;
  stopSpeak: () => void;
  isSttAvailable: () => boolean;
  startListening: (lang: string) => void;
  stopListening: () => void;
}

declare global {
  interface Window {
    AndroidSpeechBridge?: AndroidSpeechBridgeInterface;
  }
}

interface SpeakerVoiceProfile {
  pitchKo: number;
  rateKo: number;
  pitchEn: number;
  rateEn: number;
  geminiVoice: string;
  chimeNotes: number[];
}

const SPEAKER_PROFILES: Record<SpeechSpeakerKey, SpeakerVoiceProfile> = {
  tosuni: {
    // 다정하고 상냥한 첫째 언니 토순이 톤
    pitchKo: 1.28,
    rateKo: 1.0,
    pitchEn: 1.22,
    rateEn: 0.88,
    geminiVoice: 'Kore',
    chimeNotes: [587.33, 783.99, 1046.5], // D5 - G5 - C6
  },
  tosili: {
    // 통통 튀고 발랄한 하이톤 단짝 토실이 톤
    pitchKo: 1.54,
    rateKo: 1.13,
    pitchEn: 1.42,
    rateEn: 0.94,
    geminiVoice: 'Zephyr',
    chimeNotes: [659.25, 880.0, 1174.66], // E5 - A5 - D6
  },
  toddungi: {
    // 귀염둥이 느긋하고 통통한 막내 토뚱이 톤
    pitchKo: 0.86,
    rateKo: 0.9,
    pitchEn: 0.9,
    rateEn: 0.84,
    geminiVoice: 'Puck',
    chimeNotes: [523.25, 659.25, 783.99], // C5 - E5 - G5
  },
  tobyeori: {
    // 맑고 고운 동화 요정 토별이 톤
    pitchKo: 1.4,
    rateKo: 0.95,
    pitchEn: 1.32,
    rateEn: 0.86,
    geminiVoice: 'Aoede',
    chimeNotes: [698.46, 880.0, 1318.51], // F5 - A5 - E6
  },
  togureum: {
    // 씩씩하고 명랑한 소년 대장 토구름 톤
    pitchKo: 1.04,
    rateKo: 1.08,
    pitchEn: 1.02,
    rateEn: 0.9,
    geminiVoice: 'Fenrir',
    chimeNotes: [493.88, 659.25, 987.77], // B4 - E5 - B5
  },
  assistant: {
    pitchKo: 1.0,
    rateKo: 1.0,
    pitchEn: 1.0,
    rateEn: 0.92,
    geminiVoice: 'Kore',
    chimeNotes: [523.25, 783.99],
  },
};

let activeAudio: HTMLAudioElement | null = null;
let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;
let currentSpeechToken = 0;
let activeTtsCount = 0;

function notifyGlobalTtsActivity(speaking: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kidsPhotoTtsActive', { detail: { speaking } }));
}

export function isAnyTtsSpeaking(): boolean {
  return activeTtsCount > 0;
}

export function getAndroidSpeechBridge(): AndroidSpeechBridgeInterface | null {
  if (typeof window === 'undefined') return null;
  if (window.AndroidSpeechBridge && typeof window.AndroidSpeechBridge.speak === 'function') {
    return window.AndroidSpeechBridge;
  }
  return null;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      sharedAudioCtx = new Ctor();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Clean decorative markdown/symbols so TTS pronounces natural conversational Korean/English.
 */
function sanitizeTextForSpeech(raw: string): string {
  return raw
    .replace(/[*_#`]/g, '')
    .replace(/~+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Unlocks Web Audio & SpeechSynthesis on first user pointer/key gesture
 * so bunny voices and chimes always play audibly.
 */
export function installGlobalAudioUnlock() {
  if (typeof window === 'undefined' || audioUnlocked) return;

  const unlock = () => {
    audioUnlocked = true;
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.getVoices();
      } catch {
        // Ignore unsupported WebView speechSynthesis
      }
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

/**
 * Plays a cheerful, soft 3D marimba/pop chime unique to each bunny when hopping out or speaking.
 */
export function playBunnyChime(speaker: SpeechSpeakerKey, enabled = true) {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const profile = SPEAKER_PROFILES[speaker] ?? SPEAKER_PROFILES.assistant;
    const notes = profile.chimeNotes;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = speaker === 'toddungi' || speaker === 'togureum' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);

      gain.gain.setValueAtTime(0.001, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.065 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.065 + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.25);
    });
  } catch {
    // Ignore audio context restrictions
  }
}

export function stopCurrentSpeech() {
  currentSpeechToken += 1;
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // Ignore audio pause errors
    }
    activeAudio = null;
  }
  const bridge = getAndroidSpeechBridge();
  if (bridge) {
    try {
      bridge.stopSpeak();
    } catch {
      // Ignore native bridge stop error
    }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore WebView speechSynthesis error
    }
  }
  if (activeTtsCount > 0) {
    activeTtsCount = 0;
    notifyGlobalTtsActivity(false);
  }
}

function wrapPcmBase64AsWavUrl(base64Data: string, sampleRate = 24000): string {
  const binaryStr = window.atob(base64Data);
  const pcmLen = binaryStr.length;
  if (
    pcmLen >= 4 &&
    binaryStr.charCodeAt(0) === 0x52 && // 'R'
    binaryStr.charCodeAt(1) === 0x49 && // 'I'
    binaryStr.charCodeAt(2) === 0x46 && // 'F'
    binaryStr.charCodeAt(3) === 0x46 // 'F'
  ) {
    return `data:audio/wav;base64,${base64Data}`;
  }

  const buffer = new ArrayBuffer(44 + pcmLen);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcmLen, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcmLen, true);

  const bytes = new Uint8Array(buffer, 44);
  for (let i = 0; i < pcmLen; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

async function playAudioDataUrl(url: string, speechToken: number): Promise<boolean> {
  if (speechToken !== currentSpeechToken) return true;
  const audio = new Audio(url);
  activeAudio = audio;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const cleanup = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (activeAudio === audio) activeAudio = null;
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
      resolve(ok);
    };

    audio.onended = () => cleanup(true);
    audio.onerror = () => cleanup(false);
    audio.play().catch(() => cleanup(false));
  });
}

/**
 * Tier 1: Optional Client-Side Gemini 2.5 Flash TTS when user saved a Gemini API Key in Settings.
 * Gives ultra-expressive neural character voices per bunny (`Kore`, `Zephyr`, `Puck`, `Aoede`, `Fenrir`).
 */
async function trySpeakWithClientGeminiKey(
  text: string,
  speaker: SpeechSpeakerKey,
  lang: 'ko-KR' | 'en-US',
  speechToken: number
): Promise<boolean> {
  const apiKey = getSavedGeminiApiKey();
  if (!apiKey) return false;

  try {
    const profile = SPEAKER_PROFILES[speaker] ?? SPEAKER_PROFILES.assistant;
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: text.slice(0, 420) }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: profile.geminiVoice,
            },
          },
        },
      },
    });

    if (speechToken !== currentSpeechToken) return true;

    const inline = res.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (inline?.data) {
      const wavUrl = wrapPcmBase64AsWavUrl(inline.data, 24000);
      return await playAudioDataUrl(wavUrl, speechToken);
    }
  } catch {
    // Fall back immediately to Native Android TTS or Browser TTS
  }
  void lang;
  return false;
}

/**
 * Tier 2 (Primary Standalone Android Engine): Native Android `TextToSpeech` via `window.AndroidSpeechBridge`.
 * Works 100% offline with zero API keys, loud media stream output, and per-bunny pitch/rate/voice!
 */
function speakWithAndroidNativeBridge(
  text: string,
  speaker: SpeechSpeakerKey,
  lang: 'ko-KR' | 'en-US',
  speechToken: number
): Promise<boolean> {
  const bridge = getAndroidSpeechBridge();
  if (!bridge) return Promise.resolve(false);

  const profile = SPEAKER_PROFILES[speaker] ?? SPEAKER_PROFILES.assistant;
  const pitch = lang === 'en-US' ? profile.pitchEn : profile.pitchKo;
  const rate = lang === 'en-US' ? profile.rateEn : profile.rateKo;
  const utteranceId = `utt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return new Promise<boolean>((resolve) => {
    if (speechToken !== currentSpeechToken) {
      resolve(true);
      return;
    }

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('nativeTtsEvent', onNativeEvent as EventListener);
      window.clearTimeout(safetyTimer);
      resolve(ok);
    };

    const onNativeEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ id?: string; type?: string }>).detail;
      if (!detail || detail.id !== utteranceId) return;
      if (detail.type === 'done') {
        finish(true);
      } else if (detail.type === 'error') {
        finish(false);
      }
    };

    const maxWaitMs = Math.max(4000, text.length * 320);
    const safetyTimer = window.setTimeout(() => finish(true), maxWaitMs);

    window.addEventListener('nativeTtsEvent', onNativeEvent as EventListener);

    try {
      bridge.speak(text, lang, pitch, rate, speaker, utteranceId);
    } catch {
      finish(false);
    }
  });
}

/**
 * Tier 3: Desktop/Mobile Web Browser `window.speechSynthesis` with per-bunny pitch & rate.
 */
function speakWithBrowserSpeechSynthesis(
  text: string,
  speaker: SpeechSpeakerKey,
  lang: 'ko-KR' | 'en-US',
  speechToken: number
): Promise<boolean> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve(false);
  }

  const profile = SPEAKER_PROFILES[speaker] ?? SPEAKER_PROFILES.assistant;

  return new Promise<boolean>((resolve) => {
    if (speechToken !== currentSpeechToken) {
      resolve(true);
      return;
    }

    try {
      window.speechSynthesis.cancel();
    } catch {
      resolve(false);
      return;
    }

    window.setTimeout(() => {
      if (speechToken !== currentSpeechToken) {
        resolve(true);
        return;
      }

      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang;

        const voices = window.speechSynthesis.getVoices();
        const prefix = lang === 'en-US' ? 'en' : 'ko';
        const matchingVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
        if (matchingVoices.length > 0) {
          const speakerIndexMap: Record<SpeechSpeakerKey, number> = {
            tosuni: 0,
            tosili: 1,
            toddungi: 2,
            tobyeori: 3,
            togureum: 4,
            assistant: 0,
          };
          const googlePreferred = matchingVoices.filter((v) => v.name.includes('Google'));
          const pool = googlePreferred.length > 0 ? googlePreferred : matchingVoices;
          utter.voice = pool[speakerIndexMap[speaker] % pool.length];
        }

        utter.pitch = lang === 'en-US' ? profile.pitchEn : profile.pitchKo;
        utter.rate = lang === 'en-US' ? profile.rateEn : profile.rateKo;

        let started = false;
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(startCheckTimer);
          window.clearTimeout(maxTimer);
          resolve(ok);
        };

        // Detect silent no-op WebViews where speechSynthesis exists on window but never starts speaking
        const startCheckTimer = window.setTimeout(() => {
          if (!started && !window.speechSynthesis.speaking) {
            finish(false);
          }
        }, 900);

        const maxTimer = window.setTimeout(
          () => finish(started),
          Math.max(3500, text.length * 280)
        );

        utter.onstart = () => {
          started = true;
        };
        utter.onend = () => finish(true);
        utter.onerror = () => finish(false);

        window.speechSynthesis.speak(utter);
      } catch {
        resolve(false);
      }
    }, 35);
  });
}

/**
 * Tier 4: Cloud HTTP TTS stream last-resort fallback if a device has neither TTS engine nor browser voices.
 */
async function speakWithCloudStreamFallback(
  text: string,
  speaker: SpeechSpeakerKey,
  lang: 'ko-KR' | 'en-US',
  speechToken: number
): Promise<boolean> {
  try {
    const tl = lang === 'en-US' ? 'en' : 'ko';
    const clean = text.slice(0, 180);
    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(
      clean
    )}`;
    const profile = SPEAKER_PROFILES[speaker] ?? SPEAKER_PROFILES.assistant;
    const audio = new Audio(url);
    audio.playbackRate = Math.max(0.8, Math.min(1.3, lang === 'en-US' ? profile.rateEn : profile.rateKo));
    activeAudio = audio;

    return await new Promise<boolean>((resolve) => {
      if (speechToken !== currentSpeechToken) {
        resolve(true);
        return;
      }
      audio.onended = () => {
        if (activeAudio === audio) activeAudio = null;
        resolve(true);
      };
      audio.onerror = () => {
        if (activeAudio === audio) activeAudio = null;
        resolve(false);
      };
      audio.play().catch(() => {
        if (activeAudio === audio) activeAudio = null;
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

async function runUnifiedSpeechPipeline(
  rawText: string,
  speaker: SpeechSpeakerKey,
  lang: 'ko-KR' | 'en-US',
  enabled: boolean,
  onSpeakingChange?: (speaking: boolean) => void
): Promise<void> {
  const cleanedText = sanitizeTextForSpeech(rawText);
  if (!enabled || !cleanedText) {
    onSpeakingChange?.(false);
    return;
  }

  stopCurrentSpeech();
  const myToken = ++currentSpeechToken;

  activeTtsCount += 1;
  notifyGlobalTtsActivity(true);
  playBunnyChime(speaker, enabled);
  onSpeakingChange?.(true);

  try {
    // 1) Optional remote backend server `/api/gemini/tts` (fast no-op when standalone)
    try {
      const res = await tryBackendJson<{
        audioBase64?: string;
        mimeType?: string;
        fallback?: boolean;
      }>(
        '/api/gemini/tts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleanedText,
            speaker,
            lang: lang === 'en-US' ? 'en' : 'ko',
          }),
        },
        4500
      );

      if (res.ok && res.data.audioBase64 && !res.data.fallback) {
        const dataUrl = `data:${res.data.mimeType || 'audio/wav'};base64,${res.data.audioBase64}`;
        const played = await playAudioDataUrl(dataUrl, myToken);
        if (played) return;
      }
    } catch {
      // Continue to standalone engines
    }

    if (myToken !== currentSpeechToken) return;

    // 2) Optional client-side Gemini neural TTS if user registered a Gemini API Key
    const geminiPlayed = await trySpeakWithClientGeminiKey(cleanedText, speaker, lang, myToken);
    if (geminiPlayed || myToken !== currentSpeechToken) return;

    // 3) Primary Android APK Native TextToSpeech Bridge (100% offline-capable, distinct pitch/rate per bunny!)
    const androidPlayed = await speakWithAndroidNativeBridge(cleanedText, speaker, lang, myToken);
    if (androidPlayed || myToken !== currentSpeechToken) return;

    // 4) Desktop / Web Browser speechSynthesis
    const browserPlayed = await speakWithBrowserSpeechSynthesis(
      cleanedText,
      speaker,
      lang,
      myToken
    );
    if (browserPlayed || myToken !== currentSpeechToken) return;

    // 5) Last-resort stream fallback
    await speakWithCloudStreamFallback(cleanedText, speaker, lang, myToken);
  } finally {
    if (myToken === currentSpeechToken) {
      activeTtsCount = 0;
      onSpeakingChange?.(false);
      notifyGlobalTtsActivity(false);
    }
  }
}

export async function speakText(
  text: string,
  speaker: SpeechSpeakerKey,
  enabled = true,
  onSpeakingChange?: (speaking: boolean) => void
): Promise<void> {
  await runUnifiedSpeechPipeline(text, speaker, 'ko-KR', enabled, onSpeakingChange);
}

/**
 * Pronounces kid-friendly English sentences or flashcard words clearly
 * for 3-7 year old learners using the designated bunny's voice!
 */
export async function speakEnglishPhrase(
  englishText: string,
  speaker: SpeechSpeakerKey = 'tosuni',
  enabled = true,
  onSpeakingChange?: (speaking: boolean) => void
): Promise<void> {
  await runUnifiedSpeechPipeline(englishText, speaker, 'en-US', enabled, onSpeakingChange);
}
