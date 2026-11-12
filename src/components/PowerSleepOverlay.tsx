import React, { useEffect, useState } from 'react';
import { Clock, Moon, Power, Settings } from 'lucide-react';
import { PowerScheduleConfig } from '../types';

interface PowerSleepOverlayProps {
  reason: 'away_schedule' | 'night_schedule' | 'idle_timeout' | 'manual_off';
  schedule: PowerScheduleConfig;
  nextWakeLabel: string;
  onWakeTemporarily: () => void;
  onOpenPowerSettings: () => void;
}

export const PowerSleepOverlay: React.FC<PowerSleepOverlayProps> = ({
  reason,
  schedule,
  nextWakeLabel,
  onWakeTemporarily,
  onOpenPowerSettings,
}) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateStr = now.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const reasonLabel =
    reason === 'away_schedule'
      ? `외출 · 부재 절전 시간 (${schedule.awayStartTime} ~ ${schedule.awayEndTime})`
      : reason === 'night_schedule'
      ? `심야 취침 절전 시간 (${schedule.sleepTime} ~ ${schedule.wakeTime})`
      : reason === 'idle_timeout'
      ? `움직임 없음 자동 절전 (${schedule.idleOffMinutes}분 경과)`
      : '수동 외출 절전 모드';

  return (
    <div
      className="fixed inset-0 z-50 bg-[#030305] text-zinc-400 flex flex-col items-center justify-between py-14 px-6 select-none"
      aria-label="스마트 액자 전력 절약 대기 화면"
    >
      {/* Top quiet status */}
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Moon className="w-3.5 h-3.5 text-zinc-500" />
        <span>전력 절약 화면 꺼짐</span>
        <span aria-hidden="true">·</span>
        <span>{reasonLabel}</span>
      </div>

      {/* Ultra-low-luminance clock & next scheduled forced wake */}
      <div className="text-center space-y-4">
        <div className="text-6xl sm:text-7xl font-light tracking-tight text-zinc-500 tabular-nums">
          {timeStr}
        </div>
        <div className="text-sm text-zinc-600">{dateStr}</div>

        <div className="pt-4 flex items-center justify-center gap-2 text-xs text-zinc-500 tabular-nums">
          <Clock className="w-3.5 h-3.5 text-zinc-500" />
          <span>다음 예약 강제 켜짐: {nextWakeLabel}</span>
          <span aria-hidden="true">·</span>
          <span>앨범 슬라이드 및 3D 그래픽 절전 정지됨</span>
        </div>
      </div>

      {/* Subtle wake / schedule actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onWakeTemporarily}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-5 py-2.5 text-xs font-semibold text-zinc-300 transition-colors whitespace-nowrap"
        >
          <Power className="w-3.5 h-3.5 text-emerald-400" />
          화면 임시 켜기 (30분)
        </button>
        <button
          type="button"
          onClick={onOpenPowerSettings}
          className="inline-flex items-center gap-1.5 rounded-xl bg-transparent hover:bg-zinc-900 border border-zinc-800/80 px-4 py-2.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap"
        >
          <Settings className="w-3.5 h-3.5" />
          예약 시간 설정
        </button>
      </div>
    </div>
  );
};
