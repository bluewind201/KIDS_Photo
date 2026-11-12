export type StorageProvider =
  | 'google_drive'
  | 'onedrive'
  | 'synology_webdav'
  | 'synology_api'
  | 'local_folder';

export type FrameTransitionMode = 'ken_burns' | 'frame_sway' | 'gallery_matte' | 'dual_split';

export type LayoutSide = 'left' | 'right';

export type WeatherEffectMode = 'auto' | 'sun' | 'breeze' | 'rain' | 'snow' | 'off';

export type ChildGrowthStage = 'age_3_4' | 'age_5' | 'age_6_7';

export interface PowerScheduleConfig {
  enabled: boolean;
  wakeTime: string; // "07:00" - 예약 강제 켜짐
  sleepTime: string; // "22:30" - 심야 화면 끄기
  awayEnabled: boolean; // 낮 외출(집에 없는 시간) 절전 사용
  awayStartTime: string; // "09:30" - 외출 화면 끄기 시작
  awayEndTime: string; // "16:30" - 귀가 예약 강제 켜짐
  activeDays: number[]; // 0(일) ~ 6(토)
  idleOffMinutes: number; // 0(사용안함) | 15 | 30 | 60
}

export interface PhotoItem {
  id: string;
  albumId: string;
  albumName: string;
  provider: StorageProvider;
  title: string;
  src: string;
  assetUrl?: string;
  date: string;
  location: string;
  tags: string[];
  aiSummary: string;
}

export interface DigitalAlbum {
  id: string;
  name: string;
  provider: StorageProvider;
  folderPath: string;
  enabled: boolean;
  createdAt: string;
  photos: PhotoItem[];
}

export interface RemoteFolderItem {
  id: string;
  name: string;
  path: string;
  photoCount: number;
}

export interface WeatherPayload {
  city: string;
  lat: number;
  lng: number;
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    condition: string;
    iconKey: string;
    todayMin: number;
    todayMax: number;
  };
  tomorrow: {
    minTemp: number;
    maxTemp: number;
    rainChance: number;
    condition: string;
    iconKey: string;
  };
  airQuality: {
    pm10: number;
    pm10Grade: string;
    pm10Level: 'good' | 'normal' | 'bad' | 'very-bad';
    pm25: number;
    pm25Grade: string;
    pm25Level: 'good' | 'normal' | 'bad' | 'very-bad';
  };
  updatedAt: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
}

export interface MartTickerItem {
  id: string;
  category: '휴무일' | '세일·행사';
  storeName: string;
  content: string;
}

export type BunnyId = string;

export type BunnyVoiceSpeaker = 'tosuni' | 'tosili' | 'toddungi';

export type BunnyAccessoryType = 'ribbon' | 'clover' | 'backpack' | 'star' | 'scarf';

export type BunnyToyType = 'ball' | 'pinwheel' | 'blocks' | 'car' | 'bubbles';

export interface BunnyCharacterConfig {
  id: BunnyId;
  name: string;
  callWord: string;
  personaPrompt: string;
  greeting: string;
  furHex: string;
  outfitHex: string;
  accentHex: string;
  accessory: BunnyAccessoryType;
  favoriteToy: BunnyToyType;
  voiceSpeaker: BunnyVoiceSpeaker;
  enabled: boolean;
}

export interface AssistantInquiryResult {
  category: 'directions' | 'weather' | 'schedule' | 'general' | 'photo_memories';
  headline: string;
  spokenSummary: string;
  detailMarkdown?: string;
  originName?: string;
  destinationName?: string;
  distanceKm?: number;
  drivingMinutes?: number;
  drivingRouteSummary?: string;
  drivingTip?: string;
  transitMinutes?: number;
  transitRouteSummary?: string;
  transitTransfers?: number;
  walkingMinutes?: number;
  walkingRouteSummary?: string;
  destinationHighlights?: string[];
  matchedPhotos?: PhotoItem[];
  bunnySpeaker?: BunnyVoiceSpeaker;
  bunnySpeakerName?: string;
}

export interface EnglishCoachPrompt {
  englishPhrase: string;
  koreanPhonetic: string;
  nudgeText: string;
}

export interface BunnyFlashcard {
  id: string;
  koreanWord: string;
  englishWord: string;
  phonetic: string;
  emoji: string;
  hintText: string;
  exampleEn: string;
  choices: string[];
  revealed?: boolean;
  selectedChoice?: string;
}

export type BunnyBehaviorStatus =
  | 'IN_HOUSE'
  | 'CHATTING'
  | 'PLAYING_BALL'
  | 'SPINNING_PINWHEEL'
  | 'STACKING_BLOCKS'
  | 'PULLING_CAR'
  | 'BLOWING_BUBBLES'
  | 'ADMIRING_PHOTO'
  | 'RESTING_ON_GRASS'
  | 'SHELTERING_UNDER_TREE'
  | 'BUILDING_SNOWMAN'
  | 'SNOWBALL_FIGHT'
  | 'ROLLING_SNOWBALL'
  | 'GOING_HOME';

export interface BunnyIndividualState {
  status: BunnyBehaviorStatus;
  bubbleText: string;
  isSpeaking: boolean;
  isThinking: boolean;
  photoIndex: number;
  englishCoach?: EnglishCoachPrompt | null;
  activeFlashcard?: BunnyFlashcard | null;
}

export interface BunnyChatMessage {
  id: string;
  role: 'user' | 'bunny';
  bunnyId?: BunnyId;
  text: string;
  englishCoach?: EnglishCoachPrompt | null;
  flashcard?: BunnyFlashcard | null;
}
