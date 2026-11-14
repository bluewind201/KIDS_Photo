package com.bluewind.kidsphoto;

import android.content.Context;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Natural human-grade Neural TTS client for Android (Microsoft Read-Aloud Neural Voices).
 * Zero API key required; runs natively in Java SSLSocket with disk LRU MP3 cache and fast timeout.
 */
public final class EdgeNeuralTtsClient {
    private static final String HOST = "speech.platform.bing.com";
    private static final int PORT = 443;
    private static final String TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    private static final String CHROMIUM_FULL_VERSION = "143.0.3650.75";
    private static final String CHROMIUM_MAJOR_VERSION = "143";
    private static final String SEC_MS_GEC_VERSION = "2-" + CHROMIUM_FULL_VERSION;
    private static final long WIN_EPOCH_SECONDS = 11644473600L;
    private static final int SOCKET_TIMEOUT_MS = 9500;
    private static final int MAX_CACHE_FILES = 120;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final int[] SHA256_INITIAL = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    };
    private static final int[] SHA256_STATE = {
        0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a,
        0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2
    };
    private static final int[] SHA256_SCHEDULE = {
        0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba,
        0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6,
        0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
        0xd258b060, 0x72766564
    };
    private static final int[] SHA256_ROUND_CONSTANTS = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    };
    private static final int SHA256_ADJUSTMENT = 0xc9dc06a7;
    private static final int SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80;
    private static final int SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0;

    private static final int[][] CS64_COEFFICIENTS = {
        { 0xe82e91b1, 0xb32700d0 },
        { 0x44de24c6, 0x88dff51d },
        { 0x3beb65bc, 0x29514038 },
        { 0xc89c5933, 0xb328cbdf },
        { 0x8d1ec211, 0xd405b4d5 },
        { 0x314ef5d5, 0x26e55f3c },
        { 0xe92491b1, 0x607801c6 },
        { 0xf0a5b9d5, 0x82b2c1fb },
        { 0x06064cf3, 0xfa51a3da },
        { 0xda79fa60, 0x207cc464 },
        { 0xbed20560, 0x3c3c74f3 },
        { 0x89f9c9f8, 0xd2d14b61 },
        { 0x35fa38c6, 0xbb04a2c1 },
        { 0xcb49e3c6, 0xc5626167 }
    };
    private static final int CS64_FACTOR = 0x82893933;
    private static final int CS64_ADJUSTMENT0 = 0xf2f90b1a;
    private static final int CS64_ADJUSTMENT1 = 0x0b1a0000;

    private EdgeNeuralTtsClient() {}

    public static final class NeuralVoiceSpec {
        public final String voiceName;
        public final String pitchHz;
        public final String ratePct;
        public final String xmlLang;

        NeuralVoiceSpec(String voiceName, String pitchHz, String ratePct, String xmlLang) {
            this.voiceName = voiceName;
            this.pitchHz = pitchHz;
            this.ratePct = ratePct;
            this.xmlLang = xmlLang;
        }
    }

    /**
     * Maps each plush animal character to an adorable, bright, child-friendly Korean/English Neural voice!
     * Uses native Korean `ko-KR-SunHiNeural` with lively cartoon-character prosody and `en-US-AnaNeural` (real child voice) for English!
     */
    public static NeuralVoiceSpec resolveVoiceSpec(String speakerKey, boolean isEnglish) {
        String key = speakerKey != null ? speakerKey.trim().toLowerCase(Locale.ROOT) : "assistant";
        if (isEnglish) {
            switch (key) {
                case "tosuni":
                    return new NeuralVoiceSpec("en-US-AnaNeural", "+2Hz", "-4%", "en-US");
                case "tosili":
                    return new NeuralVoiceSpec("en-US-AnaNeural", "+8Hz", "+2%", "en-US");
                case "toddungi":
                    return new NeuralVoiceSpec("en-US-AnaNeural", "+4Hz", "-5%", "en-US");
                case "tobyeori":
                    return new NeuralVoiceSpec("en-US-AnaNeural", "+6Hz", "-3%", "en-US");
                case "togureum":
                    return new NeuralVoiceSpec("en-US-AnaNeural", "+0Hz", "+0%", "en-US");
                default:
                    return new NeuralVoiceSpec("en-US-AnaNeural", "+2Hz", "-3%", "en-US");
            }
        }

        // Cute, animated Korean character prosody on native Korean neural pronunciation (no adult male or foreign-accent voices!)
        switch (key) {
            case "tosuni":
                // 다정하고 사랑스러운 아기 토끼 톤
                return new NeuralVoiceSpec("ko-KR-SunHiNeural", "+22Hz", "+5%", "ko-KR");
            case "tosili":
                // 통통 튀고 신나는 장난꾸러기 단짝 인형 톤
                return new NeuralVoiceSpec("ko-KR-SunHiNeural", "+30Hz", "+10%", "ko-KR");
            case "toddungi":
                // 포근하고 말랑말랑한 막내 곰돌이·햄스터 인형 톤
                return new NeuralVoiceSpec("ko-KR-SunHiNeural", "+25Hz", "+2%", "ko-KR");
            case "tobyeori":
                // 맑고 방울방울 귀여운 동화 요정 인형 톤
                return new NeuralVoiceSpec("ko-KR-SunHiNeural", "+27Hz", "+4%", "ko-KR");
            case "togureum":
                // 씩씩하고 해맑은 꼬마 대장 인형 톤
                return new NeuralVoiceSpec("ko-KR-SunHiNeural", "+18Hz", "+8%", "ko-KR");
            default:
                // 다정하고 친근한 스마트 가족 도우미 톤
                return new NeuralVoiceSpec("ko-KR-SunHiNeural", "+12Hz", "+3%", "ko-KR");
        }
    }

    public static File synthesizeToCachedMp3(
        Context context,
        String rawText,
        String speakerKey,
        boolean isEnglish
    ) throws Exception {
        String cleanText = rawText == null ? "" : rawText.trim();
        if (cleanText.isEmpty()) {
            throw new IllegalArgumentException("Empty TTS text");
        }
        if (cleanText.length() > 450) {
            cleanText = cleanText.substring(0, 450);
        }

        NeuralVoiceSpec spec = resolveVoiceSpec(speakerKey, isEnglish);
        File cacheDir = new File(context.getCacheDir(), "neural_tts");
        if (!cacheDir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            cacheDir.mkdirs();
        }

        String cacheKey = sha256Hex(
            spec.voiceName + "|" + spec.pitchHz + "|" + spec.ratePct + "|" + spec.xmlLang + "|" + cleanText
        );
        File cachedFile = new File(cacheDir, "tts_" + cacheKey + ".mp3");
        if (cachedFile.exists() && cachedFile.length() > 256) {
            // Touch timestamp for LRU retention
            //noinspection ResultOfMethodCallIgnored
            cachedFile.setLastModified(System.currentTimeMillis());
            return cachedFile;
        }

        byte[] mp3Bytes = null;
        Exception lastFetchErr = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                mp3Bytes = fetchNeuralMp3Bytes(cleanText, spec);
                if (mp3Bytes != null && mp3Bytes.length >= 256) {
                    break;
                }
            } catch (Exception err) {
                lastFetchErr = err;
            }
        }
        if (mp3Bytes == null || mp3Bytes.length < 256) {
            if (lastFetchErr != null) throw lastFetchErr;
            throw new IOException("Neural TTS returned empty audio");
        }

        File tmpFile = new File(cacheDir, "tmp_" + UUID.randomUUID().toString() + ".mp3");
        try (FileOutputStream fos = new FileOutputStream(tmpFile)) {
            fos.write(mp3Bytes);
            fos.flush();
        }
        if (cachedFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            cachedFile.delete();
        }
        if (!tmpFile.renameTo(cachedFile)) {
            try (FileOutputStream fos = new FileOutputStream(cachedFile)) {
                fos.write(mp3Bytes);
                fos.flush();
            }
            //noinspection ResultOfMethodCallIgnored
            tmpFile.delete();
        }

        pruneCacheDirectory(cacheDir);
        return cachedFile;
    }

    private static void pruneCacheDirectory(File cacheDir) {
        try {
            File[] files = cacheDir.listFiles();
            if (files == null || files.length <= MAX_CACHE_FILES) return;
            List<File> list = new ArrayList<>(Arrays.asList(files));
            Collections.sort(list, Comparator.comparingLong(File::lastModified));
            int toDelete = list.size() - MAX_CACHE_FILES;
            for (int i = 0; i < toDelete; i++) {
                //noinspection ResultOfMethodCallIgnored
                list.get(i).delete();
            }
        } catch (Exception ignored) {
            // Ignore cache prune failure
        }
    }

    private static byte[] fetchNeuralMp3Bytes(String text, NeuralVoiceSpec spec) throws Exception {
        String connId = randomUuidNoDashes();
        long epochSeconds = System.currentTimeMillis() / 1000L;
        String secMsGec = generateSecMsGecV2(epochSeconds);
        String muid = randomHexUpper(16);

        String path =
            "/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=" +
            TRUSTED_CLIENT_TOKEN +
            "&ConnectionId=" +
            connId +
            "&Sec-MS-GEC=" +
            secMsGec +
            "&Sec-MS-GEC-Version=" +
            SEC_MS_GEC_VERSION;

        SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
        try (SSLSocket socket = (SSLSocket) factory.createSocket(HOST, PORT)) {
            socket.setSoTimeout(SOCKET_TIMEOUT_MS);
            try {
                SSLParameters sslParams = socket.getSSLParameters();
                sslParams.setServerNames(Collections.singletonList(new SNIHostName(HOST)));
                socket.setSSLParameters(sslParams);
            } catch (Exception ignored) {
                // Ignore SNI fallback on older vendor stacks
            }
            socket.startHandshake();

            OutputStream out = socket.getOutputStream();
            InputStream rawIn = socket.getInputStream();

            byte[] wsKeyBytes = new byte[16];
            SECURE_RANDOM.nextBytes(wsKeyBytes);
            String wsKey = Base64.encodeToString(wsKeyBytes, Base64.NO_WRAP);

            String handshakeReq =
                "GET " + path + " HTTP/1.1\r\n" +
                "Host: " + HOST + "\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Key: " + wsKey + "\r\n" +
                "Sec-WebSocket-Version: 13\r\n" +
                "Pragma: no-cache\r\n" +
                "Cache-Control: no-cache\r\n" +
                "Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold\r\n" +
                "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" +
                CHROMIUM_MAJOR_VERSION +
                ".0.0.0 Safari/537.36 Edg/" +
                CHROMIUM_MAJOR_VERSION +
                ".0.0.0\r\n" +
                "Cookie: muid=" + muid + ";\r\n\r\n";

            out.write(handshakeReq.getBytes(StandardCharsets.US_ASCII));
            out.flush();

            String statusHeader = readHttpHeaderBlock(rawIn);
            if (!statusHeader.startsWith("HTTP/1.1 101")) {
                throw new IOException("Edge TTS WS upgrade failed: " + statusHeader.split("\r\n")[0]);
            }

            String timestamp = formatHttpDateUtc(new Date());
            String configMsg =
                "X-Timestamp:" + timestamp + "\r\n" +
                "Content-Type:application/json; charset=utf-8\r\n" +
                "Path:speech.config\r\n\r\n" +
                "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"true\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-96kbitrate-mono-mp3\"}}}}\r\n";
            writeMaskedWsTextFrame(out, configMsg);

            String reqId = randomUuidNoDashes();
            String escapedText = escapeXml(text);
            String ssml =
                "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" +
                spec.xmlLang +
                "'><voice name='" +
                spec.voiceName +
                "'><prosody pitch='" +
                spec.pitchHz +
                "' rate='" +
                spec.ratePct +
                "' volume='+0%'>" +
                escapedText +
                "</prosody></voice></speak>";

            String ssmlMsg =
                "X-RequestId:" + reqId + "\r\n" +
                "Content-Type:application/ssml+xml\r\n" +
                "X-Timestamp:" + timestamp + "Z\r\n" +
                "Path:ssml\r\n\r\n" +
                ssml;
            writeMaskedWsTextFrame(out, ssmlMsg);

            DataInputStream dis = new DataInputStream(rawIn);
            ByteArrayOutputStream mp3Out = new ByteArrayOutputStream(32768);

            while (true) {
                int b0 = dis.readUnsignedByte();
                int b1 = dis.readUnsignedByte();
                int opcode = b0 & 0x0f;
                boolean masked = (b1 & 0x80) != 0;
                long payloadLen = b1 & 0x7f;
                if (payloadLen == 126) {
                    payloadLen = dis.readUnsignedShort();
                } else if (payloadLen == 127) {
                    payloadLen = dis.readLong();
                }
                if (payloadLen < 0 || payloadLen > 8 * 1024 * 1024) {
                    throw new IOException("Invalid WS frame size: " + payloadLen);
                }

                byte[] maskKey = null;
                if (masked) {
                    maskKey = new byte[4];
                    dis.readFully(maskKey);
                }

                byte[] frame = new byte[(int) payloadLen];
                dis.readFully(frame);
                if (masked && maskKey != null) {
                    for (int i = 0; i < frame.length; i++) {
                        frame[i] ^= maskKey[i & 3];
                    }
                }

                if (opcode == 0x2) {
                    if (frame.length >= 2) {
                        int hdrLen = ((frame[0] & 0xff) << 8) | (frame[1] & 0xff);
                        int audioOffset = 2 + hdrLen;
                        if (audioOffset < frame.length) {
                            mp3Out.write(frame, audioOffset, frame.length - audioOffset);
                        }
                    }
                } else if (opcode == 0x1) {
                    String txt = new String(frame, StandardCharsets.UTF_8);
                    if (txt.contains("Path:turn.end")) {
                        break;
                    }
                } else if (opcode == 0x8) {
                    break;
                } else if (opcode == 0x9) {
                    // Respond to ping with masked pong
                    writeMaskedWsControlFrame(out, 0xA, frame);
                }
            }

            return mp3Out.toByteArray();
        }
    }

    private static String readHttpHeaderBlock(InputStream in) throws IOException {
        ByteArrayOutputStream headerOut = new ByteArrayOutputStream(512);
        int state = 0;
        while (headerOut.size() < 16384) {
            int b = in.read();
            if (b == -1) {
                throw new EOFException("Unexpected EOF during WS handshake");
            }
            headerOut.write(b);
            if (state == 0 && b == '\r') state = 1;
            else if (state == 1 && b == '\n') state = 2;
            else if (state == 2 && b == '\r') state = 3;
            else if (state == 3 && b == '\n') {
                return new String(headerOut.toByteArray(), StandardCharsets.US_ASCII);
            } else {
                state = (b == '\r') ? 1 : 0;
            }
        }
        throw new IOException("WS HTTP header too large");
    }

    private static void writeMaskedWsTextFrame(OutputStream out, String text) throws IOException {
        byte[] payload = text.getBytes(StandardCharsets.UTF_8);
        writeMaskedWsFrame(out, 0x81, payload);
    }

    private static void writeMaskedWsControlFrame(OutputStream out, int opcode, byte[] payload) throws IOException {
        writeMaskedWsFrame(out, 0x80 | (opcode & 0x0f), payload);
    }

    private static void writeMaskedWsFrame(OutputStream out, int firstByte, byte[] payload) throws IOException {
        byte[] mask = new byte[4];
        SECURE_RANDOM.nextBytes(mask);

        ByteArrayOutputStream frameBuf = new ByteArrayOutputStream(payload.length + 14);
        frameBuf.write(firstByte);
        if (payload.length < 126) {
            frameBuf.write(0x80 | payload.length);
        } else if (payload.length <= 65535) {
            frameBuf.write(0x80 | 126);
            frameBuf.write((payload.length >>> 8) & 0xff);
            frameBuf.write(payload.length & 0xff);
        } else {
            frameBuf.write(0x80 | 127);
            long len = payload.length;
            for (int shift = 56; shift >= 0; shift -= 8) {
                frameBuf.write((int) ((len >>> shift) & 0xff));
            }
        }
        frameBuf.write(mask);
        byte[] maskedPayload = new byte[payload.length];
        for (int i = 0; i < payload.length; i++) {
            maskedPayload[i] = (byte) (payload[i] ^ mask[i & 3]);
        }
        frameBuf.write(maskedPayload);
        out.write(frameBuf.toByteArray());
        out.flush();
    }

    private static String escapeXml(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&':
                    sb.append("&amp;");
                    break;
                case '<':
                    sb.append("&lt;");
                    break;
                case '>':
                    sb.append("&gt;");
                    break;
                case '"':
                    sb.append("&quot;");
                    break;
                case '\'':
                    sb.append("&apos;");
                    break;
                default:
                    if (c >= 0x20 || c == '\n' || c == '\r' || c == '\t') {
                        sb.append(c);
                    }
                    break;
            }
        }
        return sb.toString();
    }

    private static String formatHttpDateUtc(Date date) {
        SimpleDateFormat sdf = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("GMT"));
        return sdf.format(date);
    }

    private static String randomUuidNoDashes() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private static String randomHexUpper(int byteCount) {
        byte[] b = new byte[byteCount];
        SECURE_RANDOM.nextBytes(b);
        return bytesToHexUpper(b);
    }

    private static String sha256Hex(String input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] d = md.digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder(d.length * 2);
        for (byte b : d) {
            sb.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        }
        return sb.toString();
    }

    // =========================================================================
    // Exact Sec-MS-GEC v2 Token Generator (Bit-for-bit identical to Edge 143)
    // =========================================================================

    public static String generateSecMsGecV2(long unixEpochSeconds) {
        long ticks = unixEpochSeconds + WIN_EPOCH_SECONDS;
        ticks -= (ticks % 300L);
        ticks *= 10_000_000L;
        byte[] strBuf = (Long.toString(ticks) + TRUSTED_CLIENT_TOKEN).getBytes(StandardCharsets.US_ASCII);
        byte[] digest = customSha256Digest(strBuf);
        String cs64 = customCs64Digest(strBuf, digest);
        return cs64 + "-" + bytesToHexUpper(digest);
    }

    private static int rol16(int v) {
        return (v << 16) | (v >>> 16);
    }

    private static int rotr(int v, int n) {
        return (v >>> n) | (v << (32 - n));
    }

    private static int sigma0(int v) {
        return rotr(v, 7) ^ rotr(v, 18) ^ (v >>> 3);
    }

    private static int sigma1(int v) {
        return rotr(v, 17) ^ rotr(v, 19) ^ (v >>> 10);
    }

    private static int[] sha256Rounds(int[] state, int[] words, int firstRound) {
        int a = state[0];
        int b = state[1];
        int c = state[2];
        int d = state[3];
        int e = state[4];
        int f = state[5];
        int g = state[6];
        int h = state[7];

        for (int i = firstRound; i < 64; i++) {
            int k = (firstRound == 14 && i == 14) ? SHA256_ADJUSTMENT : SHA256_ROUND_CONSTANTS[i];
            int s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            int ch = (e & f) ^ ((~e) & g);
            int t1 = h + s1 + ch + k + words[i];
            int s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            int maj = (a & b) ^ (a & c) ^ (b & c);
            int t2 = s0 + maj;
            h = g;
            g = f;
            f = e;
            e = d + t1;
            d = c;
            c = b;
            b = a;
            a = t1 + t2;
        }
        return new int[] { a, b, c, d, e, f, g, h };
    }

    private static void expandSchedule(int[] words, int firstWord) {
        for (int i = firstWord; i < 64; i++) {
            words[i] = sigma1(words[i - 2]) + words[i - 7] + sigma0(words[i - 15]) + words[i - 16];
        }
    }

    private static int[] sha256Init(byte[] data7) {
        int[] words = new int[64];
        words[14] = ((data7[0] & 0xff) << 16) | ((data7[1] & 0xff) << 8) | (data7[2] & 0xff);
        words[15] =
            ((data7[3] & 0xff) << 24) |
            ((data7[4] & 0xff) << 16) |
            ((data7[5] & 0xff) << 8) |
            (data7[6] & 0xff);

        for (int i = 16; i < 30; i++) {
            int val = SHA256_SCHEDULE[i - 16];
            if (i - 2 >= 14) {
                val += (i == 16) ? (sigma1(words[i - 2]) ^ SHA256_SIGMA1_ADJUSTMENT) : sigma1(words[i - 2]);
            }
            if (i - 7 >= 14) {
                val += words[i - 7];
            }
            if (i - 15 >= 14) {
                val += (i == 29) ? (sigma0(words[i - 15]) ^ SHA256_SIGMA0_ADJUSTMENT) : sigma0(words[i - 15]);
            }
            words[i] = val;
        }
        words[30] =
            sigma1(words[28]) +
            words[23] +
            sigma0(words[15]) +
            words[14] +
            SHA256_ADJUSTMENT -
            SHA256_ROUND_CONSTANTS[14];
        expandSchedule(words, 31);

        int[] working = sha256Rounds(SHA256_STATE, words, 14);
        int[] out = new int[8];
        for (int idx = 0; idx < 8; idx++) {
            out[idx] = SHA256_INITIAL[idx] + working[idx];
        }
        return out;
    }

    private static byte[] customSha256Digest(byte[] data) {
        int length = 57 + data.length;
        int tailLen = data.length - 7;
        int padZeroCount = (((55 - length) % 64) + 64) % 64;
        byte[] padded = new byte[tailLen + 1 + padZeroCount + 8];
        System.arraycopy(data, 7, padded, 0, tailLen);
        padded[tailLen] = (byte) 0x80;

        long bitLen = ((long) length) * 8L;
        ByteBuffer.wrap(padded, padded.length - 8, 8).order(ByteOrder.BIG_ENDIAN).putLong(bitLen);

        byte[] head7 = Arrays.copyOfRange(data, 0, 7);
        int[] state = sha256Init(head7);

        for (int off = 0; off < padded.length; off += 64) {
            int[] words = new int[64];
            ByteBuffer blockBuf = ByteBuffer.wrap(padded, off, 64).order(ByteOrder.BIG_ENDIAN);
            for (int j = 0; j < 16; j++) {
                words[j] = blockBuf.getInt();
            }
            expandSchedule(words, 16);
            int[] working = sha256Rounds(state, words, 0);
            for (int idx = 0; idx < 8; idx++) {
                state[idx] += working[idx];
            }
        }

        byte[] out = new byte[32];
        ByteBuffer outBuf = ByteBuffer.wrap(out).order(ByteOrder.BIG_ENDIAN);
        for (int i = 0; i < 8; i++) {
            outBuf.putInt(state[i]);
        }
        return out;
    }

    private static int[] wordsLe4Even(byte[] buf) {
        int rem = buf.length % 4;
        byte[] padded = (rem == 0) ? buf : Arrays.copyOf(buf, buf.length + (4 - rem));
        int count = padded.length / 4;
        boolean odd = (count % 2) == 1;
        int[] words = new int[odd ? (count + 1) : count];
        ByteBuffer le = ByteBuffer.wrap(padded).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < count; i++) {
            words[i] = le.getInt();
        }
        return words;
    }

    private static String customCs64Digest(byte[] data, byte[] digest) {
        ByteBuffer digestLe = ByteBuffer.wrap(digest).order(ByteOrder.LITTLE_ENDIAN);
        int keyA = digestLe.getInt(0) | 1;
        int keyB = digestLe.getInt(4) | 1;
        int[] factors = new int[] { keyA * CS64_FACTOR, keyB * CS64_FACTOR };

        byte[] prefixed = new byte[1 + data.length];
        System.arraycopy(data, 0, prefixed, 1, data.length);
        int[] dataWords = wordsLe4Even(prefixed);

        int totalLen = CS64_COEFFICIENTS.length + dataWords.length;
        int[] terms = new int[totalLen];
        int[] offsets = new int[totalLen];

        for (int idx = 0; idx < CS64_COEFFICIENTS.length; idx++) {
            terms[idx] = CS64_COEFFICIENTS[idx][0] * factors[idx % 2];
            offsets[idx] = CS64_COEFFICIENTS[idx][1];
        }

        int base = CS64_COEFFICIENTS.length;
        for (int idx = 0; idx < dataWords.length; idx++) {
            int word = dataWords[idx];
            int term = word * ((idx % 2 == 0) ? keyA : keyB);
            int offset = rol16(word) * ((idx % 2 == 0) ? 0xef0569fb : 0xc31713db);
            if (idx == 0) {
                term += CS64_ADJUSTMENT0 * factors[0];
                offset += CS64_ADJUSTMENT1;
            }
            terms[base + idx] = term;
            offsets[base + idx] = offset;
        }

        int swapAcc = 0;
        int swapLast = 0;
        int state = 0;
        int acc = 0;

        for (int idx = 0; idx < totalLen; idx += 2) {
            int x = terms[idx];
            int y = terms[idx + 1];

            int t = rol16(offsets[idx] + x);
            int q = t * 0x76f50f34;
            swapAcc += (rol16(q) * 0xc3efea97) + q;

            t = rol16(offsets[idx + 1] + y);
            q = t * 0x1881ce3c;
            swapLast = (rol16(q) * 0x35bd1ec9) + q;
            swapAcc += swapLast;

            state = (state * keyA) + x;
            state = rol16(state) * 0xcf98b111;
            state = rol16(state) * 0x87085b9f;
            state = rol16(state) * 0x12ceb96d;
            state = rol16(state) * 0x257e1d83;
            acc += state;

            t = (state * keyB) + y;
            t = rol16(t) * 0xa27416f5;
            t = rol16(t) * 0xd38396ff;
            state = rol16(rol16(t) * 0x7c932b89) * 0xbfa49f69;
            acc += state;
        }

        byte[] out = new byte[8];
        ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(swapLast ^ state)
            .putInt(swapAcc ^ acc);
        return bytesToHexUpper(out);
    }

    private static String bytesToHexUpper(byte[] bytes) {
        char[] hexChars = "0123456789ABCDEF".toCharArray();
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xff;
            out[i * 2] = hexChars[v >>> 4];
            out[i * 2 + 1] = hexChars[v & 0x0f];
        }
        return new String(out);
    }
}
