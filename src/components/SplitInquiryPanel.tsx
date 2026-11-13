import React, { useState } from 'react';
import {
  Bus,
  Car,
  Clock,
  Footprints,
  Maximize2,
  Navigation,
  Send,
  Volume2,
} from 'lucide-react';
import { AssistantInquiryResult, BunnyId, PhotoItem } from '../types';

interface SplitInquiryPanelProps {
  inquiry: AssistantInquiryResult;
  remainingSeconds: number;
  isLoading: boolean;
  onExtendTimer: () => void;
  onCloseSplit: () => void;
  onFollowUpQuery: (q: string) => void;
  onSelectMemoryPhoto: (photo: PhotoItem) => void;
  onReplayVoice: () => void;
}

const BUNNY_NAMES: Record<BunnyId, string> = {
  tosuni: '토순이',
  tosili: '토실이',
  toddungi: '토뚱이',
};

function formatDuration(minutes?: number): string {
  if (!minutes || minutes <= 0) return '-';
  if (minutes < 60) return `${minutes}분`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}시간 ${mins}분` : `${hrs}시간`;
}

export const SplitInquiryPanel: React.FC<SplitInquiryPanelProps> = ({
  inquiry,
  remainingSeconds,
  isLoading,
  onExtendTimer,
  onCloseSplit,
  onFollowUpQuery,
  onSelectMemoryPhoto,
  onReplayVoice,
}) => {
  const [followUpText, setFollowUpText] = useState('');

  const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const secs = String(remainingSeconds % 60).padStart(2, '0');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpText.trim()) return;
    onFollowUpQuery(followUpText.trim());
    setFollowUpText('');
  };

  return (
    <aside
      aria-label="AI 문의 및 추억 사진 확인 화면"
      className="w-1/2 h-full rounded-[22px] bg-white border border-black/[0.06] text-[#141519] shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden"
    >
      {/* Top 2-Minute Auto-Return Countdown Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-100 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="font-medium">
              {inquiry.category === 'photo_memories' && (inquiry.bunnySpeakerName || inquiry.bunnySpeaker)
                ? `${inquiry.bunnySpeakerName || (inquiry.bunnySpeaker ? BUNNY_NAMES[inquiry.bunnySpeaker] : '토순이')}가 찾아준 우리 추억`
                : inquiry.category === 'directions'
                ? '교통수단별 소요시간 · 길안내'
                : 'AI 스마트 브리핑'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#141519]">
              <Clock className="w-3.5 h-3.5" />
              자동 복귀 {mins}:{secs}
            </span>
          </div>
          <h2 className="mt-0.5 text-base lg:text-lg font-bold text-[#141519] tracking-tight truncate">
            {inquiry.headline}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onReplayVoice}
            className="inline-flex items-center gap-1 rounded-full bg-[#F4F5F7] hover:bg-zinc-200/80 px-3 py-1.5 text-xs font-semibold text-[#141519] transition-colors whitespace-nowrap"
            title="음성 설명 다시 듣기"
          >
            <Volume2 className="w-3.5 h-3.5" />
            듣기
          </button>
          <button
            type="button"
            onClick={onExtendTimer}
            className="rounded-full bg-[#F4F5F7] hover:bg-zinc-200/80 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors whitespace-nowrap"
          >
            +1분
          </button>
          <button
            type="button"
            onClick={onCloseSplit}
            className="inline-flex items-center gap-1 rounded-full bg-[#141519] hover:bg-zinc-800 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors whitespace-nowrap"
          >
            <Maximize2 className="w-3 h-3" />
            전체화면
          </button>
        </div>
      </div>

      {/* Main Scrollable Inquiry Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 pb-32">
        {/* Spoken Summary Box */}
        <div className="rounded-2xl bg-[#F6F7F9] border border-zinc-200/70 p-4">
          <p className="text-sm leading-relaxed text-[#141519]">{inquiry.spokenSummary}</p>
        </div>

        {/* 1. Directions: Car / Transit / Walking Comparison */}
        {inquiry.category === 'directions' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-xs text-zinc-500 pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-1.5 text-[#141519] font-semibold">
                <Navigation className="w-3.5 h-3.5" />
                <span>{inquiry.originName || '현재 위치'}</span>
                <span aria-hidden="true">→</span>
                <span>{inquiry.destinationName || '목적지'}</span>
              </div>
              {typeof inquiry.distanceKm === 'number' && inquiry.distanceKm > 0 && (
                <span className="font-mono text-zinc-500">약 {inquiry.distanceKm} km</span>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-2.5">
              {/* Car (Dark Signature Card) */}
              <div className="rounded-2xl bg-[#16181D] text-white p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                      <Car className="w-4 h-4 text-amber-300" />
                      자동차
                    </span>
                    <span className="font-mono text-lg font-bold text-white">
                      {formatDuration(inquiry.drivingMinutes)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                    {inquiry.drivingRouteSummary || '주요 간선도로 및 고속도로 추천 경로'}
                  </p>
                </div>
                {inquiry.drivingTip && (
                  <p className="mt-3 pt-2 border-t border-white/10 text-[11px] text-zinc-400">
                    {inquiry.drivingTip}
                  </p>
                )}
              </div>

              {/* Public Transit */}
              <div className="rounded-2xl bg-[#F6F7F9] border border-zinc-200/80 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
                      <Bus className="w-4 h-4 text-sky-600" />
                      대중교통
                    </span>
                    <span className="font-mono text-lg font-bold text-[#141519]">
                      {formatDuration(inquiry.transitMinutes)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                    {inquiry.transitRouteSummary || '지하철 및 광역·간선버스 연계 경로'}
                  </p>
                </div>
                <p className="mt-3 pt-2 border-t border-zinc-200 text-[11px] text-zinc-500">
                  예상 환승 {typeof inquiry.transitTransfers === 'number' ? `${inquiry.transitTransfers}회` : '1~2회'}
                </p>
              </div>

              {/* Walking */}
              <div className="rounded-2xl bg-[#F6F7F9] border border-zinc-200/80 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
                      <Footprints className="w-4 h-4 text-emerald-600" />
                      도보
                    </span>
                    <span className="font-mono text-lg font-bold text-[#141519]">
                      {formatDuration(inquiry.walkingMinutes)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                    {inquiry.walkingRouteSummary || '보행자 우선 산책로 및 횡단보도 경로'}
                  </p>
                </div>
                <p className="mt-3 pt-2 border-t border-zinc-200 text-[11px] text-zinc-500">
                  성인 보행 속도(4.5km/h) 기준
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. Bunny Photo Memories Search Grid ("내가 언제 어디 갔는데" 사진 분석 나열) */}
        {inquiry.category === 'photo_memories' && inquiry.matchedPhotos && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>찾아낸 추억 사진 {inquiry.matchedPhotos.length}장 · 클릭하면 왼쪽 액자에 표시</span>
            </div>

            {inquiry.matchedPhotos.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-[#F6F7F9] p-6 text-center text-xs text-zinc-500">
                아직 해당 장소와 일치하는 사진을 앨범에서 찾지 못했어요.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {inquiry.matchedPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => onSelectMemoryPhoto(photo)}
                    className="group text-left rounded-2xl overflow-hidden bg-[#F7F8FA] border border-zinc-200/80 hover:border-[#141519] transition-colors"
                  >
                    <div className="aspect-video w-full overflow-hidden bg-[#181A20] flex items-center justify-center">
                      <img
                        src={photo.src}
                        alt={photo.title}
                        referrerPolicy="no-referrer"
                        decoding="async"
                        className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-200"
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-bold text-[#141519] truncate">{photo.title}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-zinc-500">
                        {photo.date} · {photo.location}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-600 line-clamp-2 leading-relaxed">
                        {photo.aiSummary}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {inquiry.detailMarkdown && inquiry.category !== 'photo_memories' && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-zinc-500">상세 안내</h3>
            <div className="rounded-2xl bg-[#F6F7F9] border border-zinc-200/70 p-4 text-xs leading-relaxed text-zinc-700 whitespace-pre-line">
              {inquiry.detailMarkdown}
            </div>
          </div>
        )}

        {inquiry.destinationHighlights && inquiry.destinationHighlights.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-zinc-500">체크 포인트</h3>
            <ul className="space-y-1.5 text-xs text-zinc-700">
              {inquiry.destinationHighlights.map((tip, i) => (
                <li key={i} className="rounded-xl bg-[#F6F7F9] border border-zinc-200/70 px-3.5 py-2.5">
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Follow-up Question Input */}
        <form onSubmit={handleSubmit} className="pt-1 flex items-center gap-2">
          <input
            type="text"
            value={followUpText}
            onChange={(e) => setFollowUpText(e.target.value)}
            placeholder="추가로 궁금한 목적지나 일정을 물어보세요..."
            className="flex-1 rounded-full bg-[#F4F5F7] border border-zinc-200 px-4 py-2.5 text-xs text-[#141519] placeholder:text-zinc-400 focus:outline-none focus:border-[#141519]"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#141519] hover:bg-zinc-800 px-4 py-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {isLoading ? '확인중' : '질문'}
          </button>
        </form>
      </div>
    </aside>
  );
};
