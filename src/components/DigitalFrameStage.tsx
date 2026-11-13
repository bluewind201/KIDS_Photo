import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Layers,
  Loader2,
  Mic,
  Pause,
  Play,
  Search,
  Send,
  X,
} from 'lucide-react';
import { PROVIDER_LABELS } from '../data/initialAlbums';
import { FrameTransitionMode, PhotoItem } from '../types';
import { fetchImageViaNativeHttp } from '../utils/standaloneApi';

interface DigitalFrameStageProps {
  photos: PhotoItem[];
  currentIndex: number;
  isPlaying: boolean;
  transitionMode: FrameTransitionMode;
  isSplitActive: boolean;
  wakeWord: string;
  isVoiceListening: boolean;
  isAssistantLoading: boolean;
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
  wakeWord,
  isVoiceListening,
  isAssistantLoading,
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
  const [quickPrompt, setQuickPrompt] = useState('');
  const [showAskInput, setShowAskInput] = useState(false);

  const currentPhoto = photos[currentIndex] ?? null;
  const secondaryPhoto = photos.length > 1 ? photos[(currentIndex + 1) % photos.length] : null;
  const nextPreloadPhoto = photos.length > 2 ? photos[(currentIndex + 2) % photos.length] : null;

  // Automatically load Synology / NAS / custom-header photos (or any photo whose WebView <img> failed)
  // via Native CapacitorHttp (`HttpURLConnection` + Java CookieManager + `X-SYNO-SHARING` + self-signed SSL)!
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const candidatesToResolve = [currentPhoto, secondaryPhoto, nextPreloadPhoto].filter(
      (p): p is PhotoItem => Boolean(p)
    );

    for (const photo of candidatesToResolve) {
      if (photo.src.startsWith('data:') || photo.src.startsWith('blob:') || photo.src.startsWith('/')) {
        continue;
      }

      const candidateUrls = [
        photo.src,
        ...(photo.assetUrl ? [photo.assetUrl] : []),
        ...(photo.fallbackUrls ?? []),
      ].filter((u) => /^https?:\/\//i.test(u));

      const needsImmediateNativeFetch =
        Boolean(photo.nativeHeaders && Object.keys(photo.nativeHeaders).length > 0) ||
        photo.provider === 'synology_api' ||
        /\/webapi\/entry\.cgi/i.test(photo.src);

      const allWebImgStagesExhausted = (imgErrorStage[photo.id] ?? 0) >= candidateUrls.length;

      if (
        (needsImmediateNativeFetch || allWebImgStagesExhausted) &&
        !nativeBlobUrls[photo.id] &&
        !nativeLoadingIds[photo.id] &&
        !nativeFailedIds[photo.id]
      ) {
        let inferredHeaders = photo.nativeHeaders;
        // Backwards compatibility for albums saved before `nativeHeaders` existed: extract `passphrase=` from URL!
        if (!inferredHeaders && /passphrase=([^&]+)/i.test(photo.src)) {
          const m = photo.src.match(/passphrase=([^&]+)/i);
          if (m?.[1]) {
            inferredHeaders = { 'X-SYNO-SHARING': decodeURIComponent(m[1]) };
          }
        }

        setNativeLoadingIds((prev) => ({ ...prev, [photo.id]: true }));
        fetchImageViaNativeHttp(candidateUrls, inferredHeaders)
          .then((blobUrl) => {
            if (blobUrl) {
              setNativeBlobUrls((prev) => ({ ...prev, [photo.id]: blobUrl }));
            } else {
              setNativeFailedIds((prev) => ({ ...prev, [photo.id]: true }));
            }
          })
          .catch(() => {
            setNativeFailedIds((prev) => ({ ...prev, [photo.id]: true }));
          })
          .finally(() => {
            setNativeLoadingIds((prev) => ({ ...prev, [photo.id]: false }));
          });
      }
    }
  }, [
    currentPhoto,
    secondaryPhoto,
    nextPreloadPhoto,
    imgErrorStage,
    nativeBlobUrls,
    nativeLoadingIds,
    nativeFailedIds,
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
    const resolvedBlobUrl = nativeBlobUrls[photo.id];
    if (resolvedBlobUrl) {
      return renderFittedPhotoWithAmbientMargins(
        resolvedBlobUrl,
        `${photo.id}-blob`,
        photo,
        compact
      );
    }

    const isNativeFetching = Boolean(nativeLoadingIds[photo.id]);
    const needsNativeFirst =
      Capacitor.isNativePlatform() &&
      (Boolean(photo.nativeHeaders && Object.keys(photo.nativeHeaders).length > 0) ||
        photo.provider === 'synology_api' ||
        /\/webapi\/entry\.cgi/i.test(photo.src));

    if (isNativeFetching || (needsNativeFirst && !nativeFailedIds[photo.id])) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#181A20] p-6 text-center text-white">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400 mb-2.5" />
          <span className="text-sm font-semibold">{photo.title}</span>
          <span className="mt-1 text-xs text-zinc-400">고화질 원본 사진을 불러오는 중...</span>
        </div>
      );
    }

    const candidateUrls = [
      photo.src,
      ...(photo.assetUrl && photo.assetUrl !== photo.src ? [photo.assetUrl] : []),
      ...(photo.fallbackUrls ?? []),
    ];
    const stage = imgErrorStage[photo.id] ?? 0;
    const allWebFailed = stage >= candidateUrls.length;
    const totallyFailed = allWebFailed && (!Capacitor.isNativePlatform() || Boolean(nativeFailedIds[photo.id]));

    if (totallyFailed) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#EAECEF] p-6 text-center">
          <span className="text-base font-semibold text-[#141519]">{photo.title}</span>
          <span className="mt-1 text-xs text-zinc-500">
            {photo.date} · {photo.location}
          </span>
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
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors whitespace-nowrap ${
              isVoiceListening
                ? 'bg-[#141519] text-white'
                : 'bg-white/95 text-[#141519] hover:bg-white'
            }`}
          >
            <Mic className={`w-3.5 h-3.5 ${isVoiceListening ? 'text-emerald-400' : 'text-rose-500'}`} />
            <span>{isVoiceListening ? `${wakeWord} 대기중` : wakeWord}</span>
          </button>

          {!showAskInput ? (
            <button
              type="button"
              onClick={() => setShowAskInput(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/95 hover:bg-white text-[#141519] px-3 py-1.5 text-xs font-medium shadow-sm transition-colors whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5 text-zinc-600" />
              <span>{isAssistantLoading ? '확인 중...' : '길안내 · 날씨 질문'}</span>
            </button>
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
                placeholder="목적지 소요시간·날씨 입력..."
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

      {/* Bottom Photo Caption & Minimal Playback Controls */}
      {transitionMode !== 'gallery_matte' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-4 pt-12 flex items-end justify-between gap-4">
          <div className="min-w-0 max-w-[65%]">
            <h2 className="text-base md:text-lg font-semibold text-white tracking-tight truncate">
              {currentPhoto.title}
            </h2>
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

          {/* Playback Controls (positioned cleanly away from bottom-right 3D cottage) */}
          <div className="pointer-events-auto flex items-center gap-1 mr-36 md:mr-44 shrink-0">
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
