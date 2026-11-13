import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { ScheduleItem, SelectableCalendarSource } from '../types';

export const CALENDAR_SOURCES_STORAGE_KEY = 'kids_photo_calendar_sources_v1';

interface AndroidCalendarBridgeGlobal {
  isAvailable?: () => boolean;
  hasCalendarPermission?: () => boolean;
  requestCalendarPermission?: () => void;
  listCalendars?: () => string;
  getEvents?: (calendarIdsJson: string, daysAhead: number) => string;
}

export function getAndroidCalendarBridge(): AndroidCalendarBridgeGlobal | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AndroidCalendarBridge?: AndroidCalendarBridgeGlobal };
  if (w.AndroidCalendarBridge && typeof w.AndroidCalendarBridge.isAvailable === 'function') {
    return w.AndroidCalendarBridge;
  }
  return null;
}

export const DEFAULT_KR_HOLIDAY_CALENDAR: SelectableCalendarSource = {
  id: 'preset-kr-holidays',
  name: '대한민국 공휴일 · 기념일',
  accountName: '한국 공식 달력 (내장 + 실시간 연동)',
  sourceType: 'kr_holidays',
  colorHex: '#EF4444',
  selected: false,
  icsUrl:
    'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics',
};

export function loadSavedCalendarSources(): SelectableCalendarSource[] {
  try {
    const raw = localStorage.getItem(CALENDAR_SOURCES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SelectableCalendarSource[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const hasKr = parsed.some((s) => s.id === DEFAULT_KR_HOLIDAY_CALENDAR.id);
        return hasKr ? parsed : [DEFAULT_KR_HOLIDAY_CALENDAR, ...parsed];
      }
    }
  } catch {
    // ignore storage errors
  }
  return [DEFAULT_KR_HOLIDAY_CALENDAR];
}

export function saveCalendarSources(sources: SelectableCalendarSource[]): void {
  try {
    localStorage.setItem(CALENDAR_SOURCES_STORAGE_KEY, JSON.stringify(sources));
  } catch {
    // ignore storage errors
  }
}

export async function ensureDeviceCalendarPermission(): Promise<boolean> {
  const bridge = getAndroidCalendarBridge();
  if (!bridge) return false;
  if (bridge.hasCalendarPermission?.()) return true;

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener('nativeCalendarPermEvent', onPerm as EventListener);
    };
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Boolean(bridge.hasCalendarPermission?.()));
    }, 25000);

    const onPerm = (ev: Event) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      const detail = (ev as CustomEvent<{ granted?: boolean }>).detail;
      resolve(Boolean(detail?.granted));
    };

    window.addEventListener('nativeCalendarPermEvent', onPerm as EventListener);
    bridge.requestCalendarPermission?.();
  });
}

/**
 * Discovers all calendars registered on the Android device and merges them with existing saved selections
 * so previously checked/unchecked preferences are preserved!
 */
export async function discoverAndMergeDeviceCalendars(
  currentSources: SelectableCalendarSource[]
): Promise<{ granted: boolean; sources: SelectableCalendarSource[]; discoveredCount: number }> {
  const bridge = getAndroidCalendarBridge();
  if (!bridge) {
    return { granted: false, sources: currentSources, discoveredCount: 0 };
  }

  const granted = await ensureDeviceCalendarPermission();
  if (!granted) {
    return { granted: false, sources: currentSources, discoveredCount: 0 };
  }

  let rawList: Array<{
    nativeCalendarId: string;
    name: string;
    accountName: string;
    colorHex: string;
    visibleByDefault?: boolean;
  }> = [];

  try {
    const jsonStr = bridge.listCalendars?.() || '[]';
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) rawList = parsed;
  } catch {
    rawList = [];
  }

  const existingById = new Map(currentSources.map((s) => [s.id, s]));
  const hadAnyDeviceCalBefore = currentSources.some((s) => s.sourceType === 'android_device');

  const deviceSources: SelectableCalendarSource[] = rawList.map((item, idx) => {
    const id = `android-cal-${item.nativeCalendarId}`;
    const prior = existingById.get(id);
    // On very first discovery, pre-select visible primary family/personal calendars (up to 2) for convenience,
    // while still letting the user freely check/uncheck any calendar!
    const defaultSelected = prior
      ? prior.selected
      : !hadAnyDeviceCalBefore && Boolean(item.visibleByDefault) && idx < 2;

    return {
      id,
      name: item.name,
      accountName: item.accountName,
      sourceType: 'android_device',
      colorHex: item.colorHex || '#4F46E5',
      selected: defaultSelected,
      nativeCalendarId: item.nativeCalendarId,
    };
  });

  const nonDeviceSources = currentSources.filter((s) => s.sourceType !== 'android_device');
  const merged = [...deviceSources, ...nonDeviceSources];
  return {
    granted: true,
    sources: merged,
    discoveredCount: deviceSources.length,
  };
}

export function normalizeCalendarInputToIcsUrl(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  if (/^webcals?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^webcals?:\/\//i, 'https://');
  }
  // Plain email / Google Calendar ID (e.g. `family123@group.calendar.google.com` or `user@gmail.com`)
  if (/^[^\s/]+@[^\s/]+\.[^\s/]+$/.test(trimmed) && !trimmed.startsWith('http')) {
    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(trimmed)}/public/basic.ics`;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function formatSmartKoreanDateLabel(targetDate: Date, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  ).getTime();
  const diffDays = Math.round((startOfTarget - startOfToday) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '내일';
  if (diffDays === 2) return '모레';

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${targetDate.getMonth() + 1}/${targetDate.getDate()}(${weekdays[targetDate.getDay()]})`;
}

function formatTimeHHMM(d: Date, allDay: boolean): string {
  if (allDay) return '종일';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Built-in 2026–2027 Korean Public Holidays table so holidays work 100% offline too!
const OFFLINE_KR_HOLIDAYS: Array<{ ymd: string; title: string }> = [
  { ymd: '2026-01-01', title: '신정 (새해 첫날)' },
  { ymd: '2026-02-16', title: '설날 연휴' },
  { ymd: '2026-02-17', title: '설날' },
  { ymd: '2026-02-18', title: '설날 연휴' },
  { ymd: '2026-03-01', title: '삼일절' },
  { ymd: '2026-03-02', title: '삼일절 대체공휴일' },
  { ymd: '2026-05-05', title: '어린이날' },
  { ymd: '2026-05-24', title: '부처님오신날' },
  { ymd: '2026-05-25', title: '부처님오신날 대체공휴일' },
  { ymd: '2026-06-03', title: '제9회 전국동시지방선거' },
  { ymd: '2026-06-06', title: '현충일' },
  { ymd: '2026-08-15', title: '광복절' },
  { ymd: '2026-08-17', title: '광복절 대체공휴일' },
  { ymd: '2026-09-24', title: '추석 연휴' },
  { ymd: '2026-09-25', title: '추석' },
  { ymd: '2026-09-26', title: '추석 연휴' },
  { ymd: '2026-10-03', title: '개천절' },
  { ymd: '2026-10-05', title: '개천절 대체공휴일' },
  { ymd: '2026-10-09', title: '한글날' },
  { ymd: '2026-12-25', title: '크리스마스 (성탄절)' },
  { ymd: '2027-01-01', title: '신정 (새해 첫날)' },
  { ymd: '2027-02-06', title: '설날 연휴' },
  { ymd: '2027-02-07', title: '설날' },
  { ymd: '2027-02-08', title: '설날 연휴' },
  { ymd: '2027-02-09', title: '설날 대체공휴일' },
  { ymd: '2027-03-01', title: '삼일절' },
  { ymd: '2027-05-05', title: '어린이날' },
  { ymd: '2027-05-13', title: '부처님오신날' },
  { ymd: '2027-06-06', title: '현충일' },
  { ymd: '2027-08-15', title: '광복절' },
  { ymd: '2027-08-16', title: '광복절 대체공휴일' },
  { ymd: '2027-09-14', title: '추석 연휴' },
  { ymd: '2027-09-15', title: '추석' },
  { ymd: '2027-09-16', title: '추석 연휴' },
  { ymd: '2027-10-03', title: '개천절' },
  { ymd: '2027-10-04', title: '개천절 대체공휴일' },
  { ymd: '2027-10-09', title: '한글날' },
  { ymd: '2027-10-11', title: '한글날 대체공휴일' },
  { ymd: '2027-12-25', title: '크리스마스 (성탄절)' },
];

function unescapeIcsText(val: string): string {
  return val
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseIcsDateTime(rawPropName: string, rawVal: string): { date: Date; allDay: boolean } | null {
  const val = rawVal.trim();
  // All-day YYYYMMDD
  if (/^\d{8}$/.test(val) || /VALUE=DATE/i.test(rawPropName)) {
    const y = Number(val.slice(0, 4));
    const m = Number(val.slice(4, 6)) - 1;
    const d = Number(val.slice(6, 8));
    return { date: new Date(y, m, d, 0, 0, 0), allDay: true };
  }

  // DateTime YYYYMMDDTHHMMSS(Z)
  const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);
  if (m) {
    const yr = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const da = Number(m[3]);
    const hr = Number(m[4]);
    const mi = Number(m[5]);
    const sc = Number(m[6] || '0');
    const isUtc = Boolean(m[7]);
    const d = isUtc ? new Date(Date.UTC(yr, mo, da, hr, mi, sc)) : new Date(yr, mo, da, hr, mi, sc);
    return { date: d, allDay: false };
  }

  return null;
}

export function parseIcsFeedToSchedules(
  icsText: string,
  source: SelectableCalendarSource,
  daysAhead = 60
): ScheduleItem[] {
  if (!icsText || !icsText.includes('BEGIN:VEVENT')) return [];

  // Unfold RFC 5545 folded lines (CRLF + space/tab)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const now = new Date();
  const minTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const maxTime = minTime + daysAhead * 24 * 60 * 60 * 1000;

  const items: ScheduleItem[] = [];
  let inEvent = false;
  let uid = '';
  let summary = '';
  let location = '';
  let status = '';
  let dtStartProp = '';
  let dtStartVal = '';
  let isYearly = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      uid = '';
      summary = '';
      location = '';
      status = '';
      dtStartProp = '';
      dtStartVal = '';
      isYearly = false;
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      if (inEvent && summary && dtStartVal && status.toUpperCase() !== 'CANCELLED') {
        const parsed = parseIcsDateTime(dtStartProp, dtStartVal);
        if (parsed) {
          let eventDate = parsed.date;
          if (isYearly && eventDate.getTime() < minTime) {
            eventDate = new Date(
              now.getFullYear(),
              eventDate.getMonth(),
              eventDate.getDate(),
              eventDate.getHours(),
              eventDate.getMinutes()
            );
            if (eventDate.getTime() < minTime) {
              eventDate.setFullYear(now.getFullYear() + 1);
            }
          }
          const ts = eventDate.getTime();
          if (ts >= minTime && ts <= maxTime) {
            items.push({
              id: `ics-${source.id}-${uid || ts}-${items.length}`,
              title: summary,
              date: formatSmartKoreanDateLabel(eventDate, now),
              time: formatTimeHHMM(eventDate, parsed.allDay),
              location: location || source.name,
              calendarId: source.id,
              calendarName: source.name,
              calendarColor: source.colorHex,
              isSynced: true,
              sortTimestamp: ts,
            });
          }
        }
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const rawKey = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1);
    const upperKey = rawKey.toUpperCase();

    if (upperKey === 'UID') uid = rawVal.trim();
    else if (upperKey.startsWith('SUMMARY')) summary = unescapeIcsText(rawVal);
    else if (upperKey.startsWith('LOCATION')) location = unescapeIcsText(rawVal);
    else if (upperKey === 'STATUS') status = rawVal.trim();
    else if (upperKey.startsWith('DTSTART')) {
      dtStartProp = upperKey;
      dtStartVal = rawVal.trim();
    } else if (upperKey.startsWith('RRULE') && /FREQ=YEARLY/i.test(rawVal)) {
      isYearly = true;
    }
  }

  return items;
}

async function fetchIcsTextCrossPlatform(icsUrl: string): Promise<string> {
  const normalized = normalizeCalendarInputToIcsUrl(icsUrl);
  if (!normalized) return '';

  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url: normalized,
      headers: {
        Accept: 'text/calendar,text/plain,*/*;q=0.9',
        'User-Agent': 'TosuniSmartFrame/1.1',
      },
      responseType: 'text',
      connectTimeout: 10000,
      readTimeout: 12000,
    });
    if (res.status >= 200 && res.status < 300 && typeof res.data === 'string') {
      return res.data;
    }
    throw new Error(`캘린더 응답 오류 (HTTP ${res.status})`);
  }

  const res = await fetch(normalized);
  if (!res.ok) {
    throw new Error(`캘린더 응답 오류 (HTTP ${res.status})`);
  }
  return await res.text();
}

function getOfflineKoreanHolidaySchedules(
  source: SelectableCalendarSource,
  daysAhead = 75
): ScheduleItem[] {
  const now = new Date();
  const minTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const maxTime = minTime + daysAhead * 24 * 60 * 60 * 1000;

  return OFFLINE_KR_HOLIDAYS.map((h) => {
    const [y, m, d] = h.ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 0, 0, 0);
    return { ...h, dt, ts: dt.getTime() };
  })
    .filter((h) => h.ts >= minTime && h.ts <= maxTime)
    .map((h) => ({
      id: `krhol-${h.ymd}`,
      title: h.title,
      date: formatSmartKoreanDateLabel(h.dt, now),
      time: '종일',
      location: '공휴일',
      calendarId: source.id,
      calendarName: source.name,
      calendarColor: source.colorHex,
      isSynced: true,
      sortTimestamp: h.ts,
    }));
}

export async function testAndPreviewIcsCalendar(
  rawUrlOrId: string,
  name: string,
  colorHex: string
): Promise<{ normalizedUrl: string; sampleCount: number }> {
  const normalizedUrl = normalizeCalendarInputToIcsUrl(rawUrlOrId);
  if (!normalizedUrl) {
    throw new Error('캘린더 주소(ICS URL 또는 구글 캘린더 이메일/ID)를 입력해 주세요.');
  }
  const text = await fetchIcsTextCrossPlatform(normalizedUrl);
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error(
      '유효한 iCal(.ics) 형식이 아닙니다. 캘린더 설정에서 [iCal 형식의 공개/비공개 주소(.ics)]를 복사해 붙여넣어 주세요.'
    );
  }
  const tempSource: SelectableCalendarSource = {
    id: 'preview',
    name,
    accountName: '외부 캘린더',
    sourceType: 'ics_url',
    colorHex,
    selected: true,
    icsUrl: normalizedUrl,
  };
  const parsed = parseIcsFeedToSchedules(text, tempSource, 120);
  return { normalizedUrl, sampleCount: parsed.length };
}

/**
 * Fetches upcoming events from ALL user-selected (`selected === true`) calendars
 * (Android Device Calendars + Korean Holidays + External ICS Calendars) and sorts chronologically!
 */
export async function fetchAllSelectedCalendarSchedules(
  sources: SelectableCalendarSource[]
): Promise<ScheduleItem[]> {
  const selectedSources = sources.filter((s) => s.selected);
  if (selectedSources.length === 0) return [];

  const now = new Date();
  const collected: ScheduleItem[] = [];

  // 1) Android Device Calendars (Samsung / Google / Naver / Outlook / Shared Family)
  const deviceSources = selectedSources.filter(
    (s) => s.sourceType === 'android_device' && s.nativeCalendarId
  );
  const bridge = getAndroidCalendarBridge();
  if (deviceSources.length > 0 && bridge && bridge.hasCalendarPermission?.()) {
    try {
      const ids = deviceSources.map((s) => s.nativeCalendarId!);
      const colorByNativeId = new Map(deviceSources.map((s) => [s.nativeCalendarId!, s]));
      const rawJson = bridge.getEvents?.(JSON.stringify(ids), 45) || '[]';
      const events = JSON.parse(rawJson) as Array<{
        id: string;
        calendarId: string;
        calendarName: string;
        title: string;
        startMillis: number;
        allDay: boolean;
        location: string;
        colorHex: string;
      }>;

      for (const ev of events) {
        const dt = new Date(ev.startMillis);
        const srcCfg = colorByNativeId.get(ev.calendarId);
        collected.push({
          id: ev.id,
          title: ev.title,
          date: formatSmartKoreanDateLabel(dt, now),
          time: formatTimeHHMM(dt, ev.allDay),
          location: ev.location || srcCfg?.name || ev.calendarName,
          calendarId: srcCfg?.id || `android-cal-${ev.calendarId}`,
          calendarName: srcCfg?.name || ev.calendarName,
          calendarColor: srcCfg?.colorHex || ev.colorHex || '#4F46E5',
          isSynced: true,
          sortTimestamp: ev.startMillis,
        });
      }
    } catch {
      // Ignore native query error
    }
  }

  // 2) Korean Public Holidays Calendar
  const krHolidaySource = selectedSources.find((s) => s.sourceType === 'kr_holidays');
  if (krHolidaySource) {
    let loadedOnline = false;
    if (krHolidaySource.icsUrl) {
      try {
        const text = await fetchIcsTextCrossPlatform(krHolidaySource.icsUrl);
        const parsed = parseIcsFeedToSchedules(text, krHolidaySource, 75);
        if (parsed.length > 0) {
          collected.push(...parsed);
          loadedOnline = true;
        }
      } catch {
        loadedOnline = false;
      }
    }
    if (!loadedOnline) {
      collected.push(...getOfflineKoreanHolidaySchedules(krHolidaySource, 75));
    }
  }

  // 3) External Cloud ICS Calendars (Google / Naver / Apple iCloud / Outlook)
  const icsSources = selectedSources.filter((s) => s.sourceType === 'ics_url' && s.icsUrl);
  await Promise.all(
    icsSources.map(async (src) => {
      try {
        const text = await fetchIcsTextCrossPlatform(src.icsUrl!);
        const parsed = parseIcsFeedToSchedules(text, src, 60);
        collected.push(...parsed);
      } catch {
        // Keep previously cached or other calendar sources working
      }
    })
  );

  // Deduplicate identical (title + date + time) events across calendars & sort chronologically
  const seen = new Set<string>();
  const deduped: ScheduleItem[] = [];
  collected.sort((a, b) => (a.sortTimestamp ?? 0) - (b.sortTimestamp ?? 0));

  for (const item of collected) {
    const key = `${item.title}::${item.date}::${item.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.slice(0, 40);
}
