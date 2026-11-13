import { PhotoItem } from '../types';
import {
  getAllVaultCachedPhotoIds,
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
 * End-to-End Incremental Sync Pipeline ("최초 1회만 경량 최적 저장 + 신규 사진만 증분 처리"):
 * 1) Checks IndexedDB Vault keys in <2ms (`getAllVaultCachedPhotoIds`) and SKIPS every photo already
 *    stored in Vault — zero redundant re-optimization on app restarts or slide changes!
 * 2) Compresses ONLY genuinely new/uncached photos (`~135KB` WebP + `~14KB` AI thumb) with 3x workers.
 * 3) Batch-analyzes 5 thumbnails (`~70KB` total) per single Gemini 2.5 Flash request for new photos only.
 */
export async function runAlbumVaultAndAiPipeline(params: {
  photos: PhotoItem[];
  sharePassword?: string;
  forceReanalyzeAi?: boolean;
  skipAiStage?: boolean;
  onProgress?: (p: SyncPipelineProgress) => void;
  shouldAbort?: () => boolean;
}): Promise<SyncPipelineOutput> {
  const {
    photos,
    sharePassword,
    forceReanalyzeAi = false,
    skipAiStage = false,
    onProgress,
    shouldAbort,
  } = params;
  if (photos.length === 0) {
    return {
      photos: [],
      totalOptimizedBytes: 0,
      geminiAnalyzedCount: 0,
      vaultCachedCount: 0,
    };
  }

  // Fast <2ms lookup of all photo IDs already persisted in IndexedDB Vault
  const existingVaultIds = await getAllVaultCachedPhotoIds();

  // ONLY optimize photos that are NOT yet in IndexedDB Vault!
  const photosNeedingOpt = photos.filter(
    (p) => !p.src.startsWith('/') && !existingVaultIds.has(p.id)
  );

  const vaultResults = new Map<string, VaultOptimizeResult>();
  let optDone = 0;
  let totalOptimizedBytes = 0;

  // ==========================================================================
  // STEP 1: Incremental 3-Worker Compact Vault Caching (ONLY uncached photos!)
  // ==========================================================================
  if (photosNeedingOpt.length > 0) {
    let nextIdx = 0;
    const optTotal = photosNeedingOpt.length;
    const workerCount = Math.min(3, optTotal);

    const runOptWorker = async () => {
      while (nextIdx < optTotal) {
        if (shouldAbort?.()) return;
        const myIdx = nextIdx++;
        const photo = photosNeedingOpt[myIdx];
        if (!photo) continue;

        onProgress?.({
          phase: 'optimizing',
          done: optDone,
          total: optTotal,
          savedBytesTotal: totalOptimizedBytes,
          currentPhotoTitle: photo.title,
        });

        try {
          const res = await optimizeAndCachePhotoToVault(photo, sharePassword);
          if (res) {
            vaultResults.set(photo.id, res);
            existingVaultIds.add(photo.id);
            totalOptimizedBytes += res.byteSize;
          }
        } catch {
          // Keep original URL fallback if a single item is temporarily unreachable
        }

        optDone += 1;
        onProgress?.({
          phase: 'optimizing',
          done: optDone,
          total: optTotal,
          savedBytesTotal: totalOptimizedBytes,
          currentPhotoTitle: photo.title,
        });
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runOptWorker()));
  }

  if (shouldAbort?.()) {
    return {
      photos,
      totalOptimizedBytes,
      geminiAnalyzedCount: 0,
      vaultCachedCount: existingVaultIds.size,
    };
  }

  // ==========================================================================
  // STEP 2: Fast 5-Photo Batch AI Vision & Structured Search Data Indexing
  // ==========================================================================
  const toAnalyzeInputs: BatchPhotoInputItem[] = [];

  if (!skipAiStage) {
    for (const photo of photos) {
      if (photo.src.startsWith('/')) continue;
      if (photo.aiAnalyzed && !forceReanalyzeAi) continue;

      let thumbB64 = vaultResults.get(photo.id)?.aiThumbBase64 || '';
      let visualTags = vaultResults.get(photo.id)?.visualHintTags || [];

      if (!thumbB64 && existingVaultIds.has(photo.id)) {
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

    const isNowInVault = Boolean(vRes) || photo.vaultCached || existingVaultIds.has(photo.id);
    const compactSrc =
      isNowInVault && photo.src.startsWith('data:') ? `idb://photo/${photo.id}` : photo.src;

    return {
      ...photo,
      src: compactSrc,
      vaultCached: isNowInVault,
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

  const totalVaultCachedInAlbum = finalPhotos.filter((p) => p.vaultCached).length;

  return {
    photos: finalPhotos,
    totalOptimizedBytes,
    geminiAnalyzedCount,
    vaultCachedCount: totalVaultCachedInAlbum,
  };
}
