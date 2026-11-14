import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { GoogleGenAI, Type } from '@google/genai';
import { pickRandomFlashcard } from '../data/englishFlashcards';
import {
  AssistantInquiryResult,
  ChildGrowthStage,
  EnglishFrequencyMode,
  GeminiVoiceMode,
  PhotoItem,
  RemoteFolderItem,
  ScheduleItem,
  StorageProvider,
  WeatherPayload,
} from '../types';
import {
  LOCATION_HIERARCHY_GROUPS,
  reverseGeocodeKoreaLatLng,
  stripKoreanAdminSuffix,
} from './koreaLocations';
import { computeKoreanMartHolidaySummary } from './martSchedule';

export const BACKEND_URL_STORAGE_KEY = 'kids_photo_backend_url';
export const GEMINI_KEY_STORAGE_KEY = 'kids_photo_gemini_api_key';
export const FRAME_SETTINGS_STORAGE_KEY = 'kids_photo_frame_settings_v1';
export const PHOTO_SYNC_CONFIG_STORAGE_KEY = 'kids_photo_sync_config_v1';
export const WEATHER_CACHE_STORAGE_KEY = 'kids_photo_weather_cache_v1';

export interface PhotoSyncConfig {
  /** Maximum number of latest photos to import per album sync (default 100, range 20..500) */
  maxPhotoFetchCount: number;
}

export function getSavedPhotoSyncConfig(): PhotoSyncConfig {
  try {
    const raw = localStorage.getItem(PHOTO_SYNC_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PhotoSyncConfig>;
      const clampedCount = Math.max(
        20,
        Math.min(500, Math.round(Number(parsed.maxPhotoFetchCount) || 100))
      );
      return {
        maxPhotoFetchCount: clampedCount,
      };
    }
  } catch {
    // Ignore storage read error
  }
  return { maxPhotoFetchCount: 100 };
}

export function savePhotoSyncConfig(cfg: PhotoSyncConfig): void {
  try {
    const safe: PhotoSyncConfig = {
      maxPhotoFetchCount: Math.max(20, Math.min(500, Math.round(cfg.maxPhotoFetchCount || 100))),
    };
    localStorage.setItem(PHOTO_SYNC_CONFIG_STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Ignore storage write error
  }
}

/**
 * Deterministic stable photo ID derived from albumId + unique cloud/file key.
 * Ensures existing photos keep their exact ID even when new photos are added to a folder,
 * eliminating redundant IndexedDB Vault re-optimization!
 */
export function buildStablePhotoId(albumId: string, stableSourceKey: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = stableSourceKey.trim();
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex = `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
  return `${albumId}-k-${hex}`;
}

export function inferTimestampFromNameOrDate(nameOrTitle?: string, dateStr?: string): number {
  if (nameOrTitle) {
    const m = nameOrTitle.match(/(20\d{2})[-_.년\s]?(0[1-9]|1[0-2])[-_.월\s]?(0[1-9]|[12]\d|3[01])/);
    if (m) {
      const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!Number.isNaN(t)) return t;
    }
  }
  if (dateStr) {
    const km = dateStr.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (km) {
      const t = Date.UTC(Number(km[1]), Number(km[2]) - 1, Number(km[3]));
      if (!Number.isNaN(t)) return t;
    }
    const parsed = Date.parse(dateStr);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/**
 * Selects up to `maxCount` photos strictly sorted by newest/latest first ("최신 사진 기준").
 */
export function selectLatestItems<T>(
  items: T[],
  options: {
    maxCount?: number;
    getTimestampMs?: (item: T, originalIndex: number) => number;
    /** Set false when provider returns oldest->newest by default (e.g. Google Photos HTML) and timestamps are absent */
    assumeReverseChronologicalWhenNoTimestamp?: boolean;
  } = {}
): T[] {
  if (items.length === 0) return [];
  const savedCfg = getSavedPhotoSyncConfig();
  const maxCount = Math.max(1, Math.min(500, options.maxCount ?? savedCfg.maxPhotoFetchCount));

  const decorated = items.map((item, idx) => ({
    item,
    idx,
    ts: options.getTimestampMs ? options.getTimestampMs(item, idx) : 0,
  }));

  const hasValidTimestamps = decorated.some((d) => d.ts > 0);
  if (hasValidTimestamps) {
    // Newest first (descending timestamp); tie-break by provider index
    decorated.sort((a, b) => {
      if (b.ts !== a.ts) return b.ts - a.ts;
      return a.idx - b.idx;
    });
  } else if (options.assumeReverseChronologicalWhenNoTimestamp === false) {
    // Provider lists oldest first (e.g. chronological album) -> reverse so newest are first!
    decorated.reverse();
  }

  return decorated.slice(0, maxCount).map((d) => d.item);
}

const PHOTO_SYNONYM_GROUPS: string[][] = [
  ['바다', '해변', '바닷가', '해수욕장', '모래사장', '파도', '제주', '갯벌', '물놀이', '수영', '바다·하늘'],
  ['산', '숲', '공원', '나무', '잔디', '산책', '소풍', '피크닉', '나들이', '자연', '숲·공원', '식물원'],
  ['캠핑', '글램핑', '텐트', '바베큐', '모닥불'],
  ['눈', '겨울', '눈사람', '눈썰매', '썰매', '스키', '설경', '눈밭', '눈·겨울'],
  ['꽃', '봄', '벚꽃', '유채꽃', '튤립', '꽃밭', '꽃놀이', '봄날'],
  ['단풍', '가을', '은행나무', '낙엽'],
  ['여름', '휴가', '수영장', '계곡', '튜브'],
  ['생일', '케이크', '촛불', '파티', '축하', '돌잔치'],
  ['놀이공원', '에버랜드', '롯데월드', '회전목마', '풍선', '동물원', '아쿠아리움'],
  ['웃는', '웃음', '미소', '행복', '신남', '신나는', '즐거운'],
  ['아이', '아기', '어린이', '단독', '독사진'],
  ['가족', '엄마', '아빠', '부모님', '할머니', '할아버지', '단체'],
  ['강아지', '멍멍이', '고양이', '야옹이', '토끼', '동물'],
  ['음식', '간식', '딸기', '아이스크림', '맛집', '카페'],
];

export function isPhotoSearchIntent(rawQuery: string): boolean {
  const q = rawQuery.trim();
  if (!q) return false;
  if (
    /사진|앨범|추억\s*(보여|찾아)|옛날\s*사진|과거\s*사진|찍은\s*거|어디서\s*찍|장소별|지역별/.test(q)
  ) {
    return true;
  }
  // Location-based memory request: e.g. "제주도 갔을 때 보여줘", "강릉에서 찍은 거", "에버랜드 여행"
  if (/[가-힣]{2,}(에서\s*찍|갔을\s*때|갔던\s*거|여행\s*갔)/.test(q)) {
    return true;
  }
  if (/(보여\s*줘|보여\s*줄래|찾아\s*줘|찾아\s*봐|틀어\s*줘|띄워\s*줘|꺼내\s*줘)/.test(q)) {
    if (!/날씨|기온|미세먼지|일정|스케줄|가는\s*길|얼마나\s*걸|마트|휴무/.test(q)) {
      return true;
    }
  }
  return false;
}

/**
 * Multi-photo smart Korean semantic, synonym & regional location hierarchy search engine.
 * Finds ALL matching photos (up to 200+) across location, EXIF GPS region, title, tags, objects, season, mood, people, date, albumName, and AI summary!
 */
export function searchPhotosSmart<
  T extends {
    id: string;
    title: string;
    date: string;
    location: string;
    albumName: string;
    tags: string[];
    aiSummary: string;
    season?: string;
    mood?: string;
    people?: string;
    objects?: string[];
  }
>(photos: T[], rawQuery: string, maxResults = 200): T[] {
  if (photos.length === 0) return [];
  const cleanQ = rawQuery.trim();
  if (!cleanQ) return photos.slice(0, maxResults);

  // Older / earlier photo query within imported photos
  if (/옛날|과거|어릴\s*때|예전|오래된|회상/.test(cleanQ)) {
    const tailCount = Math.max(2, Math.ceil(photos.length * 0.25));
    return photos.slice(-tailCount).reverse().slice(0, maxResults);
  }

  // Strip conversational filler words & Korean particles
  const stripped = cleanQ
    .replace(/[?!.,~"']/g, ' ')
    .replace(
      /(사진들?|앨범|보여\s*줘요?|보여\s*줄래요?|찾아\s*줘요?|찾아\s*봐줘?|틀어\s*줘요?|띄워\s*줘요?|꺼내\s*줘|다\s*찾아|모두|전부|언제야?|어디야?|갔던|갔을\s*때|찍은|찍었던|있어|있나|볼래|보고\s*싶어|여행)/g,
      ' '
    )
    .trim();

  const rawTokens = stripped
    .split(/\s+/)
    .map((tok) =>
      tok
        .replace(/(에서|으로|이랑|하고|부터|까지|에|의|을|를|이|가|은|는|도|만)$/g, '')
        .trim()
    )
    .filter((tok) => tok.length >= 1 && !/^(우리|내가|같이|제일|너무|진짜|좀|그거|저거|최근)$/.test(tok));

  // Expand synonyms + Korean administrative suffixes ("제주도" -> "제주") + regional location hierarchy!
  const expandedTerms = new Map<string, number>(); // term -> weight
  const addTermWithHierarchy = (termRaw: string, baseWeight: number) => {
    const low = termRaw.toLowerCase().trim();
    if (!low) return;
    expandedTerms.set(low, Math.max(expandedTerms.get(low) ?? 0, baseWeight));

    const rootLoc = stripKoreanAdminSuffix(low);
    if (rootLoc && rootLoc !== low && rootLoc.length >= 2) {
      expandedTerms.set(rootLoc, Math.max(expandedTerms.get(rootLoc) ?? 0, baseWeight));
    }

    for (const group of PHOTO_SYNONYM_GROUPS) {
      if (group.some((g) => low === g || (low.length >= 2 && (low.includes(g) || g.includes(low))))) {
        for (const syn of group) {
          if (!expandedTerms.has(syn)) expandedTerms.set(syn, 3);
        }
      }
    }

    for (const locGroup of LOCATION_HIERARCHY_GROUPS) {
      const checkRoot = rootLoc || low;
      // If user asked for broad province/city (index 0, e.g., "강원도", "제주도"), include all sub-cities!
      // Or if user asked for a specific landmark ("협재", "해운대"), match exact landmark + parent city weight!
      const hitParent =
        stripKoreanAdminSuffix(locGroup[0]) === checkRoot || locGroup[0] === low;
      const hitSub = locGroup.some(
        (place) => stripKoreanAdminSuffix(place) === checkRoot || place === low
      );
      if (hitParent) {
        for (const place of locGroup) {
          const pClean = stripKoreanAdminSuffix(place);
          expandedTerms.set(place.toLowerCase(), Math.max(expandedTerms.get(place.toLowerCase()) ?? 0, 5));
          if (pClean.length >= 2) {
            expandedTerms.set(pClean.toLowerCase(), Math.max(expandedTerms.get(pClean.toLowerCase()) ?? 0, 5));
          }
        }
      } else if (hitSub) {
        expandedTerms.set(checkRoot, Math.max(expandedTerms.get(checkRoot) ?? 0, 8));
      }
    }
  };

  for (const tok of rawTokens) {
    addTermWithHierarchy(tok, 7);
  }

  // Also check if full cleanQ directly hits any synonym or location group (attached words like "제주도사진", "강릉바다")
  for (const group of PHOTO_SYNONYM_GROUPS) {
    for (const kw of group) {
      if (cleanQ.includes(kw)) {
        addTermWithHierarchy(kw, 6);
      }
    }
  }
  for (const locGroup of LOCATION_HIERARCHY_GROUPS) {
    for (const locKw of locGroup) {
      const rootKw = stripKoreanAdminSuffix(locKw);
      if (cleanQ.includes(locKw) || (rootKw.length >= 2 && cleanQ.includes(rootKw))) {
        addTermWithHierarchy(locKw, 8);
      }
    }
  }

  if (expandedTerms.size === 0) {
    return photos.slice(0, Math.min(24, maxResults));
  }

  const scored = photos
    .map((p) => {
      const locField = `${p.location} ${p.albumName}`.toLowerCase();
      const primaryFields = [
        p.title,
        p.location,
        p.albumName,
        ...(p.tags ?? []),
        ...(p.objects ?? []),
        p.season ?? '',
        p.mood ?? '',
        p.people ?? '',
      ]
        .join(' ')
        .toLowerCase();
      const secondaryFields = `${p.date} ${p.aiSummary}`.toLowerCase();

      let score = 0;
      for (const [term, weight] of expandedTerms.entries()) {
        if (!term) continue;
        if (locField.includes(term)) {
          // Strong boost when photo's actual location or album name matches!
          score += weight * 3;
        } else if (primaryFields.includes(term)) {
          score += weight * 2;
        } else if (secondaryFields.includes(term)) {
          score += weight;
        }
      }
      return { photo: p, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map((s) => s.photo);
}

export function getBackendBaseUrl(): string {
  try {
    return (localStorage.getItem(BACKEND_URL_STORAGE_KEY) || '').trim().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function getSavedGeminiApiKey(): string {
  try {
    return (localStorage.getItem(GEMINI_KEY_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function saveGeminiApiKey(key: string): void {
  try {
    const cleaned = key.trim();
    if (cleaned) {
      localStorage.setItem(GEMINI_KEY_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(GEMINI_KEY_STORAGE_KEY);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kidsPhotoGeminiKeyUpdated'));
    }
  } catch {
    // ignore storage errors
  }
}

export async function checkGeminiVisionAvailable(): Promise<boolean> {
  if (getSavedGeminiApiKey().length > 8) return true;
  const health = await tryBackendJson<{ geminiConfigured?: boolean }>('/api/health', undefined, 3000);
  if (health.ok && health.data.geminiConfigured) return true;
  return false;
}

function getClientGemini(): GoogleGenAI | null {
  const apiKey = getSavedGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * Safely calls a backend JSON endpoint.
 * In Capacitor Android WebView, relative `/api/...` routes may return index.html (text/html)
 * when no backend server is running; we strictly verify JSON content-type so we cleanly fall back.
 */
export async function tryBackendJson<T>(
  endpointPath: string,
  init?: RequestInit,
  timeoutMs = 5500
): Promise<{ ok: true; data: T } | { ok: false; status?: number; errorMsg?: string }> {
  const base = getBackendBaseUrl();
  // On native Android without an explicit backend URL, there is no local Express server on localhost
  if (Capacitor.isNativePlatform() && !base) {
    return { ok: false };
  }

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${base}${endpointPath}`, {
      ...init,
      signal: controller.signal,
    });
    window.clearTimeout(timer);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return { ok: false, status: res.status };
    }

    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      return { ok: false, status: res.status, errorMsg: json?.error };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false };
  }
}

// ============================================================================
// 1. WEATHER & AIR QUALITY (Direct Open-Meteo + Backend Fallback)
// ============================================================================

function mapWeatherCodeToKorean(code: number): { label: string; iconKey: string } {
  if (code === 0) return { label: '맑음', iconKey: 'sun' };
  if (code === 1 || code === 2) return { label: '구름 조금', iconKey: 'partly-cloudy' };
  if (code === 3) return { label: '흐림', iconKey: 'cloudy' };
  if (code === 45 || code === 48) return { label: '안개', iconKey: 'fog' };
  if (code >= 51 && code <= 67) return { label: '비', iconKey: 'rain' };
  if (code >= 71 && code <= 77) return { label: '눈', iconKey: 'snow' };
  if (code >= 80 && code <= 82) return { label: '소나기', iconKey: 'rain' };
  if (code >= 85 && code <= 86) return { label: '눈보라', iconKey: 'snow' };
  if (code >= 95) return { label: '천둥번개', iconKey: 'storm' };
  return { label: '구름 조금', iconKey: 'partly-cloudy' };
}

function gradePm10(val: number): { grade: string; level: 'good' | 'normal' | 'bad' | 'very-bad' } {
  if (val <= 30) return { grade: '좋음', level: 'good' };
  if (val <= 80) return { grade: '보통', level: 'normal' };
  if (val <= 150) return { grade: '나쁨', level: 'bad' };
  return { grade: '매우나쁨', level: 'very-bad' };
}

function gradePm25(val: number): { grade: string; level: 'good' | 'normal' | 'bad' | 'very-bad' } {
  if (val <= 15) return { grade: '좋음', level: 'good' };
  if (val <= 35) return { grade: '보통', level: 'normal' };
  if (val <= 75) return { grade: '나쁨', level: 'bad' };
  return { grade: '매우나쁨', level: 'very-bad' };
}

export function getCachedWeatherSnapshot(): WeatherPayload | null {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherPayload;
    if (parsed && parsed.current && typeof parsed.current.temp === 'number') {
      return parsed;
    }
  } catch {
    // Ignore cache parse error
  }
  return null;
}

function saveCachedWeatherSnapshot(payload: WeatherPayload): void {
  try {
    localStorage.setItem(WEATHER_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage error
  }
}

export async function fetchWeatherUnified(
  lat: number,
  lng: number,
  city: string
): Promise<WeatherPayload | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    city,
  });
  const backend = await tryBackendJson<WeatherPayload>(`/api/weather?${params.toString()}`);
  if (backend.ok && backend.data?.current) {
    const enriched: WeatherPayload = {
      ...backend.data,
      weatherSource: backend.data.weatherSource || '기상청(KMA) · Open-Meteo (서버 연동)',
      airSource: backend.data.airSource || '환경부 기준 · Open-Meteo CAMS',
      syncIntervalMinutes: 10,
      updatedAt: new Date().toISOString(),
    };
    saveCachedWeatherSnapshot(enriched);
    return enriched;
  }

  type OpenMeteoForecastJson = {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      relative_humidity_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
    };
    daily?: {
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
    };
  };

  const isInKoreaBounds = lat >= 32.5 && lat <= 39.0 && lng >= 124.0 && lng <= 132.0;
  const baseForecastParams = `latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=3`;
  const kmaWeatherUrl = `https://api.open-meteo.com/v1/forecast?${baseForecastParams}&models=kma_seamless`;
  const globalWeatherUrl = `https://api.open-meteo.com/v1/forecast?${baseForecastParams}`;
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;

  try {
    let wData: OpenMeteoForecastJson | undefined;
    let weatherSourceLabel = 'Open-Meteo 글로벌 기상모델';

    if (isInKoreaBounds) {
      try {
        const kmaRes = await rawGet(kmaWeatherUrl, { Accept: 'application/json' }, 9500);
        const kmaJson = kmaRes.json as OpenMeteoForecastJson | undefined;
        if (kmaRes.status >= 200 && kmaRes.status < 300 && typeof kmaJson?.current?.temperature_2m === 'number') {
          wData = kmaJson;
          weatherSourceLabel = '기상청(KMA) · Open-Meteo';
        }
      } catch {
        // Fallback to standard Open-Meteo endpoint below
      }
    }

    if (!wData) {
      const stdRes = await rawGet(globalWeatherUrl, { Accept: 'application/json' }, 9500);
      const stdJson = stdRes.json as OpenMeteoForecastJson | undefined;
      if (stdRes.status >= 200 && stdRes.status < 300 && typeof stdJson?.current?.temperature_2m === 'number') {
        wData = stdJson;
        weatherSourceLabel = isInKoreaBounds ? '기상청(KMA)·ECMWF · Open-Meteo' : 'Open-Meteo 기상예보 API';
      }
    }

    if (!wData || !wData.current || typeof wData.current.temperature_2m !== 'number') {
      return getCachedWeatherSnapshot();
    }

    // Fetch Air Quality independently so an air-quality API hiccup NEVER blocks weather sync!
    let pm10 = 24;
    let pm25 = 12;
    let airSourceLabel = '환경부 기준 · Open-Meteo CAMS';
    try {
      const aRes = await rawGet(airUrl, { Accept: 'application/json' }, 7500);
      const aData = aRes.json as { current?: { pm10?: number; pm2_5?: number } } | undefined;
      if (aRes.status >= 200 && aRes.status < 300 && aData?.current) {
        if (typeof aData.current.pm10 === 'number') pm10 = Math.round(aData.current.pm10);
        if (typeof aData.current.pm2_5 === 'number') pm25 = Math.round(aData.current.pm2_5);
      } else {
        const prev = getCachedWeatherSnapshot();
        if (prev?.airQuality) {
          pm10 = prev.airQuality.pm10;
          pm25 = prev.airQuality.pm25;
        }
      }
    } catch {
      const prev = getCachedWeatherSnapshot();
      if (prev?.airQuality) {
        pm10 = prev.airQuality.pm10;
        pm25 = prev.airQuality.pm25;
      }
      airSourceLabel = '환경부 기준 · 최근 측정 캐시';
    }

    const cur = wData.current;
    const daily = wData.daily ?? {};
    const currentMapped = mapWeatherCodeToKorean(cur.weather_code ?? 1);
    const tomorrowMapped = mapWeatherCodeToKorean(daily.weather_code?.[1] ?? 1);
    const pm10Info = gradePm10(pm10);
    const pm25Info = gradePm25(pm25);

    const curTemp = cur.temperature_2m ?? 18;
    const payload: WeatherPayload = {
      city,
      lat,
      lng,
      current: {
        temp: Math.round(curTemp),
        feelsLike: Math.round(cur.apparent_temperature ?? curTemp),
        humidity: Math.round(cur.relative_humidity_2m ?? 50),
        windSpeed: Math.round((cur.wind_speed_10m ?? 1.5) * 10) / 10,
        condition: currentMapped.label,
        iconKey: currentMapped.iconKey,
        todayMin: Math.round(daily.temperature_2m_min?.[0] ?? curTemp - 3),
        todayMax: Math.round(daily.temperature_2m_max?.[0] ?? curTemp + 4),
      },
      tomorrow: {
        minTemp: Math.round(daily.temperature_2m_min?.[1] ?? 8),
        maxTemp: Math.round(daily.temperature_2m_max?.[1] ?? 17),
        rainChance: Math.round(daily.precipitation_probability_max?.[1] ?? 10),
        condition: tomorrowMapped.label,
        iconKey: tomorrowMapped.iconKey,
      },
      airQuality: {
        pm10,
        pm10Grade: pm10Info.grade,
        pm10Level: pm10Info.level,
        pm25,
        pm25Grade: pm25Info.grade,
        pm25Level: pm25Info.level,
      },
      weatherSource: weatherSourceLabel,
      airSource: airSourceLabel,
      syncIntervalMinutes: 10,
      updatedAt: new Date().toISOString(),
    };

    saveCachedWeatherSnapshot(payload);
    return payload;
  } catch {
    return getCachedWeatherSnapshot();
  }
}

// ============================================================================
// 2. GEOCODING & ROUTING (KOREA_LANDMARKS + Nominatim + OSRM)
// ============================================================================

const KOREA_LANDMARKS: Record<string, { lat: number; lng: number; name: string }> = {
  서울: { lat: 37.5665, lng: 126.978, name: '서울특별시 시청' },
  서울역: { lat: 37.5547, lng: 126.9707, name: '서울역' },
  강남: { lat: 37.4979, lng: 127.0276, name: '서울 강남역' },
  강남역: { lat: 37.4979, lng: 127.0276, name: '서울 강남역' },
  코엑스: { lat: 37.5116, lng: 127.0595, name: '삼성동 코엑스' },
  잠실: { lat: 37.5133, lng: 127.1001, name: '잠실 롯데월드타워' },
  롯데월드: { lat: 37.5111, lng: 127.0982, name: '잠실 롯데월드' },
  여의도: { lat: 37.5219, lng: 126.9245, name: '여의도 한강공원' },
  서울숲: { lat: 37.5444, lng: 127.0374, name: '성수동 서울숲' },
  에버랜드: { lat: 37.2939, lng: 127.2025, name: '용인 에버랜드' },
  판교: { lat: 37.3948, lng: 127.1112, name: '성남 판교역' },
  분당: { lat: 37.3827, lng: 127.1189, name: '성남 분당구 서현역' },
  광교: { lat: 37.2847, lng: 127.0444, name: '수원 광교호수공원' },
  동탄: { lat: 37.2006, lng: 127.095, name: '화성 동탄역' },
  일산: { lat: 37.6584, lng: 126.77, name: '고양 일산호수공원' },
  송도: { lat: 37.3925, lng: 126.639, name: '인천 송도센트럴파크' },
  인천: { lat: 37.4563, lng: 126.7052, name: '인천광역시청' },
  인천공항: { lat: 37.4602, lng: 126.4407, name: '인천국제공항' },
  수원: { lat: 37.2636, lng: 127.0286, name: '수원시청' },
  가평: { lat: 37.8315, lng: 127.5095, name: '가평 자라섬·숲속캠핑장' },
  춘천: { lat: 37.8813, lng: 127.7298, name: '춘천 명동' },
  속초: { lat: 38.207, lng: 128.5918, name: '속초 해수욕장' },
  강릉: { lat: 37.7519, lng: 128.8761, name: '강릉 경포대' },
  평창: { lat: 37.6547, lng: 128.6708, name: '평창 대관령 눈썰매장' },
  세종: { lat: 36.48, lng: 127.289, name: '세종특별자치시' },
  대전: { lat: 36.3504, lng: 127.3845, name: '대전광역시청' },
  전주: { lat: 35.8147, lng: 127.1526, name: '전주 한옥마을' },
  광주: { lat: 35.1595, lng: 126.8526, name: '광주광역시청' },
  여수: { lat: 34.7604, lng: 127.6622, name: '여수 밤바다 해양공원' },
  대구: { lat: 35.8714, lng: 128.6014, name: '대구광역시청' },
  경주: { lat: 35.8347, lng: 129.2194, name: '경주 황리단길·첨성대' },
  울산: { lat: 35.5384, lng: 129.3114, name: '울산광역시청' },
  부산: { lat: 35.1796, lng: 129.0756, name: '부산광역시청' },
  해운대: { lat: 35.1587, lng: 129.1604, name: '부산 해운대 해수욕장' },
  제주: { lat: 33.4996, lng: 126.5312, name: '제주시' },
  협재: { lat: 33.3943, lng: 126.2397, name: '제주 협재 해수욕장' },
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function geocodeCityUnified(
  query: string
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const cleaned = query.trim();
  if (!cleaned) return null;

  const backend = await tryBackendJson<{ lat: number; lng: number; displayName: string }>(
    `/api/geocode?q=${encodeURIComponent(cleaned)}`
  );
  if (backend.ok) return backend.data;

  for (const [key, coords] of Object.entries(KOREA_LANDMARKS)) {
    if (cleaned.includes(key)) {
      return { lat: coords.lat, lng: coords.lng, displayName: coords.name };
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko&q=${encodeURIComponent(cleaned)}`;
    if (Capacitor.isNativePlatform()) {
      const nRes = await CapacitorHttp.get({
        url,
        headers: { 'User-Agent': 'TosuniSmartFrame/1.0' },
      });
      const arr = Array.isArray(nRes.data) ? nRes.data : [];
      if (arr[0]) {
        return {
          lat: parseFloat(arr[0].lat),
          lng: parseFloat(arr[0].lon),
          displayName: String(arr[0].display_name || cleaned).split(',')[0].trim(),
        };
      }
    } else {
      const res = await fetch(url);
      if (res.ok) {
        const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
        if (arr[0]) {
          return {
            lat: parseFloat(arr[0].lat),
            lng: parseFloat(arr[0].lon),
            displayName: arr[0].display_name.split(',')[0].trim(),
          };
        }
      }
    }
  } catch {
    // ignore geocode failure
  }
  return null;
}

// ============================================================================
// 3. AI SMART FRAME ASSISTANT (Backend -> Client Gemini -> Smart Local Engine)
// ============================================================================

export async function askAssistantUnified(params: {
  query: string;
  currentCity: string;
  currentLat: number;
  currentLng: number;
  weatherSummary: WeatherPayload | null;
  schedules: ScheduleItem[];
  photos?: PhotoItem[];
}): Promise<AssistantInquiryResult> {
  // Fast Multi-Photo Memory Search when user asks to find/show specific photos or locations!
  if (params.photos && params.photos.length > 0 && isPhotoSearchIntent(params.query)) {
    const matched = searchPhotosSmart(params.photos, params.query, 200);
    if (matched.length > 0) {
      const first = matched[0];
      const uniqueLocs = Array.from(new Set(matched.map((p) => p.location).filter(Boolean))).slice(0, 4);
      const locHeadline = uniqueLocs.length > 0 ? ` (${uniqueLocs.join(' · ')})` : '';
      return {
        category: 'photo_memories',
        headline: `요청하신 추억 사진 총 ${matched.length}장을 찾았습니다${locHeadline}`,
        spokenSummary:
          matched.length === 1
            ? `찾으시는 "${first.location}" 추억 사진 1장을 찾아 액자에 띄워드렸어요!`
            : `찾으시는 사진 총 ${matched.length}장을 모두 찾아 메인 액자에서 연속으로 재생해 드릴게요! 첫 번째 사진은 ${first.date} "${first.location}"에서 찍은 "${first.title}"입니다.`,
        detailMarkdown: matched
          .slice(0, 12)
          .map((p, idx) => `${idx + 1}. **${p.title}** (${p.date} · 📍${p.location})`)
          .join('\n'),
        matchedPhotos: matched,
      };
    }
  }

  const backend = await tryBackendJson<AssistantInquiryResult>('/api/gemini/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }, 8500);
  if (backend.ok) return backend.data;

  const ai = getClientGemini();
  if (ai) {
    try {
      const intentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `현재 사용자 위치: ${params.currentCity} (${params.currentLat}, ${params.currentLng})
현재 날씨 데이터: ${JSON.stringify(params.weatherSummary ?? {})}
등록된 가족 일정: ${JSON.stringify(params.schedules)}
사용자 음성 질문: "${params.query}"

사용자의 질문을 분석하여 스마트 디지털 액자의 반쪽 브리핑 화면에 표시할 정보를 작성해 주세요.
- 목적지 이동, 길안내, 소요시간 질문이면 category를 "directions"로 설정하고 출발지(기본 "${params.currentCity}")와 목적지, 자동차·대중교통·도보 예상 소요시간(분)과 거리(km)를 채워 주세요.
- 날씨나 미세먼지 질문이면 category를 "weather"로 설정하세요.
- 일정 관련 질문이면 category를 "schedule"로 설정하세요.
- 그 외 생활 질문이면 category를 "general"로 설정하세요.
spokenSummary는 음성으로 읽어줄 다정한 한국어 2~3문장 요약입니다.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              headline: { type: Type.STRING },
              spokenSummary: { type: Type.STRING },
              detailMarkdown: { type: Type.STRING },
              originName: { type: Type.STRING },
              destinationName: { type: Type.STRING },
              distanceKm: { type: Type.NUMBER },
              drivingMinutes: { type: Type.INTEGER },
              drivingRouteSummary: { type: Type.STRING },
              drivingTip: { type: Type.STRING },
              transitMinutes: { type: Type.INTEGER },
              transitRouteSummary: { type: Type.STRING },
              transitTransfers: { type: Type.INTEGER },
              walkingMinutes: { type: Type.INTEGER },
              walkingRouteSummary: { type: Type.STRING },
              destinationHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['category', 'headline', 'spokenSummary', 'detailMarkdown'],
          },
        },
      });
      const parsed = JSON.parse((intentResponse.text ?? '{}').trim()) as AssistantInquiryResult;
      if (parsed.headline && parsed.spokenSummary) {
        return parsed;
      }
    } catch {
      // Fall through to local offline-capable smart engine
    }
  }

  // Built-in Smart Local Assistant (works 100% without API key!)
  const q = params.query.trim();
  const w = params.weatherSummary;

  if (/날씨|기온|온도|비\s*와|눈\s*와|추워|더워|미세먼지|우산/.test(q)) {
    const temp = w?.current.temp ?? 15;
    const cond = w?.current.condition ?? '맑음';
    const pm10Grade = w?.airQuality.pm10Grade ?? '좋음';
    const tomorrowCond = w?.tomorrow.condition ?? '맑음';
    const rainChance = w?.tomorrow.rainChance ?? 10;
    return {
      category: 'weather',
      headline: `${params.currentCity} 실시간 날씨 · 미세먼지 브리핑`,
      spokenSummary: `현재 ${params.currentCity} 날씨는 ${cond}, 기온은 ${temp}도이며 미세먼지는 ${pm10Grade} 수준입니다. 내일은 ${tomorrowCond}, 강수확률은 ${rainChance}%로 예상됩니다.`,
      detailMarkdown: `• 현재 기온: ${temp}°C (체감 ${w?.current.feelsLike ?? temp}°C)\n• 하늘 상태: ${cond} / 습도 ${w?.current.humidity ?? 50}%\n• 미세먼지: PM10 ${w?.airQuality.pm10 ?? 25} (${pm10Grade}) · 초미세먼지 ${w?.airQuality.pm25Grade ?? '좋음'}\n• 내일 예보: ${tomorrowCond} (${w?.tomorrow.minTemp ?? 9}° ~ ${w?.tomorrow.maxTemp ?? 18}°, 강수확률 ${rainChance}%)`,
      destinationHighlights: [
        pm10Grade.includes('나쁨') ? '외출 시 어린이용 마스크를 챙겨 주세요.' : '공기가 깨끗해 아이와 산책하기 좋은 날입니다!',
        rainChance >= 40 ? '비 소식이 있으니 작은 우산을 준비해 주세요.' : '우산 없이 가볍게 외출하셔도 좋습니다.',
      ],
    };
  }

  if (/일정|스케줄|약속|오늘\s*뭐|언제/.test(q) && !/어디\s*갔|사진/.test(q)) {
    const listText =
      params.schedules.length > 0
        ? params.schedules.map((s) => `• [${s.date} ${s.time}] ${s.title}${s.location ? ` (${s.location})` : ''}`).join('\n')
        : '• 등록된 오늘 일정이 없습니다.';
    return {
      category: 'schedule',
      headline: '우리 가족 예정 일정 브리핑',
      spokenSummary:
        params.schedules.length > 0
          ? `현재 등록된 가족 일정은 총 ${params.schedules.length}건입니다. 첫 번째 일정은 ${params.schedules[0].time} ${params.schedules[0].title}입니다.`
          : '현재 등록된 가족 일정이 없어요. 여유롭고 즐거운 하루 보내세요!',
      detailMarkdown: listText,
    };
  }

  if (/얼마나\s*걸|가는\s*길|가는\s*법|어떻게\s*가|거리|출발|도착|역까지|까지/.test(q)) {
    let targetPlace = q
      .replace(/까지|가는\s*길|가는\s*법|어떻게\s*가.*|얼마나\s*걸.*|알려\s*줘|자동차로|대중교통으로/g, '')
      .trim();
    if (!targetPlace) targetPlace = '강남역';
    const dest = await geocodeCityUnified(targetPlace);
    if (dest) {
      let roadKm = Math.round(haversineKm(params.currentLat, params.currentLng, dest.lat, dest.lng) * 1.32 * 10) / 10;
      let driveMin = Math.max(8, Math.round((roadKm / 35) * 60));
      try {
        const osrmRes = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${params.currentLng},${params.currentLat};${dest.lng},${dest.lat}?overview=false`
        );
        if (osrmRes.ok) {
          const osrmData = (await osrmRes.json()) as { routes?: Array<{ distance: number; duration: number }> };
          if (osrmData.routes?.[0]) {
            roadKm = Math.round((osrmData.routes[0].distance / 1000) * 10) / 10;
            driveMin = Math.max(5, Math.round((osrmData.routes[0].duration / 60) * 1.25));
          }
        }
      } catch {
        // use haversine estimate
      }
      const transitMin = Math.max(12, Math.round(driveMin * 1.35 + 8));
      const walkMin = Math.max(10, Math.round((roadKm / 4.2) * 60));
      return {
        category: 'directions',
        headline: `${dest.displayName} 이동 소요시간 안내`,
        spokenSummary: `${params.currentCity}에서 ${dest.displayName}까지 거리는 약 ${roadKm}km이며, 자동차로 약 ${driveMin}분, 대중교통으로 약 ${transitMin}분 걸립니다.`,
        detailMarkdown: `${params.currentCity} 출발 → ${dest.displayName} 도착 기준 실시간 경로 계산 결과입니다.`,
        originName: params.currentCity,
        destinationName: dest.displayName,
        distanceKm: roadKm,
        drivingMinutes: driveMin,
        drivingRouteSummary: '주요 간선도로 및 도시고속도로 추천 경로',
        drivingTip: '출퇴근 시간대에는 10~15분 여유 있게 출발하세요.',
        transitMinutes: transitMin,
        transitRouteSummary: '인근 지하철/간선버스 환승 경로',
        transitTransfers: 1,
        walkingMinutes: walkMin,
        walkingRouteSummary: roadKm <= 2.5 ? '아이와 산책하며 걸어가기 좋은 거리입니다.' : '도보 이동보다는 차량이나 대중교통을 권장합니다.',
      };
    }
  }

  const now = new Date();
  const timeStr = `${now.getHours()}시 ${now.getMinutes()}분`;
  return {
    category: 'general',
    headline: '토순이네 스마트 액자 AI 안내',
    spokenSummary: `지금 시각은 ${timeStr}이고, ${params.currentCity} 기온은 ${w?.current.temp ?? 15}도입니다. 날씨, 가족 일정, 목적지 소요시간을 물어보시거나 3D 토끼 친구들에게 말을 걸어보세요!`,
    detailMarkdown: `• 질문 내용: "${q}"\n• 현재 시각: ${timeStr}\n• 현재 날씨: ${w?.current.condition ?? '맑음'} (${w?.current.temp ?? 15}°C)\n• 💡 더 똑똑한 자유 대화를 원하시면 [설정 → AI 호출 명령어 · 음성]에서 무료 Gemini API 키를 입력하실 수 있습니다.`,
  };
}

// ============================================================================
// 4. 3D BUNNY CHAT (Backend -> Client Gemini -> Smart Kid-Friendly Engine)
// ============================================================================

export interface BunnyChatReplyPayload {
  replyText?: string;
  isPhotoMemoryQuery?: boolean;
  matchedPhotoIds?: string[];
  memoryHeadline?: string;
  shouldSuggestEnglishReask?: boolean;
  englishPhrase?: string;
  koreanPhonetic?: string;
  englishNudgeText?: string;
  shouldShowFlashcard?: boolean;
  flashcardKorean?: string;
  flashcardEnglish?: string;
  flashcardPhonetic?: string;
  flashcardEmoji?: string;
  flashcardHint?: string;
  flashcardExampleEn?: string;
  flashcardChoices?: string[];
}

export async function askBunnyChatUnified(params: {
  bunnyId: string;
  characterName?: string;
  characterPersona?: string;
  userMessage: string;
  weatherCondition: string;
  childAgeStage: ChildGrowthStage;
  englishFrequency?: EnglishFrequencyMode;
  allowEnglishThisTurn?: boolean;
  geminiVoiceMode?: GeminiVoiceMode;
  growthStars: number;
  userTurnCount: number;
  isAutoFollowUpAfterSilence: boolean;
  activeFlashcardContext: { koreanWord: string; englishWord: string } | null;
  history: Array<{ role: 'user' | 'bunny'; text: string }>;
  currentFramePhoto?: {
    id: string;
    title: string;
    date: string;
    location: string;
    albumName: string;
    tags: string[];
    aiSummary: string;
  } | null;
  currentFrameThumbBase64?: string | null;
  photos: Array<{
    id: string;
    title: string;
    date: string;
    location: string;
    albumName: string;
    tags: string[];
    aiSummary: string;
    assetUrl?: string;
  }>;
}): Promise<BunnyChatReplyPayload> {
  const englishFreq: EnglishFrequencyMode = params.englishFrequency ?? 'rare';
  const allowEnglish =
    !params.isAutoFollowUpAfterSilence &&
    englishFreq !== 'off' &&
    (params.allowEnglishThisTurn ?? false);

  const backend = await tryBackendJson<BunnyChatReplyPayload>(
    '/api/gemini/bunny-chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, englishFrequency: englishFreq, allowEnglishThisTurn: allowEnglish }),
    },
    9000
  );
  if (backend.ok && backend.data.replyText) {
    if (!allowEnglish) {
      return {
        ...backend.data,
        shouldSuggestEnglishReask: false,
        shouldShowFlashcard: false,
      };
    }
    return backend.data;
  }

  const trimmedMsg = params.userMessage.trim();
  const name = params.characterName || '토순이';
  const userSpokeEnglish =
    /[a-zA-Z]{2,}/.test(trimmedMsg) ||
    /웨어|왓츠|쇼\s*미|하우|헬로|땡큐|애플|바나나|오션|엄브렐라|퍼피|버니|레인보우|스노우맨|스노우볼|스트로베리|버터플라이/.test(
      trimmedMsg
    );

  // Pre-compute smart multi-photo matches across ALL user photos (up to 200 photos!)
  const localPhotoMatches =
    params.photos.length > 0 ? searchPhotosSmart(params.photos, trimmedMsg, 200) : [];
  const explicitPhotoIntent = isPhotoSearchIntent(trimmedMsg);

  // Try direct client-side Gemini if API key is saved
  const ai = getClientGemini();
  if (ai) {
    const modelCandidates =
      params.geminiVoiceMode === 'pro_model'
        ? ['gemini-2.5-pro', 'gemini-2.5-flash']
        : ['gemini-2.5-flash'];

    // Prioritize all locally matched candidate photos first + fill up to 90 total so Gemini sees the entire relevant pool!
    const seenCatIds = new Set<string>();
    const candidatePool: typeof params.photos = [];
    for (const m of localPhotoMatches) {
      if (!seenCatIds.has(m.id) && candidatePool.length < 90) {
        seenCatIds.add(m.id);
        candidatePool.push(m);
      }
    }
    for (const p of params.photos) {
      if (candidatePool.length >= 90) break;
      if (!seenCatIds.has(p.id)) {
        seenCatIds.add(p.id);
        candidatePool.push(p);
      }
    }

    // Build location count map across ALL photos so Gemini knows exact per-location counts
    const locSummaryMap = new Map<string, number>();
    for (const p of params.photos) {
      if (p.location) locSummaryMap.set(p.location, (locSummaryMap.get(p.location) || 0) + 1);
    }
    const locSummaryLine = Array.from(locSummaryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([loc, cnt]) => `${loc}(${cnt}장)`)
      .join(', ');

    const photoCatalogText = candidatePool
      .map(
        (p) =>
          `- ID: "${p.id}" | 제목: ${p.title} | 날짜: ${p.date} | 장소: ${p.location} | 태그: ${p.tags.join(', ')} | 설명: ${p.aiSummary}`
      )
      .join('\n');

    const currentPhotoBlock = params.currentFramePhoto
      ? `[지금 아이 눈앞 디지털 액자에 크게 떠 있는 현재 사진]
- 제목: "${params.currentFramePhoto.title}" | 촬영일: ${params.currentFramePhoto.date} | 장소: ${params.currentFramePhoto.location}
- 사진 설명: ${params.currentFramePhoto.aiSummary || '따뜻한 가족 추억'} | 태그: ${(params.currentFramePhoto.tags || []).join(', ')}`
      : '[현재 액자 사진: 준비 중]';

    const englishPromptRule = params.isAutoFollowUpAfterSilence
      ? '(아이가 대답 대기 시간 동안 말이 없었어. 영어유도/단어카드는 모두 false로 하고, 지금 액자에 떠 있는 사진을 보며 아이가 쉽게 대답할 수 있는 다정한 한국어 놀이 질문을 건네줘!)'
      : !allowEnglish
      ? '(중요: 이번 대화 턴은 영어 쿨타임 또는 영어 끄기 모드야! replyText에 영어 단어를 섞지 말고 100% 자연스럽고 귀여운 한국어 반말로만 대화하며, shouldSuggestEnglishReask=false, shouldShowFlashcard=false 로 설정해!)'
      : '(이번 턴에는 지금 보고 있는 사진 속 사물/배경 또는 대화 소재와 직결되는 아주 쉬운 영어 단어 1개(shouldSuggestEnglishReask=true) 또는 큰 그림 단어카드(shouldShowFlashcard=true) 중 딱 하나만 놀이처럼 자연스럽게 제안해줘!)';

    const promptParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (params.currentFrameThumbBase64 && params.currentFrameThumbBase64.length > 64) {
      const cleanThumb = params.currentFrameThumbBase64.includes(',')
        ? params.currentFrameThumbBase64.slice(params.currentFrameThumbBase64.indexOf(',') + 1)
        : params.currentFrameThumbBase64;
      promptParts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanThumb,
        },
      });
    }

    promptParts.push({
      text: `${params.characterPersona || `너는 디지털 액자 속 귀엽고 사랑스러운 아기 동물 친구 "${name}"야.`}
아이 성장 단계: ${params.childAgeStage} (모은 별: ${params.growthStars}개)
현재 날씨: ${params.weatherCondition}
${currentPhotoBlock}
이전 대화: ${params.history.slice(-8).map((h) => `${h.role}: ${h.text}`).join(' / ')}
아이의 방금 말: "${trimmedMsg}"
${englishPromptRule}

[장소별 보유 사진 수 요약 (전체 ${params.photos.length}장)]
${locSummaryLine || '장소 분석 중'}

[검색 후보 가족 사진 목록]
${photoCatalogText}

[자연스러운 아이 눈높이 대화 필수 규칙]
1. 딱딱한 설명투를 버리고, 진짜 살아있는 귀여운 동물 인형 친구처럼 감탄사("우와아~!", "헤헤!", "콩콩!")와 다정한 맞장구를 담아 1~2문장의 한국어 반말(replyText)로 대답해줘!
2. 아이가 "이 사진 뭐야?", "여기 어디야?"라고 묻거나 짧은 단어("바다!", "응!", "강아지!")만 말해도 첨부된 현재 액자 사진 이미지와 대화 흐름을 보고 다정하게 반응한 뒤, 아이가 신나게 이어 말할 수 있는 쉬운 꼬리 질문 1개를 덧붙여줘!
3. 특히 특정 장소(예: 제주도, 강릉, 공원, 에버랜드)나 주제의 사진을 찾아달라는 요청이면:
   - isPhotoMemoryQuery=true 로 설정하고,
   - **절대로 최근 1개 사진만 고르지 말고**, 목록에서 해당 장소·주제에 맞는 **모든 사진의 ID를 빠짐없이 matchedPhotoIds 배열에 전부 담아줘!** (예: 제주도 사진이 15장이면 15개 ID 모두 포함하고, replyText에도 총 몇 장을 찾았는지 신나게 말해줘!)`,
    });

    for (const modelName of modelCandidates) {
      try {
        const resp = await ai.models.generateContent({
          model: modelName,
          contents: { parts: promptParts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                replyText: { type: Type.STRING },
                isPhotoMemoryQuery: { type: Type.BOOLEAN },
                matchedPhotoIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                memoryHeadline: { type: Type.STRING },
                shouldSuggestEnglishReask: { type: Type.BOOLEAN },
                englishPhrase: { type: Type.STRING },
                koreanPhonetic: { type: Type.STRING },
                englishNudgeText: { type: Type.STRING },
                shouldShowFlashcard: { type: Type.BOOLEAN },
                flashcardKorean: { type: Type.STRING },
                flashcardEnglish: { type: Type.STRING },
                flashcardPhonetic: { type: Type.STRING },
                flashcardEmoji: { type: Type.STRING },
                flashcardHint: { type: Type.STRING },
                flashcardExampleEn: { type: Type.STRING },
                flashcardChoices: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'replyText',
                'isPhotoMemoryQuery',
                'matchedPhotoIds',
                'shouldSuggestEnglishReask',
                'shouldShowFlashcard',
              ],
            },
          },
        });
        const parsed = JSON.parse((resp.text ?? '{}').trim()) as BunnyChatReplyPayload;
        if (parsed.replyText) {
          // Merge Gemini's matchedPhotoIds with all local smart matches so NEVER just 1 photo is returned when multiple exist!
          if (parsed.isPhotoMemoryQuery || explicitPhotoIntent) {
            const mergedIdSet = new Set<string>(parsed.matchedPhotoIds ?? []);
            for (const m of localPhotoMatches) {
              mergedIdSet.add(m.id);
            }
            parsed.isPhotoMemoryQuery = mergedIdSet.size > 0 || Boolean(parsed.isPhotoMemoryQuery);
            parsed.matchedPhotoIds = Array.from(mergedIdSet);
          }
          if (!allowEnglish) {
            return {
              ...parsed,
              shouldSuggestEnglishReask: false,
              shouldShowFlashcard: false,
            };
          }
          return parsed;
        }
      } catch {
        // Try next model or fall through to built-in engine
      }
    }
  }

  // Built-in Offline/Standalone Bunny Conversation Engine!
  if (params.isAutoFollowUpAfterSilence) {
    return {
      replyText: `헤헤~ 조금 쑥스러웠구나, 괜찮아! 우리 좋아하는 과일이나 재미있었던 소풍 이야기 해볼까?`,
      isPhotoMemoryQuery: false,
      matchedPhotoIds: [],
      shouldSuggestEnglishReask: false,
      shouldShowFlashcard: false,
    };
  }

  // When user asks about the photo currently on screen ("이 사진 뭐야?", "여기 어디야?") in offline mode
  if (params.currentFramePhoto && /이\s*사진|지금\s*사진|여기\s*어디|이게\s*뭐/.test(trimmedMsg)) {
    const cp = params.currentFramePhoto;
    return {
      replyText: `우와~ 지금 보고 있는 사진은 ${cp.date} "${cp.location}"에서 찍은 "${cp.title}" 추억이야! ${cp.aiSummary || '표정이 정말 반짝반짝 행복해 보여!'} 이때 기억나?`,
      isPhotoMemoryQuery: false,
      matchedPhotoIds: [],
      shouldSuggestEnglishReask: false,
      shouldShowFlashcard: false,
    };
  }

  // Check photo memory query (returns ALL matching photos via searchPhotosSmart!)
  const looksLikePhotoQuery =
    explicitPhotoIntent ||
    localPhotoMatches.length > 0 && /어디|언제|사진|갔|보여|찾아|추억|여행/.test(trimmedMsg) ||
    /바다|해변|제주|강릉|속초|부산|경주|여수|전주|가평|춘천|숲|공원|캠핑|단풍|가을|봄|여름|겨울|벚꽃|꽃|소풍|딸기|놀이공원|에버랜드|롯데월드|회전목마|눈|썰매|눈사람|웃|행복|생일|케이크|강아지|동물|추억|옛날|과거/i.test(
      trimmedMsg
    );

  if (looksLikePhotoQuery && params.photos.length > 0) {
    const picked =
      localPhotoMatches.length > 0 ? localPhotoMatches : params.photos.slice(0, 6);
    const first = picked[0];
    const countLabel =
      picked.length > 1 ? `총 ${picked.length}장의 사진을 다 찾았어! 액자에 차례대로 보여줄게! ` : '';
    return {
      replyText: `우와~ 찾았다!! ${countLabel}${first.date} "${first.location}" 추억 사진이야! ${first.aiSummary || `${first.title} 순간이 정말 행복해 보여~!`} `,
      isPhotoMemoryQuery: true,
      matchedPhotoIds: picked.map((p) => p.id),
      memoryHeadline: `${name}가 찾아준 우리 가족 사진 (${picked.length}장)`,
      shouldSuggestEnglishReask: false,
      shouldShowFlashcard: false,
    };
  }

  if (userSpokeEnglish) {
    return {
      replyText: `우와아!! 방금 영어로 진짜 또박또박 멋지게 말했어! ${name}가 반짝반짝 칭찬 별 줄게, 최고야~!`,
      isPhotoMemoryQuery: false,
      matchedPhotoIds: [],
      shouldSuggestEnglishReask: false,
      shouldShowFlashcard: false,
    };
  }

  // Character-specific speech style so each designated bunny talks in its own distinct personality even offline!
  const styleByBunny: Record<string, { lead: string; greetReply: string }> = {
    tosuni: {
      lead: '우와아~ 다정한 토순이가 잘 들었어!',
      greetReply: '안녕~! 토순이랑 도란도란 재미있는 이야기 나누자! 오늘 기분이 어때?',
    },
    tosili: {
      lead: '폴짝폴짝! 신나는 토실이 귀가 쫑긋했어!',
      greetReply: '야호~! 토실이 여기 있지! 우리 오늘 무슨 신나는 놀이 이야기 할까?',
    },
    toddungi: {
      lead: '헤헤~ 귀염둥이 막내 토뚱이도 완전 신나!',
      greetReply: '히히 안녕~! 토뚱이는 맛있는 간식이랑 놀이 이야기 제일 좋아해! 뭐 하고 놀까?',
    },
    tobyeori: {
      lead: '반짝반짝~ 별빛 요정 토별이가 귀 기울여 들었어!',
      greetReply: '반짝반짝 안녕~! 토별이랑 동화 나라처럼 예쁜 이야기 해볼까?',
    },
    togureum: {
      lead: '몽글몽글~ 씩씩한 토구름 대장이 출동했지!',
      greetReply: '씩씩하게 안녕~! 토구름이랑 오늘 있었던 재미난 모험 이야기 해보자!',
    },
  };
  const charStyle = styleByBunny[params.bunnyId] ?? {
    lead: `우와~ ${name}가 귀를 쫑긋하고 들었어!`,
    greetReply: `안녕~! ${name}랑 신나게 이야기하자! 오늘 무슨 재미있는 일 있었어?`,
  };

  if (/^(안녕|하이|반가워|놀자|심심해|뭐\s*해|누구야|이름이\s*뭐야)[!?.~\s]*$/i.test(trimmedMsg)) {
    return {
      replyText: charStyle.greetReply,
      isPhotoMemoryQuery: false,
      matchedPhotoIds: [],
      shouldSuggestEnglishReask: false,
      shouldShowFlashcard: false,
    };
  }

  // When English is NOT due on this turn (or turned off), reply in 100% natural warm Korean!
  if (!allowEnglish) {
    const followUps = [
      `${charStyle.lead} 너랑 이야기하니까 정말 재미있어! 그다음엔 어떤 일이 있었어?`,
      `${charStyle.lead} 우와 진짜? ${name}도 상상하니까 너무 신난다! 또 들려줘~`,
      `${charStyle.lead} 헤헤~ 너는 이야기를 참 재미있게 해! 오늘 제일 좋았던 건 뭐야?`,
      `${charStyle.lead} 맞장구치느라 귀가 쫑긋쫑긋해! 우리 가족 사진 이야기도 같이 볼까?`,
    ];
    return {
      replyText: followUps[params.userTurnCount % followUps.length],
      isPhotoMemoryQuery: false,
      matchedPhotoIds: [],
      shouldSuggestEnglishReask: false,
      shouldShowFlashcard: false,
    };
  }

  // English IS due on this turn: alternate cleanly between a picture flashcard and a spoken phrase!
  if (params.userTurnCount % 2 === 0) {
    const card = pickRandomFlashcard(undefined, params.childAgeStage);
    return {
      replyText: `${charStyle.lead} ${name}랑 이야기하니까 정말 즐거워! 짜잔, 우리 "${card.koreanWord}"를 영어로 어떻게 말하는지 큰 그림카드로 같이 해볼까?`,
      isPhotoMemoryQuery: false,
      matchedPhotoIds: [],
      shouldSuggestEnglishReask: false,
      shouldShowFlashcard: true,
      flashcardKorean: card.koreanWord,
      flashcardEnglish: card.englishWord,
      flashcardPhonetic: card.phonetic,
      flashcardEmoji: card.emoji,
      flashcardHint: card.hintText,
      flashcardExampleEn: card.exampleEn,
      flashcardChoices: card.choices,
    };
  }

  const phrases =
    params.childAgeStage === 'age_3_4'
      ? { en: 'Hi friend!', ko: '하이 프렌드!' }
      : params.childAgeStage === 'age_6_7'
      ? { en: 'Let us play together!', ko: '렛 어스 플레이 투게더!' }
      : { en: 'I am so happy!', ko: '아이 엠 쏘 해피!' };

  return {
    replyText: `${charStyle.lead} 너랑 목소리로 대화하니까 ${name} 마음이 포근포근 정말 행복해!`,
    isPhotoMemoryQuery: false,
    matchedPhotoIds: [],
    shouldSuggestEnglishReask: true,
    englishPhrase: phrases.en,
    koreanPhonetic: phrases.ko,
    englishNudgeText: `마이크에 대고 신나게 영어로 "${phrases.ko}" 하고 말해볼래?`,
    shouldShowFlashcard: false,
  };
}

// ============================================================================
// 5. DIRECT SYNOLOGY NAS & WEBDAV NATIVE ANDROID CONNECTOR (CapacitorHttp)
// ============================================================================

export async function connectSynologyDsmUnified(params: {
  dsmUrl: string;
  account: string;
  passwd: string;
  otpCode?: string;
  demoMode: boolean;
}): Promise<{ folders: RemoteFolderItem[]; sid?: string; cleanBase?: string }> {
  // 1) Demo mode works 100% locally without needing any server!
  if (params.demoMode) {
    return {
      folders: [
        { id: 'syno-shared-family', name: 'Synology Photos / 가족 공유 스페이스', path: '/photo/FamilySpace', photoCount: 68 },
        { id: 'syno-spring-picnic', name: '2026_서울숲_벚꽃피크닉', path: '/photo/2026_서울숲_벚꽃피크닉', photoCount: 31 },
        { id: 'syno-everland', name: '어린이날_에버랜드_나들이', path: '/photo/어린이날_에버랜드_나들이', photoCount: 27 },
      ],
    };
  }

  if (!params.dsmUrl || !params.account || !params.passwd) {
    throw new Error('시놀로지 DSM 주소(예: https://이름.synology.me:5001), 계정 ID, 비밀번호를 모두 입력해 주세요.');
  }

  // 2) Try backend first if available
  const backend = await tryBackendJson<{ folders?: RemoteFolderItem[] }>('/api/storage/synology/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }, 8000);
  if (backend.ok && backend.data.folders) {
    return { folders: backend.data.folders };
  }

  // 3) Direct Native HTTP (CapacitorHttp bypasses CORS on Android APK!)
  const cleanBase = params.dsmUrl.trim().replace(/\/+$/, '');
  const loginParams = new URLSearchParams({
    api: 'SYNO.API.Auth',
    version: '6',
    method: 'login',
    account: params.account.trim(),
    passwd: params.passwd,
    session: 'FileStation',
    format: 'sid',
  });
  if (params.otpCode?.trim()) {
    loginParams.set('otp_code', params.otpCode.trim());
  }

  const authUrl = `${cleanBase}/webapi/auth.cgi?${loginParams.toString()}`;
  const authRes = Capacitor.isNativePlatform()
    ? await CapacitorHttp.get({ url: authUrl, connectTimeout: 8000, readTimeout: 8000 })
    : await fetch(authUrl).then(async (r) => ({ status: r.status, data: await r.json() }));

  const authJson = (typeof authRes.data === 'string' ? JSON.parse(authRes.data) : authRes.data) as {
    success?: boolean;
    data?: { sid?: string };
    error?: { code?: number };
  };

  if (!authJson?.success || !authJson.data?.sid) {
    const code = authJson?.error?.code;
    const reason =
      code === 400
        ? '아이디 또는 비밀번호가 일치하지 않습니다'
        : code === 403
        ? '2단계 인증(OTP) 코드가 필요합니다. OTP 칸에 6자리 코드를 입력해 주세요'
        : code === 404
        ? '잘못된 OTP 코드입니다'
        : `오류 코드: ${code ?? '인증 실패'}`;
    throw new Error(`시놀로지 DSM 로그인 실패 (${reason})`);
  }

  const sid = authJson.data.sid;

  // List shared folders
  const listParams = new URLSearchParams({
    api: 'SYNO.FileStation.List',
    version: '2',
    method: 'list_share',
    _sid: sid,
  });
  const listUrl = `${cleanBase}/webapi/entry.cgi?${listParams.toString()}`;
  const listRes = Capacitor.isNativePlatform()
    ? await CapacitorHttp.get({ url: listUrl, connectTimeout: 8000, readTimeout: 8000 })
    : await fetch(listUrl).then(async (r) => ({ status: r.status, data: await r.json() }));

  const listJson = (typeof listRes.data === 'string' ? JSON.parse(listRes.data) : listRes.data) as {
    success?: boolean;
    data?: { shares?: Array<{ name: string; path: string }> };
  };

  const folders: RemoteFolderItem[] = (listJson?.data?.shares ?? []).map((share, idx) => ({
    id: `syno-${idx}-${share.name}`,
    name: share.name,
    path: share.path,
    photoCount: 25,
  }));

  // Also try listing subfolders inside /photo if present
  const hasPhotoShare = folders.some((f) => f.path.toLowerCase() === '/photo');
  if (hasPhotoShare) {
    try {
      const subParams = new URLSearchParams({
        api: 'SYNO.FileStation.List',
        version: '2',
        method: 'list',
        folder_path: '/photo',
        filetype: 'dir',
        _sid: sid,
      });
      const subUrl = `${cleanBase}/webapi/entry.cgi?${subParams.toString()}`;
      const subRes = Capacitor.isNativePlatform()
        ? await CapacitorHttp.get({ url: subUrl, connectTimeout: 7000, readTimeout: 7000 })
        : await fetch(subUrl).then(async (r) => ({ status: r.status, data: await r.json() }));
      const subJson = (typeof subRes.data === 'string' ? JSON.parse(subRes.data) : subRes.data) as {
        data?: { files?: Array<{ name: string; path: string; isdir?: boolean }> };
      };
      (subJson?.data?.files ?? [])
        .filter((f) => f.isdir !== false)
        .forEach((sub, idx) => {
          folders.unshift({
            id: `syno-photo-sub-${idx}-${sub.name}`,
            name: `📸 photo / ${sub.name}`,
            path: sub.path,
            photoCount: 30,
          });
        });
    } catch {
      // ignore subfolder listing error
    }
  }

  return { folders, sid, cleanBase };
}

/**
 * Fetches actual image files inside a Synology folder so the user's real NAS photos appear on the frame!
 */
export async function fetchSynologyFolderPhotos(params: {
  cleanBase: string;
  sid: string;
  folderPath: string;
  albumId: string;
  albumName: string;
  provider: StorageProvider;
  maxCount?: number;
}): Promise<PhotoItem[]> {
  try {
    const syncCfg = getSavedPhotoSyncConfig();
    const targetMax = Math.max(10, Math.min(500, params.maxCount ?? syncCfg.maxPhotoFetchCount));
    const desiredPool = Math.min(2000, Math.max(targetMax * 2, 600));
    const pageLimit = 200;

    type SynoFsFile = {
      name: string;
      path: string;
      isdir?: boolean;
      additional?: { time?: { mtime?: number } };
    };
    const collectedFiles: SynoFsFile[] = [];

    for (let offset = 0; offset < desiredPool; offset += pageLimit) {
      const fileParams = new URLSearchParams({
        api: 'SYNO.FileStation.List',
        version: '2',
        method: 'list',
        folder_path: params.folderPath,
        additional: '["time"]',
        sort_by: 'mtime',
        sort_direction: 'desc',
        offset: String(offset),
        limit: String(pageLimit),
        _sid: params.sid,
      });
      const url = `${params.cleanBase}/webapi/entry.cgi?${fileParams.toString()}`;
      const res = Capacitor.isNativePlatform()
        ? await CapacitorHttp.get({ url, connectTimeout: 8000, readTimeout: 10000 })
        : await fetch(url).then(async (r) => ({ status: r.status, data: await r.json() }));

      const json = (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as {
        data?: {
          total?: number;
          files?: SynoFsFile[];
        };
      };

      const pageFiles = json?.data?.files ?? [];
      if (pageFiles.length === 0) break;
      collectedFiles.push(...pageFiles);
      if (pageFiles.length < pageLimit) break;
      if (typeof json?.data?.total === 'number' && offset + pageFiles.length >= json.data.total) {
        break;
      }
    }

    const imageFiles = collectedFiles.filter(
      (f) => !f.isdir && /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(f.name)
    );

    const latestFiles = selectLatestItems(imageFiles, {
      maxCount: targetMax,
      getTimestampMs: (f) =>
        f.additional?.time?.mtime
          ? f.additional.time.mtime * 1000
          : inferTimestampFromNameOrDate(f.name),
    });

    return latestFiles.map((file) => {
      // Prioritize rotated, lightweight Synology DSM thumbnails (`large` ~1280px ~180KB) before raw 25MB `Download`!
      const thumbLargeParams = new URLSearchParams({
        api: 'SYNO.FileStation.Thumb',
        version: '2',
        method: 'get',
        path: file.path,
        size: 'large',
        rotate: 'true',
        _sid: params.sid,
      });
      const thumbMediumParams = new URLSearchParams({
        api: 'SYNO.FileStation.Thumb',
        version: '2',
        method: 'get',
        path: file.path,
        size: 'medium',
        rotate: 'true',
        _sid: params.sid,
      });
      const dlParams = new URLSearchParams({
        api: 'SYNO.FileStation.Download',
        version: '2',
        method: 'download',
        path: file.path,
        mode: 'open',
        _sid: params.sid,
      });
      const thumbLargeUrl = `${params.cleanBase}/webapi/entry.cgi?${thumbLargeParams.toString()}`;
      const thumbMedUrl = `${params.cleanBase}/webapi/entry.cgi?${thumbMediumParams.toString()}`;
      const rawDlUrl = `${params.cleanBase}/webapi/entry.cgi?${dlParams.toString()}`;
      const mtime = file.additional?.time?.mtime;
      const dateStr = mtime
        ? new Date(mtime * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
        : '시놀로지 NAS 추억';

      return {
        id: buildStablePhotoId(params.albumId, file.path || file.name),
        albumId: params.albumId,
        albumName: params.albumName,
        provider: params.provider,
        src: thumbLargeUrl,
        assetUrl: thumbMedUrl,
        fallbackUrls: [rawDlUrl],
        title: file.name.replace(/\.[^.]+$/, ''),
        date: dateStr,
        location: params.albumName,
        tags: ['시놀로지', params.albumName],
        aiSummary: `시놀로지 NAS "${params.albumName}" 폴더에서 불러온 가족 사진입니다.`,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fetches actual image files inside a Google Drive folder, OneDrive folder, or WebDAV folder when using OAuth/WebDAV credentials!
 */
export async function fetchCloudProviderFolderPhotos(params: {
  provider: StorageProvider;
  folderId: string;
  folderPath: string;
  albumId: string;
  albumName: string;
  gdriveToken?: string;
  onedriveToken?: string;
  webdavUrl?: string;
  webdavUser?: string;
  webdavPass?: string;
  maxCount?: number;
}): Promise<PhotoItem[]> {
  const syncCfg = getSavedPhotoSyncConfig();
  const targetMax = Math.max(10, Math.min(500, params.maxCount ?? syncCfg.maxPhotoFetchCount));
  const todayLabel = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (params.provider === 'google_drive' && params.gdriveToken?.trim()) {
    const q = encodeURIComponent(
      `'${params.folderId}' in parents and mimeType contains 'image/' and trashed = false`
    );
    type GDriveApiFile = {
      id: string;
      name: string;
      createdTime?: string;
      thumbnailLink?: string;
      imageMediaMetadata?: {
        time?: string;
        location?: { latitude?: number; longitude?: number };
      };
    };
    const allFiles: GDriveApiFile[] = [];
    let pageToken = '';
    const desiredPool = Math.min(1500, Math.max(targetMax * 2, 600));

    for (let page = 0; page < 8 && allFiles.length < desiredPool; page++) {
      const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime%20desc&fields=nextPageToken,files(id,name,createdTime,thumbnailLink,imageMediaMetadata(time,location))&pageSize=200${tokenParam}`,
        { headers: { Authorization: `Bearer ${params.gdriveToken.trim()}` } }
      );
      if (!res.ok) break;
      const data = (await res.json()) as {
        nextPageToken?: string;
        files?: GDriveApiFile[];
      };
      if (data.files?.length) {
        allFiles.push(...data.files);
      }
      if (!data.nextPageToken || !data.files?.length) break;
      pageToken = data.nextPageToken;
    }

    if (allFiles.length > 0) {
      const latest = selectLatestItems(allFiles, {
        maxCount: targetMax,
        getTimestampMs: (f) =>
          f.createdTime ? Date.parse(f.createdTime) : inferTimestampFromNameOrDate(f.name),
      });
      return latest.map((f) => {
        const lat = f.imageMediaMetadata?.location?.latitude;
        const lng = f.imageMediaMetadata?.location?.longitude;
        const geo =
          typeof lat === 'number' && typeof lng === 'number'
            ? reverseGeocodeKoreaLatLng(lat, lng)
            : null;
        const locLabel = geo?.locationLabel || params.albumName;
        return {
          id: buildStablePhotoId(params.albumId, f.id),
          albumId: params.albumId,
          albumName: params.albumName,
          provider: 'google_drive',
          src: f.thumbnailLink
            ? f.thumbnailLink.replace(/=s\d+.*$/, '=s2560')
            : `https://drive.google.com/thumbnail?id=${f.id}&sz=w2560`,
          assetUrl: `https://lh3.googleusercontent.com/d/${f.id}=w2560`,
          title: f.name.replace(/\.[^.]+$/, ''),
          date: f.createdTime
            ? new Date(f.createdTime).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : todayLabel,
          location: locLabel,
          gpsLat: lat,
          gpsLng: lng,
          tags: Array.from(new Set(['구글드라이브', params.albumName, ...(geo?.tags ?? [])])),
          aiSummary: `Google Drive "${params.albumName}" 폴더에서 불러온 실제 사진입니다.`,
        };
      });
    }
  }

  if (params.provider === 'onedrive' && params.onedriveToken?.trim()) {
    type OneDriveGraphFile = {
      id: string;
      name: string;
      createdDateTime?: string;
      photo?: { takenDateTime?: string };
      location?: { latitude?: number; longitude?: number };
      image?: Record<string, unknown>;
      file?: { mimeType?: string };
      '@microsoft.graph.downloadUrl'?: string;
    };
    const allOdItems: OneDriveGraphFile[] = [];
    let nextUrl: string | undefined =
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(params.folderId)}/children?$top=200`;
    const desiredPool = Math.min(1500, Math.max(targetMax * 2, 600));

    for (let page = 0; page < 8 && nextUrl && allOdItems.length < desiredPool; page++) {
      const res = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${params.onedriveToken.trim()}` },
      });
      if (!res.ok) break;
      const data = (await res.json()) as {
        '@odata.nextLink'?: string;
        value?: OneDriveGraphFile[];
      };
      if (data.value?.length) {
        allOdItems.push(...data.value);
      }
      nextUrl = data['@odata.nextLink'];
    }

    if (allOdItems.length > 0) {
      const imgs = allOdItems.filter(
        (item) =>
          Boolean(item['@microsoft.graph.downloadUrl']) &&
          (Boolean(item.image) ||
            Boolean(item.file?.mimeType?.startsWith('image/')) ||
            /\.(jpe?g|png|webp|gif|bmp)$/i.test(item.name))
      );
      const latest = selectLatestItems(imgs, {
        maxCount: targetMax,
        getTimestampMs: (it) => {
          const dt = it.photo?.takenDateTime || it.createdDateTime;
          return dt ? Date.parse(dt) : inferTimestampFromNameOrDate(it.name);
        },
      });
      return latest.map((item) => {
        const lat = item.location?.latitude;
        const lng = item.location?.longitude;
        const geo =
          typeof lat === 'number' && typeof lng === 'number'
            ? reverseGeocodeKoreaLatLng(lat, lng)
            : null;
        return {
          id: buildStablePhotoId(params.albumId, item.id || item.name),
          albumId: params.albumId,
          albumName: params.albumName,
          provider: 'onedrive',
          src: item['@microsoft.graph.downloadUrl'] || '',
          title: item.name.replace(/\.[^.]+$/, ''),
          date: item.photo?.takenDateTime
            ? new Date(item.photo.takenDateTime).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : todayLabel,
          location: geo?.locationLabel || params.albumName,
          gpsLat: lat,
          gpsLng: lng,
          tags: Array.from(new Set(['원드라이브', params.albumName, ...(geo?.tags ?? [])])),
          aiSummary: `OneDrive "${params.albumName}" 폴더에서 불러온 실제 사진입니다.`,
        };
      });
    }
  }

  if (
    params.provider === 'synology_webdav' &&
    params.webdavUrl &&
    params.webdavUser &&
    params.webdavPass &&
    Capacitor.isNativePlatform()
  ) {
    try {
      const origin = new URL(params.webdavUrl.trim()).origin;
      const targetUrl = params.folderPath.startsWith('http')
        ? params.folderPath
        : `${origin}/${params.folderPath.replace(/^\/+/, '')}`;
      const basic = btoa(unescape(encodeURIComponent(`${params.webdavUser.trim()}:${params.webdavPass}`)));
      const wRes = await CapacitorHttp.request({
        method: 'PROPFIND',
        url: targetUrl,
        headers: { Authorization: `Basic ${basic}`, Depth: '1' },
      });
      if (wRes.status >= 200 && wRes.status < 300 && typeof wRes.data === 'string') {
        const hrefs = Array.from(wRes.data.matchAll(/<(?:\w+:)?href>([^<]+)<\/(?:\w+:)?href>/gi)).map((m) =>
          m[1].trim()
        );
        const imageHrefs = hrefs.filter((h) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(decodeURIComponent(h)));
        const latestHrefs = selectLatestItems(imageHrefs, {
          maxCount: targetMax,
          getTimestampMs: (h) => inferTimestampFromNameOrDate(decodeURIComponent(h)),
          assumeReverseChronologicalWhenNoTimestamp: false,
        });
        return latestHrefs.map((href, i) => {
          const fullImgUrl = href.startsWith('http')
            ? href
            : `${origin}${href.startsWith('/') ? '' : '/'}${href}`;
          const decodedName = decodeURIComponent(href.split('/').pop() || `photo_${i + 1}`);
          return {
            id: buildStablePhotoId(params.albumId, href),
            albumId: params.albumId,
            albumName: params.albumName,
            provider: 'synology_webdav',
            src: fullImgUrl,
            nativeHeaders: { Authorization: `Basic ${basic}` },
            title: decodedName.replace(/\.[^.]+$/, ''),
            date: todayLabel,
            location: params.albumName,
            tags: ['WebDAV', params.albumName],
            aiSummary: `시놀로지 WebDAV "${params.albumName}" 폴더에서 불러온 실제 사진입니다.`,
          };
        });
      }
    } catch {
      // fall through
    }
  }

  return [];
}

export async function browseCloudDemoOrRemoteUnified(params: {
  provider: StorageProvider;
  demoMode: boolean;
  gdriveToken?: string;
  onedriveToken?: string;
  webdavUrl?: string;
  webdavUser?: string;
  webdavPass?: string;
  webdavPath?: string;
}): Promise<RemoteFolderItem[]> {
  if (params.demoMode) {
    if (params.provider === 'google_drive') {
      return [
        { id: 'gdrive-jeju-2026', name: '내 드라이브 / 가족여행 / 제주협재바다', path: '/가족여행/제주협재바다', photoCount: 36 },
        { id: 'gdrive-picnic-2026', name: '내 드라이브 / 봄나들이 / 서울숲벚꽃피크닉', path: '/봄나들이/서울숲벚꽃피크닉', photoCount: 29 },
        { id: 'gdrive-kids-play', name: '내 드라이브 / 아이들추억 / 어린이날놀이공원', path: '/아이들추억/어린이날놀이공원', photoCount: 44 },
      ];
    }
    if (params.provider === 'onedrive') {
      return [
        { id: 'onedrive-autumn', name: 'OneDrive / 사진 / 가평단풍숲캠핑', path: '/Pictures/가평단풍숲캠핑', photoCount: 22 },
        { id: 'onedrive-snow', name: 'OneDrive / 사진 / 겨울평창눈썰매', path: '/Pictures/겨울평창눈썰매', photoCount: 19 },
        { id: 'onedrive-home', name: 'OneDrive / 카메라 앨범 / 주말일상', path: '/Pictures/주말일상', photoCount: 51 },
      ];
    }
    return [
      { id: 'webdav-jeju', name: '2026_제주도_가족바다여행', path: '/photo/2026_제주도_가족바다여행', photoCount: 24 },
      { id: 'webdav-camp', name: '2026_가평_단풍글램핑', path: '/photo/2026_가평_단풍글램핑', photoCount: 18 },
      { id: 'webdav-kids', name: '아이성장앨범_유치원소풍', path: '/photo/아이성장앨범_유치원소풍', photoCount: 42 },
      { id: 'webdav-winter', name: '2026_평창_눈썰매장', path: '/photo/2026_평창_눈썰매장', photoCount: 15 },
    ];
  }

  // Google Drive direct API (CORS supported by Google APIs!)
  if (params.provider === 'google_drive') {
    const token = (params.gdriveToken || '').trim();
    if (!token) {
      throw new Error('구글 드라이브 폴더 [공유 링크]를 위 칸에 붙여넣거나, 액세스 토큰을 입력해 주세요.');
    }
    const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Google Drive 토큰이 만료되었거나 올바르지 않습니다. 간편한 [공유 링크] 방식을 추천합니다.');
    const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
    return (data.files ?? []).map((f) => ({ id: f.id, name: f.name, path: `/${f.name}`, photoCount: 20 }));
  }

  // Microsoft OneDrive Graph API (CORS supported by Graph API!)
  if (params.provider === 'onedrive') {
    const token = (params.onedriveToken || '').trim();
    if (!token) {
      throw new Error('원드라이브 [공유 링크(1drv.ms)]를 위 칸에 붙여넣거나, Graph 토큰을 입력해 주세요.');
    }
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,folder,parentReference',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error('OneDrive 토큰이 만료되었거나 올바르지 않습니다. 간편한 [공유 링크] 방식을 추천합니다.');
    const data = (await res.json()) as { value?: Array<{ id: string; name: string; folder?: { childCount?: number } }> };
    return (data.value ?? [])
      .filter((i) => Boolean(i.folder))
      .map((f) => ({ id: f.id, name: f.name, path: `/OneDrive/${f.name}`, photoCount: f.folder?.childCount ?? 15 }));
  }

  // Synology WebDAV via Backend or Native CapacitorHttp
  if (params.provider === 'synology_webdav') {
    const backend = await tryBackendJson<{ folders?: RemoteFolderItem[] }>('/api/storage/webdav/browse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverUrl: params.webdavUrl,
        username: params.webdavUser,
        password: params.webdavPass,
        basePath: params.webdavPath || '/photo',
      }),
    });
    if (backend.ok && backend.data.folders) return backend.data.folders;

    if (!params.webdavUrl || !params.webdavUser || !params.webdavPass) {
      throw new Error('WebDAV 서버 주소, 계정 ID, 비밀번호를 모두 입력해 주세요.');
    }
    if (Capacitor.isNativePlatform()) {
      const normalizedUrl = `${params.webdavUrl.trim().replace(/\/+$/, '')}/${(params.webdavPath || '/photo').replace(/^\/+/, '')}/`;
      const basic = btoa(unescape(encodeURIComponent(`${params.webdavUser.trim()}:${params.webdavPass}`)));
      const wRes = await CapacitorHttp.request({
        method: 'PROPFIND',
        url: normalizedUrl,
        headers: { Authorization: `Basic ${basic}`, Depth: '1' },
      });
      if (wRes.status >= 200 && wRes.status < 300 && typeof wRes.data === 'string') {
        const hrefMatches = Array.from(wRes.data.matchAll(/<(?:\w+:)?href>([^<]+)<\/(?:\w+:)?href>/gi)).map((m) =>
          decodeURIComponent(m[1])
        );
        return hrefMatches
          .filter((h) => h.endsWith('/') && h.replace(/\/+$/, '') !== (params.webdavPath || '/photo').replace(/\/+$/, ''))
          .slice(0, 30)
          .map((href, idx) => {
            const parts = href.replace(/\/+$/, '').split('/').filter(Boolean);
            return {
              id: `webdav-${idx}`,
              name: parts[parts.length - 1] || `폴더_${idx + 1}`,
              path: href,
              photoCount: 20,
            };
          });
      }
    }
    throw new Error('WebDAV 연결에 실패했습니다. 포트(5006) 설정을 확인하거나 [Synology Photos] 탭에서 로그인 또는 공유 링크를 이용해 보세요.');
  }

  return [];
}

export async function analyzePhotoUnified(params: {
  base64Data: string;
  mimeType: string;
  fileName: string;
}): Promise<{ title?: string; location?: string; aiSummary?: string; tags?: string[] } | null> {
  const backend = await tryBackendJson<{
    title?: string;
    location?: string;
    aiSummary?: string;
    tags?: string[];
  }>(
    '/api/gemini/analyze-photo',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    12000
  );
  if (backend.ok && (backend.data.title || backend.data.aiSummary)) return backend.data;

  const ai = getClientGemini();
  if (ai) {
    try {
      const cleanBase64 = params.base64Data.includes(',')
        ? params.base64Data.split(',')[1]
        : params.base64Data;
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: params.mimeType || 'image/jpeg', data: cleanBase64 } },
            {
              text: `원본 파일명: "${params.fileName}"
이 사진을 보고 스마트 디지털 액자 화면 캡션 및 3D 토끼 캐릭터의 어린이 추억 대화에 사용할 한국어 메타데이터를 작성해 주세요:
- title: 파일명(IMG_1234 등) 대신 사진 속 순간을 따뜻하게 표현하는 짧은 한국어 제목 (예: "햇살 가득 봄날 공원 나들이", "모래사장에서 조개 줍는 날")
- location: 사진 배경으로 유추되는 장소 유형이나 풍경 (예: "푸른 바닷가 해변", "잔디밭 공원", "따뜻한 거실")
- aiSummary: 인물(아이/가족)의 표정·행동·계절감·배경을 다정하게 묘사한 한국어 2문장 설명
- tags: 아이가 "바다 사진 보여줘", "눈사람 사진 언제야?" 하고 찾을 때 매칭될 한국어 핵심 키워드 5~7개`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              location: { type: Type.STRING },
              aiSummary: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['title', 'location', 'aiSummary', 'tags'],
          },
        },
      });
      return JSON.parse((resp.text ?? '{}').trim());
    } catch {
      return null;
    }
  }
  return null;
}

export interface BatchPhotoInputItem {
  photoId: string;
  fileName: string;
  albumName: string;
  dateStr: string;
  /** Compact 384px JPEG raw base64 (~12-16KB) from IndexedDB vault */
  aiThumbBase64: string;
  visualHintTags?: string[];
}

export interface AnalyzedPhotoStructuredData {
  photoId: string;
  title: string;
  location: string;
  aiSummary: string;
  season?: string;
  mood?: string;
  people?: string;
  objects?: string[];
  tags: string[];
  analyzedByGemini: boolean;
}

/**
 * Builds an instant zero-latency structured index from filename/date/visual-pixel tags
 * when Gemini is not yet connected, so search & captions still work cleanly right away!
 */
export function buildSmartLocalPhotoIndex(item: BatchPhotoInputItem): AnalyzedPhotoStructuredData {
  const rawName = item.fileName.replace(/\.[^.]+$/, '');
  let inferredDate = item.dateStr;
  let season = '';

  const dateMatch = rawName.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/);
  if (dateMatch) {
    const yr = Number(dateMatch[1]);
    const mo = Number(dateMatch[2]);
    const da = Number(dateMatch[3]);
    inferredDate = `${yr}년 ${mo}월 ${da}일`;
    if (mo >= 3 && mo <= 5) season = '봄';
    else if (mo >= 6 && mo <= 8) season = '여름';
    else if (mo >= 9 && mo <= 11) season = '가을';
    else season = '겨울';
  } else {
    const mMatch = item.dateStr.match(/(\d{1,2})월/);
    if (mMatch) {
      const mo = Number(mMatch[1]);
      if (mo >= 3 && mo <= 5) season = '봄';
      else if (mo >= 6 && mo <= 8) season = '여름';
      else if (mo >= 9 && mo <= 11) season = '가을';
      else season = '겨울';
    }
  }

  const hints = item.visualHintTags ?? [];
  const isGenericCameraName =
    /^(IMG|DSC|PXL|SAM|KakaoTalk|Screenshot|photo|image|\d{8})[-_\d\s]*$/i.test(rawName);

  const vibeWord = hints.includes('바다·하늘')
    ? '푸른 하늘 나들이'
    : hints.includes('숲·공원')
    ? '초록 자연 산책'
    : hints.includes('눈·겨울')
    ? '하얀 겨울날 추억'
    : hints.includes('따뜻한분위기')
    ? '포근한 가족 일상'
    : season
    ? `${season}날의 소중한 추억`
    : '행복한 가족 추억';

  const cleanTitle = isGenericCameraName ? `${item.albumName} · ${vibeWord}` : rawName;
  const tagSet = new Set<string>([
    item.albumName,
    ...(season ? [season] : []),
    ...hints,
    '가족추억',
  ]);

  return {
    photoId: item.photoId,
    title: cleanTitle,
    location: item.albumName,
    aiSummary: `${inferredDate} "${item.albumName}" 앨범에 담긴 ${vibeWord} 사진입니다.`,
    season: season || undefined,
    mood: '따뜻함',
    tags: Array.from(tagSet).slice(0, 8),
    analyzedByGemini: false,
  };
}

/**
 * Ultra-fast Batch AI Photo Indexer:
 * Sends up to 5 ultra-compact 384px (~14KB) thumbnails in a SINGLE Gemini 2.5 Flash call
 * (~70KB total payload -> ~2s per 5 photos!) and structures them into searchable metadata!
 */
export async function analyzePhotoBatchUnified(
  batch: BatchPhotoInputItem[]
): Promise<AnalyzedPhotoStructuredData[]> {
  if (batch.length === 0) return [];

  // 1) Try backend batch endpoint if available
  const backend = await tryBackendJson<{ items?: AnalyzedPhotoStructuredData[] }>(
    '/api/gemini/analyze-photo-batch',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: batch }),
    },
    18000
  );
  if (backend.ok && Array.isArray(backend.data.items) && backend.data.items.length > 0) {
    return backend.data.items;
  }

  // 2) Direct Client Gemini 2.5 Flash Multimodal Batch Call
  const ai = getClientGemini();
  if (ai) {
    try {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        {
          text: `다음 ${batch.length}장의 가족·아이 스마트 액자 사진을 순서대로(index 0 ~ ${
            batch.length - 1
          }) 빠르게 분석하여 나중에 음성으로("바다 사진 보여줘", "웃는 사진", "겨울 눈썰매 사진" 등) 즉시 검색할 수 있도록 구조화된 한국어 JSON 배열로 데이터화해 주세요.
각 사진마다 다음 항목을 채워 주세요:
- index: 사진 번호 (0부터 시작)
- title: IMG_1234 같은 파일명 대신 사진 속 장면을 따뜻하게 담은 짧은 한국어 제목
- location: 사진 배경으로 파악되는 장소·공간 (예: "모래사장 해변", "단풍 숲길", "거실 생일파티")
- season: 계절 유추 ("봄", "여름", "가을", "겨울", "사계절" 중 하나)
- mood: 분위기·감정 키워드 (예: "신남", "행복한 미소", "평화로움", "장난꾸러기")
- people: 인물 구성 (예: "아이 단독", "아이와 부모님", "가족 단체", "풍경·사물")
- objects: 사진 속 주요 사물·배경 단어 3~5개 배열 (예: ["바다", "모래성", "밀짚모자"])
- aiSummary: 3D 토끼가 아이에게 이야기해 줄 수 있는 다정한 한국어 1~2문장 설명
- tags: 검색용 핵심 키워드 6~8개 배열`,
        },
      ];

      batch.forEach((item, idx) => {
        const cleanB64 = item.aiThumbBase64.includes(',')
          ? item.aiThumbBase64.slice(item.aiThumbBase64.indexOf(',') + 1)
          : item.aiThumbBase64;
        parts.push({
          text: `[사진 index=${idx}] 원본이름="${item.fileName}", 앨범="${item.albumName}", 촬영일="${item.dateStr}"`,
        });
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanB64,
          },
        });
      });

      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                index: { type: Type.INTEGER },
                title: { type: Type.STRING },
                location: { type: Type.STRING },
                season: { type: Type.STRING },
                mood: { type: Type.STRING },
                people: { type: Type.STRING },
                objects: { type: Type.ARRAY, items: { type: Type.STRING } },
                aiSummary: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['index', 'title', 'location', 'aiSummary', 'tags'],
            },
          },
        },
      });

      const rawArr = JSON.parse((resp.text ?? '[]').trim()) as Array<{
        index: number;
        title?: string;
        location?: string;
        season?: string;
        mood?: string;
        people?: string;
        objects?: string[];
        aiSummary?: string;
        tags?: string[];
      }>;

      if (Array.isArray(rawArr) && rawArr.length > 0) {
        return batch.map((inputItem, idx) => {
          const found = rawArr.find((r) => r.index === idx) ?? rawArr[idx];
          if (!found || (!found.title && !found.aiSummary)) {
            return buildSmartLocalPhotoIndex(inputItem);
          }
          const mergedTags = Array.from(
            new Set([
              ...(found.tags ?? []),
              ...(found.objects ?? []),
              ...(found.season ? [found.season] : []),
              ...(found.mood ? [found.mood] : []),
              inputItem.albumName,
            ])
          ).slice(0, 10);

          return {
            photoId: inputItem.photoId,
            title: found.title?.trim() || inputItem.fileName,
            location: found.location?.trim() || inputItem.albumName,
            aiSummary: found.aiSummary?.trim() || '',
            season: found.season?.trim(),
            mood: found.mood?.trim(),
            people: found.people?.trim(),
            objects: found.objects,
            tags: mergedTags,
            analyzedByGemini: true,
          };
        });
      }
    } catch {
      // Fall back to local smart indexing if quota/network error occurs
    }
  }

  return batch.map((item) => buildSmartLocalPhotoIndex(item));
}

/**
 * Loads any photo (`data:`, `blob:`, Synology NAS share, OneDrive, Google Photos, Google Drive)
 * and downscales to a compact max-768px JPEG base64 payload for fast Gemini Vision analysis.
 */
export async function extractPhotoBase64ForVision(
  photo: PhotoItem,
  sharePassword?: string
): Promise<{ base64Data: string; mimeType: string } | null> {
  if (typeof document === 'undefined') return null;

  const downscaleImgSourceToJpeg = (imgSrc: string, revokeAfter = false): Promise<string | null> =>
    new Promise((resolve) => {
      const img = new Image();
      if (!imgSrc.startsWith('data:') && !imgSrc.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
        img.referrerPolicy = 'no-referrer';
      }
      const timer = window.setTimeout(() => {
        if (revokeAfter && imgSrc.startsWith('blob:')) URL.revokeObjectURL(imgSrc);
        resolve(null);
      }, 12000);

      img.onload = () => {
        window.clearTimeout(timer);
        try {
          const maxDim = 768;
          let { naturalWidth: w, naturalHeight: h } = img;
          if (!w || !h) {
            resolve(null);
            return;
          }
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.max(1, Math.round(w * ratio));
            h = Math.max(1, Math.round(h * ratio));
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(null);
      };

      img.src = imgSrc;
    });

  // 1) Local gallery `data:` or `blob:` URL
  if (photo.src.startsWith('data:') || photo.src.startsWith('blob:')) {
    const resized = await downscaleImgSourceToJpeg(photo.src);
    if (resized) return { base64Data: resized, mimeType: 'image/jpeg' };
    if (photo.src.startsWith('data:image/')) {
      return { base64Data: photo.src, mimeType: 'image/jpeg' };
    }
    return null;
  }

  const candidateUrls = [
    photo.src,
    ...(photo.assetUrl ? [photo.assetUrl] : []),
    ...(photo.fallbackUrls ?? []),
  ].filter((u) => /^https?:\/\//i.test(u));

  // 2) Native Android: fetch via CapacitorHttp (handles Synology share cookies, OneDrive, Google redirects, CORS!)
  if (Capacitor.isNativePlatform() && candidateUrls.length > 0) {
    let headers = photo.nativeHeaders;
    if (!headers && /passphrase=([^&]+)/i.test(photo.src)) {
      const m = photo.src.match(/passphrase=([^&]+)/i);
      if (m?.[1]) headers = { 'X-SYNO-SHARING': decodeURIComponent(m[1]) };
    }
    const blobUrl = await fetchImageViaNativeHttp(candidateUrls, headers, sharePassword);
    if (blobUrl) {
      const resized = await downscaleImgSourceToJpeg(blobUrl, false);
      if (resized) return { base64Data: resized, mimeType: 'image/jpeg' };
    }
  }

  // 3) Web browser fallback (`fetch` blob or CORS `<img>`)
  for (const url of candidateUrls) {
    try {
      const r = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
      if (r.ok) {
        const blob = await r.blob();
        if (blob.type.startsWith('image/') && blob.size > 128) {
          const tempUrl = URL.createObjectURL(blob);
          const resized = await downscaleImgSourceToJpeg(tempUrl, true);
          URL.revokeObjectURL(tempUrl);
          if (resized) return { base64Data: resized, mimeType: 'image/jpeg' };
        }
      }
    } catch {
      // Try direct Image load next
    }
    const directResized = await downscaleImgSourceToJpeg(url);
    if (directResized) return { base64Data: directResized, mimeType: 'image/jpeg' };
  }

  return null;
}

export async function refreshMartEventsUnified(city: string): Promise<string[]> {
  const exactSchedule = computeKoreanMartHolidaySummary(city, new Date());
  const exactHeaderLines = [
    `[${exactSchedule.regionLabel} 대형마트 정확 휴무일] 이마트·롯데마트·홈플러스 이번 달 ${exactSchedule.thisMonthHolidayListText} 의무휴무 (${exactSchedule.thisSundayStatusText})`,
    `[코스트코 정확 휴무일] ${exactSchedule.costcoNote} · 다음 달 마트 의무휴무: ${exactSchedule.nextMonthHolidayListText}`,
  ];

  const backend = await tryBackendJson<{ items?: string[] }>('/api/gemini/mart-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city }),
  }, 7000);
  if (backend.ok && backend.data.items && backend.data.items.length > 0) {
    return [...exactHeaderLines, ...backend.data.items.slice(0, 3)];
  }

  const ai = getClientGemini();
  if (ai) {
    try {
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `현재 지역: ${city}
이번 달 확정 대형마트 의무휴무 날짜: ${exactSchedule.thisMonthHolidayListText} (${exactSchedule.ruleLabel}, ${exactSchedule.thisSundayStatusText})
위 정확한 날짜를 반영해 부모님을 위한 주간 가족 장보기 제철 식재료·육아용품 쇼핑 팁 2줄을 JSON { "items": ["..."] } 형식으로 작성해 주세요.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
        },
      });
      const parsed = JSON.parse((resp.text ?? '{}').trim()) as { items?: string[] };
      if (parsed.items && parsed.items.length > 0) {
        return [...exactHeaderLines, ...parsed.items.slice(0, 2)];
      }
    } catch {
      // fall through
    }
  }

  return [
    ...exactHeaderLines,
    `[주말 가족 장보기] 제철 과일·한우·우리 아이 우유·간식 주말 특가전 운영 중`,
    `[하나로마트·전통시장] 의무휴무 적용 제외 매장은 주말에도 정상 영업 이용 가능`,
  ];
}

// ============================================================================
// 6. REAL CLOUD & NAS PUBLIC SHARE-LINK PHOTO RESOLVER (Zero Fake Samples!)
//    Supports: Google Photos Shared Album, Google Drive Shared Folder/File,
//              OneDrive Shared Folder/File (1drv.ms / Badger API),
//              Synology Photos & Synology File Station Share Links, Direct Image URLs
// ============================================================================

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// In-memory LRU cache so native-downloaded Blob URLs aren't re-fetched on every slide cycle!
const NATIVE_IMAGE_BLOB_CACHE = new Map<string, string>();
const MAX_BLOB_CACHE_ENTRIES = 70;

// Tracks Synology public share sessions unlocked in this app run (`entryUrl|passphrase` -> auth metadata).
// Crucial after APK updates or app restarts because Java CookieManager is in-memory!
const AUTHENTICATED_SYNO_SHARES = new Map<
  string,
  { authenticatedAt: number; sharingSid?: string }
>();
const SYNO_SHARE_AUTH_INFLIGHT = new Map<string, Promise<string | undefined>>();

async function ensureSynologyShareAuthenticated(
  rawImgUrl: string,
  customHeaders?: Record<string, string>,
  sharePassword?: string,
  forceRefresh = false
): Promise<{ updatedUrl: string; headers: Record<string, string> }> {
  const mergedHeaders: Record<string, string> = { ...(customHeaders ?? {}) };

  if (!/\/webapi\/entry\.cgi/i.test(rawImgUrl)) {
    return { updatedUrl: rawImgUrl, headers: mergedHeaders };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawImgUrl);
  } catch {
    return { updatedUrl: rawImgUrl, headers: mergedHeaders };
  }

  const passphrase =
    parsedUrl.searchParams.get('passphrase') ||
    parsedUrl.searchParams.get('sharing_id') ||
    mergedHeaders['X-SYNO-SHARING'] ||
    mergedHeaders['x-syno-sharing'] ||
    '';

  if (!passphrase) {
    return { updatedUrl: rawImgUrl, headers: mergedHeaders };
  }

  mergedHeaders['X-SYNO-SHARING'] = passphrase;
  const entryBaseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
  const shareKey = `${entryBaseUrl}::${passphrase}`;

  const existing = AUTHENTICATED_SYNO_SHARES.get(shareKey);
  const ttlMs = 20 * 60 * 1000;
  if (!forceRefresh && existing && Date.now() - existing.authenticatedAt < ttlMs) {
    if (existing.sharingSid && parsedUrl.searchParams.has('sharing_id')) {
      parsedUrl.searchParams.set('_sharing_sid', existing.sharingSid);
    }
    return { updatedUrl: parsedUrl.toString(), headers: mergedHeaders };
  }

  let inflight = SYNO_SHARE_AUTH_INFLIGHT.get(shareKey);
  if (!inflight || forceRefresh) {
    inflight = (async () => {
      let obtainedSharingSid: string | undefined;
      const isFolderSharing =
        parsedUrl.searchParams.has('sharing_id') ||
        /SYNO\.FolderSharing/i.test(parsedUrl.searchParams.get('api') || '');

      // 1) Authenticate Synology Photos Share (`SYNO.Foto.Sharing.Passphrase`) to populate CookieManager
      try {
        const fotoLogin = new URLSearchParams({
          api: 'SYNO.Foto.Sharing.Passphrase',
          version: '1',
          method: 'login',
          passphrase,
        });
        if (sharePassword?.trim()) {
          fotoLogin.set('password', sharePassword.trim());
        }
        await CapacitorHttp.post({
          url: entryBaseUrl,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': DESKTOP_USER_AGENT,
            'x-cap-user-agent': DESKTOP_USER_AGENT,
            'X-SYNO-SHARING': passphrase,
          },
          data: fotoLogin.toString(),
          connectTimeout: 8000,
          readTimeout: 8000,
        });
      } catch {
        // Ignore if NAS only runs FileStation sharing
      }

      // 2) Authenticate DSM File Station Share (`SYNO.Core.Sharing.Login`) if FolderSharing URL
      if (isFolderSharing) {
        try {
          const dsmEntry = `${parsedUrl.origin}/webapi/entry.cgi`;
          const fsLogin = new URLSearchParams({
            api: 'SYNO.Core.Sharing.Login',
            version: '1',
            method: 'login',
            sharing_id: passphrase,
          });
          if (sharePassword?.trim()) {
            fsLogin.set('password', sharePassword.trim());
          }
          const loginRes = await CapacitorHttp.post({
            url: dsmEntry,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': DESKTOP_USER_AGENT,
              'x-cap-user-agent': DESKTOP_USER_AGENT,
              'X-SYNO-SHARING': passphrase,
            },
            data: fsLogin.toString(),
            connectTimeout: 8000,
            readTimeout: 8000,
          });
          const loginObj = (
            typeof loginRes.data === 'string' ? JSON.parse(loginRes.data) : loginRes.data
          ) as { data?: { sharing_sid?: string } } | undefined;
          if (loginObj?.data?.sharing_sid) {
            obtainedSharingSid = loginObj.data.sharing_sid;
          }
        } catch {
          // Ignore FileStation login error
        }
      }

      AUTHENTICATED_SYNO_SHARES.set(shareKey, {
        authenticatedAt: Date.now(),
        sharingSid: obtainedSharingSid,
      });
      return obtainedSharingSid;
    })().finally(() => {
      SYNO_SHARE_AUTH_INFLIGHT.delete(shareKey);
    });

    SYNO_SHARE_AUTH_INFLIGHT.set(shareKey, inflight);
  }

  const sid = await inflight;
  if (sid && parsedUrl.searchParams.has('sharing_id')) {
    parsedUrl.searchParams.set('_sharing_sid', sid);
  }
  return { updatedUrl: parsedUrl.toString(), headers: mergedHeaders };
}

/**
 * Fetches an image binary natively via CapacitorHttp (preserving Java CookieManager sessions,
 * auto-unlocking Synology Share passphrases after app restarts/updates, following redirects, and self-signed NAS SSL!)
 * and returns a fast `blob:` ObjectURL.
 */
export async function fetchImageViaNativeHttp(
  candidateUrls: string[],
  customHeaders?: Record<string, string>,
  sharePassword?: string
): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const uniqueUrls = Array.from(new Set(candidateUrls.filter((u) => /^https?:\/\//i.test(u))));
  if (uniqueUrls.length === 0) return null;

  const cacheKey = `${uniqueUrls[0]}::${JSON.stringify(customHeaders ?? {})}`;
  const cached = NATIVE_IMAGE_BLOB_CACHE.get(cacheKey);
  if (cached) return cached;

  for (const rawCandidateUrl of uniqueUrls) {
    const isSynoShareUrl =
      /\/webapi\/entry\.cgi/i.test(rawCandidateUrl) &&
      (/passphrase=|sharing_id=/i.test(rawCandidateUrl) ||
        Boolean(customHeaders?.['X-SYNO-SHARING']));

    // Allow 1 automatic re-auth retry if a Synology session cookie expired mid-run
    const maxAttempts = isSynoShareUrl ? 2 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const prepared = isSynoShareUrl
          ? await ensureSynologyShareAuthenticated(
              rawCandidateUrl,
              customHeaders,
              sharePassword,
              attempt > 0
            )
          : { updatedUrl: rawCandidateUrl, headers: { ...(customHeaders ?? {}) } };

        const res = await CapacitorHttp.get({
          url: prepared.updatedUrl,
          headers: {
            'User-Agent': DESKTOP_USER_AGENT,
            'x-cap-user-agent': DESKTOP_USER_AGENT,
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            ...prepared.headers,
          },
          responseType: 'blob',
          connectTimeout: 12000,
          readTimeout: 16000,
        });

        if (
          res.status >= 200 &&
          res.status < 300 &&
          typeof res.data === 'string' &&
          res.data.length > 64
        ) {
          let cType = '';
          if (res.headers) {
            for (const [k, v] of Object.entries(res.headers)) {
              if (k.toLowerCase() === 'content-type') {
                cType = String(v).toLowerCase();
                break;
              }
            }
          }
          if (cType.includes('text/html') || cType.includes('application/json')) {
            // Session expired or login page returned -> retry once with forced Synology re-auth if applicable
            continue;
          }

          // Strip possible `data:image/...;base64,` prefix before `atob`!
          const strippedDataPrefix = res.data.includes(',')
            ? res.data.slice(res.data.indexOf(',') + 1)
            : res.data;
          const cleanB64 = strippedDataPrefix.replace(/[^A-Za-z0-9+/=]/g, '');

          if (
            cleanB64.length < 64 ||
            cleanB64.startsWith('PCFET0') ||
            cleanB64.startsWith('PGh0bW') ||
            cleanB64.startsWith('eyJ')
          ) {
            // Base64 of `<!DO`, `<htm`, or `{"` -> HTML/JSON error body, not an image!
            continue;
          }

          const binaryStr = atob(cleanB64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }

          const mime =
            cType && cType.startsWith('image/')
              ? cType.split(';')[0].trim()
              : cleanB64.startsWith('iVBOR')
              ? 'image/png'
              : cleanB64.startsWith('UklGR')
              ? 'image/webp'
              : cleanB64.startsWith('R0lGO')
              ? 'image/gif'
              : 'image/jpeg';

          const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));

          if (NATIVE_IMAGE_BLOB_CACHE.size >= MAX_BLOB_CACHE_ENTRIES) {
            const oldestKey = NATIVE_IMAGE_BLOB_CACHE.keys().next().value;
            if (oldestKey) {
              const oldUrl = NATIVE_IMAGE_BLOB_CACHE.get(oldestKey);
              if (oldUrl) URL.revokeObjectURL(oldUrl);
              NATIVE_IMAGE_BLOB_CACHE.delete(oldestKey);
            }
          }
          NATIVE_IMAGE_BLOB_CACHE.set(cacheKey, blobUrl);
          return blobUrl;
        }
      } catch {
        // Retry or move to next candidate URL
      }
    }
  }

  return null;
}

interface RawHttpResult {
  status: number;
  url: string;
  headers: Record<string, string>;
  text: string;
  json?: unknown;
}

async function rawGet(
  targetUrl: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 11000
): Promise<RawHttpResult> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url: targetUrl,
      headers: {
        'User-Agent': DESKTOP_USER_AGENT,
        'x-cap-user-agent': DESKTOP_USER_AGENT,
        Accept: 'text/html,application/json,*/*;q=0.9',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        ...extraHeaders,
      },
      responseType: 'text',
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    let parsedJson: unknown;
    try {
      parsedJson = typeof res.data === 'object' ? res.data : JSON.parse(text);
    } catch {
      parsedJson = undefined;
    }
    const normHeaders: Record<string, string> = {};
    if (res.headers) {
      for (const [k, v] of Object.entries(res.headers)) {
        normHeaders[k.toLowerCase()] = String(v);
      }
    }
    return {
      status: res.status,
      url: res.url || targetUrl,
      headers: normHeaders,
      text,
      json: parsedJson,
    };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: extraHeaders,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      parsedJson = undefined;
    }
    const normHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      normHeaders[k.toLowerCase()] = v;
    });
    return {
      status: res.status,
      url: res.url || targetUrl,
      headers: normHeaders,
      text,
      json: parsedJson,
    };
  } finally {
    window.clearTimeout(timer);
  }
}

async function rawPost(
  targetUrl: string,
  body: string | Record<string, unknown>,
  contentType: 'application/json' | 'application/x-www-form-urlencoded',
  extraHeaders: Record<string, string> = {},
  timeoutMs = 11000
): Promise<RawHttpResult> {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.post({
      url: targetUrl,
      headers: {
        'Content-Type': contentType,
        'User-Agent': DESKTOP_USER_AGENT,
        'x-cap-user-agent': DESKTOP_USER_AGENT,
        Accept: 'application/json,text/plain,*/*',
        ...extraHeaders,
      },
      data: contentType === 'application/json' && typeof body === 'object' ? body : bodyStr,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    let parsedJson: unknown;
    try {
      parsedJson = typeof res.data === 'object' ? res.data : JSON.parse(text);
    } catch {
      parsedJson = undefined;
    }
    const normHeaders: Record<string, string> = {};
    if (res.headers) {
      for (const [k, v] of Object.entries(res.headers)) {
        normHeaders[k.toLowerCase()] = String(v);
      }
    }
    return {
      status: res.status,
      url: res.url || targetUrl,
      headers: normHeaders,
      text,
      json: parsedJson,
    };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': contentType, ...extraHeaders },
      body: bodyStr,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      parsedJson = undefined;
    }
    const normHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      normHeaders[k.toLowerCase()] = v;
    });
    return {
      status: res.status,
      url: res.url || targetUrl,
      headers: normHeaders,
      text,
      json: parsedJson,
    };
  } finally {
    window.clearTimeout(timer);
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\x3d/gi, '=')
    .replace(/\\x26/gi, '&')
    .replace(/\\x22/gi, '"');
}

function extractOgMeta(html: string, prop: string): string {
  const re1 = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m1 = html.match(re1);
  if (m1?.[1]) return decodeHtmlEntities(m1[1].trim());
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i');
  const m2 = html.match(re2);
  if (m2?.[1]) return decodeHtmlEntities(m2[1].trim());
  return '';
}

function encodeOneDriveShareToken(shareUrl: string): string {
  const utf8Bytes = new TextEncoder().encode(shareUrl.trim());
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const b64 = btoa(binary).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  return `u!${b64}`;
}

export interface ResolvedShareAlbumResult {
  provider: StorageProvider;
  albumTitle: string;
  resolvedUrl: string;
  photos: PhotoItem[];
}

/**
 * Resolves actual user photos from a public share link (Google Photos, Google Drive, OneDrive, Synology Photos/FileStation, or direct image URL).
 * NEVER returns built-in sample photos! Throws a clear Korean error if 0 real photos are accessible.
 */
export async function resolvePublicShareLinkUnified(params: {
  url: string;
  customTitle?: string;
  password?: string;
  albumId: string;
  maxCount?: number;
}): Promise<ResolvedShareAlbumResult> {
  const syncCfg = getSavedPhotoSyncConfig();
  const targetMax = Math.max(1, Math.min(500, params.maxCount ?? syncCfg.maxPhotoFetchCount));

  let rawUrl = params.url.trim();
  if (!rawUrl) {
    throw new Error('공유 링크 URL을 입력해 주세요.');
  }
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = `https://${rawUrl}`;
  }

  // 1) Try backend resolver first if running on Web or connected to a home PC/NAS server
  const backend = await tryBackendJson<{
    provider?: StorageProvider;
    title?: string;
    url?: string;
    photos?: PhotoItem[];
    error?: string;
  }>(
    '/api/storage/share-link',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: rawUrl,
        albumName: params.customTitle,
        password: params.password,
        albumId: params.albumId,
        maxCount: targetMax,
      }),
    },
    14000
  );

  if (backend.ok && Array.isArray(backend.data.photos) && backend.data.photos.length > 0) {
    const latestBackend = selectLatestItems(backend.data.photos, {
      maxCount: targetMax,
      getTimestampMs: (p) => inferTimestampFromNameOrDate(p.title, p.date),
    }).map((item) => ({
      ...item,
      id: buildStablePhotoId(params.albumId, item.id || item.src),
      albumId: params.albumId,
    }));
    return {
      provider: backend.data.provider || 'share_link',
      albumTitle: backend.data.title || params.customTitle?.trim() || '공유 사진 앨범',
      resolvedUrl: backend.data.url || rawUrl,
      photos: latestBackend,
    };
  }
  if (!Capacitor.isNativePlatform() && !backend.ok && backend.errorMsg) {
    throw new Error(backend.errorMsg);
  }

  const todayLabel = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // ==========================================================================
  // CASE A: Direct Image URL (.jpg, .jpeg, .png, .webp, .gif)
  // ==========================================================================
  if (/\.(jpe?g|png|webp|gif|bmp)(\?.*)?$/i.test(rawUrl)) {
    const title = params.customTitle?.trim() || '직접 등록한 사진 앨범';
    return {
      provider: 'share_link',
      albumTitle: title,
      resolvedUrl: rawUrl,
      photos: [
        {
          id: buildStablePhotoId(params.albumId, rawUrl),
          albumId: params.albumId,
          albumName: title,
          provider: 'share_link',
          src: rawUrl,
          title,
          date: todayLabel,
          location: title,
          tags: ['공유사진', title],
          aiSummary: `${title}에서 불러온 사진입니다.`,
        },
      ],
    };
  }

  // ==========================================================================
  // CASE B: Google Photos Shared Album / Photo (photos.app.goo.gl / photos.google.com)
  // ==========================================================================
  if (/photos\.app\.goo\.gl|photos\.google\.com/i.test(rawUrl)) {
    const page = await rawGet(rawUrl);
    const cleanedHtml = decodeHtmlEntities(page.text);
    const ogTitle = extractOgMeta(page.text, 'og:title')
      .replace(/\s*-\s*Google\s*(Photos|포토).*$/i, '')
      .trim();
    const albumTitle = params.customTitle?.trim() || ogTitle || 'Google 포토 공유 앨범';

    // Extract all genuine Google Photos shared media URLs (`lh3.googleusercontent.com/pw/...` or `.../AF1Qip...`)
    const urlSet = new Set<string>();
    const pwRegex = /https:\/\/lh3\.googleusercontent\.com\/pw\/[a-zA-Z0-9_-]{24,}/g;
    const afRegex = /https:\/\/lh3\.googleusercontent\.com\/(?:[a-zA-Z0-9_-]+\/)?AF1Qip[a-zA-Z0-9_-]{18,}/g;
    const collectGooglePhotosUrls = (txt: string) => {
      for (const m of txt.matchAll(pwRegex)) urlSet.add(m[0]);
      for (const m of txt.matchAll(afRegex)) urlSet.add(m[0]);
    };
    collectGooglePhotosUrls(cleanedHtml);

    // Paginate Google Photos shared album continuation tokens (`batchexecute` `snAcKc`) when >100 photos requested!
    if (urlSet.size > 0 && urlSet.size < targetMax * 1.3) {
      try {
        const resolvedPageUrl = page.url || rawUrl;
        const albumIdMatch = resolvedPageUrl.match(/\/share\/([a-zA-Z0-9_-]{15,})/);
        const keyMatch = resolvedPageUrl.match(/[?&]key=([a-zA-Z0-9_-]{10,})/);
        const initTokenMatch = page.text.match(/"(C[a-zA-Z0-9_-]{45,260}={0,2})"/);

        if (albumIdMatch?.[1] && keyMatch?.[1] && initTokenMatch?.[1]) {
          const shareAlbumId = albumIdMatch[1];
          const shareAuthKey = keyMatch[1];
          let nextToken = initTokenMatch[1];
          const seenTokens = new Set<string>();

          for (let pageIdx = 0; pageIdx < 6 && nextToken && urlSet.size < Math.max(targetMax * 2, 550); pageIdx++) {
            if (seenTokens.has(nextToken)) break;
            seenTokens.add(nextToken);

            const rpcInner = JSON.stringify([shareAlbumId, nextToken, null, shareAuthKey]);
            const fReq = JSON.stringify([[['snAcKc', rpcInner, null, 'generic']]]);
            const form = new URLSearchParams({ 'f.req': fReq });
            const batchRes = await rawPost(
              'https://photos.google.com/_/PhotosUi/data/batchexecute?rpcids=snAcKc&hl=ko',
              form.toString(),
              'application/x-www-form-urlencoded'
            );
            if (batchRes.status < 200 || batchRes.status >= 300 || !batchRes.text) break;

            const unescapedBatch = decodeHtmlEntities(batchRes.text.replace(/\\"/g, '"'));
            const beforeCount = urlSet.size;
            collectGooglePhotosUrls(unescapedBatch);
            if (urlSet.size === beforeCount) break;

            const nextTokCandidates = Array.from(
              unescapedBatch.matchAll(/"(C[a-zA-Z0-9_-]{45,260}={0,2})"/g)
            ).map((m) => m[1]);
            const freshTok = nextTokCandidates.find((t) => !seenTokens.has(t));
            if (!freshTok) break;
            nextToken = freshTok;
          }
        }
      } catch {
        // Keep already collected URLs safely
      }
    }

    // Single-photo share fallback via og:image (exclude Google logo/avatar `/a/` URLs)
    if (urlSet.size === 0) {
      const ogImg = extractOgMeta(page.text, 'og:image');
      if (ogImg && ogImg.includes('googleusercontent.com') && !ogImg.includes('/a/')) {
        const base = ogImg.split('=')[0];
        urlSet.add(base);
      }
    }

    const allBaseUrls = Array.from(urlSet);
    if (allBaseUrls.length === 0) {
      throw new Error(
        '구글 포토 공유 링크에서 사진을 찾지 못했습니다. 구글 포토 앱에서 [앨범 공유 → 링크 생성(링크가 있는 모든 사용자 보기 허용)] 상태인지 확인해 주세요.'
      );
    }

    // Google Photos shared albums typically list oldest -> newest; reverse when no timestamp so newest photos are selected first!
    const latestUrls = selectLatestItems(allBaseUrls, {
      maxCount: targetMax,
      assumeReverseChronologicalWhenNoTimestamp: false,
    });

    const photos: PhotoItem[] = latestUrls.map((baseUrl, idx) => ({
      id: buildStablePhotoId(params.albumId, baseUrl),
      albumId: params.albumId,
      albumName: albumTitle,
      provider: 'google_drive',
      src: `${baseUrl}=w1600-h1600`,
      assetUrl: `${baseUrl}=w1920-h1080`,
      fallbackUrls: [`${baseUrl}=w1280-h1280`, `${baseUrl}=d`, baseUrl],
      title: `${albumTitle} #${idx + 1}`,
      date: todayLabel,
      location: albumTitle,
      tags: ['구글포토', albumTitle],
      aiSummary: `Google 포토 공유 앨범 "${albumTitle}"에서 불러온 실제 사진입니다.`,
    }));

    return {
      provider: 'google_drive',
      albumTitle,
      resolvedUrl: page.url || rawUrl,
      photos,
    };
  }

  // ==========================================================================
  // CASE C: Google Drive Shared Folder or File (drive.google.com)
  // ==========================================================================
  if (/drive\.google\.com|docs\.google\.com/i.test(rawUrl)) {
    const folderMatch =
      rawUrl.match(/\/folders\/([a-zA-Z0-9_-]{15,})/) ||
      (rawUrl.includes('folders') ? rawUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/) : null);

    // C-1: Single shared image file on Google Drive
    if (!folderMatch) {
      const fileMatch =
        rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/) ||
        rawUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
      if (fileMatch?.[1]) {
        const fileId = fileMatch[1];
        const albumTitle = params.customTitle?.trim() || 'Google Drive 공유 사진';
        return {
          provider: 'google_drive',
          albumTitle,
          resolvedUrl: rawUrl,
          photos: [
            {
              id: buildStablePhotoId(params.albumId, fileId),
              albumId: params.albumId,
              albumName: albumTitle,
              provider: 'google_drive',
              src: `https://drive.google.com/thumbnail?id=${fileId}&sz=w2560`,
              assetUrl: `https://lh3.googleusercontent.com/d/${fileId}=w2560`,
              fallbackUrls: [
                `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
                `https://drive.google.com/uc?export=view&id=${fileId}`,
              ],
              title: albumTitle,
              date: todayLabel,
              location: albumTitle,
              tags: ['구글드라이브', albumTitle],
              aiSummary: `Google Drive 공유 링크에서 불러온 실제 사진입니다.`,
            },
          ],
        };
      }
    }

    // C-2: Shared Folder on Google Drive
    if (folderMatch?.[1]) {
      const folderId = folderMatch[1];
      let albumTitle = params.customTitle?.trim() || '';
      const foundFiles = new Map<string, string>(); // fileId -> title

      // Strategy 1: Public embeddedfolderview endpoint (lightweight HTML listing all public files in the folder!)
      try {
        const embedRes = await rawGet(`https://drive.google.com/embeddedfolderview?id=${folderId}#grid`);
        if (!albumTitle) {
          const titleTag = embedRes.text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || '';
          if (titleTag && !/Google\s*Drive|로그인|Sign\s*in/i.test(titleTag)) {
            albumTitle = decodeHtmlEntities(titleTag);
          }
        }

        const entryBlockRegex =
          /id=["']entry-([a-zA-Z0-9_-]{20,})["']([\s\S]{0,900}?)class=["']flip-entry-title["']>([^<]+)</gi;
        for (const m of embedRes.text.matchAll(entryBlockRegex)) {
          const id = m[1];
          const innerHtml = m[2] || '';
          const fileName = decodeHtmlEntities(m[3].trim());
          const isSubfolder = /\/drive\/folders\/|folderview\?id=/i.test(innerHtml);
          if (
            id !== folderId &&
            !isSubfolder &&
            !/\.(mp4|mov|avi|mkv|pdf|zip|rar|7z|docx?|xlsx?|pptx?|txt|mp3|wav)$/i.test(fileName)
          ) {
            foundFiles.set(id, fileName);
          }
        }

        if (foundFiles.size === 0) {
          for (const m of embedRes.text.matchAll(/href=["']https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{20,})/gi)) {
            if (m[1] !== folderId) {
              foundFiles.set(m[1], `사진 #${foundFiles.size + 1}`);
            }
          }
        }
      } catch {
        // Continue to Strategy 2
      }

      // Strategy 2: Main folder page HTML (`_DRIVE_ivd` / `data-id` extraction) — also runs when Strategy 1 returned < targetMax!
      if (foundFiles.size < targetMax) {
        try {
          const folderRes = await rawGet(`https://drive.google.com/drive/folders/${folderId}`);
          const unescaped = decodeHtmlEntities(folderRes.text);
          if (!albumTitle) {
            const ogTitle = extractOgMeta(folderRes.text, 'og:title')
              .replace(/\s*-\s*Google\s*(Drive|드라이브).*$/i, '')
              .trim();
            if (ogTitle && !/로그인|Sign\s*in/i.test(ogTitle)) {
              albumTitle = ogTitle;
            }
          }

          const ivdImgRegex =
            /\["([a-zA-Z0-9_-]{25,45})"\s*,\s*\["[a-zA-Z0-9_-]+"\]\s*,\s*"([^"]+)"\s*,\s*"image\/[a-zA-Z0-9.+-]+"/g;
          for (const m of unescaped.matchAll(ivdImgRegex)) {
            if (m[1] !== folderId && !foundFiles.has(m[1])) {
              foundFiles.set(m[1], m[2]);
            }
          }

          if (foundFiles.size === 0) {
            const dataIdRegex = /data-id=["']([a-zA-Z0-9_-]{25,45})["']/g;
            for (const m of unescaped.matchAll(dataIdRegex)) {
              const id = m[1];
              if (id !== folderId) {
                foundFiles.set(id, `사진 #${foundFiles.size + 1}`);
              }
            }
          }
        } catch {
          // Handled below if empty
        }
      }

      if (!albumTitle) albumTitle = 'Google Drive 공유 폴더';

      const allEntries = Array.from(foundFiles.entries());
      if (allEntries.length === 0) {
        throw new Error(
          '구글 드라이브 폴더에서 이미지 파일을 찾지 못했습니다. 폴더 바로 안에 사진(JPG/PNG/WEBP)이 들어 있는지(하위 폴더가 아닌 해당 폴더 직접 공유), 공유 권한이 [링크가 있는 모든 사용자]인지 확인해 주세요.'
        );
      }

      const latestEntries = selectLatestItems(allEntries, {
        maxCount: targetMax,
        getTimestampMs: ([, fileName]) => inferTimestampFromNameOrDate(fileName),
        assumeReverseChronologicalWhenNoTimestamp: false,
      });

      const photos: PhotoItem[] = latestEntries.map(([fileId, fileName]) => ({
        id: buildStablePhotoId(params.albumId, fileId),
        albumId: params.albumId,
        albumName: albumTitle,
        provider: 'google_drive',
        src: `https://drive.google.com/thumbnail?id=${fileId}&sz=w2560`,
        assetUrl: `https://lh3.googleusercontent.com/d/${fileId}=w2560`,
        fallbackUrls: [
          `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
          `https://drive.google.com/uc?export=view&id=${fileId}`,
        ],
        title: fileName.replace(/\.[^.]+$/, ''),
        date: todayLabel,
        location: albumTitle,
        tags: ['구글드라이브', albumTitle],
        aiSummary: `Google Drive "${albumTitle}" 폴더에서 불러온 실제 사진입니다.`,
      }));

      return {
        provider: 'google_drive',
        albumTitle,
        resolvedUrl: rawUrl,
        photos,
      };
    }
  }

  // ==========================================================================
  // CASE D: Microsoft OneDrive / 1drv.ms Shared Folder or Photo
  // ==========================================================================
  if (/1drv\.ms|onedrive\.live\.com|sharepoint\.com/i.test(rawUrl)) {
    let finalShareUrl = rawUrl;
    try {
      const headFollow = await rawGet(rawUrl);
      if (headFollow.url) finalShareUrl = headFollow.url;
    } catch {
      // Keep original URL
    }

    let badgerToken = '';
    try {
      const tokenRes = await rawPost(
        'https://api-badgerp.svc.ms/v1.0/token',
        { appId: '5cbed6ac-a083-4e14-b191-b4ba07653de2' },
        'application/json'
      );
      const tokenObj = tokenRes.json as { token?: string } | undefined;
      if (tokenObj?.token) {
        badgerToken = tokenObj.token;
      }
    } catch {
      // Badger fallback below
    }

    interface OneDriveItem {
      id?: string;
      name?: string;
      createdDateTime?: string;
      file?: { mimeType?: string };
      image?: Record<string, unknown>;
      photo?: { takenDateTime?: string };
      location?: { latitude?: number; longitude?: number };
      '@content.downloadUrl'?: string;
      thumbnails?: Array<{ large?: { url?: string } }>;
      children?: OneDriveItem[];
      'children@odata.nextLink'?: string;
      '@odata.nextLink'?: string;
    }

    const candidateUrls = Array.from(new Set([rawUrl, finalShareUrl]));
    let rootItem: OneDriveItem | null = null;
    let activeOdHeaders: Record<string, string> = { Accept: 'application/json' };

    for (const candidate of candidateUrls) {
      const shareId = encodeOneDriveShareToken(candidate);
      const endpoints = [
        `https://my.microsoftpersonalcontent.com/_api/v2.0/shares/${shareId}/driveItem?$expand=children($top=200;$expand=thumbnails)`,
        `https://api.onedrive.com/v1.0/shares/${shareId}/driveItem?$expand=children($top=200;$expand=thumbnails)`,
      ];

      for (const ep of endpoints) {
        try {
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (badgerToken) {
            headers.Authorization = `Badger ${badgerToken}`;
            headers.Prefer = 'autoredeem';
          }
          const r = await rawGet(ep, headers);
          const data = r.json as OneDriveItem | undefined;
          if (r.status >= 200 && r.status < 300 && data && (data.children || data['@content.downloadUrl'])) {
            rootItem = data;
            activeOdHeaders = headers;
            break;
          }
        } catch {
          // Try next endpoint
        }
      }
      if (rootItem) break;
    }

    if (rootItem) {
      const albumTitle = params.customTitle?.trim() || rootItem.name || 'OneDrive 공유 앨범';
      const rawItems: OneDriveItem[] =
        Array.isArray(rootItem.children) && rootItem.children.length > 0
          ? [...rootItem.children]
          : [rootItem];

      // Follow OneDrive OData pagination (`children@odata.nextLink` -> `@odata.nextLink`) so 500+ photo folders load completely!
      let nextOdLink = rootItem['children@odata.nextLink'] || rootItem['@odata.nextLink'];
      const desiredOdPool = Math.min(1500, Math.max(targetMax * 2, 600));
      for (let page = 0; page < 8 && nextOdLink && rawItems.length < desiredOdPool; page++) {
        try {
          const nextRes = await rawGet(nextOdLink, activeOdHeaders);
          const nextData = nextRes.json as {
            value?: OneDriveItem[];
            '@odata.nextLink'?: string;
          } | undefined;
          if (nextRes.status >= 200 && nextRes.status < 300 && Array.isArray(nextData?.value) && nextData.value.length > 0) {
            rawItems.push(...nextData.value);
            nextOdLink = nextData['@odata.nextLink'];
          } else {
            break;
          }
        } catch {
          break;
        }
      }

      const imageItems = rawItems.filter((item) => {
        const dl = item['@content.downloadUrl'] || item.thumbnails?.[0]?.large?.url;
        if (!dl) return false;
        if (item.image || item.photo) return true;
        if (item.file?.mimeType?.startsWith('image/')) return true;
        return /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(item.name || '');
      });

      if (imageItems.length > 0) {
        const latestItems = selectLatestItems(imageItems, {
          maxCount: targetMax,
          getTimestampMs: (item) => {
            const dt = item.photo?.takenDateTime || item.createdDateTime;
            return dt ? Date.parse(dt) : inferTimestampFromNameOrDate(item.name);
          },
        });

        const photos: PhotoItem[] = latestItems.map((item, idx) => {
          const thumbLarge = item.thumbnails?.[0]?.large?.url || '';
          const directDl = item['@content.downloadUrl'] || '';
          const isHeic = /\.heic$/i.test(item.name || '');
          const primarySrc = isHeic && thumbLarge ? thumbLarge : directDl || thumbLarge;
          const backupSrc = isHeic ? directDl : thumbLarge || undefined;

          const lat = item.location?.latitude;
          const lng = item.location?.longitude;
          const geo =
            typeof lat === 'number' && typeof lng === 'number'
              ? reverseGeocodeKoreaLatLng(lat, lng)
              : null;

          const dateStr = item.photo?.takenDateTime
            ? new Date(item.photo.takenDateTime).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : todayLabel;
          return {
            id: buildStablePhotoId(params.albumId, item.id || item.name || String(idx)),
            albumId: params.albumId,
            albumName: albumTitle,
            provider: 'onedrive',
            src: primarySrc,
            assetUrl: backupSrc,
            title: (item.name || `사진 #${idx + 1}`).replace(/\.[^.]+$/, ''),
            date: dateStr,
            location: geo?.locationLabel || albumTitle,
            gpsLat: lat,
            gpsLng: lng,
            tags: Array.from(new Set(['원드라이브', albumTitle, ...(geo?.tags ?? [])])),
            aiSummary: `OneDrive "${albumTitle}" 공유 링크에서 불러온 실제 사진입니다.`,
          };
        });

        return {
          provider: 'onedrive',
          albumTitle,
          resolvedUrl: finalShareUrl,
          photos,
        };
      }
    }

    throw new Error(
      'OneDrive 공유 링크에서 사진을 불러오지 못했습니다. 원드라이브 공유 설정이 [링크가 있는 모든 사용자 보기 가능(비밀번호 없음)]인지, 폴더 안에 이미지 파일이 있는지 확인해 주세요.'
    );
  }

  // ==========================================================================
  // CASE E: Synology Photos & Synology File Station Share Links
  // ==========================================================================
  let resolvedSynoUrl = rawUrl;
  let initialLandingHtml = '';
  try {
    const landing = await rawGet(rawUrl);
    if (landing.url) resolvedSynoUrl = landing.url;
    initialLandingHtml = landing.text || '';
  } catch {
    // Keep rawUrl and still attempt API endpoints directly
  }

  const synoShareMatch = resolvedSynoUrl.match(
    /^(https?:\/\/[^/?#]+)((?:\/[^/?#]+)*?)\/(?:mo\/)?(?:fb)?sharing\/([a-zA-Z0-9_-]+)/i
  );

  if (synoShareMatch || /synology|gofile\.me|\/sharing\//i.test(resolvedSynoUrl)) {
    if (!synoShareMatch) {
      throw new Error(
        '시놀로지 공유 링크(QuickConnect/gofile.me) 리다이렉트 주소를 해석하지 못했습니다. 시놀로지 DDNS 주소(예: https://이름.synology.me:포트/mo/sharing/코드) 형태의 링크를 사용해 주세요.'
      );
    }

    const origin = synoShareMatch[1];
    const prefixPath = synoShareMatch[2] || '';
    const passphrase = synoShareMatch[3];
    const shareHeaders: Record<string, string> = {
      'X-SYNO-SHARING': passphrase,
    };

    const entryEndpoints = Array.from(
      new Set([
        ...(prefixPath ? [`${origin}${prefixPath}/webapi/entry.cgi`] : []),
        `${origin}/photo/webapi/entry.cgi`,
        `${origin}/webapi/entry.cgi`,
      ])
    );

    let detectedAlbumTitle = params.customTitle?.trim() || '';
    const desiredSynoPool = Math.min(2000, Math.max(targetMax * 2, 600));

    type SynoFotoBrowseItem = {
      id: number;
      filename?: string;
      type?: string;
      time?: number;
      additional?: {
        thumbnail?: { cache_key?: string; xl?: string; m?: string };
        address?: {
          country?: string;
          state?: string;
          county?: string;
          city?: string;
          town?: string;
          district?: string;
          village?: string;
          landmark?: string;
        };
      };
    };

    // E-1: Try Synology Photos Public Share API (`SYNO.Foto.Sharing.*` + paginated `SYNO.Foto.Browse.Item`)
    // NOTE: Synology Photos caps a single `SYNO.Foto.Browse.Item` call at 100 items!
    // We loop `offset = 0, 100, 200, ...` so 500-photo requests fetch all 500+ items cleanly!
    for (const entryUrl of entryEndpoints) {
      try {
        const loginBody = new URLSearchParams({
          api: 'SYNO.Foto.Sharing.Passphrase',
          version: '1',
          method: 'login',
          passphrase,
        });
        if (params.password?.trim()) {
          loginBody.set('password', params.password.trim());
        }
        await rawPost(entryUrl, loginBody.toString(), 'application/x-www-form-urlencoded', shareHeaders).catch(
          () => null
        );

        if (!detectedAlbumTitle) {
          const infoBody = new URLSearchParams({
            api: 'SYNO.Foto.Sharing.Misc',
            version: '1',
            method: 'get_info',
            passphrase,
          });
          const infoRes = await rawPost(
            entryUrl,
            infoBody.toString(),
            'application/x-www-form-urlencoded',
            shareHeaders
          ).catch(() => null);
          const infoJson = infoRes?.json as { data?: { album?: { name?: string }; name?: string } } | undefined;
          const fetchedName = infoJson?.data?.album?.name || infoJson?.data?.name;
          if (fetchedName) detectedAlbumTitle = fetchedName;
        }

        const pageSize = 100;
        let workingVersion = '1';
        let workingAdditional = '["thumbnail","address"]';
        const allSynoItems: SynoFotoBrowseItem[] = [];
        const seenSynoIds = new Set<number>();

        for (let offset = 0; offset < desiredSynoPool; offset += pageSize) {
          const makePageBody = (ver: string, addFields: string) =>
            new URLSearchParams({
              api: 'SYNO.Foto.Browse.Item',
              version: ver,
              method: 'list',
              offset: String(offset),
              limit: String(pageSize),
              additional: addFields,
              passphrase,
            });

          let listRes = await rawPost(
            entryUrl,
            makePageBody(workingVersion, workingAdditional).toString(),
            'application/x-www-form-urlencoded',
            shareHeaders
          );
          let listJson = listRes.json as {
            success?: boolean;
            data?: { list?: SynoFotoBrowseItem[] };
          } | undefined;

          if (!listJson?.success && offset === 0) {
            // Try fallback without "address" or version 2 depending on DSM version
            workingAdditional = '["thumbnail"]';
            listRes = await rawPost(
              entryUrl,
              makePageBody('1', workingAdditional).toString(),
              'application/x-www-form-urlencoded',
              shareHeaders
            );
            listJson = listRes.json as typeof listJson;

            if (!listJson?.success) {
              workingVersion = '2';
              listRes = await rawPost(
                entryUrl,
                makePageBody('2', '["thumbnail","address"]').toString(),
                'application/x-www-form-urlencoded',
                shareHeaders
              );
              listJson = listRes.json as typeof listJson;
              if (listJson?.success) {
                workingAdditional = '["thumbnail","address"]';
              } else {
                listRes = await rawPost(
                  entryUrl,
                  makePageBody('2', '["thumbnail"]').toString(),
                  'application/x-www-form-urlencoded',
                  shareHeaders
                );
                listJson = listRes.json as typeof listJson;
              }
            }
          }

          if (!listJson?.success || !Array.isArray(listJson.data?.list) || listJson.data.list.length === 0) {
            break;
          }

          let newAddedOnPage = 0;
          for (const item of listJson.data.list) {
            if (!seenSynoIds.has(item.id)) {
              seenSynoIds.add(item.id);
              allSynoItems.push(item);
              newAddedOnPage += 1;
            }
          }

          if (listJson.data.list.length < pageSize || newAddedOnPage === 0) {
            break;
          }
        }

        if (allSynoItems.length > 0) {
          const albumTitle = detectedAlbumTitle || 'Synology Photos 공유 앨범';
          const photoItems = allSynoItems.filter((it) => it.type !== 'video');
          if (photoItems.length > 0) {
            const latestSyno = selectLatestItems(photoItems, {
              maxCount: targetMax,
              getTimestampMs: (it) =>
                it.time ? it.time * 1000 : inferTimestampFromNameOrDate(it.filename),
            });

            const photos: PhotoItem[] = latestSyno.map((item, idx) => {
              const thumbInfo = item.additional?.thumbnail;
              const cacheKey = thumbInfo?.cache_key || `${item.id}_0`;
              const xlReady = !thumbInfo?.xl || thumbInfo.xl === 'ready';

              const addr = item.additional?.address;
              const addrParts = [
                addr?.state,
                addr?.city || addr?.county,
                addr?.district || addr?.town || addr?.village,
                addr?.landmark,
              ]
                .map((s) => (s || '').trim())
                .filter(Boolean);
              const dedupAddrParts = Array.from(new Set(addrParts));
              const synoLocationLabel =
                dedupAddrParts.length > 0 ? dedupAddrParts.slice(0, 2).join(' ') : albumTitle;

              const makeSynoThumbUrl = (ver: string, size: string) => {
                const p = new URLSearchParams({
                  api: 'SYNO.Foto.Thumbnail',
                  version: ver,
                  method: 'get',
                  mode: 'download',
                  id: String(item.id),
                  type: 'unit',
                  size,
                  cache_key: cacheKey,
                  passphrase,
                });
                return `${entryUrl}?${p.toString()}`;
              };

              const rawDownloadParams = new URLSearchParams({
                api: 'SYNO.Foto.Download',
                version: '1',
                method: 'download',
                unit_id: `[${item.id}]`,
                passphrase,
              });

              // Keep raw original JPEG download in fallbackUrls AND allow NativePhotoOptimizer to extract EXIF!
              const orderedCandidates = xlReady
                ? [
                    makeSynoThumbUrl('2', 'xl'),
                    makeSynoThumbUrl('1', 'xl'),
                    makeSynoThumbUrl('2', 'm'),
                    makeSynoThumbUrl('1', 'm'),
                    `${entryUrl}?${rawDownloadParams.toString()}`,
                  ]
                : [
                    makeSynoThumbUrl('2', 'm'),
                    makeSynoThumbUrl('1', 'm'),
                    makeSynoThumbUrl('2', 'xl'),
                    `${entryUrl}?${rawDownloadParams.toString()}`,
                  ];

              const dateStr = item.time
                ? new Date(item.time * 1000).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : todayLabel;

              return {
                id: buildStablePhotoId(params.albumId, `synofoto-${item.id}`),
                albumId: params.albumId,
                albumName: albumTitle,
                provider: 'synology_api',
                src: orderedCandidates[0],
                assetUrl: orderedCandidates[1],
                fallbackUrls: orderedCandidates.slice(2),
                nativeHeaders: {
                  'X-SYNO-SHARING': passphrase,
                },
                title: (item.filename || `사진 #${idx + 1}`).replace(/\.[^.]+$/, ''),
                date: dateStr,
                takenTimestampMs: item.time ? item.time * 1000 : undefined,
                location: synoLocationLabel,
                tags: Array.from(new Set(['시놀로지포토', albumTitle, ...dedupAddrParts])),
                aiSummary: `Synology Photos "${albumTitle}" 공유 앨범(${synoLocationLabel})에서 불러온 실제 사진입니다.`,
              };
            });

            return {
              provider: 'synology_api',
              albumTitle,
              resolvedUrl: resolvedSynoUrl,
              photos,
            };
          }
        }
      } catch {
        // Try next entryUrl or FileStation share API
      }
    }

    // E-2: Try Synology DSM File Station Folder/File Share API (`SYNO.Core.Sharing.Login` + paginated `SYNO.FolderSharing.List`)
    try {
      const dsmEntry = `${origin}/webapi/entry.cgi`;
      const fsLogin = new URLSearchParams({
        api: 'SYNO.Core.Sharing.Login',
        version: '1',
        method: 'login',
        sharing_id: passphrase,
      });
      if (params.password?.trim()) {
        fsLogin.set('password', params.password.trim());
      }
      const loginRes = await rawPost(dsmEntry, fsLogin.toString(), 'application/x-www-form-urlencoded', shareHeaders);
      const loginJson = loginRes.json as {
        success?: boolean;
        data?: { sharing_sid?: string };
      } | undefined;

      const sharingSid = loginJson?.data?.sharing_sid || '';
      type SynoSharedFile = {
        name: string;
        path: string;
        isdir?: boolean;
        additional?: { time?: { mtime?: number } };
      };
      const allSharedFiles: SynoSharedFile[] = [];
      const fsPageSize = 200;

      for (let offset = 0; offset < desiredSynoPool; offset += fsPageSize) {
        const fsListParams = new URLSearchParams({
          api: 'SYNO.FolderSharing.List',
          version: '2',
          method: 'list',
          sharing_id: passphrase,
          offset: String(offset),
          limit: String(fsPageSize),
          sort_by: 'mtime',
          sort_direction: 'desc',
          additional: '["time"]',
        });
        if (sharingSid) fsListParams.set('_sharing_sid', sharingSid);

        const fsListRes = await rawPost(
          dsmEntry,
          fsListParams.toString(),
          'application/x-www-form-urlencoded',
          shareHeaders
        );
        const fsListJson = fsListRes.json as {
          success?: boolean;
          data?: {
            total?: number;
            files?: SynoSharedFile[];
          };
        } | undefined;

        const batchFiles = fsListJson?.data?.files ?? [];
        if (batchFiles.length === 0) break;
        allSharedFiles.push(...batchFiles);
        if (batchFiles.length < fsPageSize) break;
        if (
          typeof fsListJson?.data?.total === 'number' &&
          offset + batchFiles.length >= fsListJson.data.total
        ) {
          break;
        }
      }

      const imageFiles = allSharedFiles.filter(
        (f) => !f.isdir && /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(f.name)
      );

      if (imageFiles.length > 0) {
        const albumTitle = detectedAlbumTitle || 'Synology 공유 폴더 앨범';
        const latestFs = selectLatestItems(imageFiles, {
          maxCount: targetMax,
          getTimestampMs: (f) =>
            f.additional?.time?.mtime
              ? f.additional.time.mtime * 1000
              : inferTimestampFromNameOrDate(f.name),
        });

        const photos: PhotoItem[] = latestFs.map((file) => {
          const dlParams = new URLSearchParams({
            api: 'SYNO.FolderSharing.Download',
            version: '2',
            method: 'download',
            mode: 'open',
            sharing_id: passphrase,
            path: file.path,
          });
          if (sharingSid) dlParams.set('_sharing_sid', sharingSid);
          const mtime = file.additional?.time?.mtime;
          const dateStr = mtime
            ? new Date(mtime * 1000).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : todayLabel;

          return {
            id: buildStablePhotoId(params.albumId, file.path || file.name),
            albumId: params.albumId,
            albumName: albumTitle,
            provider: 'synology_api',
            src: `${dsmEntry}?${dlParams.toString()}`,
            nativeHeaders: {
              'X-SYNO-SHARING': passphrase,
            },
            title: file.name.replace(/\.[^.]+$/, ''),
            date: dateStr,
            location: albumTitle,
            tags: ['시놀로지NAS', albumTitle],
            aiSummary: `Synology NAS "${albumTitle}" 공유 폴더에서 불러온 실제 사진입니다.`,
          };
        });

        return {
          provider: 'synology_api',
          albumTitle,
          resolvedUrl: resolvedSynoUrl,
          photos,
        };
      }
    } catch {
      // Handled below
    }

    throw new Error(
      params.password?.trim()
        ? '시놀로지 공유 링크에서 사진을 불러오지 못했습니다. 공유 비밀번호가 맞는지, 외부에서 접속 가능한 DDNS 주소/포트인지, 앨범 안에 사진이 있는지 확인해 주세요.'
        : '시놀로지 공유 링크에서 사진을 불러오지 못했습니다. [공개 링크 활성화] 상태인지 확인하시고, 링크에 비밀번호가 걸려 있다면 아래 [공유 비밀번호] 칸에 입력 후 다시 시도해 주세요.'
    );
  }

  // ==========================================================================
  // CASE F: Generic Public Webpage / Direct Content-Type Image Fallback
  // ==========================================================================
  if (initialLandingHtml) {
    const ogImage = extractOgMeta(initialLandingHtml, 'og:image');
    const ogTitle = extractOgMeta(initialLandingHtml, 'og:title');
    if (ogImage && /^https?:\/\//i.test(ogImage)) {
      const albumTitle = params.customTitle?.trim() || ogTitle || '웹 공유 사진';
      return {
        provider: 'share_link',
        albumTitle,
        resolvedUrl: resolvedSynoUrl,
        photos: [
          {
            id: `${params.albumId}-web-0`,
            albumId: params.albumId,
            albumName: albumTitle,
            provider: 'share_link',
            src: ogImage,
            title: albumTitle,
            date: todayLabel,
            location: albumTitle,
            tags: ['공유사진', albumTitle],
            aiSummary: `${albumTitle} 공유 링크에서 불러온 실제 사진입니다.`,
          },
        ],
      };
    }
  }

  throw new Error(
    '입력하신 공유 링크에서 실제 사진을 찾지 못했습니다. 지원하는 공유 링크 형식인지(구글 포토 공유 앨범, 구글 드라이브 공개 폴더, 원드라이브 공유 폴더, 시놀로지 포토 공유 링크) 및 [링크가 있는 모든 사용자 공개] 설정 여부를 확인해 주세요.'
  );
}
