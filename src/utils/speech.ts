import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { BunnyVoiceSpeaker } from '../types';
import { getSavedElevenLabsApiKey, synthesizeViaElevenLabsMp3 } from './elevenLabsTts';
import { getSavedGeminiApiKey, tryBackendJson } from './standaloneApi';
import { trySynthesizeSupertonicWavUrl } from './supertonicTts';
import { isVoiceStudioReady, synthesizeViaVoiceStudio } from './voiceStudioTts';

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
    // 다정하고 사랑스러운 아기 토끼 인형 토순이 톤
    pitchKo: 1.18,
    rateKo: 1.03,
    pitchEn: 1.15,
    rateEn: 0.94,
    geminiVoice: 'Leda',
    geminiStyleKo:
      '디즈니·픽사 애니메이션에 나오는 작고 복슬복슬한 아기 토끼 인형 친구처럼, 딱딱한 어른 성우 톤을 절대 쓰지 말고 한 톤 높고 해맑게 웃음기 가득한 아주 귀여운 아기 동물 목소리로 통통 튀듯 사랑스럽게 말해 주세요',
    chimeNotes: [587.33, 783.99, 1046.5], // D5 - G5 - C6
  },
  tosili: {
    // 통통 튀는 장난꾸러기 단짝 인형 토실이 톤
    pitchKo: 1.24,
    rateKo: 1.07,
    pitchEn: 1.2,
    rateEn: 0.96,
    geminiVoice: 'Puck',
    geminiStyleKo:
      '폴짝폴짝 신이 난 귀여운 아기 다람쥐·강아지 인형 친구처럼, 장난기 가득하고 한 톤 높게 통통 튀는 아주 밝고 귀여운 어린이 만화 캐릭터 목소리로 신나게 말해 주세요',
    chimeNotes: [659.25, 880.0, 1174.66], // E5 - A5 - D6
  },
  toddungi: {
    // 말랑말랑 볼이 통통한 막내 애착인형 토뚱이 톤
    pitchKo: 1.16,
    rateKo: 0.99,
    pitchEn: 1.14,
    rateEn: 0.91,
    geminiVoice: 'Zephyr',
    geminiStyleKo:
      '말랑말랑 볼이 통통한 막내 아기 곰돌이·햄스터 인형 친구처럼, 포근하고 애교 가득하며 미소가 묻어나는 아주 귀여운 아기 동물 목소리로 다정하게 말해 주세요',
    chimeNotes: [523.25, 659.25, 783.99], // C5 - E5 - G5
  },
  tobyeori: {
    // 반짝반짝 동화 요정·아기고양이 인형 토별이 톤
    pitchKo: 1.2,
    rateKo: 1.0,
    pitchEn: 1.16,
    rateEn: 0.92,
    geminiVoice: 'Kore',
    geminiStyleKo:
      '반짝반짝 동화 나라의 귀여운 아기 고양이·요정 인형 친구처럼, 방울방울 맑고 사랑스러운 높은 톤의 귀여운 목소리로 상냥하게 말해 주세요',
    chimeNotes: [698.46, 880.0, 1318.51], // F5 - A5 - E6
  },
  togureum: {
    // 씩씩하고 해맑은 꼬마 아기공룡·강아지 대장 토구름 톤 (어른 남성 저음 배제!)
    pitchKo: 1.14,
    rateKo: 1.05,
    pitchEn: 1.12,
    rateEn: 0.94,
    geminiVoice: 'Puck',
    geminiStyleKo:
      '씩씩하고 해맑은 꼬마 아기 공룡·강아지 대장 인형 친구처럼, 절대 낮고 무거운 어른 남성 톤을 쓰지 말고 밝고 귀엽고 명랑한 꼬마 만화 캐릭터 목소리로 씩씩하게 말해 주세요',
    chimeNotes: [493.88, 659.25, 987.77], // B4 - E5 - B5
  },
  assistant: {
    pitchKo: 1.12,
    rateKo: 1.02,
    pitchEn: 1.1,
    rateEn: 0.94,
    geminiVoice: 'Leda',
    geminiStyleKo:
      '다정하고 밝은 미소가 담긴 귀여운 스마트 가족 도우미 요정 목소리로 따뜻하고 부드럽게 말해 주세요',
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
          ? 'You are an adorable, playful, high-pitched Pixar/Disney baby plush animal character speaking to a young child! Use a super cute, bouncy, cheerful cartoon animal voice and read ONLY the exact words provided without adding anything extra.'
          : `[매우 중요한 목소리 연기 지침] ${styleInstruction}. 절대로 낮고 진지한 어른 목소리나 기계적인 아나운서 톤을 쓰지 마세요! 귀여운 만화 속 아기 동물 인형 캐릭터의 목소리 톤과 억양으로, 다른 인사말을 덧붙이지 말고 전달된 대사 문장만 사랑스럽고 자연스럽게 그대로 연기해 말하세요.`;

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

async function playBinaryAudioReliably(
  audioBuf: ArrayBuffer,
  ext: 'mp3' | 'wav',
  speechToken: number
): Promise<boolean> {
  if (speechToken !== currentSpeechToken) return true;
  const audioBytes = new Uint8Array(audioBuf);

  // 1) Native Android MediaPlayer (`playBase64Audio` with `mp3` or `wav` ext — rock-solid hardware STREAM_MUSIC)
  const bridge = getAndroidSpeechBridge();
  if (bridge?.playBase64Audio) {
    const b64 = uint8ToBase64(audioBytes);
    const uttId = `au-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nativePlayed = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('nativeTtsEvent', onEv as EventListener);
        window.clearTimeout(timer);
        resolve(ok);
      };
      const onEv = (ev: Event) => {
        const d = (ev as CustomEvent<{ id?: string; type?: string }>).detail;
        if (!d || d.id !== uttId) return;
        if (d.type === 'done') finish(true);
        else if (d.type === 'error') finish(false);
      };
      const timer = window.setTimeout(() => finish(true), 24000);
      window.addEventListener('nativeTtsEvent', onEv as EventListener);
      try {
        bridge.playBase64Audio!(b64, ext, uttId);
      } catch {
        finish(false);
      }
    });
    if (nativePlayed) return true;
  }

  // 2) Hardware-unlocked WebAudio decodeAudioData
  const ctx = getAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      const decoded = await ctx.decodeAudioData(audioBuf.slice(0));
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
      // Fallback to HTMLAudioElement
    }
  }

  const mime = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
  const blobUrl = URL.createObjectURL(new Blob([audioBuf.slice(0)], { type: mime }));
  return await playAudioDataUrl(blobUrl, speechToken);
}

/**
 * Tier 0A: GitHub Open-Source `VoiceStudio` (`debpalash/VoiceStudio` :3900) / `Voicebox` (:17493) Local AI Voice Engine!
 * Free, zero-API-fee local Qwen3-TTS / OmniVoice voice cloning when enabled!
 */
async function trySpeakWithVoiceStudio(
  text: string,
  speaker: SpeechSpeakerKey,
  lang: 'ko-KR' | 'en-US',
  speechToken: number,
  explicitVoiceId?: string
): Promise<boolean> {
  if (!isVoiceStudioReady()) return false;
  const res = await synthesizeViaVoiceStudio(text, speaker, {
    explicitVoiceId,
    isEnglish: lang === 'en-US',
  });
  if (speechToken !== currentSpeechToken) return true;
  if (!res) return false;
  return await playBinaryAudioReliably(res.buffer, res.ext, speechToken);
}

/**
 * Tier 0B: ElevenLabs (`eleven_flash_v2_5` ~75ms latency) Ultra-Natural Cute Character Voice Engine!
 * Runs whenever user configured an ElevenLabs API key (`Gigi` / `Mimi` / `Jessica` / custom Korean voice).
 */
async function trySpeakWithElevenLabs(
  text: string,
  speaker: SpeechSpeakerKey,
  lang: 'ko-KR' | 'en-US',
  speechToken: number,
  explicitVoiceId?: string
): Promise<boolean> {
  if (!getSavedElevenLabsApiKey()) return false;
  const mp3Buf = await synthesizeViaElevenLabsMp3(text, speaker, {
    explicitVoiceId,
    isEnglish: lang === 'en-US',
  });
  if (speechToken !== currentSpeechToken) return true;
  if (!mp3Buf) return false;
  return await playBinaryAudioReliably(mp3Buf, 'mp3', speechToken);
}

/**
 * Tier 1: Client-Side Gemini 2.5 Native Live Audio (`gemini-2.5-flash-native-audio-preview-12-2025`)!
 * Prioritizes smooth Native Live Audio FIRST (generous free-tier quota & expressive cute baby-animal acting!)
 * and falls back to `gemini-2.5-flash-preview-tts` only if Live WebSocket cannot connect.
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
  const cacheKey = `cute-v2|${profile.geminiVoice}|${lang}|${text.slice(0, 420)}`;
  const cachedWav = GEMINI_AUDIO_LRU.get(cacheKey);
  if (cachedWav) {
    return await playWavBytesReliably(cachedWav, speechToken);
  }

  // 1A) PRIMARY: Genuine Gemini 2.5 Native Audio Live synthesis!
  // Smooth, expressive cute animal character acting even on the Free Gemini API tier (no 3-RPM wall!).
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
    // Try REST preview-tts fallback below
  }

  if (speechToken !== currentSpeechToken) return true;

  // 1B) Secondary fallback: Gemini 2.5 Preview TTS (when not in 429 cooldown)
  if (Date.now() >= previewTtsCooldownUntil) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const promptText =
        lang === 'en-US'
          ? `Say in a super cute, bright, bouncy baby plush animal cartoon voice to a child: ${text.slice(0, 420)}`
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
        previewTtsCooldownUntil = Date.now() + 90_000;
      }
    }
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
  onSpeakingChange?: (speaking: boolean) => void,
  explicitElevenLabsVoiceId?: string,
  explicitVoiceStudioVoiceId?: string
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
    // 0A) Open-Source GitHub `VoiceStudio` (:3900) / `Voicebox` (:17493) Local AI Voice Engine (0 KRW Free!)
    const voiceStudioPlayed = await trySpeakWithVoiceStudio(
      cleanedText,
      speaker,
      lang,
      myToken,
      explicitVoiceStudioVoiceId
    );
    if (voiceStudioPlayed || myToken !== currentSpeechToken) return;

    // 0B) Expressive Cute Character Voice Engine: ElevenLabs (`eleven_flash_v2_5` ~75ms Gigi/Mimi/Jessica/Custom)!
    const elevenPlayed = await trySpeakWithElevenLabs(
      cleanedText,
      speaker,
      lang,
      myToken,
      explicitElevenLabsVoiceId
    );
    if (elevenPlayed || myToken !== currentSpeechToken) return;

    // 1) Smooth Cute Animal Acting Engine: Client-side Gemini 2.5 Native Live Audio (`Leda`/`Puck`/`Zephyr`/`Kore`)
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
  onSpeakingChange?: (speaking: boolean) => void,
  explicitElevenLabsVoiceId?: string,
  explicitVoiceStudioVoiceId?: string
): Promise<void> {
  await runUnifiedSpeechPipeline(
    text,
    speaker,
    'ko-KR',
    enabled,
    onSpeakingChange,
    explicitElevenLabsVoiceId,
    explicitVoiceStudioVoiceId
  );
}

/**
 * Pronounces kid-friendly English sentences or flashcard words clearly
 * for 3-7 year old learners using the designated bunny's voice!
 */
export async function speakEnglishPhrase(
  englishText: string,
  speaker: SpeechSpeakerKey = 'tosuni',
  enabled = true,
  onSpeakingChange?: (speaking: boolean) => void,
  explicitElevenLabsVoiceId?: string,
  explicitVoiceStudioVoiceId?: string
): Promise<void> {
  await runUnifiedSpeechPipeline(
    englishText,
    speaker,
    'en-US',
    enabled,
    onSpeakingChange,
    explicitElevenLabsVoiceId,
    explicitVoiceStudioVoiceId
  );
}
