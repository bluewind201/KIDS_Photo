import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudRain, CloudSnow, Megaphone, Moon, Sparkles, Sun } from 'lucide-react';
import { Bunny3DOverlay, resolveWeatherKind } from './components/Bunny3DOverlay';
import { DigitalFrameStage } from './components/DigitalFrameStage';
import { LeftInfoSidebar } from './components/LeftInfoSidebar';
import { MenuRail, SettingsTabKey } from './components/MenuRail';
import { PowerSleepOverlay } from './components/PowerSleepOverlay';
import { SettingsAlbumModal } from './components/SettingsAlbumModal';
import { SplitInquiryPanel } from './components/SplitInquiryPanel';
import {
  matchesSpokenEnglishAttempt,
  pickRandomFlashcard,
} from './data/englishFlashcards';
import {
  INITIAL_ALBUMS,
  INITIAL_MART_TICKERS,
  INITIAL_SCHEDULES,
} from './data/initialAlbums';
import { INITIAL_CHARACTERS } from './data/initialCharacters';
import {
  AssistantInquiryResult,
  BunnyBehaviorStatus,
  BunnyCharacterConfig,
  BunnyChatMessage,
  BunnyFlashcard,
  BunnyId,
  BunnyIndividualState,
  BunnyToyType,
  ChildGrowthStage,
  DigitalAlbum,
  EnglishCoachPrompt,
  FrameTransitionMode,
  LayoutSide,
  MartTickerItem,
  PhotoItem,
  PowerScheduleConfig,
  ScheduleItem,
  WeatherEffectMode,
  WeatherPayload,
} from './types';
import {
  getAndroidSpeechBridge,
  installGlobalAudioUnlock,
  isAnyTtsSpeaking,
  playBunnyChime,
  speakEnglishPhrase,
  speakText,
  stopCurrentSpeech,
} from './utils/speech';
import {
  askAssistantUnified,
  askBunnyChatUnified,
  fetchWeatherUnified,
  FRAME_SETTINGS_STORAGE_KEY,
  tryBackendJson,
} from './utils/standaloneApi';

type OutdoorPlayStatus =
  | 'PLAYING_BALL'
  | 'SPINNING_PINWHEEL'
  | 'STACKING_BLOCKS'
  | 'PULLING_CAR'
  | 'BLOWING_BUBBLES'
  | 'ADMIRING_PHOTO'
  | 'RESTING_ON_GRASS'
  | 'SHELTERING_UNDER_TREE'
  | 'BUILDING_SNOWMAN'
  | 'SNOWBALL_FIGHT'
  | 'ROLLING_SNOWBALL';

type SleepReason = 'away_schedule' | 'night_schedule' | 'idle_timeout' | 'manual_off';

const DEFAULT_POWER_SCHEDULE: PowerScheduleConfig = {
  enabled: true,
  wakeTime: '07:00',
  sleepTime: '22:30',
  awayEnabled: true,
  awayStartTime: '09:30',
  awayEndTime: '16:30',
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  idleOffMinutes: 30,
};

function parseTimeToMinutes(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '00:00').split(':');
  const h = Math.max(0, Math.min(23, Number(hStr) || 0));
  const m = Math.max(0, Math.min(59, Number(mStr) || 0));
  return h * 60 + m;
}

function evaluatePowerSchedule(
  cfg: PowerScheduleConfig,
  now: Date
): { shouldBeOn: boolean; reason: SleepReason | null; nextWakeLabel: string } {
  if (!cfg.enabled) {
    return { shouldBeOn: true, reason: null, nextWakeLabel: cfg.wakeTime };
  }

  const day = now.getDay();
  if (Array.isArray(cfg.activeDays) && cfg.activeDays.length > 0 && !cfg.activeDays.includes(day)) {
    return {
      shouldBeOn: false,
      reason: 'away_schedule',
      nextWakeLabel: `예약 요일 ${cfg.wakeTime}`,
    };
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const wakeMin = parseTimeToMinutes(cfg.wakeTime);
  const sleepMin = parseTimeToMinutes(cfg.sleepTime);

  const isNightOff =
    wakeMin <= sleepMin
      ? nowMin < wakeMin || nowMin >= sleepMin
      : nowMin >= sleepMin && nowMin < wakeMin;

  if (isNightOff) {
    return {
      shouldBeOn: false,
      reason: 'night_schedule',
      nextWakeLabel: `${cfg.wakeTime} (아침 기상)`,
    };
  }

  if (cfg.awayEnabled) {
    const awayStartMin = parseTimeToMinutes(cfg.awayStartTime);
    const awayEndMin = parseTimeToMinutes(cfg.awayEndTime);
    const isAwayOff =
      awayStartMin <= awayEndMin
        ? nowMin >= awayStartMin && nowMin < awayEndMin
        : nowMin >= awayStartMin || nowMin < awayEndMin;

    if (isAwayOff) {
      return {
        shouldBeOn: false,
        reason: 'away_schedule',
        nextWakeLabel: `${cfg.awayEndTime} (귀가·하원)`,
      };
    }
  }

  const nextWake =
    cfg.awayEnabled && nowMin < parseTimeToMinutes(cfg.awayEndTime)
      ? `${cfg.awayEndTime} (귀가·하원)`
      : `${cfg.wakeTime} (아침 기상)`;

  return { shouldBeOn: true, reason: null, nextWakeLabel: nextWake };
}

const TOY_TO_STATUS: Record<BunnyToyType, OutdoorPlayStatus> = {
  ball: 'PLAYING_BALL',
  pinwheel: 'SPINNING_PINWHEEL',
  blocks: 'STACKING_BLOCKS',
  car: 'PULLING_CAR',
  bubbles: 'BLOWING_BUBBLES',
};

const TOY_OUTDOOR_STATUSES: OutdoorPlayStatus[] = [
  'PLAYING_BALL',
  'SPINNING_PINWHEEL',
  'STACKING_BLOCKS',
  'PULLING_CAR',
  'BLOWING_BUBBLES',
  'ADMIRING_PHOTO',
];

const OUTDOOR_LINES: Record<OutdoorPlayStatus, string[]> = {
  PLAYING_BALL: [
    '통통 무지개 공놀이 신난다~!',
    '데구르르 공 굴리기 같이 할래?',
    '폴짝! 공을 톡톡 치는 중이야~',
  ],
  SPINNING_PINWHEEL: [
    '후우~ 바람개비가 빙글빙글 돌아!',
    '살랑살랑 바람 불어서 시원해~!',
    '예쁜 바람개비 들고 산책 중!',
  ],
  STACKING_BLOCKS: [
    '차곡차곡 파스텔 블록 탑 쌓는 중!',
    '우와~ 블록이 안 무너졌어 헤헤!',
    '알록달록 나무 블록 놀이 재밌다!',
  ],
  PULLING_CAR: [
    '부릉부릉~ 미니 자동차 끌고 간다!',
    '장난감 자동차 바퀴가 쌩쌩 돌아~',
    '꼬마 자동차랑 나들이 가는 중!',
  ],
  BLOWING_BUBBLES: [
    '후우~ 반짝반짝 비눗방울 날아간다!',
    '몽글몽글 비눗방울 톡 터졌어~!',
    '예쁜 비눗방울 불기 놀이 중!',
  ],
  ADMIRING_PHOTO: [
    '우와~ 우리 이 사진 진짜 예쁘다!',
    '요 사진 보니까 또 놀러 가고 싶어!',
    '히히, 이때 기억나? 눌러봐~!',
  ],
  RESTING_ON_GRASS: [
    '날씨가 참 따뜻하다~ 잔디밭에 앉아 쉬는 중!',
    '살랑살랑 기분 좋은 날이야~ 풀밭에 앉아 햇살 쬐자!',
    '폭신폭신 꽃잔디에 다리 뻗고 도란도란 휴식 중~',
  ],
  SHELTERING_UNDER_TREE: [
    '후드득 비가 와서 커다란 나무 아래로 피했어!',
    '나무 잎사귀 그늘 밑은 비가 안 맞아서 보송보송해~',
    '빗소리 들으며 나무 아래에서 비 그치길 기다리는 중!',
  ],
  BUILDING_SNOWMAN: [
    '영차영차~ 당근 코 눈사람 만드는 중이야!',
    '동글동글 눈을 뭉쳐서 멋진 눈사람 완성해 볼까~?',
    '빨간 목도리 두른 눈사람 친구야 안녕~!',
  ],
  SNOWBALL_FIGHT: [
    '얍~! 포슬포슬 눈뭉치 간다! 신나는 눈싸움~!',
    '하하하 눈덩이 피하기 놀이 진짜 재밌다!',
    '펑! 하얀 눈꽃이 반짝반짝 날린다~!',
  ],
  ROLLING_SNOWBALL: [
    '데구르르~ 눈덩이를 굴리면 점점 커져요! 같이 굴려봐!',
    '영차영차! 하얀 눈덩이를 굴려서 대왕 눈사람 만들자~',
    '화면의 반짝이는 눈덩이도 손으로 데구르르 굴려봐~!',
  ],
};

function pickOutdoorStateForCharacter(
  char: BunnyCharacterConfig | undefined,
  photoCount: number,
  weatherKind: 'sun' | 'breeze' | 'rain' | 'snow' | 'off'
): {
  status: OutdoorPlayStatus;
  bubbleText: string;
  photoIndex: number;
} {
  const photoIndex = photoCount > 0 ? Math.floor(Math.random() * photoCount) : 0;
  const roll = Math.random();

  // 1. Snowy weather: bunnies build a 3D snowman, have a 3D snowball fight, or roll snowballs!
  // (No flashcards when no child is chatting!)
  if (weatherKind === 'snow') {
    let snowStatus: OutdoorPlayStatus = 'BUILDING_SNOWMAN';
    if (roll < 0.36) {
      snowStatus = 'BUILDING_SNOWMAN';
    } else if (roll < 0.72) {
      snowStatus = 'SNOWBALL_FIGHT';
    } else if (roll < 0.94) {
      snowStatus = 'ROLLING_SNOWBALL';
    } else {
      snowStatus = 'ADMIRING_PHOTO';
    }
    const lines = OUTDOOR_LINES[snowStatus];
    return {
      status: snowStatus,
      bubbleText: lines[Math.floor(Math.random() * lines.length)],
      photoIndex,
    };
  }

  // 2. Rainy weather: bunnies strongly prefer sheltering under the big 3D leafy tree!
  if (weatherKind === 'rain') {
    if (roll < 0.74) {
      const lines = OUTDOOR_LINES.SHELTERING_UNDER_TREE;
      return {
        status: 'SHELTERING_UNDER_TREE',
        bubbleText: lines[Math.floor(Math.random() * lines.length)],
        photoIndex,
      };
    }
  }

  // 3. Sunny or gentle breezy weather: bunnies periodically sit & relax on a 3D clover/daisy grass mat!
  if (weatherKind === 'sun' || weatherKind === 'breeze') {
    if (roll < 0.36) {
      const lines = OUTDOOR_LINES.RESTING_ON_GRASS;
      return {
        status: 'RESTING_ON_GRASS',
        bubbleText: lines[Math.floor(Math.random() * lines.length)],
        photoIndex,
      };
    }
  }

  // 4. Favorite 3D outdoor toys & photo admiring (never show flashcards when child is absent!)
  let status: OutdoorPlayStatus;
  if (char && Math.random() < 0.55) {
    status = TOY_TO_STATUS[char.favoriteToy];
  } else {
    status = TOY_OUTDOOR_STATUSES[Math.floor(Math.random() * TOY_OUTDOOR_STATUSES.length)];
  }
  const lines = OUTDOOR_LINES[status];
  const bubbleText = lines[Math.floor(Math.random() * lines.length)];
  return { status, bubbleText, photoIndex };
}

function createInitialBunnyStates(
  chars: BunnyCharacterConfig[]
): Record<BunnyId, BunnyIndividualState> {
  const map: Record<BunnyId, BunnyIndividualState> = {};
  chars.forEach((c, idx) => {
    map[c.id] = {
      status: 'IN_HOUSE',
      bubbleText: c.greeting,
      isSpeaking: false,
      isThinking: false,
      photoIndex: idx,
      englishCoach: null,
      activeFlashcard: null,
    };
  });
  return map;
}

interface BrowserSpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function App() {
  // Core Smart Frame State (오프라인/앱 단독 모드를 위해 localStorage 영구 보존)
  const [albums, setAlbums] = useState<DigitalAlbum[]>(() => {
    try {
      const cached = localStorage.getItem('kids_photo_albums');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_ALBUMS;
  });
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [slideIntervalSec, setSlideIntervalSec] = useState(12);
  const [transitionMode, setTransitionMode] = useState<FrameTransitionMode>('ken_burns');

  // Layout Side & Weather Effect Settings
  const [menuPosition, setMenuPosition] = useState<LayoutSide>('left');
  const [weatherPosition, setWeatherPosition] = useState<LayoutSide>('left');
  const [weatherEffectMode, setWeatherEffectMode] = useState<WeatherEffectMode>('auto');

  // Child Growth Stage & Spoken English Stars
  const [childAgeStage, setChildAgeStage] = useState<ChildGrowthStage>('age_5');
  const [growthStars, setGrowthStars] = useState<number>(0);

  // Scheduled Power-Saving & Away Screen-Off State
  const [powerSchedule, setPowerSchedule] = useState<PowerScheduleConfig>(DEFAULT_POWER_SCHEDULE);
  const [sleepState, setSleepState] = useState<{
    sleeping: boolean;
    reason: SleepReason;
  }>({
    sleeping: false,
    reason: 'away_schedule',
  });
  // Initial 30-min preview grace on mount so opening the app during night/away hours still shows the frame right away
  const tempWakeUntilRef = useRef<number>(Date.now() + 30 * 60 * 1000);
  const lastActivityRef = useRef<number>(Date.now());
  const prevScheduledShouldBeOnRef = useRef<boolean | null>(null);

  // Weather, Schedule & Top Mart Ticker State
  const [locationInfo, setLocationInfo] = useState({
    city: '서울특별시',
    lat: 37.5665,
    lng: 126.978,
  });
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleItem[]>(INITIAL_SCHEDULES);
  const [martItems, setMartItems] = useState<MartTickerItem[]>(INITIAL_MART_TICKERS);

  // Voice & Custom Wake Word State
  const [wakeWord, setWakeWord] = useState('하이 액자');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [awaitingWakeFollowUp, setAwaitingWakeFollowUp] = useState(false);
  const [voiceToast, setVoiceToast] = useState<string | null>(null);

  // 50% Split-Screen Inquiry & 2-Minute (120s) Auto-Return Timer
  const [activeInquiry, setActiveInquiry] = useState<AssistantInquiryResult | null>(null);
  const [splitRemainingSeconds, setSplitRemainingSeconds] = useState(120);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);

  // Customizable 3D Character Roster & Per-Character Independent State
  const [characters, setCharacters] = useState<BunnyCharacterConfig[]>(INITIAL_CHARACTERS);
  const [hasVillageAwakened, setHasVillageAwakened] = useState(false);
  const [activeChatBunny, setActiveChatBunny] = useState<BunnyId | null>(null);
  const [chatWaitSeconds, setChatWaitSeconds] = useState<number>(60);
  const silenceAutoCountRef = useRef<number>(0);
  const cardAutoDismissTimerRef = useRef<number | null>(null);

  const [bunnyHistories, setBunnyHistories] = useState<Record<BunnyId, BunnyChatMessage[]>>({});
  const [bunnies, setBunnies] = useState<Record<BunnyId, BunnyIndividualState>>(() =>
    createInitialBunnyStates(INITIAL_CHARACTERS)
  );

  // Settings Modal State
  const [settingsModalTab, setSettingsModalTab] = useState<SettingsTabKey | null>(null);
  const [hasHydratedState, setHasHydratedState] = useState(false);

  useEffect(() => {
    installGlobalAudioUnlock();
  }, []);

  // Track household presence activity (touch, click, keyboard) for idle power-saving
  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('pointerdown', markActive, { passive: true });
    window.addEventListener('keydown', markActive, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
    };
  }, []);

  useEffect(() => {
    setBunnies((prev) => {
      let changed = false;
      const next = { ...prev };
      characters.forEach((c, idx) => {
        if (!next[c.id]) {
          changed = true;
          next[c.id] = {
            status: 'IN_HOUSE',
            bubbleText: c.greeting,
            isSpeaking: false,
            isThinking: false,
            photoIndex: idx,
            englishCoach: null,
            activeFlashcard: null,
          };
        }
      });
      return changed ? next : prev;
    });
  }, [characters]);

  const activePhotos = useMemo<PhotoItem[]>(() => {
    return albums.filter((a) => a.enabled).flatMap((a) => a.photos);
  }, [albums]);

  useEffect(() => {
    if (currentPhotoIdx >= activePhotos.length && activePhotos.length > 0) {
      setCurrentPhotoIdx(0);
    }
  }, [activePhotos.length, currentPhotoIdx]);

  useEffect(() => {
    try {
      localStorage.setItem('kids_photo_albums', JSON.stringify(albums));
    } catch {}
  }, [albums]);

  // Hydrate persisted settings from localStorage (standalone APK) and backend (if available) on mount
  useEffect(() => {
    let cancelled = false;

    interface PersistedFrameSettings {
      saved?: boolean;
      wakeWord?: string;
      slideIntervalSec?: number;
      transitionMode?: FrameTransitionMode;
      ttsEnabled?: boolean;
      menuPosition?: LayoutSide;
      weatherPosition?: LayoutSide;
      weatherEffectMode?: WeatherEffectMode;
      childAgeStage?: ChildGrowthStage;
      growthStars?: number;
      powerSchedule?: PowerScheduleConfig;
      characters?: BunnyCharacterConfig[];
      locationInfo?: { city: string; lat: number; lng: number };
      schedules?: ScheduleItem[];
      martItems?: MartTickerItem[];
    }

    const applySavedSettings = (saved: PersistedFrameSettings) => {
      if (saved.wakeWord) setWakeWord(saved.wakeWord);
      if (typeof saved.slideIntervalSec === 'number') setSlideIntervalSec(saved.slideIntervalSec);
      if (saved.transitionMode) setTransitionMode(saved.transitionMode);
      if (typeof saved.ttsEnabled === 'boolean') setTtsEnabled(saved.ttsEnabled);
      if (saved.menuPosition === 'left' || saved.menuPosition === 'right') {
        setMenuPosition(saved.menuPosition);
      }
      if (saved.weatherPosition === 'left' || saved.weatherPosition === 'right') {
        setWeatherPosition(saved.weatherPosition);
      }
      if (saved.weatherEffectMode) {
        setWeatherEffectMode(saved.weatherEffectMode);
      }
      if (
        saved.childAgeStage === 'age_3_4' ||
        saved.childAgeStage === 'age_5' ||
        saved.childAgeStage === 'age_6_7'
      ) {
        setChildAgeStage(saved.childAgeStage);
      }
      if (typeof saved.growthStars === 'number') {
        setGrowthStars(saved.growthStars);
      }
      if (saved.powerSchedule && typeof saved.powerSchedule.wakeTime === 'string') {
        setPowerSchedule(saved.powerSchedule);
      }
      if (Array.isArray(saved.characters) && saved.characters.length > 0) {
        setCharacters(
          saved.characters.map((c) => {
            if (c.id === 'tobyeori' && c.voiceSpeaker === 'tosuni') {
              return { ...c, voiceSpeaker: 'tobyeori' };
            }
            if (c.id === 'togureum' && c.voiceSpeaker === 'tosili') {
              return { ...c, voiceSpeaker: 'togureum' };
            }
            return c;
          })
        );
      }
      if (saved.locationInfo?.city) setLocationInfo(saved.locationInfo);
      if (Array.isArray(saved.schedules) && saved.schedules.length > 0) setSchedules(saved.schedules);
      if (Array.isArray(saved.martItems) && saved.martItems.length > 0) setMartItems(saved.martItems);
    };

    (async () => {
      // 1) Immediately restore from localStorage for offline / standalone Android APK
      try {
        const localRaw = localStorage.getItem(FRAME_SETTINGS_STORAGE_KEY);
        if (localRaw) {
          const parsedLocal = JSON.parse(localRaw) as PersistedFrameSettings;
          if (!cancelled && parsedLocal) {
            applySavedSettings(parsedLocal);
          }
        }
      } catch {
        // ignore storage parse error
      }

      // 2) Optionally sync from remote backend if configured/running
      try {
        const res = await tryBackendJson<PersistedFrameSettings>('/api/state');
        if (!cancelled && res.ok && res.data.saved) {
          applySavedSettings(res.data);
        }
      } catch {
        // Ignore initial load failure
      } finally {
        if (!cancelled) setHasHydratedState(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist user settings to localStorage (immediately) and backend (debounced) whenever updated
  useEffect(() => {
    if (!hasHydratedState) return;
    const payload = {
      saved: true,
      wakeWord,
      slideIntervalSec,
      transitionMode,
      ttsEnabled,
      menuPosition,
      weatherPosition,
      weatherEffectMode,
      childAgeStage,
      growthStars,
      powerSchedule,
      characters,
      locationInfo,
      schedules,
      martItems,
    };

    try {
      localStorage.setItem(FRAME_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage quota errors
    }

    const timeout = window.setTimeout(() => {
      tryBackendJson('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [
    hasHydratedState,
    wakeWord,
    slideIntervalSec,
    transitionMode,
    ttsEnabled,
    menuPosition,
    weatherPosition,
    weatherEffectMode,
    childAgeStage,
    growthStars,
    powerSchedule,
    characters,
    locationInfo,
    schedules,
    martItems,
  ]);

  // Scheduled Forced-Wake & Away/Night Power-Saving Engine
  const enterSleepMode = useCallback((reason: SleepReason) => {
    stopCurrentSpeech();
    setActiveChatBunny(null);
    setSleepState({ sleeping: true, reason });
  }, []);

  const wakeTemporarilyFor30Min = useCallback(() => {
    const now = Date.now();
    tempWakeUntilRef.current = now + 30 * 60 * 1000;
    lastActivityRef.current = now;
    setSleepState((prev) => ({ ...prev, sleeping: false }));
  }, []);

  useEffect(() => {
    const checkPowerSchedule = () => {
      const now = new Date();
      const nowMs = now.getTime();
      const evalResult = evaluatePowerSchedule(powerSchedule, now);
      const prevShouldBeOn = prevScheduledShouldBeOnRef.current;
      prevScheduledShouldBeOnRef.current = evalResult.shouldBeOn;

      if (!powerSchedule.enabled) {
        if (sleepState.sleeping && sleepState.reason !== 'manual_off') {
          setSleepState((prev) => ({ ...prev, sleeping: false }));
        }
        return;
      }

      // 1. Crossing INTO a scheduled ON window (e.g. 07:00 morning wake or 16:30 return home):
      // Forcibly turn the frame screen ON!
      if (prevShouldBeOn === false && evalResult.shouldBeOn === true) {
        lastActivityRef.current = nowMs;
        setSleepState((prev) => ({ ...prev, sleeping: false }));
        return;
      }

      // 2. Crossing INTO a scheduled OFF window (e.g. 09:30 away start or 22:30 night sleep):
      // Turn the frame screen OFF immediately!
      if (prevShouldBeOn === true && evalResult.shouldBeOn === false && evalResult.reason) {
        tempWakeUntilRef.current = 0;
        enterSleepMode(evalResult.reason);
        return;
      }

      // 3. Currently in an away/night OFF window and temporary 30-min wake expired
      if (!evalResult.shouldBeOn && evalResult.reason && nowMs >= tempWakeUntilRef.current) {
        if (!sleepState.sleeping) {
          enterSleepMode(evalResult.reason);
        }
        return;
      }

      // 4. Household Idle Auto-Off when nobody interacts for idleOffMinutes
      if (
        !sleepState.sleeping &&
        powerSchedule.idleOffMinutes > 0 &&
        nowMs - lastActivityRef.current >= powerSchedule.idleOffMinutes * 60 * 1000
      ) {
        enterSleepMode('idle_timeout');
      }
    };

    checkPowerSchedule();
    const timer = window.setInterval(checkPowerSchedule, 15000);
    return () => window.clearInterval(timer);
  }, [powerSchedule, sleepState.sleeping, sleepState.reason, enterSleepMode]);

  const nextScheduledWakeLabel = useMemo(() => {
    return evaluatePowerSchedule(powerSchedule, new Date()).nextWakeLabel;
  }, [powerSchedule, sleepState.sleeping]);

  const fetchWeather = useCallback(async () => {
    setIsWeatherLoading(true);
    try {
      const data = await fetchWeatherUnified(
        locationInfo.lat,
        locationInfo.lng,
        locationInfo.city
      );
      if (data) {
        setWeather(data);
      }
    } catch {
      // Ignore weather network failure
    } finally {
      setIsWeatherLoading(false);
    }
  }, [locationInfo]);

  useEffect(() => {
    if (sleepState.sleeping) return;
    fetchWeather();
    const interval = window.setInterval(fetchWeather, 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchWeather, sleepState.sleeping]);

  // FrameSway Slideshow Auto-Advance Timer (paused during power-saving sleep!)
  useEffect(() => {
    if (sleepState.sleeping || !isPlaying || activePhotos.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentPhotoIdx((prev) => (prev + 1) % activePhotos.length);
    }, slideIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [sleepState.sleeping, isPlaying, activePhotos.length, slideIntervalSec]);

  // 2-Minute (120s) Split-Screen Auto-Return Countdown Timer
  useEffect(() => {
    if (!activeInquiry || sleepState.sleeping) return;
    const timer = window.setInterval(() => {
      setSplitRemainingSeconds((prev) => {
        if (prev <= 1) {
          setActiveInquiry(null);
          return 120;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeInquiry, sleepState.sleeping]);

  const enabledCharacters = useMemo(
    () => characters.filter((c) => c.enabled),
    [characters]
  );

  const effectiveWeather = useMemo(
    () => resolveWeatherKind(weatherEffectMode, weather?.current.iconKey),
    [weatherEffectMode, weather?.current.iconKey]
  );

  // Immediate Weather Reaction when Outdoor Weather Shifts (Snow -> Snowman/Snowball Fight, Rain -> Tree Shelter, Sun -> Grass Rest!)
  const prevEffectiveWeatherRef = useRef(effectiveWeather);
  useEffect(() => {
    if (prevEffectiveWeatherRef.current === effectiveWeather) return;
    prevEffectiveWeatherRef.current = effectiveWeather;

    setBunnies((prev) => {
      let changed = false;
      const next = { ...prev };
      enabledCharacters.forEach((char, idx) => {
        const cur = next[char.id];
        if (
          !cur ||
          cur.status === 'IN_HOUSE' ||
          cur.status === 'CHATTING' ||
          cur.status === 'GOING_HOME'
        ) {
          return;
        }
        if (effectiveWeather === 'snow') {
          changed = true;
          const snowStatuses: OutdoorPlayStatus[] = [
            'BUILDING_SNOWMAN',
            'SNOWBALL_FIGHT',
            'ROLLING_SNOWBALL',
          ];
          const chosen = snowStatuses[idx % snowStatuses.length];
          next[char.id] = {
            ...cur,
            status: chosen,
            bubbleText:
              chosen === 'BUILDING_SNOWMAN'
                ? '우와 눈이 내려요! 당근 코 눈사람 만들자~!'
                : chosen === 'SNOWBALL_FIGHT'
                ? '야호 함박눈이다~! 신나는 눈싸움 시작!!'
                : '데구르르~ 하얀 눈덩이를 굴려볼까~?',
            activeFlashcard: null,
          };
        } else if (effectiveWeather === 'rain' && cur.status !== 'SHELTERING_UNDER_TREE') {
          changed = true;
          next[char.id] = {
            ...cur,
            status: 'SHELTERING_UNDER_TREE',
            bubbleText: '앗, 비가 내린다! 커다란 나무 아래로 비 피하러 가자~!',
            activeFlashcard: null,
          };
        } else if (
          effectiveWeather === 'sun' &&
          (cur.status === 'SHELTERING_UNDER_TREE' ||
            cur.status === 'BUILDING_SNOWMAN' ||
            cur.status === 'SNOWBALL_FIGHT' ||
            cur.status === 'ROLLING_SNOWBALL' ||
            idx === 0)
        ) {
          changed = true;
          next[char.id] = {
            ...cur,
            status: 'RESTING_ON_GRASS',
            bubbleText: '우와 햇살이 쨍쨍 따뜻해! 잔디밭에 앉아서 쉬어야지~',
            activeFlashcard: null,
          };
        }
      });
      return changed ? next : prev;
    });
  }, [effectiveWeather, enabledCharacters]);

  // Independent Per-Bunny Autonomous Outdoor Cycles (Toys, Grass Rest, Rain Tree Shelter, Snowman & Snowball Fight — NO flashcards when no child is chatting!)
  useEffect(() => {
    if (sleepState.sleeping || !hasVillageAwakened || enabledCharacters.length === 0) return;

    const timers = enabledCharacters.map((char, idx) => {
      const staggeredMs = 11500 + idx * 3100;
      return window.setInterval(() => {
        setBunnies((prev) => {
          const current = prev[char.id];
          if (!current || current.status === 'CHATTING' || current.status === 'GOING_HOME') {
            return prev;
          }

          if (current.status === 'IN_HOUSE') {
            if (Math.random() < 0.45) {
              const nextOut = pickOutdoorStateForCharacter(
                char,
                activePhotos.length,
                effectiveWeather
              );
              playBunnyChime(char.voiceSpeaker, ttsEnabled);
              return {
                ...prev,
                [char.id]: {
                  ...current,
                  status: nextOut.status,
                  bubbleText:
                    nextOut.status === 'SHELTERING_UNDER_TREE'
                      ? `${char.name}도 비 구경하러 나무 아래로 나왔어~!`
                      : nextOut.status === 'RESTING_ON_GRASS'
                      ? `${char.name}도 따뜻한 잔디밭에 앉아 쉬러 나왔어~!`
                      : nextOut.status === 'BUILDING_SNOWMAN'
                      ? `${char.name}도 눈사람 만들러 총총 나왔어~!`
                      : nextOut.status === 'SNOWBALL_FIGHT'
                      ? `${char.name}도 눈싸움하러 신나게 나왔어~!`
                      : nextOut.bubbleText,
                  photoIndex: nextOut.photoIndex,
                  activeFlashcard: null,
                },
              };
            }
            return prev;
          }

          // ~20% chance this single bunny independently hops back into the cottage to rest
          if (Math.random() < 0.2) {
            return {
              ...prev,
              [char.id]: {
                ...current,
                status: 'GOING_HOME',
                bubbleText: '신나게 놀았다~ 잠깐 예쁜 집에 들어갔다 올게!',
                activeFlashcard: null,
              },
            };
          }

          const nextOut = pickOutdoorStateForCharacter(
            char,
            activePhotos.length,
            effectiveWeather
          );
          return {
            ...prev,
            [char.id]: {
              ...current,
              status: nextOut.status,
              bubbleText: nextOut.bubbleText,
              photoIndex: nextOut.photoIndex,
              activeFlashcard: null,
            },
          };
        });
      }, staggeredMs);
    });

    return () => {
      timers.forEach((t) => window.clearInterval(t));
    };
  }, [
    sleepState.sleeping,
    hasVillageAwakened,
    enabledCharacters,
    activePhotos.length,
    effectiveWeather,
    ttsEnabled,
  ]);

  const showTemporaryToast = useCallback((msg: string) => {
    setVoiceToast(msg);
    window.setTimeout(() => {
      setVoiceToast((curr) => (curr === msg ? null : curr));
    }, 3500);
  }, []);

  const setBunnySpeakingFlag = useCallback((id: BunnyId, speaking: boolean) => {
    setBunnies((prev) => {
      if (!prev[id]) return prev;
      return {
        ...prev,
        [id]: { ...prev[id], isSpeaking: speaking },
      };
    });
  }, []);

  // AI Smart Frame Assistant Query Handler
  const handleAssistantInquiry = useCallback(
    async (queryText: string) => {
      if (!queryText.trim()) return;
      lastActivityRef.current = Date.now();
      setIsAssistantLoading(true);
      showTemporaryToast(`AI 문의 확인 중: "${queryText}"`);

      try {
        const data = await askAssistantUnified({
          query: queryText,
          currentCity: locationInfo.city,
          currentLat: locationInfo.lat,
          currentLng: locationInfo.lng,
          weatherSummary: weather,
          schedules,
        });

        setActiveInquiry(data);
        setSplitRemainingSeconds(120);
        speakText(data.spokenSummary, 'assistant', ttsEnabled);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : '일시적인 오류가 발생했습니다.';
        setActiveInquiry({
          category: 'general',
          headline: '문의 확인 안내',
          spokenSummary: errMsg,
          detailMarkdown: '잠시 후 다시 질문해 주세요.',
        });
        setSplitRemainingSeconds(120);
      } finally {
        setIsAssistantLoading(false);
      }
    },
    [locationInfo, weather, schedules, ttsEnabled, showTemporaryToast]
  );

  // Dismiss Giant Mid-Chat Flashcard smoothly back to conversation
  const handleDismissFlashcard = useCallback((bunnyId: BunnyId) => {
    if (cardAutoDismissTimerRef.current !== null) {
      window.clearTimeout(cardAutoDismissTimerRef.current);
      cardAutoDismissTimerRef.current = null;
    }
    setBunnies((prev) => {
      if (!prev[bunnyId]) return prev;
      return {
        ...prev,
        [bunnyId]: {
          ...prev[bunnyId],
          activeFlashcard: null,
        },
      };
    });
  }, []);

  // Finish Chat -> Bunny hops out to weather-appropriate 3D outdoor activity (and clears flashcards!)
  const handleFinishBunnyChat = useCallback(
    (bunnyId: BunnyId) => {
      stopCurrentSpeech();
      if (cardAutoDismissTimerRef.current !== null) {
        window.clearTimeout(cardAutoDismissTimerRef.current);
        cardAutoDismissTimerRef.current = null;
      }
      silenceAutoCountRef.current = 0;
      setChatWaitSeconds(60);
      setActiveChatBunny((curr) => (curr === bunnyId ? null : curr));
      const charCfg = characters.find((c) => c.id === bunnyId);
      const nextOut = pickOutdoorStateForCharacter(
        charCfg,
        activePhotos.length,
        effectiveWeather
      );
      setBunnies((prev) => ({
        ...prev,
        [bunnyId]: {
          ...(prev[bunnyId] ?? { photoIndex: 0 }),
          status: nextOut.status,
          bubbleText: nextOut.bubbleText,
          isSpeaking: false,
          isThinking: false,
          photoIndex: nextOut.photoIndex,
          englishCoach: null,
          activeFlashcard: null,
        },
      }));
    },
    [characters, activePhotos.length, effectiveWeather]
  );

  // Send Kid's Message (or 60-sec Silence Auto-Continue) to Multi-Turn Gemini 3.8 Flash Chatbot!
  const handleSendBunnyMessage = useCallback(
    async (
      bunnyId: BunnyId,
      text: string,
      options?: { isAutoFollowUpAfterSilence?: boolean }
    ) => {
      const isAutoSilence = Boolean(options?.isAutoFollowUpAfterSilence);
      if (!isAutoSilence && !text.trim()) return;

      const charCfg = characters.find((c) => c.id === bunnyId) ?? characters[0];
      setHasVillageAwakened(true);
      setActiveChatBunny(bunnyId);

      if (!isAutoSilence) {
        lastActivityRef.current = Date.now();
        silenceAutoCountRef.current = 0;
      }
      setChatWaitSeconds(60);

      const priorHistory = bunnyHistories[bunnyId] ?? [];
      const updatedHistory = isAutoSilence
        ? priorHistory
        : [
            ...priorHistory,
            {
              id: `u-${Date.now()}`,
              role: 'user' as const,
              text,
            },
          ];

      if (!isAutoSilence) {
        setBunnyHistories((prev) => ({ ...prev, [bunnyId]: updatedHistory }));
      }

      const userTurnCount = updatedHistory.filter((m) => m.role === 'user').length;
      const currentCard = isAutoSilence ? null : bunnies[bunnyId]?.activeFlashcard ?? null;

      setBunnies((prev) => ({
        ...prev,
        [bunnyId]: {
          ...(prev[bunnyId] ?? { bubbleText: '', isSpeaking: false, photoIndex: 0 }),
          status: 'CHATTING',
          isThinking: true,
          ...(isAutoSilence ? { activeFlashcard: null, englishCoach: null } : {}),
        },
      }));

      try {
        const allCatalogPhotos = albums.flatMap((a) =>
          a.photos.map((p) => ({
            id: p.id,
            title: p.title,
            date: p.date,
            location: p.location,
            albumName: p.albumName,
            tags: p.tags,
            aiSummary: p.aiSummary,
            assetUrl: p.assetUrl,
          }))
        );

        const weatherConditionLabel =
          effectiveWeather === 'snow'
            ? '함박눈 내림 (눈사람 만들기·눈싸움·눈덩이 굴리기 하기 좋은 날)'
            : effectiveWeather === 'rain'
            ? '비 내림 (나무 아래 비 피하기 좋은 날)'
            : effectiveWeather === 'sun'
            ? '햇살 쨍쨍 맑음 (잔디밭에 앉아 쉬기 좋은 날)'
            : '산들바람 불고 쾌청함';

        const data = await askBunnyChatUnified({
          bunnyId,
          characterName: charCfg?.name,
          characterPersona: charCfg?.personaPrompt,
          userMessage: text,
          weatherCondition: weatherConditionLabel,
          childAgeStage,
          growthStars,
          userTurnCount,
          isAutoFollowUpAfterSilence: isAutoSilence,
          activeFlashcardContext: currentCard
            ? { koreanWord: currentCard.koreanWord, englishWord: currentCard.englishWord }
            : null,
          history: updatedHistory.map((m) => ({ role: m.role, text: m.text })),
          photos: allCatalogPhotos,
        });

        let reply = data.replyText || '우와~ 정말 신난다! 또 이야기해 줘!';

        // Build English Re-Ask Coach if suggested by Gemini (never on silence follow-up)
        let nextCoach: EnglishCoachPrompt | null = null;
        if (!isAutoSilence && data.shouldSuggestEnglishReask && data.englishPhrase?.trim()) {
          nextCoach = {
            englishPhrase: data.englishPhrase.trim(),
            koreanPhonetic: data.koreanPhonetic?.trim() || data.englishPhrase.trim(),
            nudgeText:
              data.englishNudgeText?.trim() ||
              `마이크에 대고 이렇게 영어로 말해볼래? "${data.englishPhrase.trim()}"`,
          };
        }

        // Build Giant Mid-Conversation Picture Flashcard ONLY when a child is actively talking (userTurnCount >= 2)
        let nextCard: BunnyFlashcard | null = null;
        if (
          !isAutoSilence &&
          userTurnCount >= 2 &&
          data.shouldShowFlashcard &&
          data.flashcardKorean &&
          data.flashcardEnglish
        ) {
          const cleanEn = data.flashcardEnglish.trim();
          const rawChoices = Array.isArray(data.flashcardChoices)
            ? data.flashcardChoices.filter(Boolean)
            : [];
          const mergedChoices = rawChoices.some(
            (c) => c.toLowerCase() === cleanEn.toLowerCase()
          )
            ? rawChoices.slice(0, 3)
            : [cleanEn, ...rawChoices.slice(0, 2)];
          while (mergedChoices.length < 3) {
            const filler = ['Apple', 'Sunny', 'Bunny', 'Star'][mergedChoices.length];
            if (!mergedChoices.includes(filler)) mergedChoices.push(filler);
          }

          nextCard = {
            id: `fc-ai-${Date.now()}`,
            koreanWord: data.flashcardKorean.trim(),
            englishWord: cleanEn,
            phonetic: data.flashcardPhonetic?.trim() || cleanEn,
            emoji: data.flashcardEmoji?.trim() || '⭐',
            hintText: data.flashcardHint?.trim() || '영어로 소리 내어 따라 말해볼까요?',
            exampleEn: data.flashcardExampleEn?.trim() || `It is ${cleanEn}!`,
            choices: mergedChoices,
            revealed: false,
          };
        } else if (
          !isAutoSilence &&
          !data.isPhotoMemoryQuery &&
          !nextCoach &&
          !currentCard &&
          userTurnCount >= 2 &&
          userTurnCount % 3 === 0
        ) {
          // Ensure natural occasional mid-conversation card tailored to the child's growth stage
          const autoStageCard = pickRandomFlashcard(undefined, childAgeStage);
          nextCard = autoStageCard;
          reply = `${reply} 참! 우리 이야기하다 생각났는데, 짜잔~ "${autoStageCard.koreanWord}"는 영어로 "${autoStageCard.phonetic}"라고 해! 같이 크게 말해볼래?`;
        }

        const spokenReply = nextCoach ? `${reply} ${nextCoach.nudgeText}` : reply;

        setBunnyHistories((prev) => ({
          ...prev,
          [bunnyId]: [
            ...(prev[bunnyId] ?? []),
            {
              id: `b-${Date.now()}`,
              role: 'bunny',
              bunnyId,
              text: nextCoach ? `${reply} (${nextCoach.nudgeText})` : reply,
              englishCoach: nextCoach,
              flashcard: nextCard,
            },
          ],
        }));

        setBunnies((prev) => ({
          ...prev,
          [bunnyId]: {
            ...prev[bunnyId],
            status: 'CHATTING',
            bubbleText: reply,
            isThinking: false,
            englishCoach: nextCoach,
            activeFlashcard: isAutoSilence
              ? null
              : nextCard ?? (prev[bunnyId]?.activeFlashcard?.revealed ? null : prev[bunnyId]?.activeFlashcard ?? null),
          },
        }));

        if (!isAutoSilence && data.isPhotoMemoryQuery) {
          const allPhotoObjects = albums.flatMap((a) => a.photos);
          const matchedIds = new Set(data.matchedPhotoIds ?? []);
          let matchedList = allPhotoObjects.filter((p) => matchedIds.has(p.id));

          if (matchedList.length === 0) {
            matchedList = allPhotoObjects.filter(
              (p) =>
                p.tags.some((tag) => text.includes(tag)) ||
                text.includes(p.location.slice(0, 2))
            );
          }

          if (matchedList[0]) {
            const frameIdx = activePhotos.findIndex((ap) => ap.id === matchedList[0].id);
            if (frameIdx >= 0) setCurrentPhotoIdx(frameIdx);
          }

          setActiveInquiry({
            category: 'photo_memories',
            headline:
              data.memoryHeadline || `${charCfg?.name || '토순이'}가 찾아준 우리 추억 사진`,
            spokenSummary: reply,
            matchedPhotos: matchedList,
            bunnySpeaker: charCfg?.voiceSpeaker ?? 'tosuni',
            bunnySpeakerName: charCfg?.name,
          });
          setSplitRemainingSeconds(120);
        }

        speakText(spokenReply, charCfg?.voiceSpeaker ?? 'tosuni', true, (speaking) => {
          setBunnySpeakingFlag(bunnyId, speaking);
          if (!speaking && nextCard) {
            // Model the English word aloud once right after introducing the giant card so the child can repeat it!
            speakEnglishPhrase(
              nextCard.englishWord,
              charCfg?.voiceSpeaker ?? 'tosuni',
              true,
              (enSpk) => setBunnySpeakingFlag(bunnyId, enSpk)
            );
          }
        });
      } catch {
        const fallback = '앗, 잠깐 귀가 간지러웠어! 한 번만 다시 말해줄래~?';
        setBunnies((prev) => ({
          ...prev,
          [bunnyId]: {
            ...prev[bunnyId],
            status: 'CHATTING',
            bubbleText: fallback,
            isThinking: false,
          },
        }));
        speakText(fallback, charCfg?.voiceSpeaker ?? 'tosuni', true, (speaking) =>
          setBunnySpeakingFlag(bunnyId, speaking)
        );
      }
    },
    [
      albums,
      activePhotos,
      bunnies,
      bunnyHistories,
      characters,
      childAgeStage,
      effectiveWeather,
      growthStars,
      setBunnySpeakingFlag,
    ]
  );

  // 1-Minute (60-Second) Patient Wait Timer during Active Child-Bunny Chat!
  // Waits a full 60s for the child to speak before gently continuing to the next conversational turn.
  const activeBunnyState = activeChatBunny ? bunnies[activeChatBunny] : null;
  const isActiveBunnyBusy = Boolean(
    activeBunnyState?.isThinking || activeBunnyState?.isSpeaking
  );

  useEffect(() => {
    if (!activeChatBunny || sleepState.sleeping) {
      setChatWaitSeconds(60);
      return;
    }
    if (isActiveBunnyBusy) {
      return;
    }

    const timer = window.setInterval(() => {
      setChatWaitSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeChatBunny, sleepState.sleeping, isActiveBunnyBusy]);

  useEffect(() => {
    if (!activeChatBunny || sleepState.sleeping || isActiveBunnyBusy) return;
    if (chatWaitSeconds > 0) return;

    if (silenceAutoCountRef.current === 0) {
      // 1 minute passed with no reply -> gently move on to a warm follow-up topic!
      silenceAutoCountRef.current = 1;
      setChatWaitSeconds(60);
      handleSendBunnyMessage(activeChatBunny, '', { isAutoFollowUpAfterSilence: true });
    } else {
      // 2 consecutive minutes with no reply -> child left, wrap up warmly and hop back out to play!
      const charCfg = characters.find((c) => c.id === activeChatBunny);
      const byeLine = '우리 친구 다른 놀이 하러 갔나 보다~! 이따가 심심할 때 또 불러줘!';
      speakText(byeLine, charCfg?.voiceSpeaker ?? 'tosuni', ttsEnabled);
      handleFinishBunnyChat(activeChatBunny);
    }
  }, [
    activeChatBunny,
    chatWaitSeconds,
    characters,
    handleFinishBunnyChat,
    handleSendBunnyMessage,
    isActiveBunnyBusy,
    sleepState.sleeping,
    ttsEnabled,
  ]);

  // Speak English Phrase / Word Aloud Clearly
  const handleSpeakEnglish = useCallback(
    (bunnyId: BunnyId, englishText: string) => {
      lastActivityRef.current = Date.now();
      setChatWaitSeconds(60);
      const charCfg = characters.find((c) => c.id === bunnyId);
      speakEnglishPhrase(englishText, charCfg?.voiceSpeaker ?? 'tosuni', true, (speaking) =>
        setBunnySpeakingFlag(bunnyId, speaking)
      );
    },
    [characters, setBunnySpeakingFlag]
  );

  // Handle Kid Answering a Mid-Chat Giant Flashcard (via Spoken Voice OR Last-Resort Fallback Button!)
  const handleAnswerFlashcard = useCallback(
    (bunnyId: BunnyId, choice: string) => {
      const charCfg = characters.find((c) => c.id === bunnyId);
      const b = bunnies[bunnyId];
      const card = b?.activeFlashcard;
      if (!card) return;

      lastActivityRef.current = Date.now();
      silenceAutoCountRef.current = 0;
      setChatWaitSeconds(60);

      const isCorrect = choice.toLowerCase() === card.englishWord.toLowerCase();
      if (isCorrect) {
        setGrowthStars((s) => s + 1);
      }

      const praiseMsg = isCorrect
        ? `딩동댕!! 정말 잘 말했어! "${card.koreanWord}"는 영어로 ${card.englishWord}, ${card.phonetic}이야! 최고야~!`
        : `우와 용기 있게 말했네! "${card.koreanWord}"는 영어로 ${card.englishWord}, ${card.phonetic}이야! 참 잘했어~`;

      setBunnies((prev) => ({
        ...prev,
        [bunnyId]: {
          ...prev[bunnyId],
          bubbleText: praiseMsg,
          activeFlashcard: {
            ...card,
            revealed: true,
            selectedChoice: choice,
          },
        },
      }));

      if (b.status === 'CHATTING') {
        setBunnyHistories((prev) => ({
          ...prev,
          [bunnyId]: [
            ...(prev[bunnyId] ?? []),
            { id: `u-fc-${Date.now()}`, role: 'user', text: `${choice}!` },
            { id: `b-fc-${Date.now() + 1}`, role: 'bunny', bunnyId, text: praiseMsg },
          ],
        }));
      }

      if (cardAutoDismissTimerRef.current !== null) {
        window.clearTimeout(cardAutoDismissTimerRef.current);
      }
      cardAutoDismissTimerRef.current = window.setTimeout(() => {
        handleDismissFlashcard(bunnyId);
      }, 4600);

      speakText(praiseMsg, charCfg?.voiceSpeaker ?? 'tosuni', true, (speaking) => {
        setBunnySpeakingFlag(bunnyId, speaking);
        if (!speaking) {
          speakEnglishPhrase(
            `${card.englishWord}! ${card.exampleEn}`,
            charCfg?.voiceSpeaker ?? 'tosuni',
            true,
            (enSpk) => setBunnySpeakingFlag(bunnyId, enSpk)
          );
        }
      });
    },
    [bunnies, characters, handleDismissFlashcard, setBunnySpeakingFlag]
  );

  // Instant Send Out / Call Home from Settings Character List
  const handleSendCharacterOutNow = useCallback(
    (bunnyId: BunnyId) => {
      const charCfg = characters.find((c) => c.id === bunnyId);
      if (!charCfg) return;
      setHasVillageAwakened(true);
      const nextOut = pickOutdoorStateForCharacter(
        charCfg,
        activePhotos.length,
        effectiveWeather
      );
      setBunnies((prev) => ({
        ...prev,
        [bunnyId]: {
          ...(prev[bunnyId] ?? { isSpeaking: false, isThinking: false }),
          status: nextOut.status,
          bubbleText: nextOut.bubbleText,
          isSpeaking: ttsEnabled,
          isThinking: false,
          photoIndex: nextOut.photoIndex,
          englishCoach: null,
          activeFlashcard: null,
        },
      }));
      if (ttsEnabled) {
        speakText(nextOut.bubbleText, charCfg.voiceSpeaker, true, (speaking) =>
          setBunnySpeakingFlag(bunnyId, speaking)
        );
      } else {
        playBunnyChime(charCfg.voiceSpeaker, true);
      }
    },
    [characters, activePhotos.length, effectiveWeather, setBunnySpeakingFlag, ttsEnabled]
  );

  const handleSendCharacterHomeNow = useCallback((bunnyId: BunnyId) => {
    setActiveChatBunny((curr) => (curr === bunnyId ? null : curr));
    setBunnies((prev) => {
      if (!prev[bunnyId] || prev[bunnyId].status === 'IN_HOUSE') return prev;
      return {
        ...prev,
        [bunnyId]: {
          ...prev[bunnyId],
          status: 'GOING_HOME',
          bubbleText: '집으로 총총 들어갈게~!',
          isSpeaking: false,
          isThinking: false,
          englishCoach: null,
          activeFlashcard: null,
        },
      };
    });
  }, []);

  const handleBunnyArrivedHome = useCallback((bunnyId: BunnyId) => {
    setBunnies((prev) => {
      if (!prev[bunnyId] || prev[bunnyId].status !== 'GOING_HOME') return prev;
      const nextStatus: BunnyBehaviorStatus = 'IN_HOUSE';
      return {
        ...prev,
        [bunnyId]: {
          ...prev[bunnyId],
          status: nextStatus,
          isSpeaking: false,
        },
      };
    });
  }, []);

  const handleReplayBunnyVoice = useCallback(
    (bunnyId: BunnyId) => {
      lastActivityRef.current = Date.now();
      const charCfg = characters.find((c) => c.id === bunnyId);
      const text = bunnies[bunnyId]?.bubbleText || charCfg?.greeting || '안녕~!';
      speakText(text, charCfg?.voiceSpeaker ?? 'tosuni', true, (speaking) =>
        setBunnySpeakingFlag(bunnyId, speaking)
      );
    },
    [bunnies, characters, setBunnySpeakingFlag]
  );

  // Celebration when child rolls the interactive 3D snowball to giant 260% completion!
  const handleSnowballCompleted = useCallback(() => {
    lastActivityRef.current = Date.now();
    const outdoorBunny = enabledCharacters.find(
      (c) => bunnies[c.id] && bunnies[c.id].status !== 'IN_HOUSE'
    );
    const cheerChar = outdoorBunny ?? enabledCharacters[0];
    if (cheerChar) {
      playBunnyChime(cheerChar.voiceSpeaker, ttsEnabled);
      setBunnies((prev) => {
        const cur = prev[cheerChar.id];
        if (!cur || cur.status === 'IN_HOUSE' || cur.status === 'CHATTING') return prev;
        return {
          ...prev,
          [cheerChar.id]: {
            ...cur,
            bubbleText: '우와아!! 대왕 눈덩이 완성!! 눈사람이 훨씬 더 멋져졌어~!',
          },
        };
      });
    }
    showTemporaryToast('대왕 눈덩이 완성! 눈사람이 한층 더 쑥쑥 자랐어요!');
  }, [bunnies, enabledCharacters, showTemporaryToast, ttsEnabled]);

  // Continuous Web Speech API Wake-Word, Spoken English Matching & Dynamic Character Call Recognition
  const recognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null);
  const startVoiceListeningSilentlyRef = useRef<() => void>(() => {});

  // Summon a Specific 3D Character -> Overhead Gemini Chat Bubble + Immediate Audible Voice + Auto-Enable Mic!
  const handleSummonBunny = useCallback(
    (bunnyId: BunnyId, silentGreeting = false) => {
      const charCfg = characters.find((c) => c.id === bunnyId);
      if (!charCfg) return;

      lastActivityRef.current = Date.now();
      silenceAutoCountRef.current = 0;
      setChatWaitSeconds(60);

      if (!charCfg.enabled) {
        setCharacters((prev) => prev.map((c) => (c.id === bunnyId ? { ...c, enabled: true } : c)));
      }

      setHasVillageAwakened(true);
      setActiveChatBunny(bunnyId);

      // Voice-first for children: automatically activate speech recognition if not already listening
      startVoiceListeningSilentlyRef.current();

      setBunnies((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((otherId) => {
          if (otherId !== bunnyId && next[otherId]?.status === 'CHATTING') {
            const otherCfg = characters.find((c) => c.id === otherId);
            const out = pickOutdoorStateForCharacter(
              otherCfg,
              activePhotos.length,
              effectiveWeather
            );
            next[otherId] = {
              ...next[otherId],
              status: out.status,
              bubbleText: out.bubbleText,
              isSpeaking: false,
              isThinking: false,
              photoIndex: out.photoIndex,
              englishCoach: null,
              activeFlashcard: null,
            };
          }
        });

        next[bunnyId] = {
          ...(next[bunnyId] ?? { photoIndex: 0 }),
          status: 'CHATTING',
          bubbleText: charCfg.greeting,
          isThinking: false,
          isSpeaking: !silentGreeting,
          englishCoach: null,
          activeFlashcard: null,
        };
        return next;
      });

      setBunnyHistories((prev) => {
        const existingThread = prev[bunnyId];
        if (existingThread && existingThread.length > 0) {
          return prev;
        }
        return {
          ...prev,
          [bunnyId]: [
            {
              id: `b-greet-${Date.now()}`,
              role: 'bunny',
              bunnyId,
              text: charCfg.greeting,
            },
          ],
        };
      });

      if (!silentGreeting) {
        if (!ttsEnabled) {
          setTtsEnabled(true);
        }
        showTemporaryToast(
          `🐰 ${charCfg.name} 지명 완료! ${charCfg.name} 목소리로 대화를 시작해요`
        );
        speakText(charCfg.greeting, charCfg.voiceSpeaker, true, (speaking) =>
          setBunnySpeakingFlag(bunnyId, speaking)
        );
      }
    },
    [characters, activePhotos.length, effectiveWeather, setBunnySpeakingFlag, showTemporaryToast, ttsEnabled]
  );

  // Quick Weather Reaction Cycle Button on Header so families/kids can test Sun / Rain / Snow (Snowman & Snowball Fight + Rollable Snowball) in 1 click!
  const handleQuickCycleWeatherReaction = () => {
    lastActivityRef.current = Date.now();
    const order: WeatherEffectMode[] = ['auto', 'sun', 'rain', 'snow'];
    const nextMode = order[(order.indexOf(weatherEffectMode) + 1) % order.length];
    setWeatherEffectMode(nextMode);
    setHasVillageAwakened(true);

    setBunnies((prev) => {
      const next = { ...prev };
      const targetKind = resolveWeatherKind(nextMode, weather?.current.iconKey);
      enabledCharacters.forEach((char, idx) => {
        const cur = next[char.id];
        if (cur?.status === 'CHATTING') return;
        if (targetKind === 'snow') {
          const snowRoles: OutdoorPlayStatus[] = [
            'BUILDING_SNOWMAN',
            'SNOWBALL_FIGHT',
            'ROLLING_SNOWBALL',
          ];
          const role = snowRoles[idx % snowRoles.length];
          next[char.id] = {
            ...(cur ?? { isSpeaking: false, isThinking: false, photoIndex: 0 }),
            status: role,
            bubbleText:
              role === 'BUILDING_SNOWMAN'
                ? '영차영차~ 당근 코 눈사람 만드는 중이야!'
                : role === 'SNOWBALL_FIGHT'
                ? '얍~! 포슬포슬 눈뭉치 간다! 신나는 눈싸움!'
                : '데구르르~ 눈덩이를 굴려봐! 점점 커진다~!',
            isSpeaking: false,
            isThinking: false,
            activeFlashcard: null,
          };
        } else if (!cur || cur.status === 'IN_HOUSE') {
          if (idx < 2) {
            next[char.id] = {
              ...(cur ?? { isSpeaking: false, isThinking: false, photoIndex: 0 }),
              status: targetKind === 'rain' ? 'SHELTERING_UNDER_TREE' : 'RESTING_ON_GRASS',
              bubbleText:
                targetKind === 'rain'
                  ? '비가 와서 커다란 나무 아래로 비 피하러 나왔어!'
                  : '날씨가 좋아서 잔디밭에 앉아 쉬러 나왔어~!',
              isSpeaking: false,
              isThinking: false,
              activeFlashcard: null,
            };
          }
        }
      });
      return next;
    });

    const labelMap: Record<WeatherEffectMode, string> = {
      auto: '실시간 날씨 연동 모드',
      sun: '맑음 모드 · 토끼들이 잔디밭에 앉아 쉬어요!',
      breeze: '산들바람 모드',
      rain: '비 내림 모드 · 토끼들이 나무 아래로 비를 피해요!',
      snow: '눈 내림 모드 · 눈사람 만들기 & 눈싸움! 바닥 눈덩이도 굴려보세요!',
      off: '효과 끔',
    };
    showTemporaryToast(labelMap[nextMode]);
  };

  const latestStateRef = useRef({
    wakeWord,
    characters,
    enabledCharacters,
    activeChatBunny,
    bunnies,
    awaitingWakeFollowUp,
    isVoiceListening,
    sleepSleeping: sleepState.sleeping,
    handleAssistantInquiry,
    handleSummonBunny,
    handleSendBunnyMessage,
    handleAnswerFlashcard,
    handleFinishBunnyChat,
    wakeTemporarilyFor30Min,
  });

  useEffect(() => {
    latestStateRef.current = {
      wakeWord,
      characters,
      enabledCharacters,
      activeChatBunny,
      bunnies,
      awaitingWakeFollowUp,
      isVoiceListening,
      sleepSleeping: sleepState.sleeping,
      handleAssistantInquiry,
      handleSummonBunny,
      handleSendBunnyMessage,
      handleAnswerFlashcard,
      handleFinishBunnyChat,
      wakeTemporarilyFor30Min,
    };
  });

  const processRecognizedTranscript = useCallback(
    (rawTranscript: string) => {
      const transcript = rawTranscript.trim();
      if (!transcript) return;

      lastActivityRef.current = Date.now();
      const s = latestStateRef.current;
      const compact = transcript.replace(/\s+/g, '');

      const getBunnyAliases = (char: BunnyCharacterConfig): string[] => {
        const cleanCall = char.callWord.replace(/[!?\s]/g, '');
        const cleanName = char.name.replace(/[!?\s]/g, '');
        const baseStem = cleanName.replace(/[이아]$/, '');
        const aliases = [cleanCall, cleanName];
        if (baseStem.length >= 2) {
          aliases.push(`${baseStem}아`, `${baseStem}야`, `${baseStem}이`);
        }
        // Common Korean STT homophones for kids calling bunnies
        if (char.id === 'tosuni') aliases.push('토수나', '토수니', '첫째토끼');
        if (char.id === 'tosili') aliases.push('토시라', '토시리', '둘째토끼');
        if (char.id === 'toddungi') aliases.push('토뚜아', '토뚱야', '막내토끼');
        if (char.id === 'tobyeori') aliases.push('토벼라', '토벼리', '별토끼');
        if (char.id === 'togureum') aliases.push('토구르마', '구름토끼');
        return Array.from(new Set(aliases.filter((w) => w.length >= 2)));
      };

      // Wake up screen if sleeping and someone calls wakeWord or ANY bunny!
      if (s.sleepSleeping) {
        const compactWake = s.wakeWord.replace(/\s+/g, '');
        const calledChar = s.characters.some((c) =>
          getBunnyAliases(c).some((alias) => compact.includes(alias))
        );
        if ((compactWake && compact.includes(compactWake)) || calledChar) {
          s.wakeTemporarilyFor30Min();
        } else {
          return;
        }
      }

      // 1. Check ALL 3D Characters (prioritize enabled, then auto-enable if user calls a resting bunny by name!)
      const orderedChars = [
        ...s.characters.filter((c) => c.enabled),
        ...s.characters.filter((c) => !c.enabled),
      ];
      for (const char of orderedChars) {
        const aliases = getBunnyAliases(char);
        const matchedAlias = aliases.find((a) => compact.includes(a));
        if (matchedAlias) {
          const escaped = aliases
            .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .sort((a, b) => b.length - a.length)
            .join('|');
          const pattern = new RegExp(escaped, 'g');
          const remainder = transcript
            .replace(pattern, '')
            .replace(/^[,!?.~\s랑하고에게야아]+/, '')
            .trim();
          if (remainder.length >= 2) {
            s.handleSummonBunny(char.id, true);
            s.handleSendBunnyMessage(char.id, remainder);
          } else {
            s.handleSummonBunny(char.id, false);
          }
          return;
        }
      }

      // 2. Check Custom AI Frame Wake Word
      const compactWake = s.wakeWord.replace(/\s+/g, '');
      if (compactWake && compact.includes(compactWake)) {
        const idx = compact.indexOf(compactWake);
        const afterCompact = compact.slice(idx + compactWake.length);
        if (afterCompact.length >= 2) {
          const cleanedQuery = transcript
            .replace(new RegExp(s.wakeWord.split(/\s+/).join('\\s*'), 'i'), '')
            .trim();
          setAwaitingWakeFollowUp(false);
          s.handleAssistantInquiry(cleanedQuery || transcript);
        } else {
          setAwaitingWakeFollowUp(true);
          showTemporaryToast(`"${s.wakeWord}" 호출됨! 날씨·일정·길안내를 말씀해 주세요.`);
          speakText(
            '네, 부르셨나요? 날씨나 일정, 목적지 소요시간을 말씀해 주세요.',
            'assistant',
            ttsEnabled
          );
        }
        return;
      }

      if (s.awaitingWakeFollowUp) {
        setAwaitingWakeFollowUp(false);
        s.handleAssistantInquiry(transcript);
        return;
      }

      // 3. Active Child-Bunny Voice Conversation (including Voice-First English Flashcard & English Re-Ask!)
      if (s.activeChatBunny) {
        if (/잘\s*놀아|대화\s*끝|그만\s*안녕|놀러\s*가/.test(transcript)) {
          s.handleFinishBunnyChat(s.activeChatBunny);
          return;
        }

        const activeState = s.bunnies[s.activeChatBunny];
        const openCard = activeState?.activeFlashcard;

        // 3a. If Giant Mid-Chat Flashcard is open, match spoken English OR Hangul pronunciation first!
        if (openCard && !openCard.revealed) {
          if (matchesSpokenEnglishAttempt(transcript, openCard.englishWord, openCard.phonetic)) {
            s.handleAnswerFlashcard(s.activeChatBunny, openCard.englishWord);
            return;
          }
          // Check if child spoke one of the other choices
          for (const ch of openCard.choices) {
            if (transcript.toLowerCase().includes(ch.toLowerCase())) {
              s.handleAnswerFlashcard(s.activeChatBunny, ch);
              return;
            }
          }
        }

        // 3b. If English Re-Ask Coach is active and child spoke the English phrase (or Hangul phonetic), reward a star!
        const coach = activeState?.englishCoach;
        if (
          coach &&
          matchesSpokenEnglishAttempt(transcript, coach.englishPhrase, coach.koreanPhonetic)
        ) {
          setGrowthStars((prev) => prev + 1);
          s.handleSendBunnyMessage(s.activeChatBunny, coach.englishPhrase);
          return;
        }

        s.handleSendBunnyMessage(s.activeChatBunny, transcript);
      }
    },
    [showTemporaryToast, ttsEnabled]
  );

  // Native Android SpeechRecognizer + Browser SpeechRecognition Dual Engine
  // Automatically pauses mic while a bunny speaks (TTS) and resumes listening right after TTS completes!
  const nativeSttRestartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearRestartTimer = () => {
      if (nativeSttRestartTimerRef.current !== null) {
        window.clearTimeout(nativeSttRestartTimerRef.current);
        nativeSttRestartTimerRef.current = null;
      }
    };

    const scheduleNativeListenResume = (delayMs = 320) => {
      clearRestartTimer();
      nativeSttRestartTimerRef.current = window.setTimeout(() => {
        nativeSttRestartTimerRef.current = null;
        if (!latestStateRef.current.isVoiceListening) return;
        if (isAnyTtsSpeaking()) return;
        const bridge = getAndroidSpeechBridge();
        if (bridge) {
          try {
            bridge.startListening('ko-KR');
          } catch {
            // Ignore bridge call error
          }
        } else if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {
            // Ignore already-running browser recognition
          }
        }
      }, delayMs);
    };

    const onNativeSttResult = (ev: Event) => {
      const detail = (ev as CustomEvent<{ transcript?: string; isFinal?: boolean }>).detail;
      if (detail?.isFinal && detail.transcript?.trim()) {
        processRecognizedTranscript(detail.transcript);
      }
    };

    const onNativeSttState = (ev: Event) => {
      const detail = (ev as CustomEvent<{ listening?: boolean; status?: string }>).detail;
      if (!detail) return;
      if (detail.status === 'not-allowed') {
        clearRestartTimer();
        setIsVoiceListening(false);
        showTemporaryToast('마이크 권한을 허용하면 토끼와 음성으로 대화할 수 있어요.');
        return;
      }
      if (detail.status === 'not-available') {
        clearRestartTimer();
        setIsVoiceListening(false);
        showTemporaryToast('기기에 음성 인식 서비스(Google 음성 서비스)가 설치되어 있지 않아요.');
        return;
      }
      if (!detail.listening && detail.status !== 'stopped') {
        if (latestStateRef.current.isVoiceListening && !isAnyTtsSpeaking()) {
          const backoff = detail.status === 'busy' ? 750 : 350;
          scheduleNativeListenResume(backoff);
        }
      }
    };

    const onTtsActivity = (ev: Event) => {
      const speaking = Boolean((ev as CustomEvent<{ speaking?: boolean }>).detail?.speaking);
      if (speaking) {
        clearRestartTimer();
        const bridge = getAndroidSpeechBridge();
        if (bridge) {
          try {
            bridge.stopListening();
          } catch {
            // Ignore stop error
          }
        } else if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {
            // Ignore browser stop error
          }
        }
      } else if (latestStateRef.current.isVoiceListening) {
        // Bunny finished speaking! Immediately re-open mic so the child can answer naturally
        scheduleNativeListenResume(260);
      }
    };

    window.addEventListener('nativeSttResult', onNativeSttResult as EventListener);
    window.addEventListener('nativeSttState', onNativeSttState as EventListener);
    window.addEventListener('kidsPhotoTtsActive', onTtsActivity as EventListener);
    return () => {
      clearRestartTimer();
      window.removeEventListener('nativeSttResult', onNativeSttResult as EventListener);
      window.removeEventListener('nativeSttState', onNativeSttState as EventListener);
      window.removeEventListener('kidsPhotoTtsActive', onTtsActivity as EventListener);
    };
  }, [processRecognizedTranscript, showTemporaryToast]);

  const startVoiceRecognitionEngine = useCallback(
    (showToastOnStart: boolean) => {
      // 1) Primary on Android APK: Native Android SpeechRecognizer Bridge
      const nativeBridge = getAndroidSpeechBridge();
      if (nativeBridge) {
        setIsVoiceListening(true);
        if (!isAnyTtsSpeaking()) {
          try {
            nativeBridge.startListening('ko-KR');
          } catch {
            // Will auto-retry after TTS or state callback
          }
        }
        if (showToastOnStart) {
          const callNames = enabledCharacters.map((c) => c.callWord).join('·');
          showTemporaryToast(
            `🎙️ 음성 대화 켜짐: "${callNames || '토순아'}" 하고 부르거나 바로 말해 보세요!`
          );
        }
        return;
      }

      // 2) Web / Desktop Fallback: W3C SpeechRecognition API
      const SpeechRecCtor =
        (
          window as unknown as {
            SpeechRecognition?: new () => BrowserSpeechRecognitionInstance;
            webkitSpeechRecognition?: new () => BrowserSpeechRecognitionInstance;
          }
        ).SpeechRecognition ||
        (
          window as unknown as {
            webkitSpeechRecognition?: new () => BrowserSpeechRecognitionInstance;
          }
        ).webkitSpeechRecognition;

      if (!SpeechRecCtor) {
        if (showToastOnStart) {
          showTemporaryToast(
            '이 브라우저에서는 음성 인식을 지원하지 않아 말풍선 입력창을 이용해 주세요.'
          );
        }
        return;
      }

      if (recognitionRef.current) return;

      try {
        const rec = new SpeechRecCtor();
        rec.lang = 'ko-KR';
        rec.continuous = true;
        rec.interimResults = false;

        rec.onresult = (event) => {
          if (isAnyTtsSpeaking()) return;
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              processRecognizedTranscript(event.results[i][0].transcript);
            }
          }
        };

        rec.onerror = (event) => {
          if (event.error === 'not-allowed') {
            setIsVoiceListening(false);
            recognitionRef.current = null;
            if (showToastOnStart) {
              showTemporaryToast('마이크 권한을 허용하면 음성 대화를 사용할 수 있습니다.');
            }
          }
        };

        rec.onend = () => {
          if (latestStateRef.current.isVoiceListening && !isAnyTtsSpeaking()) {
            try {
              rec.start();
            } catch {
              // Ignore restart race
            }
          }
        };

        if (!isAnyTtsSpeaking()) {
          rec.start();
        }
        recognitionRef.current = rec;
        setIsVoiceListening(true);
        if (showToastOnStart) {
          const callNames = enabledCharacters.map((c) => c.callWord).join('·');
          showTemporaryToast(
            `음성 대기 시작: "${wakeWord}"${callNames ? ` 또는 "${callNames}"` : ''}`
          );
        }
      } catch {
        if (showToastOnStart) {
          showTemporaryToast('음성 인식을 시작할 수 없습니다.');
        }
      }
    },
    [enabledCharacters, processRecognizedTranscript, showTemporaryToast, wakeWord]
  );

  useEffect(() => {
    startVoiceListeningSilentlyRef.current = () => {
      if (!latestStateRef.current.isVoiceListening) {
        startVoiceRecognitionEngine(false);
      }
    };
  }, [startVoiceRecognitionEngine]);

  const toggleVoiceListening = useCallback(() => {
    if (isVoiceListening) {
      setIsVoiceListening(false);
      if (nativeSttRestartTimerRef.current !== null) {
        window.clearTimeout(nativeSttRestartTimerRef.current);
        nativeSttRestartTimerRef.current = null;
      }
      const nativeBridge = getAndroidSpeechBridge();
      if (nativeBridge) {
        try {
          nativeBridge.stopListening();
        } catch {
          // Ignore stop error
        }
      }
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      return;
    }
    startVoiceRecognitionEngine(true);
  }, [isVoiceListening, startVoiceRecognitionEngine]);

  const cycleTransitionMode = () => {
    const order: FrameTransitionMode[] = ['ken_burns', 'frame_sway', 'gallery_matte', 'dual_split'];
    const next = order[(order.indexOf(transitionMode) + 1) % order.length];
    setTransitionMode(next);
  };

  const handleSelectPhotoOnFrame = (photo: PhotoItem) => {
    const idx = activePhotos.findIndex((p) => p.id === photo.id);
    if (idx >= 0) {
      setCurrentPhotoIdx(idx);
    } else {
      setAlbums((prev) => prev.map((a) => (a.id === photo.albumId ? { ...a, enabled: true } : a)));
      setCurrentPhotoIdx(0);
    }
  };

  const leftInsetPx =
    (menuPosition === 'left' ? 62 : 0) + (weatherPosition === 'left' ? 268 : 0);
  const rightInsetPx =
    (menuPosition === 'right' ? 62 : 0) + (weatherPosition === 'right' ? 268 : 0);

  const duplicatedTickerItems = useMemo(() => [...martItems, ...martItems], [martItems]);

  const menuRailNode = (
    <MenuRail
      wakeWord={wakeWord}
      isVoiceListening={isVoiceListening}
      ttsEnabled={ttsEnabled}
      powerScheduleEnabled={powerSchedule.enabled}
      onToggleVoiceListening={toggleVoiceListening}
      onToggleTts={() => setTtsEnabled((v) => !v)}
      onEnterManualSleep={() => enterSleepMode('manual_off')}
      onOpenSettings={(tab = 'characters') => setSettingsModalTab(tab)}
    />
  );

  const weatherPanelNode = (
    <LeftInfoSidebar
      weather={weather}
      isWeatherLoading={isWeatherLoading}
      schedules={schedules}
      onRefreshWeather={fetchWeather}
      onAddSchedule={(item) =>
        setSchedules((prev) => [{ ...item, id: `sched-${Date.now()}` }, ...prev])
      }
      onRemoveSchedule={(id) => setSchedules((prev) => prev.filter((s) => s.id !== id))}
      onOpenSettings={(tab = 'cloud') => setSettingsModalTab(tab)}
    />
  );

  const weatherModeBadgeText =
    weatherEffectMode === 'auto'
      ? '날씨반응: 자동'
      : weatherEffectMode === 'sun'
      ? '맑음·잔디휴식'
      : weatherEffectMode === 'rain'
      ? '비·나무대피'
      : weatherEffectMode === 'snow'
      ? '눈·눈사람/눈싸움'
      : '산들바람';

  return (
    <div className="h-screen w-screen p-2 sm:p-3.5 md:p-4 flex items-center justify-center overflow-hidden select-none">
      {/* Sleek Light Smart-Home Wall Tablet Shell */}
      <div className="relative w-full h-full rounded-[28px] bg-[#F3F4F6] border border-white/90 shadow-[0_24px_65px_rgba(20,21,25,0.18)] p-2.5 md:p-3 flex flex-col gap-2.5 overflow-hidden">
        {/* 1. Top Scrolling Ticker: Mart Mandatory Holidays & Sale Events */}
        <header
          aria-label="마트 휴무일 및 세일 이벤트 안내줄"
          className="h-9 rounded-2xl bg-white border border-black/[0.06] flex items-center justify-between px-3.5 shrink-0 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.02)]"
        >
          <div className="flex items-center gap-2 pr-3.5 border-r border-zinc-200 shrink-0 z-10 bg-white">
            <span className="w-5 h-5 rounded-full bg-[#141519] text-white flex items-center justify-center">
              <Megaphone className="w-3 h-3" />
            </span>
            <span className="text-xs font-bold text-[#141519] whitespace-nowrap">
              마트 휴무 · 세일
            </span>
          </div>

          <div className="flex-1 overflow-hidden mx-3">
            <div className="animate-ticker flex items-center gap-10 text-xs text-zinc-600">
              {duplicatedTickerItems.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="flex items-center gap-2 whitespace-nowrap">
                  <span
                    className={`font-bold ${
                      item.category === '휴무일' ? 'text-rose-600' : 'text-[#141519]'
                    }`}
                  >
                    {item.category}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#141519]">{item.storeName}</span>
                  <span aria-hidden="true">—</span>
                  <span>{item.content}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pl-3 border-l border-zinc-200 bg-white z-10">
            <button
              type="button"
              onClick={handleQuickCycleWeatherReaction}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-[#141519] transition-colors whitespace-nowrap"
              title="클릭하여 맑은 날 잔디 휴식 / 비 오는 날 나무 대피 / 눈 오는 날 눈사람·눈싸움·눈덩이 굴리기 전환"
            >
              {effectiveWeather === 'snow' ? (
                <CloudSnow className="w-3.5 h-3.5 text-sky-500" />
              ) : effectiveWeather === 'rain' ? (
                <CloudRain className="w-3.5 h-3.5 text-sky-600" />
              ) : effectiveWeather === 'sun' ? (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span>{weatherModeBadgeText}</span>
            </button>
            <span className="text-zinc-300" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => enterSleepMode('manual_off')}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-[#141519] transition-colors whitespace-nowrap"
              title="외출·부재 시 즉시 화면을 꺼서 전기료를 절약합니다"
            >
              <Moon className="w-3 h-3" />
              <span>외출 절전</span>
            </button>
            <span className="text-zinc-300" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => setSettingsModalTab('power')}
              className="text-[11px] font-semibold text-zinc-500 hover:text-[#141519] transition-colors whitespace-nowrap"
            >
              예약 켜짐
            </button>
          </div>
        </header>

        {/* 2. Configurable Main Smart-Home Body */}
        <main className="relative flex-1 min-h-0 flex gap-2.5 overflow-hidden">
          {menuPosition === 'left' && menuRailNode}
          {weatherPosition === 'left' && weatherPanelNode}

          {/* Main Digital Frame Stage (Full OR 50/50 Split on Inquiry) */}
          <div className="relative flex-1 min-w-0 h-full flex gap-2.5 overflow-hidden">
            <DigitalFrameStage
              photos={activePhotos}
              currentIndex={currentPhotoIdx}
              isPlaying={isPlaying && !sleepState.sleeping}
              transitionMode={transitionMode}
              isSplitActive={Boolean(activeInquiry)}
              wakeWord={wakeWord}
              isVoiceListening={isVoiceListening}
              isAssistantLoading={isAssistantLoading}
              onPrev={() =>
                setCurrentPhotoIdx((prev) =>
                  activePhotos.length > 0 ? (prev - 1 + activePhotos.length) % activePhotos.length : 0
                )
              }
              onNext={() =>
                setCurrentPhotoIdx((prev) =>
                  activePhotos.length > 0 ? (prev + 1) % activePhotos.length : 0
                )
              }
              onTogglePlay={() => setIsPlaying((v) => !v)}
              onCycleTransition={cycleTransitionMode}
              onOpenSettings={() => setSettingsModalTab('cloud')}
              onToggleVoiceListening={toggleVoiceListening}
              onSubmitAssistantQuery={handleAssistantInquiry}
            />

            {activeInquiry && (
              <SplitInquiryPanel
                inquiry={activeInquiry}
                remainingSeconds={splitRemainingSeconds}
                isLoading={isAssistantLoading}
                onExtendTimer={() => setSplitRemainingSeconds((s) => s + 60)}
                onCloseSplit={() => setActiveInquiry(null)}
                onFollowUpQuery={handleAssistantInquiry}
                onSelectMemoryPhoto={handleSelectPhotoOnFrame}
                onReplayVoice={() =>
                  speakText(
                    activeInquiry.spokenSummary,
                    activeInquiry.bunnySpeaker ?? 'assistant',
                    true
                  )
                }
              />
            )}

            {voiceToast && (
              <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 z-40 rounded-full bg-[#141519] px-4 py-1.5 text-xs font-semibold text-white shadow-lg whitespace-nowrap">
                {voiceToast}
              </div>
            )}
          </div>

          {weatherPosition === 'right' && weatherPanelNode}
          {menuPosition === 'right' && menuRailNode}
        </main>
      </div>

      {/* 3. Full-Screen Cute 3D Bunnies + Snowy Snowman/Snowball Fight/Rollable Snowball + Voice-First Giant Flashcard */}
      <Bunny3DOverlay
        characters={characters}
        bunnies={bunnies}
        bunnyHistories={bunnyHistories}
        activeChatBunny={activeChatBunny}
        chatWaitSeconds={chatWaitSeconds}
        isVoiceListening={isVoiceListening}
        isPaused={sleepState.sleeping}
        photos={activePhotos}
        weatherEffectMode={weatherEffectMode}
        liveWeatherIconKey={weather?.current.iconKey}
        leftInsetPx={leftInsetPx}
        rightInsetPx={rightInsetPx}
        onSummonBunny={(id) => handleSummonBunny(id, false)}
        onSendBunnyMessage={(id, msg) => handleSendBunnyMessage(id, msg)}
        onFinishBunnyChat={handleFinishBunnyChat}
        onReplayBunnyVoice={handleReplayBunnyVoice}
        onSpeakEnglish={handleSpeakEnglish}
        onAnswerFlashcard={handleAnswerFlashcard}
        onDismissFlashcard={handleDismissFlashcard}
        onSelectPhotoFromBunny={handleSelectPhotoOnFrame}
        onToggleVoiceMic={toggleVoiceListening}
        onBunnyArrivedHome={handleBunnyArrivedHome}
        onSnowballCompleted={handleSnowballCompleted}
      />

      {/* 4. Unified Settings Modal */}
      {settingsModalTab && (
        <SettingsAlbumModal
          initialTab={settingsModalTab}
          albums={albums}
          characters={characters}
          bunnies={bunnies}
          childAgeStage={childAgeStage}
          growthStars={growthStars}
          powerSchedule={powerSchedule}
          menuPosition={menuPosition}
          weatherPosition={weatherPosition}
          weatherEffectMode={weatherEffectMode}
          wakeWord={wakeWord}
          slideIntervalSec={slideIntervalSec}
          transitionMode={transitionMode}
          ttsEnabled={ttsEnabled}
          currentCity={locationInfo.city}
          martItems={martItems}
          onClose={() => setSettingsModalTab(null)}
          onAddAlbum={(newAlbum) => {
            const isSampleAlbum = newAlbum.id.startsWith('album-sample-');
            setAlbums((prev) => {
              const cleanedPrev = isSampleAlbum
                ? prev
                : prev.map((a) =>
                    a.id === 'album-gdrive-family-2026' ||
                    a.id === 'album-synology-camping-winter' ||
                    a.id.startsWith('album-sample-')
                      ? { ...a, enabled: false }
                      : a
                  );
              return [newAlbum, ...cleanedPrev];
            });
            setCurrentPhotoIdx(0);
          }}
          onToggleAlbum={(albumId) =>
            setAlbums((prev) =>
              prev.map((a) => (a.id === albumId ? { ...a, enabled: !a.enabled } : a))
            )
          }
          onDeleteAlbum={(albumId) =>
            setAlbums((prev) => prev.filter((a) => a.id !== albumId))
          }
          onUpdateCharacters={setCharacters}
          onChangeChildAgeStage={setChildAgeStage}
          onChangePowerSchedule={setPowerSchedule}
          onEnterSleepNow={() => {
            setSettingsModalTab(null);
            enterSleepMode('manual_off');
          }}
          onSendCharacterOutNow={handleSendCharacterOutNow}
          onSendCharacterHomeNow={handleSendCharacterHomeNow}
          onChangeMenuPosition={setMenuPosition}
          onChangeWeatherPosition={setWeatherPosition}
          onChangeWeatherEffectMode={setWeatherEffectMode}
          onChangeWakeWord={setWakeWord}
          onChangeSlideInterval={setSlideIntervalSec}
          onChangeTransitionMode={setTransitionMode}
          onChangeTtsEnabled={setTtsEnabled}
          onUpdateLocation={(city, lat, lng) => setLocationInfo({ city, lat, lng })}
          onUpdateMartItems={setMartItems}
        />
      )}

      {/* 5. Pitch-Black Power-Saving Screen-Off Overlay (Away / Night / Manual Sleep) */}
      {sleepState.sleeping && (
        <PowerSleepOverlay
          reason={sleepState.reason}
          schedule={powerSchedule}
          nextWakeLabel={nextScheduledWakeLabel}
          onWakeTemporarily={wakeTemporarilyFor30Min}
          onOpenPowerSettings={() => {
            wakeTemporarilyFor30Min();
            setSettingsModalTab('power');
          }}
        />
      )}
    </div>
  );
}
