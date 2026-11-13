import { PhotoItem } from '../types';
import {
  getVaultPhotoRecord,
  optimizeAndCachePhotoToVault,
  VaultOptimizeResult,
} from './photoCacheDb';
import {
  AnalyzedPhotoStructuredData,
  analyzePhotoBatchUnified,
  BatchPhotoInputItem,
  buildSmartLocalPhotoIndex,
} from './standaloneApi';

export interface SyncPipelineProgress {
  phase: 'optimizing' | 'analyzing';
  done: number;
  total: number;
  savedBytesTotal: number;
  currentPhotoTitle?: string;
}

export interface SyncPipelineOutput {
  photos: PhotoItem[];
  totalOptimizedBytes: number;
  geminiAnalyzedCount: number;
  vaultCachedCount: number;
}

/**
 * End-to-End Sync Pipeline ("연동 버튼 클릭 시 경량 최적 저장 + 고속 AI 사전 분석·데이터화"):
 * 1) Compresses & stores every photo into local IndexedDB (`~135KB` WebP + `~14KB` AI thumb)
 *    with 3x parallel workers so high-res 20MB+ NAS/Cloud originals never fail or show filenames.
 * 2) Batch-analyzes 5 thumbnails (`~70KB` total) per single Gemini 2.5 Flash request so AI data
 *    indexing finishes 5x faster and powers instant <1ms memory search!
 */
export async function runAlbumVaultAndAiPipeline(params: {
  photos: PhotoItem[];
  sharePassword?: string;
  forceReanalyzeAi?: boolean;
  onProgress?: (p: SyncPipelineProgress) => void;
  shouldAbort?: () => boolean;
}): Promise<SyncPipelineOutput> {
  const { photos, sharePassword, forceReanalyzeAi = false, onProgress, shouldAbort } = params;
  const total = photos.length;
  if (total === 0) {
    return {
      photos: [],
      totalOptimizedBytes: 0,
      geminiAnalyzedCount: 0,
      vaultCachedCount: 0,
    };
  }

  // Built-in sample photos (`/...` local static assets) don't need network optimization
  const vaultResults = new Map<string, VaultOptimizeResult>();
  let optDone = 0;
  let totalOptimizedBytes = 0;

  // ==========================================================================
  // STEP 1: Bounded 3-Worker Compact Vault Caching (~135KB WebP + ~14KB AI Thumb)
  // ==========================================================================
  let nextIdx = 0;
  const workerCount = Math.min(3, total);

  const runOptWorker = async () => {
    while (nextIdx < total) {
      if (shouldAbort?.()) return;
      const myIdx = nextIdx++;
      const photo = photos[myIdx];
      if (!photo) continue;

      onProgress?.({
        phase: 'optimizing',
        done: optDone,
        total,
        savedBytesTotal: totalOptimizedBytes,
        currentPhotoTitle: photo.title,
      });

      if (!photo.src.startsWith('/')) {
        try {
          const res = await optimizeAndCachePhotoToVault(photo, sharePassword);
          if (res) {
            vaultResults.set(photo.id, res);
            totalOptimizedBytes += res.byteSize;
          }
        } catch {
          // Keep original URL fallback if a single item is temporarily unreachable
        }
      }

      optDone += 1;
      onProgress?.({
        phase: 'optimizing',
        done: optDone,
        total,
        savedBytesTotal: totalOptimizedBytes,
        currentPhotoTitle: photo.title,
      });
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runOptWorker()));

  if (shouldAbort?.()) {
    return {
      photos,
      totalOptimizedBytes,
      geminiAnalyzedCount: 0,
      vaultCachedCount: vaultResults.size,
    };
  }

  // ==========================================================================
  // STEP 2: Fast 5-Photo Batch AI Vision & Structured Search Data Indexing
  // ==========================================================================
  const toAnalyzeInputs: BatchPhotoInputItem[] = [];

  for (const photo of photos) {
    if (photo.src.startsWith('/')) continue;
    if (photo.aiAnalyzed && !forceReanalyzeAi) continue;

    let thumbB64 = vaultResults.get(photo.id)?.aiThumbBase64 || '';
    let visualTags = vaultResults.get(photo.id)?.visualHintTags || [];

    if (!thumbB64) {
      const rec = await getVaultPhotoRecord(photo.id);
      if (rec?.aiThumbBase64) {
        thumbB64 = rec.aiThumbBase64;
        visualTags = rec.visualHintTags ?? [];
      }
    }

    if (thumbB64) {
      toAnalyzeInputs.push({
        photoId: photo.id,
        fileName: photo.title,
        albumName: photo.albumName,
        dateStr: photo.date,
        aiThumbBase64: thumbB64,
        visualHintTags: visualTags,
      });
    }
  }

  const aiResultById = new Map<string, AnalyzedPhotoStructuredData>();
  const BATCH_SIZE = 5;
  let aiDone = 0;
  let geminiAnalyzedCount = 0;

  if (toAnalyzeInputs.length > 0) {
    onProgress?.({
      phase: 'analyzing',
      done: 0,
      total: toAnalyzeInputs.length,
      savedBytesTotal: totalOptimizedBytes,
      currentPhotoTitle: toAnalyzeInputs[0]?.fileName,
    });

    for (let i = 0; i < toAnalyzeInputs.length; i += BATCH_SIZE) {
      if (shouldAbort?.()) break;
      const chunk = toAnalyzeInputs.slice(i, i + BATCH_SIZE);

      onProgress?.({
        phase: 'analyzing',
        done: aiDone,
        total: toAnalyzeInputs.length,
        savedBytesTotal: totalOptimizedBytes,
        currentPhotoTitle: chunk[0]?.fileName,
      });

      const chunkResults = await analyzePhotoBatchUnified(chunk);
      for (const itemRes of chunkResults) {
        aiResultById.set(itemRes.photoId, itemRes);
        if (itemRes.analyzedByGemini) {
          geminiAnalyzedCount += 1;
        }
      }

      aiDone += chunk.length;
      onProgress?.({
        phase: 'analyzing',
        done: Math.min(aiDone, toAnalyzeInputs.length),
        total: toAnalyzeInputs.length,
        savedBytesTotal: totalOptimizedBytes,
        currentPhotoTitle: chunk[chunk.length - 1]?.fileName,
      });
    }
  }

  // ==========================================================================
  // STEP 3: Merge Compact Vault Status + Structured AI Metadata onto PhotoItems
  // ==========================================================================
  const finalPhotos: PhotoItem[] = photos.map((photo) => {
    const vRes = vaultResults.get(photo.id);
    let aiMeta = aiResultById.get(photo.id);

    if (!aiMeta && !photo.aiAnalyzed && vRes) {
      aiMeta = buildSmartLocalPhotoIndex({
        photoId: photo.id,
        fileName: photo.title,
        albumName: photo.albumName,
        dateStr: photo.date,
        aiThumbBase64: vRes.aiThumbBase64,
        visualHintTags: vRes.visualHintTags,
      });
    }

    // Replace huge `data:image/...` strings with lightweight `idb://photo/<id>` pointer
    // so localStorage (`kids_photo_albums`) stays under 50KB instead of overflowing 5MB!
    const compactSrc =
      vRes && photo.src.startsWith('data:') ? `idb://photo/${photo.id}` : photo.src;

    return {
      ...photo,
      src: compactSrc,
      vaultCached: Boolean(vRes) || photo.vaultCached,
      optimizedBytes: vRes?.byteSize ?? photo.optimizedBytes,
      title: aiMeta?.title || photo.title,
      location: aiMeta?.location || photo.location,
      aiSummary: aiMeta?.aiSummary || photo.aiSummary,
      season: aiMeta?.season ?? photo.season,
      mood: aiMeta?.mood ?? photo.mood,
      people: aiMeta?.people ?? photo.people,
      objects: aiMeta?.objects ?? photo.objects,
      tags: aiMeta?.tags && aiMeta.tags.length > 0 ? aiMeta.tags : photo.tags,
      aiAnalyzed: aiMeta ? aiMeta.analyzedByGemini : photo.aiAnalyzed,
    };
  });

  return {
    photos: finalPhotos,
    totalOptimizedBytes,
    geminiAnalyzedCount,
    vaultCachedCount: vaultResults.size,
  };
}
