package com.bluewind.kidsphoto;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Streams high-resolution cloud/NAS photos (even 20MB~40MB DSLR/iPhone JPEG/PNG/WebP/HEIC)
 * directly to a temp file in Java, subsamples via Skia BitmapFactory (inSampleSize),
 * applies EXIF orientation, and outputs:
 *  1) Compact Display WebP (~110KB - 180KB at 1440px)
 *  2) Ultra-fast AI Vision JPEG Thumbnail (~12KB at 384px)
 * Eliminates CapacitorHttp Base64 IPC OOM/timeouts on large photos!
 */
public final class NativePhotoOptimizer {
    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    private static final Map<String, Long> SYNO_SHARE_AUTH_CACHE = new ConcurrentHashMap<>();
    private static final Map<String, String> SYNO_SHARING_SID_CACHE = new ConcurrentHashMap<>();

    private NativePhotoOptimizer() {}

    public static JSONObject fetchAndOptimize(
        Context context,
        String candidateUrlsJson,
        String headersJson,
        String sharePassword,
        int maxDisplayDim,
        int displayQuality,
        int aiThumbDim
    ) {
        JSONObject result = new JSONObject();
        try {
            JSONArray urlsArr = new JSONArray(candidateUrlsJson != null ? candidateUrlsJson : "[]");
            JSONObject customHeaders =
                (headersJson != null && !headersJson.trim().isEmpty())
                    ? new JSONObject(headersJson)
                    : new JSONObject();

            int safeMaxDim = Math.max(640, Math.min(2048, maxDisplayDim > 0 ? maxDisplayDim : 1440));
            int safeQuality = Math.max(55, Math.min(92, displayQuality > 0 ? displayQuality : 80));
            int safeThumbDim = Math.max(256, Math.min(640, aiThumbDim > 0 ? aiThumbDim : 384));

            for (int i = 0; i < urlsArr.length(); i++) {
                String rawUrl = urlsArr.optString(i, "").trim();
                if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
                    continue;
                }

                boolean isSynoShare =
                    rawUrl.toLowerCase(Locale.ROOT).contains("/webapi/entry.cgi") &&
                    (rawUrl.contains("passphrase=") ||
                        rawUrl.contains("sharing_id=") ||
                        customHeaders.has("X-SYNO-SHARING"));

                int attempts = isSynoShare ? 2 : 1;
                for (int attempt = 0; attempt < attempts; attempt++) {
                    File tempFile = null;
                    try {
                        String effectiveUrl = rawUrl;
                        if (isSynoShare) {
                            effectiveUrl = ensureSynologyShareSession(
                                rawUrl,
                                customHeaders,
                                sharePassword,
                                attempt > 0
                            );
                        }

                        tempFile = downloadStreamToTempFile(context, effectiveUrl, customHeaders);
                        if (tempFile == null || tempFile.length() < 128) {
                            continue;
                        }

                        if (looksLikeTextErrorPayload(tempFile)) {
                            continue;
                        }

                        JSONObject encoded = decodeResizeAndCompress(
                            tempFile,
                            safeMaxDim,
                            safeQuality,
                            safeThumbDim
                        );
                        if (encoded != null) {
                            return encoded;
                        }
                    } catch (Exception ignored) {
                        // Try retry or next candidate URL
                    } finally {
                        if (tempFile != null && tempFile.exists()) {
                            //noinspection ResultOfMethodCallIgnored
                            tempFile.delete();
                        }
                    }
                }
            }

            result.put("ok", false);
            result.put("error", "all-candidates-failed");
        } catch (Exception e) {
            try {
                result.put("ok", false);
                result.put("error", e.getMessage() != null ? e.getMessage() : "exception");
            } catch (Exception ignored) {}
        }
        return result;
    }

    private static String ensureSynologyShareSession(
        String rawImgUrl,
        JSONObject headers,
        String sharePassword,
        boolean forceRefresh
    ) {
        try {
            Uri uri = Uri.parse(rawImgUrl);
            String passphrase = uri.getQueryParameter("passphrase");
            if (passphrase == null || passphrase.isEmpty()) {
                passphrase = uri.getQueryParameter("sharing_id");
            }
            if ((passphrase == null || passphrase.isEmpty()) && headers.has("X-SYNO-SHARING")) {
                passphrase = headers.optString("X-SYNO-SHARING", "");
            }
            if (passphrase == null || passphrase.isEmpty()) {
                return rawImgUrl;
            }

            headers.put("X-SYNO-SHARING", passphrase);
            String origin = uri.getScheme() + "://" + uri.getAuthority();
            String entryBaseUrl = origin + uri.getPath();
            String shareKey = entryBaseUrl + "::" + passphrase;

            Long lastAuth = SYNO_SHARE_AUTH_CACHE.get(shareKey);
            long now = System.currentTimeMillis();
            if (!forceRefresh && lastAuth != null && (now - lastAuth) < 20 * 60 * 1000L) {
                String cachedSid = SYNO_SHARING_SID_CACHE.get(shareKey);
                if (cachedSid != null && !cachedSid.isEmpty() && rawImgUrl.contains("sharing_id=")) {
                    return appendOrReplaceQueryParam(rawImgUrl, "_sharing_sid", cachedSid);
                }
                return rawImgUrl;
            }

            // 1) Synology Photos Share login
            StringBuilder fotoBody = new StringBuilder();
            fotoBody.append("api=SYNO.Foto.Sharing.Passphrase&version=1&method=login&passphrase=")
                .append(URLEncoder.encode(passphrase, "UTF-8"));
            if (sharePassword != null && !sharePassword.trim().isEmpty()) {
                fotoBody.append("&password=").append(URLEncoder.encode(sharePassword.trim(), "UTF-8"));
            }
            postFormUrlEncoded(entryBaseUrl, fotoBody.toString(), passphrase);

            // 2) Synology DSM FileStation FolderSharing login if needed
            String obtainedSid = null;
            if (rawImgUrl.contains("sharing_id=") || rawImgUrl.contains("SYNO.FolderSharing")) {
                String dsmEntry = origin + "/webapi/entry.cgi";
                StringBuilder fsBody = new StringBuilder();
                fsBody.append("api=SYNO.Core.Sharing.Login&version=1&method=login&sharing_id=")
                    .append(URLEncoder.encode(passphrase, "UTF-8"));
                if (sharePassword != null && !sharePassword.trim().isEmpty()) {
                    fsBody.append("&password=").append(URLEncoder.encode(sharePassword.trim(), "UTF-8"));
                }
                String fsResp = postFormUrlEncoded(dsmEntry, fsBody.toString(), passphrase);
                if (fsResp != null && fsResp.contains("sharing_sid")) {
                    try {
                        JSONObject j = new JSONObject(fsResp);
                        JSONObject d = j.optJSONObject("data");
                        if (d != null) {
                            obtainedSid = d.optString("sharing_sid", "");
                        }
                    } catch (Exception ignored) {}
                }
            }

            SYNO_SHARE_AUTH_CACHE.put(shareKey, now);
            if (obtainedSid != null && !obtainedSid.isEmpty()) {
                SYNO_SHARING_SID_CACHE.put(shareKey, obtainedSid);
                if (rawImgUrl.contains("sharing_id=")) {
                    return appendOrReplaceQueryParam(rawImgUrl, "_sharing_sid", obtainedSid);
                }
            }
        } catch (Exception ignored) {}
        return rawImgUrl;
    }

    private static String appendOrReplaceQueryParam(String url, String key, String value) {
        try {
            String encoded = URLEncoder.encode(value, "UTF-8");
            if (url.contains(key + "=")) {
                return url.replaceAll("(" + key + "=)[^&]*", "$1" + encoded);
            }
            return url + (url.contains("?") ? "&" : "?") + key + "=" + encoded;
        } catch (Exception e) {
            return url;
        }
    }

    private static String postFormUrlEncoded(String targetUrl, String formBody, String sharingPassphrase) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(targetUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            conn.setRequestProperty("User-Agent", USER_AGENT);
            if (sharingPassphrase != null && !sharingPassphrase.isEmpty()) {
                conn.setRequestProperty("X-SYNO-SHARING", sharingPassphrase);
            }
            byte[] payload = formBody.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(payload.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                try (InputStream is = conn.getInputStream();
                     ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = is.read(buf)) != -1) {
                        baos.write(buf, 0, n);
                    }
                    return new String(baos.toByteArray(), StandardCharsets.UTF_8);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private static File downloadStreamToTempFile(
        Context context,
        String initialUrl,
        JSONObject customHeaders
    ) throws Exception {
        String currentUrl = initialUrl;
        for (int redirect = 0; redirect < 6; redirect++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(currentUrl).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(12000);
            // Generous 35s read timeout so even a 25MB original photo over home NAS upload finishes cleanly
            conn.setReadTimeout(35000);
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setRequestProperty("Accept", "image/webp,image/jpeg,image/png,image/*,*/*;q=0.8");

            if (customHeaders != null) {
                Iterator<String> keys = customHeaders.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    String v = customHeaders.optString(k, "");
                    if (!v.isEmpty()) {
                        conn.setRequestProperty(k, v);
                    }
                }
            }

            int status = conn.getResponseCode();
            if (
                status == HttpURLConnection.HTTP_MOVED_TEMP ||
                status == HttpURLConnection.HTTP_MOVED_PERM ||
                status == HttpURLConnection.HTTP_SEE_OTHER ||
                status == 307 ||
                status == 308
            ) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null || loc.isEmpty()) return null;
                currentUrl = new URL(new URL(currentUrl), loc).toString();
                continue;
            }

            if (status < 200 || status >= 300) {
                conn.disconnect();
                return null;
            }

            String contentType = conn.getContentType();
            if (contentType != null) {
                String lowerCt = contentType.toLowerCase(Locale.ROOT);
                if (lowerCt.contains("text/html") || lowerCt.contains("application/json")) {
                    conn.disconnect();
                    return null;
                }
            }

            File tempFile = File.createTempFile("kp_opt_", ".img", context.getCacheDir());
            try (InputStream is = conn.getInputStream();
                 FileOutputStream fos = new FileOutputStream(tempFile)) {
                byte[] buffer = new byte[32 * 1024];
                int read;
                long total = 0L;
                // Cap at 65 MB per single image for safety
                while ((read = is.read(buffer)) != -1) {
                    total += read;
                    if (total > 65L * 1024L * 1024L) {
                        throw new IllegalStateException("Image exceeds 65MB limit");
                    }
                    fos.write(buffer, 0, read);
                }
            } finally {
                conn.disconnect();
            }
            return tempFile;
        }
        return null;
    }

    private static boolean looksLikeTextErrorPayload(File file) {
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] head = new byte[32];
            int n = fis.read(head);
            if (n < 4) return true;
            String s = new String(head, 0, n, StandardCharsets.US_ASCII).trim().toLowerCase(Locale.ROOT);
            return s.startsWith("<!do") || s.startsWith("<htm") || s.startsWith("{\"") || s.startsWith("{\"s");
        } catch (Exception e) {
            return true;
        }
    }

    private static JSONObject decodeResizeAndCompress(
        File imageFile,
        int maxDisplayDim,
        int displayQuality,
        int aiThumbDim
    ) throws Exception {
        // 1) Read bounds with zero pixel allocation
        BitmapFactory.Options boundsOpts = new BitmapFactory.Options();
        boundsOpts.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(imageFile.getAbsolutePath(), boundsOpts);

        int origW = boundsOpts.outWidth;
        int origH = boundsOpts.outHeight;
        if (origW <= 0 || origH <= 0) {
            return null;
        }

        // 2) Compute power-of-2 hardware subsample factor
        int sampleSize = 1;
        while ((origW / (sampleSize * 2)) >= maxDisplayDim || (origH / (sampleSize * 2)) >= maxDisplayDim) {
            sampleSize *= 2;
        }

        BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
        decodeOpts.inSampleSize = sampleSize;
        decodeOpts.inPreferredConfig = Bitmap.Config.ARGB_8888;

        Bitmap subsampled = BitmapFactory.decodeFile(imageFile.getAbsolutePath(), decodeOpts);
        if (subsampled == null) {
            return null;
        }

        int rotationDegrees = readJpegExifRotationDegrees(imageFile);

        // 3) Scale cleanly to maxDisplayDim + apply EXIF rotation
        Bitmap displayBmp = transformBitmap(subsampled, maxDisplayDim, rotationDegrees);
        if (displayBmp != subsampled) {
            subsampled.recycle();
        }

        // 4) Compress Display Image to compact WebP (~110KB - 180KB)
        ByteArrayOutputStream displayOut = new ByteArrayOutputStream(160 * 1024);
        Bitmap.CompressFormat webpFormat = getLossyWebpFormat();
        boolean webpOk = displayBmp.compress(webpFormat, displayQuality, displayOut);
        String displayMime = "image/webp";
        if (!webpOk || displayOut.size() < 64) {
            displayOut.reset();
            displayBmp.compress(Bitmap.CompressFormat.JPEG, displayQuality, displayOut);
            displayMime = "image/jpeg";
        }
        byte[] displayBytes = displayOut.toByteArray();

        // 5) Create Ultra-Light AI Vision Thumbnail (384px JPEG ~12KB) from already-rotated displayBmp
        Bitmap thumbBmp = transformBitmap(displayBmp, aiThumbDim, 0);
        ByteArrayOutputStream thumbOut = new ByteArrayOutputStream(20 * 1024);
        thumbBmp.compress(Bitmap.CompressFormat.JPEG, 68, thumbOut);
        byte[] thumbBytes = thumbOut.toByteArray();

        int finalW = displayBmp.getWidth();
        int finalH = displayBmp.getHeight();

        if (thumbBmp != displayBmp) {
            thumbBmp.recycle();
        }
        displayBmp.recycle();

        JSONObject out = new JSONObject();
        out.put("ok", true);
        out.put("displayBase64", Base64.encodeToString(displayBytes, Base64.NO_WRAP));
        out.put("displayMime", displayMime);
        out.put("aiThumbBase64", Base64.encodeToString(thumbBytes, Base64.NO_WRAP));
        out.put("byteSize", displayBytes.length);
        out.put("width", finalW);
        out.put("height", finalH);
        return out;
    }

    @SuppressWarnings("deprecation")
    private static Bitmap.CompressFormat getLossyWebpFormat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Bitmap.CompressFormat.WEBP_LOSSY;
        }
        return Bitmap.CompressFormat.WEBP;
    }

    private static Bitmap transformBitmap(Bitmap src, int maxDim, int rotationDeg) {
        int w = src.getWidth();
        int h = src.getHeight();
        float scale = 1.0f;
        if (w > maxDim || h > maxDim) {
            scale = Math.min((float) maxDim / (float) w, (float) maxDim / (float) h);
        }
        if (Math.abs(scale - 1.0f) < 0.01f && rotationDeg == 0) {
            return src;
        }
        Matrix matrix = new Matrix();
        if (Math.abs(scale - 1.0f) >= 0.01f) {
            matrix.postScale(scale, scale);
        }
        if (rotationDeg != 0) {
            matrix.postRotate(rotationDeg);
        }
        Bitmap transformed = Bitmap.createBitmap(src, 0, 0, w, h, matrix, true);
        return transformed != null ? transformed : src;
    }

    /**
     * Zero-dependency JPEG APP1 EXIF Orientation (tag 0x0112) reader so camera portrait photos
     * are always oriented upright without needing extra AndroidX dependencies.
     */
    private static int readJpegExifRotationDegrees(File file) {
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] header = new byte[64 * 1024];
            int len = fis.read(header);
            if (len < 14) return 0;
            if ((header[0] & 0xFF) != 0xFF || (header[1] & 0xFF) != 0xD8) {
                return 0; // Not JPEG
            }

            int offset = 2;
            while (offset + 4 < len) {
                if ((header[offset] & 0xFF) != 0xFF) break;
                int marker = header[offset + 1] & 0xFF;
                if (marker == 0xFF) {
                    offset++;
                    continue;
                }
                if (marker == 0xDA || marker == 0xD9) break; // SOS or EOI

                int segLen = ((header[offset + 2] & 0xFF) << 8) | (header[offset + 3] & 0xFF);
                if (segLen < 2 || offset + 2 + segLen > len) break;

                // APP1 (0xE1) with "Exif\0\0"
                if (
                    marker == 0xE1 &&
                    segLen >= 14 &&
                    header[offset + 4] == 'E' &&
                    header[offset + 5] == 'x' &&
                    header[offset + 6] == 'i' &&
                    header[offset + 7] == 'f' &&
                    header[offset + 8] == 0 &&
                    header[offset + 9] == 0
                ) {
                    int tiffStart = offset + 10;
                    boolean littleEndian =
                        header[tiffStart] == 'I' && header[tiffStart + 1] == 'I';
                    int firstIfdOffset = readInt32(header, tiffStart + 4, littleEndian);
                    int dirStart = tiffStart + firstIfdOffset;
                    if (dirStart + 2 > len) return 0;

                    int entryCount = readUint16(header, dirStart, littleEndian);
                    for (int i = 0; i < entryCount; i++) {
                        int entryOffset = dirStart + 2 + (i * 12);
                        if (entryOffset + 12 > len) break;
                        int tag = readUint16(header, entryOffset, littleEndian);
                        if (tag == 0x0112) {
                            int orientation = readUint16(header, entryOffset + 8, littleEndian);
                            switch (orientation) {
                                case 3:
                                    return 180;
                                case 6:
                                    return 90;
                                case 8:
                                    return 270;
                                default:
                                    return 0;
                            }
                        }
                    }
                    return 0;
                }
                offset += 2 + segLen;
            }
        } catch (Exception ignored) {}
        return 0;
    }

    private static int readUint16(byte[] buf, int idx, boolean littleEndian) {
        if (littleEndian) {
            return (buf[idx] & 0xFF) | ((buf[idx + 1] & 0xFF) << 8);
        }
        return ((buf[idx] & 0xFF) << 8) | (buf[idx + 1] & 0xFF);
    }

    private static int readInt32(byte[] buf, int idx, boolean littleEndian) {
        if (littleEndian) {
            return (buf[idx] & 0xFF)
                | ((buf[idx + 1] & 0xFF) << 8)
                | ((buf[idx + 2] & 0xFF) << 16)
                | ((buf[idx + 3] & 0xFF) << 24);
        }
        return ((buf[idx] & 0xFF) << 24)
            | ((buf[idx + 1] & 0xFF) << 16)
            | ((buf[idx + 2] & 0xFF) << 8)
            | (buf[idx + 3] & 0xFF);
    }
}
