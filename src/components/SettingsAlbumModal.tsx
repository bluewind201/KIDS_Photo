import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Cloud,
  CloudRain,
  CloudSnow,
  Database,
  Edit3,
  Folder,
  FolderPlus,
  GraduationCap,
  HardDrive,
  Home,
  Link2,
  Loader2,
  MapPin,
  Mic,
  Moon,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  RefreshCw,
  Server,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Volume2,
  Wind,
  X,
} from 'lucide-react';
import { PROVIDER_LABELS, SAMPLE_PHOTO_POOL } from '../data/initialAlbums';
import { TOY_LABELS, VOICE_SPEAKER_LABELS } from '../data/initialCharacters';
import {
  getVaultDisplayObjectUrl,
  getVaultStorageSummary,
  optimizeLocalFileToVault,
} from '../utils/photoCacheDb';
import { runAlbumVaultAndAiPipeline } from '../utils/photoSyncPipeline';
import { speakText } from '../utils/speech';
import {
  getSupertonicStatus,
  getSupertonicVoiceDescription,
  initializeSupertonicEngine,
  setSupertonicEnabled,
  subscribeSupertonicStatus,
  SupertonicEngineStatus,
} from '../utils/supertonicTts';
import {
  browseCloudDemoOrRemoteUnified,
  checkGeminiVisionAvailable,
  connectSynologyDsmUnified,
  fetchCloudProviderFolderPhotos,
  fetchImageViaNativeHttp,
  fetchSynologyFolderPhotos,
  geocodeCityUnified,
  getSavedGeminiApiKey,
  refreshMartEventsUnified,
  resolvePublicShareLinkUnified,
  saveGeminiApiKey,
} from '../utils/standaloneApi';
import {
  BunnyAccessoryType,
  BunnyBehaviorStatus,
  BunnyCharacterConfig,
  BunnyId,
  BunnyIndividualState,
  BunnyToyType,
  BunnyVoiceSpeaker,
  ChildGrowthStage,
  DigitalAlbum,
  FrameTransitionMode,
  LayoutSide,
  MartTickerItem,
  PhotoAnalysisProgress,
  PhotoItem,
  PowerScheduleConfig,
  RemoteFolderItem,
  SelectableCalendarSource,
  StorageProvider,
  WeatherEffectMode,
} from '../types';
import { SettingsTabKey } from './MenuRail';

interface SettingsAlbumModalProps {
  initialTab: SettingsTabKey;
  albums: DigitalAlbum[];
  characters: BunnyCharacterConfig[];
  bunnies: Record<BunnyId, BunnyIndividualState>;
  childAgeStage: ChildGrowthStage;
  growthStars: number;
  powerSchedule: PowerScheduleConfig;
  menuPosition: LayoutSide;
  weatherPosition: LayoutSide;
  weatherEffectMode: WeatherEffectMode;
  wakeWord: string;
  slideIntervalSec: number;
  transitionMode: FrameTransitionMode;
  ttsEnabled: boolean;
  currentCity: string;
  martItems: MartTickerItem[];
  photoAnalysisProgress?: PhotoAnalysisProgress | null;
  calendarSources?: SelectableCalendarSource[];
  syncedSchedulesCount?: number;
  isCalendarSyncing?: boolean;
  onDiscoverDeviceCalendars?: () => Promise<{ granted: boolean; discoveredCount: number }>;
  onToggleCalendarSource?: (sourceId: string) => void;
  onAddIcsCalendarSource?: (
    name: string,
    rawUrlOrId: string,
    colorHex: string
  ) => Promise<{ count: number }>;
  onRemoveCalendarSource?: (sourceId: string) => void;
  onRefreshCalendarsNow?: () => Promise<void>;
  onReanalyzePhotos?: () => void;
  onRefreshAlbumUrls?: (albumId: string) => Promise<boolean>;
  onClose: () => void;
  onAddAlbum: (album: DigitalAlbum) => void;
  onToggleAlbum: (albumId: string) => void;
  onDeleteAlbum: (albumId: string) => void;
  onUpdateCharacters: (chars: BunnyCharacterConfig[]) => void;
  onChangeChildAgeStage: (stage: ChildGrowthStage) => void;
  onChangePowerSchedule: (cfg: PowerScheduleConfig) => void;
  onEnterSleepNow: () => void;
  onSendCharacterOutNow: (id: BunnyId) => void;
  onSendCharacterHomeNow: (id: BunnyId) => void;
  onChangeMenuPosition: (side: LayoutSide) => void;
  onChangeWeatherPosition: (side: LayoutSide) => void;
  onChangeWeatherEffectMode: (mode: WeatherEffectMode) => void;
  onChangeWakeWord: (word: string) => void;
  onChangeSlideInterval: (sec: number) => void;
  onChangeTransitionMode: (mode: FrameTransitionMode) => void;
  onChangeTtsEnabled: (enabled: boolean) => void;
  onUpdateLocation: (city: string, lat: number, lng: number) => void;
  onUpdateMartItems: (items: MartTickerItem[]) => void;
}

const ACCESSORY_LABELS: Record<BunnyAccessoryType, string> = {
  ribbon: '귀여운 리본 핀',
  clover: '행운 네잎클로버',
  backpack: '미니 가방 & 당근',
  star: '반짝 별 머리핀',
  scarf: '포근한 목도리',
};

const COLOR_THEMES: Array<{ label: string; outfitHex: string; accentHex: string }> = [
  { label: '코랄 핑크', outfitHex: '#FFE4E8', accentHex: '#FB7185' },
  { label: '민트 클로버', outfitHex: '#D1FAE5', accentHex: '#10B981' },
  { label: '버터 옐로우', outfitHex: '#FEF3C7', accentHex: '#F59E0B' },
  { label: '라벤더 스타', outfitHex: '#EDE9FE', accentHex: '#8B5CF6' },
  { label: '스카이 블루', outfitHex: '#E0F2FE', accentHex: '#0EA5E9' },
];

export const SettingsAlbumModal: React.FC<SettingsAlbumModalProps> = ({
  initialTab,
  albums,
  characters,
  bunnies,
  childAgeStage,
  growthStars,
  powerSchedule,
  menuPosition,
  weatherPosition,
  weatherEffectMode,
  wakeWord,
  slideIntervalSec,
  transitionMode,
  ttsEnabled,
  currentCity,
  martItems,
  photoAnalysisProgress,
  calendarSources = [],
  syncedSchedulesCount = 0,
  isCalendarSyncing = false,
  onDiscoverDeviceCalendars,
  onToggleCalendarSource,
  onAddIcsCalendarSource,
  onRemoveCalendarSource,
  onRefreshCalendarsNow,
  onReanalyzePhotos,
  onRefreshAlbumUrls,
  onClose,
  onAddAlbum,
  onToggleAlbum,
  onDeleteAlbum,
  onUpdateCharacters,
  onChangeChildAgeStage,
  onChangePowerSchedule,
  onEnterSleepNow,
  onSendCharacterOutNow,
  onSendCharacterHomeNow,
  onChangeMenuPosition,
  onChangeWeatherPosition,
  onChangeWeatherEffectMode,
  onChangeWakeWord,
  onChangeSlideInterval,
  onChangeTransitionMode,
  onChangeTtsEnabled,
  onUpdateLocation,
  onUpdateMartItems,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Cloud & NAS Connector State
  const [selectedProvider, setSelectedProvider] = useState<StorageProvider>('share_link');
  const [shareLinkUrl, setShareLinkUrl] = useState('');
  const [shareLinkAlbumTitle, setShareLinkAlbumTitle] = useState('');
  const [shareLinkPassword, setShareLinkPassword] = useState('');
  const [isDemoBrowseSession, setIsDemoBrowseSession] = useState(false);
  const [backendServerUrl, setBackendServerUrl] = useState(() => {
    return localStorage.getItem('kids_photo_backend_url') || '';
  });
  const [showAdvancedApi, setShowAdvancedApi] = useState(false);

  const [gdriveToken, setGdriveToken] = useState('');
  const [onedriveToken, setOnedriveToken] = useState('');
  const [webdavUrl, setWebdavUrl] = useState('https://my-home-nas.synology.me:5006');
  const [webdavUser, setWebdavUser] = useState('');
  const [webdavPass, setWebdavPass] = useState('');
  const [webdavPath, setWebdavPath] = useState('/photo');
  const [synoUrl, setSynoUrl] = useState('https://my-home-nas.synology.me:5001');
  const [synoUser, setSynoUser] = useState('');
  const [synoPass, setSynoPass] = useState('');
  const [synoOtp, setSynoOtp] = useState('');
  const [synoSession, setSynoSession] = useState<{ sid: string; cleanBase: string } | null>(null);

  const [remoteFolders, setRemoteFolders] = useState<RemoteFolderItem[]>([]);
  const [checkedFolderIds, setCheckedFolderIds] = useState<string[]>([]);
  const [customAlbumName, setCustomAlbumName] = useState('');
  const [connectorStatus, setConnectorStatus] = useState<{
    type: 'info' | 'error' | 'success';
    msg: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAnalyzingLocal, setIsAnalyzingLocal] = useState(false);
  const [syncPipelineProgress, setSyncPipelineProgress] = useState<{
    phase: 'fetching' | 'optimizing' | 'analyzing';
    done: number;
    total: number;
    savedBytesTotal: number;
    currentPhotoTitle?: string;
  } | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  // Digital Albums Tab & Vault Summary State
  const [confirmDeleteAlbumId, setConfirmDeleteAlbumId] = useState<string | null>(null);
  const [albumThumbBlobs, setAlbumThumbBlobs] = useState<Record<string, string>>({});
  const [refreshingAlbumId, setRefreshingAlbumId] = useState<string | null>(null);
  const [vaultSummary, setVaultSummary] = useState<{
    count: number;
    totalBytes: number;
  }>({ count: 0, totalBytes: 0 });

  // Calendar Selection & ICS Registration State
  const [icsName, setIcsName] = useState('');
  const [icsUrlOrId, setIcsUrlOrId] = useState('');
  const [icsColor, setIcsColor] = useState('#4F46E5');
  const [isAddingIcs, setIsAddingIcs] = useState(false);
  const [isDiscoveringDeviceCal, setIsDiscoveringDeviceCal] = useState(false);
  const [calendarStatusMsg, setCalendarStatusMsg] = useState<{
    type: 'info' | 'success' | 'error';
    msg: string;
  } | null>(null);

  // GitHub Open-Source Supertone Supertonic-2 Human Voice Engine State
  const [supertonicState, setSupertonicState] = useState<SupertonicEngineStatus>(() =>
    getSupertonicStatus()
  );
  useEffect(() => {
    return subscribeSupertonicStatus(setSupertonicState);
  }, []);

  useEffect(() => {
    if (activeTab !== 'albums' && activeTab !== 'cloud') return;
    getVaultStorageSummary()
      .then((s) => setVaultSummary(s))
      .catch(() => {});
  }, [activeTab, albums, photoAnalysisProgress?.active]);

  useEffect(() => {
    if (activeTab !== 'albums') return;
    albums.forEach((album) => {
      const p = album.photos[0];
      if (!p || albumThumbBlobs[album.id]) return;

      // 1) Instant <2ms lookup from IndexedDB Compact Photo Vault!
      getVaultDisplayObjectUrl(p.id)
        .then((vaultUrl) => {
          if (vaultUrl) {
            setAlbumThumbBlobs((prev) => ({ ...prev, [album.id]: vaultUrl }));
            return;
          }
          if (
            p.src.startsWith('data:') ||
            p.src.startsWith('blob:') ||
            p.src.startsWith('idb:') ||
            p.src.startsWith('/')
          ) {
            return;
          }
          const urls = [p.src, ...(p.assetUrl ? [p.assetUrl] : []), ...(p.fallbackUrls ?? [])];
          let headers = p.nativeHeaders;
          if (!headers && /passphrase=([^&]+)/i.test(p.src)) {
            const m = p.src.match(/passphrase=([^&]+)/i);
            if (m?.[1]) headers = { 'X-SYNO-SHARING': decodeURIComponent(m[1]) };
          }
          return fetchImageViaNativeHttp(urls, headers, album.sharePassword).then((blob) => {
            if (blob) setAlbumThumbBlobs((prev) => ({ ...prev, [album.id]: blob }));
          });
        })
        .catch(() => {});
    });
  }, [activeTab, albums, albumThumbBlobs]);

  // 3D Character Roster State
  const [editingCharId, setEditingCharId] = useState<BunnyId | null>(null);
  const [showNewCharForm, setShowNewCharForm] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharCallWord, setNewCharCallWord] = useState('');
  const [newCharGreeting, setNewCharGreeting] = useState('');
  const [newCharToy, setNewCharToy] = useState<BunnyToyType>('ball');
  const [newCharAccessory, setNewCharAccessory] = useState<BunnyAccessoryType>('ribbon');
  const [newCharThemeIdx, setNewCharThemeIdx] = useState(0);

  // Voice & Gemini API Key State
  const [wakeWordDraft, setWakeWordDraft] = useState(wakeWord);
  useEffect(() => {
    setWakeWordDraft(wakeWord);
  }, [wakeWord]);
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(() => getSavedGeminiApiKey());
  const [geminiKeySavedToast, setGeminiKeySavedToast] = useState(false);

  // Location & Mart Ticker State
  const [cityQuery, setCityQuery] = useState(currentCity);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [newMartStore, setNewMartStore] = useState('');
  const [newMartCategory, setNewMartCategory] = useState<'휴무일' | '세일·행사'>('휴무일');
  const [newMartContent, setNewMartContent] = useState('');
  const [isRefreshingMartAi, setIsRefreshingMartAi] = useState(false);

  const handleSaveBackendUrl = (url: string) => {
    const cleaned = url.trim().replace(/\/+$/, '');
    setBackendServerUrl(cleaned);
    if (cleaned) {
      localStorage.setItem('kids_photo_backend_url', cleaned);
    } else {
      localStorage.removeItem('kids_photo_backend_url');
    }
  };

  /**
   * Sync-First Optimization & Fast Batch AI Data Indexing Pipeline:
   * Immediately compresses high-res 10~40MB photos down to ~135KB WebP in IndexedDB Vault
   * and runs 5-photo batch Gemini Vision structured indexing so photos never show filenames
   * and can be searched instantly (<1ms).
   */
  const runSyncFirstOptimizationAndAi = async (draftAlbum: DigitalAlbum): Promise<{
    finalAlbum: DigitalAlbum;
    cachedCount: number;
    aiIndexedCount: number;
    savedMbText: string;
    geminiUsed: boolean;
  }> => {
    const IMMEDIATE_SYNC_CAP = 30;
    const immediateSlice = draftAlbum.photos.slice(0, IMMEDIATE_SYNC_CAP);
    const remainingSlice = draftAlbum.photos.slice(IMMEDIATE_SYNC_CAP);

    const geminiAvail =
      Boolean(getSavedGeminiApiKey()) ||
      Boolean(photoAnalysisProgress?.geminiConnected) ||
      (await checkGeminiVisionAvailable().catch(() => false));

    const result = await runAlbumVaultAndAiPipeline({
      photos: immediateSlice,
      sharePassword: draftAlbum.sharePassword,
      onProgress: (info) => {
        setSyncPipelineProgress({
          phase: info.phase,
          done: info.done,
          total: info.total,
          savedBytesTotal: info.savedBytesTotal,
          currentPhotoTitle: info.currentPhotoTitle,
        });
      },
    });

    const finalAlbum: DigitalAlbum = {
      ...draftAlbum,
      photos: [...result.photos, ...remainingSlice],
    };

    const estimatedSavedBytes = Math.max(
      120_000,
      result.vaultCachedCount * 2_400_000 - result.totalOptimizedBytes
    );
    const savedMb = Math.max(0.1, estimatedSavedBytes / (1024 * 1024));
    return {
      finalAlbum,
      cachedCount: result.vaultCachedCount,
      aiIndexedCount: result.geminiAnalyzedCount,
      savedMbText: `${savedMb.toFixed(1)}MB`,
      geminiUsed: geminiAvail || result.geminiAnalyzedCount > 0,
    };
  };

  // 🌟 Google / OneDrive / Synology Photos 공유 링크(URL) 실제 사진 연동 + 즉시 경량 최적 저장 & AI 데이터화!
  const handleRegisterShareLink = async (inputUrl?: string, customTitle?: string) => {
    const targetUrl = (inputUrl || shareLinkUrl).trim();
    if (!targetUrl) {
      setConnectorStatus({ type: 'error', msg: '공유 링크 URL을 입력해 주세요.' });
      return;
    }

    setIsConnecting(true);
    setSyncPipelineProgress({
      phase: 'fetching',
      done: 0,
      total: 1,
      savedBytesTotal: 0,
    });
    setConnectorStatus({
      type: 'info',
      msg: '공유 링크에 접속하여 실제 사진 목록을 불러온 뒤, 최소 용량 최적 저장 및 AI 사전 데이터화를 진행합니다...',
    });

    try {
      const tempId = `album-share-${Date.now()}`;
      const resolved = await resolvePublicShareLinkUnified({
        url: targetUrl,
        customTitle: customTitle?.trim() || shareLinkAlbumTitle.trim() || undefined,
        password: shareLinkPassword.trim() || undefined,
        albumId: tempId,
      });

      const finalAlbumId = `album-${resolved.provider}-${Date.now()}`;
      const realPhotos: PhotoItem[] = resolved.photos.map((p, idx) => ({
        ...p,
        id: `${finalAlbumId}-p-${idx}`,
        albumId: finalAlbumId,
        albumName: resolved.albumTitle,
      }));

      const savedSharePass = shareLinkPassword.trim() || undefined;
      const draftAlbum: DigitalAlbum = {
        id: finalAlbumId,
        name: resolved.albumTitle,
        provider: resolved.provider,
        folderPath: resolved.resolvedUrl,
        sharePassword: savedSharePass,
        enabled: true,
        createdAt: new Date().toISOString().slice(0, 10),
        photos: realPhotos,
      };

      const { finalAlbum, cachedCount, savedMbText, geminiUsed } =
        await runSyncFirstOptimizationAndAi(draftAlbum);

      onAddAlbum(finalAlbum);

      const extraNote =
        realPhotos.length > 30
          ? ` (나머지 ${realPhotos.length - 30}장도 백그라운드에서 계속 최적 저장·데이터화됩니다)`
          : '';

      setConnectorStatus({
        type: 'success',
        msg: geminiUsed
          ? `🎉 "${resolved.albumTitle}" (${realPhotos.length}장) 연동 완료! 고화질 사진을 최소 용량 WebP(${cachedCount}장, 약 ${savedMbText} 절감)로 최적 저장하고 Gemini AI 고속 일괄 분석·검색 데이터화까지 마쳤습니다!${extraNote}`
          : `🎉 "${resolved.albumTitle}" (${realPhotos.length}장) 연동 완료! 고화질 사진을 최소 용량 WebP(${cachedCount}장, 약 ${savedMbText} 절감)로 내장 금고에 최적 저장하여 파일명 표시 문제 없이 즉시 재생됩니다!${extraNote}`,
      });
      setShareLinkUrl('');
      setShareLinkAlbumTitle('');
      setShareLinkPassword('');
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : '공유 링크에서 사진을 불러오지 못했습니다. 공개 링크 설정을 확인해 주세요.';
      setConnectorStatus({
        type: 'error',
        msg: errMsg,
      });
    } finally {
      setSyncPipelineProgress(null);
      setIsConnecting(false);
    }
  };

  // 🌟 샘플 NAS / 클라우드 앨범 원클릭 즉시 추가 (사용자가 명시적으로 샘플 버튼을 누른 경우에만 사용)
  const handleQuickAddSampleAlbum = (providerType: StorageProvider, albumNameText: string) => {
    const albumId = `album-sample-${providerType}-${Date.now()}`;
    const generatedPhotos: PhotoItem[] = SAMPLE_PHOTO_POOL.map((tpl, i) => ({
      id: `${albumId}-p-${i}`,
      albumId,
      albumName: albumNameText,
      provider: providerType,
      src: tpl.src,
      assetUrl: tpl.assetUrl,
      title: `${albumNameText} - ${tpl.title}`,
      date: tpl.date,
      location: tpl.location,
      tags: [...tpl.tags, '샘플연동'],
      aiSummary: tpl.aiSummary,
    }));

    onAddAlbum({
      id: albumId,
      name: `[샘플] ${albumNameText}`,
      provider: providerType,
      folderPath: `/sample/${albumNameText}`,
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10),
      photos: generatedPhotos,
    });

    setConnectorStatus({
      type: 'success',
      msg: `💡 테스트용 샘플 "${albumNameText}" 앨범(${generatedPhotos.length}장)이 추가되었습니다.`,
    });
  };

  const browseProviderFolders = async (demoMode: boolean) => {
    setIsConnecting(true);
    setIsDemoBrowseSession(demoMode);
    setConnectorStatus(null);
    setRemoteFolders([]);
    setCheckedFolderIds([]);

    try {
      let list: RemoteFolderItem[] = [];

      if (selectedProvider === 'synology_api') {
        const synoRes = await connectSynologyDsmUnified({
          dsmUrl: synoUrl.trim(),
          account: synoUser.trim(),
          passwd: synoPass,
          otpCode: synoOtp.trim(),
          demoMode,
        });
        list = synoRes.folders;
        if (synoRes.sid && synoRes.cleanBase) {
          setSynoSession({ sid: synoRes.sid, cleanBase: synoRes.cleanBase });
        } else {
          setSynoSession(null);
        }
      } else {
        setSynoSession(null);
        list = await browseCloudDemoOrRemoteUnified({
          provider: selectedProvider,
          demoMode,
          gdriveToken: gdriveToken.trim(),
          onedriveToken: onedriveToken.trim(),
          webdavUrl: webdavUrl.trim(),
          webdavUser: webdavUser.trim(),
          webdavPass: webdavPass,
          webdavPath: webdavPath.trim() || '/photo',
        });
      }

      setRemoteFolders(list);
      if (list.length > 0) {
        setCheckedFolderIds([list[0].id]);
        setCustomAlbumName(list[0].name.split('/').pop()?.trim() || list[0].name);
      }
      setConnectorStatus({
        type: 'success',
        msg: `${PROVIDER_LABELS[selectedProvider]}에서 ${list.length}개의 사진 폴더를 찾았습니다. 원하는 폴더를 선택해 앨범으로 등록하세요.`,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '';
      const isSyno = selectedProvider === 'synology_api' || selectedProvider === 'synology_webdav';
      setConnectorStatus({
        type: 'error',
        msg:
          errMsg ||
          (isSyno
            ? '시놀로지 NAS 서버에 직접 통신하지 못했습니다. 주소·포트·계정을 확인하시거나, 위쪽의 [시놀로지 포토 공유 링크]를 이용해 보세요!'
            : '클라우드 폴더를 불러오지 못했습니다. API 키가 필요 없는 [공유 링크 간편 등록]을 이용해 보세요.'),
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const toggleFolderSelection = (folder: RemoteFolderItem) => {
    setCheckedFolderIds((prev) => {
      const next = prev.includes(folder.id) ? prev.filter((id) => id !== folder.id) : [...prev, folder.id];
      if (next.length === 1) {
        const picked = remoteFolders.find((f) => f.id === next[0]);
        if (picked) setCustomAlbumName(picked.name.split('/').pop()?.trim() || picked.name);
      } else if (next.length > 1) {
        setCustomAlbumName(`${PROVIDER_LABELS[selectedProvider]} 통합 앨범 (${next.length}개 폴더)`);
      }
      return next;
    });
  };

  const handleRegisterSelectedFolders = async () => {
    const selected = remoteFolders.filter((f) => checkedFolderIds.includes(f.id));
    if (selected.length === 0) return;

    setIsConnecting(true);
    const albumId = isDemoBrowseSession
      ? `album-sample-${selectedProvider}-${Date.now()}`
      : `album-${selectedProvider}-${Date.now()}`;
    const albumTitle = customAlbumName.trim() || selected[0].name;
    const combinedPath = selected.map((s) => s.path).join(', ');

    try {
      let generatedPhotos: PhotoItem[] = [];

      // 1) 실제 모드: 시놀로지 DSM / Google Drive OAuth / OneDrive Graph / WebDAV에서 진짜 사진만 조회!
      if (!isDemoBrowseSession) {
        setSyncPipelineProgress({
          phase: 'fetching',
          done: 0,
          total: selected.length,
          savedBytesTotal: 0,
        });

        if (selectedProvider === 'synology_api' && synoSession) {
          for (const folder of selected) {
            const fetched = await fetchSynologyFolderPhotos({
              cleanBase: synoSession.cleanBase,
              sid: synoSession.sid,
              folderPath: folder.path,
              albumId,
              albumName: albumTitle,
              provider: selectedProvider,
            });
            generatedPhotos.push(...fetched);
          }
        } else {
          for (const folder of selected) {
            const fetched = await fetchCloudProviderFolderPhotos({
              provider: selectedProvider,
              folderId: folder.id,
              folderPath: folder.path,
              albumId,
              albumName: albumTitle,
              gdriveToken: gdriveToken.trim(),
              onedriveToken: onedriveToken.trim(),
              webdavUrl: webdavUrl.trim(),
              webdavUser: webdavUser.trim(),
              webdavPass: webdavPass,
            });
            generatedPhotos.push(...fetched);
          }
        }

        if (generatedPhotos.length === 0) {
          setConnectorStatus({
            type: 'error',
            msg: '선택하신 폴더 안에 이미지 파일(JPG, PNG, WEBP, HEIC)이 없거나 접근 권한이 없습니다. 사진이 직접 들어 있는 하위 폴더를 선택해 주세요.',
          });
          return;
        }

        const draftAlbum: DigitalAlbum = {
          id: albumId,
          name: albumTitle,
          provider: selectedProvider,
          folderPath: combinedPath,
          enabled: true,
          createdAt: new Date().toISOString().slice(0, 10),
          photos: generatedPhotos,
        };

        const { finalAlbum, cachedCount, savedMbText, geminiUsed } =
          await runSyncFirstOptimizationAndAi(draftAlbum);

        onAddAlbum(finalAlbum);

        setConnectorStatus({
          type: 'success',
          msg: geminiUsed
            ? `🎉 "${albumTitle}" 디지털 앨범(${generatedPhotos.length}장) 연동 완료! 최소 용량 WebP(${cachedCount}장, 약 ${savedMbText} 절감) 최적 저장 및 Gemini AI 고속 데이터화를 마쳤습니다!`
            : `🎉 "${albumTitle}" 디지털 앨범(${generatedPhotos.length}장) 연동 완료! 최소 용량 WebP(${cachedCount}장, 약 ${savedMbText} 절감)로 내장 금고에 최적 저장되어 고화질 원본도 깨짐·파일명 표시 없이 즉시 재생됩니다!`,
        });
        setCheckedFolderIds([]);
        return;
      }

      // 2) 사용자가 명시적으로 [샘플 폴더 불러오기]를 누른 경우에만 샘플 사진 사용
      const matchedTemplates = SAMPLE_PHOTO_POOL.filter((item) =>
        selected.some(
          (f) =>
            item.tags.some((t) => f.name.includes(t)) ||
            (f.name.includes('제주') && item.location.includes('제주')) ||
            (f.name.includes('단풍') && item.location.includes('가평')) ||
            (f.name.includes('벚꽃') && item.location.includes('서울숲')) ||
            (f.name.includes('놀이') && item.location.includes('에버랜드')) ||
            (f.name.includes('눈') && item.location.includes('평창'))
        )
      );
      const chosenTemplates = matchedTemplates.length > 0 ? matchedTemplates : SAMPLE_PHOTO_POOL;

      generatedPhotos = chosenTemplates.map((tpl, i) => ({
        id: `${albumId}-p-${i}`,
        albumId,
        albumName: `[샘플] ${albumTitle}`,
        provider: selectedProvider,
        src: tpl.src,
        assetUrl: tpl.assetUrl,
        title: tpl.title,
        date: tpl.date,
        location: tpl.location,
        tags: tpl.tags,
        aiSummary: tpl.aiSummary,
      }));

      onAddAlbum({
        id: albumId,
        name: `[샘플] ${albumTitle}`,
        provider: selectedProvider,
        folderPath: combinedPath,
        enabled: true,
        createdAt: new Date().toISOString().slice(0, 10),
        photos: generatedPhotos,
      });

      setConnectorStatus({
        type: 'success',
        msg: `🎉 "[샘플] ${albumTitle}" 디지털 앨범(${generatedPhotos.length}장)이 추가되어 메인 디지털 액자에 즉시 반영되었습니다!`,
      });
      setCheckedFolderIds([]);
    } finally {
      setSyncPipelineProgress(null);
      setIsConnecting(false);
    }
  };

  const handleLocalFilesUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const imageFiles = Array.from(fileList)
      .filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name))
      .slice(0, 80);

    if (imageFiles.length === 0) {
      setConnectorStatus({ type: 'error', msg: '선택한 항목에 이미지 파일(JPG, PNG, WEBP, HEIC)이 없습니다.' });
      return;
    }

    setIsAnalyzingLocal(true);
    setConnectorStatus({
      type: 'info',
      msg: `${imageFiles.length}장의 고화질 사진을 최소 용량 WebP(~135KB)로 최적 저장하고 AI 검색 데이터를 생성하고 있습니다...`,
    });

    try {
      const albumId = `album-local-${Date.now()}`;
      const firstRelPath =
        (imageFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      const folderTitle =
        customAlbumName.trim() ||
        (firstRelPath.includes('/')
          ? firstRelPath.split('/')[0]
          : `내 폰 갤러리 앨범 (${new Date().toLocaleDateString('ko-KR')})`);

      const newPhotos: PhotoItem[] = [];
      let totalSavedBytes = 0;

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const photoId = `${albumId}-local-${i}`;
        const title = file.name.replace(/\.[^.]+$/, '');

        setSyncPipelineProgress({
          phase: 'optimizing',
          done: i,
          total: imageFiles.length,
          savedBytesTotal: totalSavedBytes,
          currentPhotoTitle: title,
        });

        const vaultRec = await optimizeLocalFileToVault(file, photoId, albumId);
        totalSavedBytes += Math.max(
          0,
          (file.size || 2_500_000) - (vaultRec?.byteSize || 140_000)
        );

        const fileDate = new Date(file.lastModified || Date.now()).toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        newPhotos.push({
          id: photoId,
          albumId,
          albumName: folderTitle,
          provider: 'local_folder',
          src: `idb://photo/${photoId}`,
          title,
          date: fileDate,
          location: '가족 추억 장소',
          tags: ['가족사진', '추억', folderTitle, ...(vaultRec?.visualHintTags ?? [])],
          aiSummary: `${fileDate}에 촬영된 소중한 가족 사진입니다.`,
          aiAnalyzed: false,
          vaultCached: Boolean(vaultRec),
          optimizedBytes: vaultRec?.byteSize,
        });
      }

      const draftAlbum: DigitalAlbum = {
        id: albumId,
        name: folderTitle,
        provider: 'local_folder',
        folderPath: firstRelPath ? `/${firstRelPath.split('/')[0]}` : '/내 기기 최적 저장소',
        enabled: true,
        createdAt: new Date().toISOString().slice(0, 10),
        photos: newPhotos,
      };

      const { finalAlbum, geminiUsed } = await runSyncFirstOptimizationAndAi(draftAlbum);
      onAddAlbum(finalAlbum);

      const savedMb = (totalSavedBytes / (1024 * 1024)).toFixed(1);
      setConnectorStatus({
        type: 'success',
        msg: geminiUsed
          ? `🎉 "${folderTitle}" (${newPhotos.length}장) 최적 저장(원본 대비 약 ${savedMb}MB 용량 절감) 및 Gemini AI 고속 일괄 분석·데이터화가 완료되었습니다!`
          : `🎉 "${folderTitle}" (${newPhotos.length}장) 최적 저장(원본 대비 약 ${savedMb}MB 용량 절감)이 완료되었습니다!`,
      });
    } finally {
      setSyncPipelineProgress(null);
      setIsAnalyzingLocal(false);
    }
  };

  // Character Roster Handlers
  const handleToggleCharacterEnabled = (id: string) => {
    const enabledCount = characters.filter((c) => c.enabled).length;
    onUpdateCharacters(
      characters.map((c) => {
        if (c.id !== id) return c;
        // Keep at least 1 character enabled if user tries to turn off the very last one, or allow toggling freely
        if (c.enabled && enabledCount <= 0) return c;
        return { ...c, enabled: !c.enabled };
      })
    );
  };

  const handlePatchCharacter = (id: string, patch: Partial<BunnyCharacterConfig>) => {
    onUpdateCharacters(characters.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleDeleteCharacter = (id: string) => {
    if (characters.length <= 1) return;
    onUpdateCharacters(characters.filter((c) => c.id !== id));
  };

  const handleCreateNewCharacter = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newCharName.trim();
    if (!trimmedName) return;

    const theme = COLOR_THEMES[newCharThemeIdx] ?? COLOR_THEMES[0];
    const call = newCharCallWord.trim() || `${trimmedName}아`;
    const newChar: BunnyCharacterConfig = {
      id: `bunny-custom-${Date.now()}`,
      name: trimmedName,
      callWord: call,
      personaPrompt: `너는 디지털 액자 옆 작은 집에 사는 귀여운 아기 토끼 "${trimmedName}"야. 3~7세 어린이 눈높이로 다정하고 신나는 반말로 이야기해.`,
      greeting: newCharGreeting.trim() || `우와~ 안녕! ${trimmedName} 불렀어? 왜 불렀어~?`,
      furHex: '#FFFCFA',
      outfitHex: theme.outfitHex,
      accentHex: theme.accentHex,
      accessory: newCharAccessory,
      favoriteToy: newCharToy,
      voiceSpeaker:
        newCharAccessory === 'clover'
          ? 'tosili'
          : newCharAccessory === 'backpack'
          ? 'toddungi'
          : newCharAccessory === 'star'
          ? 'tobyeori'
          : newCharAccessory === 'scarf'
          ? 'togureum'
          : 'tosuni',
      enabled: true,
    };

    onUpdateCharacters([...characters, newChar]);
    setNewCharName('');
    setNewCharCallWord('');
    setShowNewCharForm(false);
  };

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityQuery.trim()) return;
    setIsSearchingCity(true);
    try {
      const data = await geocodeCityUnified(cityQuery.trim());
      if (data) {
        onUpdateLocation(data.displayName, data.lat, data.lng);
      }
    } finally {
      setIsSearchingCity(false);
    }
  };

  const handleGpsLocation = () => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onUpdateLocation('현재 GPS 위치', pos.coords.latitude, pos.coords.longitude);
      },
      () => {}
    );
  };

  const handleRefreshMartByAi = async () => {
    setIsRefreshingMartAi(true);
    try {
      const items = await refreshMartEventsUnified(currentCity);
      if (items.length > 0) {
        const mapped: MartTickerItem[] = items.map((line, idx) => ({
          id: `mart-ai-${Date.now()}-${idx}`,
          category: line.includes('휴무') ? '휴무일' : '세일·행사',
          storeName: 'AI 실시간 마트소식',
          content: line,
        }));
        onUpdateMartItems(mapped);
      }
    } finally {
      setIsRefreshingMartAi(false);
    }
  };

  const handleAddMartItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMartStore.trim() || !newMartContent.trim()) return;
    onUpdateMartItems([
      ...martItems,
      {
        id: `mart-${Date.now()}`,
        category: newMartCategory,
        storeName: newMartStore.trim(),
        content: newMartContent.trim(),
      },
    ]);
    setNewMartStore('');
    setNewMartContent('');
  };

  const formatStatusBadge = (st?: BunnyBehaviorStatus) => {
    if (!st || st === 'IN_HOUSE') return '집 안에서 쉬는 중';
    if (st === 'CHATTING') return '제미나이 대화 중';
    if (st === 'GOING_HOME') return '집으로 가는 중';
    if (st === 'RESTING_ON_GRASS') return '잔디밭에 앉아 휴식 중';
    if (st === 'SHELTERING_UNDER_TREE') return '나무 아래 비 피하는 중';
    if (st === 'BUILDING_SNOWMAN') return '눈사람 만드는 중';
    if (st === 'SNOWBALL_FIGHT') return '신나는 눈싸움 중';
    if (st === 'ROLLING_SNOWBALL') return '눈덩이 굴리는 중';
    return '화면 밖에서 노는 중';
  };

  const togglePowerDay = (dayIdx: number) => {
    const exists = powerSchedule.activeDays.includes(dayIdx);
    const nextDays = exists
      ? powerSchedule.activeDays.filter((d) => d !== dayIdx)
      : [...powerSchedule.activeDays, dayIdx].sort((a, b) => a - b);
    onChangePowerSchedule({ ...powerSchedule, activeDays: nextDays });
  };

  const inputCls =
    'rounded-xl bg-[#F5F6F8] border border-zinc-200 px-3.5 py-2 text-xs text-[#141519] placeholder:text-zinc-400 focus:outline-none focus:border-[#141519]';

  const enabledCharCount = characters.filter((c) => c.enabled).length;

  const userAlbums = albums.filter(
    (a) =>
      a.id !== 'album-gdrive-family-2026' &&
      a.id !== 'album-synology-camping-winter' &&
      !a.id.startsWith('album-sample-')
  );
  const totalUserPhotosCount = userAlbums.reduce((sum, a) => sum + a.photos.length, 0);
  const analyzedUserPhotosCount = userAlbums.reduce(
    (sum, a) => sum + a.photos.filter((p) => p.aiAnalyzed).length,
    0
  );
  const isGeminiConnectedNow =
    Boolean(photoAnalysisProgress?.geminiConnected) || getSavedGeminiApiKey().length > 8;

  const renderGeminiAnalysisCard = () => {
    if (photoAnalysisProgress?.active) {
      const pct = Math.max(
        6,
        Math.min(
          100,
          Math.round((photoAnalysisProgress.done / Math.max(1, photoAnalysisProgress.total)) * 100)
        )
      );
      const isOptimizing = photoAnalysisProgress.phase === 'optimizing';
      return (
        <div className="rounded-2xl bg-gradient-to-r from-indigo-950 via-[#191B24] to-indigo-950 border border-indigo-400/30 p-4 text-white space-y-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              {isOptimizing
                ? '고화질 사진 최소 용량(~135KB WebP) 최적 저장 중!'
                : 'Gemini AI 고속 일괄 사진 분석 · 검색 데이터화 진행 중!'}
            </span>
            <span className="font-mono text-xs text-indigo-200">
              {photoAnalysisProgress.done} / {photoAnalysisProgress.total}장 ({pct}%)
            </span>
          </div>
          <p className="text-[11px] text-zinc-300 truncate">
            {photoAnalysisProgress.currentPhotoTitle
              ? isOptimizing
                ? `최적 저장 중: "${photoAnalysisProgress.currentPhotoTitle}" — 원본 대비 ~95% 경량 압축으로 파일명 표시 방지`
                : `5장 일괄 AI 데이터화 중: "${photoAnalysisProgress.currentPhotoTitle}" — 장소·계절·인물·태그 구조화`
              : '수집한 사진을 최적화 및 데이터화하고 있어요...'}
          </p>
          <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-purple-400 to-amber-300 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    }

    const totalVaultMb = (vaultSummary.totalBytes / (1024 * 1024)).toFixed(1);

    if (isGeminiConnectedNow) {
      return (
        <div className="rounded-2xl bg-indigo-50/70 border border-indigo-200/80 p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>
                Gemini AI 고속 데이터화 연결됨 · 분석 완료 {analyzedUserPhotosCount} /{' '}
                {totalUserPhotosCount}장
              </span>
              {vaultSummary.count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  <Database className="w-3 h-3" />
                  최적 저장 {vaultSummary.count}장 ({totalVaultMb}MB)
                </span>
              )}
            </div>
            <p className="text-[11px] text-indigo-900/75">
              연동 시 고화질 원본을 ~135KB WebP로 경량 저장하고 5장 일괄 AI 분석으로 구조화하여 깨짐 없이 &lt;1ms로 즉시 검색합니다.
            </p>
          </div>
          {totalUserPhotosCount > 0 && onReanalyzePhotos && (
            <button
              type="button"
              onClick={onReanalyzePhotos}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-semibold text-white shrink-0 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              최적저장 · AI 데이터화 다시 실행
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-2xl bg-amber-50/80 border border-amber-200/80 p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5 flex-wrap">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>고화질 사진 경량 최적 저장 활성 · Gemini AI 데이터화 연결 가능</span>
            {vaultSummary.count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                <Database className="w-3 h-3" />
                최적 저장 {vaultSummary.count}장 ({totalVaultMb}MB)
              </span>
            )}
          </div>
          <p className="text-[11px] text-amber-900/80">
            무료 Gemini API 키를 연결하면 연동 버튼 클릭 시 사진을 5장씩 초고속 분석·데이터화하여 나중에 음성/대화로 즉시 찾아줍니다.
          </p>
        </div>
        {activeTab !== 'voice' && (
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className="rounded-full bg-[#141519] hover:bg-zinc-800 px-3.5 py-1.5 text-xs font-semibold text-white shrink-0"
          >
            Gemini 연결 설정
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-[28px] bg-white border border-black/10 shadow-[0_28px_70px_rgba(0,0,0,0.28)] flex flex-col overflow-hidden text-[#141519]">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[#141519]">스마트 디지털 액자 통합 설정</h2>
            <p className="text-xs text-zinc-500">
              아이 성장 맞춤 대화, 절전·예약 켜짐 스케줄, 3D 캐릭터·날씨 이펙트 및 클라우드 사진 폴더 연동
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="설정 닫기"
            className="h-9 w-9 rounded-full bg-[#F4F5F7] hover:bg-zinc-200 flex items-center justify-center text-zinc-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs (모바일·태블릿 어느 화면 크기에서도 모든 메뉴 탭이 한눈에 보이도록 flex-wrap 적용) */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-6 py-2.5 border-b border-zinc-100 bg-[#F9FAFB] shrink-0">
          {[
            { id: 'characters', label: `3D 캐릭터 · 성장단계 (${enabledCharCount}/${characters.length})` },
            { id: 'power', label: '절전 · 예약 켜짐' },
            { id: 'layout', label: '화면 배치 · 날씨 효과' },
            { id: 'cloud', label: '클라우드 · 시놀로지 연동' },
            { id: 'albums', label: `디지털 앨범 (${albums.length})` },
            { id: 'voice', label: 'AI 호출 명령어 · 음성' },
            { id: 'life', label: '📅 캘린더 · 위치 · 마트' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as SettingsTabKey)}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-[#141519] text-white shadow-sm'
                  : 'bg-white border border-zinc-200/80 text-zinc-700 hover:bg-zinc-200/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ===============================================================
              TAB: 3D CHARACTERS ROSTER MANAGEMENT
          =============================================================== */}
          {activeTab === 'characters' && (
            <div className="space-y-5">
              {/* Child Developmental Stage & Voice-First English Growth Card */}
              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#141519] flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-[#141519]" />
                      아이 연령 · 성장 단계 맞춤 대화 및 영어 가이드 설정
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      아이가 토끼와 말을 걸 때 성장 단계에 맞춰 어휘와 대형 단어카드 난이도를 조절하며, 음성으로 말할 때까지 1분간 기다린 뒤 자연스럽게 다음 대화를 이어갑니다.
                    </p>
                  </div>
                  <div className="text-xs font-semibold text-zinc-700 tabular-nums">
                    영어 말하기 성공 기록 · {growthStars}회
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      {
                        id: 'age_3_4',
                        title: '만 3~4세 · 첫 말문·단어',
                        desc: '의성어·의태어 대화 + 1~2단어 쉬운 그림카드 따라하기',
                      },
                      {
                        id: 'age_5',
                        title: '만 5세 · 짧은 표현 (권장)',
                        desc: '다정한 대화 + 2~4단어 생활영어 문장 따라하기',
                      },
                      {
                        id: 'age_6_7',
                        title: '만 6~7세 · 문장 대화 확장',
                        desc: '스토리텔링 대화 + 3~6단어 영어 질문·문장 말하기',
                      },
                    ] as const
                  ).map((st) => {
                    const active = childAgeStage === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => onChangeChildAgeStage(st.id)}
                        className={`rounded-2xl p-3.5 border text-left transition-colors ${
                          active
                            ? 'bg-[#141519] border-[#141519] text-white'
                            : 'bg-white border-zinc-200 text-[#141519] hover:bg-zinc-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold">{st.title}</span>
                          {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </div>
                        <p
                          className={`mt-1 text-[11px] leading-snug ${
                            active ? 'text-zinc-300' : 'text-zinc-500'
                          }`}
                        >
                          {st.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-4">
                <div>
                  <h3 className="text-sm font-bold text-[#141519] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#141519]" />
                    화면으로 내보낼 3D 동물친구 리스트 관리
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    원하는 캐릭터만 선택해 내보내거나, 각 캐릭터의 이름·호출어·선호 3D 장난감을 업데이트할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewCharForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#141519] hover:bg-zinc-800 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showNewCharForm ? '추가 창 닫기' : '새 캐릭터 추가'}
                </button>
              </div>

              {/* Add New 3D Bunny Character Form */}
              {showNewCharForm && (
                <form
                  onSubmit={handleCreateNewCharacter}
                  className="rounded-2xl bg-[#F7F8FA] border border-zinc-300 p-4 space-y-3"
                >
                  <h4 className="text-xs font-bold text-[#141519]">새로운 3D 토끼 친구 등록</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={newCharName}
                      onChange={(e) => setNewCharName(e.target.value)}
                      placeholder="캐릭터 이름 (예: 토몽이)"
                      className={`${inputCls} bg-white`}
                    />
                    <input
                      type="text"
                      value={newCharCallWord}
                      onChange={(e) => setNewCharCallWord(e.target.value)}
                      placeholder="호출 명령어 (예: 토몽아)"
                      className={`${inputCls} bg-white`}
                    />
                    <select
                      value={newCharToy}
                      onChange={(e) => setNewCharToy(e.target.value as BunnyToyType)}
                      className={`${inputCls} bg-white`}
                    >
                      {(Object.keys(TOY_LABELS) as BunnyToyType[]).map((tKey) => (
                        <option key={tKey} value={tKey}>
                          장난감: {TOY_LABELS[tKey]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <select
                      value={newCharAccessory}
                      onChange={(e) => setNewCharAccessory(e.target.value as BunnyAccessoryType)}
                      className={`${inputCls} bg-white`}
                    >
                      {(Object.keys(ACCESSORY_LABELS) as BunnyAccessoryType[]).map((aKey) => (
                        <option key={aKey} value={aKey}>
                          소품: {ACCESSORY_LABELS[aKey]}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newCharThemeIdx}
                      onChange={(e) => setNewCharThemeIdx(Number(e.target.value))}
                      className={`${inputCls} bg-white`}
                    >
                      {COLOR_THEMES.map((th, idx) => (
                        <option key={th.label} value={idx}>
                          색상 테마: {th.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newCharGreeting}
                      onChange={(e) => setNewCharGreeting(e.target.value)}
                      placeholder="첫 인사말"
                      className={`${inputCls} bg-white`}
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-full bg-[#141519] hover:bg-zinc-800 px-5 py-2 text-xs font-semibold text-white"
                    >
                      리스트에 캐릭터 추가하기
                    </button>
                  </div>
                </form>
              )}

              {/* Character Roster Cards */}
              <div className="space-y-3">
                {characters.map((char) => {
                  const runtimeState = bunnies[char.id];
                  const isEditing = editingCharId === char.id;
                  const isOutdoors = runtimeState && runtimeState.status !== 'IN_HOUSE';

                  return (
                    <div
                      key={char.id}
                      className={`rounded-2xl border p-4 transition-colors ${
                        char.enabled
                          ? 'bg-white border-zinc-200 shadow-[0_2px_10px_rgba(0,0,0,0.025)]'
                          : 'bg-[#F7F8FA] border-zinc-200/60 opacity-75'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-black/5"
                            style={{ backgroundColor: char.outfitHex }}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full"
                              style={{ backgroundColor: char.accentHex }}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[#141519] truncate">
                                {char.name}
                              </span>
                              <span className="text-xs font-semibold text-zinc-500">
                                · "{char.callWord}"
                              </span>
                              {char.enabled && (
                                <span className="text-[11px] font-medium text-emerald-600">
                                  · {formatStatusBadge(runtimeState?.status)}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-500 truncate">
                              {ACCESSORY_LABELS[char.accessory]} · {VOICE_SPEAKER_LABELS[char.voiceSpeaker] || '토순이 목소리'}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {/* Test Bunny Voice Preview Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (!ttsEnabled) onChangeTtsEnabled(true);
                              speakText(
                                char.greeting || `안녕! 나는 ${char.name}야! 반가워!`,
                                char.voiceSpeaker,
                                true
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-900"
                            title={`${char.name} 전용 음성 들어보기`}
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            목소리 듣기
                          </button>

                          {/* Toggle Enable / Disable Character */}
                          <button
                            type="button"
                            onClick={() => handleToggleCharacterEnabled(char.id)}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                              char.enabled
                                ? 'bg-[#141519] text-white'
                                : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                            }`}
                          >
                            {char.enabled ? '활성화됨' : '비활성'}
                          </button>

                          {/* Instant Send Out / Call Home Controls */}
                          {char.enabled && (
                            <>
                              <button
                                type="button"
                                onClick={() => onSendCharacterOutNow(char.id)}
                                className="inline-flex items-center gap-1 rounded-full bg-[#F4F5F7] hover:bg-zinc-200 px-3 py-1.5 text-xs font-semibold text-[#141519]"
                                title="지금 즉시 집 밖 화면으로 내보내기"
                              >
                                <Play className="w-3 h-3" />
                                밖으로 내보내기
                              </button>
                              {isOutdoors && (
                                <button
                                  type="button"
                                  onClick={() => onSendCharacterHomeNow(char.id)}
                                  className="inline-flex items-center gap-1 rounded-full bg-[#F4F5F7] hover:bg-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600"
                                  title="작은 집 안으로 들여보내기"
                                >
                                  <Home className="w-3 h-3" />
                                  집으로
                                </button>
                              )}
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setEditingCharId(isEditing ? null : char.id)}
                            className="h-8 w-8 rounded-full bg-[#F4F5F7] hover:bg-zinc-200 flex items-center justify-center text-zinc-700"
                            title="캐릭터 정보·장난감 수정"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {!['tosuni', 'tosili', 'toddungi'].includes(char.id) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCharacter(char.id)}
                              className="h-8 w-8 rounded-full bg-[#F4F5F7] hover:bg-rose-100 flex items-center justify-center text-zinc-400 hover:text-rose-600"
                              title="캐릭터 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline Edit Drawer for Character */}
                      {isEditing && (
                        <div className="mt-3.5 pt-3.5 border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                              캐릭터 이름
                            </label>
                            <input
                              type="text"
                              value={char.name}
                              onChange={(e) => handlePatchCharacter(char.id, { name: e.target.value })}
                              className={`w-full ${inputCls}`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                              음성 호출어
                            </label>
                            <input
                              type="text"
                              value={char.callWord}
                              onChange={(e) =>
                                handlePatchCharacter(char.id, { callWord: e.target.value })
                              }
                              className={`w-full ${inputCls}`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                              선호 야외 3D 장난감
                            </label>
                            <select
                              value={char.favoriteToy}
                              onChange={(e) =>
                                handlePatchCharacter(char.id, {
                                  favoriteToy: e.target.value as BunnyToyType,
                                })
                              }
                              className={`w-full ${inputCls}`}
                            >
                              {(Object.keys(TOY_LABELS) as BunnyToyType[]).map((tKey) => (
                                <option key={tKey} value={tKey}>
                                  {TOY_LABELS[tKey]}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                              3D 액세서리 소품
                            </label>
                            <select
                              value={char.accessory}
                              onChange={(e) =>
                                handlePatchCharacter(char.id, {
                                  accessory: e.target.value as BunnyAccessoryType,
                                })
                              }
                              className={`w-full ${inputCls}`}
                            >
                              {(Object.keys(ACCESSORY_LABELS) as BunnyAccessoryType[]).map((aKey) => (
                                <option key={aKey} value={aKey}>
                                  {ACCESSORY_LABELS[aKey]}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                              토끼 전용 음성 캐릭터 (목소리 톤)
                            </label>
                            <div className="flex items-center gap-2">
                              <select
                                value={char.voiceSpeaker}
                                onChange={(e) =>
                                  handlePatchCharacter(char.id, {
                                    voiceSpeaker: e.target.value as BunnyVoiceSpeaker,
                                  })
                                }
                                className={`flex-1 ${inputCls}`}
                              >
                                {(Object.keys(VOICE_SPEAKER_LABELS) as BunnyVoiceSpeaker[]).map(
                                  (vKey) => (
                                    <option key={vKey} value={vKey}>
                                      {VOICE_SPEAKER_LABELS[vKey]}
                                    </option>
                                  )
                                )}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  speakText(
                                    char.greeting || `안녕! 나는 ${char.name}야!`,
                                    char.voiceSpeaker,
                                    true
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-xl bg-[#141519] text-white px-3 py-2 text-xs font-semibold whitespace-nowrap shrink-0"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                                들어보기
                              </button>
                            </div>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                              부르면 말하는 인사말
                            </label>
                            <input
                              type="text"
                              value={char.greeting}
                              onChange={(e) =>
                                handlePatchCharacter(char.id, { greeting: e.target.value })
                              }
                              className={`w-full ${inputCls}`}
                            />
                          </div>

                          <div className="sm:col-span-3 flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-zinc-500">의상 색상:</span>
                              {COLOR_THEMES.map((th) => (
                                <button
                                  key={th.label}
                                  type="button"
                                  onClick={() =>
                                    handlePatchCharacter(char.id, {
                                      outfitHex: th.outfitHex,
                                      accentHex: th.accentHex,
                                    })
                                  }
                                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                                    char.accentHex === th.accentHex
                                      ? 'border-[#141519] scale-110'
                                      : 'border-white shadow-sm'
                                  }`}
                                  style={{ backgroundColor: th.accentHex }}
                                  title={th.label}
                                />
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingCharId(null)}
                              className="rounded-full bg-[#141519] text-white px-4 py-1.5 text-xs font-semibold"
                            >
                              업데이트 완료
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===============================================================
              TAB: POWER-SAVING SCHEDULE & AWAY SCREEN OFF
          =============================================================== */}
          {activeTab === 'power' && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#141519] flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#141519]" />
                      전기료 절약 · 예약 시간 강제 켜짐 & 부재 시간 화면 끄기
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      가족이 집에 있는 예약 시간에만 액자를 강제로 켜고, 출근·등원 등 집에 없는 외출 시간대와 심야에는 화면 및 3D·슬라이드 연산을 완전히 정지합니다.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEnterSleepNow();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white border border-zinc-300 hover:bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-[#141519] whitespace-nowrap"
                    >
                      <Moon className="w-3.5 h-3.5" />
                      지금 화면 끄기 (외출 절전)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChangePowerSchedule({
                          ...powerSchedule,
                          enabled: !powerSchedule.enabled,
                        })
                      }
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                        powerSchedule.enabled
                          ? 'bg-[#141519] text-white'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {powerSchedule.enabled ? '예약 절전 켜짐' : '예약 절전 꺼짐'}
                    </button>
                  </div>
                </div>

                {/* Morning Wake ~ Night Sleep Schedule */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-zinc-200/80">
                  <div className="rounded-xl bg-white border border-zinc-200 p-3.5">
                    <label className="block text-xs font-bold text-[#141519] mb-1">
                      아침 예약 강제 켜짐 시각
                    </label>
                    <p className="text-[11px] text-zinc-500 mb-2">
                      지정된 시각이 되면 절전 중이던 액자가 자동으로 강제 켜집니다.
                    </p>
                    <input
                      type="time"
                      value={powerSchedule.wakeTime}
                      onChange={(e) =>
                        onChangePowerSchedule({ ...powerSchedule, wakeTime: e.target.value })
                      }
                      className={`w-full ${inputCls} bg-[#F7F8FA] font-semibold tabular-nums`}
                    />
                  </div>

                  <div className="rounded-xl bg-white border border-zinc-200 p-3.5">
                    <label className="block text-xs font-bold text-[#141519] mb-1">
                      심야 취침 화면 꺼짐 시각
                    </label>
                    <p className="text-[11px] text-zinc-500 mb-2">
                      취침 시간부터 다음 날 아침 켜짐 시각까지 화면을 끕니다.
                    </p>
                    <input
                      type="time"
                      value={powerSchedule.sleepTime}
                      onChange={(e) =>
                        onChangePowerSchedule({ ...powerSchedule, sleepTime: e.target.value })
                      }
                      className={`w-full ${inputCls} bg-[#F7F8FA] font-semibold tabular-nums`}
                    />
                  </div>
                </div>

                {/* Daytime Away Window (집에 없는 시간 화면 끄기) */}
                <div className="rounded-xl bg-white border border-zinc-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-[#141519]">
                        낮 외출 · 부재 시간대 화면 자동 끄기 (출근·어린이집·유치원 시간)
                      </h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        집에 사람이 없는 낮 시간 동안 화면을 끄고, 하원·귀가 시각에 맞춰 다시 강제로 켭니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChangePowerSchedule({
                          ...powerSchedule,
                          awayEnabled: !powerSchedule.awayEnabled,
                        })
                      }
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        powerSchedule.awayEnabled
                          ? 'bg-[#141519] text-white'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {powerSchedule.awayEnabled ? '사용 중' : '사용 안 함'}
                    </button>
                  </div>

                  {powerSchedule.awayEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                          외출 시작 (화면 꺼짐)
                        </label>
                        <input
                          type="time"
                          value={powerSchedule.awayStartTime}
                          onChange={(e) =>
                            onChangePowerSchedule({
                              ...powerSchedule,
                              awayStartTime: e.target.value,
                            })
                          }
                          className={`w-full ${inputCls} font-semibold tabular-nums`}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                          귀가 · 하원 (화면 강제 켜짐)
                        </label>
                        <input
                          type="time"
                          value={powerSchedule.awayEndTime}
                          onChange={(e) =>
                            onChangePowerSchedule({
                              ...powerSchedule,
                              awayEndTime: e.target.value,
                            })
                          }
                          className={`w-full ${inputCls} font-semibold tabular-nums`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Active Days & Idle Presence Timeout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white border border-zinc-200 p-3.5 space-y-2">
                    <label className="block text-xs font-bold text-[#141519]">
                      예약 스케줄 적용 요일
                    </label>
                    <div className="flex items-center gap-1.5">
                      {['일', '월', '화', '수', '목', '금', '토'].map((dLabel, dIdx) => {
                        const checked = powerSchedule.activeDays.includes(dIdx);
                        return (
                          <button
                            key={dLabel}
                            type="button"
                            onClick={() => togglePowerDay(dIdx)}
                            className={`w-8 h-8 rounded-xl text-xs font-bold transition-colors ${
                              checked
                                ? 'bg-[#141519] text-white'
                                : 'bg-[#F5F6F8] text-zinc-500 hover:bg-zinc-200'
                            }`}
                          >
                            {dLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white border border-zinc-200 p-3.5 space-y-2">
                    <label className="block text-xs font-bold text-[#141519]">
                      사람 부재 시 무반응 자동 절전 타이머
                    </label>
                    <select
                      value={powerSchedule.idleOffMinutes}
                      onChange={(e) =>
                        onChangePowerSchedule({
                          ...powerSchedule,
                          idleOffMinutes: Number(e.target.value),
                        })
                      }
                      className={`w-full ${inputCls}`}
                    >
                      <option value={0}>사용 안 함 (예약 시간 동안 항상 켜짐 유지)</option>
                      <option value={15}>15분 동안 대화·터치 없으면 절전</option>
                      <option value={30}>30분 동안 대화·터치 없으면 절전</option>
                      <option value={60}>60분 동안 대화·터치 없으면 절전</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===============================================================
              TAB: LAYOUT PLACEMENT (LEFT/RIGHT) & WEATHER EFFECTS
          =============================================================== */}
          {activeTab === 'layout' && (
            <div className="space-y-6">
              {/* 1. Menu Bar Left / Right Position */}
              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-3.5">
                <div>
                  <h3 className="text-sm font-bold text-[#141519]">
                    메뉴창 (빠른 다크 아이콘 바) 위치 설정
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    검정색 세로 메뉴 아이콘 레일을 화면 왼쪽 끝에 둘지 오른쪽 끝에 둘지 선택합니다.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { side: 'left', label: '왼쪽에 메뉴창 배치', icon: PanelLeft },
                      { side: 'right', label: '오른쪽에 메뉴창 배치', icon: PanelRight },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = menuPosition === opt.side;
                    return (
                      <button
                        key={opt.side}
                        type="button"
                        onClick={() => onChangeMenuPosition(opt.side)}
                        className={`flex items-center justify-between rounded-2xl p-4 border text-left transition-colors ${
                          active
                            ? 'bg-[#141519] border-[#141519] text-white'
                            : 'bg-white border-zinc-200 text-[#141519] hover:bg-zinc-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-bold">{opt.label}</span>
                        </div>
                        {active && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Weather & Schedule Panel Left / Right Position */}
              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-3.5">
                <div>
                  <h3 className="text-sm font-bold text-[#141519]">
                    날씨 · 미세먼지 · 일정 패널 위치 설정
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    현재 날씨, 내일 날씨, 미세먼지 및 가족 일정을 보여주는 정보 컬럼을 왼쪽에 둘지 오른쪽에 둘지 선택합니다.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { side: 'left', label: '왼쪽에 날씨·일정 배치', icon: PanelLeft },
                      { side: 'right', label: '오른쪽에 날씨·일정 배치', icon: PanelRight },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = weatherPosition === opt.side;
                    return (
                      <button
                        key={opt.side}
                        type="button"
                        onClick={() => onChangeWeatherPosition(opt.side)}
                        className={`flex items-center justify-between rounded-2xl p-4 border text-left transition-colors ${
                          active
                            ? 'bg-[#141519] border-[#141519] text-white'
                            : 'bg-white border-zinc-200 text-[#141519] hover:bg-zinc-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-bold">{opt.label}</span>
                        </div>
                        {active && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Live Layout Mini Preview */}
                <div className="pt-2">
                  <div className="text-[11px] font-semibold text-zinc-500 mb-2">현재 화면 배치 미리보기</div>
                  <div className="h-16 rounded-2xl bg-zinc-200/70 p-2 flex items-stretch gap-1.5">
                    {menuPosition === 'left' && (
                      <div className="w-4 rounded-lg bg-[#141519] flex items-center justify-center text-[8px] font-bold text-white">
                        M
                      </div>
                    )}
                    {weatherPosition === 'left' && (
                      <div className="w-16 rounded-lg bg-white border border-zinc-300 flex items-center justify-center text-[10px] font-bold text-[#141519]">
                        날씨·일정
                      </div>
                    )}
                    <div className="flex-1 rounded-lg bg-zinc-700 text-white flex items-center justify-center text-[10px] font-semibold">
                      메인 디지털 액자 화면
                    </div>
                    {weatherPosition === 'right' && (
                      <div className="w-16 rounded-lg bg-white border border-zinc-300 flex items-center justify-center text-[10px] font-bold text-[#141519]">
                        날씨·일정
                      </div>
                    )}
                    {menuPosition === 'right' && (
                      <div className="w-4 rounded-lg bg-[#141519] flex items-center justify-center text-[8px] font-bold text-white">
                        M
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Natural 3D Weather Effect Selector */}
              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-3.5">
                <div>
                  <h3 className="text-sm font-bold text-[#141519]">자연스러운 3D 날씨 이펙트 설정</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    실시간 날씨에 맞춰 따스한 윤슬·산들바람 꽃잎·빗방울(토끼 우산 착용)·눈송이를 자연스럽게 표현합니다.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      { id: 'auto', label: '자동 (실시간 날씨 연동)', icon: Cloud },
                      { id: 'sun', label: '따스한 햇살 윤슬', icon: Sun },
                      { id: 'breeze', label: '봄꽃 산들바람', icon: Wind },
                      { id: 'rain', label: '촉촉한 비 & 토끼 우산', icon: CloudRain },
                      { id: 'snow', label: '포근한 눈송이', icon: CloudSnow },
                      { id: 'off', label: '날씨 이펙트 끄기', icon: X },
                    ] as const
                  ).map((item) => {
                    const Icon = item.icon;
                    const active = weatherEffectMode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onChangeWeatherEffectMode(item.id)}
                        className={`flex items-center gap-2 rounded-2xl p-3 border text-left transition-colors ${
                          active
                            ? 'bg-[#141519] border-[#141519] text-white'
                            : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-semibold truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: Cloud & Synology Folder Connectors */}
          {activeTab === 'cloud' && (
            <div className="space-y-5">
              {renderGeminiAnalysisCard()}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {(
                  [
                    { id: 'share_link', label: '🔗 간편 공유 링크', icon: Link2 },
                    { id: 'local_folder', label: '📱 내 폰 갤러리 사진', icon: Smartphone },
                    { id: 'google_drive', label: 'Google Drive', icon: Cloud },
                    { id: 'onedrive', label: 'OneDrive', icon: Cloud },
                    { id: 'synology_api', label: 'Synology Photos', icon: HardDrive },
                    { id: 'synology_webdav', label: 'Synology WebDAV', icon: Server },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const selected = selectedProvider === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedProvider(item.id);
                        setRemoteFolders([]);
                        setConnectorStatus(null);
                      }}
                      className={`rounded-2xl p-3 border text-left transition-colors ${
                        selected
                          ? 'bg-[#141519] border-[#141519] text-white shadow-sm'
                          : 'bg-[#F7F8FA] border-zinc-200/80 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mb-1.5 ${selected ? 'text-white' : 'text-zinc-700'}`} />
                      <div className="text-xs font-semibold whitespace-nowrap truncate">{item.label}</div>
                    </button>
                  );
                })}
              </div>

              {/* 1. 간편 공유 링크 연동 (API 키 / 토큰 / 계정 비번 일체 불필요!) */}
              {selectedProvider === 'share_link' && (
                <div className="rounded-2xl bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-100 p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Link2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900">
                        🔗 간편 공유 링크 연동 (구글 · 원드라이브 · 시놀로지 포토)
                      </h3>
                      <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                        복잡한 <strong>API 키나 OAuth 토큰, 계정 비밀번호 없이</strong> 구글 드라이브/포토,
                        OneDrive, 시놀로지 포토(Synology Photos)의 <strong>공유 링크(URL)만 붙여넣으면</strong>{' '}
                        스마트 액자 앨범이 즉시 생성됩니다!
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        value={shareLinkUrl}
                        onChange={(e) => setShareLinkUrl(e.target.value)}
                        placeholder="공유 링크 붙여넣기 (구글 포토 공유 앨범, 구글 드라이브 공개 폴더, 1drv.ms, 시놀로지 /mo/sharing/...)"
                        className={`flex-1 ${inputCls} bg-white text-xs`}
                      />
                      <input
                        type="text"
                        value={shareLinkAlbumTitle}
                        onChange={(e) => setShareLinkAlbumTitle(e.target.value)}
                        placeholder="앨범 이름 (선택: 자동 지정)"
                        className={`w-full sm:w-44 ${inputCls} bg-white text-xs`}
                      />
                      <input
                        type="password"
                        value={shareLinkPassword}
                        onChange={(e) => setShareLinkPassword(e.target.value)}
                        placeholder="공유 비번 (설정한 경우만)"
                        className={`w-full sm:w-40 ${inputCls} bg-white text-xs`}
                      />
                    </div>

                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => handleRegisterShareLink()}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
                    >
                      {isConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {isConnecting ? '실제 사진 불러오는 중...' : '실제 공유 사진 불러오기 · 앨범 등록'}
                    </button>
                  </div>

                  <div className="rounded-xl bg-white/80 border border-indigo-100 p-3 text-[11px] text-zinc-600 space-y-1">
                    <div className="font-bold text-indigo-900">📌 내 사진이 잘 불러와지려면 꼭 확인해 주세요!</div>
                    <div>• <strong>구글 포토</strong>: 앨범 열기 → 공유 → <strong>[링크 생성]</strong> (<code>photos.app.goo.gl/...</code>)</div>
                    <div>• <strong>구글 드라이브</strong>: 사진 폴더 우클릭/더보기 → 공유 → 일반 액세스를 <strong>[링크가 있는 모든 사용자]</strong>로 변경</div>
                    <div>• <strong>원드라이브</strong>: 사진 폴더 공유 → <strong>[링크가 있는 모든 사용자 보기 가능]</strong> 링크 복사 (<code>1drv.ms/...</code>)</div>
                    <div>• <strong>시놀로지 포토</strong>: 앨범 공유 → <strong>[공개 링크 활성화]</strong> (비밀번호 설정 시 위 칸에 입력)</div>
                  </div>

                  <div className="pt-2 border-t border-indigo-100/80">
                    <div className="text-[11px] font-semibold text-zinc-500 mb-2">
                      💡 공유 링크가 아직 없을 때 화면 미리보기용 (샘플 앨범):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickAddSampleAlbum('google_drive', '제주 가족여행')}
                        className="rounded-full bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 text-[11px] font-medium text-indigo-900 transition-colors"
                      >
                        + [샘플] 제주바다 앨범
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAddSampleAlbum('onedrive', '가평 단풍캠핑')}
                        className="rounded-full bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 text-[11px] font-medium text-indigo-900 transition-colors"
                      >
                        + [샘플] 단풍캠핑 앨범
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAddSampleAlbum('synology_api', '서울숲 가족소풍')}
                        className="rounded-full bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 text-[11px] font-medium text-indigo-900 transition-colors"
                      >
                        + [샘플] 시놀로지 가족 앨범
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Google Drive 연동 */}
              {selectedProvider === 'google_drive' && (
                <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#141519]">Google Drive 사진 폴더 연동</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      구글 드라이브 폴더의 <strong>'공유 링크'</strong>만 붙여넣으면 API 키 없이도 누구나 손쉽게 액자 앨범을 만들 수 있습니다.
                    </p>
                  </div>

                  <div className="bg-white rounded-xl p-4 border border-zinc-200/80 space-y-3">
                    <div className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      가장 쉬운 동기화 방법: 폴더 공유 링크(URL) 붙여넣기
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        value={shareLinkUrl}
                        onChange={(e) => setShareLinkUrl(e.target.value)}
                        placeholder="구글 포토 공유 앨범 (photos.app.goo.gl/...) 또는 구글 드라이브 공개 폴더 링크"
                        className={`flex-1 ${inputCls} bg-[#F7F8FA] text-xs`}
                      />
                      <button
                        type="button"
                        disabled={isConnecting}
                        onClick={() => handleRegisterShareLink(shareLinkUrl)}
                        className="rounded-full bg-[#141519] hover:bg-zinc-800 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        {isConnecting ? '사진 불러오는 중...' : '실제 사진 불러오기'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => browseProviderFolders(true)}
                      className="rounded-full bg-zinc-200 hover:bg-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-800 whitespace-nowrap"
                    >
                      샘플 Google Drive 가족 앨범 불러오기
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowAdvancedApi(!showAdvancedApi)}
                      className="text-xs text-zinc-500 hover:text-zinc-800 underline"
                    >
                      {showAdvancedApi ? '개발자용 OAuth 토큰 접기' : '개발자용: OAuth 토큰 직접 입력 (선택)'}
                    </button>
                  </div>

                  {showAdvancedApi && (
                    <div className="pt-2 border-t border-zinc-200/60 space-y-2">
                      <div className="text-[11px] text-zinc-500">
                        Google Cloud Console에서 발급받은 Bearer Access Token이 있는 경우 직접 입력할 수 있습니다.
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={gdriveToken}
                          onChange={(e) => setGdriveToken(e.target.value)}
                          placeholder="Google Drive OAuth Access Token"
                          className={`flex-1 ${inputCls} bg-white text-xs`}
                        />
                        <button
                          type="button"
                          disabled={isConnecting}
                          onClick={() => browseProviderFolders(false)}
                          className="rounded-full bg-white border border-zinc-300 hover:bg-zinc-50 px-4 py-2 text-xs font-semibold text-[#141519] whitespace-nowrap"
                        >
                          실제 토큰으로 조회
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Microsoft OneDrive 연동 */}
              {selectedProvider === 'onedrive' && (
                <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#141519]">Microsoft OneDrive 사진 폴더 연동</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      원드라이브 앱이나 웹에서 복사한 <strong>'공유 링크(1drv.ms)'</strong>만 넣으면 복잡한 설정 없이 동기화됩니다.
                    </p>
                  </div>

                  <div className="bg-white rounded-xl p-4 border border-zinc-200/80 space-y-3">
                    <div className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      가장 쉬운 동기화 방법: OneDrive 공유 링크(1drv.ms) 붙여넣기
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        value={shareLinkUrl}
                        onChange={(e) => setShareLinkUrl(e.target.value)}
                        placeholder="원드라이브 공유 링크 (https://1drv.ms/f/...)"
                        className={`flex-1 ${inputCls} bg-[#F7F8FA] text-xs`}
                      />
                      <button
                        type="button"
                        disabled={isConnecting}
                        onClick={() => handleRegisterShareLink(shareLinkUrl)}
                        className="rounded-full bg-[#141519] hover:bg-zinc-800 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        {isConnecting ? '사진 불러오는 중...' : '실제 사진 불러오기'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => browseProviderFolders(true)}
                      className="rounded-full bg-zinc-200 hover:bg-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-800 whitespace-nowrap"
                    >
                      샘플 OneDrive 가족 앨범 불러오기
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowAdvancedApi(!showAdvancedApi)}
                      className="text-xs text-zinc-500 hover:text-zinc-800 underline"
                    >
                      {showAdvancedApi ? '개발자용 Graph 토큰 접기' : '개발자용: Graph 토큰 직접 입력 (선택)'}
                    </button>
                  </div>

                  {showAdvancedApi && (
                    <div className="pt-2 border-t border-zinc-200/60 space-y-2">
                      <div className="text-[11px] text-zinc-500">
                        Azure Portal 앱 등록을 통해 발급받은 Microsoft Graph Access Token이 있는 경우 입력합니다.
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={onedriveToken}
                          onChange={(e) => setOnedriveToken(e.target.value)}
                          placeholder="Microsoft Graph Access Token"
                          className={`flex-1 ${inputCls} bg-white text-xs`}
                        />
                        <button
                          type="button"
                          disabled={isConnecting}
                          onClick={() => browseProviderFolders(false)}
                          className="rounded-full bg-white border border-zinc-300 hover:bg-zinc-50 px-4 py-2 text-xs font-semibold text-[#141519] whitespace-nowrap"
                        >
                          실제 토큰으로 조회
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. Synology Photos / DSM API 연동 */}
              {selectedProvider === 'synology_api' && (
                <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#141519]">시놀로지 NAS (Synology Photos) 연동</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      시놀로지 포토 앱에서 생성한 <strong>'공유 링크'</strong>를 넣거나, DSM 공식 API로 NAS에 직접 연결합니다.
                    </p>
                  </div>

                  {/* 추천 방법: 시놀로지 포토 공유 링크 */}
                  <div className="bg-white rounded-xl p-4 border border-zinc-200/80 space-y-3">
                    <div className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      🌟 가장 쉬운 방법 (추천): 시놀로지 포토 공유 링크 연동 (계정/비번 불필요!)
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Synology Photos 앱에서 앨범 우측 상단의 <strong>[공유] → [공개 링크 활성화]</strong> 후 복사한 URL을 붙여넣으세요.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        value={shareLinkUrl}
                        onChange={(e) => setShareLinkUrl(e.target.value)}
                        placeholder="시놀로지 포토 공유 링크 (예: https://bluewind201.synology.me:9999/mo/sharing/...)"
                        className={`flex-1 ${inputCls} bg-[#F7F8FA] text-xs`}
                      />
                      <input
                        type="password"
                        value={shareLinkPassword}
                        onChange={(e) => setShareLinkPassword(e.target.value)}
                        placeholder="공유 비밀번호 (선택)"
                        className={`w-full sm:w-36 ${inputCls} bg-[#F7F8FA] text-xs`}
                      />
                      <button
                        type="button"
                        disabled={isConnecting}
                        onClick={() => handleRegisterShareLink(shareLinkUrl)}
                        className="rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-4 py-2 text-xs font-bold text-white whitespace-nowrap shadow-sm"
                      >
                        {isConnecting ? '불러오는 중...' : '시놀로지 실제 사진 등록'}
                      </button>
                    </div>
                  </div>

                  {/* 대안 방법: DSM API 직접 로그인 */}
                  <div className="pt-2 border-t border-zinc-200/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800">
                        🔒 DSM 관리자/사용자 계정 직접 로그인 연결
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedApi(!showAdvancedApi)}
                        className="text-xs text-zinc-500 hover:text-zinc-800 underline"
                      >
                        {showAdvancedApi ? '입력창 접기' : '직접 로그인 설정 열기'}
                      </button>
                    </div>

                    {showAdvancedApi && (
                      <div className="space-y-2.5 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <input
                            type="text"
                            value={synoUrl}
                            onChange={(e) => setSynoUrl(e.target.value)}
                            placeholder="https://nas.synology.me:5001 (또는 포트)"
                            className={`${inputCls} bg-white text-xs`}
                          />
                          <input
                            type="text"
                            value={synoUser}
                            onChange={(e) => setSynoUser(e.target.value)}
                            placeholder="DSM 계정 ID"
                            className={`${inputCls} bg-white text-xs`}
                          />
                          <input
                            type="password"
                            value={synoPass}
                            onChange={(e) => setSynoPass(e.target.value)}
                            placeholder="DSM 비밀번호"
                            className={`${inputCls} bg-white text-xs`}
                          />
                          <input
                            type="text"
                            value={synoOtp}
                            onChange={(e) => setSynoOtp(e.target.value)}
                            placeholder="2단계 OTP 인증코드 (설정된 경우)"
                            className={`${inputCls} bg-white text-xs`}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isConnecting}
                            onClick={() => browseProviderFolders(false)}
                            className="rounded-full bg-white border border-zinc-300 hover:bg-zinc-50 px-4 py-2 text-xs font-semibold text-[#141519]"
                          >
                            실제 DSM 로그인 · 폴더 조회
                          </button>
                          <button
                            type="button"
                            disabled={isConnecting}
                            onClick={() => browseProviderFolders(true)}
                            className="rounded-full bg-zinc-200 hover:bg-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-800"
                          >
                            샘플 Synology Photos 앨범 불러오기
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. Synology WebDAV 연동 */}
              {selectedProvider === 'synology_webdav' && (
                <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-3">
                  <h3 className="text-sm font-bold text-[#141519]">시놀로지 NAS · WebDAV 폴더 연동</h3>
                  <p className="text-xs text-zinc-500">
                    시놀로지 WebDAV Server 주소(HTTPS 5006 또는 9999 등)와 계정을 입력해 PROPFIND 방식으로 사진 폴더를 탐색합니다.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={webdavUrl}
                      onChange={(e) => setWebdavUrl(e.target.value)}
                      placeholder="https://nas.synology.me:5006"
                      className={`${inputCls} bg-white text-xs`}
                    />
                    <input
                      type="text"
                      value={webdavPath}
                      onChange={(e) => setWebdavPath(e.target.value)}
                      placeholder="기본 경로 (예: /photo)"
                      className={`${inputCls} bg-white text-xs`}
                    />
                    <input
                      type="text"
                      value={webdavUser}
                      onChange={(e) => setWebdavUser(e.target.value)}
                      placeholder="시놀로지 계정 ID"
                      className={`${inputCls} bg-white text-xs`}
                    />
                    <input
                      type="password"
                      value={webdavPass}
                      onChange={(e) => setWebdavPass(e.target.value)}
                      placeholder="비밀번호"
                      className={`${inputCls} bg-white text-xs`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => browseProviderFolders(false)}
                      className="rounded-full bg-white border border-zinc-300 hover:bg-zinc-50 px-4 py-2 text-xs font-semibold text-[#141519]"
                    >
                      실제 WebDAV 서버 연결
                    </button>
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => browseProviderFolders(true)}
                      className="rounded-full bg-zinc-200 hover:bg-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-800"
                    >
                      샘플 WebDAV 폴더 불러오기
                    </button>
                  </div>
                </div>
              )}

              {/* 6. 스마트폰/내 기기 사진 직접 올리기 */}
              {selectedProvider === 'local_folder' && (
                <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#141519]">
                        스마트폰 · 태블릿 갤러리 사진 직접 등록
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        복잡한 클라우드 설정 없이, 스마트폰 갤러리에 저장된 우리 아이 예쁜 사진들을 한 번에 선택해 액자에 즉시 띄웁니다.
                      </p>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={customAlbumName}
                    onChange={(e) => setCustomAlbumName(e.target.value)}
                    placeholder="등록할 디지털 앨범 이름 (예: 우리 아이 첫돌 추억, 주말 나들이)"
                    className={`w-full ${inputCls} bg-white text-xs`}
                  />

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <input
                      ref={filesInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleLocalFilesUpload(e.target.files)}
                      className="hidden"
                    />
                    <input
                      ref={folderInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                      onChange={(e) => handleLocalFilesUpload(e.target.files)}
                      className="hidden"
                    />

                    <button
                      type="button"
                      disabled={isAnalyzingLocal}
                      onClick={() => filesInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
                    >
                      {isAnalyzingLocal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      내 기기 갤러리에서 사진 여러 장 선택
                    </button>

                    <button
                      type="button"
                      disabled={isAnalyzingLocal}
                      onClick={() => folderInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl bg-white border border-zinc-300 hover:bg-zinc-50 px-4 py-2.5 text-xs font-semibold text-zinc-700 transition-colors"
                    >
                      <FolderPlus className="w-4 h-4" />
                      사진 폴더 통째로 선택 (PC)
                    </button>
                  </div>
                </div>
              )}

              {/* 스마트 액자 백엔드 서버 URL 설정 (원격 연동) */}
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white/60 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-600 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-zinc-400" />
                    스마트 액자 서버(Backend) 주소 연결 (선택사항)
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {backendServerUrl ? '연결 주소 설정됨' : '앱 단독 모드'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={backendServerUrl}
                    onChange={(e) => handleSaveBackendUrl(e.target.value)}
                    placeholder="예: http://192.168.0.50:3000 (PC 또는 NAS Docker 서버 주소)"
                    className={`flex-1 ${inputCls} bg-white text-[11px] py-1.5`}
                  />
                  {backendServerUrl && (
                    <button
                      type="button"
                      onClick={() => handleSaveBackendUrl('')}
                      className="px-2.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-800 border rounded-lg bg-white"
                    >
                      초기화
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-zinc-400">
                  집안 PC나 NAS에서 백엔드(`server.ts`)를 구동 중인 경우 IP와 포트를 적어두면 모바일 APK에서도 원격 AI 비서 및 NAS 프록시를 사용할 수 있습니다.
                </p>
              </div>

              {/* 연동 버튼 클릭 시 실시간 최적 용량 압축 + AI 고속 사전 데이터화 프로그레스 카드 */}
              {syncPipelineProgress && (
                <div className="rounded-2xl bg-gradient-to-r from-indigo-950 via-[#191B24] to-indigo-950 border border-indigo-400/40 p-4 text-white space-y-2.5 shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      {syncPipelineProgress.phase === 'fetching'
                        ? '📡 클라우드 / 시놀로지 사진 목록 확인 중...'
                        : syncPipelineProgress.phase === 'optimizing'
                        ? '📦 1/2단계: 고화질 사진을 최소 용량(~135KB WebP)으로 최적 저장 중'
                        : '✨ 2/2단계: Gemini AI 5장 일괄 고속 분석 · 검색 데이터화 중'}
                    </span>
                    {syncPipelineProgress.phase !== 'fetching' && (
                      <span className="font-mono text-xs text-indigo-200">
                        {syncPipelineProgress.done} / {syncPipelineProgress.total}장
                        {syncPipelineProgress.savedBytesTotal > 0
                          ? ` · 약 ${(syncPipelineProgress.savedBytesTotal / (1024 * 1024)).toFixed(1)}MB 절감`
                          : ''}
                      </span>
                    )}
                  </div>
                  {syncPipelineProgress.currentPhotoTitle && (
                    <p className="text-[11px] text-zinc-300 truncate">
                      현재 처리 중: "{syncPipelineProgress.currentPhotoTitle}"
                    </p>
                  )}
                  <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-indigo-400 to-amber-300 transition-all duration-300"
                      style={{
                        width: `${
                          syncPipelineProgress.phase === 'fetching'
                            ? 12
                            : Math.max(
                                8,
                                Math.min(
                                  100,
                                  Math.round(
                                    (syncPipelineProgress.done /
                                      Math.max(1, syncPipelineProgress.total)) *
                                      100
                                  )
                                )
                              )
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 상태 메시지 및 빠른 대안 버튼 카드 */}
              {connectorStatus && (
                <div
                  className={`rounded-2xl p-4 text-xs font-medium border space-y-2.5 ${
                    connectorStatus.type === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : connectorStatus.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-zinc-100 border-zinc-200 text-zinc-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {connectorStatus.type === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    ) : (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <span className="flex-1 leading-relaxed">{connectorStatus.msg}</span>
                  </div>

                  {connectorStatus.actionLabel && connectorStatus.onAction && (
                    <div className="pt-2 border-t border-rose-200/60">
                      <button
                        type="button"
                        onClick={connectorStatus.onAction}
                        className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-1.5 text-xs shadow-sm transition-all"
                      >
                        {connectorStatus.actionLabel}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {remoteFolders.length > 0 && (
                <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-4">
                  <h4 className="text-xs font-bold text-[#141519]">
                    등록할 사진 폴더 선택 ({checkedFolderIds.length}개 선택됨)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {remoteFolders.map((folder) => {
                      const checked = checkedFolderIds.includes(folder.id);
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => toggleFolderSelection(folder)}
                          className={`flex items-center justify-between rounded-xl p-3 border text-left transition-colors ${
                            checked
                              ? 'bg-[#141519] border-[#141519] text-white'
                              : 'bg-white border-zinc-200 text-[#141519] hover:bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Folder className={`w-4 h-4 shrink-0 ${checked ? 'text-amber-300' : 'text-zinc-500'}`} />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{folder.name}</div>
                              <div className={`text-[11px] truncate ${checked ? 'text-zinc-300' : 'text-zinc-400'}`}>
                                {folder.path} · 사진 {folder.photoCount}장
                              </div>
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                              checked ? 'bg-white text-[#141519]' : 'border border-zinc-300'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2 border-t border-zinc-200">
                    <input
                      type="text"
                      value={customAlbumName}
                      onChange={(e) => setCustomAlbumName(e.target.value)}
                      placeholder="새 디지털 앨범 이름 입력"
                      className={`flex-1 ${inputCls} bg-white`}
                    />
                    <button
                      type="button"
                      disabled={checkedFolderIds.length === 0}
                      onClick={handleRegisterSelectedFolders}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#141519] hover:bg-zinc-800 disabled:opacity-40 px-5 py-2.5 text-xs font-semibold text-white whitespace-nowrap"
                    >
                      <FolderPlus className="w-4 h-4" />
                      선택 폴더 디지털 앨범 추가
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Registered Digital Albums */}
          {activeTab === 'albums' && (
            <div className="space-y-5">
              {renderGeminiAnalysisCard()}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-4">
                <div>
                  <label className="block text-xs font-bold text-[#141519] mb-2">
                    액자 전환 효과
                  </label>
                  <select
                    value={transitionMode}
                    onChange={(e) => onChangeTransitionMode(e.target.value as FrameTransitionMode)}
                    className={`w-full ${inputCls} bg-white`}
                  >
                    <option value="ken_burns">FrameSway 시네마 팬 & 줌 (Ken Burns)</option>
                    <option value="frame_sway">FrameSway 산들 바람 모션</option>
                    <option value="gallery_matte">미술관 아이보리 매트 액자</option>
                    <option value="dual_split">듀얼 투샷 나란히 보기</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#141519] mb-2">
                    슬라이드 전환 시간 ({slideIntervalSec}초)
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={slideIntervalSec}
                    onChange={(e) => onChangeSlideInterval(Number(e.target.value))}
                    className="w-full accent-[#141519] mt-2"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#141519]">등록된 디지털 앨범 목록</h3>
                  {albums.some(
                    (a) =>
                      a.id === 'album-gdrive-family-2026' ||
                      a.id === 'album-synology-camping-winter' ||
                      a.id.startsWith('album-sample-')
                  ) && (
                    <button
                      type="button"
                      onClick={() => {
                        albums.forEach((a) => {
                          if (
                            a.id === 'album-gdrive-family-2026' ||
                            a.id === 'album-synology-camping-winter' ||
                            a.id.startsWith('album-sample-')
                          ) {
                            onDeleteAlbum(a.id);
                          }
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1 text-[11px] font-semibold text-rose-700 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      기본 샘플 앨범 모두 지우기
                    </button>
                  )}
                </div>
                {albums.map((album) => {
                  const vaultCount = album.photos.filter((p) => p.vaultCached).length;
                  const aiCount = album.photos.filter((p) => p.aiAnalyzed).length;
                  const albumOptMb = (
                    album.photos.reduce((s, p) => s + (p.optimizedBytes || 0), 0) /
                    (1024 * 1024)
                  ).toFixed(1);
                  const firstPhoto = album.photos[0];
                  const thumbSrc =
                    albumThumbBlobs[album.id] ||
                    (firstPhoto &&
                    !firstPhoto.src.startsWith('idb:')
                      ? firstPhoto.src
                      : '');

                  return (
                    <div
                      key={album.id}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-3.5"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {firstPhoto && thumbSrc ? (
                          <img
                            src={thumbSrc}
                            alt={album.name}
                            referrerPolicy="no-referrer"
                            decoding="async"
                            className="w-16 h-11 rounded-xl object-contain shrink-0 bg-[#181A20]"
                          />
                        ) : (
                          <div className="w-16 h-11 rounded-xl shrink-0 bg-[#181A20] flex items-center justify-center text-zinc-400 text-[10px] font-semibold">
                            앨범
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-[#141519] truncate">
                              {album.name}
                            </span>
                            {vaultCount > 0 && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 whitespace-nowrap">
                                최적저장 {vaultCount}/{album.photos.length}장
                                {Number(albumOptMb) > 0 ? ` (${albumOptMb}MB)` : ''}
                              </span>
                            )}
                            {aiCount > 0 && (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800 whitespace-nowrap">
                                AI 데이터 {aiCount}/{album.photos.length}장
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-zinc-500 truncate">
                            {PROVIDER_LABELS[album.provider]} · {album.folderPath} · 사진 {album.photos.length}장
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/^https?:\/\//i.test(album.folderPath) && onRefreshAlbumUrls && (
                          <button
                            type="button"
                            disabled={refreshingAlbumId === album.id}
                            onClick={() => {
                              setRefreshingAlbumId(album.id);
                              onRefreshAlbumUrls(album.id).finally(() => setRefreshingAlbumId(null));
                            }}
                            title="공유 링크 사진 새로고침 + 경량 최적 저장 · AI 데이터화"
                            className="inline-flex items-center gap-1 rounded-full bg-white hover:bg-zinc-100 border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors whitespace-nowrap"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${
                                refreshingAlbumId === album.id ? 'animate-spin text-indigo-600' : ''
                              }`}
                            />
                            <span>최적저장·동기화</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onToggleAlbum(album.id)}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                            album.enabled
                              ? 'bg-[#141519] text-white'
                              : 'bg-white text-zinc-500 border border-zinc-200'
                          }`}
                        >
                          {album.enabled ? '표시중' : '숨김'}
                        </button>

                        {confirmDeleteAlbumId === album.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteAlbum(album.id);
                                setConfirmDeleteAlbumId(null);
                              }}
                              className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              삭제
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAlbumId(null)}
                              className="rounded-full bg-zinc-200 px-3 py-1.5 text-xs text-zinc-700"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAlbumId(album.id)}
                            aria-label="앨범 삭제"
                            className="h-8 w-8 rounded-full bg-white border border-zinc-200 hover:border-rose-300 text-zinc-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Custom Wake Word & Voice Settings */}
          {activeTab === 'voice' && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-[#141519]" />
                  <h3 className="text-sm font-bold text-[#141519]">AI 액자 음성 호출 명령어 사용자 지정</h3>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  마이크 호출 대기 상태에서 지정한 명령어(예: "하이 액자", "우리집 비서")를 말하면 날씨·일정·길안내 소요시간(자동차/도보/대중교통)을 화면 절반에 2분간 표시합니다.
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={wakeWordDraft}
                    onChange={(e) => setWakeWordDraft(e.target.value)}
                    placeholder="예: 하이 액자"
                    className={`flex-1 ${inputCls} bg-white`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (wakeWordDraft.trim()) onChangeWakeWord(wakeWordDraft.trim());
                    }}
                    className="rounded-full bg-[#141519] hover:bg-zinc-800 px-5 py-2 text-xs font-semibold text-white whitespace-nowrap"
                  >
                    호출어 저장
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {['하이 액자', '헤이 프레임', '스마트 액자', '우리집 비서'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setWakeWordDraft(preset);
                        onChangeWakeWord(preset);
                      }}
                      className="rounded-full bg-white hover:bg-zinc-100 border border-zinc-200 px-3 py-1 text-xs text-zinc-700"
                    >
                      "{preset}"
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-3">
                <h3 className="text-sm font-bold text-[#141519]">음성 소리 출력 (사람 목소리 AI 성우 TTS & 효과음)</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-3">
                    <span className="block text-xs font-semibold text-zinc-700">
                      AI 브리핑 및 5종 토끼 캐릭터 자연스러운 한국인 사람 목소리 출력
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      기계적인 피치 변조를 제거하고 실제 한국어 성우 호흡(SunHi / Hyunsu / InJoon + Gemini Studio + Supertone 오픈소스 엔진)으로 자연스럽게 말합니다.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChangeTtsEnabled(!ttsEnabled)}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold shrink-0 transition-colors ${
                      ttsEnabled ? 'bg-[#141519] text-white' : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {ttsEnabled ? '켜짐' : '꺼짐'}
                  </button>
                </div>
              </div>

              {/* GitHub Open-Source Human-Like Korean TTS Engine (`Supertone/Supertonic-2`) */}
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50/90 via-white to-emerald-50/60 border border-indigo-200/80 p-5 space-y-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Volume2 className="w-4 h-4 text-indigo-600 shrink-0" />
                      <h3 className="text-sm font-bold text-[#141519]">
                        GitHub 오픈소스 사람 음성 엔진 (Supertone Supertonic-2 한국어 AI 보이스)
                      </h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          supertonicState.ready && supertonicState.enabled
                            ? 'bg-emerald-600 text-white'
                            : supertonicState.loading
                            ? 'bg-indigo-600 text-white'
                            : 'bg-zinc-200 text-zinc-700'
                        }`}
                      >
                        {supertonicState.ready && supertonicState.enabled
                          ? '활성화됨 · 실제 사람 음성'
                          : supertonicState.loading
                          ? `다운로드 중 ${supertonicState.progressPct}%`
                          : supertonicState.cachedOnDisk
                          ? '다운로드 완료 (대기중)'
                          : '선택 설치 가능'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      한국 대표 음성 AI 기업 <strong>Supertone</strong>의 GitHub 오픈소스(
                      <code>supertone-inc/supertonic</code>) 온디바이스 한국어 사람 음성 모델입니다. API 키 없이 5종 토끼가 각기 다른 실제 한국인 성우 음색(
                      <code>F1~F5, M1</code>)으로 사람처럼 자연스럽게 대화하며, 1회 다운로드 후 오프라인에서도 영구 동작합니다.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!supertonicState.ready ? (
                      <button
                        type="button"
                        disabled={supertonicState.loading}
                        onClick={() => {
                          setSupertonicEnabled(true);
                          void initializeSupertonicEngine();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors"
                      >
                        {supertonicState.loading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        {supertonicState.loading
                          ? '사람 음성 엔진 준비 중...'
                          : supertonicState.cachedOnDisk
                          ? '오픈소스 사람 음성 켜기'
                          : '사람 음성 엔진 다운로드 · 연결'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSupertonicEnabled(!supertonicState.enabled)}
                        className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                          supertonicState.enabled
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                        }`}
                      >
                        {supertonicState.enabled ? '오픈소스 사람 음성 사용 중' : '사용 안 함'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (!ttsEnabled) onChangeTtsEnabled(true);
                        void speakText(
                          '안녕! 나는 토순이야. 우리 오늘 같이 예쁜 가족 사진 보면서 재미있게 이야기 나누자!',
                          'tosuni',
                          true
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-[#141519]"
                    >
                      <Play className="w-3 h-3" />
                      목소리 테스트
                    </button>
                  </div>
                </div>

                {(supertonicState.loading || supertonicState.ready) && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-zinc-600">
                      <span>{supertonicState.stageLabel}</span>
                      <span className="font-mono font-semibold">{supertonicState.progressPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.max(4, supertonicState.progressPct)}%` }}
                      />
                    </div>
                  </div>
                )}

                {supertonicState.error && (
                  <p className="text-xs font-medium text-rose-600">
                    ⚠️ {supertonicState.error} (기본 한국어 신경망 성우 음성은 정상 동작합니다)
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px] text-zinc-600">
                  {(['tosuni', 'tosili', 'toddungi', 'tobyeori', 'togureum'] as BunnyVoiceSpeaker[]).map(
                    (sp) => (
                      <div
                        key={sp}
                        className="flex items-center justify-between rounded-xl bg-white/80 border border-zinc-200/70 px-3 py-1.5"
                      >
                        <span className="truncate">{getSupertonicVoiceDescription(sp)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!ttsEnabled) onChangeTtsEnabled(true);
                            void speakText('우와 반가워! 오늘 기분이 정말 좋아!', sp, true);
                          }}
                          className="ml-2 text-indigo-600 hover:text-indigo-800 font-bold shrink-0"
                        >
                          들어보기
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>

              {renderGeminiAnalysisCard()}

              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#141519]" />
                  <h3 className="text-sm font-bold text-[#141519]">
                    모바일 단독 모드용 Google Gemini API 키 설정 (선택사항)
                  </h3>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  API 키 없이도 내장 한국어 스마트 비서(날씨·미세먼지·길안내·일정) 및 3D 토끼 대화·영어 단어카드 기능이 100% 동작합니다. 더욱 풍부한 실시간 자유 대화를 원하시면 무료 Gemini API 키(AI Studio)를 저장해 두세요.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="password"
                    value={geminiKeyDraft}
                    onChange={(e) => setGeminiKeyDraft(e.target.value)}
                    placeholder="AIzaSy... (비워두면 기본 내장 AI 대화 엔진 사용)"
                    className={`flex-1 ${inputCls} bg-white`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      saveGeminiApiKey(geminiKeyDraft);
                      setGeminiKeySavedToast(true);
                      window.setTimeout(() => setGeminiKeySavedToast(false), 2500);
                    }}
                    className="rounded-full bg-[#141519] hover:bg-zinc-800 px-5 py-2 text-xs font-semibold text-white whitespace-nowrap"
                  >
                    {geminiKeySavedToast ? '저장 완료!' : 'API 키 저장'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Selective Calendar Sync + Location & Top Mart Holiday/Sale Ticker */}
          {activeTab === 'life' && (
            <div className="space-y-5">
              {/* Selective Calendar Sync Card (어떤 캘린더를 연동할지 직접 선택) */}
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50/85 via-white to-sky-50/60 border border-indigo-200/80 p-5 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                      <h3 className="text-sm font-bold text-[#141519]">
                        캘린더 연동 및 표시할 캘린더 직접 선택
                      </h3>
                      <span className="rounded-full bg-indigo-600 text-white px-2.5 py-0.5 text-[10px] font-bold">
                        선택됨 {calendarSources.filter((c) => c.selected).length}개 · 연동 일정 {syncedSchedulesCount}건
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      스마트폰·태블릿에 로그인된 <strong>구글 캘린더 · 삼성 캘린더 · 네이버 · Outlook · 가족 공유 달력</strong> 목록을 불러와 <strong>원하는 캘린더만 체크해서 연동</strong>하거나, 외부 <code>.ics</code> / 구글 캘린더 주소를 추가할 수 있습니다.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {onDiscoverDeviceCalendars && (
                      <button
                        type="button"
                        disabled={isDiscoveringDeviceCal}
                        onClick={async () => {
                          setIsDiscoveringDeviceCal(true);
                          setCalendarStatusMsg({
                            type: 'info',
                            msg: '기기에 등록된 캘린더 계정 목록을 불러오고 있습니다...',
                          });
                          try {
                            const res = await onDiscoverDeviceCalendars();
                            if (!res.granted) {
                              setCalendarStatusMsg({
                                type: 'error',
                                msg: '캘린더 읽기 권한이 거부되었거나 웹 브라우저 환경입니다. Android 앱에서는 권한 허용 후 내 기기 달력을 선택할 수 있으며, 웹에서는 아래 Google/iCal 주소로 연동할 수 있습니다.',
                              });
                            } else if (res.discoveredCount === 0) {
                              setCalendarStatusMsg({
                                type: 'info',
                                msg: '기기에서 표시 가능한 캘린더를 찾지 못했습니다. 기본 달력 앱에 계정이 로그인되어 있는지 확인하거나 아래 iCal(.ics) 주소를 추가해 보세요.',
                              });
                            } else {
                              setCalendarStatusMsg({
                                type: 'success',
                                msg: `📱 내 기기에서 ${res.discoveredCount}개의 캘린더를 찾았습니다! 아래 목록에서 액자에 띄울 캘린더만 체크해 주세요.`,
                              });
                            }
                          } finally {
                            setIsDiscoveringDeviceCal(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors"
                      >
                        {isDiscoveringDeviceCal ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Smartphone className="w-3.5 h-3.5" />
                        )}
                        내 기기 캘린더 목록 불러오기
                      </button>
                    )}

                    {onRefreshCalendarsNow && (
                      <button
                        type="button"
                        disabled={isCalendarSyncing}
                        onClick={() => {
                          void onRefreshCalendarsNow();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-[#141519]"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCalendarSyncing ? 'animate-spin text-indigo-600' : ''}`} />
                        일정 동기화 새로고침
                      </button>
                    )}
                  </div>
                </div>

                {calendarStatusMsg && (
                  <div
                    className={`rounded-xl px-3.5 py-2.5 text-xs font-medium border flex items-start gap-2 ${
                      calendarStatusMsg.type === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : calendarStatusMsg.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-white border-zinc-200 text-zinc-700'
                    }`}
                  >
                    {calendarStatusMsg.type === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    ) : (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <span>{calendarStatusMsg.msg}</span>
                  </div>
                )}

                {/* Selectable Checklist of All Discovered & Registered Calendars */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#141519]">
                      연동할 캘린더 선택 목록 ({calendarSources.length}개)
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      체크한 캘린더의 일정만 좌측 일정 카드와 AI 비서에 표시됩니다
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {calendarSources.map((cal) => {
                      const typeBadge =
                        cal.sourceType === 'android_device'
                          ? '기기 달력'
                          : cal.sourceType === 'kr_holidays'
                          ? '공휴일'
                          : '외부 캘린더';
                      return (
                        <div
                          key={cal.id}
                          className={`flex items-center justify-between gap-2.5 rounded-xl p-3 border transition-colors ${
                            cal.selected
                              ? 'bg-[#141519] border-[#141519] text-white shadow-sm'
                              : 'bg-white border-zinc-200 text-[#141519] hover:bg-zinc-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onToggleCalendarSource?.(cal.id)}
                            className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                          >
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                                cal.selected
                                  ? 'bg-white text-[#141519] border-white'
                                  : 'border-zinc-300 bg-white'
                              }`}
                            >
                              {cal.selected && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <span
                              className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white/40"
                              style={{ backgroundColor: cal.colorHex }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold truncate">{cal.name}</span>
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${
                                    cal.selected
                                      ? 'bg-white/15 text-zinc-200'
                                      : 'bg-zinc-100 text-zinc-600'
                                  }`}
                                >
                                  {typeBadge}
                                </span>
                              </div>
                              <div
                                className={`text-[11px] truncate ${
                                  cal.selected ? 'text-zinc-300' : 'text-zinc-500'
                                }`}
                              >
                                {cal.accountName}
                              </div>
                            </div>
                          </button>

                          {cal.sourceType === 'ics_url' && onRemoveCalendarSource && (
                            <button
                              type="button"
                              onClick={() => onRemoveCalendarSource(cal.id)}
                              title="외부 캘린더 연결 해제"
                              className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                                cal.selected
                                  ? 'text-zinc-300 hover:text-rose-300 hover:bg-white/10'
                                  : 'text-zinc-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add External Google Calendar ID / iCal (.ics / webcal://) Feed */}
                {onAddIcsCalendarSource && (
                  <div className="pt-3 border-t border-indigo-200/60 space-y-2.5">
                    <div className="text-xs font-bold text-[#141519]">
                      🔗 구글 캘린더 공개/비공개 주소 · 네이버 · Apple iCloud · 시놀로지 캘린더(.ics) 추가
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      구글 캘린더 설정의 <strong>'iCal 형식의 비공개 주소(.ics)'</strong> 또는 <strong>'캘린더 ID'</strong>, Apple iCloud <code>webcal://</code> 링크를 입력하면 기기 로그인 없이도 선택 연동됩니다.
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={icsName}
                        onChange={(e) => setIcsName(e.target.value)}
                        placeholder="캘린더 별칭 (예: 우리 가족 달력, 유치원 일정)"
                        className={`sm:w-52 ${inputCls} bg-white`}
                      />
                      <input
                        type="text"
                        value={icsUrlOrId}
                        onChange={(e) => setIcsUrlOrId(e.target.value)}
                        placeholder="https://calendar.google.com/calendar/ical/.../basic.ics 또는 webcal://..."
                        className={`flex-1 ${inputCls} bg-white`}
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        {['#4F46E5', '#10B981', '#EC4899', '#F59E0B', '#0EA5E9'].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setIcsColor(hex)}
                            className={`w-6 h-6 rounded-full border-2 transition-transform ${
                              icsColor === hex
                                ? 'border-[#141519] scale-110'
                                : 'border-white shadow-sm'
                            }`}
                            style={{ backgroundColor: hex }}
                            title="캘린더 색상 선택"
                          />
                        ))}
                        <button
                          type="button"
                          disabled={isAddingIcs}
                          onClick={async () => {
                            if (!icsUrlOrId.trim()) {
                              setCalendarStatusMsg({
                                type: 'error',
                                msg: '연동할 캘린더 iCal(.ics) 주소 또는 구글 캘린더 ID를 입력해 주세요.',
                              });
                              return;
                            }
                            setIsAddingIcs(true);
                            try {
                              const res = await onAddIcsCalendarSource(
                                icsName.trim() || '외부 공유 캘린더',
                                icsUrlOrId.trim(),
                                icsColor
                              );
                              setCalendarStatusMsg({
                                type: 'success',
                                msg: `🎉 "${icsName.trim() || '외부 공유 캘린더'}" 연동 완료! 다가오는 일정 ${res.count}건을 불러왔습니다.`,
                              });
                              setIcsName('');
                              setIcsUrlOrId('');
                            } catch (err: unknown) {
                              setCalendarStatusMsg({
                                type: 'error',
                                msg:
                                  err instanceof Error
                                    ? err.message
                                    : '캘린더 주소를 불러오지 못했습니다.',
                              });
                            } finally {
                              setIsAddingIcs(false);
                            }
                          }}
                          className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#141519] hover:bg-zinc-800 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
                        >
                          {isAddingIcs ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          캘린더 추가
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-3">
                <h3 className="text-sm font-bold text-[#141519]">날씨 · 미세먼지 기준 위치 설정</h3>
                <form onSubmit={handleCitySearch} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder="지역명 입력 (예: 서울 강남, 분당, 해운대, 제주)"
                    className={`flex-1 min-w-[200px] ${inputCls} bg-white`}
                  />
                  <button
                    type="submit"
                    disabled={isSearchingCity}
                    className="rounded-full bg-[#141519] hover:bg-zinc-800 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
                  >
                    {isSearchingCity ? '검색중...' : '지역 변경'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGpsLocation}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white border border-zinc-300 hover:bg-zinc-50 px-4 py-2 text-xs font-semibold text-[#141519] whitespace-nowrap"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    현재 GPS 위치
                  </button>
                </form>
              </div>

              <div className="rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#141519]">상단 전광판 · 마트 휴무일 및 세일 이벤트 관리</h3>
                    <p className="text-xs text-zinc-500">메인 화면 최상단에 흘러가는 마트 의무휴무일 및 할인 소식입니다.</p>
                  </div>
                  <button
                    type="button"
                    disabled={isRefreshingMartAi}
                    onClick={handleRefreshMartByAi}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white border border-zinc-300 hover:bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-[#141519] whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMartAi ? 'animate-spin' : ''}`} />
                    AI 최신 마트소식
                  </button>
                </div>

                <form onSubmit={handleAddMartItem} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <select
                    value={newMartCategory}
                    onChange={(e) => setNewMartCategory(e.target.value as '휴무일' | '세일·행사')}
                    className={`${inputCls} bg-white`}
                  >
                    <option value="휴무일">휴무일</option>
                    <option value="세일·행사">세일·행사</option>
                  </select>
                  <input
                    type="text"
                    value={newMartStore}
                    onChange={(e) => setNewMartStore(e.target.value)}
                    placeholder="마트 이름 (예: 이마트 성수점)"
                    className={`${inputCls} bg-white`}
                  />
                  <input
                    type="text"
                    value={newMartContent}
                    onChange={(e) => setNewMartContent(e.target.value)}
                    placeholder="휴무일 또는 세일 내용"
                    className={`sm:col-span-2 ${inputCls} bg-white`}
                  />
                  <button
                    type="submit"
                    className="sm:col-span-4 inline-flex items-center justify-center gap-1 rounded-full bg-[#141519] hover:bg-zinc-800 py-2 text-xs font-semibold text-white"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    전광판 항목 추가
                  </button>
                </form>

                <ul className="space-y-2">
                  {martItems.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white border border-zinc-200 px-3.5 py-2 text-xs"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-bold text-[#141519]">{m.category}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-semibold text-zinc-700">{m.storeName}</span>
                        <span aria-hidden="true"> — </span>
                        <span className="text-zinc-500">{m.content}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUpdateMartItems(martItems.filter((x) => x.id !== m.id))}
                        className="text-zinc-400 hover:text-rose-600 font-medium shrink-0"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
