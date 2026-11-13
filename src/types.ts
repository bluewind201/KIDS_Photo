export type StorageProvider =
  | 'google_drive'
  | 'onedrive'
  | 'synology_webdav'
  | 'synology_api'
  | 'local_folder'
  | 'share_link';

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
  /** Optional custom HTTP headers required when loading via native CapacitorHttp (e.g. Synology `X-SYNO-SHARING`) */
  nativeHeaders?: Record<string, string>;
  /** Optional additional fallback URLs tried sequentially if `src` and `assetUrl` fail */
  fallbackUrls?: string[];
  date: string;
  location: string;
  tags: string[];
  aiSummary: string;
  /** True once Gemini Vision has analyzed the actual image pixels */
  aiAnalyzed?: boolean;
  /** True once compressed & stored in local IndexedDB vault (~135KB WebP + ~14KB AI thumb) so it never shows filename */
  vaultCached?: boolean;
  /** Exact byte size of optimized local display blob in IndexedDB */
  optimizedBytes?: number;
  /** Structured AI search metadata for instant <1ms memory lookup */
  season?: string;
  mood?: string;
  people?: string;
  objects?: string[];
  /** True when sampled from the 10% historical throwback pool for reminiscing */
  isNostalgiaPick?: boolean;
}

export interface DigitalAlbum {
  id: string;
  name: string;
  provider: StorageProvider;
  folderPath: string;
  /** Optional share-link password persisted locally so Synology/Cloud share sessions auto-recover after app updates */
  sharePassword?: string;
  enabled: boolean;
  createdAt: string;
  photos: PhotoItem[];
}

export interface PhotoAnalysisProgress {
  active: boolean;
  geminiConnected: boolean;
  phase?: 'optimizing' | 'analyzing';
  done: number;
  total: number;
  savedBytesTotal?: number;
  currentAlbumName?: string;
  currentPhotoTitle?: string;
  completedToast?: string;
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

export type CalendarSourceType = 'android_device' | 'ics_url' | 'kr_holidays';

export interface SelectableCalendarSource {
  id: string;
  name: string;
  accountName: string;
  sourceType: CalendarSourceType;
  colorHex: string;
  selected: boolean;
  nativeCalendarId?: string;
  icsUrl?: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  calendarId?: string;
  calendarName?: string;
  calendarColor?: string;
  isSynced?: boolean;
  sortTimestamp?: number;
}

export interface MartTickerItem {
  id: string;
  category: '휴무일' | '세일·행사';
  storeName: string;
  content: string;
}

export type BunnyId = string;

export type BunnyVoiceSpeaker = 'tosuni' | 'tosili' | 'toddungi' | 'tobyeori' | 'togureum';

export type AnimalSpecies =
  | 'bunny'
  | 'puppy'
  | 'bear'
  | 'kitty'
  | 'fox'
  | 'hamster'
  | 'penguin'
  | 'dino';

export type BunnyAccessoryType =
  | 'none'
  | 'ribbon'
  | 'bowtie'
  | 'clover'
  | 'backpack'
  | 'star'
  | 'scarf'
  | 'crown'
  | 'beret'
  | 'cape'
  | 'glasses'
  | 'heart_hug'
  | 'flower_hat';

export type BunnyToyType = 'ball' | 'pinwheel' | 'blocks' | 'car' | 'bubbles';

export type EnglishFrequencyMode = 'off' | 'rare' | 'normal' | 'often';

export type GeminiVoiceMode = 'gemini_live' | 'pro_model' | 'standard';

export interface BunnyCharacterConfig {
  id: BunnyId;
  name: string;
  /** Legacy field kept optional-compatible; voice calling now automatically matches `name` + Korean vocatives! */
  callWord: string;
  species?: AnimalSpecies;
  personaPrompt: string;
  greeting: string;
  furHex: string;
  earInnerHex?: string;
  outfitHex: string;
  accentHex: string;
  showOutfit?: boolean;
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
