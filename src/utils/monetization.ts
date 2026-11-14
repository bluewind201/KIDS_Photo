export type MembershipPlanTier = 'free_ad_supported' | 'family_plus_pro';

export interface MonetizationConfig {
  planTier: MembershipPlanTier;
  /** Enables tasteful native sponsor placements in Parent Shopping Ticker & Sidebar (NEVER over photos or kids chat) */
  enableParentSponsorSlots: boolean;
  showInTopTicker: boolean;
  showInSidebarCard: boolean;
  /** Optional Google AdMob / AdManager or Direct Partner Unit ID for commercial deployment */
  adMobBannerUnitId: string;
  /** Optional local partner / affiliate campaign override */
  customPartnerBrand: string;
  customPartnerOffer: string;
  customPartnerUrl: string;
  campaigns: SponsorCampaignItem[];
}

export interface SponsorCampaignItem {
  id: string;
  badge: string;
  badgeText?: string;
  brandName: string;
  sponsorName: string;
  sponsorBrand: string;
  headline: string;
  subtext: string;
  benefitSummary: string;
  ctaLabel: string;
  landingUrl: string;
  category?: 'shopping' | 'kids_place' | 'photo_print';
  enabled?: boolean;
}

export const MONETIZATION_STORAGE_KEY = 'kids_photo_monetization_v1';

const DEFAULT_MONETIZATION_CONFIG: MonetizationConfig = {
  planTier: 'free_ad_supported',
  enableParentSponsorSlots: true,
  showInTopTicker: true,
  showInSidebarCard: true,
  adMobBannerUnitId: '',
  customPartnerBrand: '',
  customPartnerOffer: '',
  customPartnerUrl: '',
  campaigns: [],
};

export const CURATED_FAMILY_SPONSOR_CAMPAIGNS: SponsorCampaignItem[] = [
  {
    id: 'sp-photo-book',
    badge: 'AD · 패밀리 제휴',
    badgeText: 'AD · 패밀리 제휴',
    brandName: '우리가족 포토북 스튜디오',
    sponsorName: '우리가족 포토북 스튜디오',
    sponsorBrand: '우리가족 포토북 스튜디오',
    headline: '액자 속 베스트 가족사진 50장 하드커버 포토북 첫 주문 30% 할인',
    subtext: '아이 성장앨범 · 조부모님 선물용 고화질 인화 혜택',
    benefitSummary: '아이 성장앨범 · 조부모님 선물용 고화질 인화 혜택',
    ctaLabel: '혜택 보기',
    landingUrl: 'https://www.snaps.com',
    category: 'photo_print',
    enabled: true,
  },
  {
    id: 'sp-fresh-grocery',
    badge: 'AD · 장보기 혜택',
    badgeText: 'AD · 장보기 혜택',
    brandName: '패밀리 새벽배송 마켓',
    sponsorName: '패밀리 새벽배송 마켓',
    sponsorBrand: '패밀리 새벽배송 마켓',
    headline: '우리 아이 친환경 우유 · 무항생제 계란 · 제철 과일 첫 달 무료배송',
    subtext: '마트 의무휴무일에도 문 앞 새벽 도착',
    benefitSummary: '마트 의무휴무일에도 문 앞 새벽 도착',
    ctaLabel: '특가 확인',
    landingUrl: 'https://www.kurly.com',
    category: 'shopping',
    enabled: true,
  },
  {
    id: 'sp-kids-outing',
    badge: 'AD · 주말 나들이',
    badgeText: 'AD · 주말 나들이',
    brandName: '키즈 액티비티 패스',
    sponsorName: '키즈 액티비티 패스',
    sponsorBrand: '키즈 액티비티 패스',
    headline: '이번 주말 아쿠아리움 · 키즈카페 · 실내동물원 가족 입장권 최대 25% 우대',
    subtext: '미세먼지·비 오는 날에도 신나는 실내 나들이 코스',
    benefitSummary: '미세먼지·비 오는 날에도 신나는 실내 나들이 코스',
    ctaLabel: '나들이 혜택',
    landingUrl: 'https://booking.naver.com',
    category: 'kids_place',
    enabled: true,
  },
];

function normalizeSponsorItem(raw: Partial<SponsorCampaignItem>, idx: number): SponsorCampaignItem {
  const brand =
    String(raw.brandName || raw.sponsorBrand || raw.sponsorName || '패밀리 파트너').trim();
  const sub = String(raw.subtext || raw.benefitSummary || '우리 가족 맞춤 혜택').trim();
  const badge = String(raw.badge || raw.badgeText || 'AD · 패밀리 혜택').trim();
  return {
    id: String(raw.id || `sp-custom-${idx}`),
    badge,
    badgeText: badge,
    brandName: brand,
    sponsorName: brand,
    sponsorBrand: brand,
    headline: String(raw.headline || '우리 가족 제휴 특가 혜택').trim(),
    subtext: sub,
    benefitSummary: sub,
    ctaLabel: String(raw.ctaLabel || '혜택 보기').trim(),
    landingUrl: String(raw.landingUrl || 'https://www.coupang.com').trim(),
    category: raw.category || 'shopping',
    enabled: raw.enabled !== false,
  };
}

export function loadMonetizationConfig(): MonetizationConfig {
  try {
    const raw = localStorage.getItem(MONETIZATION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MonetizationConfig>;
      const customList = Array.isArray(parsed.campaigns)
        ? parsed.campaigns.map((c, idx) => normalizeSponsorItem(c, idx))
        : [];
      return {
        planTier:
          parsed.planTier === 'family_plus_pro' ? 'family_plus_pro' : 'free_ad_supported',
        enableParentSponsorSlots:
          typeof parsed.enableParentSponsorSlots === 'boolean'
            ? parsed.enableParentSponsorSlots
            : true,
        showInTopTicker:
          typeof parsed.showInTopTicker === 'boolean' ? parsed.showInTopTicker : true,
        showInSidebarCard:
          typeof parsed.showInSidebarCard === 'boolean' ? parsed.showInSidebarCard : true,
        adMobBannerUnitId: String(parsed.adMobBannerUnitId || '').trim(),
        customPartnerBrand: String(parsed.customPartnerBrand || '').trim(),
        customPartnerOffer: String(parsed.customPartnerOffer || '').trim(),
        customPartnerUrl: String(parsed.customPartnerUrl || '').trim(),
        campaigns: customList.length > 0 ? customList : [...CURATED_FAMILY_SPONSOR_CAMPAIGNS],
      };
    }
  } catch {
    // ignore storage read error
  }
  return {
    ...DEFAULT_MONETIZATION_CONFIG,
    campaigns: [...CURATED_FAMILY_SPONSOR_CAMPAIGNS],
  };
}

export function saveMonetizationConfig(cfg: MonetizationConfig): void {
  try {
    localStorage.setItem(MONETIZATION_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage write error
  }
}

export function getActiveSponsorCampaign(
  cfg: MonetizationConfig,
  rotationIndex = 0
): SponsorCampaignItem | null {
  if (cfg.planTier === 'family_plus_pro' || !cfg.enableParentSponsorSlots) {
    return null;
  }
  if (!cfg.showInTopTicker && !cfg.showInSidebarCard) {
    return null;
  }
  if (cfg.customPartnerBrand && cfg.customPartnerOffer) {
    return normalizeSponsorItem(
      {
        id: 'sp-custom-direct',
        badge: 'AD · 공식 제휴',
        brandName: cfg.customPartnerBrand,
        headline: cfg.customPartnerOffer,
        subtext: '스마트 패밀리 액자 전용 제휴 프로모션',
        ctaLabel: '자세히 보기',
        landingUrl: cfg.customPartnerUrl || 'https://google.com',
        category: 'shopping',
      },
      0
    );
  }
  const activePool = (
    cfg.campaigns && cfg.campaigns.length > 0
      ? cfg.campaigns.filter((c) => c.enabled !== false)
      : CURATED_FAMILY_SPONSOR_CAMPAIGNS
  ).map((c, idx) => normalizeSponsorItem(c, idx));
  if (activePool.length === 0) return null;
  const idx = Math.abs(rotationIndex) % activePool.length;
  return activePool[idx];
}
