import { Capacitor } from '@capacitor/core';
import { PhotoItem } from '../types';
import { fetchImageViaNativeHttp } from './standaloneApi';

const DB_NAME = 'kids_photo_vault_v1';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

export interface VaultPhotoRecord {
  photoId: string;
  albumId: string;
  displayBlob: Blob;
  displayMime: string;
  /** Raw base64 (no `data:` prefix) of 384px JPEG (~12-16KB) for instant batch AI Vision */
  aiThumbBase64: string;
  byteSize: number;
  width: number;
  height: number;
  visualHintTags: string[];
  updatedAt: number;
}

interface AndroidPhotoBridgeGlobal {
  isAvailable?: () => boolean;
  optimizePhotoAsync?: (
    requestId: string,
    candidateUrlsJson: string,
    headersJson: string,
    sharePassword: string,
    maxDisplayDim: number,
    displayQuality: number,
    aiThumbDim: number
  ) => void;
  consumeCompletedResult?: (requestId: string) => string;
}

function getAndroidPhotoBridge(): AndroidPhotoBridgeGlobal | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AndroidPhotoBridge?: AndroidPhotoBridgeGlobal };
  if (w.AndroidPhotoBridge && typeof w.AndroidPhotoBridge.optimizePhotoAsync === 'function') {
    return w.AndroidPhotoBridge;
  }
  return null;
}

// Fast in-memory ObjectURL cache backed by IndexedDB Blobs
const VAULT_OBJECT_URL_CACHE = new Map<string, string>();
const MAX_OBJECT_URLS = 120;
const INFLIGHT_OPTIMIZATIONS = new Map<string, Promise<VaultOptimizeResult | null>>();

let dbPromise: Promise<IDBDatabase> | null = null;

function openVaultDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'photoId' });
        store.createIndex('albumId', 'albumId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('Failed to open IndexedDB'));
    };
  });
  return dbPromise;
}

function rememberObjectUrl(photoId: string, blob: Blob): string {
  const existing = VAULT_OBJECT_URL_CACHE.get(photoId);
  if (existing) return existing;

  const url = URL.createObjectURL(blob);
  if (VAULT_OBJECT_URL_CACHE.size >= MAX_OBJECT_URLS) {
    const oldestKey = VAULT_OBJECT_URL_CACHE.keys().next().value;
    if (oldestKey) {
      const oldUrl = VAULT_OBJECT_URL_CACHE.get(oldestKey);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      VAULT_OBJECT_URL_CACHE.delete(oldestKey);
    }
  }
  VAULT_OBJECT_URL_CACHE.set(photoId, url);
  return url;
}

export function peekVaultObjectUrlSync(photoId: string): string | null {
  return VAULT_OBJECT_URL_CACHE.get(photoId) ?? null;
}

/**
 * Ultra-fast (<2ms) single IndexedDB key query returning all photoIds already optimized in Vault.
 * Prevents redundant re-optimization loops across app restarts or incremental folder syncs!
 */
export async function getAllVaultCachedPhotoIds(): Promise<Set<string>> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        const arr = (keysReq.result ?? []) as IDBValidKey[];
        resolve(new Set(arr.map((k) => String(k))));
      };
      keysReq.onerror = () => resolve(new Set());
    });
  } catch {
    return new Set();
  }
}

export async function getVaultPhotoRecord(photoId: string): Promise<VaultPhotoRecord | null> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(photoId);
      getReq.onsuccess = () => {
        const rec = getReq.result as VaultPhotoRecord | undefined;
        resolve(rec && rec.displayBlob ? rec : null);
      };
      getReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getVaultDisplayObjectUrl(photoId: string): Promise<string | null> {
  const mem = VAULT_OBJECT_URL_CACHE.get(photoId);
  if (mem) return mem;
  const rec = await getVaultPhotoRecord(photoId);
  if (!rec || !rec.displayBlob) return null;
  return rememberObjectUrl(photoId, rec.displayBlob);
}

async function putVaultPhotoRecord(record: VaultPhotoRecord): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IndexedDB write error in private mode
  }
}

export async function deleteAlbumPhotosFromVault(albumId: string): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const idx = store.index('albumId');
      const cursorReq = idx.openCursor(IDBKeyRange.only(albumId));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const rec = cursor.value as VaultPhotoRecord;
          const memUrl = VAULT_OBJECT_URL_CACHE.get(rec.photoId);
          if (memUrl) {
            URL.revokeObjectURL(memUrl);
            VAULT_OBJECT_URL_CACHE.delete(rec.photoId);
          }
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore cleanup errors
  }
}

export async function getVaultStorageSummary(): Promise<{ count: number; totalBytes: number }> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve) => {
      let count = 0;
      let totalBytes = 0;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const rec = cursor.value as VaultPhotoRecord;
          count += 1;
          totalBytes += rec.byteSize || rec.displayBlob?.size || 0;
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve({ count, totalBytes });
      tx.onerror = () => resolve({ count: 0, totalBytes: 0 });
    });
  } catch {
    return { count: 0, totalBytes: 0 };
  }
}

function base64ToBlob(rawB64: string, mimeType: string): Blob {
  const clean = rawB64.includes(',') ? rawB64.slice(rawB64.indexOf(',') + 1) : rawB64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function extractVisualTagsFromCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): string[] {
  const tags: string[] = [];
  if (h > w * 1.15) tags.push('세로사진', '인물스냅');
  else if (w > h * 1.2) tags.push('가로풍경');

  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let blueSkyOrSea = 0;
    let greenNature = 0;
    let snowWhite = 0;
    let warmIndoor = 0;
    const step = 16; // sample every 4th pixel
    let samples = 0;

    for (let i = 0; i < data.length; i += step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      rSum += r;
      gSum += g;
      bSum += b;
      samples++;

      if (b > 135 && b > r + 25 && g > 105) blueSkyOrSea++;
      if (g > 110 && g > r + 15 && g > b + 15) greenNature++;
      if (r > 210 && g > 210 && b > 215) snowWhite++;
      if (r > 155 && g > 110 && b < 110 && r > b + 45) warmIndoor++;
    }

    if (samples > 0) {
      if (blueSkyOrSea / samples > 0.24) tags.push('바다·하늘', '야외나들이');
      if (greenNature / samples > 0.2) tags.push('숲·공원', '자연산책');
      if (snowWhite / samples > 0.38) tags.push('눈·겨울', '하얀풍경');
      if (warmIndoor / samples > 0.24) tags.push('따뜻한분위기', '실내추억');
      const avgLum = (rSum + gSum + bSum) / (samples * 3);
      if (avgLum < 65) tags.push('밤·야경');
    }
  } catch {
    // Ignore tainted canvas
  }
  return tags;
}

async function analyzeThumbBase64VisualTags(rawThumbB64: string, w: number, h: number): Promise<string[]> {
  if (typeof document === 'undefined' || !rawThumbB64) {
    return h > w ? ['세로사진'] : ['가로풍경'];
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const sw = Math.min(96, img.naturalWidth || 64);
        const sh = Math.min(96, img.naturalHeight || 64);
        const c = document.createElement('canvas');
        c.width = sw;
        c.height = sh;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve([]);
          return;
        }
        ctx.drawImage(img, 0, 0, sw, sh);
        resolve(extractVisualTagsFromCanvas(ctx, sw, sh));
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = `data:image/jpeg;base64,${rawThumbB64}`;
  });
}

function invokeNativePhotoBridge(
  candidateUrls: string[],
  headers: Record<string, string> | undefined,
  sharePassword: string | undefined
): Promise<{
  displayBlob: Blob;
  displayMime: string;
  aiThumbBase64: string;
  width: number;
  height: number;
} | null> {
  const bridge = getAndroidPhotoBridge();
  if (!bridge || !bridge.optimizePhotoAsync || !bridge.consumeCompletedResult) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const reqId = `popt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('nativePhotoOptReady', onReady as EventListener);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    }, 42000);

    const onReady = (ev: Event) => {
      const detail = (ev as CustomEvent<{ requestId?: string }>).detail;
      if (!detail || detail.requestId !== reqId || settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();

      try {
        const jsonStr = bridge.consumeCompletedResult!(reqId);
        const parsed = JSON.parse(jsonStr) as {
          ok?: boolean;
          displayBase64?: string;
          displayMime?: string;
          aiThumbBase64?: string;
          width?: number;
          height?: number;
        };
        if (parsed?.ok && parsed.displayBase64 && parsed.aiThumbBase64) {
          const mime = parsed.displayMime || 'image/webp';
          const displayBlob = base64ToBlob(parsed.displayBase64, mime);
          resolve({
            displayBlob,
            displayMime: mime,
            aiThumbBase64: parsed.aiThumbBase64,
            width: parsed.width || 1280,
            height: parsed.height || 960,
          });
          return;
        }
      } catch {
        // Fall through
      }
      resolve(null);
    };

    window.addEventListener('nativePhotoOptReady', onReady as EventListener);
    try {
      bridge.optimizePhotoAsync!(
        reqId,
        JSON.stringify(candidateUrls),
        JSON.stringify(headers ?? {}),
        sharePassword ?? '',
        1440,
        80,
        384
      );
    } catch {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        cleanup();
        resolve(null);
      }
    }
  });
}

async function compressImgElementToVaultPayloads(
  imgSrc: string,
  revokeAfter = false
): Promise<{
  displayBlob: Blob;
  displayMime: string;
  aiThumbBase64: string;
  width: number;
  height: number;
  visualHintTags: string[];
} | null> {
  if (typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    const img = new Image();
    if (!imgSrc.startsWith('data:') && !imgSrc.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
    }
    const timer = window.setTimeout(() => {
      if (revokeAfter && imgSrc.startsWith('blob:')) URL.revokeObjectURL(imgSrc);
      resolve(null);
    }, 18000);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const origW = img.naturalWidth;
        const origH = img.naturalHeight;
        if (!origW || !origH) {
          if (revokeAfter && imgSrc.startsWith('blob:')) URL.revokeObjectURL(imgSrc);
          resolve(null);
          return;
        }

        // 1) Compact Display Canvas (max 1440px -> ~120-180KB WebP)
        const maxDisplay = 1440;
        let dw = origW;
        let dh = origH;
        if (dw > maxDisplay || dh > maxDisplay) {
          const r = Math.min(maxDisplay / dw, maxDisplay / dh);
          dw = Math.max(1, Math.round(dw * r));
          dh = Math.max(1, Math.round(dh * r));
        }
        const dispCanvas = document.createElement('canvas');
        dispCanvas.width = dw;
        dispCanvas.height = dh;
        const dispCtx = dispCanvas.getContext('2d');
        if (!dispCtx) {
          resolve(null);
          return;
        }
        dispCtx.drawImage(img, 0, 0, dw, dh);

        // 2) Fast AI Thumbnail Canvas (max 384px -> ~12-16KB JPEG)
        const maxThumb = 384;
        let tw = dw;
        let th = dh;
        if (tw > maxThumb || th > maxThumb) {
          const tr = Math.min(maxThumb / tw, maxThumb / th);
          tw = Math.max(1, Math.round(tw * tr));
          th = Math.max(1, Math.round(th * tr));
        }
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        const thumbCtx = thumbCanvas.getContext('2d');
        if (!thumbCtx) {
          resolve(null);
          return;
        }
        thumbCtx.drawImage(dispCanvas, 0, 0, tw, th);

        const visualHintTags = extractVisualTagsFromCanvas(thumbCtx, tw, th);
        const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.68);
        const aiThumbBase64 = thumbDataUrl.includes(',')
          ? thumbDataUrl.slice(thumbDataUrl.indexOf(',') + 1)
          : thumbDataUrl;

        dispCanvas.toBlob(
          (webpBlob) => {
            if (revokeAfter && imgSrc.startsWith('blob:')) URL.revokeObjectURL(imgSrc);
            if (webpBlob && webpBlob.size > 64) {
              resolve({
                displayBlob: webpBlob,
                displayMime: webpBlob.type || 'image/webp',
                aiThumbBase64,
                width: dw,
                height: dh,
                visualHintTags,
              });
            } else {
              const jpegDataUrl = dispCanvas.toDataURL('image/jpeg', 0.8);
              const jpegBlob = base64ToBlob(jpegDataUrl, 'image/jpeg');
              resolve({
                displayBlob: jpegBlob,
                displayMime: 'image/jpeg',
                aiThumbBase64,
                width: dw,
                height: dh,
                visualHintTags,
              });
            }
          },
          'image/webp',
          0.8
        );
      } catch {
        if (revokeAfter && imgSrc.startsWith('blob:')) URL.revokeObjectURL(imgSrc);
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      if (revokeAfter && imgSrc.startsWith('blob:')) URL.revokeObjectURL(imgSrc);
      resolve(null);
    };

    img.src = imgSrc;
  });
}

export interface VaultOptimizeResult {
  photoId: string;
  displayObjectUrl: string;
  aiThumbBase64: string;
  byteSize: number;
  visualHintTags: string[];
}

export async function optimizeLocalFileToVault(
  file: File,
  photoId: string,
  albumId: string
): Promise<VaultOptimizeResult | null> {
  const objectUrl = URL.createObjectURL(file);
  const compressed = await compressImgElementToVaultPayloads(objectUrl, true);
  if (!compressed) return null;

  const record: VaultPhotoRecord = {
    photoId,
    albumId,
    displayBlob: compressed.displayBlob,
    displayMime: compressed.displayMime,
    aiThumbBase64: compressed.aiThumbBase64,
    byteSize: compressed.displayBlob.size,
    width: compressed.width,
    height: compressed.height,
    visualHintTags: compressed.visualHintTags,
    updatedAt: Date.now(),
  };

  await putVaultPhotoRecord(record);
  const displayObjectUrl = rememberObjectUrl(photoId, record.displayBlob);
  return {
    photoId,
    displayObjectUrl,
    aiThumbBase64: record.aiThumbBase64,
    byteSize: record.byteSize,
    visualHintTags: record.visualHintTags,
  };
}

/**
 * Ensures any cloud/NAS/local photo is downscaled once to minimal space (~135KB WebP + ~14KB AI thumb)
 * and permanently persisted in IndexedDB so it loads in <2ms with ZERO filename fallbacks!
 */
export async function optimizeAndCachePhotoToVault(
  photo: PhotoItem,
  sharePassword?: string
): Promise<VaultOptimizeResult | null> {
  // 1) Fast path: already stored in IndexedDB Vault!
  const existing = await getVaultPhotoRecord(photo.id);
  if (existing && existing.displayBlob && existing.aiThumbBase64) {
    return {
      photoId: photo.id,
      displayObjectUrl: rememberObjectUrl(photo.id, existing.displayBlob),
      aiThumbBase64: existing.aiThumbBase64,
      byteSize: existing.byteSize,
      visualHintTags: existing.visualHintTags ?? [],
    };
  }

  // Deduplicate concurrent calls for the same photoId (e.g. DigitalFrameStage + background indexer)
  const inflight = INFLIGHT_OPTIMIZATIONS.get(photo.id);
  if (inflight) return inflight;

  const work = (async (): Promise<VaultOptimizeResult | null> => {
    // 2) Legacy `data:image/...` or `blob:` URL
    if (photo.src.startsWith('data:') || photo.src.startsWith('blob:')) {
      const compressed = await compressImgElementToVaultPayloads(photo.src, false);
      if (!compressed) return null;
      const rec: VaultPhotoRecord = {
        photoId: photo.id,
        albumId: photo.albumId,
        displayBlob: compressed.displayBlob,
        displayMime: compressed.displayMime,
        aiThumbBase64: compressed.aiThumbBase64,
        byteSize: compressed.displayBlob.size,
        width: compressed.width,
        height: compressed.height,
        visualHintTags: compressed.visualHintTags,
        updatedAt: Date.now(),
      };
      await putVaultPhotoRecord(rec);
      return {
        photoId: photo.id,
        displayObjectUrl: rememberObjectUrl(photo.id, rec.displayBlob),
        aiThumbBase64: rec.aiThumbBase64,
        byteSize: rec.byteSize,
        visualHintTags: rec.visualHintTags,
      };
    }

    const candidateUrls = [
      photo.src,
      ...(photo.assetUrl ? [photo.assetUrl] : []),
      ...(photo.fallbackUrls ?? []),
    ].filter((u) => /^https?:\/\//i.test(u));

    if (candidateUrls.length === 0) return null;

    let headers = photo.nativeHeaders;
    if (!headers && /passphrase=([^&]+)/i.test(photo.src)) {
      const m = photo.src.match(/passphrase=([^&]+)/i);
      if (m?.[1]) headers = { 'X-SYNO-SHARING': decodeURIComponent(m[1]) };
    }

    // 3) Android Native Hardware Subsampler (`NativePhotoOptimizer.java`) — handles 30MB+ DSLR/HEIC/NAS files!
    if (Capacitor.isNativePlatform()) {
      const nativeRes = await invokeNativePhotoBridge(candidateUrls, headers, sharePassword);
      if (nativeRes) {
        const visualHintTags = await analyzeThumbBase64VisualTags(
          nativeRes.aiThumbBase64,
          nativeRes.width,
          nativeRes.height
        );
        const rec: VaultPhotoRecord = {
          photoId: photo.id,
          albumId: photo.albumId,
          displayBlob: nativeRes.displayBlob,
          displayMime: nativeRes.displayMime,
          aiThumbBase64: nativeRes.aiThumbBase64,
          byteSize: nativeRes.displayBlob.size,
          width: nativeRes.width,
          height: nativeRes.height,
          visualHintTags,
          updatedAt: Date.now(),
        };
        await putVaultPhotoRecord(rec);
        return {
          photoId: photo.id,
          displayObjectUrl: rememberObjectUrl(photo.id, rec.displayBlob),
          aiThumbBase64: rec.aiThumbBase64,
          byteSize: rec.byteSize,
          visualHintTags,
        };
      }

      // Secondary native fallback via CapacitorHttp if bridge unavailable
      const fallbackBlobUrl = await fetchImageViaNativeHttp(candidateUrls, headers, sharePassword);
      if (fallbackBlobUrl) {
        const compressed = await compressImgElementToVaultPayloads(fallbackBlobUrl, false);
        if (compressed) {
          const rec: VaultPhotoRecord = {
            photoId: photo.id,
            albumId: photo.albumId,
            displayBlob: compressed.displayBlob,
            displayMime: compressed.displayMime,
            aiThumbBase64: compressed.aiThumbBase64,
            byteSize: compressed.displayBlob.size,
            width: compressed.width,
            height: compressed.height,
            visualHintTags: compressed.visualHintTags,
            updatedAt: Date.now(),
          };
          await putVaultPhotoRecord(rec);
          return {
            photoId: photo.id,
            displayObjectUrl: rememberObjectUrl(photo.id, rec.displayBlob),
            aiThumbBase64: rec.aiThumbBase64,
            byteSize: rec.byteSize,
            visualHintTags: rec.visualHintTags,
          };
        }
      }
    }

    // 4) Web / Desktop Browser Fallback
    for (const url of candidateUrls) {
      try {
        const r = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
        if (r.ok) {
          const b = await r.blob();
          if (b.type.startsWith('image/') && b.size > 128) {
            const tempUrl = URL.createObjectURL(b);
            const compressed = await compressImgElementToVaultPayloads(tempUrl, true);
            if (compressed) {
              const rec: VaultPhotoRecord = {
                photoId: photo.id,
                albumId: photo.albumId,
                displayBlob: compressed.displayBlob,
                displayMime: compressed.displayMime,
                aiThumbBase64: compressed.aiThumbBase64,
                byteSize: compressed.displayBlob.size,
                width: compressed.width,
                height: compressed.height,
                visualHintTags: compressed.visualHintTags,
                updatedAt: Date.now(),
              };
              await putVaultPhotoRecord(rec);
              return {
                photoId: photo.id,
                displayObjectUrl: rememberObjectUrl(photo.id, rec.displayBlob),
                aiThumbBase64: rec.aiThumbBase64,
                byteSize: rec.byteSize,
                visualHintTags: rec.visualHintTags,
              };
            }
          }
        }
      } catch {
        // Try direct image tag next
      }

      const directCompressed = await compressImgElementToVaultPayloads(url, false);
      if (directCompressed) {
        const rec: VaultPhotoRecord = {
          photoId: photo.id,
          albumId: photo.albumId,
          displayBlob: directCompressed.displayBlob,
          displayMime: directCompressed.displayMime,
          aiThumbBase64: directCompressed.aiThumbBase64,
          byteSize: directCompressed.displayBlob.size,
          width: directCompressed.width,
          height: directCompressed.height,
          visualHintTags: directCompressed.visualHintTags,
          updatedAt: Date.now(),
        };
        await putVaultPhotoRecord(rec);
        return {
          photoId: photo.id,
          displayObjectUrl: rememberObjectUrl(photo.id, rec.displayBlob),
          aiThumbBase64: rec.aiThumbBase64,
          byteSize: rec.byteSize,
          visualHintTags: rec.visualHintTags,
        };
      }
    }

    return null;
  })().finally(() => {
    INFLIGHT_OPTIMIZATIONS.delete(photo.id);
  });

  INFLIGHT_OPTIMIZATIONS.set(photo.id, work);
  return work;
}
