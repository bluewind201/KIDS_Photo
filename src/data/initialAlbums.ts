import jejuBeachImg from '../assets/images/album_jeju_beach_1794490213192.jpg';
import autumnForestImg from '../assets/images/album_autumn_forest_1794490215148.jpg';
import springPicnicImg from '../assets/images/album_spring_picnic_1794490216085.jpg';
import themeParkImg from '../assets/images/album_theme_park_1794490218671.jpg';
import snowSleddingImg from '../assets/images/album_snow_sledding_1794490218862.jpg';
import { DigitalAlbum, MartTickerItem, ScheduleItem, StorageProvider } from '../types';

export const PROVIDER_LABELS: Record<StorageProvider, string> = {
  share_link: '공유 링크 간편 등록 (추천)',
  google_drive: 'Google Drive',
  onedrive: 'Microsoft OneDrive',
  synology_webdav: 'Synology WebDAV',
  synology_api: 'Synology DSM / Photos API',
  local_folder: '내 기기 사진 폴더',
};

export const SAMPLE_PHOTO_POOL = [
  {
    src: jejuBeachImg,
    assetUrl: '/src/assets/images/album_jeju_beach_1794490213192.jpg',
    title: '제주 협재 에메랄드 바닷가 모래놀이',
    date: '2026년 8월 15일',
    location: '제주 협재 해수욕장',
    tags: ['바다', '제주도', '여름휴가', '모래성', '노란양동이', '조개껍데기', '해변'],
    aiSummary:
      '노을빛이 비치는 제주 협재 바닷가 백사장에서 아이와 손을 잡고 걷고, 노란 모래놀이 양동이에 예쁜 조개껍데기를 가득 담은 여름 가족 여행 사진입니다.',
  },
  {
    src: autumnForestImg,
    assetUrl: '/src/assets/images/album_autumn_forest_1794490215148.jpg',
    title: '가평 노란 은행나무 숲속 글램핑',
    date: '2026년 10월 18일',
    location: '가평 단풍 숲속 캠핑장',
    tags: ['숲', '캠핑', '단풍', '가을', '글램핑', '텐트', '가평', '은행나무'],
    aiSummary:
      '노란 은행잎과 붉은 단풍이 가득한 가평 숲속 데크 위에 아늑한 베이지색 텐트와 따뜻한 캠핑 랜턴을 켜고 쉬었던 가을 캠핑 사진입니다.',
  },
  {
    src: springPicnicImg,
    assetUrl: '/src/assets/images/album_spring_picnic_1794490216085.jpg',
    title: '서울숲 벚꽃 나무 아래 딸기 소풍',
    date: '2026년 4월 12일',
    location: '성수동 서울숲 공원',
    tags: ['봄', '벚꽃', '소풍', '피크닉', '딸기', '샌드위치', '서울숲', '공원'],
    aiSummary:
      '분홍빛 벚꽃이 활짝 핀 서울숲 잔디밭 위에 빨간 체크 돗자리를 펴고, 라탄 바구니와 새빨간 딸기·샌드위치를 나누어 먹던 봄 소풍 사진입니다.',
  },
  {
    src: themeParkImg,
    assetUrl: '/src/assets/images/album_theme_park_1794490218671.jpg',
    title: '어린이날 반짝반짝 회전목마와 대관람차',
    date: '2026년 5월 5일',
    location: '용인 에버랜드 놀이공원',
    tags: ['놀이공원', '에버랜드', '어린이날', '회전목마', '관람차', '팝콘', '봄나들이'],
    aiSummary:
      '저녁노을 아래 황금빛 조명이 반짝이는 회전목마와 커다란 대관람차, 고소한 팝콘 수레 앞에서 신나게 놀았던 어린이날 놀이공원 사진입니다.',
  },
  {
    src: snowSleddingImg,
    assetUrl: '/src/assets/images/album_snow_sledding_1794490218862.jpg',
    title: '평창 하얀 눈썰매장과 빨간 목도리 눈사람',
    date: '2026년 1월 24일',
    location: '강원도 평창 대관령 눈썰매장',
    tags: ['겨울', '눈', '눈썰매', '눈사람', '평창', '강원도', '목도리', '나무썰매'],
    aiSummary:
      '새하얀 눈이 소복하게 쌓인 강원도 평창 눈썰매장 언덕에서 빨간 털목도리를 두른 귀여운 눈사람을 만들고 나무 썰매를 탔던 겨울 여행 사진입니다.',
  },
];

export const INITIAL_ALBUMS: DigitalAlbum[] = [
  {
    id: 'album-gdrive-family-2026',
    name: '가족 사계절 나들이 베스트',
    provider: 'google_drive',
    folderPath: '/내 드라이브/가족사진/2026_우리가족추억',
    enabled: true,
    createdAt: '2026-11-01',
    photos: [
      {
        id: 'photo-jeju-beach-1',
        albumId: 'album-gdrive-family-2026',
        albumName: '가족 사계절 나들이 베스트',
        provider: 'google_drive',
        ...SAMPLE_PHOTO_POOL[0],
      },
      {
        id: 'photo-spring-picnic-1',
        albumId: 'album-gdrive-family-2026',
        albumName: '가족 사계절 나들이 베스트',
        provider: 'google_drive',
        ...SAMPLE_PHOTO_POOL[2],
      },
      {
        id: 'photo-theme-park-1',
        albumId: 'album-gdrive-family-2026',
        albumName: '가족 사계절 나들이 베스트',
        provider: 'google_drive',
        ...SAMPLE_PHOTO_POOL[3],
      },
    ],
  },
  {
    id: 'album-synology-camping-winter',
    name: '시놀로지 NAS · 캠핑 & 겨울여행',
    provider: 'synology_webdav',
    folderPath: '/photo/캠핑과_겨울여행',
    enabled: true,
    createdAt: '2026-11-05',
    photos: [
      {
        id: 'photo-autumn-forest-1',
        albumId: 'album-synology-camping-winter',
        albumName: '시놀로지 NAS · 캠핑 & 겨울여행',
        provider: 'synology_webdav',
        ...SAMPLE_PHOTO_POOL[1],
      },
      {
        id: 'photo-snow-sledding-1',
        albumId: 'album-synology-camping-winter',
        albumName: '시놀로지 NAS · 캠핑 & 겨울여행',
        provider: 'synology_webdav',
        ...SAMPLE_PHOTO_POOL[4],
      },
    ],
  },
];

export const INITIAL_SCHEDULES: ScheduleItem[] = [
  {
    id: 'sched-1',
    title: '유치원 숲체험 소풍 준비물 챙기기',
    date: '오늘',
    time: '09:00',
    location: '해바라기 유치원',
  },
  {
    id: 'sched-2',
    title: '소아과 영유아 정기 검진',
    date: '오늘',
    time: '15:30',
    location: '우리들 소아청소년과',
  },
  {
    id: 'sched-3',
    title: '할머니·할아버지 댁 저녁 식사',
    date: '내일',
    time: '18:00',
    location: '성남 분당구',
  },
  {
    id: 'sched-4',
    title: '주말 국립과천과학관 나들이',
    date: '토요일',
    time: '10:30',
    location: '과천시 상하벌로',
  },
];

export const INITIAL_MART_TICKERS: MartTickerItem[] = [
  {
    id: 'mart-1',
    category: '휴무일',
    storeName: '이마트 · 트레이더스',
    content: '이번 달 둘째·넷째 일요일 의무휴무 (일부 지점 수요일 휴무 확인)',
  },
  {
    id: 'mart-2',
    category: '세일·행사',
    storeName: '이마트 주말특가',
    content: '한우 등심·국거리 신세계포인트 적립 시 40% 할인 및 제철 감귤 골라담기 행사',
  },
  {
    id: 'mart-3',
    category: '휴무일',
    storeName: '롯데마트 · 홈플러스',
    content: '매월 2·4주차 일요일 정기 의무휴무 운영 (주말 장보기는 토요일 저녁까지)',
  },
  {
    id: 'mart-4',
    category: '세일·행사',
    storeName: '홈플러스 장보기위크',
    content: '친환경 계란·우유·어린이 간식 1+1 및 김장철 배추·무 사전예약 특가',
  },
  {
    id: 'mart-5',
    category: '휴무일',
    storeName: '코스트코 코리아',
    content: '양재·상봉·광명점 둘째·넷째 일요일 휴무 / 일산·울산점 둘째·넷째 수요일 휴무',
  },
];
