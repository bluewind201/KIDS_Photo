export interface AppVersionInfo {
  ok: boolean;
  versionCode: number;
  versionName: string;
  autoUpdateEnabled: boolean;
  canInstallPackages: boolean;
  isDownloading: boolean;
  lastStatus: string;
}

export interface UpdateCheckResult {
  phase?: 'check_result' | 'downloading' | 'verifying' | 'installing' | 'need_permission' | 'error';
  ok?: boolean;
  hasUpdate?: boolean;
  currentVersionCode?: number;
  currentVersionName?: string;
  latestVersionCode?: number;
  latestVersionName?: string;
  downloadUrl?: string;
  size?: number;
  sha256?: string;
  publishedAt?: string;
  notes?: string;
  assetVerified?: boolean;
  percent?: number;
  message?: string;
}

export interface AndroidUpdaterBridgeInterface {
  isAvailable: () => boolean;
  getVersionInfo: () => string;
  setAutoUpdateEnabled: (enabled: boolean) => void;
  isAutoUpdateEnabled: () => boolean;
  checkForUpdateAsync: () => void;
  downloadAndInstallAsync: (
    downloadUrl: string,
    expectedSize: number,
    expectedSha256: string,
    versionLabel: string
  ) => void;
  openInstallPermissionSettings: () => void;
}

declare global {
  interface Window {
    AndroidUpdaterBridge?: AndroidUpdaterBridgeInterface;
  }
}

const WEB_AUTO_UPDATE_KEY = 'kids_photo_auto_update_enabled_v1';

export function getNativeUpdaterBridge(): AndroidUpdaterBridgeInterface | null {
  if (typeof window === 'undefined') return null;
  if (window.AndroidUpdaterBridge && typeof window.AndroidUpdaterBridge.getVersionInfo === 'function') {
    return window.AndroidUpdaterBridge;
  }
  return null;
}

export function getInstalledAppVersionInfo(): AppVersionInfo {
  const bridge = getNativeUpdaterBridge();
  if (bridge) {
    try {
      const parsed = JSON.parse(bridge.getVersionInfo()) as Partial<AppVersionInfo>;
      return {
        ok: true,
        versionCode: parsed.versionCode ?? 216,
        versionName: parsed.versionName || '1.1.216',
        autoUpdateEnabled: parsed.autoUpdateEnabled ?? true,
        canInstallPackages: parsed.canInstallPackages ?? true,
        isDownloading: parsed.isDownloading ?? false,
        lastStatus: parsed.lastStatus ?? '',
      };
    } catch {
      // Fallback below
    }
  }
  let webAuto = true;
  try {
    const saved = localStorage.getItem(WEB_AUTO_UPDATE_KEY);
    if (saved !== null) webAuto = saved === '1';
  } catch {
    // Ignore
  }
  return {
    ok: false,
    versionCode: 216,
    versionName: '1.1.216 (Web)',
    autoUpdateEnabled: webAuto,
    canInstallPackages: false,
    isDownloading: false,
    lastStatus: '',
  };
}

export function setAutoUpdatePreference(enabled: boolean): void {
  const bridge = getNativeUpdaterBridge();
  if (bridge) {
    try {
      bridge.setAutoUpdateEnabled(enabled);
    } catch {
      // Ignore
    }
  }
  try {
    localStorage.setItem(WEB_AUTO_UPDATE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore
  }
}

/**
 * Triggers a GitHub Release check (`latest.json` + GitHub Releases API `assets` verification).
 * On Android APK, runs natively on `updaterExecutor` and dispatches `nativeUpdaterEvent`.
 * On Web, queries GitHub Releases API directly and dispatches `nativeUpdaterEvent` for unified UI handling.
 */
export async function triggerGitHubUpdateCheck(): Promise<void> {
  const bridge = getNativeUpdaterBridge();
  if (bridge) {
    bridge.checkForUpdateAsync();
    return;
  }

  // Web preview fallback
  try {
    const res = await fetch('https://api.github.com/repos/bluewind201/KIDS_Photo/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      published_at?: string;
      assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
    };
    const apk = (json.assets || []).find((a) => a.name === 'KIDS_Photo.apk' && (a.size || 0) > 1_000_000);
    const m = `${json.tag_name || ''} ${json.name || ''}`.match(/v?1\.\d+\.(\d+)/);
    const latestVc = m ? Number(m[1]) : 0;
    const info = getInstalledAppVersionInfo();
    const hasUpdate = Boolean(apk && latestVc > info.versionCode);
    const detail: UpdateCheckResult = {
      phase: 'check_result',
      ok: Boolean(apk),
      hasUpdate,
      currentVersionCode: info.versionCode,
      currentVersionName: info.versionName,
      latestVersionCode: latestVc,
      latestVersionName: `1.1.${latestVc}`,
      downloadUrl: apk?.browser_download_url || 'https://github.com/bluewind201/KIDS_Photo/releases/tag/latest-apk',
      size: apk?.size || 0,
      publishedAt: json.published_at || '',
      notes: json.body || '',
      assetVerified: Boolean(apk),
      message: apk
        ? hasUpdate
          ? `새 버전 v1.1.${latestVc} 파일이 GitHub에 등록되어 있습니다!`
          : `현재 최신 버전(v1.1.${latestVc})입니다.`
        : 'GitHub 릴리스에 APK 파일이 아직 없습니다.',
    };
    window.dispatchEvent(new CustomEvent('nativeUpdaterEvent', { detail }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    window.dispatchEvent(
      new CustomEvent('nativeUpdaterEvent', {
        detail: {
          phase: 'check_result',
          ok: false,
          hasUpdate: false,
          message: `GitHub 확인 실패 (${msg})`,
        } satisfies UpdateCheckResult,
      })
    );
  }
}

export function triggerDownloadAndInstallUpdate(update: {
  downloadUrl: string;
  size?: number;
  sha256?: string;
  versionName?: string;
}): void {
  const bridge = getNativeUpdaterBridge();
  if (bridge) {
    bridge.downloadAndInstallAsync(
      update.downloadUrl,
      update.size || 0,
      update.sha256 || '',
      update.versionName || ''
    );
    return;
  }
  window.open(
    update.downloadUrl || 'https://github.com/bluewind201/KIDS_Photo/releases/tag/latest-apk',
    '_blank',
    'noopener,noreferrer'
  );
}
