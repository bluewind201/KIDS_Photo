import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Layers,
  Loader2,
  MapPin,
  MessageCircleHeart,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { PROVIDER_LABELS } from '../data/initialAlbums';
import { FrameTransitionMode, PhotoAnalysisProgress, PhotoItem } from '../types';
import {
  getVaultDisplayObjectUrl,
  invalidateVaultObjectUrl,
  optimizeAndCachePhotoToVault,
  peekVaultObjectUrlSync,
} from '../utils/photoCacheDb';

interface DigitalFrameStageProps {
  photos: PhotoItem[];
  currentIndex: number;
  isPlaying: boolean;
  transitionMode: FrameTransitionMode;
  isSplitActive: boolean;
  callHintLabel?: string;
  isVoiceListening: boolean;
  isGeminiLiveActive?: boolean;
  isAssistantLoading: boolean;
  albumPasswords?: Record<string, string>;
  photoAnalysisProgress?: PhotoAnalysisProgress | null;
  matchedPlaylistInfo?: { label: string; count: number } | null;
  discoveredLocations?: Array<{ location: string; count: number }>;
  onSelectLocationFilter?: (location: string) => void;
  onTalkAboutCurrentPhoto?: (photo: PhotoItem) => void;
  onExitMatchedPlaylist?: () => void;
  onRequestRefreshAlbum?: (albumId: string) => Promise<boolean>;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onCycleTransition: () => void;
  onOpenSettings: () => void;
  onToggleVoiceListening: () => void;
  onSubmitAssistantQuery: (query: string) => void;
}

const TRANSITION_LABELS: Record<FrameTransitionMode, string> = {
  ken_burns: '시네마 줌',
  frame_sway: '산들 모션',
  gallery_matte: '갤러리 매트',
  dual_split: '듀얼 투샷',
};

export const DigitalFrameStage: React.FC<DigitalFrameStageProps> = ({
  photos,
  currentIndex,
  isPlaying,
  transitionMode,
  isSplitActive,
  callHintLabel = '토순아 · 코코야',
  isVoiceListening,
  isGeminiLiveActive = false,
  isAssistantLoading,
  albumPasswords,
  photoAnalysisProgress,
  matchedPlaylistInfo,
  discoveredLocations = [],
  onSelectLocationFilter,
  onTalkAboutCurrentPhoto,
  onExitMatchedPlaylist,
  onRequestRefreshAlbum,
  onPrev,
  onNext,
  onTogglePlay,
  onCycleTransition,
  onOpenSettings,
  onToggleVoiceListening,
  onSubmitAssistantQuery,
}) => {
  const [imgErrorStage, setImgErrorStage] = useState<Record<string, number>>({});
  const [nativeBlobUrls, setNativeBlobUrls] = useState<Record<string, string>>({});
  const [nativeLoadingIds, setNativeLoadingIds] = useState<Record<string, boolean>>({});
  const [nativeFailedIds, setNativeFailedIds] = useState<Record<string, boolean>>({});
  const [refreshingAlbumIds, setRefreshingAlbumIds] = useState<Record<string, boolean>>({});
  const attemptedAutoRefreshAlbumsRef = useRef<Set<string>>(new Set());
  const prevSrcByPhotoIdRef = useRef<Record<string, string>>({});
  const [quickPrompt, setQuickPrompt] = useState('');
  const [showAskInput, setShowAskInput] = useState(false);
  const [showLocationMenu, setShowLocationMenu] = useState(false);

  const currentPhoto = photos[currentIndex] ?? null;
  const secondaryPhoto = photos.length > 1 ? photos[(currentIndex + 1) % photos.length] : null;
  const nextPreloadPhoto = photos.length > 2 ? photos[(currentIndex + 2) % photos.length] : null;

  // Whenever an album's photo URLs are refreshed (e.g. fresh OneDrive/Google/Synology tokens), clear stale error flags!
  useEffect(() => {
    const resetIds: string[] = [];
    for (const p of photos) {
      const prevSrc = prevSrcByPhotoIdRef.current[p.id];
      if (prevSrc && prevSrc !== p.src) {
        resetIds.push(p.id);
      }
      prevSrcByPhotoIdRef.current[p.id] = p.src;
    }
    if (resetIds.length > 0) {
      setImgErrorStage((prev) => {
        const next = { ...prev };
        resetIds.forEach((id) => delete next[id]);
        return next;
      });
      setNativeFailedIds((prev) => {
        const next = { ...prev };
        resetIds.forEach((id) => delete next[id]);
        return next;
      });
      setNativeBlobUrls((prev) => {
        const next = { ...prev };
        resetIds.forEach((id) => delete next[id]);
        return next;
      });
    }
  }, [photos]);

  const triggerAlbumRecovery = (albumId: string, photoId?: string) => {
    if (!onRequestRefreshAlbum || refreshingAlbumIds[albumId]) return;
    setRefreshingAlbumIds((prev) => ({ ...prev, [albumId]: true }));
    onRequestRefreshAlbum(albumId)
      .then((refreshed) => {
        if (refreshed || photoId) {
          setImgErrorStage((prev) => {
            const next = { ...prev };
            photos
              .filter((p) => p.albumId === albumId)
              .forEach((p) => delete next[p.id]);
            return next;
          });
          setNativeFailedIds((prev) => {
            const next = { ...prev };
            photos
              .filter((p) => p.albumId === albumId)
              .forEach((p) => delete next[p.id]);
            return next;
          });
        }
      })
      .finally(() => {
        setRefreshingAlbumIds((prev) => ({ ...prev, [albumId]: false }));
      });
  };

  // Resolve every photo from the Compact IndexedDB Vault (~135KB WebP) first,
  // and if not yet cached, downscale & store via NativePhotoOptimizer (Java Skia C++ subsampler)
  // so even 20MB~40MB DSLR/iPhone/HEIC photos NEVER time out or show filenames!
  useEffect(() => {
    const candidatesToResolve = [currentPhoto, secondaryPhoto, nextPreloadPhoto].filter(
      (p): p is PhotoItem => Boolean(p)
    );

    for (const photo of candidatesToResolve) {
      if (photo.src.startsWith('/') || nativeBlobUrls[photo.id] || peekVaultObjectUrlSync(photo.id)) {
        continue;
      }

      if (nativeLoadingIds[photo.id] || nativeFailedIds[photo.id]) {
        continue;
      }

      const isIdbPointer = photo.src.startsWith('idb://');
      const needsImmediateVaultOptimize =
        isIdbPointer ||
        Boolean(photo.vaultCached) ||
        Capacitor.isNativePlatform() ||
        Boolean(photo.nativeHeaders && Object.keys(photo.nativeHeaders).length > 0) ||
        photo.provider === 'synology_api' ||
        photo.provider === 'synology_webdav' ||
        photo.provider === 'onedrive' ||
        /\/webapi\/entry\.cgi|1drv\.ms|microsoftpersonalcontent\.com|onedrive\.live\.com/i.test(photo.src);

      const anyWebImgError = (imgErrorStage[photo.id] ?? 0) >= 1;

      if (!needsImmediateVaultOptimize && !anyWebImgError) {
        continue;
      }

      const sharePassword = albumPasswords?.[photo.albumId];
      setNativeLoadingIds((prev) => ({ ...prev, [photo.id]: true }));

      (async () => {
        // 1) Fast <2ms local IndexedDB Vault lookup!
        const cachedVaultUrl = await getVaultDisplayObjectUrl(photo.id);
        if (cachedVaultUrl) {
          setNativeBlobUrls((prev) => ({ ...prev, [photo.id]: cachedVaultUrl }));
          return;
        }

        if (isIdbPointer) {
          setNativeFailedIds((prev) => ({ ...prev, [photo.id]: true }));
          return;
        }

        // 2) Hardware-downscale & permanently cache into IndexedDB Vault (~135KB WebP)
        const optimized = await optimizeAndCachePhotoToVault(photo, sharePassword);
        if (optimized?.displayObjectUrl) {
          setNativeBlobUrls((prev) => ({ ...prev, [photo.id]: optimized.displayObjectUrl }));
        } else {
          setNativeFailedIds((prev) => ({ ...prev, [photo.id]: true }));
          if (!attemptedAutoRefreshAlbumsRef.current.has(photo.albumId)) {
            attemptedAutoRefreshAlbumsRef.current.add(photo.albumId);
            triggerAlbumRecovery(photo.albumId, photo.id);
          }
        }
      })()
        .catch(() => {
          setNativeFailedIds((prev) => ({ ...prev, [photo.id]: true }));
          if (!attemptedAutoRefreshAlbumsRef.current.has(photo.albumId)) {
            attemptedAutoRefreshAlbumsRef.current.add(photo.albumId);
            triggerAlbumRecovery(photo.albumId, photo.id);
          }
        })
        .finally(() => {
          setNativeLoadingIds((prev) => ({ ...prev, [photo.id]: false }));
        });
    }
  }, [
    currentPhoto,
    secondaryPhoto,
    nextPreloadPhoto,
    imgErrorStage,
    nativeBlobUrls,
    nativeLoadingIds,
    nativeFailedIds,
    albumPasswords,
  ]);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPrompt.trim()) return;
    onSubmitAssistantQuery(quickPrompt.trim());
    setQuickPrompt('');
    setShowAskInput(false);
  };

  if (!currentPhoto) {
    return (
      <div
        className={`relative h-full rounded-[22px] bg-white border border-black/[0.06] flex flex-col items-center justify-center p-8 text-center ${
          isSplitActive ? 'w-1/2' : 'w-full'
        }`}
      >
        <p className="text-base font-bold text-[#141519]">표시할 디지털 앨범이 없습니다</p>
        <p className="mt-1.5 text-xs text-zinc-500 max-w-sm leading-relaxed">
          Google Drive, OneDrive, Synology WebDAV/API 또는 내 기기 사진 폴더를 연결해 디지털 액자를 시작하세요.
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#141519] px-5 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
          사진 폴더 · 앨범 등록하기
        </button>
      </div>
    );
  }

  const motionClass =
    !isPlaying
      ? ''
      : transitionMode === 'ken_burns'
      ? 'animate-ken-burns'
      : transitionMode === 'frame_sway'
      ? 'animate-frame-sway'
      : '';

  const renderFittedPhotoWithAmbientMargins = (
    srcUrl: string,
    imgKey: string,
    photo: PhotoItem,
    compact: boolean,
    onErrorHandler?: () => void
  ) => (
    <div className="relative w-full h-full overflow-hidden bg-[#141519] flex items-center justify-center">
      {/* Soft ambient blurred pillarbox/letterbox fill for natural left/right or top/bottom margins */}
      <img
        src={srcUrl}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        decoding="async"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40 select-none"
      />
      <div className="pointer-events-none absolute inset-0 bg-black/20" />
      {/* Full uncropped original-aspect-ratio photo (never stretched or zoomed/pixelated) */}
      <img
        key={imgKey}
        src={srcUrl}
        alt={`${photo.title} (${photo.location})`}
        referrerPolicy="no-referrer"
        decoding="async"
        onError={onErrorHandler}
        className={`relative z-10 w-full h-full object-contain select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.28)] ${
          compact ? '' : motionClass
        }`}
      />
    </div>
  );

  const renderPhotoSurface = (photo: PhotoItem, compact = false) => {
    const resolvedBlobUrl = nativeBlobUrls[photo.id] || peekVaultObjectUrlSync(photo.id);
    if (resolvedBlobUrl) {
      return renderFittedPhotoWithAmbientMargins(
        resolvedBlobUrl,
        `${photo.id}-blob`,
        photo,
        compact,
        () => {
          invalidateVaultObjectUrl(photo.id);
          setNativeBlobUrls((prev) => {
            const next = { ...prev };
            delete next[photo.id];
            return next;
          });
        }
      );
    }

    const isNativeFetching = Boolean(nativeLoadingIds[photo.id]);
    const isAlbumRefreshing = Boolean(refreshingAlbumIds[photo.albumId]);
    const isIdbPointer = photo.src.startsWith('idb://');
    const needsNativeFirst =
      isIdbPointer ||
      Boolean(photo.vaultCached) ||
      (Capacitor.isNativePlatform() && !photo.src.startsWith('/'));

    if (isNativeFetching || isAlbumRefreshing || (needsNativeFirst && !nativeFailedIds[photo.id])) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#181A20] p-6 text-center text-white">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400 mb-2.5" />
          <span className="text-sm font-semibold">{photo.title}</span>
          <span className="mt-1 text-xs text-zinc-400">
            {isAlbumRefreshing
              ? '공유 앨범 연결 세션을 자동 갱신하여 사진을 복구하고 있어요...'
              : '고화질 사진을 액자 최적 용량으로 빠르게 불러오는 중...'}
          </span>
        </div>
      );
    }

    const candidateUrls = [
      photo.src,
      ...(photo.assetUrl && photo.assetUrl !== photo.src ? [photo.assetUrl] : []),
      ...(photo.fallbackUrls ?? []),
    ].filter((u) => !u.startsWith('idb://'));
    const stage = imgErrorStage[photo.id] ?? 0;
    const allWebFailed = stage >= candidateUrls.length;
    const totallyFailed =
      allWebFailed && (!Capacitor.isNativePlatform() || Boolean(nativeFailedIds[photo.id]));

    if (totallyFailed) {
      if (!Capacitor.isNativePlatform() && !attemptedAutoRefreshAlbumsRef.current.has(photo.albumId)) {
        attemptedAutoRefreshAlbumsRef.current.add(photo.albumId);
        triggerAlbumRecovery(photo.albumId, photo.id);
      }
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#181A20] p-6 text-center text-white">
          <span className="text-base font-semibold text-white">{photo.title}</span>
          <span className="mt-1 text-xs text-zinc-400">
            {photo.date} · {photo.location}
          </span>
          <button
            type="button"
            onClick={() => {
              attemptedAutoRefreshAlbumsRef.current.delete(photo.albumId);
              setNativeFailedIds((prev) => {
                const next = { ...prev };
                delete next[photo.id];
                return next;
              });
              setImgErrorStage((prev) => {
                const next = { ...prev };
                delete next[photo.id];
                return next;
              });
              triggerAlbumRecovery(photo.albumId, photo.id);
            }}
            className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-4 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            사진 다시 불러오기
          </button>
        </div>
      );
    }

    if (allWebFailed) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#181A20] p-6 text-center text-white">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400 mb-2.5" />
          <span className="text-sm font-semibold">{photo.title}</span>
          <span className="mt-1 text-xs text-zinc-400">네이티브 스트림으로 사진을 불러오는 중...</span>
        </div>
      );
    }

    const activeSrc = candidateUrls[stage] || photo.src;

    return renderFittedPhotoWithAmbientMargins(
      activeSrc,
      `${photo.id}-${stage}`,
      photo,
      compact,
      () =>
        setImgErrorStage((prev) => ({
          ...prev,
          [photo.id]: (prev[photo.id] ?? 0) + 1,
        }))
    );
  };

  return (
    <section
      aria-label="디지털 액자 화면"
      className={`group relative h-full rounded-[22px] overflow-hidden bg-[#ECEEF2] border border-black/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.04)] select-none ${
        isSplitActive ? 'w-1/2' : 'w-full'
      }`}
    >
      {/* Main Photo Viewport */}
      {transitionMode === 'gallery_matte' ? (
        <div className="relative z-10 h-full w-full p-5 md:p-8 flex items-center justify-center bg-[#F4F3EF]">
          <div className="relative h-full w-full rounded-2xl bg-white p-4 md:p-6 shadow-[0_12px_32px_rgba(0,0,0,0.08)] border border-black/[0.05] flex flex-col">
            <div className="relative flex-1 overflow-hidden rounded-xl bg-zinc-100">
              {renderPhotoSurface(currentPhoto)}
            </div>
            <div className="pt-3 flex items-center justify-between text-zinc-500 text-xs">
              <span className="font-semibold text-[#141519] truncate">{currentPhoto.title}</span>
              <span className="shrink-0 whitespace-nowrap">
                {currentPhoto.date} · {currentPhoto.location}
              </span>
            </div>
          </div>
        </div>
      ) : transitionMode === 'dual_split' && secondaryPhoto && !isSplitActive ? (
        <div className="relative z-10 h-full w-full grid grid-cols-2 gap-2.5 p-2.5 bg-white">
          <div className="relative h-full overflow-hidden rounded-2xl">
            {renderPhotoSurface(currentPhoto)}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4">
              <p className="text-sm font-semibold text-white truncate">{currentPhoto.title}</p>
              <p className="mt-0.5 text-xs text-zinc-200 truncate">
                {currentPhoto.date} · {currentPhoto.location}
              </p>
            </div>
          </div>
          <div className="relative h-full overflow-hidden rounded-2xl">
            {renderPhotoSurface(secondaryPhoto, true)}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4">
              <p className="text-sm font-semibold text-white truncate">{secondaryPhoto.title}</p>
              <p className="mt-0.5 text-xs text-zinc-200 truncate">
                {secondaryPhoto.date} · {secondaryPhoto.location}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 h-full w-full overflow-hidden">
          {renderPhotoSurface(currentPhoto)}
        </div>
      )}

      {/* Sleek Smart-Home Top Controls (Matches Reference Top-Left & Top-Right Clean Floating Buttons) */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-3.5 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onToggleVoiceListening}
            title="캐릭터 이름을 부르면 바로 응답합니다"
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors whitespace-nowrap ${
              isGeminiLiveActive
                ? 'bg-indigo-600 text-white'
                : isVoiceListening
                ? 'bg-[#141519] text-white'
                : 'bg-white/95 text-[#141519] hover:bg-white'
            }`}
          >
            <Mic
              className={`w-3.5 h-3.5 ${
                isGeminiLiveActive
                  ? 'text-amber-300 animate-pulse'
                  : isVoiceListening
                  ? 'text-emerald-400'
                  : 'text-rose-500'
              }`}
            />
            <span>
              {isGeminiLiveActive
                ? '⚡ Gemini 실시간 대화중'
                : isVoiceListening
                ? `이름 호출 대기 (${callHintLabel})`
                : `이름 불러 대화 (${callHintLabel})`}
            </span>
          </button>

          {!showAskInput ? (
            <>
              <button
                type="button"
                onClick={() => setShowAskInput(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/95 hover:bg-white text-[#141519] px-3 py-1.5 text-xs font-medium shadow-sm transition-colors whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5 text-zinc-600" />
                <span>{isAssistantLoading ? '확인 중...' : '장소별 사진 찾기 · 질문'}</span>
              </button>

              {onTalkAboutCurrentPhoto && currentPhoto && (
                <button
                  type="button"
                  onClick={() => onTalkAboutCurrentPhoto(currentPhoto)}
                  title="지금 화면에 보이는 사진을 동물 친구와 함께 이야기하고 영어 단어도 배워요!"
                  className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-rose-500/95 hover:bg-rose-600 text-white px-3 py-1.5 text-xs font-bold shadow-sm transition-colors whitespace-nowrap"
                >
                  <MessageCircleHeart className="w-3.5 h-3.5 text-amber-200" />
                  <span>이 사진 이야기하기</span>
                </button>
              )}

              {discoveredLocations.length > 0 && onSelectLocationFilter && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowLocationMenu((v) => !v)}
                    className="hidden lg:inline-flex items-center gap-1 rounded-full bg-white/95 hover:bg-white text-[#141519] px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
                    title="촬영된 장소·지역별로 추억 사진을 모아봅니다"
                  >
                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                    <span>장소별 ({discoveredLocations.length})</span>
                  </button>
                  {showLocationMenu && (
                    <div className="absolute left-0 top-10 z-40 w-64 max-h-72 overflow-y-auto rounded-2xl bg-white/98 backdrop-blur-md border border-black/10 p-2 shadow-xl">
                      <div className="px-2.5 py-1 text-[11px] font-bold text-zinc-500 flex items-center justify-between">
                        <span>📍 장소별 우리 가족 추억</span>
                        <button
                          type="button"
                          onClick={() => setShowLocationMenu(false)}
                          className="text-zinc-400 hover:text-zinc-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="mt-1 space-y-1">
                        {discoveredLocations.map((locItem) => (
                          <button
                            key={locItem.location}
                            type="button"
                            onClick={() => {
                              setShowLocationMenu(false);
                              onSelectLocationFilter(locItem.location);
                            }}
                            className="w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#141519] hover:bg-indigo-50 transition-colors text-left"
                          >
                            <span className="truncate">📍 {locItem.location}</span>
                            <span className="font-mono text-[11px] font-bold text-indigo-600 shrink-0 ml-2">
                              {locItem.count}장
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <form
              onSubmit={handleQuickSubmit}
              className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 shadow-md border border-black/10"
            >
              <input
                type="text"
                autoFocus
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                placeholder="예: 바다 사진 찾아줘, 내일 날씨, 강남역 거리..."
                className="w-48 sm:w-64 bg-transparent px-2 py-0.5 text-xs text-[#141519] placeholder:text-zinc-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isAssistantLoading}
                className="w-6 h-6 rounded-full bg-[#141519] text-white flex items-center justify-center shrink-0"
                title="질문 보내기"
              >
                <Send className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setShowAskInput(false)}
                className="w-6 h-6 rounded-full hover:bg-zinc-100 text-zinc-500 flex items-center justify-center shrink-0"
                title="닫기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {matchedPlaylistInfo && onExitMatchedPlaylist && (
            <button
              type="button"
              onClick={onExitMatchedPlaylist}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600/95 hover:bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-colors whitespace-nowrap"
              title="찾은 사진 모드를 종료하고 전체 앨범으로 돌아갑니다"
            >
              <span>
                🔍 찾은 사진 {matchedPlaylistInfo.count}장 재생중 ({currentIndex + 1}/
                {photos.length})
              </span>
              <X className="w-3.5 h-3.5 text-indigo-100" />
            </button>
          )}
          <button
            type="button"
            onClick={onCycleTransition}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 hover:bg-white px-3 py-1.5 text-xs font-medium text-[#141519] shadow-sm transition-colors whitespace-nowrap"
            title="화면 전환 모드 변경"
          >
            <Layers className="w-3.5 h-3.5 text-zinc-700" />
            <span className="hidden sm:inline">{TRANSITION_LABELS[transitionMode]}</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 hover:bg-white px-3 py-1.5 text-xs font-medium text-[#141519] shadow-sm transition-colors whitespace-nowrap"
          >
            <FolderPlus className="w-3.5 h-3.5 text-zinc-700" />
            <span className="hidden sm:inline">폴더 등록</span>
          </button>
        </div>
      </div>

      {/* Real-Time Gemini Vision Photo Analysis Status Banner ("사진을 분석 중입니다") */}
      {photoAnalysisProgress &&
        (photoAnalysisProgress.active || Boolean(photoAnalysisProgress.completedToast)) && (
          <div className="pointer-events-none absolute inset-x-0 top-13 z-25 flex justify-center px-4">
            {photoAnalysisProgress.active ? (
              <div className="w-full max-w-md rounded-2xl bg-[#141519]/90 backdrop-blur-md border border-white/15 px-4 py-2.5 text-white shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between gap-2 text-xs font-bold">
                  <span className="inline-flex items-center gap-1.5 text-amber-300 truncate">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {photoAnalysisProgress.phase === 'optimizing'
                        ? '고화질 사진 경량 최적 저장 중...'
                        : photoAnalysisProgress.geminiConnected
                        ? 'Gemini AI 고속 사진 분석 · 데이터화 중...'
                        : '사진 검색용 스마트 데이터 구성 중...'}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-zinc-200 shrink-0">
                    {photoAnalysisProgress.done} / {photoAnalysisProgress.total}장
                    {photoAnalysisProgress.savedBytesTotal
                      ? ` (${(photoAnalysisProgress.savedBytesTotal / (1024 * 1024)).toFixed(1)}MB)`
                      : ''}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-zinc-300 truncate">
                  {photoAnalysisProgress.currentPhotoTitle
                    ? `사진 속 장소·추억 파악 중: "${photoAnalysisProgress.currentPhotoTitle}"`
                    : '토끼 친구들이 대화할 수 있도록 어떤 사진인지 살펴보고 있어요'}
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-purple-400 to-amber-300 transition-all duration-300"
                    style={{
                      width: `${Math.max(
                        6,
                        Math.min(
                          100,
                          Math.round(
                            (photoAnalysisProgress.done /
                              Math.max(1, photoAnalysisProgress.total)) *
                              100
                          )
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-600/95 backdrop-blur-md border border-emerald-300/30 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{photoAnalysisProgress.completedToast}</span>
              </div>
            )}
          </div>
        )}

      {/* Bottom Photo Caption & Minimal Playback Controls */}
      {transitionMode !== 'gallery_matte' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-4 pt-12 flex items-end justify-between gap-4">
          <div className="min-w-0 max-w-[68%]">
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-semibold text-white tracking-tight truncate">
                {currentPhoto.title}
              </h2>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-200">
              <span>{currentPhoto.date}</span>
              <span aria-hidden="true">·</span>
              <span>{currentPhoto.location}</span>
              <span aria-hidden="true">·</span>
              <span className="text-zinc-300">
                {PROVIDER_LABELS[currentPhoto.provider]}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-zinc-300">
                {currentIndex + 1}/{photos.length}
              </span>
            </div>
          </div>

          {/* Playback Controls (positioned cleanly away from compact bottom-right Disney cottage) */}
          <div className="pointer-events-auto flex items-center gap-1 mr-24 md:mr-32 shrink-0">
            <button
              type="button"
              onClick={onPrev}
              aria-label="이전 사진"
              className="h-8 w-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-[#141519] shadow-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? '슬라이드쇼 일시정지' : '슬라이드쇼 재생'}
              className="h-8 w-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-[#141519] shadow-sm transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="다음 사진"
              className="h-8 w-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-[#141519] shadow-sm transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
