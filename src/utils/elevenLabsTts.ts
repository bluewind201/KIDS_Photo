import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { BunnyVoiceSpeaker } from '../types';

export const ELEVENLABS_KEY_STORAGE_KEY = 'kids_photo_elevenlabs_api_key';
export const ELEVENLABS_CONFIG_STORAGE_KEY = 'kids_photo_elevenlabs_config_v1';

export type ElevenLabsModelId = 'eleven_flash_v2_5' | 'eleven_multilingual_v2';

export interface ElevenLabsVoicePreset {
  id: string;
  voiceId: string;
  name: string;
  koreanLabel: string;
  category?: string;
  previewUrl?: string;
}

export type ElevenLabsRemoteVoice = ElevenLabsVoicePreset;

export interface ElevenLabsConfig {
  apiKey: string;
  enabled: boolean;
  modelId: ElevenLabsModelId;
  /** Optional per-speaker ElevenLabs voiceId overrides chosen by parent */
  speakerVoiceMap: Record<BunnyVoiceSpeaker, string>;
}

/**
 * Built-in ElevenLabs premade voices tuned specifically for cute, lively animated animal characters in Korean & English.
 */
export const ELEVENLABS_CUTE_VOICE_PRESETS: ElevenLabsVoicePreset[] = [
  {
    id: 'jBpfuIE2acCO8z3wKNLl',
    voiceId: 'jBpfuIE2acCO8z3wKNLl',
    name: '🎀 Gigi (귀여운 아기 만화 캐릭터 톤 · 추천)',
    koreanLabel: '🎀 Gigi (귀여운 아기 만화 캐릭터 톤 · 추천)',
    category: 'premade',
  },
  {
    id: 'zrHiDhphv9ZnVXBqCLjz',
    voiceId: 'zrHiDhphv9ZnVXBqCLjz',
    name: '🧸 Mimi (말랑말랑 동화 속 애착인형 톤 · 추천)',
    koreanLabel: '🧸 Mimi (말랑말랑 동화 속 애착인형 톤 · 추천)',
    category: 'premade',
  },
  {
    id: 'cgSgspJ2msm6clMCkdW9',
    voiceId: 'cgSgspJ2msm6clMCkdW9',
    name: '🐰 Jessica (해맑고 통통 튀는 다정 단짝 톤)',
    koreanLabel: '🐰 Jessica (해맑고 통통 튀는 다정 단짝 톤)',
    category: 'premade',
  },
  {
    id: 'FGY2WhTYpPnrIDTdsKH5',
    voiceId: 'FGY2WhTYpPnrIDTdsKH5',
    name: '🌟 Laura (상큼발랄 장난꾸러기 톤)',
    koreanLabel: '🌟 Laura (상큼발랄 장난꾸러기 톤)',
    category: 'premade',
  },
  {
    id: '9BWtsMINqrJLrRacOk9x',
    voiceId: '9BWtsMINqrJLrRacOk9x',
    name: '🐶 Aria (생동감 넘치는 표현력 대장 톤)',
    koreanLabel: '🐶 Aria (생동감 넘치는 표현력 대장 톤)',
    category: 'premade',
  },
  {
    id: 'pFZP5JQG7iQjIQuC4Bku',
    voiceId: 'pFZP5JQG7iQjIQuC4Bku',
    name: '🧚 Lily (포근하고 다정한 구연동화 톤)',
    koreanLabel: '🧚 Lily (포근하고 다정한 구연동화 톤)',
    category: 'premade',
  },
];

export const ELEVENLABS_CUTE_PRESET_VOICES = ELEVENLABS_CUTE_VOICE_PRESETS;

export const DEFAULT_SPEAKER_ELEVENLABS_VOICES: Record<BunnyVoiceSpeaker, string> = {
  tosuni: 'cgSgspJ2msm6clMCkdW9', // Jessica: playful, warm, youthful
  tosili: 'jBpfuIE2acCO8z3wKNLl', // Gigi: cute animated cartoon kid voice!
  toddungi: 'zrHiDhphv9ZnVXBqCLjz', // Mimi: adorable plush animated voice!
  tobyeori: 'FGY2WhTYpPnrIDTdsKH5', // Laura: sunny, upbeat fairy tone
  togureum: '9BWtsMINqrJLrRacOk9x', // Aria: bright, expressive leader tone
};

export const SPEAKER_DEFAULT_ELEVENLABS_VOICE = DEFAULT_SPEAKER_ELEVENLABS_VOICES;

const SPEAKER_VOICE_SETTINGS: Record<
  BunnyVoiceSpeaker | 'assistant',
  { stability: number; similarity_boost: number; style: number }
> = {
  tosuni: { stability: 0.36, similarity_boost: 0.8, style: 0.52 },
  tosili: { stability: 0.3, similarity_boost: 0.78, style: 0.62 },
  toddungi: { stability: 0.34, similarity_boost: 0.8, style: 0.58 },
  tobyeori: { stability: 0.38, similarity_boost: 0.78, style: 0.48 },
  togureum: { stability: 0.4, similarity_boost: 0.78, style: 0.46 },
  assistant: { stability: 0.42, similarity_boost: 0.8, style: 0.42 },
};

// In-memory LRU MP3 cache so repeated greetings & English flashcards cost 0 credits and play in 0ms!
const ELEVENLABS_MP3_CACHE = new Map<string, ArrayBuffer>();
const MAX_MP3_CACHE = 80;
let elevenLabsCooldownUntil = 0;

export function getSavedElevenLabsApiKey(): string {
  try {
    return (localStorage.getItem(ELEVENLABS_KEY_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function hasElevenLabsApiKey(): boolean {
  const cfg = getSavedElevenLabsConfig();
  return cfg.enabled && cfg.apiKey.length > 10;
}

export function saveElevenLabsApiKey(key: string): void {
  try {
    const cleaned = key.trim();
    if (cleaned) {
      localStorage.setItem(ELEVENLABS_KEY_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(ELEVENLABS_KEY_STORAGE_KEY);
    }
    elevenLabsCooldownUntil = 0;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kidsPhotoElevenLabsUpdated'));
    }
  } catch {
    // ignore storage write errors
  }
}

export function getSavedElevenLabsConfig(): ElevenLabsConfig {
  const savedKey = getSavedElevenLabsApiKey();
  try {
    const raw = localStorage.getItem(ELEVENLABS_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ElevenLabsConfig>;
      const apiKey = (parsed.apiKey ?? savedKey).trim();
      return {
        apiKey,
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : apiKey.length > 10,
        modelId:
          parsed.modelId === 'eleven_multilingual_v2'
            ? 'eleven_multilingual_v2'
            : 'eleven_flash_v2_5',
        speakerVoiceMap: {
          ...DEFAULT_SPEAKER_ELEVENLABS_VOICES,
          ...(parsed.speakerVoiceMap ?? {}),
        },
      };
    }
  } catch {
    // ignore
  }
  return {
    apiKey: savedKey,
    enabled: savedKey.length > 10,
    modelId: 'eleven_flash_v2_5',
    speakerVoiceMap: { ...DEFAULT_SPEAKER_ELEVENLABS_VOICES },
  };
}

export const loadElevenLabsConfig = getSavedElevenLabsConfig;

export function saveElevenLabsConfig(patch: Partial<ElevenLabsConfig>): ElevenLabsConfig {
  const cur = getSavedElevenLabsConfig();
  const nextApiKey = typeof patch.apiKey === 'string' ? patch.apiKey.trim() : cur.apiKey;
  if (typeof patch.apiKey === 'string') {
    saveElevenLabsApiKey(nextApiKey);
  }
  const next: ElevenLabsConfig = {
    apiKey: nextApiKey,
    enabled:
      typeof patch.enabled === 'boolean' ? patch.enabled : nextApiKey.length > 10,
    modelId: patch.modelId ?? cur.modelId,
    speakerVoiceMap: {
      ...cur.speakerVoiceMap,
      ...(patch.speakerVoiceMap ?? {}),
    },
  };
  try {
    localStorage.setItem(ELEVENLABS_CONFIG_STORAGE_KEY, JSON.stringify(next));
    elevenLabsCooldownUntil = 0;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kidsPhotoElevenLabsUpdated'));
    }
  } catch {
    // ignore
  }
  return next;
}

export interface ElevenLabsAccountStatus {
  ok: boolean;
  tier?: string;
  subscriptionTier?: string;
  characterCount?: number;
  characterLimit?: number;
  voices: ElevenLabsVoicePreset[];
  errorMsg?: string;
  error?: string;
}

/**
 * Verifies the user's ElevenLabs API key, fetches remaining character quota,
 * and loads all voices in their ElevenLabs account (including custom Voice Library cute Korean voices!).
 */
export async function fetchElevenLabsAccountAndVoices(
  overrideKey?: string
): Promise<ElevenLabsAccountStatus> {
  const apiKey = (overrideKey ?? getSavedElevenLabsApiKey()).trim();
  if (!apiKey) {
    const msg = '일레븐랩스(ElevenLabs) API 키를 입력해 주세요.';
    return {
      ok: false,
      voices: ELEVENLABS_CUTE_VOICE_PRESETS,
      errorMsg: msg,
      error: msg,
    };
  }

  try {
    const headers = {
      'xi-api-key': apiKey,
      Accept: 'application/json',
    };

    let voicesJson: {
      voices?: Array<{
        voice_id: string;
        name: string;
        category?: string;
        preview_url?: string;
        labels?: Record<string, string>;
      }>;
    } | null = null;

    let subJson: {
      tier?: string;
      character_count?: number;
      character_limit?: number;
    } | null = null;

    if (Capacitor.isNativePlatform()) {
      const [vRes, sRes] = await Promise.all([
        CapacitorHttp.get({
          url: 'https://api.elevenlabs.io/v1/voices',
          headers,
          connectTimeout: 9000,
          readTimeout: 9000,
        }),
        CapacitorHttp.get({
          url: 'https://api.elevenlabs.io/v1/user/subscription',
          headers,
          connectTimeout: 8000,
          readTimeout: 8000,
        }).catch(() => null),
      ]);

      if (vRes.status < 200 || vRes.status >= 300) {
        const msg =
          vRes.status === 401
            ? 'API 키가 올바르지 않습니다. sk_... 형태의 키를 확인해 주세요.'
            : `ElevenLabs 연결 오류 (HTTP ${vRes.status})`;
        return {
          ok: false,
          voices: ELEVENLABS_CUTE_VOICE_PRESETS,
          errorMsg: msg,
          error: msg,
        };
      }
      voicesJson = typeof vRes.data === 'string' ? JSON.parse(vRes.data) : vRes.data;
      if (sRes && sRes.status >= 200 && sRes.status < 300) {
        subJson = typeof sRes.data === 'string' ? JSON.parse(sRes.data) : sRes.data;
      }
    } else {
      const [vRes, sRes] = await Promise.all([
        fetch('https://api.elevenlabs.io/v1/voices', { headers }),
        fetch('https://api.elevenlabs.io/v1/user/subscription', { headers }).catch(() => null),
      ]);
      if (!vRes.ok) {
        const msg =
          vRes.status === 401
            ? 'API 키가 올바르지 않습니다. sk_... 형태의 키를 확인해 주세요.'
            : `ElevenLabs 연결 오류 (HTTP ${vRes.status})`;
        return {
          ok: false,
          voices: ELEVENLABS_CUTE_VOICE_PRESETS,
          errorMsg: msg,
          error: msg,
        };
      }
      voicesJson = await vRes.json();
      if (sRes && sRes.ok) {
        subJson = await sRes.json();
      }
    }

    const mergedVoices = new Map<string, ElevenLabsVoicePreset>();
    for (const preset of ELEVENLABS_CUTE_VOICE_PRESETS) {
      mergedVoices.set(preset.voiceId, preset);
    }

    for (const v of voicesJson?.voices ?? []) {
      if (!v.voice_id) continue;
      const existing = mergedVoices.get(v.voice_id);
      if (existing) {
        mergedVoices.set(v.voice_id, { ...existing, previewUrl: v.preview_url });
      } else {
        const isCustom = v.category && v.category !== 'premade';
        const desc = v.labels?.description || v.labels?.age || v.category || '보이스';
        mergedVoices.set(v.voice_id, {
          id: v.voice_id,
          voiceId: v.voice_id,
          name: v.name,
          koreanLabel: `${isCustom ? '✨ 내 보이스' : '🎙️'} ${v.name} (${desc})`,
          category: v.category,
          previewUrl: v.preview_url,
        });
      }
    }

    // Put custom / library voices + cute presets at the top!
    const sortedVoices = Array.from(mergedVoices.values()).sort((a, b) => {
      const aCustom = a.category && a.category !== 'premade' ? 0 : 1;
      const bCustom = b.category && b.category !== 'premade' ? 0 : 1;
      if (aCustom !== bCustom) return aCustom - bCustom;
      return 0;
    });

    return {
      ok: true,
      tier: subJson?.tier,
      subscriptionTier: subJson?.tier,
      characterCount: subJson?.character_count,
      characterLimit: subJson?.character_limit,
      voices: sortedVoices,
    };
  } catch {
    const msg = '일레븐랩스 서버에 연결하지 못했습니다. 인터넷 연결 및 API 키를 확인해 주세요.';
    return {
      ok: false,
      voices: ELEVENLABS_CUTE_VOICE_PRESETS,
      errorMsg: msg,
      error: msg,
    };
  }
}

/**
 * Synthesizes ultra-natural, expressive character speech via ElevenLabs (`eleven_flash_v2_5` ~75ms latency)
 * and returns raw MP3 ArrayBuffer ready for hardware-unlocked WebAudio playback!
 */
export async function synthesizeViaElevenLabsMp3(
  text: string,
  speaker: BunnyVoiceSpeaker | 'assistant',
  options?: {
    explicitVoiceId?: string;
    isEnglish?: boolean;
  }
): Promise<ArrayBuffer | null> {
  const apiKey = getSavedElevenLabsApiKey();
  if (!apiKey || apiKey.length < 12) return null;
  if (Date.now() < elevenLabsCooldownUntil) return null;

  const cleanText = text.trim();
  if (!cleanText) return null;

  const cfg = getSavedElevenLabsConfig();
  const resolvedSpeaker: BunnyVoiceSpeaker =
    speaker === 'assistant' ? 'tosuni' : speaker;
  const voiceId =
    options?.explicitVoiceId?.trim() ||
    cfg.speakerVoiceMap[resolvedSpeaker] ||
    DEFAULT_SPEAKER_ELEVENLABS_VOICES[resolvedSpeaker] ||
    'jBpfuIE2acCO8z3wKNLl';

  const modelId = cfg.modelId || 'eleven_flash_v2_5';
  const cacheKey = `${voiceId}::${modelId}::${cleanText}`;
  const cached = ELEVENLABS_MP3_CACHE.get(cacheKey);
  if (cached && cached.byteLength > 128) {
    return cached.slice(0);
  }

  const settings = SPEAKER_VOICE_SETTINGS[speaker] ?? SPEAKER_VOICE_SETTINGS.tosuni;
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const bodyObj: Record<string, unknown> = {
    text: cleanText,
    model_id: modelId,
    voice_settings: {
      stability: settings.stability,
      similarity_boost: settings.similarity_boost,
      style: settings.style,
      use_speaker_boost: true,
    },
  };
  if (modelId === 'eleven_flash_v2_5') {
    bodyObj.language_code = options?.isEnglish ? 'en' : 'ko';
  }

  try {
    // 1) Fast browser/WebView fetch path (ElevenLabs API supports CORS directly with `xi-api-key`!)
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 11000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(bodyObj),
        signal: controller.signal,
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 256) {
          rememberMp3Cache(cacheKey, buf);
          return buf.slice(0);
        }
      } else if (res.status === 401 || res.status === 402 || res.status === 429) {
        elevenLabsCooldownUntil = Date.now() + 60_000;
        return null;
      }
    } catch {
      // Fall through to Native CapacitorHttp if WebView fetch encountered network/CORS policy
    } finally {
      window.clearTimeout(timer);
    }

    // 2) Native Android CapacitorHttp fallback
    if (Capacitor.isNativePlatform()) {
      const nRes = await CapacitorHttp.post({
        url: endpoint,
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        data: bodyObj,
        responseType: 'blob',
        connectTimeout: 9000,
        readTimeout: 11000,
      });
      if (nRes.status >= 200 && nRes.status < 300 && typeof nRes.data === 'string' && nRes.data.length > 128) {
        const stripped = nRes.data.includes(',')
          ? nRes.data.slice(nRes.data.indexOf(',') + 1)
          : nRes.data;
        const b64 = stripped.replace(/[^A-Za-z0-9+/=]/g, '');
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const buf = bytes.buffer;
        if (buf.byteLength > 256) {
          rememberMp3Cache(cacheKey, buf);
          return buf.slice(0);
        }
      } else if (nRes.status === 401 || nRes.status === 402 || nRes.status === 429) {
        elevenLabsCooldownUntil = Date.now() + 60_000;
      }
    }
  } catch {
    // Gracefully fall back to next TTS engine
  }

  return null;
}

function rememberMp3Cache(key: string, buf: ArrayBuffer): void {
  if (ELEVENLABS_MP3_CACHE.size >= MAX_MP3_CACHE) {
    const oldest = ELEVENLABS_MP3_CACHE.keys().next().value;
    if (oldest) ELEVENLABS_MP3_CACHE.delete(oldest);
  }
  ELEVENLABS_MP3_CACHE.set(key, buf.slice(0));
}
