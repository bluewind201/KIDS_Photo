package com.bluewind.kidsphoto;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Checks GitHub Releases (`bluewind201/KIDS_Photo`) for newly uploaded `KIDS_Photo.apk` files,
 * verifies file existence + byte size + SHA-256 hash + APK ZIP header, and installs updates
 * via Android `PackageInstaller` (with automatic Android 8+ install-source permission resume).
 */
public final class AppUpdater {
    public static final String REPO = "bluewind201/KIDS_Photo";
    public static final String APK_ASSET_NAME = "KIDS_Photo.apk";
    private static final String PREFS_NAME = "kidsphoto_updater_prefs";
    private static final String KEY_AUTO_UPDATE = "auto_update_enabled";
    private static final String KEY_LAST_STATUS = "last_update_status";

    private static volatile File pendingInstallApkFile = null;
    private static volatile boolean isDownloading = false;

    public interface StatusCallback {
        void onEvent(JSONObject eventJson);
    }

    private AppUpdater() {}

    public static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static boolean isAutoUpdateEnabled(Context ctx) {
        return prefs(ctx).getBoolean(KEY_AUTO_UPDATE, true);
    }

    public static void setAutoUpdateEnabled(Context ctx, boolean enabled) {
        prefs(ctx).edit().putBoolean(KEY_AUTO_UPDATE, enabled).apply();
    }

    public static void setLastStatus(Context ctx, String message) {
        prefs(ctx).edit().putString(KEY_LAST_STATUS, message != null ? message : "").apply();
    }

    public static String getLastStatus(Context ctx) {
        return prefs(ctx).getString(KEY_LAST_STATUS, "");
    }

    public static long getCurrentVersionCode(Context ctx) {
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return pi.getLongVersionCode();
            }
            //noinspection deprecation
            return pi.versionCode;
        } catch (Exception e) {
            return 0L;
        }
    }

    public static String getCurrentVersionName(Context ctx) {
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return pi.versionName != null ? pi.versionName : "1.1.0";
        } catch (Exception e) {
            return "1.1.0";
        }
    }

    public static boolean canInstallPackages(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return ctx.getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }

    public static JSONObject getVersionInfoJson(Context ctx) {
        JSONObject obj = new JSONObject();
        try {
            obj.put("ok", true);
            obj.put("versionCode", getCurrentVersionCode(ctx));
            obj.put("versionName", getCurrentVersionName(ctx));
            obj.put("autoUpdateEnabled", isAutoUpdateEnabled(ctx));
            obj.put("canInstallPackages", canInstallPackages(ctx));
            obj.put("isDownloading", isDownloading);
            obj.put("lastStatus", getLastStatus(ctx));
        } catch (Exception ignored) {}
        return obj;
    }

    private static long parseVersionCodeFromText(String text) {
        if (text == null || text.isEmpty()) return -1L;
        // 1) Explicit "versionCode 217" or "versionCode: 217"
        Matcher mVc = Pattern.compile("versionCode\\s*[:=]?\\s*(\\d+)", Pattern.CASE_INSENSITIVE).matcher(text);
        if (mVc.find()) {
            try {
                return Long.parseLong(mVc.group(1));
            } catch (Exception ignored) {}
        }
        // 2) Semantic "v1.1.217" or "1.1.217"
        Matcher mVer = Pattern.compile("v?1\\.\\d+\\.(\\d+)").matcher(text);
        if (mVer.find()) {
            try {
                return Long.parseLong(mVer.group(1));
            } catch (Exception ignored) {}
        }
        return -1L;
    }

    private static String parseVersionNameFromText(String text, long fallbackVc) {
        if (text != null) {
            Matcher mVer = Pattern.compile("v?(1\\.\\d+\\.\\d+)").matcher(text);
            if (mVer.find()) {
                return mVer.group(1);
            }
        }
        return fallbackVc > 0 ? ("1.1." + fallbackVc) : "";
    }

    private static String parseSha256FromNotes(String notes) {
        if (notes == null || notes.isEmpty()) return "";
        Matcher m = Pattern.compile("([a-fA-F0-9]{64})").matcher(notes);
        if (m.find()) {
            return m.group(1).toLowerCase();
        }
        return "";
    }

    private static String httpGetText(String urlStr, int timeoutMs) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/vnd.github+json, application/json, */*");
        conn.setRequestProperty("User-Agent", "KIDS_Photo-AutoUpdater");
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        try {
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new Exception("HTTP " + code);
            }
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    bos.write(buf, 0, n);
                }
                return new String(bos.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            conn.disconnect();
        }
    }

    /**
     * Verifies that the remote APK file actually exists on GitHub Releases and is reachable.
     */
    private static long verifyRemoteApkFileExists(String downloadUrl) {
        if (downloadUrl == null || !downloadUrl.startsWith("https://")) return -1L;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(downloadUrl).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Range", "bytes=0-3");
            conn.setRequestProperty("User-Agent", "KIDS_Photo-AutoUpdater");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            int code = conn.getResponseCode();
            if (code == 200 || code == 206) {
                // Verify PK\x03\x04 APK ZIP signature in first 4 bytes!
                try (InputStream in = conn.getInputStream()) {
                    byte[] magic = new byte[4];
                    int r = in.read(magic);
                    if (r == 4 && magic[0] == 0x50 && magic[1] == 0x4B) {
                        String contentRange = conn.getHeaderField("Content-Range");
                        if (contentRange != null && contentRange.contains("/")) {
                            String totalStr = contentRange.substring(contentRange.lastIndexOf('/') + 1).trim();
                            try {
                                return Long.parseLong(totalStr);
                            } catch (Exception ignored) {}
                        }
                        return Math.max(conn.getContentLengthLong(), 1L);
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return -1L;
    }

    private static JSONObject parseGitHubReleaseObject(JSONObject rel) {
        if (rel == null) return null;
        JSONArray assets = rel.optJSONArray("assets");
        if (assets == null) return null;

        JSONObject apkAsset = null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject a = assets.optJSONObject(i);
            if (a != null && APK_ASSET_NAME.equalsIgnoreCase(a.optString("name"))) {
                long sz = a.optLong("size", 0L);
                if (sz > 1_000_000L) {
                    apkAsset = a;
                    break;
                }
            }
        }
        if (apkAsset == null) return null;

        String tag = rel.optString("tag_name", "");
        String title = rel.optString("name", "");
        String body = rel.optString("body", "");
        long vc = parseVersionCodeFromText(tag);
        if (vc <= 0) vc = parseVersionCodeFromText(title);
        if (vc <= 0) vc = parseVersionCodeFromText(body);
        if (vc <= 0) return null;

        String verName = parseVersionNameFromText(tag + " " + title + " " + body, vc);
        String dlUrl = apkAsset.optString("browser_download_url", "");
        long size = apkAsset.optLong("size", 0L);
        String sha256 = parseSha256FromNotes(body);
        String publishedAt = apkAsset.optString("updated_at", rel.optString("published_at", ""));

        try {
            JSONObject candidate = new JSONObject();
            candidate.put("versionCode", vc);
            candidate.put("versionName", verName);
            candidate.put("tag", tag);
            candidate.put("downloadUrl", dlUrl);
            candidate.put("size", size);
            candidate.put("sha256", sha256);
            candidate.put("publishedAt", publishedAt);
            candidate.put("notes", body);
            candidate.put("assetVerified", true);
            return candidate;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Checks both `latest.json` (0 rate-limit) and GitHub Releases API (`releases/latest` + `releases/tags/latest-apk`),
     * verifies the `KIDS_Photo.apk` file exists on GitHub, and returns update info JSON.
     */
    public static JSONObject checkForUpdate(Context ctx) {
        long currentVc = getCurrentVersionCode(ctx);
        String currentName = getCurrentVersionName(ctx);
        JSONObject bestCandidate = null;
        long bestVc = -1L;
        String lastErr = "";

        // 1) Fast unlimited check via `latest.json` uploaded alongside `latest-apk`
        try {
            String latestJsonUrl =
                "https://github.com/" + REPO + "/releases/download/latest-apk/latest.json?t=" + System.currentTimeMillis();
            String raw = httpGetText(latestJsonUrl, 8000);
            JSONObject meta = new JSONObject(raw);
            long vc = meta.optLong("versionCode", -1L);
            String dlUrl = meta.optString("downloadUrl", "");
            if (vc > 0 && !dlUrl.isEmpty()) {
                long verifiedBytes = verifyRemoteApkFileExists(dlUrl);
                if (verifiedBytes > 0) {
                    JSONObject c = new JSONObject();
                    c.put("versionCode", vc);
                    c.put("versionName", meta.optString("versionName", "1.1." + vc));
                    c.put("tag", meta.optString("tag", "v1.1." + vc));
                    c.put("downloadUrl", dlUrl);
                    c.put("size", meta.optLong("size", verifiedBytes > 1 ? verifiedBytes : 0L));
                    c.put("sha256", meta.optString("sha256", "").toLowerCase());
                    c.put("publishedAt", meta.optString("publishedAt", ""));
                    c.put("notes", meta.optString("notes", ""));
                    c.put("assetVerified", true);
                    bestCandidate = c;
                    bestVc = vc;
                }
            }
        } catch (Exception e) {
            lastErr = e.getMessage() != null ? e.getMessage() : "latest.json 조회 실패";
        }

        // 2) Cross-check GitHub Releases API (`releases/latest` and `releases/tags/latest-apk`)
        String[] apiEndpoints = new String[] {
            "https://api.github.com/repos/" + REPO + "/releases/latest",
            "https://api.github.com/repos/" + REPO + "/releases/tags/latest-apk"
        };
        for (String apiUrl : apiEndpoints) {
            try {
                String raw = httpGetText(apiUrl, 8000);
                JSONObject parsed = parseGitHubReleaseObject(new JSONObject(raw));
                if (parsed != null) {
                    long vc = parsed.optLong("versionCode", -1L);
                    if (vc > bestVc) {
                        long verifiedBytes = verifyRemoteApkFileExists(parsed.optString("downloadUrl", ""));
                        if (verifiedBytes > 0) {
                            bestCandidate = parsed;
                            bestVc = vc;
                        }
                    }
                }
            } catch (Exception e) {
                if (lastErr.isEmpty() && e.getMessage() != null) {
                    lastErr = e.getMessage();
                }
            }
        }

        JSONObject result = new JSONObject();
        try {
            result.put("currentVersionCode", currentVc);
            result.put("currentVersionName", currentName);
            if (bestCandidate == null) {
                result.put("ok", false);
                result.put("hasUpdate", false);
                result.put("message", "GitHub 릴리스 확인 중 오류가 발생했습니다 (" + lastErr + ")");
                return result;
            }

            boolean hasUpdate = bestVc > currentVc;
            result.put("ok", true);
            result.put("hasUpdate", hasUpdate);
            result.put("latestVersionCode", bestVc);
            result.put("latestVersionName", bestCandidate.optString("versionName", "1.1." + bestVc));
            result.put("downloadUrl", bestCandidate.optString("downloadUrl", ""));
            result.put("size", bestCandidate.optLong("size", 0L));
            result.put("sha256", bestCandidate.optString("sha256", ""));
            result.put("publishedAt", bestCandidate.optString("publishedAt", ""));
            result.put("notes", bestCandidate.optString("notes", ""));
            result.put("assetVerified", true);
            result.put(
                "message",
                hasUpdate
                    ? ("새 버전 v" + bestCandidate.optString("versionName") + " 파일이 GitHub에 등록되어 있습니다!")
                    : ("현재 최신 버전(v" + currentName + ")을 사용 중입니다.")
            );
        } catch (Exception ignored) {}
        return result;
    }

    private static String computeSha256Hex(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                md.update(buf, 0, n);
            }
        }
        byte[] digest = md.digest();
        StringBuilder sb = new StringBuilder(digest.length * 2);
        for (byte b : digest) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }

    private static void emitStatus(StatusCallback cb, String phase, int percent, String message) {
        if (cb == null) return;
        try {
            JSONObject ev = new JSONObject();
            ev.put("phase", phase);
            ev.put("percent", percent);
            ev.put("message", message);
            cb.onEvent(ev);
        } catch (Exception ignored) {}
    }

    /**
     * Downloads the verified APK from GitHub Releases, validates file integrity & SHA-256,
     * and launches Android installation.
     */
    public static void downloadAndInstall(
        Context ctx,
        String downloadUrl,
        long expectedSize,
        String expectedSha256,
        String versionLabel,
        StatusCallback cb
    ) {
        if (isDownloading) {
            emitStatus(cb, "downloading", 0, "이미 업데이트 파일을 내려받는 중입니다...");
            return;
        }
        isDownloading = true;
        try {
            String safeVer = (versionLabel != null && !versionLabel.isEmpty())
                ? versionLabel.replaceAll("[^0-9a-zA-Z._-]", "")
                : String.valueOf(System.currentTimeMillis());

            File dir = new File(ctx.getCacheDir(), "updates");
            if (!dir.exists() && !dir.mkdirs()) {
                throw new Exception("업데이트 임시 저장소를 생성할 수 없습니다.");
            }

            File targetApk = new File(dir, "KIDS_Photo-" + safeVer + ".apk");
            // Clean up older downloaded APKs
            File[] existing = dir.listFiles();
            if (existing != null) {
                for (File f : existing) {
                    if (!f.getName().equals(targetApk.getName())) {
                        //noinspection ResultOfMethodCallIgnored
                        f.delete();
                    }
                }
            }

            boolean reuseExisting = false;
            if (targetApk.isFile() && targetApk.length() > 1_000_000L) {
                if (expectedSha256 != null && expectedSha256.length() == 64) {
                    reuseExisting = expectedSha256.equalsIgnoreCase(computeSha256Hex(targetApk));
                } else if (expectedSize > 0 && targetApk.length() == expectedSize) {
                    reuseExisting = true;
                }
            }

            if (!reuseExisting) {
                emitStatus(cb, "downloading", 1, "GitHub에서 새 버전(" + safeVer + ") 다운로드 시작...");
                setLastStatus(ctx, "새 버전 " + safeVer + " 내려받는 중...");

                File partFile = new File(dir, "KIDS_Photo-" + safeVer + ".part");
                HttpURLConnection conn = (HttpURLConnection) new URL(downloadUrl).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "KIDS_Photo-AutoUpdater");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);

                try {
                    int code = conn.getResponseCode();
                    if (code != 200) {
                        throw new Exception("다운로드 응답 오류 (HTTP " + code + ")");
                    }
                    long totalBytes = expectedSize > 0 ? expectedSize : conn.getContentLengthLong();
                    long downloaded = 0L;
                    long lastEmitAt = 0L;

                    try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(partFile)) {
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            downloaded += n;
                            long now = System.currentTimeMillis();
                            if (now - lastEmitAt >= 220) {
                                lastEmitAt = now;
                                int pct = totalBytes > 0
                                    ? (int) Math.min(98L, (downloaded * 100L) / totalBytes)
                                    : 50;
                                String mbDone = String.format("%.1f", downloaded / 1048576.0);
                                String mbTotal = totalBytes > 0 ? String.format("%.1f", totalBytes / 1048576.0) : "?";
                                emitStatus(
                                    cb,
                                    "downloading",
                                    pct,
                                    "업데이트 다운로드 중... " + pct + "% (" + mbDone + " / " + mbTotal + " MB)"
                                );
                            }
                        }
                    }
                } finally {
                    conn.disconnect();
                }

                // Verify APK magic header & size & SHA-256
                emitStatus(cb, "verifying", 99, "다운로드한 APK 무결성 및 서명 해시 검증 중...");
                if (partFile.length() < 1_000_000L) {
                    //noinspection ResultOfMethodCallIgnored
                    partFile.delete();
                    throw new Exception("다운로드된 파일 크기가 비정상입니다.");
                }
                if (expectedSize > 0 && partFile.length() != expectedSize) {
                    //noinspection ResultOfMethodCallIgnored
                    partFile.delete();
                    throw new Exception("파일 크기 불일치 (" + partFile.length() + " != " + expectedSize + ")");
                }
                try (InputStream checkIn = new FileInputStream(partFile)) {
                    byte[] magic = new byte[4];
                    if (checkIn.read(magic) != 4 || magic[0] != 0x50 || magic[1] != 0x4B) {
                        //noinspection ResultOfMethodCallIgnored
                        partFile.delete();
                        throw new Exception("유효한 Android APK 패키지가 아닙니다.");
                    }
                }
                if (expectedSha256 != null && expectedSha256.length() == 64) {
                    String actualSha = computeSha256Hex(partFile);
                    if (!expectedSha256.equalsIgnoreCase(actualSha)) {
                        //noinspection ResultOfMethodCallIgnored
                        partFile.delete();
                        throw new Exception("SHA-256 무결성 검증 실패");
                    }
                }

                if (targetApk.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    targetApk.delete();
                }
                if (!partFile.renameTo(targetApk)) {
                    throw new Exception("다운로드 완료 파일을 저장할 수 없습니다.");
                }
            }

            // Check Android 8+ Unknown App Sources install permission
            if (!canInstallPackages(ctx)) {
                pendingInstallApkFile = targetApk;
                setLastStatus(ctx, "'이 출처의 앱 허용' 권한을 켜주시면 즉시 업데이트가 설치됩니다.");
                emitStatus(
                    cb,
                    "need_permission",
                    100,
                    "다운로드 완료! 화면에 열리는 '이 출처의 앱 허용' 스위치를 켜주시면 자동 설치됩니다."
                );
                openUnknownSourcesSettings(ctx);
                return;
            }

            pendingInstallApkFile = null;
            emitStatus(cb, "installing", 100, "업데이트 검증 완료! 설치 화면을 실행합니다...");
            setLastStatus(ctx, "업데이트 설치 진행 중...");
            installVerifiedApk(ctx, targetApk);
        } catch (Exception e) {
            String errMsg = e.getMessage() != null ? e.getMessage() : "알 수 없는 오류";
            setLastStatus(ctx, "업데이트 실패: " + errMsg);
            emitStatus(cb, "error", 0, "업데이트 실패: " + errMsg);
        } finally {
            isDownloading = false;
        }
    }

    public static void openUnknownSourcesSettings(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent permIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + ctx.getPackageName())
                );
                permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(permIntent);
            } catch (Exception ignored) {}
        }
    }

    /**
     * Called from `MainActivity.onResume()` so if the user just enabled "Allow from this source",
     * the already-downloaded APK installs immediately without re-downloading!
     */
    public static void tryResumePendingInstall(Context ctx, StatusCallback cb) {
        File f = pendingInstallApkFile;
        if (f != null && f.isFile() && canInstallPackages(ctx)) {
            pendingInstallApkFile = null;
            try {
                emitStatus(cb, "installing", 100, "권한 확인 완료! 다운로드된 새 버전을 바로 설치합니다...");
                installVerifiedApk(ctx, f);
            } catch (Exception e) {
                emitStatus(cb, "error", 0, "설치 실행 실패: " + e.getMessage());
            }
        }
    }

    public static void installVerifiedApk(Context ctx, File apkFile) throws Exception {
        try {
            PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL
            );
            params.setAppPackageName(ctx.getPackageName());
            params.setSize(apkFile.length());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            }
            int sessionId = pi.createSession(params);
            try (PackageInstaller.Session session = pi.openSession(sessionId)) {
                try (
                    InputStream in = new FileInputStream(apkFile);
                    OutputStream out = session.openWrite("base.apk", 0, apkFile.length())
                ) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                    }
                    session.fsync(out);
                }
                Intent callbackIntent = new Intent(ctx, UpdateReceiver.class);
                callbackIntent.setPackage(ctx.getPackageName());
                callbackIntent.putExtra("apk_path", apkFile.getAbsolutePath());
                int flags = PendingIntent.FLAG_UPDATE_CURRENT |
                    (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent piCallback = PendingIntent.getBroadcast(ctx, sessionId, callbackIntent, flags);
                session.commit(piCallback.getIntentSender());
                return;
            }
        } catch (Exception sessionErr) {
            // Fallback to standard FileProvider ACTION_VIEW installer intent
            launchFallbackFileProviderInstall(ctx, apkFile);
        }
    }

    public static void launchFallbackFileProviderInstall(Context ctx, File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(
                ctx,
                ctx.getPackageName() + ".fileprovider",
                apkFile
            );
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(installIntent);
        } catch (Exception e) {
            Toast.makeText(ctx, "설치 화면 실행 실패: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
}
