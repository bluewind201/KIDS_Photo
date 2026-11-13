import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { GoogleGenAI, Type } from '@google/genai';
import { pickRandomFlashcard } from '../data/englishFlashcards';
import {
  AssistantInquiryResult,
  ChildGrowthStage,
  PhotoItem,
  RemoteFolderItem,
  ScheduleItem,
  StorageProvider,
  WeatherPayload,
} from '../types';

export const BACKEND_URL_STORAGE_KEY = 'kids_photo_backend_url';
export const GEMINI_KEY_STORAGE_KEY = 'kids_photo_gemini_api_key';
export const FRAME_SETTINGS_STORAGE_KEY = 'kids_photo_frame_settings_v1';

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
  } catch {
    // ignore storage errors
  }
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
  if (backend.ok) return backend.data;

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=3`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;

    const [wRes, aRes] = await Promise.all([fetch(weatherUrl), fetch(airUrl)]);
    if (!wRes.ok) return null;

    const wData = (await wRes.json()) as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        weather_code: number;
        wind_speed_10m: number;
      };
      daily: {
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
      };
    };

    let pm10 = 26;
    let pm25 = 13;
    if (aRes.ok) {
      const aData = (await aRes.json()) as { current?: { pm10?: number; pm2_5?: number } };
      if (typeof aData.current?.pm10 === 'number') pm10 = Math.round(aData.current.pm10);
      if (typeof aData.current?.pm2_5 === 'number') pm25 = Math.round(aData.current.pm2_5);
    }

    const currentMapped = mapWeatherCodeToKorean(wData.current.weather_code);
    const tomorrowMapped = mapWeatherCodeToKorean(wData.daily.weather_code[1] ?? 1);
    const pm10Info = gradePm10(pm10);
    const pm25Info = gradePm25(pm25);

    return {
      city,
      lat,
      lng,
      current: {
        temp: Math.round(wData.current.temperature_2m),
        feelsLike: Math.round(wData.current.apparent_temperature),
        humidity: Math.round(wData.current.relative_humidity_2m),
        windSpeed: Math.round(wData.current.wind_speed_10m * 10) / 10,
        condition: currentMapped.label,
        iconKey: currentMapped.iconKey,
        todayMin: Math.round(wData.daily.temperature_2m_min[0] ?? wData.current.temperature_2m - 3),
        todayMax: Math.round(wData.daily.temperature_2m_max[0] ?? wData.current.temperature_2m + 4),
      },
      tomorrow: {
        minTemp: Math.round(wData.daily.temperature_2m_min[1] ?? 8),
        maxTemp: Math.round(wData.daily.temperature_2m_max[1] ?? 17),
        rainChance: Math.round(wData.daily.precipitation_probability_max[1] ?? 10),
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
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
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
}): Promise<AssistantInquiryResult> {
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
  growthStars: number;
  userTurnCount: number;
  isAutoFollowUpAfterSilence: boolean;
  activeFlashcardContext: { koreanWord: string; englishWord: string } | null;
  history: Array<{ role: 'user' | 'bunny'; text: string }>;
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
  const backend = await tryBackendJson<BunnyChatReplyPayload>('/api/gemini/bunny-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }, 9000);
  if (backend.ok && backend.data.replyText) {
    return backend.data;
  }

  const trimmedMsg = params.userMessage.trim();
  const name = params.characterName || '토순이';
  const userSpokeEnglish =
    /[a-zA-Z]{2,}/.test(trimmedMsg) ||
    /웨어|왓츠|쇼\s*미|하우|헬로|땡큐|애플|바나나|오션|엄브렐라|퍼피|버니|레인보우|스노우맨|스노우볼|스트로베리|버터플라이/.test(
      trimmedMsg
    );

  // Try direct client-side Gemini if API key is saved
  const ai = getClientGemini();
  if (ai) {
    try {
      const photoCatalogText = params.photos
        .slice(0, 25)
        .map(
          (p) =>
            `- ID: "${p.id}" | 제목: ${p.title} | 날짜: ${p.date} | 장소: ${p.location} | 태그: ${p.tags.join(', ')} | 설명: ${p.aiSummary}`
        )
        .join('\n');

      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${params.characterPersona || `너는 디지털 액자 속 다정한 아기 토끼 "${name}"야.`}
아이 성장 단계: ${params.childAgeStage} (모은 별: ${params.growthStars}개)
현재 날씨: ${params.weatherCondition}
이전 대화: ${params.history.slice(-6).map((h) => `${h.role}: ${h.text}`).join(' / ')}
아이의 방금 말: "${trimmedMsg}"
${params.isAutoFollowUpAfterSilence ? '(아이가 1분간 대답이 없어 다정하게 다음 화제를 꺼내줘. 영어유도/단어카드는 false)' : ''}

[등록된 가족 사진 목록]
${photoCatalogText}

2~3문장의 다정한 반말(replyText)로 대답해줘! 사진/추억 질문이면 isPhotoMemoryQuery=true와 matchedPhotoIds를 채워줘.`,
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
            required: ['replyText', 'isPhotoMemoryQuery', 'matchedPhotoIds', 'shouldSuggestEnglishReask', 'shouldShowFlashcard'],
          },
        },
      });
      const parsed = JSON.parse((resp.text ?? '{}').trim()) as BunnyChatReplyPayload;
      if (parsed.replyText) return parsed;
    } catch {
      // fall through to built-in bunny engine
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

  // Check photo memory query
  const looksLikePhotoQuery =
    /언제|어디|사진|갔|보여|바다|제주|숲|캠핑|단풍|벚꽃|소풍|딸기|놀이공원|에버랜드|회전목마|눈|썰매|눈사람|여행|추억/i.test(
      trimmedMsg
    );

  if (looksLikePhotoQuery && params.photos.length > 0) {
    const matched = params.photos.filter(
      (p) =>
        p.tags.some((t) => trimmedMsg.includes(t)) ||
        trimmedMsg.includes(p.location.slice(0, 2)) ||
        p.title.split(' ').some((w) => w.length >= 2 && trimmedMsg.includes(w))
    );
    const picked = matched.length > 0 ? matched.slice(0, 4) : params.photos.slice(0, 2);
    const first = picked[0];
    return {
      replyText: `우와~ 찾았다!! ${first.date}에 "${first.location}" 다녀왔던 사진이야! ${first.title} 추억이 정말 행복해 보여~!`,
      isPhotoMemoryQuery: true,
      matchedPhotoIds: picked.map((p) => p.id),
      memoryHeadline: `${name}가 찾아준 우리 가족 추억 사진`,
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

  // Show a fun stage-appropriate flashcard every 2nd turn
  if (params.userTurnCount >= 2 && params.userTurnCount % 2 === 0) {
    const card = pickRandomFlashcard(undefined, params.childAgeStage);
    return {
      replyText: `헤헤 맞아맞아! ${name}랑 이야기하니까 정말 신난다~! 짜잔! 우리 "${card.koreanWord}"를 영어로 어떻게 말하는지 큰 그림카드로 같이 해볼까?`,
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
      ? { en: 'Hi bunny!', ko: '하이 버니!' }
      : params.childAgeStage === 'age_6_7'
      ? { en: 'Let us play together!', ko: '렛 어스 플레이 투게더!' }
      : { en: 'I am so happy!', ko: '아이 엠 쏘 해피!' };

  return {
    replyText: `우와~ 그랬구나! ${name}도 너랑 이야기하니까 귀가 쫑긋쫑긋 신나!`,
    isPhotoMemoryQuery: false,
    matchedPhotoIds: [],
    shouldSuggestEnglishReask: true,
    englishPhrase: phrases.en,
    koreanPhonetic: phrases.ko,
    englishNudgeText: `마이크에 대고 신나게 영어로 "${phrases.ko}" (${phrases.en}) 하고 말해볼래?`,
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
}): Promise<PhotoItem[]> {
  try {
    const fileParams = new URLSearchParams({
      api: 'SYNO.FileStation.List',
      version: '2',
      method: 'list',
      folder_path: params.folderPath,
      additional: '["time"]',
      limit: '50',
      _sid: params.sid,
    });
    const url = `${params.cleanBase}/webapi/entry.cgi?${fileParams.toString()}`;
    const res = Capacitor.isNativePlatform()
      ? await CapacitorHttp.get({ url, connectTimeout: 8000, readTimeout: 8000 })
      : await fetch(url).then(async (r) => ({ status: r.status, data: await r.json() }));

    const json = (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as {
      data?: {
        files?: Array<{
          name: string;
          path: string;
          isdir?: boolean;
          additional?: { time?: { mtime?: number } };
        }>;
      };
    };

    const imageFiles = (json?.data?.files ?? []).filter(
      (f) => !f.isdir && /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)
    );

    return imageFiles.slice(0, 40).map((file, i) => {
      const dlParams = new URLSearchParams({
        api: 'SYNO.FileStation.Download',
        version: '2',
        method: 'download',
        path: file.path,
        mode: 'open',
        _sid: params.sid,
      });
      const imgUrl = `${params.cleanBase}/webapi/entry.cgi?${dlParams.toString()}`;
      const mtime = file.additional?.time?.mtime;
      const dateStr = mtime
        ? new Date(mtime * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
        : '시놀로지 NAS 추억';

      return {
        id: `${params.albumId}-syno-${i}`,
        albumId: params.albumId,
        albumName: params.albumName,
        provider: params.provider,
        src: imgUrl,
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
}): Promise<PhotoItem[]> {
  const todayLabel = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (params.provider === 'google_drive' && params.gdriveToken?.trim()) {
    const q = encodeURIComponent(
      `'${params.folderId}' in parents and mimeType contains 'image/' and trashed = false`
    );
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime,thumbnailLink)&pageSize=100`,
      { headers: { Authorization: `Bearer ${params.gdriveToken.trim()}` } }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        files?: Array<{ id: string; name: string; createdTime?: string; thumbnailLink?: string }>;
      };
      return (data.files ?? []).map((f, idx) => ({
        id: `${params.albumId}-gdrive-oauth-${idx}`,
        albumId: params.albumId,
        albumName: params.albumName,
        provider: 'google_drive',
        src: f.thumbnailLink
          ? f.thumbnailLink.replace(/=s\d+.*$/, '=s1920')
          : `https://drive.google.com/thumbnail?id=${f.id}&sz=w1920`,
        assetUrl: `https://lh3.googleusercontent.com/d/${f.id}=w1920`,
        title: f.name.replace(/\.[^.]+$/, ''),
        date: f.createdTime
          ? new Date(f.createdTime).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : todayLabel,
        location: params.albumName,
        tags: ['구글드라이브', params.albumName],
        aiSummary: `Google Drive "${params.albumName}" 폴더에서 불러온 실제 사진입니다.`,
      }));
    }
  }

  if (params.provider === 'onedrive' && params.onedriveToken?.trim()) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(params.folderId)}/children?$top=100`,
      { headers: { Authorization: `Bearer ${params.onedriveToken.trim()}` } }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        value?: Array<{
          id: string;
          name: string;
          image?: Record<string, unknown>;
          file?: { mimeType?: string };
          '@microsoft.graph.downloadUrl'?: string;
        }>;
      };
      return (data.value ?? [])
        .filter(
          (item) =>
            Boolean(item['@microsoft.graph.downloadUrl']) &&
            (Boolean(item.image) ||
              Boolean(item.file?.mimeType?.startsWith('image/')) ||
              /\.(jpe?g|png|webp|gif|bmp)$/i.test(item.name))
        )
        .map((item, idx) => ({
          id: `${params.albumId}-onedrive-oauth-${idx}`,
          albumId: params.albumId,
          albumName: params.albumName,
          provider: 'onedrive',
          src: item['@microsoft.graph.downloadUrl'] || '',
          title: item.name.replace(/\.[^.]+$/, ''),
          date: todayLabel,
          location: params.albumName,
          tags: ['원드라이브', params.albumName],
          aiSummary: `OneDrive "${params.albumName}" 폴더에서 불러온 실제 사진입니다.`,
        }));
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
        const out: PhotoItem[] = [];
        // Fetch up to 30 WebDAV images as base64 data URLs since <img> cannot pass Basic Auth headers in modern WebViews
        for (let i = 0; i < Math.min(imageHrefs.length, 30); i++) {
          const href = imageHrefs[i];
          const fullImgUrl = href.startsWith('http') ? href : `${origin}${href.startsWith('/') ? '' : '/'}${href}`;
          const imgRes = await CapacitorHttp.get({
            url: fullImgUrl,
            headers: { Authorization: `Basic ${basic}` },
            responseType: 'blob',
          });
          if (imgRes.status >= 200 && imgRes.status < 300 && typeof imgRes.data === 'string') {
            const decodedName = decodeURIComponent(href.split('/').pop() || `photo_${i + 1}`);
            const ext = decodedName.split('.').pop()?.toLowerCase() || 'jpg';
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            const dataUri = imgRes.data.startsWith('data:') ? imgRes.data : `data:${mime};base64,${imgRes.data}`;
            out.push({
              id: `${params.albumId}-webdav-${i}`,
              albumId: params.albumId,
              albumName: params.albumName,
              provider: 'synology_webdav',
              src: dataUri,
              title: decodedName.replace(/\.[^.]+$/, ''),
              date: todayLabel,
              location: params.albumName,
              tags: ['WebDAV', params.albumName],
              aiSummary: `시놀로지 WebDAV "${params.albumName}" 폴더에서 불러온 실제 사진입니다.`,
            });
          }
        }
        return out;
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
  }>('/api/gemini/analyze-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }, 8000);
  if (backend.ok) return backend.data;

  const ai = getClientGemini();
  if (ai) {
    try {
      const cleanBase64 = params.base64Data.includes(',') ? params.base64Data.split(',')[1] : params.base64Data;
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: params.mimeType, data: cleanBase64 } },
            { text: `파일명: "${params.fileName}" — 가족 사진을 분석해 한국어 제목(title), 장소(location), 설명(aiSummary), 태그 배열(tags)을 JSON으로 만들어 주세요.` },
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

export async function refreshMartEventsUnified(city: string): Promise<string[]> {
  const backend = await tryBackendJson<{ items?: string[] }>('/api/gemini/mart-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city }),
  }, 7000);
  if (backend.ok && backend.data.items && backend.data.items.length > 0) {
    return backend.data.items;
  }

  const ai = getClientGemini();
  if (ai) {
    try {
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${city} 기준 한국의 대형마트(이마트, 롯데마트, 홈플러스, 코스트코) 의무휴무일 규칙(둘째·넷째 일요일 등)과 제철 가족 장보기 팁 4줄을 JSON { "items": ["..."] } 형식으로 작성해 주세요.`,
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
      if (parsed.items && parsed.items.length > 0) return parsed.items;
    } catch {
      // fall through
    }
  }

  return [
    `[${city} 대형마트] 이마트·롯데마트·홈플러스 매월 둘째·넷째 일요일 정기 의무휴무`,
    `[코스트코 안내] 매월 둘째·넷째 일요일 정기 휴무 (방문 전 지점별 영업시간 확인)`,
    `[주말 가족 장보기] 제철 과일·우리 아이 우유·간식 특가 코너 운영 중`,
    `[전통시장·하나로마트] 연중무휴 정상 영업 매장 상시 이용 가능`,
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
}): Promise<ResolvedShareAlbumResult> {
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
      }),
    },
    14000
  );

  if (backend.ok && Array.isArray(backend.data.photos) && backend.data.photos.length > 0) {
    return {
      provider: backend.data.provider || 'share_link',
      albumTitle: backend.data.title || params.customTitle?.trim() || '공유 사진 앨범',
      resolvedUrl: backend.data.url || rawUrl,
      photos: backend.data.photos,
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
          id: `${params.albumId}-img-0`,
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
    for (const m of cleanedHtml.matchAll(pwRegex)) {
      urlSet.add(m[0]);
    }
    const afRegex = /https:\/\/lh3\.googleusercontent\.com\/(?:[a-zA-Z0-9_-]+\/)?AF1Qip[a-zA-Z0-9_-]{18,}/g;
    for (const m of cleanedHtml.matchAll(afRegex)) {
      urlSet.add(m[0]);
    }

    // Single-photo share fallback via og:image (exclude Google logo/avatar `/a/` URLs)
    if (urlSet.size === 0) {
      const ogImg = extractOgMeta(page.text, 'og:image');
      if (ogImg && ogImg.includes('googleusercontent.com') && !ogImg.includes('/a/')) {
        const base = ogImg.split('=')[0];
        urlSet.add(base);
      }
    }

    const baseUrls = Array.from(urlSet).slice(0, 120);
    if (baseUrls.length === 0) {
      throw new Error(
        '구글 포토 공유 링크에서 사진을 찾지 못했습니다. 구글 포토 앱에서 [앨범 공유 → 링크 생성(링크가 있는 모든 사용자 보기 허용)] 상태인지 확인해 주세요.'
      );
    }

    const photos: PhotoItem[] = baseUrls.map((baseUrl, idx) => ({
      id: `${params.albumId}-gphotos-${idx}`,
      albumId: params.albumId,
      albumName: albumTitle,
      provider: 'google_drive',
      src: `${baseUrl}=w1920-h1080`,
      assetUrl: `${baseUrl}=w2560-h1440`,
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
              id: `${params.albumId}-gdrive-0`,
              albumId: params.albumId,
              albumName: albumTitle,
              provider: 'google_drive',
              src: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920`,
              assetUrl: `https://lh3.googleusercontent.com/d/${fileId}=w1920`,
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

        const entryRegex =
          /id=["']entry-([a-zA-Z0-9_-]{20,})["'][\s\S]{0,600}?class=["']flip-entry-title["']>([^<]+)</gi;
        for (const m of embedRes.text.matchAll(entryRegex)) {
          const id = m[1];
          const fileName = decodeHtmlEntities(m[2].trim());
          // Exclude obvious non-image documents/videos if extension is present
          if (
            id !== folderId &&
            !/\.(mp4|mov|avi|mkv|pdf|zip|rar|7z|docx?|xlsx?|pptx?|txt|mp3|wav)$/i.test(fileName)
          ) {
            foundFiles.set(id, fileName);
          }
        }

        if (foundFiles.size === 0) {
          for (const m of embedRes.text.matchAll(/id=["']entry-([a-zA-Z0-9_-]{20,})["']/gi)) {
            if (m[1] !== folderId) {
              foundFiles.set(m[1], `사진 #${foundFiles.size + 1}`);
            }
          }
        }
      } catch {
        // Continue to Strategy 2
      }

      // Strategy 2: Main folder page HTML (`_DRIVE_ivd` / `data-id` extraction)
      if (foundFiles.size === 0) {
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

          // Match `data-id="FILE_ID"` attributes on folder grid items
          const dataIdRegex = /data-id=["']([a-zA-Z0-9_-]{25,45})["']/g;
          for (const m of unescaped.matchAll(dataIdRegex)) {
            const id = m[1];
            if (id !== folderId) {
              foundFiles.set(id, `사진 #${foundFiles.size + 1}`);
            }
          }

          const ivdImgRegex =
            /\["([a-zA-Z0-9_-]{25,45})"\s*,\s*\["[a-zA-Z0-9_-]+"\]\s*,\s*"([^"]+)"\s*,\s*"image\/[a-zA-Z0-9.+-]+"/g;
          for (const m of unescaped.matchAll(ivdImgRegex)) {
            if (m[1] !== folderId) {
              foundFiles.set(m[1], m[2]);
            }
          }
        } catch {
          // Handled below if empty
        }
      }

      if (!albumTitle) albumTitle = 'Google Drive 공유 폴더';

      const entries = Array.from(foundFiles.entries()).slice(0, 120);
      if (entries.length === 0) {
        throw new Error(
          '구글 드라이브 폴더에서 사진을 찾지 못했습니다. 폴더 공유 설정이 반드시 [제한됨]이 아닌 [링크가 있는 모든 사용자(뷰어)]로 열려 있어야 하며, 폴더 안에 이미지 파일(JPG/PNG/WEBP)이 들어 있는지 확인해 주세요.'
        );
      }

      const photos: PhotoItem[] = entries.map(([fileId, fileName], idx) => ({
        id: `${params.albumId}-gdrive-${idx}`,
        albumId: params.albumId,
        albumName: albumTitle,
        provider: 'google_drive',
        src: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920`,
        assetUrl: `https://lh3.googleusercontent.com/d/${fileId}=w1920`,
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

    // Obtain anonymous Microsoft Badger token for public OneDrive shares
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
      file?: { mimeType?: string };
      image?: Record<string, unknown>;
      photo?: { takenDateTime?: string };
      '@content.downloadUrl'?: string;
      thumbnails?: Array<{ large?: { url?: string } }>;
      children?: OneDriveItem[];
    }

    const candidateUrls = Array.from(new Set([rawUrl, finalShareUrl]));
    let rootItem: OneDriveItem | null = null;

    for (const candidate of candidateUrls) {
      const shareId = encodeOneDriveShareToken(candidate);
      const endpoints = [
        `https://my.microsoftpersonalcontent.com/_api/v2.0/shares/${shareId}/driveItem?$expand=children`,
        `https://api.onedrive.com/v1.0/shares/${shareId}/driveItem?$expand=children($expand=thumbnails)`,
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
      const rawItems = Array.isArray(rootItem.children) && rootItem.children.length > 0 ? rootItem.children : [rootItem];
      const imageItems = rawItems.filter((item) => {
        const dl = item['@content.downloadUrl'] || item.thumbnails?.[0]?.large?.url;
        if (!dl) return false;
        if (item.image || item.photo) return true;
        if (item.file?.mimeType?.startsWith('image/')) return true;
        return /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(item.name || '');
      });

      if (imageItems.length > 0) {
        const photos: PhotoItem[] = imageItems.slice(0, 120).map((item, idx) => {
          const imgUrl = item['@content.downloadUrl'] || item.thumbnails?.[0]?.large?.url || '';
          const dateStr = item.photo?.takenDateTime
            ? new Date(item.photo.takenDateTime).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : todayLabel;
          return {
            id: `${params.albumId}-onedrive-${idx}`,
            albumId: params.albumId,
            albumName: albumTitle,
            provider: 'onedrive',
            src: imgUrl,
            title: (item.name || `사진 #${idx + 1}`).replace(/\.[^.]+$/, ''),
            date: dateStr,
            location: albumTitle,
            tags: ['원드라이브', albumTitle],
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
  //   Examples:
  //   - https://nas.synology.me:5001/mo/sharing/AbCdEf123
  //   - https://nas.synology.me:9999/photo/mo/sharing/AbCdEf123
  //   - https://nas.synology.me:5001/sharing/XyZ987
  //   - https://gofile.me/6A2B3/AbCdEf123
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
    const prefixPath = synoShareMatch[2] || ''; // e.g. "" or "/photo"
    const passphrase = synoShareMatch[3];
    const shareHeaders: Record<string, string> = {
      'X-SYNO-SHARING': passphrase,
    };

    // Candidate Synology Photos & DSM WebAPI entry points
    const entryEndpoints = Array.from(
      new Set([
        ...(prefixPath ? [`${origin}${prefixPath}/webapi/entry.cgi`] : []),
        `${origin}/photo/webapi/entry.cgi`,
        `${origin}/webapi/entry.cgi`,
      ])
    );

    let detectedAlbumTitle = params.customTitle?.trim() || '';

    // E-1: Try Synology Photos Public Share API (`SYNO.Foto.Sharing.*` + `SYNO.Foto.Browse.Item`)
    for (const entryUrl of entryEndpoints) {
      try {
        // Step 1: Login / unlock share session cookie (works both with and without password)
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

        // Optional album metadata query (`SYNO.Foto.Sharing.Misc` -> `get_info`)
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

        // Step 2: List shared photos via `SYNO.Foto.Browse.Item`
        const listBody = new URLSearchParams({
          api: 'SYNO.Foto.Browse.Item',
          version: '1',
          method: 'list',
          offset: '0',
          limit: '200',
          additional: '["thumbnail"]',
          passphrase,
        });

        let listRes = await rawPost(entryUrl, listBody.toString(), 'application/x-www-form-urlencoded', shareHeaders);
        let listJson = listRes.json as {
          success?: boolean;
          error?: { code?: number };
          data?: {
            list?: Array<{
              id: number;
              filename?: string;
              type?: string;
              time?: number;
              additional?: { thumbnail?: { cache_key?: string; xl?: string; m?: string } };
            }>;
          };
        } | undefined;

        if (!listJson?.success) {
          // Retry with version=2 in case DSM 7.2+ requires v2
          listBody.set('version', '2');
          listRes = await rawPost(entryUrl, listBody.toString(), 'application/x-www-form-urlencoded', shareHeaders);
          listJson = listRes.json as typeof listJson;
        }

        if (listJson?.success && Array.isArray(listJson.data?.list) && listJson.data.list.length > 0) {
          const albumTitle = detectedAlbumTitle || 'Synology Photos 공유 앨범';
          const photoItems = listJson.data.list.filter((it) => it.type !== 'video');
          if (photoItems.length > 0) {
            const photos: PhotoItem[] = photoItems.slice(0, 150).map((item, idx) => {
              const cacheKey = item.additional?.thumbnail?.cache_key || `${item.id}_0`;
              const thumbParams = new URLSearchParams({
                api: 'SYNO.Foto.Thumbnail',
                version: '2',
                method: 'get',
                mode: 'download',
                id: String(item.id),
                type: 'unit',
                size: 'xl',
                cache_key: cacheKey,
                passphrase,
                _sharing_id: passphrase,
              });
              const thumbV1Params = new URLSearchParams({
                api: 'SYNO.Foto.Thumbnail',
                version: '1',
                method: 'get',
                mode: 'download',
                id: String(item.id),
                type: 'unit',
                size: 'xl',
                cache_key: cacheKey,
                passphrase,
                _sharing_id: passphrase,
              });

              const dateStr = item.time
                ? new Date(item.time * 1000).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : todayLabel;

              return {
                id: `${params.albumId}-synofoto-${item.id}-${idx}`,
                albumId: params.albumId,
                albumName: albumTitle,
                provider: 'synology_api',
                src: `${entryUrl}?${thumbParams.toString()}`,
                assetUrl: `${entryUrl}?${thumbV1Params.toString()}`,
                title: (item.filename || `사진 #${idx + 1}`).replace(/\.[^.]+$/, ''),
                date: dateStr,
                location: albumTitle,
                tags: ['시놀로지포토', albumTitle],
                aiSummary: `Synology Photos "${albumTitle}" 공유 앨범에서 불러온 실제 사진입니다.`,
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

    // E-2: Try Synology DSM File Station Folder/File Share API (`SYNO.Core.Sharing.Login` + `SYNO.FolderSharing.List`)
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
      const fsListParams = new URLSearchParams({
        api: 'SYNO.FolderSharing.List',
        version: '2',
        method: 'list',
        sharing_id: passphrase,
        offset: '0',
        limit: '200',
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
          files?: Array<{
            name: string;
            path: string;
            isdir?: boolean;
            additional?: { time?: { mtime?: number } };
          }>;
        };
      } | undefined;

      const imageFiles = (fsListJson?.data?.files ?? []).filter(
        (f) => !f.isdir && /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)
      );

      if (imageFiles.length > 0) {
        const albumTitle = detectedAlbumTitle || 'Synology 공유 폴더 앨범';
        const photos: PhotoItem[] = imageFiles.slice(0, 150).map((file, idx) => {
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
            id: `${params.albumId}-synofs-${idx}`,
            albumId: params.albumId,
            albumName: albumTitle,
            provider: 'synology_api',
            src: `${dsmEntry}?${dlParams.toString()}`,
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
