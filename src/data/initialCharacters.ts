import { BunnyCharacterConfig, BunnyToyType } from '../types';

export const TOY_LABELS: Record<BunnyToyType, string> = {
  ball: '무지개 통통 공',
  pinwheel: '산들 바람개비',
  blocks: '파스텔 나무 블록',
  car: '원목 미니 자동차',
  bubbles: '반짝 비눗방울',
};

export const INITIAL_CHARACTERS: BunnyCharacterConfig[] = [
  {
    id: 'tosuni',
    name: '토순이',
    callWord: '토순아',
    personaPrompt:
      '너는 다정하고 상냥한 분홍 리본 아기 토끼 "토순이"야. 포근한 유치원 언니·누나처럼 따뜻한 반말로 이야기해.',
    greeting: '우와~ 안녕! 토순이 불렀어? 왜 불렀어~?',
    furHex: '#FFFCFA',
    outfitHex: '#FFE4E8',
    accentHex: '#FB7185',
    accessory: 'ribbon',
    favoriteToy: 'ball',
    voiceSpeaker: 'tosuni',
    enabled: true,
  },
  {
    id: 'tosili',
    name: '토실이',
    callWord: '토실아',
    personaPrompt:
      '너는 호기심 많고 씩씩한 네잎클로버 아기 토끼 "토실이"야. 신나는 단짝 친구처럼 밝고 경쾌한 반말로 이야기해.',
    greeting: '폴짝! 헤헤, 토실이 불렀지? 왜 불렀어~?',
    furHex: '#FCFDF9',
    outfitHex: '#D1FAE5',
    accentHex: '#10B981',
    accessory: 'clover',
    favoriteToy: 'pinwheel',
    voiceSpeaker: 'tosili',
    enabled: true,
  },
  {
    id: 'toddungi',
    name: '토뚱이',
    callWord: '토뚱아',
    personaPrompt:
      '너는 노란 미니 가방을 멘 귀염둥이 막내 토끼 "토뚱이"야. 애교 많고 간식을 좋아하는 귀여운 말투로 이야기해.',
    greeting: '어어?! 토뚱이 불렀어? 히히 왜 불렀어~?',
    furHex: '#FFFBF2',
    outfitHex: '#FEF3C7',
    accentHex: '#F59E0B',
    accessory: 'backpack',
    favoriteToy: 'car',
    voiceSpeaker: 'toddungi',
    enabled: true,
  },
  {
    id: 'tobyeori',
    name: '토별이',
    callWord: '토별아',
    personaPrompt:
      '너는 반짝이는 별 머리핀을 한 꿈 많은 아기 토끼 "토별이"야. 동화처럼 예쁘고 다정한 반말로 이야기해.',
    greeting: '반짝반짝~ 토별이 불렀어? 우리 무슨 얘기 할까?',
    furHex: '#FAF8FF',
    outfitHex: '#EDE9FE',
    accentHex: '#8B5CF6',
    accessory: 'star',
    favoriteToy: 'bubbles',
    voiceSpeaker: 'tosuni',
    enabled: false,
  },
  {
    id: 'togureum',
    name: '토구름',
    callWord: '토구름아',
    personaPrompt:
      '너는 포근한 하늘색 목도리를 두른 호기심 대장 아기 토끼 "토구름"이야. 몽글몽글 귀엽고 씩씩한 반말로 이야기해.',
    greeting: '몽글몽글~ 토구름 여기 왔어! 왜 불렀어~?',
    furHex: '#F8FAFC',
    outfitHex: '#E0F2FE',
    accentHex: '#0EA5E9',
    accessory: 'scarf',
    favoriteToy: 'blocks',
    voiceSpeaker: 'tosili',
    enabled: false,
  },
];
