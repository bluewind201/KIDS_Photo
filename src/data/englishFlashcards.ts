import { BunnyFlashcard, ChildGrowthStage } from '../types';

export interface GrowthFlashcardSeed
  extends Omit<BunnyFlashcard, 'id' | 'revealed' | 'selectedChoice'> {
  minStage: ChildGrowthStage;
}

export const KIDS_ENGLISH_FLASHCARDS: GrowthFlashcardSeed[] = [
  {
    koreanWord: '사과',
    englishWord: 'Apple',
    phonetic: '애플',
    emoji: '🍎',
    hintText: '빨갛고 아삭아삭 달콤한 과일이야!',
    exampleEn: 'Yummy red apple!',
    choices: ['Apple', 'Banana', 'Milk'],
    minStage: 'age_3_4',
  },
  {
    koreanWord: '바나나',
    englishWord: 'Banana',
    phonetic: '바나나',
    emoji: '🍌',
    hintText: '노랗고 길쭉한 달콤 과일이야!',
    exampleEn: 'I like yellow bananas!',
    choices: ['Banana', 'Star', 'Tree'],
    minStage: 'age_3_4',
  },
  {
    koreanWord: '토끼',
    englishWord: 'Bunny',
    phonetic: '버니',
    emoji: '🐰',
    hintText: '깡충깡충 긴 귀를 가진 우리 동물친구!',
    exampleEn: 'Hello, cute little bunny!',
    choices: ['Bunny', 'Puppy', 'Cloud'],
    minStage: 'age_3_4',
  },
  {
    koreanWord: '강아지',
    englishWord: 'Puppy',
    phonetic: '퍼피',
    emoji: '🐶',
    hintText: '멍멍! 꼬리를 살랑살랑 흔드는 친구야!',
    exampleEn: 'The puppy is so cute!',
    choices: ['Puppy', 'Flower', 'Car'],
    minStage: 'age_3_4',
  },
  {
    koreanWord: '공',
    englishWord: 'Ball',
    phonetic: '볼',
    emoji: '⚽',
    hintText: '통통 튀기며 데구르르 굴리고 노는 장난감!',
    exampleEn: 'Roll the big ball!',
    choices: ['Ball', 'Star', 'Puppy'],
    minStage: 'age_3_4',
  },
  {
    koreanWord: '햇님',
    englishWord: 'Sun',
    phonetic: '선',
    emoji: '☀️',
    hintText: '하늘에서 반짝반짝 따뜻하게 비춰줘요!',
    exampleEn: 'The warm sun is shining!',
    choices: ['Sun', 'Rain', 'Book'],
    minStage: 'age_3_4',
  },
  {
    koreanWord: '별',
    englishWord: 'Star',
    phonetic: '스타',
    emoji: '⭐',
    hintText: '밤하늘에서 반짝반짝 빛나요!',
    exampleEn: 'Twinkle twinkle little star!',
    choices: ['Star', 'Sun', 'House'],
    minStage: 'age_3_4',
  },
  {
    koreanWord: '자동차',
    englishWord: 'Car',
    phonetic: '카',
    emoji: '🚗',
    hintText: '부릉부릉 바퀴가 데구르르 굴러가요!',
    exampleEn: 'Vroom vroom, little car!',
    choices: ['Car', 'Tree', 'Apple'],
    minStage: 'age_3_4',
  },
  {
    koreanWord: '눈사람',
    englishWord: 'Snowman',
    phonetic: '스노우맨',
    emoji: '⛄',
    hintText: '하얀 눈을 동글동글 굴려서 당근 코를 쏙 끼웠어요!',
    exampleEn: 'Let us build a snowman!',
    choices: ['Snowman', 'Rainbow', 'Flower'],
    minStage: 'age_5',
  },
  {
    koreanWord: '눈덩이',
    englishWord: 'Snowball',
    phonetic: '스노우볼',
    emoji: '❄️',
    hintText: '데구르르 굴리면 점점 커지는 동그란 눈!',
    exampleEn: 'Roll a big snowball!',
    choices: ['Snowball', 'Ocean', 'Banana'],
    minStage: 'age_5',
  },
  {
    koreanWord: '바다',
    englishWord: 'Ocean',
    phonetic: '오션',
    emoji: '🌊',
    hintText: '철썩철썩 푸른 파도가 치는 넓은 곳!',
    exampleEn: 'Let us go to the ocean!',
    choices: ['Ocean', 'House', 'Ball'],
    minStage: 'age_5',
  },
  {
    koreanWord: '꽃',
    englishWord: 'Flower',
    phonetic: '플라워',
    emoji: '🌸',
    hintText: '잔디밭에 향기롭게 활짝 피어났어요!',
    exampleEn: 'What a pretty pink flower!',
    choices: ['Flower', 'Ball', 'House'],
    minStage: 'age_5',
  },
  {
    koreanWord: '나무',
    englishWord: 'Tree',
    phonetic: '트리',
    emoji: '🌳',
    hintText: '비 올 때 우리가 그늘 아래로 쏙 피하는 초록 친구!',
    exampleEn: 'Let us rest under the tree!',
    choices: ['Tree', 'Car', 'Star'],
    minStage: 'age_5',
  },
  {
    koreanWord: '집',
    englishWord: 'House',
    phonetic: '하우스',
    emoji: '🏡',
    hintText: '우리 토끼 친구들이 도란도란 모여 사는 곳!',
    exampleEn: 'Welcome to our little house!',
    choices: ['House', 'Tree', 'Rainbow'],
    minStage: 'age_5',
  },
  {
    koreanWord: '우산',
    englishWord: 'Umbrella',
    phonetic: '엄브렐라',
    emoji: '☂️',
    hintText: '비가 후드득 내릴 때 머리 위에 활짝 펴요!',
    exampleEn: 'Open your pretty umbrella!',
    choices: ['Umbrella', 'Sun', 'Milk'],
    minStage: 'age_6_7',
  },
  {
    koreanWord: '무지개',
    englishWord: 'Rainbow',
    phonetic: '레인보우',
    emoji: '🌈',
    hintText: '비가 그치면 하늘에 뜨는 일곱 빛깔 다리!',
    exampleEn: 'Look at the pretty rainbow!',
    choices: ['Rainbow', 'Cloud', 'Apple'],
    minStage: 'age_6_7',
  },
  {
    koreanWord: '딸기',
    englishWord: 'Strawberry',
    phonetic: '스트로베리',
    emoji: '🍓',
    hintText: '콕콕 씨가 박힌 새콤달콤 빨간 열매!',
    exampleEn: 'I love sweet red strawberries!',
    choices: ['Strawberry', 'Banana', 'Ocean'],
    minStage: 'age_6_7',
  },
  {
    koreanWord: '나비',
    englishWord: 'Butterfly',
    phonetic: '버터플라이',
    emoji: '🦋',
    hintText: '팔랑팔랑 예쁜 날개로 꽃밭을 날아다녀요!',
    exampleEn: 'Look at the pretty butterfly!',
    choices: ['Butterfly', 'Bunny', 'Car'],
    minStage: 'age_6_7',
  },
];

function shuffleStrings(arr: string[]): string[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const STAGE_RANK: Record<ChildGrowthStage, number> = {
  age_3_4: 1,
  age_5: 2,
  age_6_7: 3,
};

export function pickRandomFlashcard(
  excludeEnglishWord?: string,
  stage: ChildGrowthStage = 'age_5'
): BunnyFlashcard {
  const maxRank = STAGE_RANK[stage] ?? 2;
  const stageFiltered = KIDS_ENGLISH_FLASHCARDS.filter(
    (c) =>
      STAGE_RANK[c.minStage] <= maxRank &&
      (!excludeEnglishWord || c.englishWord.toLowerCase() !== excludeEnglishWord.toLowerCase())
  );
  const pool = stageFiltered.length > 0 ? stageFiltered : KIDS_ENGLISH_FLASHCARDS;
  const chosen = pool[Math.floor(Math.random() * pool.length)] ?? KIDS_ENGLISH_FLASHCARDS[0];

  return {
    koreanWord: chosen.koreanWord,
    englishWord: chosen.englishWord,
    phonetic: chosen.phonetic,
    emoji: chosen.emoji,
    hintText: chosen.hintText,
    exampleEn: chosen.exampleEn,
    id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    choices: shuffleStrings(chosen.choices),
    revealed: false,
  };
}

/**
 * Checks whether a 3-7yo child's Korean/English SpeechRecognition transcript
 * matches the target English word/phrase or its Hangul phonetic pronunciation.
 */
export function matchesSpokenEnglishAttempt(
  transcript: string,
  englishTarget: string,
  koreanPhonetic: string
): boolean {
  const cleanRaw = transcript.trim().toLowerCase();
  if (!cleanRaw) return false;

  const cleanTargetEn = englishTarget
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim();
  if (cleanTargetEn) {
    const enWords = cleanTargetEn.split(/\s+/).filter((w) => w.length >= 2);
    if (enWords.length > 0) {
      const matchedEnCount = enWords.filter((w) => cleanRaw.includes(w)).length;
      if (matchedEnCount >= Math.ceil(enWords.length * 0.5)) {
        return true;
      }
    }
  }

  const compactSpokenKo = cleanRaw.replace(/[^가-힣]/g, '');
  const compactTargetKo = koreanPhonetic.replace(/[^가-힣]/g, '');
  if (compactSpokenKo.length >= 2 && compactTargetKo.length >= 2) {
    if (
      compactSpokenKo.includes(compactTargetKo) ||
      compactTargetKo.includes(compactSpokenKo)
    ) {
      return true;
    }
    // Check overlapping syllables for slightly imperfect toddler pronunciation
    let hitChars = 0;
    for (const ch of compactTargetKo) {
      if (compactSpokenKo.includes(ch)) hitChars += 1;
    }
    if (hitChars / compactTargetKo.length >= 0.65) {
      return true;
    }
  }

  return false;
}
