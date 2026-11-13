import React from 'react';
import {
  Clock,
  FolderPlus,
  LayoutGrid,
  MapPin,
  Mic,
  Moon,
  PanelLeft,
  Settings,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';

export type SettingsTabKey =
  | 'cloud'
  | 'albums'
  | 'characters'
  | 'layout'
  | 'power'
  | 'voice'
  | 'life';

interface MenuRailProps {
  callHintLabel?: string;
  isVoiceListening: boolean;
  ttsEnabled: boolean;
  powerScheduleEnabled: boolean;
  onToggleVoiceListening: () => void;
  onToggleTts: () => void;
  onEnterManualSleep: () => void;
  onOpenSettings: (tab?: SettingsTabKey) => void;
}

export const MenuRail: React.FC<MenuRailProps> = ({
  callHintLabel = '토순아 · 코코야',
  isVoiceListening,
  ttsEnabled,
  powerScheduleEnabled,
  onToggleVoiceListening,
  onToggleTts,
  onEnterManualSleep,
  onOpenSettings,
}) => {
  return (
    <nav
      aria-label="빠른 메뉴창"
      className="w-12 md:w-14 h-full rounded-[20px] bg-[#141519] text-zinc-400 flex flex-col items-center justify-between gap-2 py-3 shrink-0 overflow-y-auto"
    >
      <div className="flex flex-col items-center gap-2 w-full">
        <button
          type="button"
          onClick={onToggleTts}
          title={ttsEnabled ? '음성 안내 켜짐 (클릭 시 음소거)' : '음성 안내 꺼짐 (클릭 시 켜기)'}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
            ttsEnabled ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        <div className="w-6 h-px bg-white/10 my-0.5" />
        <span className="text-[9px] font-semibold tracking-wider text-zinc-500 uppercase">
          MAIN
        </span>

        <button
          type="button"
          onClick={() => onOpenSettings('albums')}
          title="디지털 앨범 목록"
          className="w-9 h-9 rounded-xl bg-white text-[#141519] flex items-center justify-center shadow-sm"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleVoiceListening}
          title={`캐릭터 이름 호출 마이크 (${callHintLabel})`}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
            isVoiceListening
              ? 'bg-emerald-400 text-[#141519]'
              : 'hover:bg-white/10 text-zinc-300'
          }`}
        >
          <Mic className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onOpenSettings('characters')}
          title="3D 동물친구 · 아이 인형 커스텀 · 영어 설정"
          className="w-9 h-9 rounded-xl hover:bg-white/10 text-zinc-300 flex items-center justify-center transition-colors"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onOpenSettings('cloud')}
          title="클라우드 · 시놀로지 사진 폴더 연동"
          className="w-9 h-9 rounded-xl hover:bg-white/10 text-zinc-300 flex items-center justify-center transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onOpenSettings('power')}
          title="전력 절약 · 예약 켜짐 및 외출 절전 시간 설정"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
            powerScheduleEnabled
              ? 'bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
              : 'hover:bg-white/10 text-zinc-300'
          }`}
        >
          <Clock className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onOpenSettings('layout')}
          title="메뉴창 · 날씨창 좌우 배치 및 날씨 효과 설정"
          className="w-9 h-9 rounded-xl hover:bg-white/10 text-zinc-300 flex items-center justify-center transition-colors"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onOpenSettings('life')}
          title="캘린더 선택 연동 · 위치 · 마트 설정"
          className="w-9 h-9 rounded-xl hover:bg-white/10 text-zinc-300 flex items-center justify-center transition-colors"
        >
          <MapPin className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 w-full">
        <button
          type="button"
          onClick={onEnterManualSleep}
          title="지금 외출 절전 (화면 끄기)"
          className="w-9 h-9 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <Moon className="w-4 h-4" />
        </button>
        <div className="w-6 h-px bg-white/10" />
        <button
          type="button"
          onClick={() => onOpenSettings('characters')}
          title="통합 설정 열기"
          className="w-9 h-9 rounded-xl hover:bg-white/10 text-zinc-300 flex items-center justify-center transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};
