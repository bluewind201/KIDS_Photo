import {
  AnimalSpecies,
  BunnyAccessoryType,
  BunnyCharacterConfig,
  BunnyToyType,
  BunnyVoiceSpeaker,
} from '../types';

export const SPECIES_LABELS: Record<AnimalSpecies, string> = {
  bunny: '토끼 인형',
  puppy: '강아지 인형',
  bear: '곰돌이 인형',
  kitty: '고양이 인형',
  fox: '여우 인형',
  hamster: '햄스터 인형',
  penguin: '펭귄 인형',
  dino: '아기공룡 인형',
};

export const SPECIES_EMOJIS: Record<AnimalSpecies, string> = {
  bunny: '🐰',
  puppy: '🐶',
  bear: '🐻',
  kitty: '🐱',
  fox: '🦊',
  hamster: '🐹',
  penguin: '🐧',
  dino: '🦖',
};

export const ACCESSORY_LABELS: Record<BunnyAccessoryType, string> = {
  none: '아이템 없음 (순수 인형)',
  ribbon: '머리 리본 핀',
  bowtie: '목 나비넥타이',
  clover: '행운 네잎클로버',
  backpack: '미니 배낭',
  star: '반짝 별 머리핀',
  scarf: '포근한 목도리',
  crown: '꼬마 왕관',
  beret: '화가 베레모',
  cape: '슈퍼 영웅 망토',
  glasses: '동글 안경',
  heart_hug: '품에 안은 하트쿠션',
  flower_hat: '봄꽃 모자',
};

export const TOY_LABELS: Record<BunnyToyType, string> = {
  ball: '무지개 통통 공',
  pinwheel: '산들 바람개비',
  blocks: '파스텔 나무 블록',
  car: '원목 미니 자동차',
  bubbles: '반짝 비눗방울',
};

export const VOICE_SPEAKER_LABELS: Record<BunnyVoiceSpeaker, string> = {
  tosuni: '다정한 언니 톤 (Gemini Leda · SunHi · Supertone F1)',
  tosili: '통통 튀는 단짝 톤 (Gemini Zephyr · 밝은톤 · Supertone F2)',
  toddungi: '포근한 귀염둥이 톤 (Gemini Puck · Hyunsu · Supertone F5)',
  tobyeori: '차분한 동화요정 톤 (Gemini Aoede · 동화톤 · Supertone F3)',
  togureum: '씩씩한 소년 대장 톤 (Gemini Fenrir · InJoon · Supertone M1)',
};

export const FUR_COLOR_PRESETS: Array<{ label: string; hex: string }> = [
  { label: '크림 화이트', hex: '#FFFCFA' },
  { label: '바닐라 베이지', hex: '#F6EAD7' },
  { label: '카라멜 테디', hex: '#D99B66' },
  { label: '초코 브라운', hex: '#8B5A3C' },
  { label: '치즈 오렌지', hex: '#F59E42' },
  { label: '벚꽃 핑크', hex: '#FBCFE8' },
  { label: '버터 옐로우', hex: '#FEF08A' },
  { label: '민트 그린', hex: '#A7F3D0' },
  { label: '스카이 블루', hex: '#BAE6FD' },
  { label: '라벤더 퍼플', hex: '#DDD6FE' },
  { label: '소프트 그레이', hex: '#D4D4D8' },
  { label: '차콜 턱시도', hex: '#3F3F46' },
];

export const EAR_INNER_COLOR_PRESETS: Array<{ label: string; hex: string }> = [
  { label: '베이비 핑크', hex: '#FDA4AF' },
  { label: '크림 아이보리', hex: '#FFFBEB' },
  { label: '살구 피치', hex: '#FDBA74' },
  { label: '밀크 베이지', hex: '#E7CBA9' },
  { label: '버터 옐로우', hex: '#FDE047' },
  { label: '하늘 민트', hex: '#7DD3FC' },
];

export const OUTFIT_COLOR_PRESETS: Array<{
  label: string;
  outfitHex: string;
  accentHex: string;
}> = [
  { label: '코랄 핑크', outfitHex: '#FFE4E8', accentHex: '#FB7185' },
  { label: '민트 클로버', outfitHex: '#D1FAE5', accentHex: '#10B981' },
  { label: '버터 옐로우', outfitHex: '#FEF3C7', accentHex: '#F59E0B' },
  { label: '스카이 블루', outfitHex: '#E0F2FE', accentHex: '#0EA5E9' },
  { label: '라벤더 스타', outfitHex: '#EDE9FE', accentHex: '#8B5CF6' },
  { label: '베리 레드', outfitHex: '#FFE4E6', accentHex: '#E11D48' },
  { label: '초코 크림', outfitHex: '#F5ECE2', accentHex: '#92400E' },
  { label: '네이비 마린', outfitHex: '#DBEAFE', accentHex: '#1D4ED8' },
];

export interface PlushDollQuickTemplate {
  label: string;
  species: AnimalSpecies;
  furHex: string;
  earInnerHex: string;
  outfitHex: string;
  accentHex: string;
  showOutfit: boolean;
  accessory: BunnyAccessoryType;
  favoriteToy: BunnyToyType;
  voiceSpeaker: BunnyVoiceSpeaker;
  defaultName: string;
}

export const DOLL_QUICK_TEMPLATES: PlushDollQuickTemplate[] = [
  {
    label: '🐰 크림 애착토끼',
    species: 'bunny',
    furHex: '#FFFCFA',
    earInnerHex: '#FDA4AF',
    outfitHex: '#FFE4E8',
    accentHex: '#FB7185',
    showOutfit: true,
    accessory: 'ribbon',
    favoriteToy: 'ball',
    voiceSpeaker: 'tosuni',
    defaultName: '토순이',
  },
  {
    label: '🐶 초코 푸들 강아지',
    species: 'puppy',
    furHex: '#C68B59',
    earInnerHex: '#9A6338',
    outfitHex: '#FEF3C7',
    accentHex: '#EF4444',
    showOutfit: false,
    accessory: 'bowtie',
    favoriteToy: 'ball',
    voiceSpeaker: 'togureum',
    defaultName: '코코',
  },
  {
    label: '🐻 카라멜 테디베어',
    species: 'bear',
    furHex: '#D99B66',
    earInnerHex: '#FFFBEB',
    outfitHex: '#E0F2FE',
    accentHex: '#0284C7',
    showOutfit: false,
    accessory: 'heart_hug',
    favoriteToy: 'blocks',
    voiceSpeaker: 'toddungi',
    defaultName: '보리',
  },
  {
    label: '🐱 치즈 아기고양이',
    species: 'kitty',
    furHex: '#FDE68A',
    earInnerHex: '#FDA4AF',
    outfitHex: '#FFE4E8',
    accentHex: '#EC4899',
    showOutfit: true,
    accessory: 'crown',
    favoriteToy: 'bubbles',
    voiceSpeaker: 'tobyeori',
    defaultName: '나비',
  },
  {
    label: '🦖 민트 아기공룡',
    species: 'dino',
    furHex: '#86EFAC',
    earInnerHex: '#FEF08A',
    outfitHex: '#FEF3C7',
    accentHex: '#F97316',
    showOutfit: false,
    accessory: 'cape',
    favoriteToy: 'car',
    voiceSpeaker: 'togureum',
    defaultName: '뾰뾰',
  },
  {
    label: '🐧 노란부리 아기펭귄',
    species: 'penguin',
    furHex: '#38BDF8',
    earInnerHex: '#FFFFFF',
    outfitHex: '#E0F2FE',
    accentHex: '#F43F5E',
    showOutfit: false,
    accessory: 'scarf',
    favoriteToy: 'pinwheel',
    voiceSpeaker: 'tosili',
    defaultName: '포포',
  },
  {
    label: '🐹 볼통통 햄스터',
    species: 'hamster',
    furHex: '#F6D5B0',
    earInnerHex: '#FDA4AF',
    outfitHex: '#FEF3C7',
    accentHex: '#F59E0B',
    showOutfit: false,
    accessory: 'flower_hat',
    favoriteToy: 'ball',
    voiceSpeaker: 'toddungi',
    defaultName: '모모',
  },
  {
    label: '🦊 주황 꼬마여우',
    species: 'fox',
    furHex: '#FB923C',
    earInnerHex: '#FFFBEB',
    outfitHex: '#D1FAE5',
    accentHex: '#10B981',
    showOutfit: true,
    accessory: 'beret',
    favoriteToy: 'pinwheel',
    voiceSpeaker: 'tosili',
    defaultName: '루비',
  },
];

function hasKoreanBatchim(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * Automatically builds natural Korean vocative & STT variants from a character's name
 * so the child NEVER needs a separate wake-word — calling the character's name directly
 * (e.g., "코코야!", "보리야", "토순아", "곰돌아 오늘 날씨 어때?") wakes that exact animal!
 */
export function buildKoreanNameCallVariants(
  rawName: string,
  legacyCallWord?: string
): { primaryCall: string; variants: string[] } {
  const cleanName = (rawName || '').replace(/[!?.~\s]/g, '');
  if (!cleanName) {
    return { primaryCall: '친구야', variants: ['친구야'] };
  }

  const lastChar = cleanName[cleanName.length - 1];
  const vocativeFull = `${cleanName}${hasKoreanBatchim(lastChar) ? '아' : '야'}`;

  // Handle names ending with suffix "-이" (e.g. "토순이" -> stem "토순" -> "토순아")
  let primaryCall = vocativeFull;
  const set = new Set<string>([cleanName, vocativeFull]);

  if (cleanName.length >= 3 && lastChar === '이') {
    const stem = cleanName.slice(0, -1);
    const stemLast = stem[stem.length - 1];
    const stemVocative = `${stem}${hasKoreanBatchim(stemLast) ? '아' : '야'}`;
    primaryCall = stemVocative;
    set.add(stem);
    set.add(stemVocative);
    set.add(`${cleanName}야`);
  }

  if (legacyCallWord) {
    const cleanCall = legacyCallWord.replace(/[!?.~\s]/g, '');
    if (cleanCall.length >= 2) set.add(cleanCall);
  }

  // Common child pronunciation / STT homophones
  if (cleanName === '토순이') ['토수나', '토수니'].forEach((v) => set.add(v));
  if (cleanName === '토실이') ['토시라', '토시리'].forEach((v) => set.add(v));
  if (cleanName === '토뚱이') ['토뚜아', '토뚱야'].forEach((v) => set.add(v));
  if (cleanName === '뾰뾰') ['뽀뽀', '뾰뾰야', '뽀뽀야', '공룡아'].forEach((v) => set.add(v));
  if (cleanName === '코코') ['코코아', '강아지야'].forEach((v) => set.add(v));
  if (cleanName === '보리') ['곰돌아', '곰돌이야'].forEach((v) => set.add(v));
  if (cleanName === '나비') ['야옹아', '고양이야'].forEach((v) => set.add(v));
  if (cleanName === '포포') ['펭귄아'].forEach((v) => set.add(v));

  return {
    primaryCall,
    variants: Array.from(set).filter((w) => w.length >= 2),
  };
}

export const INITIAL_CHARACTERS: BunnyCharacterConfig[] = [
  {
    id: 'tosuni',
    name: '토순이',
    callWord: '토순아',
    species: 'bunny',
    personaPrompt:
      '너는 다정하고 상냥한 크림색 애착 토끼 인형 "토순이"야. 포근한 언니·누나처럼 따뜻한 반말로 아이와 눈을 맞추듯 이야기해.',
    greeting: '우와~ 안녕! 토순이 불렀어? 우리 무슨 재미있는 이야기 할까~?',
    furHex: '#FFFCFA',
    earInnerHex: '#FDA4AF',
    outfitHex: '#FFE4E8',
    accentHex: '#FB7185',
    showOutfit: true,
    accessory: 'ribbon',
    favoriteToy: 'ball',
    voiceSpeaker: 'tosuni',
    enabled: true,
  },
  {
    id: 'coco_puppy',
    name: '코코',
    callWord: '코코야',
    species: 'puppy',
    personaPrompt:
      '너는 꼬리를 살랑살랑 흔드는 귀여운 초코베이지 강아지 인형 "코코"야! 아이를 세상에서 제일 좋아하는 신나는 단짝 강아지 친구처럼 밝고 애교 있는 반말로 이야기해.',
    greeting: '멍멍! 헤헤~ 코코 불렀어? 꼬리가 살랑살랑 신난다~!',
    furHex: '#D69E6E',
    earInnerHex: '#9A6338',
    outfitHex: '#FEF3C7',
    accentHex: '#EF4444',
    showOutfit: false,
    accessory: 'bowtie',
    favoriteToy: 'ball',
    voiceSpeaker: 'tosili',
    enabled: true,
  },
  {
    id: 'bori_bear',
    name: '보리',
    callWord: '보리야',
    species: 'bear',
    personaPrompt:
      '너는 폭신폭신 포근한 카라멜 테디베어 곰돌이 인형 "보리"야. 마음이 넓고 다정한 곰돌이 친구처럼 따뜻하고 부드러운 반말로 이야기해.',
    greeting: '포근포근~ 곰돌이 보리 왔어! 오늘 기분이 어때~?',
    furHex: '#C98A55',
    earInnerHex: '#FFFBEB',
    outfitHex: '#E0F2FE',
    accentHex: '#F43F5E',
    showOutfit: false,
    accessory: 'heart_hug',
    favoriteToy: 'blocks',
    voiceSpeaker: 'toddungi',
    enabled: true,
  },
  {
    id: 'nabi_kitty',
    name: '나비',
    callWord: '나비야',
    species: 'kitty',
    personaPrompt:
      '너는 호기심 많고 새침귀여운 아기 고양이 인형 "나비"야. 야옹~ 하고 다정하고 예쁜 목소리로 아이의 상상을 북돋아 주며 반말로 이야기해.',
    greeting: '야옹~ 반가워! 나비 불렀냥? 같이 신나게 놀자~!',
    furHex: '#FEF08A',
    earInnerHex: '#FDA4AF',
    outfitHex: '#FFE4E8',
    accentHex: '#EC4899',
    showOutfit: true,
    accessory: 'crown',
    favoriteToy: 'bubbles',
    voiceSpeaker: 'tobyeori',
    enabled: false,
  },
  {
    id: 'pyopyo_dino',
    name: '뾰뾰',
    callWord: '뾰뾰야',
    species: 'dino',
    personaPrompt:
      '너는 용감하고 호기심 넘치는 민트색 꼬마 아기공룡 인형 "뾰뾰"야! 크아앙~ 귀엽고 씩씩한 모험 대장 친구처럼 신나는 반말로 이야기해.',
    greeting: '크아앙~ 헤헤! 꼬마공룡 뾰뾰 출동! 무슨 모험 이야기 할까?',
    furHex: '#86EFAC',
    earInnerHex: '#FEF08A',
    outfitHex: '#FEF3C7',
    accentHex: '#F97316',
    showOutfit: false,
    accessory: 'cape',
    favoriteToy: 'car',
    voiceSpeaker: 'togureum',
    enabled: false,
  },
  {
    id: 'popo_penguin',
    name: '포포',
    callWord: '포포야',
    species: 'penguin',
    personaPrompt:
      '너는 뒤뚱뒤뚱 귀엽게 걷는 하늘색 아기 펭귄 인형 "포포"야. 눈과 얼음, 바다 이야기를 좋아하는 명랑한 반말로 이야기해.',
    greeting: '뒤뚱뒤뚱~ 안녕! 아기펭귄 포포 여기 왔어~!',
    furHex: '#38BDF8',
    earInnerHex: '#FFFFFF',
    outfitHex: '#E0F2FE',
    accentHex: '#FB7185',
    showOutfit: false,
    accessory: 'scarf',
    favoriteToy: 'pinwheel',
    voiceSpeaker: 'tosili',
    enabled: false,
  },
  {
    id: 'momo_hamster',
    name: '모모',
    callWord: '모모야',
    species: 'hamster',
    personaPrompt:
      '너는 볼주머니가 말랑말랑 통통한 귀여운 햄스터 인형 "모모"야. 맛있는 간식과 소풍 이야기를 좋아하는 애교 가득한 반말로 이야기해.',
    greeting: '찍찍~ 헤헤! 볼통통 모모 불렀어? 반가워~!',
    furHex: '#F6D5B0',
    earInnerHex: '#FDA4AF',
    outfitHex: '#FEF3C7',
    accentHex: '#F59E0B',
    showOutfit: false,
    accessory: 'flower_hat',
    favoriteToy: 'ball',
    voiceSpeaker: 'toddungi',
    enabled: false,
  },
  {
    id: 'ruby_fox',
    name: '루비',
    callWord: '루비야',
    species: 'fox',
    personaPrompt:
      '너는 풍성한 꼬리와 화가 베레모를 쓴 영리한 꼬마 여우 인형 "루비"야. 동화 속 숲속 친구처럼 재치 있고 다정한 반말로 이야기해.',
    greeting: '살랑살랑~ 꼬마여우 루비 왔어! 오늘 어떤 재미난 일이 있었어?',
    furHex: '#FB923C',
    earInnerHex: '#FFFBEB',
    outfitHex: '#D1FAE5',
    accentHex: '#10B981',
    showOutfit: true,
    accessory: 'beret',
    favoriteToy: 'pinwheel',
    voiceSpeaker: 'tobyeori',
    enabled: false,
  },
  {
    id: 'tosili',
    name: '토실이',
    callWord: '토실아',
    species: 'bunny',
    personaPrompt:
      '너는 호기심 많고 씩씩한 네잎클로버 아기 토끼 "토실이"야. 신나는 단짝 친구처럼 밝고 경쾌한 반말로 이야기해.',
    greeting: '폴짝! 헤헤, 토실이 불렀지? 왜 불렀어~?',
    furHex: '#FCFDF9',
    earInnerHex: '#FDA4AF',
    outfitHex: '#D1FAE5',
    accentHex: '#10B981',
    showOutfit: true,
    accessory: 'clover',
    favoriteToy: 'pinwheel',
    voiceSpeaker: 'tosili',
    enabled: false,
  },
];

/**
 * Ensures saved character lists from earlier app versions seamlessly gain the new
 * multi-species plush animal presets (`코코`, `보리`, `나비`, `뾰뾰`, `포포`, `모모`, `루비`)
 * while preserving every user-created or user-modified character!
 */
export function upgradeSavedCharacterRoster(
  savedChars: BunnyCharacterConfig[]
): BunnyCharacterConfig[] {
  const normalized = savedChars.map((c) => {
    const species: AnimalSpecies = c.species || 'bunny';
    const { primaryCall } = buildKoreanNameCallVariants(c.name, c.callWord);
    return {
      ...c,
      species,
      callWord: c.callWord?.trim() || primaryCall,
      earInnerHex: c.earInnerHex || '#FDA4AF',
      showOutfit: c.showOutfit !== undefined ? c.showOutfit : true,
      voiceSpeaker:
        c.id === 'tobyeori' && c.voiceSpeaker === 'tosuni'
          ? 'tobyeori'
          : c.id === 'togureum' && c.voiceSpeaker === 'tosili'
          ? 'togureum'
          : c.voiceSpeaker,
    };
  });

  const existingIds = new Set(normalized.map((c) => c.id));
  const additions: BunnyCharacterConfig[] = [];
  for (const preset of INITIAL_CHARACTERS) {
    if (!existingIds.has(preset.id)) {
      // Keep user's active outdoor count comfortable while making all new species ready to toggle or summon by name!
      additions.push({ ...preset, enabled: false });
    }
  }

  return [...normalized, ...additions];
}
