import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { BunnyVoiceSpeaker } from '../types';
import { getSavedGeminiApiKey, tryBackendJson } from './standaloneApi';
import { trySynthesizeSupertonicWavUrl } from './supertonicTts';

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
  playBase64Audio?: (base64Audio: string, fileExt: string, utteranceId: string) => void;
  stopSpeak: () => void;
  isSttAvailable: () => boolean;
  startListening: (lang: string) => void;
  stopListening: () => void;
  releaseRecognizerForLiveWebRtc?: () => void;
  hasMicPermission?: () => boolean;
  ensureMicPermission?: () => void;
  isPhoneGeminiInstalled?: () => boolean;
  launchPhoneGeminiLive?: (personaPrompt: string) => boolean;
  openExternalUrl?: (url: string) => void;
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
  geminiStyleKo: string;
  chimeNotes: number[];
}

const SPEAKER_PROFILES: Record<SpeechSpeakerKey, SpeakerVoiceProfile> = {
  tosuni: {
    // 다정하고 상냥한 첫째 언니 토순이 톤 (사람처럼 자연스러운 호흡과 포근한 한국어 억양)
    pitchKo: 1.02,
    rateKo: 1.0,
    pitchEn: 1.02,
    rateEn: 0.92,
    geminiVoice: 'Leda',
    geminiStyleKo:
      '실제 다정하고 따뜻한 한국인 유치원 선생님처럼 자연스러운 호흡과 미소 섞인 사람 목소리로 부드럽게 말해 주세요',
    chimeNotes: [587.33, 783.99, 1046.5], // D5 - G5 - C6
  },
  tosili: {
    // 밝고 생동감 있는 단짝 토실이 톤
    pitchKo: 1.04,
    rateKo: 1.05,
    pitchEn: 1.04,
    rateEn: 0.95,
    geminiVoice: 'Zephyr',
    geminiStyleKo:
      '실제 밝고 명랑한 한국인 젊은 여성 친구처럼 자연스럽고 생동감 있는 일상 대화 톤으로 말해 주세요',
    chimeNotes: [659.25, 880.0, 1174.66], // E5 - A5 - D6
  },
  toddungi: {
    // 포근하고 귀여운 막내 토뚱이 톤
    pitchKo: 0.98,
    rateKo: 0.96,
    pitchEn: 0.98,
    rateEn: 0.9,
    geminiVoice: 'Puck',
    geminiStyleKo:
      '실제 포근하고 다정한 한국인 동화 구연가처럼 친근하고 따뜻한 사람 목소리로 말해 주세요',
    chimeNotes: [523.25, 659.25, 783.99], // C5 - E5 - G5
  },
  tobyeori: {
    // 맑고 고운 동화 요정 토별이 톤
    pitchKo: 1.01,
    rateKo: 0.97,
    pitchEn: 1.02,
    rateEn: 0.91,
    geminiVoice: 'Aoede',
    geminiStyleKo:
      '실제 차분하고 고운 목소리의 한국인 성우가 아이에게 옛날이야기를 들려주듯 자연스럽게 말해 주세요',
    chimeNotes: [698.46, 880.0, 1318.51], // F5 - A5 - E6
  },
  togureum: {
    // 씩씩하고 명랑한 소년 대장 토구름 톤
    pitchKo: 1.0,
    rateKo: 1.03,
    pitchEn: 1.0,
    rateEn: 0.93,
    geminiVoice: 'Fenrir',
    geminiStyleKo:
      '실제 유쾌하고 다정한 한국인 삼촌이나 형처럼 밝고 자연스러운 사람 목소리로 말해 주세요',
    chimeNotes: [493.88, 659.25, 987.77], // B4 - E5 - B5
  },
  assistant: {
    pitchKo: 1.0,
    rateKo: 1.0,
    pitchEn: 1.0,
    rateEn: 0.93,
    geminiVoice: 'Kore',
    geminiStyleKo: '실제 친절하고 차분한 한국인 안내원처럼 자연스러운 사람 억양으로 읽어 주세요',
    chimeNotes: [523.25, 783.99],
  },
};

let activeAudio: HTMLAudioElement | null = null;
let activeBufferSource: AudioBufferSourceNode | null = null;
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
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+/gu,
      ''
    )
    .replace(/[*_#`]/g, '')
    .replace(/~+/g, '')
    .replace(/\s+([!?.,])/g, '$1')
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
  if (activeBufferSource) {
    try {
      activeBufferSource.stop();
      activeBufferSource.disconnect();
    } catch {
      // Ignore WebAudio stop errors
    }
    activeBufferSource = null;
  }
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return window.btoa(binary);
}

function buildWavBytesFromPcmBase64(base64Data: string, sampleRate = 24000): Uint8Array {
  const binaryStr = window.atob(base64Data);
  const pcmLen = binaryStr.length;
  if (
    pcmLen >= 4 &&
    binaryStr.charCodeAt(0) === 0x52 && // 'R'
    binaryStr.charCodeAt(1) === 0x49 && // 'I'
    binaryStr.charCodeAt(2) === 0x46 && // 'F'
    binaryStr.charCodeAt(3) === 0x46 // 'F'
  ) {
    const raw = new Uint8Array(pcmLen);
    for (let i = 0; i < pcmLen; i++) raw[i] = binaryStr.charCodeAt(i);
    return raw;
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
  return new Uint8Array(buffer);
}

async function playWavBytesReliably(
  wavBytes: Uint8Array,
  speechToken: number
): Promise<boolean> {
  if (speechToken !== currentSpeechToken) return true;

  // 1) Android APK Native MediaPlayer Bridge (100% immune to WebView user-gesture autoplay block!)
  const bridge = getAndroidSpeechBridge();
  if (bridge && typeof bridge.playBase64Audio === 'function') {
    const wavB64 = uint8ToBase64(wavBytes);
    const uttId = `gemwav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nativeOk = await new Promise<boolean>((resolve) => {
      if (speechToken !== currentSpeechToken) {
        resolve(true);
        return;
      }
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('nativeTtsEvent', onEv as EventListener);
        window.clearTimeout(timer);
        resolve(ok);
      };
      const onEv = (ev: Event) => {
        const d = (ev as CustomEvent<{ id?: string; type?: string }>).detail;
        if (!d || d.id !== uttId) return;
        if (d.type === 'done') done(true);
        else if (d.type === 'error') done(false);
      };
      const approxDurationMs = Math.max(6000, Math.round((wavBytes.length / 48000) * 1000) + 3000);
      const timer = window.setTimeout(() => done(true), approxDurationMs);
      window.addEventListener('nativeTtsEvent', onEv as EventListener);
      try {
        bridge.playBase64Audio!(wavB64, 'wav', uttId);
      } catch {
        done(false);
      }
    });
    if (nativeOk) return true;
  }

  // 2) Unlocked WebAudio AudioContext Buffer Playback (never blocked after async await once unlocked)
  const ctx = getAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      const copyBuf = wavBytes.buffer.slice(
        wavBytes.byteOffset,
        wavBytes.byteOffset + wavBytes.byteLength
      ) as ArrayBuffer;
      const decoded = await ctx.decodeAudioData(copyBuf);
      if (speechToken !== currentSpeechToken) return true;

      return await new Promise<boolean>((resolve) => {
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        src.connect(ctx.destination);
        activeBufferSource = src;
        src.onended = () => {
          if (activeBufferSource === src) activeBufferSource = null;
          resolve(true);
        };
        try {
          src.start(0);
        } catch {
          if (activeBufferSource === src) activeBufferSource = null;
          resolve(false);
        }
      });
    } catch {
      // Fallback to HTMLAudioElement below
    }
  }

  // 3) Standard HTMLAudioElement fallback
  const blobUrl = URL.createObjectURL(
    new Blob([wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength) as ArrayBuffer], {
      type: 'audio/wav',
    })
  );
  return await playAudioDataUrl(blobUrl, speechToken);
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

const GEMINI_AUDIO_LRU = new Map<string, Uint8Array>();
const MAX_GEMINI_AUDIO_LRU = 40;
let previewTtsCooldownUntil = 0;

/**
 * Synthesizes 24kHz PCM via Gemini 2.5 Native Audio Live model (`gemini-2.5-flash-native-audio-preview-12-2025`),
 * which has generous quota and produces genuine conversational human breathing, warmth, and Korean intonation.
 */
async function synthesizeViaGeminiNativeLiveOnce(
  apiKey: string,
  text: string,
  voiceName: string,
  styleInstruction: string,
  lang: 'ko-KR' | 'en-US',
  speechToken: number
): Promise<Uint8Array | null> {
  const ai = new GoogleGenAI({ apiKey });
  const liveModels = [
    'gemini-2.5-flash-native-audio-preview-12-2025',
    'gemini-2.5-flash-native-audio-preview-09-2025',
  ];

  for (const modelName of liveModels) {
    if (speechToken !== currentSpeechToken) return null;
    try {
      const pcmChunks: Uint8Array[] = [];
      let resolveTurn!: (ok: boolean) => void;
      const turnDone = new Promise<boolean>((r) => {
        resolveTurn = r;
      });

      const sysPrompt =
        lang === 'en-US'
          ? 'You are a warm, real human voice actor speaking to a young child. Read ONLY the exact sentence provided by the user naturally and warmly, without adding any extra words.'
          : `${styleInstruction}. 절대로 다른 인사말이나 부연 설명을 덧붙이지 말고, 사용자가 전달한 대사 문장만 실제 사람처럼 아주 자연스럽고 다정한 호흡으로 그대로 말하세요.`;

      const session = await ai.live.connect({
        model: modelName,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          systemInstruction: {
            parts: [{ text: sysPrompt }],
          },
        },
        callbacks: {
          onopen: () => {},
          onmessage: (msg: LiveServerMessage) => {
            const parts = msg.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                const b64 = part.inlineData?.data;
                if (b64) {
                  const bin = window.atob(b64);
                  const arr = new Uint8Array(bin.length);
                  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                  pcmChunks.push(arr);
                }
              }
            }
            if (msg.serverContent?.turnComplete) {
              resolveTurn(true);
            }
          },
          onerror: () => resolveTurn(false),
          onclose: () => resolveTurn(pcmChunks.length > 0),
        },
      });

      const safetyTimer = window.setTimeout(() => resolveTurn(pcmChunks.length > 0), 7500);
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: text.slice(0, 420) }] }],
        turnComplete: true,
      });

      await turnDone;
      window.clearTimeout(safetyTimer);
      try {
        session.close();
      } catch {
        // Ignore close errors
      }

      const totalPcmLen = pcmChunks.reduce((s, c) => s + c.length, 0);
      if (totalPcmLen > 400) {
        const wavBuf = new ArrayBuffer(44 + totalPcmLen);
        const view = new DataView(wavBuf);
        const writeAscii = (offset: number, s: string) => {
          for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
        };
        writeAscii(0, 'RIFF');
        view.setUint32(4, 36 + totalPcmLen, true);
        writeAscii(8, 'WAVE');
        writeAscii(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24000, true);
        view.setUint32(28, 48000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeAscii(36, 'data');
        view.setUint32(40, totalPcmLen, true);

        const out = new Uint8Array(wavBuf);
        let offset = 44;
        for (const chunk of pcmChunks) {
          out.set(chunk, offset);
          offset += chunk.length;
        }
        return out;
      }
    } catch {
      // Try next Live native audio model
    }
  }
  return null;
}

/**
 * Tier 1: Client-Side Gemini 2.5 Native Audio when user saved a Gemini API Key in Settings.
 * Uses studio prebuilt human voices (`Leda`, `Zephyr`, `Puck`, `Aoede`, `Fenrir`) + Native MediaPlayer/WebAudio
 * and automatically falls over from `gemini-2.5-flash-preview-tts` (3 RPM cap) to `gemini-2.5-flash-native-audio`!
 */
async function trySpeakWithClientGeminiKey(
  text: string,
  speaker: SpeechSpeakerKey,
  lang: 'ko-KR' | 'en-US',
  speechToken: number
): Promise<boolean> {
  const apiKey = getSavedGeminiApiKey();
  if (!apiKey) return false;

  const profile = SPEAKER_PROFILES[speaker] ?? SPEAKER_PROFILES.assistant;
  const cacheKey = `${profile.geminiVoice}|${lang}|${text.slice(0, 420)}`;
  const cachedWav = GEMINI_AUDIO_LRU.get(cacheKey);
  if (cachedWav) {
    return await playWavBytesReliably(cachedWav, speechToken);
  }

  // 1A) Fast single-call Gemini 2.5 Preview TTS (when not in 429 cooldown)
  if (Date.now() >= previewTtsCooldownUntil) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const promptText =
        lang === 'en-US'
          ? `Say warmly and naturally to a child: ${text.slice(0, 420)}`
          : `${profile.geminiStyleKo}: ${text.slice(0, 420)}`;

      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: promptText }] }],
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
        const wavBytes = buildWavBytesFromPcmBase64(inline.data, 24000);
        if (GEMINI_AUDIO_LRU.size >= MAX_GEMINI_AUDIO_LRU) {
          const firstKey = GEMINI_AUDIO_LRU.keys().next().value;
          if (firstKey) GEMINI_AUDIO_LRU.delete(firstKey);
        }
        GEMINI_AUDIO_LRU.set(cacheKey, wavBytes);
        return await playWavBytesReliably(wavBytes, speechToken);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        previewTtsCooldownUntil = Date.now() + 65_000;
      }
    }
  }

  if (speechToken !== currentSpeechToken) return true;

  // 1B) Genuine Gemini 2.5 Native Audio Live synthesis (zero 3-RPM TTS cap, true human conversational voice!)
  try {
    const liveWavBytes = await synthesizeViaGeminiNativeLiveOnce(
      apiKey,
      text,
      profile.geminiVoice,
      profile.geminiStyleKo,
      lang,
      speechToken
    );
    if (speechToken !== currentSpeechToken) return true;
    if (liveWavBytes) {
      if (GEMINI_AUDIO_LRU.size >= MAX_GEMINI_AUDIO_LRU) {
        const firstKey = GEMINI_AUDIO_LRU.keys().next().value;
        if (firstKey) GEMINI_AUDIO_LRU.delete(firstKey);
      }
      GEMINI_AUDIO_LRU.set(cacheKey, liveWavBytes);
      return await playWavBytesReliably(liveWavBytes, speechToken);
    }
  } catch {
    // Fall back to Neural TTS bridge below
  }

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

    const maxWaitMs = Math.max(8500, text.length * 420);
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
    // 1) Primary Studio Human Acting Engine: Client-side Gemini 2.5 Native Audio (`Leda`/`Zephyr`/`Puck`/`Aoede`/`Fenrir`)
    // Runs FIRST whenever user configured a Gemini API key so Supertonic/Offline TTS never overrides human Gemini voices!
    const geminiPlayed = await trySpeakWithClientGeminiKey(cleanedText, speaker, lang, myToken);
    if (geminiPlayed || myToken !== currentSpeechToken) return;

    // 2) Optional remote backend server `/api/gemini/tts` (fast no-op when standalone)
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
        const wavBytes = buildWavBytesFromPcmBase64(res.data.audioBase64, 24000);
        const played = await playWavBytesReliably(wavBytes, myToken);
        if (played) return;
      }
    } catch {
      // Continue to standalone Neural engines
    }

    if (myToken !== currentSpeechToken) return;

    // 3) Primary Android APK Zero-Key Conversational MultilingualNeural v2 Bridge (96kbps 24kHz MP3 + Native MediaPlayer)
    const androidPlayed = await speakWithAndroidNativeBridge(cleanedText, speaker, lang, myToken);
    if (androidPlayed || myToken !== currentSpeechToken) return;

    // 4) Optional On-Device Supertone Supertonic-2 Offline Engine (when explicitly enabled & offline)
    try {
      const supertonicUrl = await trySynthesizeSupertonicWavUrl(cleanedText, speaker, lang);
      if (myToken !== currentSpeechToken) return;
      if (supertonicUrl) {
        const played = await playAudioDataUrl(supertonicUrl, myToken);
        if (played) return;
      }
    } catch {
      // Continue to Browser / Cloud engines
    }

    if (myToken !== currentSpeechToken) return;

    // 5) Desktop / Web Browser speechSynthesis
    const browserPlayed = await speakWithBrowserSpeechSynthesis(
      cleanedText,
      speaker,
      lang,
      myToken
    );
    if (browserPlayed || myToken !== currentSpeechToken) return;

    // 6) Last-resort stream fallback
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
