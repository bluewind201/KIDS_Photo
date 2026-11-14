import { MartTickerItem } from '../types';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface MartHolidaySummary {
  cityLabel: string;
  regionLabel: string;
  ruleLabel: string;
  isWednesdayRegion: boolean;
  isClosedToday: boolean;
  currentMonth: number;
  thisMonthClosedDates: Date[];
  nextMonth: number;
  nextMonthClosedDates: Date[];
  upcomingSundayDate: Date;
  isUpcomingSundayClosed: boolean;
  nextClosedDate: Date;
  thisWeekendBadge: string;
  upcomingStatusBadge: string;
  thisSundayStatusText: string;
  closedDatesShortText: string;
  thisMonthHolidayListText: string;
  nextMonthHolidayListText: string;
  thisMonthClosedText: string;
  nextMonthClosedText: string;
  costcoClosedText: string;
  costcoNote: string;
}

/**
 * Returns the exact calendar Date for the N-th occurrence (1-based) of `weekday` (0=Sun..6=Sat) in `(year, month0)`.
 */
export function getNthWeekdayOfMonth(
  year: number,
  month0: number,
  weekday: number,
  nth: number
): Date {
  const firstDay = new Date(year, month0, 1);
  const offset = (weekday - firstDay.getDay() + 7) % 7;
  const dayOfMonth = 1 + offset + (nth - 1) * 7;
  return new Date(year, month0, dayOfMonth, 12, 0, 0, 0);
}

export function formatMonthDayWeek(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY_KO[d.getDay()]})`;
}

export function formatShortSlashDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_KO[d.getDay()]})`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Municipalities in Korea that switched large-mart mandatory holidays from 2nd/4th Sunday to 2nd/4th Wednesday.
 */
function detectWednesdayMartRegion(city: string): boolean {
  const c = (city || '').trim();
  return /대구|청주|구미|경산|영천|김천|안동|의왕|당진|홍성|서초|동대문/.test(c);
}

/**
 * Deterministically computes exact Korean large-mart mandatory closed dates for `now` and `city`.
 */
export function computeKoreanMartHolidaySummary(
  city = '서울특별시',
  now: Date = new Date()
): MartHolidaySummary {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const year = now.getFullYear();
  const month0 = now.getMonth();
  const isWed = detectWednesdayMartRegion(city);
  const targetWeekday = isWed ? 3 : 0; // 3 = 수요일, 0 = 일요일

  const cur2nd = getNthWeekdayOfMonth(year, month0, targetWeekday, 2);
  const cur4th = getNthWeekdayOfMonth(year, month0, targetWeekday, 4);
  const thisMonthClosedDates = [cur2nd, cur4th];

  const nextMonthDate = new Date(year, month0 + 1, 1);
  const ny = nextMonthDate.getFullYear();
  const nm0 = nextMonthDate.getMonth();
  const next2nd = getNthWeekdayOfMonth(ny, nm0, targetWeekday, 2);
  const next4th = getNthWeekdayOfMonth(ny, nm0, targetWeekday, 4);
  const nextMonthClosedDates = [next2nd, next4th];

  const allUpcoming = [...thisMonthClosedDates, ...nextMonthClosedDates].filter(
    (d) => d.getTime() >= todayStart.getTime()
  );
  const nextClosedDate = allUpcoming[0] ?? next2nd;

  // Upcoming (or today's) Sunday check for weekend family grocery shopping
  const daysUntilSunday = (7 - now.getDay()) % 7;
  const upcomingSundayDate = new Date(
    year,
    month0,
    now.getDate() + daysUntilSunday,
    12,
    0,
    0,
    0
  );

  const sun2nd = getNthWeekdayOfMonth(
    upcomingSundayDate.getFullYear(),
    upcomingSundayDate.getMonth(),
    0,
    2
  );
  const sun4th = getNthWeekdayOfMonth(
    upcomingSundayDate.getFullYear(),
    upcomingSundayDate.getMonth(),
    0,
    4
  );

  const isUpcomingSundayClosed =
    !isWed &&
    (isSameCalendarDay(upcomingSundayDate, sun2nd) ||
      isSameCalendarDay(upcomingSundayDate, sun4th));

  const sunLabel = formatShortSlashDate(upcomingSundayDate);
  const thisWeekendBadge = isWed
    ? `이번 일요일(${sunLabel}) 정상영업 🟢 (평일 수요일 휴무 지역)`
    : isUpcomingSundayClosed
    ? `이번 일요일(${sunLabel}) 정기 의무휴무 🔴`
    : `이번 일요일(${sunLabel}) 정상영업 🟢`;

  // Show current month's exact dates; if both passed, show next month's exact dates too
  const curAllPassed = cur4th.getTime() < todayStart.getTime();
  const closedDatesShortText = curAllPassed
    ? `${nm0 + 1}월 휴무: ${formatMonthDayWeek(next2nd)}, ${formatMonthDayWeek(next4th)}`
    : `${month0 + 1}월 휴무: ${formatMonthDayWeek(cur2nd)}, ${formatMonthDayWeek(cur4th)}`;

  // Costco Korea branch-aware exact dates
  const isCostcoWedCity = /일산|고양|울산|대구|청주/.test(city || '');
  const costco2nd = getNthWeekdayOfMonth(year, month0, isCostcoWedCity ? 3 : 0, 2);
  const costco4th = getNthWeekdayOfMonth(year, month0, isCostcoWedCity ? 3 : 0, 4);
  const nextCostco2nd = getNthWeekdayOfMonth(ny, nm0, isCostcoWedCity ? 3 : 0, 2);
  const nextCostco4th = getNthWeekdayOfMonth(ny, nm0, isCostcoWedCity ? 3 : 0, 4);
  const costcoClosedText =
    costco4th.getTime() < todayStart.getTime()
      ? `${formatMonthDayWeek(nextCostco2nd)}, ${formatMonthDayWeek(nextCostco4th)}`
      : `${formatMonthDayWeek(costco2nd)}, ${formatMonthDayWeek(costco4th)}`;

  const isClosedToday = isSameCalendarDay(now, cur2nd) || isSameCalendarDay(now, cur4th);
  const thisMonthHolidayListText = `${formatMonthDayWeek(cur2nd)}, ${formatMonthDayWeek(cur4th)}`;
  const nextMonthHolidayListText = `${formatMonthDayWeek(next2nd)}, ${formatMonthDayWeek(next4th)}`;
  const thisMonthClosedText = `${month0 + 1}월 휴무: ${thisMonthHolidayListText}`;
  const nextMonthClosedText = `${nm0 + 1}월 휴무: ${nextMonthHolidayListText}`;

  return {
    cityLabel: city || '우리 동네',
    regionLabel: city || '우리 동네',
    ruleLabel: isWed ? '둘째·넷째 수요일 의무휴업 지역' : '둘째·넷째 일요일 의무휴업 기준',
    isWednesdayRegion: isWed,
    isClosedToday,
    currentMonth: month0 + 1,
    thisMonthClosedDates,
    nextMonth: nm0 + 1,
    nextMonthClosedDates,
    upcomingSundayDate,
    isUpcomingSundayClosed,
    nextClosedDate,
    thisWeekendBadge,
    upcomingStatusBadge: thisWeekendBadge,
    thisSundayStatusText: thisWeekendBadge,
    closedDatesShortText,
    thisMonthHolidayListText,
    nextMonthHolidayListText,
    thisMonthClosedText,
    nextMonthClosedText,
    costcoClosedText,
    costcoNote: `${costcoClosedText} (일산·울산·대구·청주점은 둘째·넷째 수요일 휴무)`,
  };
}

/**
 * Builds rich, exact-date MartTickerItem[] for the top header and Parent Info Hub.
 */
export function buildExactDateMartTickers(
  city = '서울특별시',
  now: Date = new Date()
): MartTickerItem[] {
  const s = computeKoreanMartHolidaySummary(city, now);
  const nextClosedLabel = formatMonthDayWeek(s.nextClosedDate);

  return [
    {
      id: 'mart-auto-emart',
      category: '휴무일',
      storeName: '이마트 · 트레이더스',
      content: `${s.closedDatesShortText} · ${s.thisWeekendBadge} (다음 휴무: ${nextClosedLabel})`,
    },
    {
      id: 'mart-auto-lottemart',
      category: '휴무일',
      storeName: '롯데마트 · 홈플러스',
      content: `${s.closedDatesShortText} (${s.cityLabel} ${s.ruleLabel}) · ${s.thisWeekendBadge}`,
    },
    {
      id: 'mart-auto-costco',
      category: '휴무일',
      storeName: '코스트코 코리아',
      content: `정기 휴무일: ${s.costcoClosedText} (일산·울산·대구·청주점은 둘째·넷째 수요일 휴무)`,
    },
    {
      id: 'mart-auto-weekend-deal',
      category: '세일·행사',
      storeName: '주말 가족 장보기 브리핑',
      content: `${s.thisWeekendBadge} — 제철 과일·한우·우유·어린이 간식 주말 특가전 진행 중`,
    },
    {
      id: 'mart-auto-hanaro',
      category: '세일·행사',
      storeName: '농협 하나로마트 · 식자재마트',
      content: `의무휴업 없이 연중무휴 정상영업 (${formatShortSlashDate(s.upcomingSundayDate)} 일요일 방문 가능)`,
    },
  ];
}

/**
 * Detects whether a persisted martItems list only contains old vague non-date defaults so we can upgrade it automatically.
 */
export function shouldAutoUpgradeMartTickers(items: MartTickerItem[]): boolean {
  if (!Array.isArray(items) || items.length === 0) return true;
  const hasAnyCustom = items.some(
    (it) => !/^mart-[1-5]$/.test(it.id) && !it.id.startsWith('mart-auto-')
  );
  if (hasAnyCustom) return false;
  // Refresh if legacy vague items (`mart-1..5`) OR if auto-generated items don't match current month
  const curMonthPrefix = `${new Date().getMonth() + 1}월 휴무:`;
  const hasCurrentMonthExactDate = items.some((it) => it.content.includes(curMonthPrefix));
  return !hasCurrentMonthExactDate;
}
