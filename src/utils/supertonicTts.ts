/**
 * GitHub Open-Source Human-Like Korean TTS Engine Integration
 * Source: https://github.com/supertone-oss-archive/supertonic (MIT License, Supertone Inc.)
 * Weights: https://huggingface.co/Supertone/supertonic-2 (Multilingual ko/en Human Flow-Matching TTS)
 *
 * Runs 100% client-side in WebView/Browser via ONNX Runtime Web (WebGPU / WASM) with persistent
 * CacheStorage so model weights are downloaded once on demand without bloating the APK (~10MB).
 */

import type { BunnyVoiceSpeaker } from '../types';

export type SupertonicSpeakerKey = 'assistant' | BunnyVoiceSpeaker;

export interface SupertonicEngineStatus {
  enabled: boolean;
  ready: boolean;
  loading: boolean;
  cachedOnDisk: boolean;
  progressPct: number;
  stageLabel: string;
  backend: 'webgpu' | 'wasm' | null;
  error: string | null;
}

const SUPERTONIC_ENABLED_KEY = 'kids_photo_supertonic_enabled';
const SUPERTONIC_CACHE_NAME = 'kids-photo-supertonic-v2';
const HF_MODEL_BASE = 'https://huggingface.co/Supertone/supertonic-2/resolve/main';
const ORT_CDN_MJS = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.wasm.min.mjs';
const ORT_CDN_DIR = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';

const SPEAKER_TO_SUPERTONIC_STYLE: Record<
  SupertonicSpeakerKey,
  { styleCode: string; speedKo: number; speedEn: number; label: string }
> = {
  tosuni: {
    styleCode: 'F1',
    speedKo: 1.02,
    speedEn: 0.96,
    label: 'Supertone F1 (다정하고 포근한 한국어 여성 사람 목소리)',
  },
  tosili: {
    styleCode: 'F2',
    speedKo: 1.07,
    speedEn: 0.98,
    label: 'Supertone F2 (밝고 생동감 있는 한국어 여성 사람 목소리)',
  },
  toddungi: {
    styleCode: 'F5',
    speedKo: 0.97,
    speedEn: 0.93,
    label: 'Supertone F5 (귀엽고 부드러운 막내 톤 사람 목소리)',
  },
  tobyeori: {
    styleCode: 'F3',
    speedKo: 1.0,
    speedEn: 0.95,
    label: 'Supertone F3 (맑고 고운 동화 구연 한국어 사람 목소리)',
  },
  togureum: {
    styleCode: 'M1',
    speedKo: 1.05,
    speedEn: 0.97,
    label: 'Supertone M1 (명랑하고 따뜻한 한국어 청년 사람 목소리)',
  },
  assistant: {
    styleCode: 'F4',
    speedKo: 1.03,
    speedEn: 0.96,
    label: 'Supertone F4 (차분하고 또렷한 스마트홈 안내 사람 목소리)',
  },
};

export function getSupertonicVoiceDescription(speaker: SupertonicSpeakerKey): string {
  return (SPEAKER_TO_SUPERTONIC_STYLE[speaker] ?? SPEAKER_TO_SUPERTONIC_STYLE.assistant).label;
}

interface OrtTensorLike {
  dims: readonly number[];
  data: Float32Array | BigInt64Array | ArrayLike<number>;
}

interface OrtSessionLike {
  run: (feeds: Record<string, OrtTensorLike>) => Promise<Record<string, OrtTensorLike>>;
}

interface OrtModuleLike {
  env: {
    wasm: {
      wasmPaths: string;
      numThreads: number;
    };
  };
  Tensor: new (
    type: 'float32' | 'int64',
    data: Float32Array | BigInt64Array,
    dims: number[]
  ) => OrtTensorLike;
  InferenceSession: {
    create: (
      bufferOrUri: ArrayBuffer | Uint8Array | string,
      options?: Record<string, unknown>
    ) => Promise<OrtSessionLike>;
  };
}

interface SupertonicConfigJson {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

interface VoiceStyleJson {
  style_ttl: { dims: number[]; data: unknown[] };
  style_dp: { dims: number[]; data: unknown[] };
}

interface LoadedSupertonicRuntime {
  ort: OrtModuleLike;
  cfgs: SupertonicConfigJson;
  indexer: number[];
  dpSession: OrtSessionLike;
  textEncSession: OrtSessionLike;
  vectorEstSession: OrtSessionLike;
  vocoderSession: OrtSessionLike;
  styles: Map<string, { ttl: OrtTensorLike; dp: OrtTensorLike }>;
}

let runtimeInstance: LoadedSupertonicRuntime | null = null;
let initPromise: Promise<boolean> | null = null;

const SYNTH_WAV_LRU = new Map<string, ArrayBuffer>();
const MAX_SYNTH_LRU = 45;

let engineStatus: SupertonicEngineStatus = {
  enabled: typeof localStorage !== 'undefined' && localStorage.getItem(SUPERTONIC_ENABLED_KEY) === '1',
  ready: false,
  loading: false,
  cachedOnDisk: false,
  progressPct: 0,
  stageLabel: '대기 중',
  backend: null,
  error: null,
};

const listeners = new Set<(status: SupertonicEngineStatus) => void>();

function emitStatus(patch: Partial<SupertonicEngineStatus>) {
  engineStatus = { ...engineStatus, ...patch };
  listeners.forEach((fn) => {
    try {
      fn(engineStatus);
    } catch {
      // ignore subscriber error
    }
  });
}

export function getSupertonicStatus(): SupertonicEngineStatus {
  return engineStatus;
}

export function subscribeSupertonicStatus(
  cb: (status: SupertonicEngineStatus) => void
): () => void {
  listeners.add(cb);
  cb(engineStatus);
  return () => {
    listeners.delete(cb);
  };
}

export function setSupertonicEnabled(enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem(SUPERTONIC_ENABLED_KEY, '1');
    } else {
      localStorage.removeItem(SUPERTONIC_ENABLED_KEY);
    }
  } catch {
    // ignore storage quota errors
  }
  emitStatus({ enabled, error: null });
  if (enabled && !runtimeInstance && !initPromise) {
    void initializeSupertonicEngine();
  }
}

async function checkIfModelsCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(SUPERTONIC_CACHE_NAME);
    const hit = await cache.match(`${HF_MODEL_BASE}/onnx/vocoder.onnx`);
    return Boolean(hit);
  } catch {
    return false;
  }
}

// Check cache state quietly on startup; if enabled & already cached, auto-initialize in background!
if (typeof window !== 'undefined') {
  checkIfModelsCached().then((cached) => {
    emitStatus({ cachedOnDisk: cached });
    if (cached && engineStatus.enabled && !runtimeInstance && !initPromise) {
      void initializeSupertonicEngine();
    }
  });
}

async function fetchCachedArrayBuffer(
  url: string,
  onChunkProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<ArrayBuffer> {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(SUPERTONIC_CACHE_NAME);
      const matched = await cache.match(url);
      if (matched) {
        const buf = await matched.arrayBuffer();
        if (buf.byteLength > 16) {
          onChunkProgress?.(buf.byteLength, buf.byteLength);
          return buf;
        }
      }
    } catch {
      // Fallback to direct network fetch
    }
  }

  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) {
    throw new Error(`모델 파일 다운로드 실패 (${res.status}): ${url.split('/').pop()}`);
  }

  const total = Number(res.headers.get('content-length') || 0);
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onChunkProgress?.(buf.byteLength, total || buf.byteLength);
    await saveToCacheQuietly(url, buf);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onChunkProgress?.(loaded, total);
    }
  }

  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.byteLength;
  }

  const finalBuffer = combined.buffer;
  await saveToCacheQuietly(url, finalBuffer);
  return finalBuffer;
}

async function saveToCacheQuietly(url: string, buffer: ArrayBuffer) {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(SUPERTONIC_CACHE_NAME);
    await cache.put(
      url,
      new Response(buffer.slice(0), {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
    );
  } catch {
    // Ignore storage quota limits
  }
}

function flattenNestedNumbers(arr: unknown[]): Float32Array {
  const out: number[] = [];
  const stack: unknown[] = [arr];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (Array.isArray(cur)) {
      for (let i = cur.length - 1; i >= 0; i--) {
        stack.push(cur[i]);
      }
    } else if (typeof cur === 'number') {
      out.push(cur);
    }
  }
  return new Float32Array(out);
}

export async function initializeSupertonicEngine(): Promise<boolean> {
  if (runtimeInstance) {
    emitStatus({ ready: true, loading: false, progressPct: 100 });
    return true;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      emitStatus({
        loading: true,
        error: null,
        progressPct: 2,
        stageLabel: 'ONNX Web 음성 런타임 준비 중...',
      });

      const ortMod = (await import(/* @vite-ignore */ ORT_CDN_MJS)) as unknown as OrtModuleLike;
      ortMod.env.wasm.wasmPaths = ORT_CDN_DIR;
      ortMod.env.wasm.numThreads = 1;

      emitStatus({
        progressPct: 6,
        stageLabel: 'Supertone 한국어 유니코드 발음 사전 불러오는 중...',
      });

      const [cfgBuf, idxBuf] = await Promise.all([
        fetchCachedArrayBuffer(`${HF_MODEL_BASE}/onnx/tts.json`),
        fetchCachedArrayBuffer(`${HF_MODEL_BASE}/onnx/unicode_indexer.json`),
      ]);
      const cfgs = JSON.parse(new TextDecoder().decode(cfgBuf)) as SupertonicConfigJson;
      const indexer = JSON.parse(new TextDecoder().decode(idxBuf)) as number[];

      // Download the 4 ONNX neural models (~250MB total, cached permanently in CacheStorage)
      const modelSpecs = [
        {
          label: '운율·호흡 예측기 (1.5MB)',
          url: `${HF_MODEL_BASE}/onnx/duration_predictor.onnx`,
          weightStart: 8,
          weightSpan: 4,
        },
        {
          label: '한국어 텍스트 인코더 (26MB)',
          url: `${HF_MODEL_BASE}/onnx/text_encoder.onnx`,
          weightStart: 12,
          weightSpan: 12,
        },
        {
          label: '사람 음색 플로우 생성기 (126MB)',
          url: `${HF_MODEL_BASE}/onnx/vector_estimator.onnx`,
          weightStart: 24,
          weightSpan: 42,
        },
        {
          label: '고음질 사람 성대 보코더 (97MB)',
          url: `${HF_MODEL_BASE}/onnx/vocoder.onnx`,
          weightStart: 66,
          weightSpan: 24,
        },
      ];

      const modelBuffers: ArrayBuffer[] = [];
      for (const spec of modelSpecs) {
        const buf = await fetchCachedArrayBuffer(spec.url, (loaded, total) => {
          const ratio = total > 0 ? Math.min(1, loaded / total) : 0.5;
          const pct = Math.round(spec.weightStart + ratio * spec.weightSpan);
          const mb = (loaded / 1024 / 1024).toFixed(1);
          emitStatus({
            progressPct: pct,
            stageLabel: `다운로드 중: ${spec.label} (${mb}MB)`,
          });
        });
        modelBuffers.push(buf);
      }

      emitStatus({
        progressPct: 91,
        stageLabel: '5종 토끼별 실제 사람 성우 음색(F1~F5, M1) 불러오는 중...',
      });

      const styleCodes = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1'];
      const styles = new Map<string, { ttl: OrtTensorLike; dp: OrtTensorLike }>();
      for (const code of styleCodes) {
        const sBuf = await fetchCachedArrayBuffer(`${HF_MODEL_BASE}/voice_styles/${code}.json`);
        const sJson = JSON.parse(new TextDecoder().decode(sBuf)) as VoiceStyleJson;
        const ttlData = flattenNestedNumbers(sJson.style_ttl.data);
        const dpData = flattenNestedNumbers(sJson.style_dp.data);
        const ttlTensor = new ortMod.Tensor('float32', ttlData, [
          1,
          sJson.style_ttl.dims[1],
          sJson.style_ttl.dims[2],
        ]);
        const dpTensor = new ortMod.Tensor('float32', dpData, [
          1,
          sJson.style_dp.dims[1],
          sJson.style_dp.dims[2],
        ]);
        styles.set(code, { ttl: ttlTensor, dp: dpTensor });
      }

      emitStatus({
        progressPct: 95,
        stageLabel: '신경망 추론 세션 초기화 중...',
      });

      let chosenBackend: 'webgpu' | 'wasm' = 'wasm';
      let sessions: OrtSessionLike[] = [];

      // Use WASM by default on mobile WebViews for rock-solid deterministic stability, or WebGPU on desktop if supported
      const hasWebGpu =
        typeof navigator !== 'undefined' &&
        'gpu' in navigator &&
        !/Android/i.test(navigator.userAgent);

      if (hasWebGpu) {
        try {
          sessions = await Promise.all(
            modelBuffers.map((b) =>
              ortMod.InferenceSession.create(b.slice(0), {
                executionProviders: ['webgpu'],
                graphOptimizationLevel: 'all',
              })
            )
          );
          chosenBackend = 'webgpu';
        } catch {
          sessions = [];
        }
      }

      if (sessions.length === 0) {
        sessions = await Promise.all(
          modelBuffers.map((b) =>
            ortMod.InferenceSession.create(b.slice(0), {
              executionProviders: ['wasm'],
              graphOptimizationLevel: 'all',
            })
          )
        );
        chosenBackend = 'wasm';
      }

      runtimeInstance = {
        ort: ortMod,
        cfgs,
        indexer,
        dpSession: sessions[0],
        textEncSession: sessions[1],
        vectorEstSession: sessions[2],
        vocoderSession: sessions[3],
        styles,
      };

      try {
        localStorage.setItem(SUPERTONIC_ENABLED_KEY, '1');
      } catch {
        // ignore
      }

      emitStatus({
        enabled: true,
        ready: true,
        loading: false,
        cachedOnDisk: true,
        progressPct: 100,
        backend: chosenBackend,
        stageLabel: `준비 완료 (${chosenBackend.toUpperCase()} 온디바이스 사람 음성 엔진 활성)`,
        error: null,
      });
      return true;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Supertone 사람 음성 모델 초기화에 실패했습니다.';
      emitStatus({
        ready: false,
        loading: false,
        stageLabel: '초기화 실패',
        error: msg,
      });
      return false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

function preprocessSupertonicText(raw: string, lang: 'ko' | 'en'): string {
  // CRITICAL: Korean Hangul in Supertonic's unicode_indexer uses NFC / decomposed Jamo per NFKD
  // matching Supertone's official `web/helper.js` (`text.normalize('NFKD')`)!
  let text = raw.normalize('NFKD');
  text = text.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu,
    ''
  );
  text = text
    .replace(/[–‑—]/g, '-')
    .replace(/[_[\]|/#→←]/g, ' ')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019´`]/g, "'")
    .replace(/[♥☆♡©\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!/[.!?;:,'")\]}…。」』】〉》›»]$/.test(text)) {
    text += '.';
  }
  return `<${lang}>${text}</${lang}>`;
}

function chunkSupertonicSentences(text: string, maxLen: number): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur.length + s.length + 1 <= maxLen) {
      cur = cur ? `${cur} ${s}` : s;
    } else {
      if (cur) chunks.push(cur.trim());
      if (s.length <= maxLen) {
        cur = s;
      } else {
        for (let i = 0; i < s.length; i += maxLen) {
          chunks.push(s.slice(i, i + maxLen));
        }
        cur = '';
      }
    }
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

function encodePcmFloat32ToWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const int16 = new Int16Array(buffer, 44, samples.length);
  for (let i = 0; i < samples.length; i++) {
    const c = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = c < 0 ? Math.round(c * 32768) : Math.round(c * 32767);
  }
  return buffer;
}

async function inferSingleChunk(
  rt: LoadedSupertonicRuntime,
  chunkText: string,
  lang: 'ko' | 'en',
  style: { ttl: OrtTensorLike; dp: OrtTensorLike },
  speed: number,
  totalStep = 5
): Promise<Float32Array> {
  const tagged = preprocessSupertonicText(chunkText, lang);
  const codePoints = Array.from(tagged).map((ch) => ch.codePointAt(0) ?? 0);
  const seqLen = codePoints.length;

  const textIdsFlat = new BigInt64Array(seqLen);
  const textMaskFlat = new Float32Array(seqLen);
  for (let i = 0; i < seqLen; i++) {
    const cp = codePoints[i];
    const mapped = cp < rt.indexer.length ? rt.indexer[cp] : -1;
    textIdsFlat[i] = BigInt(mapped >= 0 ? mapped : 0);
    textMaskFlat[i] = 1.0;
  }

  const textIdsTensor = new rt.ort.Tensor('int64', textIdsFlat, [1, seqLen]);
  const textMaskTensor = new rt.ort.Tensor('float32', textMaskFlat, [1, 1, seqLen]);

  const dpOut = await rt.dpSession.run({
    text_ids: textIdsTensor,
    style_dp: style.dp,
    text_mask: textMaskTensor,
  });
  const rawDur = Number(dpOut.duration.data[0] ?? 1.2);
  const durSec = Math.max(0.35, rawDur / Math.max(0.75, speed));

  const textEncOut = await rt.textEncSession.run({
    text_ids: textIdsTensor,
    style_ttl: style.ttl,
    text_mask: textMaskTensor,
  });
  const textEmb = textEncOut.text_emb;

  const sampleRate = rt.cfgs.ae.sample_rate;
  const wavLen = Math.max(256, Math.floor(durSec * sampleRate));
  const chunkSize = rt.cfgs.ae.base_chunk_size * rt.cfgs.ttl.chunk_compress_factor;
  const latentLen = Math.max(1, Math.floor((wavLen + chunkSize - 1) / chunkSize));
  const latentDim = rt.cfgs.ttl.latent_dim * rt.cfgs.ttl.chunk_compress_factor;

  let xtFlat = new Float32Array(latentDim * latentLen);
  for (let i = 0; i < xtFlat.length; i++) {
    const u1 = Math.max(0.0001, Math.random());
    const u2 = Math.random();
    xtFlat[i] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  const latentMaskFlat = new Float32Array(latentLen).fill(1.0);
  const latentMaskTensor = new rt.ort.Tensor('float32', latentMaskFlat, [1, 1, latentLen]);
  const totalStepTensor = new rt.ort.Tensor('float32', new Float32Array([totalStep]), [1]);

  for (let step = 0; step < totalStep; step++) {
    const currentStepTensor = new rt.ort.Tensor('float32', new Float32Array([step]), [1]);
    const xtTensor = new rt.ort.Tensor('float32', xtFlat, [1, latentDim, latentLen]);
    const vecOut = await rt.vectorEstSession.run({
      noisy_latent: xtTensor,
      text_emb: textEmb,
      style_ttl: style.ttl,
      latent_mask: latentMaskTensor,
      text_mask: textMaskTensor,
      current_step: currentStepTensor,
      total_step: totalStepTensor,
    });
    xtFlat = new Float32Array(vecOut.denoised_latent.data as ArrayLike<number>);
  }

  const finalLatentTensor = new rt.ort.Tensor('float32', xtFlat, [1, latentDim, latentLen]);
  const vocOut = await rt.vocoderSession.run({
    latent: finalLatentTensor,
  });

  const fullWav = vocOut.wav_tts.data as Float32Array;
  return fullWav.subarray(0, Math.min(fullWav.length, wavLen));
}

/**
 * Synthesizes human-like Korean/English speech into a playable `blob:` WAV URL
 * when the GitHub Open-Source Supertone Supertonic-2 engine is enabled and ready.
 */
export async function trySynthesizeSupertonicWavUrl(
  text: string,
  speaker: SupertonicSpeakerKey,
  lang: 'ko-KR' | 'en-US'
): Promise<string | null> {
  if (!engineStatus.enabled || !runtimeInstance) return null;

  const clean = text.trim().slice(0, 360);
  if (!clean) return null;

  const shortLang: 'ko' | 'en' = lang === 'en-US' ? 'en' : 'ko';
  const voiceCfg = SPEAKER_TO_SUPERTONIC_STYLE[speaker] ?? SPEAKER_TO_SUPERTONIC_STYLE.assistant;
  const style = runtimeInstance.styles.get(voiceCfg.styleCode);
  if (!style) return null;

  const speed = shortLang === 'en' ? voiceCfg.speedEn : voiceCfg.speedKo;
  const cacheKey = `${voiceCfg.styleCode}|${shortLang}|${speed}|${clean}`;
  const cachedBuf = SYNTH_WAV_LRU.get(cacheKey);
  if (cachedBuf) {
    return URL.createObjectURL(new Blob([cachedBuf], { type: 'audio/wav' }));
  }

  try {
    const maxChunk = shortLang === 'ko' ? 110 : 240;
    const chunks = chunkSupertonicSentences(clean, maxChunk);
    if (chunks.length === 0) return null;

    const pcmParts: Float32Array[] = [];
    const silenceSamples = Math.floor(0.22 * runtimeInstance.cfgs.ae.sample_rate);

    for (let i = 0; i < chunks.length; i++) {
      const part = await inferSingleChunk(
        runtimeInstance,
        chunks[i],
        shortLang,
        style,
        speed,
        5
      );
      if (i > 0) {
        pcmParts.push(new Float32Array(silenceSamples));
      }
      pcmParts.push(part);
    }

    const totalLen = pcmParts.reduce((acc, arr) => acc + arr.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const arr of pcmParts) {
      merged.set(arr, offset);
      offset += arr.length;
    }

    const wavBuffer = encodePcmFloat32ToWavBuffer(merged, runtimeInstance.cfgs.ae.sample_rate);
    if (SYNTH_WAV_LRU.size >= MAX_SYNTH_LRU) {
      const oldest = SYNTH_WAV_LRU.keys().next().value;
      if (oldest) SYNTH_WAV_LRU.delete(oldest);
    }
    SYNTH_WAV_LRU.set(cacheKey, wavBuffer);

    return URL.createObjectURL(new Blob([wavBuffer], { type: 'audio/wav' }));
  } catch {
    return null;
  }
}
