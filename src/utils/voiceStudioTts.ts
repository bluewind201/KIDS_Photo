import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { BunnyVoiceSpeaker } from '../types';

export type VoiceStudioProtocol = 'auto' | 'voicestudio_openai' | 'voicebox';

export interface VoiceStudioConfig {
  enabled: boolean;
  /** Example: http://192.168.0.10:3900 (VoiceStudio) or http://192.168.0.10:17493 (Voicebox) */
  serverUrl: string;
  protocol: VoiceStudioProtocol;
  /** Engine/model identifier, e.g. 'qwen3-tts', 'tts-1', 'omnivoice' */
  modelId: string;
  /** Optional bearer key if user put a reverse proxy/auth in front of local server */
  apiKey?: string;
  speed: number;
  speakerVoiceMap: Partial<Record<BunnyVoiceSpeaker | 'assistant', string>>;
}

export interface VoiceStudioRemoteVoice {
  voiceId: string;
  name: string;
  description?: string;
  engine?: string;
}

const VOICESTUDIO_STORAGE_KEY = 'kids_photo_voicestudio_config_v1';

export const DEFAULT_VOICESTUDIO_VOICES: VoiceStudioRemoteVoice[] = [
  {
    voiceId: 'default',
    name: '기본 스튜디오 보이스 (default)',
    description: 'VoiceStudio 기본 활성 목소리 / 복제 프로필',
    engine: 'Qwen3-TTS / OmniVoice',
  },
  {
    voiceId: 'cute_bunny',
    name: '귀여운 아기 토끼 복제음성 (cute_bunny)',
    description: 'VoiceStudio에서 cute_bunny 이름으로 만든 3초 복제 프로필',
    engine: 'Qwen3-TTS Clone',
  },
  {
    voiceId: 'baby_fairy',
    name: '동화 요정 복제음성 (baby_fairy)',
    description: 'VoiceStudio에서 baby_fairy 이름으로 만든 목소리 디자인 프로필',
    engine: 'VoiceDesign',
  },
];

const AUDIO_CACHE = new Map<string, { buffer: ArrayBuffer; ext: 'mp3' | 'wav' }>();
const MAX_AUDIO_CACHE = 80;

export function normalizeServerUrl(raw: string): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

export function loadVoiceStudioConfig(): VoiceStudioConfig {
  try {
    const raw = localStorage.getItem(VOICESTUDIO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VoiceStudioConfig>;
      return {
        enabled: parsed.enabled ?? false,
        serverUrl: normalizeServerUrl(parsed.serverUrl ?? ''),
        protocol: parsed.protocol ?? 'auto',
        modelId: parsed.modelId || 'qwen3-tts',
        apiKey: parsed.apiKey ?? '',
        speed: typeof parsed.speed === 'number' ? Math.max(0.75, Math.min(1.35, parsed.speed)) : 1.04,
        speakerVoiceMap: parsed.speakerVoiceMap ?? {},
      };
    }
  } catch {
    // Ignore storage read error
  }
  return {
    enabled: false,
    serverUrl: '',
    protocol: 'auto',
    modelId: 'qwen3-tts',
    apiKey: '',
    speed: 1.04,
    speakerVoiceMap: {},
  };
}

export function saveVoiceStudioConfig(next: Partial<VoiceStudioConfig>): VoiceStudioConfig {
  const merged: VoiceStudioConfig = {
    ...loadVoiceStudioConfig(),
    ...next,
  };
  merged.serverUrl = normalizeServerUrl(merged.serverUrl);
  try {
    localStorage.setItem(VOICESTUDIO_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage write error
  }
  return merged;
}

export function isVoiceStudioReady(): boolean {
  const cfg = loadVoiceStudioConfig();
  return Boolean(cfg.enabled && cfg.serverUrl);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const binary = atob(clean.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function detectAudioExt(buf: ArrayBuffer, contentType?: string): 'mp3' | 'wav' {
  const bytes = new Uint8Array(buf);
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46    // F
  ) {
    return 'wav';
  }
  if (contentType && /wav|wave/i.test(contentType)) {
    return 'wav';
  }
  return 'mp3';
}

async function nativeJsonRequest(
  url: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  bodyObj?: unknown,
  timeoutMs = 7000
): Promise<{ status: number; data: unknown }> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: bodyObj,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });
    let parsed = res.data;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // keep raw string
      }
    }
    return { status: res.status, data: parsed };
  }

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep text
    }
    return { status: res.status, data: parsed };
  } finally {
    window.clearTimeout(timer);
  }
}

async function nativeBinaryPost(
  url: string,
  headers: Record<string, string>,
  bodyObj: Record<string, unknown>,
  timeoutMs = 15000
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method: 'POST',
      headers,
      data: bodyObj,
      responseType: 'blob',
      connectTimeout: 6000,
      readTimeout: timeoutMs,
    });
    if (res.status < 200 || res.status >= 300 || !res.data) return null;
    const ct =
      res.headers?.['Content-Type'] ||
      res.headers?.['content-type'] ||
      'audio/wav';
    if (typeof res.data === 'string') {
      // CapacitorHttp returns base64 string when responseType === 'blob' or 'arraybuffer'
      // Unless the server returned a JSON `{ audio_url / audio_base64 }` payload
      const trimmed = res.data.trim();
      if (trimmed.startsWith('{')) {
        try {
          const json = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof json.audio_base64 === 'string') {
            return { buffer: base64ToArrayBuffer(json.audio_base64), contentType: ct };
          }
          if (typeof json.audio_path === 'string' || typeof json.url === 'string') {
            const rel = String(json.url || json.audio_path);
            const audioUrl = rel.startsWith('http') ? rel : `${new URL(url).origin}${rel.startsWith('/') ? '' : '/'}${rel}`;
            const dl = await CapacitorHttp.get({ url: audioUrl, responseType: 'blob' });
            if (dl.status >= 200 && dl.status < 300 && typeof dl.data === 'string') {
              return { buffer: base64ToArrayBuffer(dl.data), contentType: 'audio/wav' };
            }
          }
        } catch {
          // Not JSON; treat as base64 audio bytes
        }
      }
      const buf = base64ToArrayBuffer(trimmed);
      if (buf.byteLength > 200) {
        return { buffer: buf, contentType: ct };
      }
    }
    return null;
  }

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = (await res.json()) as Record<string, unknown>;
      if (typeof json.audio_base64 === 'string') {
        return { buffer: base64ToArrayBuffer(json.audio_base64), contentType: 'audio/wav' };
      }
      const rel = typeof json.url === 'string' ? json.url : typeof json.audio_url === 'string' ? json.audio_url : '';
      if (rel) {
        const audioUrl = rel.startsWith('http') ? rel : `${new URL(url).origin}${rel.startsWith('/') ? '' : '/'}${rel}`;
        const dl = await fetch(audioUrl, { signal: ctrl.signal });
        if (dl.ok) {
          return { buffer: await dl.arrayBuffer(), contentType: dl.headers.get('content-type') || 'audio/wav' };
        }
      }
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength <= 200) return null;
    return { buffer: buf, contentType: ct };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Probes a GitHub `debpalash/VoiceStudio` (:3900) or `jamiepine/voicebox` (:17493) or OpenAI-compatible TTS server
 * and fetches all available cloned/designed voice profiles!
 */
export async function fetchVoiceStudioVoices(
  rawServerUrl: string,
  protocol: VoiceStudioProtocol = 'auto',
  apiKey?: string
): Promise<{
  ok: boolean;
  detectedProtocol: 'voicestudio_openai' | 'voicebox';
  voices: VoiceStudioRemoteVoice[];
  message: string;
}> {
  const baseUrl = normalizeServerUrl(rawServerUrl);
  if (!baseUrl) {
    return {
      ok: false,
      detectedProtocol: 'voicestudio_openai',
      voices: DEFAULT_VOICESTUDIO_VOICES,
      message: 'VoiceStudio 서버 주소(예: http://192.168.0.10:3900)를 입력해 주세요.',
    };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const tryOpenAiStyle = protocol === 'auto' || protocol === 'voicestudio_openai';
  const tryVoiceboxStyle = protocol === 'auto' || protocol === 'voicebox';

  // 1) Try VoiceStudio (:3900) OpenAI-compatible endpoints (`/v1/audio/voices`, `/v1/voices`, `/voices`)
  if (tryOpenAiStyle) {
    for (const path of ['/v1/audio/voices', '/v1/voices', '/api/voices']) {
      try {
        const res = await nativeJsonRequest(`${baseUrl}${path}`, 'GET', headers, undefined, 5000);
        if (res.status >= 200 && res.status < 300 && res.data) {
          const obj = res.data as Record<string, unknown>;
          const rawList = Array.isArray(res.data)
            ? res.data
            : Array.isArray(obj.voices)
              ? obj.voices
              : Array.isArray(obj.data)
                ? obj.data
                : null;

          if (rawList) {
            const parsed: VoiceStudioRemoteVoice[] = rawList
              .map((item: unknown): VoiceStudioRemoteVoice | null => {
                if (typeof item === 'string') {
                  return { voiceId: item, name: item, engine: 'VoiceStudio' };
                }
                if (item && typeof item === 'object') {
                  const rec = item as Record<string, unknown>;
                  const id = String(rec.id || rec.voice_id || rec.voiceId || rec.name || '').trim();
                  if (!id) return null;
                  return {
                    voiceId: id,
                    name: String(rec.name || rec.label || id),
                    description: rec.description ? String(rec.description) : undefined,
                    engine: rec.engine ? String(rec.engine) : 'VoiceStudio',
                  };
                }
                return null;
              })
              .filter((v): v is VoiceStudioRemoteVoice => Boolean(v));

            return {
              ok: true,
              detectedProtocol: 'voicestudio_openai',
              voices: parsed.length > 0 ? parsed : DEFAULT_VOICESTUDIO_VOICES,
              message: `VoiceStudio 서버 연결 성공! (${parsed.length || DEFAULT_VOICESTUDIO_VOICES.length}개 보이스 준비됨)`,
            };
          }
        }
      } catch {
        // Try next endpoint
      }
    }
  }

  // 2) Try jamiepine/voicebox (:17493) `/profiles` endpoint
  if (tryVoiceboxStyle) {
    for (const path of ['/profiles', '/api/profiles']) {
      try {
        const res = await nativeJsonRequest(`${baseUrl}${path}`, 'GET', headers, undefined, 5000);
        if (res.status >= 200 && res.status < 300 && res.data) {
          const obj = res.data as Record<string, unknown>;
          const rawList = Array.isArray(res.data)
            ? res.data
            : Array.isArray(obj.profiles)
              ? obj.profiles
              : null;
          if (rawList) {
            const parsed: VoiceStudioRemoteVoice[] = rawList
              .map((item: unknown): VoiceStudioRemoteVoice | null => {
                if (!item || typeof item !== 'object') return null;
                const rec = item as Record<string, unknown>;
                const id = String(rec.id || rec.profile_id || rec.name || '').trim();
                if (!id) return null;
                return {
                  voiceId: id,
                  name: String(rec.name || id),
                  description: rec.description ? String(rec.description) : 'Voicebox 복제 프로필',
                  engine: 'Voicebox (Qwen3-TTS)',
                };
              })
              .filter((v): v is VoiceStudioRemoteVoice => Boolean(v));

            return {
              ok: true,
              detectedProtocol: 'voicebox',
              voices: parsed.length > 0 ? parsed : DEFAULT_VOICESTUDIO_VOICES,
              message: `Voicebox 스튜디오 연결 성공! (${parsed.length}개 복제 프로필 불러옴)`,
            };
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  // 3) Probe direct synthesis health (`/health` or `/v1/models`) for OpenAI-compatible TTS servers without `/voices`
  for (const healthPath of ['/health', '/v1/models']) {
    try {
      const res = await nativeJsonRequest(`${baseUrl}${healthPath}`, 'GET', headers, undefined, 4500);
      if (res.status >= 200 && res.status < 300) {
        return {
          ok: true,
          detectedProtocol: baseUrl.includes(':17493') ? 'voicebox' : 'voicestudio_openai',
          voices: DEFAULT_VOICESTUDIO_VOICES,
          message: '로컬 보이스 서버 응답 확인 완료! 기본 보이스 또는 직접 입력한 프로필 ID로 사용할 수 있습니다.',
        };
      }
    } catch {
      // Ignore
    }
  }

  return {
    ok: false,
    detectedProtocol: baseUrl.includes(':17493') ? 'voicebox' : 'voicestudio_openai',
    voices: DEFAULT_VOICESTUDIO_VOICES,
    message:
      '서버에 연결할 수 없습니다. PC에서 VoiceStudio(:3900) 또는 Voicebox(:17493)가 외부 접속 허용(0.0.0.0)으로 켜져 있는지 확인해 주세요.',
  };
}

/**
 * Synthesizes natural Korean/English speech using local GitHub `VoiceStudio` (`debpalash/VoiceStudio`)
 * or `Voicebox` (`jamiepine/voicebox`) over home Wi-Fi / Tailscale with 0 API cost!
 */
export async function synthesizeViaVoiceStudio(
  text: string,
  speaker: BunnyVoiceSpeaker | 'assistant',
  options?: {
    explicitVoiceId?: string;
    isEnglish?: boolean;
  }
): Promise<{ buffer: ArrayBuffer; ext: 'mp3' | 'wav' } | null> {
  const cfg = loadVoiceStudioConfig();
  if (!cfg.enabled || !cfg.serverUrl) return null;

  const cleanText = text.trim().slice(0, 480);
  if (!cleanText) return null;

  const voiceId =
    options?.explicitVoiceId?.trim() ||
    cfg.speakerVoiceMap[speaker]?.trim() ||
    'default';

  const effectiveProtocol: 'voicestudio_openai' | 'voicebox' =
    cfg.protocol === 'voicebox' || (cfg.protocol === 'auto' && cfg.serverUrl.includes(':17493'))
      ? 'voicebox'
      : 'voicestudio_openai';

  const cacheKey = `${cfg.serverUrl}|${effectiveProtocol}|${cfg.modelId}|${voiceId}|${cfg.speed}|${cleanText}`;
  const cached = AUDIO_CACHE.get(cacheKey);
  if (cached) {
    return { buffer: cached.buffer.slice(0), ext: cached.ext };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cfg.apiKey?.trim()) {
    headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
  }

  try {
    let result: { buffer: ArrayBuffer; contentType: string } | null = null;

    if (effectiveProtocol === 'voicebox') {
      result = await nativeBinaryPost(
        `${cfg.serverUrl}/generate`,
        headers,
        {
          text: cleanText,
          profile_id: voiceId,
          language: options?.isEnglish ? 'en' : 'ko',
          speed: cfg.speed,
        },
        16000
      );
    } else {
      // VoiceStudio (:3900) OpenAI-compatible `/v1/audio/speech`
      result = await nativeBinaryPost(
        `${cfg.serverUrl}/v1/audio/speech`,
        headers,
        {
          model: cfg.modelId || 'qwen3-tts',
          input: cleanText,
          voice: voiceId,
          response_format: 'wav',
          speed: cfg.speed,
          language: options?.isEnglish ? 'en' : 'ko',
        },
        16000
      );
    }

    if (!result || result.buffer.byteLength <= 200) return null;

    const ext = detectAudioExt(result.buffer, result.contentType);
    if (AUDIO_CACHE.size >= MAX_AUDIO_CACHE) {
      const oldest = AUDIO_CACHE.keys().next().value;
      if (oldest) AUDIO_CACHE.delete(oldest);
    }
    AUDIO_CACHE.set(cacheKey, { buffer: result.buffer.slice(0), ext });
    return { buffer: result.buffer, ext };
  } catch {
    return null;
  }
}
