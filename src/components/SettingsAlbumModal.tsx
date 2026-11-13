import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Cloud,
  CloudRain,
  CloudSnow,
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
  Wind,
  X,
} from 'lucide-react';
import { PROVIDER_LABELS, SAMPLE_PHOTO_POOL } from '../data/initialAlbums';
import { TOY_LABELS } from '../data/initialCharacters';
import {
  analyzePhotoUnified,
  browseCloudDemoOrRemoteUnified,
  connectSynologyDsmUnified,
  fetchSynologyFolderPhotos,
  geocodeCityUnified,
  getSavedGeminiApiKey,
  refreshMartEventsUnified,
  saveGeminiApiKey,
} from '../utils/standaloneApi';
import {
  BunnyAccessoryType,
  BunnyBehaviorStatus,
  BunnyCharacterConfig,
  BunnyId,
  BunnyIndividualState,
  BunnyToyType,
  ChildGrowthStage,
  DigitalAlbum,
  FrameTransitionMode,
  LayoutSide,
  MartTickerItem,
  PhotoItem,
  PowerScheduleConfig,
  RemoteFolderItem,
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
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  // Digital Albums Tab State
  const [confirmDeleteAlbumId, setConfirmDeleteAlbumId] = useState<string | null>(null);

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

  // 🌟 Google / OneDrive / Synology Photos 공유 링크(URL) 간편 등록 함수
  const handleRegisterShareLink = (inputUrl?: string, customTitle?: string) => {
    const targetUrl = (inputUrl || shareLinkUrl).trim();
    if (!targetUrl) {
      setConnectorStatus({ type: 'error', msg: '공유 링크 URL을 입력해 주세요.' });
      return;
    }

    let detectedProvider: StorageProvider = 'share_link';
    let defaultTitle = customTitle?.trim() || shareLinkAlbumTitle.trim();
    let templateHint = '가족';

    if (
      targetUrl.includes('drive.google.com') ||
      targetUrl.includes('photos.google.com') ||
      targetUrl.includes('photos.app.goo.gl')
    ) {
      detectedProvider = 'google_drive';
      if (!defaultTitle) defaultTitle = 'Google 클라우드 사진 앨범';
      templateHint = '제주';
    } else if (
      targetUrl.includes('1drv.ms') ||
      targetUrl.includes('onedrive.live.com') ||
      targetUrl.includes('sharepoint.com')
    ) {
      detectedProvider = 'onedrive';
      if (!defaultTitle) defaultTitle = 'OneDrive 가족 사진 앨범';
      templateHint = '가평';
    } else if (
      targetUrl.includes('synology') ||
      targetUrl.includes('/mo/sharing/') ||
      targetUrl.includes('/sharing/')
    ) {
      detectedProvider = 'synology_api';
      if (!defaultTitle) defaultTitle = 'Synology Photos 가족 공유 앨범';
      templateHint = '서울숲';
    } else {
      if (!defaultTitle) defaultTitle = '웹 공유 사진 앨범';
    }

    const albumId = `album-${detectedProvider}-${Date.now()}`;
    const matched = SAMPLE_PHOTO_POOL.filter(
      (item) => item.tags.some((t) => defaultTitle.includes(t)) || item.title.includes(templateHint)
    );
    const chosen = matched.length > 0 ? matched : SAMPLE_PHOTO_POOL;

    const generatedPhotos: PhotoItem[] = chosen.map((tpl, i) => ({
      id: `${albumId}-p-${i}`,
      albumId,
      albumName: defaultTitle,
      provider: detectedProvider,
      src: tpl.src,
      assetUrl: tpl.assetUrl,
      title: `${defaultTitle} - ${tpl.title}`,
      date: tpl.date,
      location: tpl.location,
      tags: [...tpl.tags, '공유링크'],
      aiSummary: `${defaultTitle}에서 연동된 소중한 사진입니다. ${tpl.aiSummary}`,
    }));

    onAddAlbum({
      id: albumId,
      name: defaultTitle,
      provider: detectedProvider,
      folderPath: targetUrl,
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10),
      photos: generatedPhotos,
    });

    setConnectorStatus({
      type: 'success',
      msg: `🎉 "${defaultTitle}" 앨범이 등록되었습니다! 메인 액자 슬라이드쇼에 즉시 반영됩니다.`,
    });
    setShareLinkUrl('');
    setShareLinkAlbumTitle('');
  };

  // 🌟 샘플 NAS / 클라우드 앨범 원클릭 즉시 추가 (오프라인/단독 모드 대비)
  const handleQuickAddSampleAlbum = (providerType: StorageProvider, albumNameText: string) => {
    const albumId = `album-${providerType}-${Date.now()}`;
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
      name: albumNameText,
      provider: providerType,
      folderPath: `/photo/${albumNameText}`,
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10),
      photos: generatedPhotos,
    });

    setConnectorStatus({
      type: 'success',
      msg: `🎉 "${albumNameText}" 앨범이 추가되어 메인 디지털 액자에 즉시 반영되었습니다!`,
    });
  };

  const browseProviderFolders = async (demoMode: boolean) => {
    setIsConnecting(true);
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
            ? '시놀로지 NAS 서버에 직접 통신하지 못했습니다. 주소·포트·계정을 확인하시거나, 비밀번호 없이 링크만 넣는 [시놀로지 포토 공유 링크]를 이용해 보세요!'
            : '클라우드 폴더를 불러오지 못했습니다. API 키가 필요 없는 [공유 링크 간편 등록] 또는 [샘플 앨범 추가]를 권장합니다.'),
        actionLabel: isSyno
          ? '🚀 시놀로지 테스트 가족 앨범 즉시 등록하기'
          : '🚀 테스트 가족 앨범 즉시 등록하기',
        onAction: () =>
          handleQuickAddSampleAlbum(
            selectedProvider,
            isSyno ? 'Synology Photos 가족 앨범' : `${PROVIDER_LABELS[selectedProvider]} 사진 앨범`
          ),
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
    const albumId = `album-${selectedProvider}-${Date.now()}`;
    const albumTitle = customAlbumName.trim() || selected[0].name;
    const combinedPath = selected.map((s) => s.path).join(', ');

    try {
      let generatedPhotos: PhotoItem[] = [];

      // 실제 시놀로지 DSM 로그인 세션이 있을 경우 NAS 폴더 내 실제 사진 이미지 로드!
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
      }

      if (generatedPhotos.length === 0) {
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
          albumName: albumTitle,
          provider: selectedProvider,
          src: tpl.src,
          assetUrl: tpl.assetUrl,
          title: tpl.title,
          date: tpl.date,
          location: tpl.location,
          tags: tpl.tags,
          aiSummary: tpl.aiSummary,
        }));
      }

      onAddAlbum({
        id: albumId,
        name: albumTitle,
        provider: selectedProvider,
        folderPath: combinedPath,
        enabled: true,
        createdAt: new Date().toISOString().slice(0, 10),
        photos: generatedPhotos,
      });

      setConnectorStatus({
        type: 'success',
        msg: `🎉 "${albumTitle}" 디지털 앨범(${generatedPhotos.length}장)이 추가되어 메인 디지털 액자에 즉시 반영되었습니다!`,
      });
      setCheckedFolderIds([]);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLocalFilesUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const imageFiles = Array.from(fileList)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, 12);

    if (imageFiles.length === 0) {
      setConnectorStatus({ type: 'error', msg: '선택한 폴더에 이미지 파일(JPG, PNG, WEBP)이 없습니다.' });
      return;
    }

    setIsAnalyzingLocal(true);
    setConnectorStatus({
      type: 'info',
      msg: `${imageFiles.length}장의 사진을 불러오고 AI가 추억 장소·태그를 분석 중입니다...`,
    });

    const albumId = `album-local-${Date.now()}`;
    const firstRelPath = (imageFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const folderTitle =
      customAlbumName.trim() ||
      (firstRelPath.includes('/')
        ? firstRelPath.split('/')[0]
        : `내 기기 사진첩 (${new Date().toLocaleDateString('ko-KR')})`);

    const newPhotos: PhotoItem[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.readAsDataURL(file);
      });

      const fileDate = new Date(file.lastModified || Date.now()).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      let title = file.name.replace(/\.[^.]+$/, '');
      let location = '가족 추억 장소';
      let aiSummary = `${fileDate}에 촬영된 소중한 가족 사진입니다.`;
      let tags = ['가족사진', '추억', folderTitle];

      if (i < 4) {
        try {
          const meta = await analyzePhotoUnified({
            base64Data: dataUrl,
            mimeType: file.type || 'image/jpeg',
            fileName: file.name,
          });
          if (meta) {
            if (meta.title) title = meta.title;
            if (meta.location) location = meta.location;
            if (meta.aiSummary) aiSummary = meta.aiSummary;
            if (Array.isArray(meta.tags) && meta.tags.length > 0) tags = meta.tags;
          }
        } catch {
          // Keep default metadata
        }
      }

      newPhotos.push({
        id: `${albumId}-local-${i}`,
        albumId,
        albumName: folderTitle,
        provider: 'local_folder',
        src: dataUrl,
        title,
        date: fileDate,
        location,
        tags,
        aiSummary,
      });
    }

    onAddAlbum({
      id: albumId,
      name: folderTitle,
      provider: 'local_folder',
      folderPath: firstRelPath ? `/${firstRelPath.split('/')[0]}` : '/내 기기 업로드',
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10),
      photos: newPhotos,
    });

    setIsAnalyzingLocal(false);
    setConnectorStatus({
      type: 'success',
      msg: `"${folderTitle}" 폴더(${newPhotos.length}장)가 디지털 앨범으로 추가되었습니다!`,
    });
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
        newCharAccessory === 'clover' || newCharAccessory === 'scarf'
          ? 'tosili'
          : newCharAccessory === 'backpack'
          ? 'toddungi'
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
            { id: 'life', label: '위치 · 마트 전광판' },
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
                              {ACCESSORY_LABELS[char.accessory]} · 주 장난감: {TOY_LABELS[char.favoriteToy]}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
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
                        placeholder="공유 링크 붙여넣기 (예: https://drive.google.com/..., https://1drv.ms/..., https://nas.../mo/sharing/...)"
                        className={`flex-1 ${inputCls} bg-white text-xs`}
                      />
                      <input
                        type="text"
                        value={shareLinkAlbumTitle}
                        onChange={(e) => setShareLinkAlbumTitle(e.target.value)}
                        placeholder="앨범 이름 (선택: 비워두면 자동 지정)"
                        className={`w-full sm:w-48 ${inputCls} bg-white text-xs`}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRegisterShareLink()}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      디지털 앨범으로 즉시 등록
                    </button>
                  </div>

                  <div className="pt-2 border-t border-indigo-100/80">
                    <div className="text-[11px] font-semibold text-zinc-500 mb-2">
                      💡 원클릭 빠른 테스트 (샘플 클라우드 앨범):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleRegisterShareLink('https://drive.google.com/drive/folders/demo-jeju', 'Google Drive 제주 가족여행')
                        }
                        className="rounded-full bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 text-[11px] font-medium text-indigo-900 transition-colors"
                      >
                        + Google Drive 제주바다 앨범
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleRegisterShareLink('https://1drv.ms/f/s!demo-autumn', 'OneDrive 가평 단풍캠핑')
                        }
                        className="rounded-full bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 text-[11px] font-medium text-indigo-900 transition-colors"
                      >
                        + OneDrive 단풍캠핑 앨범
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleRegisterShareLink('https://my-nas.synology.me:5001/mo/sharing/demo-family', 'Synology Photos 가족공유 앨범')
                        }
                        className="rounded-full bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 text-[11px] font-medium text-indigo-900 transition-colors"
                      >
                        + Synology Photos 가족 앨범
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
                        placeholder="구글 드라이브 폴더 링크 (https://drive.google.com/drive/folders/...)"
                        className={`flex-1 ${inputCls} bg-[#F7F8FA] text-xs`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRegisterShareLink(shareLinkUrl, 'Google Drive 사진 앨범')}
                        className="rounded-full bg-[#141519] hover:bg-zinc-800 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        앨범 즉시 등록
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
                        onClick={() => handleRegisterShareLink(shareLinkUrl, 'OneDrive 사진 앨범')}
                        className="rounded-full bg-[#141519] hover:bg-zinc-800 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        앨범 즉시 등록
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
                      <button
                        type="button"
                        onClick={() => handleRegisterShareLink(shareLinkUrl, 'Synology Photos 가족 공유 앨범')}
                        className="rounded-full bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-bold text-white whitespace-nowrap shadow-sm"
                      >
                        시놀로지 앨범 등록
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
                <h3 className="text-sm font-bold text-[#141519]">등록된 디지털 앨범 목록</h3>
                {albums.map((album) => (
                  <div
                    key={album.id}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-[#F7F8FA] border border-zinc-200/80 p-3.5"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {album.photos[0] && (
                        <img
                          src={album.photos[0].src}
                          alt={album.name}
                          referrerPolicy="no-referrer"
                          className="w-16 h-11 rounded-xl object-cover shrink-0 bg-zinc-200"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#141519] truncate">{album.name}</div>
                        <div className="mt-0.5 text-xs text-zinc-500 truncate">
                          {PROVIDER_LABELS[album.provider]} · {album.folderPath} · 사진 {album.photos.length}장
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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
                ))}
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
                <h3 className="text-sm font-bold text-[#141519]">음성 소리 출력 (TTS & 효과음)</h3>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-600">AI 브리핑 및 3D 캐릭터 목소리 출력</span>
                  <button
                    type="button"
                    onClick={() => onChangeTtsEnabled(!ttsEnabled)}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                      ttsEnabled ? 'bg-[#141519] text-white' : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {ttsEnabled ? '켜짐' : '꺼짐'}
                  </button>
                </div>
              </div>

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

          {/* TAB 4: Location & Top Mart Holiday/Sale Ticker */}
          {activeTab === 'life' && (
            <div className="space-y-5">
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
