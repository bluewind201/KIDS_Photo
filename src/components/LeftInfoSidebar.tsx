import React, { useEffect, useState } from 'react';
import {
  Calendar,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Plus,
  RefreshCw,
  Sun,
  Wind,
} from 'lucide-react';
import { ScheduleItem, WeatherPayload } from '../types';
import { SettingsTabKey } from './MenuRail';

interface LeftInfoSidebarProps {
  weather: WeatherPayload | null;
  isWeatherLoading: boolean;
  schedules: ScheduleItem[];
  onRefreshWeather: () => void;
  onAddSchedule: (item: Omit<ScheduleItem, 'id'>) => void;
  onRemoveSchedule: (id: string) => void;
  onOpenSettings: (initialTab?: SettingsTabKey) => void;
}

function renderWeatherIcon(iconKey?: string, sizeClass = 'w-6 h-6') {
  switch (iconKey) {
    case 'sun':
      return <Sun className={`${sizeClass} text-amber-500`} />;
    case 'partly-cloudy':
      return <CloudSun className={`${sizeClass} text-amber-500`} />;
    case 'cloudy':
      return <Cloud className={`${sizeClass} text-zinc-500`} />;
    case 'fog':
      return <CloudFog className={`${sizeClass} text-zinc-500`} />;
    case 'rain':
      return <CloudRain className={`${sizeClass} text-sky-500`} />;
    case 'snow':
      return <CloudSnow className={`${sizeClass} text-indigo-400`} />;
    case 'storm':
      return <CloudLightning className={`${sizeClass} text-amber-500`} />;
    default:
      return <CloudSun className={`${sizeClass} text-amber-500`} />;
  }
}

function getAirDotTone(level?: 'good' | 'normal' | 'bad' | 'very-bad') {
  switch (level) {
    case 'good':
      return 'text-emerald-400';
    case 'normal':
      return 'text-sky-400';
    case 'bad':
      return 'text-amber-400';
    case 'very-bad':
      return 'text-rose-400';
    default:
      return 'text-emerald-400';
  }
}

export const LeftInfoSidebar: React.FC<LeftInfoSidebarProps> = ({
  weather,
  isWeatherLoading,
  schedules,
  onRefreshWeather,
  onAddSchedule,
  onRemoveSchedule,
  onOpenSettings,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('오늘');
  const [newTime, setNewTime] = useState('14:00');
  const [newLoc, setNewLoc] = useState('');

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);

  const timeString = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateString = now.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddSchedule({
      title: newTitle.trim(),
      date: newDate.trim() || '오늘',
      time: newTime.trim() || '종일',
      location: newLoc.trim() || '집',
    });
    setNewTitle('');
    setNewLoc('');
    setShowAddForm(false);
  };

  return (
    <aside
      aria-label="날씨 · 미세먼지 · 가족 일정 패널"
      className="w-[220px] lg:w-[252px] xl:w-[272px] h-full flex flex-col gap-2.5 overflow-y-auto shrink-0"
    >
      {/* Card 1: Live Clock + Current Weather + Tomorrow Weather */}
      <section
        aria-label="현재 위치 날씨 및 내일 날씨"
        className="rounded-[20px] bg-white border border-black/[0.06] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)] shrink-0"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-2xl lg:text-3xl font-bold tracking-tight text-[#141519]">
              {timeString}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-zinc-500">{dateString}</div>
          </div>
          <button
            type="button"
            onClick={() => onOpenSettings('life')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-700 hover:text-[#141519] transition-colors max-w-[110px]"
            title="위치 변경"
          >
            <MapPin className="w-3 h-3 text-zinc-900 shrink-0" />
            <span className="truncate">{weather?.city || '서울특별시'}</span>
          </button>
        </div>

        {/* Current Weather */}
        <div className="mt-3.5 pt-3 border-t border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#F4F5F7] flex items-center justify-center shrink-0">
              {renderWeatherIcon(weather?.current.iconKey, 'w-5 h-5')}
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-xl font-bold text-[#141519]">
                  {weather ? `${weather.current.temp}°` : '--°'}
                </span>
                <span className="text-xs font-medium text-zinc-600">
                  {weather?.current.condition || '확인 중'}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400">
                체감 {weather?.current.feelsLike ?? '--'}° · 습도 {weather?.current.humidity ?? '--'}%
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefreshWeather}
            aria-label="날씨 새로고침"
            className="w-7 h-7 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isWeatherLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tomorrow Weather */}
        <div className="mt-3 rounded-xl bg-[#F6F7F9] px-3 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-zinc-700 min-w-0">
            {renderWeatherIcon(weather?.tomorrow.iconKey, 'w-4 h-4')}
            <span className="font-semibold whitespace-nowrap">내일</span>
            <span className="text-zinc-500 truncate">· {weather?.tomorrow.condition ?? '-'}</span>
          </div>
          <span className="font-mono font-semibold text-[#141519] whitespace-nowrap ml-2">
            {weather ? `${weather.tomorrow.minTemp}° / ${weather.tomorrow.maxTemp}°` : '--° / --°'}
          </span>
        </div>
      </section>

      {/* Card 2: Dark Charcoal Accent Card — Fine Dust (미세먼지 / 초미세먼지) */}
      <section
        aria-label="미세먼지 농도"
        className="rounded-[20px] bg-[#16181D] text-white p-4 shadow-[0_6px_18px_rgba(20,21,25,0.12)] shrink-0"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">대기 · 미세먼지</span>
          <Wind className="w-3.5 h-3.5 text-zinc-400" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/[0.06] px-3 py-2.5">
            <div className="text-[10px] text-zinc-400">미세 PM10</div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className={`text-xs font-bold ${getAirDotTone(weather?.airQuality.pm10Level)}`}>
                {weather?.airQuality.pm10Grade || '좋음'}
              </span>
              <span className="font-mono text-[11px] text-zinc-300">
                {weather?.airQuality.pm10 ?? 26}㎍
              </span>
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.06] px-3 py-2.5">
            <div className="text-[10px] text-zinc-400">초미세 PM2.5</div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className={`text-xs font-bold ${getAirDotTone(weather?.airQuality.pm25Level)}`}>
                {weather?.airQuality.pm25Grade || '좋음'}
              </span>
              <span className="font-mono text-[11px] text-zinc-300">
                {weather?.airQuality.pm25 ?? 13}㎍
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Card 3: Family Schedule Card */}
      <section
        aria-label="가족 주요 일정"
        className="flex-1 min-h-[190px] rounded-[20px] bg-white border border-black/[0.06] p-4 flex flex-col justify-between shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
      >
        <div className="min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold text-[#141519] tracking-tight">우리 가족 일정</h2>
            <span className="font-mono text-[11px] text-zinc-400">{schedules.length}건</span>
          </div>

          {showAddForm && (
            <form
              onSubmit={handleScheduleSubmit}
              className="mb-2.5 rounded-2xl bg-[#F6F7F9] border border-zinc-200/80 p-2.5 space-y-1.5"
            >
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="새 일정 제목"
                className="w-full rounded-lg bg-white border border-zinc-200 px-2.5 py-1.5 text-xs text-[#141519] placeholder:text-zinc-400 focus:outline-none focus:border-[#141519]"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  placeholder="오늘 / 내일"
                  className="rounded-lg bg-white border border-zinc-200 px-2 py-1 text-xs text-[#141519] focus:outline-none"
                />
                <input
                  type="text"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  placeholder="15:00"
                  className="rounded-lg bg-white border border-zinc-200 px-2 py-1 text-xs text-[#141519] font-mono focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newLoc}
                  onChange={(e) => setNewLoc(e.target.value)}
                  placeholder="장소"
                  className="flex-1 rounded-lg bg-white border border-zinc-200 px-2 py-1 text-xs text-[#141519] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#141519] px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap"
                >
                  저장
                </button>
              </div>
            </form>
          )}

          <ul className="space-y-1.5 overflow-y-auto pr-0.5">
            {schedules.slice(0, 5).map((item, idx) => {
              const isFirst = idx === 0;
              return (
                <li
                  key={item.id}
                  className={`group flex items-center justify-between gap-2 rounded-2xl px-2.5 py-2 transition-colors ${
                    isFirst
                      ? 'bg-[#F5F6F8] border border-zinc-200/70'
                      : 'hover:bg-[#F7F8FA]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isFirst
                          ? 'bg-[#141519] text-white'
                          : 'bg-[#F3F4F6] text-zinc-600'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#141519] truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        <span>{item.date}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">{item.time}</span>
                        {item.location && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>{item.location}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveSchedule(item.id)}
                    className="text-zinc-300 hover:text-rose-500 transition-colors shrink-0"
                    title="일정 삭제"
                  >
                    <ChevronRight className="w-3.5 h-3.5 group-hover:hidden" />
                    <span className="hidden group-hover:inline text-[10px] font-semibold">삭제</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-[#141519] hover:bg-zinc-800 text-white py-2.5 px-4 text-xs font-semibold transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          {showAddForm ? '일정 입력 닫기' : '일정 추가하기'}
        </button>
      </section>
    </aside>
  );
};
