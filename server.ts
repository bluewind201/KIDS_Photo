import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'frame-state.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

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
  인천공항: { lat: 37.4602, lng: 126.4407, name: '인천국제공항' },
  수원: { lat: 37.2636, lng: 127.0286, name: '수원시청' },
  가평: { lat: 37.8315, lng: 127.5095, name: '가평 자라섬·숲속캠핑장' },
  춘천: { lat: 37.8813, lng: 127.7298, name: '춘천 명동' },
  강릉: { lat: 37.7519, lng: 128.8761, name: '강릉 경포대' },
  평창: { lat: 37.6547, lng: 128.6708, name: '평창 대관령 눈썰매장' },
  대전: { lat: 36.3504, lng: 127.3845, name: '대전광역시청' },
  대구: { lat: 35.8714, lng: 128.6014, name: '대구광역시청' },
  부산: { lat: 35.1796, lng: 129.0756, name: '부산광역시청' },
  해운대: { lat: 35.1587, lng: 129.1604, name: '부산 해운대 해수욕장' },
  제주: { lat: 33.4996, lng: 126.5312, name: '제주시' },
  협재: { lat: 33.3943, lng: 126.2397, name: '제주 협재 해수욕장' },
};

async function resolveCoordinates(placeQuery: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const cleaned = placeQuery.trim();
  for (const [key, coords] of Object.entries(KOREA_LANDMARKS)) {
    if (cleaned.includes(key)) {
      return { lat: coords.lat, lng: coords.lng, displayName: coords.name };
    }
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko&q=${encodeURIComponent(cleaned)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TosuniSmartFrame/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const items = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (items.length > 0) {
        return {
          lat: parseFloat(items[0].lat),
          lng: parseFloat(items[0].lon),
          displayName: items[0].display_name.split(',')[0] || cleaned,
        };
      }
    }
  } catch {
    // Fallback handled by caller
  }
  return null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 1. Persistent state endpoints (settings, custom wake word, schedules, mart events)
app.get('/api/state', (_req, res) => {
  try {
    ensureDataDir();
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      res.json(JSON.parse(raw));
      return;
    }
    res.json({ saved: false });
  } catch (err) {
    console.error('State read error:', err);
    res.json({ saved: false });
  }
});

app.post('/api/state', (req, res) => {
  try {
    ensureDataDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...req.body, saved: true }, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    console.error('State write error:', err);
    res.status(500).json({ error: '설정을 저장하지 못했습니다.' });
  }
});

// 2. Real-Time Weather + Tomorrow Forecast + Fine Dust (PM10 / PM2.5)
app.get('/api/weather', async (req, res) => {
  const lat = parseFloat(String(req.query.lat ?? '37.5665')) || 37.5665;
  const lng = parseFloat(String(req.query.lng ?? '126.9780')) || 126.978;
  const city = String(req.query.city ?? '서울특별시');

  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=3`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;

    const [wRes, aRes] = await Promise.all([
      fetch(weatherUrl, { signal: AbortSignal.timeout(5000) }),
      fetch(airUrl, { signal: AbortSignal.timeout(5000) }),
    ]);

    if (!wRes.ok) {
      throw new Error(`Weather HTTP ${wRes.status}`);
    }

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

    let pm10 = 28;
    let pm25 = 14;
    if (aRes.ok) {
      const aData = (await aRes.json()) as { current?: { pm10?: number; pm2_5?: number } };
      if (typeof aData.current?.pm10 === 'number') pm10 = Math.round(aData.current.pm10);
      if (typeof aData.current?.pm2_5 === 'number') pm25 = Math.round(aData.current.pm2_5);
    }

    const currentMapped = mapWeatherCodeToKorean(wData.current.weather_code);
    const tomorrowMapped = mapWeatherCodeToKorean(wData.daily.weather_code[1] ?? 1);
    const pm10Info = gradePm10(pm10);
    const pm25Info = gradePm25(pm25);

    res.json({
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
    });
  } catch (err) {
    console.warn('Weather API fallback used:', err);
    res.json({
      city,
      lat,
      lng,
      current: {
        temp: 14,
        feelsLike: 13,
        humidity: 48,
        windSpeed: 2.4,
        condition: '맑음',
        iconKey: 'sun',
        todayMin: 8,
        todayMax: 16,
      },
      tomorrow: {
        minTemp: 7,
        maxTemp: 15,
        rainChance: 10,
        condition: '구름 조금',
        iconKey: 'partly-cloudy',
      },
      airQuality: {
        pm10: 26,
        pm10Grade: '좋음',
        pm10Level: 'good',
        pm25: 13,
        pm25Grade: '좋음',
        pm25Level: 'good',
      },
      updatedAt: new Date().toISOString(),
    });
  }
});

// 3. Geocode city search endpoint
app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.status(400).json({ error: '검색어를 입력해 주세요.' });
    return;
  }
  const found = await resolveCoordinates(q);
  if (!found) {
    res.status(404).json({ error: '위치를 찾지 못했습니다.' });
    return;
  }
  res.json(found);
});

// 4. AI Smart Frame Assistant (Wake-word inquiry: Weather, Schedule, Directions [Car/Walk/Transit], Destination)
app.post('/api/gemini/assistant', async (req, res) => {
  try {
    const {
      query,
      currentCity = '서울특별시',
      currentLat = 37.5665,
      currentLng = 126.978,
      weatherSummary,
      schedules = [],
    } = req.body as {
      query: string;
      currentCity?: string;
      currentLat?: number;
      currentLng?: number;
      weatherSummary?: unknown;
      schedules?: Array<{ title: string; date: string; time: string; location?: string }>;
    };

    if (!query || !query.trim()) {
      res.status(400).json({ error: '문의 내용을 입력해 주세요.' });
      return;
    }

    const ai = getAiClient();

    // First ask Gemini 3.8 Flash to parse intent & compute accurate Korean response
    const intentResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `현재 사용자 위치: ${currentCity} (${currentLat}, ${currentLng})
현재 날씨 데이터: ${JSON.stringify(weatherSummary ?? {})}
등록된 가족 일정: ${JSON.stringify(schedules)}
사용자 음성 질문: "${query}"

사용자의 질문을 분석하여 스마트 디지털 액자의 반쪽 브리핑 화면에 표시할 정보를 작성해 주세요.
- 만약 목적지 이동, 길안내, 소요시간(자동차/도보/대중교통), 어디 가는 법에 대한 질문이면 category를 "directions"로 설정하고 출발지(명시 안 되었으면 현재 위치 "${currentCity}")와 목적지를 추출한 뒤, 한국 실제 교통 환경 기준 자동차·대중교통·도보 예상 소요시간(분), 예상 이동거리(km), 구체적인 추천 경로/노선 요약을 채워 주세요.
- 날씨나 미세먼지 질문이면 category를 "weather"로 설정하세요.
- 일정 관련 질문이면 category를 "schedule"로 설정하세요.
- 그 외 목적지 정보, 마트 휴무일, 생활 질문이면 category를 "general"로 설정하세요.
spokenSummary는 음성으로 읽어줄 자연스럽고 다정한 한국어 2~3문장 요약입니다.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              description: 'One of: directions, weather, schedule, general',
            },
            headline: {
              type: Type.STRING,
              description: 'Concise Korean title for the split-screen panel',
            },
            spokenSummary: {
              type: Type.STRING,
              description: 'Natural 2-3 sentence Korean voice summary',
            },
            detailMarkdown: {
              type: Type.STRING,
              description: 'Helpful bullet points or summary details in clean Korean',
            },
            originName: {
              type: Type.STRING,
              description: 'Origin location name if category is directions',
            },
            destinationName: {
              type: Type.STRING,
              description: 'Destination location name if category is directions',
            },
            distanceKm: {
              type: Type.NUMBER,
              description: 'Approximate route distance in km if directions',
            },
            drivingMinutes: {
              type: Type.INTEGER,
              description: 'Estimated driving duration in minutes',
            },
            drivingRouteSummary: {
              type: Type.STRING,
              description: 'Recommended car route highways/roads summary in Korean',
            },
            drivingTip: {
              type: Type.STRING,
              description: 'Toll, parking, or traffic note in Korean',
            },
            transitMinutes: {
              type: Type.INTEGER,
              description: 'Estimated public transit duration in minutes',
            },
            transitRouteSummary: {
              type: Type.STRING,
              description: 'Subway lines / bus numbers and transfers in Korean',
            },
            transitTransfers: {
              type: Type.INTEGER,
              description: 'Estimated transfer count for public transit',
            },
            walkingMinutes: {
              type: Type.INTEGER,
              description: 'Estimated walking duration in minutes',
            },
            walkingRouteSummary: {
              type: Type.STRING,
              description: 'Walking route note or distance suitability in Korean',
            },
            destinationHighlights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2-4 key tips, operating hours, or highlights about the destination/topic',
            },
          },
          required: ['category', 'headline', 'spokenSummary', 'detailMarkdown'],
        },
      },
    });

    const parsed = JSON.parse((intentResponse.text ?? '{}').trim()) as Record<string, unknown>;

    // Refine driving/walking distance with real OSRM routing if coordinates resolve
    if (parsed.category === 'directions' && typeof parsed.destinationName === 'string' && parsed.destinationName) {
      const originCoords =
        typeof parsed.originName === 'string' && parsed.originName !== currentCity
          ? await resolveCoordinates(parsed.originName)
          : { lat: currentLat, lng: currentLng, displayName: currentCity };
      const destCoords = await resolveCoordinates(parsed.destinationName);

      if (originCoords && destCoords) {
        const straightKm = haversineKm(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng);
        try {
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=false`;
          const osrmRes = await fetch(osrmUrl, { signal: AbortSignal.timeout(3500) });
          if (osrmRes.ok) {
            const osrmData = (await osrmRes.json()) as {
              routes?: Array<{ distance: number; duration: number }>;
            };
            const r = osrmData.routes?.[0];
            if (r && r.distance > 0) {
              const roadKm = Math.round((r.distance / 1000) * 10) / 10;
              parsed.distanceKm = roadKm;
              if (!parsed.drivingMinutes || Number(parsed.drivingMinutes) <= 0) {
                parsed.drivingMinutes = Math.max(5, Math.round((r.duration / 60) * 1.25));
              }
              if (!parsed.walkingMinutes || Number(parsed.walkingMinutes) <= 0) {
                parsed.walkingMinutes = Math.max(8, Math.round((roadKm / 4.5) * 60));
              }
            }
          }
        } catch {
          if (!parsed.distanceKm || Number(parsed.distanceKm) <= 0) {
            parsed.distanceKm = Math.round(straightKm * 1.32 * 10) / 10;
          }
        }
      }
    }

    res.json(parsed);
  } catch (err: unknown) {
    console.error('Gemini assistant error:', err);
    const message = err instanceof Error ? err.message : 'AI 응답 생성 중 오류가 발생했습니다.';
    res.status(500).json({ error: message });
  }
});

// 5. Cute Bunnies Multi-Turn Gemini Chatbot + Kid Growth-Stage English Teacher & Photo Memory Search (3~7yo)
app.post('/api/gemini/bunny-chat', async (req, res) => {
  try {
    const {
      bunnyId = 'tosuni',
      characterName,
      characterPersona,
      userMessage,
      weatherCondition = '맑음',
      childAgeStage = 'age_5',
      growthStars = 0,
      userTurnCount = 1,
      isAutoFollowUpAfterSilence = false,
      requestFlashcard = false,
      activeFlashcardContext,
      history = [],
      photos = [],
    } = req.body as {
      bunnyId: string;
      characterName?: string;
      characterPersona?: string;
      userMessage: string;
      weatherCondition?: string;
      childAgeStage?: 'age_3_4' | 'age_5' | 'age_6_7';
      growthStars?: number;
      userTurnCount?: number;
      isAutoFollowUpAfterSilence?: boolean;
      requestFlashcard?: boolean;
      activeFlashcardContext?: { koreanWord: string; englishWord: string } | null;
      history?: Array<{ role: 'user' | 'bunny'; text: string }>;
      photos?: Array<{
        id: string;
        title: string;
        date: string;
        location: string;
        albumName: string;
        tags: string[];
        aiSummary: string;
        assetUrl?: string;
      }>;
    };

    if (!userMessage || !userMessage.trim()) {
      res.status(400).json({ error: '이야기할 내용을 들려주세요!' });
      return;
    }

    const ai = getAiClient();

    const bunnyPersonas: Record<string, string> = {
      tosuni:
        '너는 디지털 액자 옆 작은 동화 속 집에 사는 첫째 분홍리본 토끼 "토순이"야. 다정하고 포근한 유치원 언니·선생님처럼 상냥한 반말("우와~ 그랬구나!", "우리 같이 해볼까?")로 이야기해.',
      tosili:
        '너는 디지털 액자 옆 작은 동화 속 집에 사는 둘째 클로버 토끼 "토실이"야. 호기심 많고 폴짝폴짝 씩씩한 단짝 친구 겸 신나는 영어 선생님처럼("폴짝! 진짜진짜?", "우와 멋지다!") 이야기해.',
      toddungi:
        '너는 디지털 액자 옆 작은 동화 속 집에 사는 막내 노란가방 아기 토끼 "토뚱이"야. 당근과 과일을 좋아하고 애교가 넘치는 귀염둥이 친구 겸 영어 퀴즈 대장처럼("헤헤~ 맛있겠다!", "토뚱이랑 영어 놀이 하자!") 이야기해.',
    };

    const persona =
      characterPersona?.trim() ||
      bunnyPersonas[bunnyId] ||
      `너는 디지털 액자 옆 작은 집에 사는 귀여운 아기 토끼 "${characterName || '토순이'}"야. 다정하고 신나는 반말로 이야기해.`;

    const stageGuidanceMap: Record<string, string> = {
      age_3_4:
        '만 3~4세 유아 단계(첫 말문·단어 중심): 의성어·의태어를 섞어 아주 쉬운 1~2문장으로 말하고, 영어 표현과 단어카드는 1~2단어("Apple!", "Big ball!", "Snowman!", "Hi bunny!") 수준의 가장 쉬운 기초 단어로만 제안해.',
      age_5:
        '만 5세 어린이 단계(짧은 생활표현 따라하기): 다정한 2문장으로 대답하고, 영어 가이드는 2~4단어의 리듬감 있는 짧은 문장("It is snowing!", "I like apples!", "Roll the snowball!")으로 제안해.',
      age_6_7:
        '만 6~7세 어린이 단계(질문·문장 대화 확장): 호기심을 자극하는 2~3문장으로 대답하고, 영어 가이드는 3~6단어의 완전한 질문/대답 문장("Where did we go?", "Do you want to build a snowman?", "What is your favorite fruit?")으로 제안해.',
    };
    const growthGuidance = stageGuidanceMap[childAgeStage] || stageGuidanceMap.age_5;

    const photoCatalogText = photos
      .map(
        (p) =>
          `- ID: "${p.id}" | 제목: ${p.title} | 날짜: ${p.date} | 장소: ${p.location} | 앨범: ${p.albumName} | 태그: ${p.tags.join(', ')} | 사진 설명: ${p.aiSummary}`
      )
      .join('\n');

    // Build valid alternating user/model multi-turn history for ai.chats.create
    const trimmedMsg = userMessage.trim();
    const rawPrior =
      history.length > 0 &&
      history[history.length - 1].role === 'user' &&
      history[history.length - 1].text.trim() === trimmedMsg
        ? history.slice(0, -1)
        : history;

    const normalizedHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const turn of rawPrior.slice(-12)) {
      const mappedRole: 'user' | 'model' = turn.role === 'user' ? 'user' : 'model';
      const cleanTurnText = (turn.text || '').trim();
      if (!cleanTurnText) continue;
      if (normalizedHistory.length === 0 && mappedRole === 'model') {
        continue;
      }
      const prevTurn = normalizedHistory[normalizedHistory.length - 1];
      if (prevTurn && prevTurn.role === mappedRole) {
        prevTurn.parts[0].text += `\n${cleanTurnText}`;
      } else {
        normalizedHistory.push({ role: mappedRole, parts: [{ text: cleanTurnText }] });
      }
    }
    if (
      normalizedHistory.length > 0 &&
      normalizedHistory[normalizedHistory.length - 1].role === 'user'
    ) {
      normalizedHistory.pop();
    }

    const userSpokeEnglish =
      /[a-zA-Z]{2,}/.test(trimmedMsg) ||
      /웨어|왓츠|쇼\s*미|하우|헬로|땡큐|애플|바나나|오션|엄브렐라|퍼피|버니|레인보우|스노우맨|스노우볼|스트로베리|버터플라이/.test(
        trimmedMsg
      );

    const canAutoInsertMidChatCard =
      !isAutoFollowUpAfterSilence && !userSpokeEnglish && (requestFlashcard || userTurnCount >= 2);

    const systemInstruction = `${persona}
현재 대화 중인 아이의 성장 단계: **${growthGuidance}** (지금까지 아이가 영어로 성공해 모은 성장 별: ${growthStars}개).
현재 바깥 날씨는 "${weatherCondition}"이야 (맑을 때는 잔디밭에 앉아 쉬고, 비가 오면 나무 아래로 비를 피하고, 눈이 오면 당근 코 눈사람을 만들거나 신나게 눈싸움·눈덩이 굴리기를 하며 놀아!).

핵심 대화 규칙:
1. **아이 성장 눈높이 맞춤 한국어 반말**: 따뜻하고 신나는 짧은 반말(2~3문장 이내)로 이야기해.
${
  isAutoFollowUpAfterSilence
    ? `2. **1분 동안 아이 대답이 없었을 때 자연스러운 대화 이어가기**:
   - 방금 아이가 1분 동안 말을 하지 않았어(쑥스럽거나 생각 중일 수 있어). 절대 재촉하거나 부담 주지 말고 "헤헤~ 조금 쑥스러웠구나, 괜찮아! 다음엔 같이 말해 보자~" 하고 따뜻하게 넘어가면서, 아이가 대답하기 쉬운 새로운 재미있는 질문(예: 눈사람 이야기, 좋아하는 간식, 재미있었던 소풍 추억 등)으로 자연스럽게 다음 대화를 이어가 줘!
   - 이때는 shouldSuggestEnglishReask와 shouldShowFlashcard를 모두 반드시 false로 설정해!`
    : `2. **음성으로 따라 말하게 유도하는 영어 재질의 가이드 ("이렇게 영어로 다시 말해볼래?")**:
   - 아이가 한국어로 말했을 때 약 40% 확률로 shouldSuggestEnglishReask를 true로 설정하고, 아이 성장 단계에 맞는 영어 표현(englishPhrase), 한글 발음(koreanPhonetic), 그리고 버튼이 아니라 **아이 목소리로 직접 따라 말해보게 유도하는 다정한 멘트**(englishNudgeText, 예: "우와~ 우리 입으로 크게 영어로도 말해볼까? 'Where did we go?' 하고 소리 내어 말해봐~!")를 알려줘.
   - 만약 아이가 방금 영어 단어나 문장을 소리 내어 말했으면(${userSpokeEnglish ? '방금 아이가 영어 발화를 시도했음!' : '한국어 발화'}), 폭풍 칭찬("우와아!! 목소리로 영어를 진짜 멋지게 말했어! 최고야~!")을 해주고 shouldSuggestEnglishReask는 false로 해줘!
3. **대화 도중 자연스럽게 이어 붙이는 대형 그림 단어카드 (따라 말하기 유도)**:
   - ${
     !canAutoInsertMidChatCard
       ? '지금은 첫 인사 직후이거나 영어 칭찬 중이므로 shouldShowFlashcard는 false로 설정해.'
       : requestFlashcard
       ? '지금 단어카드가 요청되었으니 반드시 shouldShowFlashcard를 true로 설정해!'
       : '현재 아이와 대화가 무르익은 중간 대화 상태야! 대화 속 소재(눈사람, 눈덩이, 과일, 동물, 바다, 날씨, 장난감 등)와 자연스럽게 이어질 때 가끔씩(약 40% 확률) shouldShowFlashcard를 true로 설정해서 큰 그림 단어카드를 짜잔 보여주며 "짜잔~ 우리 방금 말한 단어 큰 카드로 볼까? 같이 큰 소리로 따라 해봐!" 하고 아이가 소리 내어 따라 말하도록 유도해 줘! (shouldShowFlashcard가 true일 때는 아이가 하나에만 집중할 수 있게 shouldSuggestEnglishReask는 false로 해줘.)'
   }
   - ${activeFlashcardContext ? `직전 단어카드는 "${activeFlashcardContext.koreanWord}"(${activeFlashcardContext.englishWord})였어. 아이가 이를 따라 말했으면 신나게 칭찬해 줘!` : ''}
   - flashcardChoices에는 정답 영어단어 1개와 쉬운 오답 2개(총 3개)를 넣어줘.`
}
4. **추억 사진 찾아주기**:
   - 아이가 "내가 언제 어디 갔었지?", "바다 사진 보여줘", "눈썰매장 언제 갔어?" 처럼 다녀온 곳이나 사진을 물어보면 아래 앨범 목록과 이미지를 분석해 isPhotoMemoryQuery를 true로 설정하고 matchedPhotoIds(최대 6개)를 골라 추억을 다정하게 이야기해 줘.

[등록된 가족 디지털 앨범 사진 목록]
${photoCatalogText || '(등록된 사진 없음)'}`;

    const messageParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    const looksLikePhotoQuery =
      !isAutoFollowUpAfterSilence &&
      /언제|어디|사진|갔|보여|바다|숲|캠핑|단풍|벚꽃|소풍|딸기|놀이공원|회전목마|눈|썰매|눈사람|여행|추억|beach|ocean|photo|camp|snow|park|where\s+did/i.test(
        trimmedMsg
      );

    if (looksLikePhotoQuery) {
      for (const p of photos.slice(0, 5)) {
        if (p.assetUrl && p.assetUrl.startsWith('/src/assets/images/')) {
          const diskPath = path.join(process.cwd(), p.assetUrl.replace(/^\//, ''));
          if (fs.existsSync(diskPath)) {
            const b64 = fs.readFileSync(diskPath).toString('base64');
            messageParts.push({
              inlineData: {
                mimeType: 'image/jpeg',
                data: b64,
              },
            });
            messageParts.push({
              text: `[참고 앨범 이미지 ID: "${p.id}", 날짜: ${p.date}, 장소: ${p.location}]`,
            });
          }
        }
      }
    }

    messageParts.push({
      text: isAutoFollowUpAfterSilence
        ? '[시스템 안내: 아이가 1분 동안 대답하지 않았어. 영어 따라하기를 부담 없이 부드럽게 넘기고, 아이가 재미있게 대답할 수 있는 다음 대화 주제를 먼저 다정하게 꺼내 줘!]'
        : requestFlashcard
        ? `${trimmedMsg} (대화 흐름에 맞는 큰 단어카드를 보여주고 소리 내어 따라 말해보자고 유도해 줘!)`
        : trimmedMsg,
    });

    const chat = ai.chats.create({
      model: 'gemini-3.8-flash',
      history: normalizedHistory,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            replyText: {
              type: Type.STRING,
              description: 'Warm, playful 2-3 sentence Korean response for a 3-7 year old child',
            },
            emotion: {
              type: Type.STRING,
              description: 'One of: excited, happy, curious, proud',
            },
            isPhotoMemoryQuery: {
              type: Type.BOOLEAN,
              description: 'True if the child asked about when/where they went or to see matching album photos',
            },
            matchedPhotoIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Matching photo IDs from the catalog',
            },
            memoryHeadline: {
              type: Type.STRING,
              description: 'Cute Korean title for the matched photos split view',
            },
            shouldSuggestEnglishReask: {
              type: Type.BOOLEAN,
              description: 'True when gently guiding the child to try asking again in simple English',
            },
            englishPhrase: {
              type: Type.STRING,
              description: 'Simple 2-5 word kid-friendly English sentence matching what the child said',
            },
            koreanPhonetic: {
              type: Type.STRING,
              description: 'Easy Korean Hangul pronunciation guide for englishPhrase',
            },
            englishNudgeText: {
              type: Type.STRING,
              description: 'Warm Korean prompt asking the child if they want to try saying it in English',
            },
            shouldShowFlashcard: {
              type: Type.BOOLEAN,
              description: 'True when pulling out a vocabulary flashcard as an English teacher bunny',
            },
            flashcardKorean: {
              type: Type.STRING,
              description: 'Korean word on the flashcard (e.g. 사과, 바다, 우산)',
            },
            flashcardEnglish: {
              type: Type.STRING,
              description: 'English word on the flashcard (e.g. Apple, Ocean, Umbrella)',
            },
            flashcardPhonetic: {
              type: Type.STRING,
              description: 'Korean Hangul pronunciation of flashcardEnglish (e.g. 애플)',
            },
            flashcardEmoji: {
              type: Type.STRING,
              description: 'Single vivid emoji representing the flashcard word',
            },
            flashcardHint: {
              type: Type.STRING,
              description: 'Short cute Korean hint for 3-7yo child',
            },
            flashcardExampleEn: {
              type: Type.STRING,
              description: 'Simple 3-5 word English sentence using flashcardEnglish',
            },
            flashcardChoices: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 English word choices including flashcardEnglish',
            },
          },
          required: [
            'replyText',
            'emotion',
            'isPhotoMemoryQuery',
            'matchedPhotoIds',
            'shouldSuggestEnglishReask',
            'shouldShowFlashcard',
          ],
        },
      },
    });

    const response = await chat.sendMessage({
      message: messageParts,
    });

    const data = JSON.parse((response.text ?? '{}').trim());
    res.json(data);
  } catch (err: unknown) {
    console.error('Bunny chat error:', err);
    const message = err instanceof Error ? err.message : '토끼 친구가 대답을 준비하다가 깜짝 놀랐어요.';
    res.status(500).json({ error: message });
  }
});

// 6. Multimodal Photo Analyzer for newly uploaded / connected album photos
app.post('/api/gemini/analyze-photo', async (req, res) => {
  try {
    const { base64Data, mimeType = 'image/jpeg', fileName = 'photo.jpg' } = req.body as {
      base64Data: string;
      mimeType?: string;
      fileName?: string;
    };
    if (!base64Data) {
      res.status(400).json({ error: '분석할 이미지 데이터가 없습니다.' });
      return;
    }

    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const ai = getAiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `파일명: "${fileName}"
이 가족 사진을 분석해서 스마트 디지털 액자와 어린이 추억 검색용 메타데이터를 한국어로 만들어 주세요.`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Short warm Korean photo title' },
            location: { type: Type.STRING, description: 'Inferred place type or location in Korean (e.g. 해변, 숲속 공원, 집 거실)' },
            aiSummary: {
              type: Type.STRING,
              description: '2-sentence Korean description of objects, scenery, season, and activities in the photo',
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '5-7 searchable Korean keywords',
            },
          },
          required: ['title', 'location', 'aiSummary', 'tags'],
        },
      },
    });

    res.json(JSON.parse((response.text ?? '{}').trim()));
  } catch (err: unknown) {
    console.error('Analyze photo error:', err);
    res.status(500).json({ error: '사진 AI 분석에 실패했습니다.' });
  }
});

function ensureWavBase64(base64Data: string, sampleRate = 24000): string {
  const pcmOrWav = Buffer.from(base64Data, 'base64');
  if (pcmOrWav.length >= 4 && pcmOrWav.subarray(0, 4).toString('ascii') === 'RIFF') {
    return base64Data;
  }
  const header = Buffer.alloc(44);
  const dataSize = pcmOrWav.length;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  header.writeUInt16LE(1, 22); // NumChannels = 1 (Mono)
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate (sampleRate * 1 * 16/8)
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmOrWav]).toString('base64');
}

// 7. Gemini TTS Endpoint (gemini-3.8-flash-lite-tts via Interactions API + clean fallback, Korean & English Teacher support)
app.post('/api/gemini/tts', async (req, res) => {
  const { text, speaker = 'assistant', lang = 'ko' } = req.body as {
    text?: string;
    speaker?: 'assistant' | 'tosuni' | 'tosili' | 'toddungi';
    lang?: 'ko' | 'en';
  };
  if (!text || !text.trim()) {
    res.status(400).json({ error: '음성 변환할 텍스트가 없습니다.' });
    return;
  }

  const cleanText = text.trim().slice(0, 450);

  const voiceMap: Record<string, { voiceName: string; style: string; enStyle: string }> = {
    tosuni: {
      voiceName: 'Kore',
      style: 'Warm, gentle, affectionate Korean young sister speaking softly and cheerfully to a 5-year-old child',
      enStyle: 'Warm, clear, friendly preschool English teacher pronouncing English slowly and cheerfully for a 5-year-old child',
    },
    tosili: {
      voiceName: 'Zephyr',
      style: 'Bright, energetic, playful little friend speaking excitedly in Korean to a young child',
      enStyle: 'Bright, cheerful, encouraging kid-friendly English pronunciation spoken clearly and slowly',
    },
    toddungi: {
      voiceName: 'Puck',
      style: 'Cute, bubbly, cheerful little bunny speaking warmly in Korean to a young child',
      enStyle: 'Cute, friendly, slow and clear English pronunciation for young children',
    },
    assistant: {
      voiceName: 'Kore',
      style: 'Calm, clear, friendly Korean smart home family assistant',
      enStyle: 'Clear, warm, friendly English voice',
    },
  };

  const chosen = voiceMap[speaker] ?? voiceMap.assistant;
  const targetStyle = lang === 'en' ? chosen.enStyle : chosen.style;

  try {
    const ai = getAiClient();

    // Primary path: Interactions API (native support for gemini-3.8-flash-lite-tts)
    try {
      const interaction = await ai.interactions.create({
        model: 'gemini-3.8-flash-lite-tts',
        input: [
          {
            type: 'text',
            text: cleanText,
            annotations: [
              {
                type: 'speech_metadata',
                style: targetStyle,
              },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [
            {
              voice: chosen.voiceName,
            },
          ],
        },
      });

      const audioData = interaction.output_audio?.data;
      if (audioData) {
        res.json({ audioBase64: ensureWavBase64(audioData), mimeType: 'audio/wav' });
        return;
      }
    } catch {
      // Secondary fallback: generateContent with plain AUDIO modality
      const fallbackRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: cleanText,
        config: {
          responseModalities: ['AUDIO'],
        },
      });

      const fallbackAudio = fallbackRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (fallbackAudio) {
        res.json({ audioBase64: ensureWavBase64(fallbackAudio), mimeType: 'audio/wav' });
        return;
      }
    }

    // Graceful browser speechSynthesis fallback when server TTS is unavailable
    res.json({ fallback: true });
  } catch {
    res.json({ fallback: true });
  }
});

// 8. Live Mart Holidays & Sale Events Refresh via Google Search Grounding
app.post('/api/gemini/mart-events', async (req, res) => {
  try {
    const { city = '서울' } = req.body as { city?: string };
    const ai = getAiClient();
    const nowStr = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });

    const searchRes = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `오늘 날짜는 ${nowStr}, 기준 지역은 "${city}"입니다. 한국 주요 대형마트(이마트, 롯데마트, 홈플러스, 코스트코, 트레이더스, 하나로마트)의 이번 달 의무휴무일 규칙 및 최근 진행 중인 주요 장보기 할인/세일 테마 5가지를 한 줄 전광판 문구 형태로 간결하게 정리해 주세요. 각 줄은 줄바꿈으로만 구분해 주세요.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawLines = (searchRes.text ?? '')
      .split('\n')
      .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((line) => line.length >= 8 && line.length <= 110)
      .slice(0, 6);

    res.json({ items: rawLines });
  } catch (err) {
    console.error('Mart events refresh error:', err);
    res.status(500).json({ error: '마트 휴무일 정보를 새로고침하지 못했습니다.' });
  }
});

// 9. Cloud & NAS Folder Connectors (Synology WebDAV, Synology DSM API, Google Drive, OneDrive)

// 9A. Synology WebDAV PROPFIND directory listing
app.post('/api/storage/webdav/browse', async (req, res) => {
  try {
    const { serverUrl, username, password, basePath = '/photo', demoMode = false } = req.body as {
      serverUrl?: string;
      username?: string;
      password?: string;
      basePath?: string;
      demoMode?: boolean;
    };

    if (demoMode) {
      res.json({
        connected: true,
        provider: 'synology_webdav',
        folders: [
          { id: 'webdav-jeju', name: '2026_제주도_가족바다여행', path: '/photo/2026_제주도_가족바다여행', photoCount: 24 },
          { id: 'webdav-camp', name: '2026_가평_단풍글램핑', path: '/photo/2026_가평_단풍글램핑', photoCount: 18 },
          { id: 'webdav-kids', name: '아이성장앨범_유치원소풍', path: '/photo/아이성장앨범_유치원소풍', photoCount: 42 },
          { id: 'webdav-winter', name: '2026_평창_눈썰매장', path: '/photo/2026_평창_눈썰매장', photoCount: 15 },
        ],
      });
      return;
    }

    if (!serverUrl || !username || !password) {
      res.status(400).json({ error: '시놀로지 WebDAV 서버 주소, 계정 ID, 비밀번호를 모두 입력해 주세요.' });
      return;
    }

    const normalizedUrl = `${serverUrl.replace(/\/+$/, '')}/${basePath.replace(/^\/+/, '')}/`;
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    const propfindRes = await fetch(normalizedUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader,
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!propfindRes.ok && propfindRes.status !== 207) {
      res.status(propfindRes.status).json({
        error: `WebDAV 서버 응답 오류 (HTTP ${propfindRes.status}). 포트(5005/5006) 및 WebDAV 활성화 여부를 확인해 주세요.`,
      });
      return;
    }

    const xml = await propfindRes.text();
    const hrefMatches = Array.from(xml.matchAll(/<(?:d:|D:)?href>([^<]+)<\/(?:d:|D:)?href>/g)).map((m) =>
      decodeURIComponent(m[1])
    );

    const folders = hrefMatches
      .filter((href) => href.endsWith('/') && href.replace(/\/+$/, '') !== basePath.replace(/\/+$/, ''))
      .map((href, idx) => {
        const segments = href.replace(/\/+$/, '').split('/').filter(Boolean);
        const folderName = segments[segments.length - 1] || `폴더_${idx + 1}`;
        return {
          id: `webdav-${idx}-${folderName}`,
          name: folderName,
          path: href,
          photoCount: 12 + idx * 5,
        };
      });

    res.json({ connected: true, provider: 'synology_webdav', folders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'WebDAV 서버 연결 실패';
    res.status(502).json({
      error: `시놀로지 WebDAV 서버에 연결할 수 없습니다 (${msg}). 외부 접속 주소(DDNS)와 포트포워딩을 확인하거나 샘플 NAS 테스트 모드를 이용해 보세요.`,
    });
  }
});

// 9B. Synology DSM API (FileStation / Synology Photos)
app.post('/api/storage/synology/folders', async (req, res) => {
  try {
    const { dsmUrl, account, passwd, otpCode, demoMode = false } = req.body as {
      dsmUrl?: string;
      account?: string;
      passwd?: string;
      otpCode?: string;
      demoMode?: boolean;
    };

    if (demoMode) {
      res.json({
        connected: true,
        provider: 'synology_api',
        folders: [
          { id: 'syno-shared-family', name: 'Synology Photos / 가족 공유 스페이스', path: '/photo/FamilySpace', photoCount: 68 },
          { id: 'syno-spring-picnic', name: '2026_서울숲_벚꽃피크닉', path: '/photo/2026_서울숲_벚꽃피크닉', photoCount: 31 },
          { id: 'syno-everland', name: '어린이날_에버랜드_나들이', path: '/photo/어린이날_에버랜드_나들이', photoCount: 27 },
        ],
      });
      return;
    }

    if (!dsmUrl || !account || !passwd) {
      res.status(400).json({ error: '시놀로지 DSM 주소, 계정, 비밀번호를 모두 입력해 주세요.' });
      return;
    }

    const cleanBase = dsmUrl.replace(/\/+$/, '');
    const loginParams = new URLSearchParams({
      api: 'SYNO.API.Auth',
      version: '6',
      method: 'login',
      account,
      passwd,
      session: 'FileStation',
      format: 'sid',
    });
    if (otpCode) loginParams.set('otp_code', otpCode);

    const authRes = await fetch(`${cleanBase}/webapi/auth.cgi?${loginParams.toString()}`, {
      signal: AbortSignal.timeout(7000),
    });
    const authJson = (await authRes.json()) as { success?: boolean; data?: { sid?: string }; error?: { code?: number } };

    if (!authJson.success || !authJson.data?.sid) {
      res.status(401).json({
        error: `시놀로지 DSM 로그인 실패 (오류 코드: ${authJson.error?.code ?? '인증 오류'}). 계정 정보 또는 2단계 인증(OTP)을 확인해 주세요.`,
      });
      return;
    }

    const sid = authJson.data.sid;
    const listParams = new URLSearchParams({
      api: 'SYNO.FileStation.List',
      version: '2',
      method: 'list_share',
      _sid: sid,
    });
    const listRes = await fetch(`${cleanBase}/webapi/entry.cgi?${listParams.toString()}`, {
      signal: AbortSignal.timeout(7000),
    });
    const listJson = (await listRes.json()) as {
      success?: boolean;
      data?: { shares?: Array<{ name: string; path: string }> };
    };

    const folders = (listJson.data?.shares ?? []).map((share, idx) => ({
      id: `syno-${idx}-${share.name}`,
      name: share.name,
      path: share.path,
      photoCount: 20,
    }));

    res.json({ connected: true, provider: 'synology_api', folders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'DSM API 연결 오류';
    res.status(502).json({
      error: `시놀로지 DSM API에 연결할 수 없습니다 (${msg}). 외부 HTTPS 포트(5001) 설정을 확인하거나 샘플 NAS 테스트 모드를 이용해 보세요.`,
    });
  }
});

// 9C. Google Drive folder listing (via user-configured OAuth token or workspace browser)
app.post('/api/storage/gdrive/folders', async (req, res) => {
  try {
    const { accessToken, demoMode = false } = req.body as { accessToken?: string; demoMode?: boolean };

    if (demoMode) {
      res.json({
        connected: true,
        provider: 'google_drive',
        folders: [
          { id: 'gdrive-jeju-2026', name: '내 드라이브 / 가족여행 / 제주협재바다', path: '/가족여행/제주협재바다', photoCount: 36 },
          { id: 'gdrive-picnic-2026', name: '내 드라이브 / 봄나들이 / 서울숲벚꽃피크닉', path: '/봄나들이/서울숲벚꽃피크닉', photoCount: 29 },
          { id: 'gdrive-kids-play', name: '내 드라이브 / 아이들추억 / 어린이날놀이공원', path: '/아이들추억/어린이날놀이공원', photoCount: 44 },
        ],
      });
      return;
    }

    if (!accessToken) {
      res.status(400).json({ error: 'Google Drive 액세스 토큰을 입력하거나 샘플 폴더 탐색을 선택해 주세요.' });
      return;
    }

    const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=30`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(7000),
      }
    );

    if (!driveRes.ok) {
      res.status(driveRes.status).json({ error: 'Google Drive 폴더 목록을 불러오지 못했습니다. 토큰 권한을 확인해 주세요.' });
      return;
    }

    const driveData = (await driveRes.json()) as { files?: Array<{ id: string; name: string }> };
    const folders = (driveData.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      path: `/GoogleDrive/${f.name}`,
      photoCount: 15,
    }));

    res.json({ connected: true, provider: 'google_drive', folders });
  } catch {
    res.status(502).json({ error: 'Google Drive API 호출 중 네트워크 오류가 발생했습니다.' });
  }
});

// 9D. Microsoft OneDrive OAuth URL & Folder Explorer
app.get('/api/auth/onedrive/url', (req, res) => {
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const redirectUri = String(req.query.redirectUri ?? `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`);

  if (!clientId) {
    res.status(400).json({
      configured: false,
      error: 'ONEDRIVE_CLIENT_ID 환경변수가 아직 설정되지 않았습니다. 액세스 토큰 직접 입력 또는 샘플 폴더 탐색을 이용할 수 있습니다.',
    });
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'Files.Read offline_access User.Read',
  });

  res.json({
    configured: true,
    url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
  });
});

const handleOAuthCallback = async (req: express.Request, res: express.Response) => {
  const code = String(req.query.code ?? '');
  let accessToken = '';

  if (code && process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_CLIENT_SECRET) {
    try {
      const redirectUri = `${(process.env.APP_URL || '').replace(/\/+$/, '')}/auth/callback`;
      const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.ONEDRIVE_CLIENT_ID,
          client_secret: process.env.ONEDRIVE_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (tokenRes.ok) {
        const tokenData = (await tokenRes.json()) as { access_token?: string };
        accessToken = tokenData.access_token ?? '';
      }
    } catch (err) {
      console.error('OneDrive token exchange error:', err);
    }
  }

  res.send(`<!doctype html>
<html lang="ko">
  <head><meta charset="utf-8" /><title>연동 완료</title></head>
  <body style="font-family:sans-serif;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'onedrive', accessToken: ${JSON.stringify(accessToken)} }, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
    <p>클라우드 계정 인증이 완료되었습니다. 창이 자동으로 닫힙니다.</p>
  </body>
</html>`);
};

app.get(['/auth/callback', '/auth/callback/'], handleOAuthCallback);

app.post('/api/storage/onedrive/folders', async (req, res) => {
  try {
    const { accessToken, demoMode = false } = req.body as { accessToken?: string; demoMode?: boolean };

    if (demoMode) {
      res.json({
        connected: true,
        provider: 'onedrive',
        folders: [
          { id: 'onedrive-autumn', name: 'OneDrive / 사진 / 가평단풍숲캠핑', path: '/Pictures/가평단풍숲캠핑', photoCount: 22 },
          { id: 'onedrive-snow', name: 'OneDrive / 사진 / 겨울평창눈썰매', path: '/Pictures/겨울평창눈썰매', photoCount: 19 },
          { id: 'onedrive-home', name: 'OneDrive / 카메라 앨범 / 주말일상', path: '/Pictures/주말일상', photoCount: 51 },
        ],
      });
      return;
    }

    if (!accessToken) {
      res.status(400).json({ error: 'OneDrive 액세스 토큰을 입력하거나 팝업 로그인 / 샘플 폴더 탐색을 선택해 주세요.' });
      return;
    }

    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,folder,parentReference', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(7000),
    });

    if (!graphRes.ok) {
      res.status(graphRes.status).json({ error: 'OneDrive 폴더 목록을 불러오지 못했습니다. 토큰을 확인해 주세요.' });
      return;
    }

    const graphData = (await graphRes.json()) as {
      value?: Array<{ id: string; name: string; folder?: { childCount?: number } }>;
    };
    const folders = (graphData.value ?? [])
      .filter((item) => Boolean(item.folder))
      .map((f) => ({
        id: f.id,
        name: f.name,
        path: `/OneDrive/${f.name}`,
        photoCount: f.folder?.childCount ?? 10,
      }));

    res.json({ connected: true, provider: 'onedrive', folders });
  } catch {
    res.status(502).json({ error: 'OneDrive Graph API 호출 중 오류가 발생했습니다.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Digital Photo Frame server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
