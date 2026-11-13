package com.bluewind.kidsphoto;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.io.File;
import java.io.FileInputStream;
import java.net.CookieHandler;
import java.net.CookiePolicy;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_CODE = 1001;
    private static final int MIC_PERMISSION_FOR_STT_CODE = 1002;
    private static final int CALENDAR_PERMISSION_CODE = 1003;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService neuralTtsExecutor = Executors.newFixedThreadPool(2);
    private final ExecutorService photoOptExecutor = Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String, String> completedPhotoPayloads = new ConcurrentHashMap<>();
    private final AtomicLong activeSpeechGeneration = new AtomicLong(0L);
    private MediaPlayer activeNeuralPlayer = null;
    private TextToSpeech nativeTts = null;
    private boolean isTtsInitialized = false;
    private PendingSpeech pendingSpeech = null;

    private SpeechRecognizer speechRecognizer = null;
    private boolean isRecognizerListening = false;
    private String pendingSttLang = null;

    private static class PendingSpeech {
        final String text;
        final String lang;
        final float pitch;
        final float rate;
        final String speakerKey;
        final String utteranceId;

        PendingSpeech(
            String text,
            String lang,
            float pitch,
            float rate,
            String speakerKey,
            String utteranceId
        ) {
            this.text = text;
            this.lang = lang;
            this.pitch = pitch;
            this.rate = rate;
            this.speakerKey = speakerKey;
            this.utteranceId = utteranceId;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Configure global Java cookie jar + home NAS self-signed SSL trust BEFORE Bridge/CapacitorHttp init
        configureNativeHttpForHomeNasAndShareLinks();

        super.onCreate(savedInstanceState);

        // Route volume keys to media speaker so bunny voices are controlled by standard media volume
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        requestRequiredRuntimePermissions();
        initNativeTextToSpeech();

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            CookieManager webCookieManager = CookieManager.getInstance();
            webCookieManager.setAcceptCookie(true);
            webCookieManager.setAcceptThirdPartyCookies(webView, true);

            // Expose Native Android TTS + SpeechRecognizer + Fast Photo Optimizer + Device Calendar Bridge directly to JS
            webView.addJavascriptInterface(new AndroidSpeechBridge(), "AndroidSpeechBridge");
            webView.addJavascriptInterface(new AndroidPhotoBridge(), "AndroidPhotoBridge");
            webView.addJavascriptInterface(new AndroidCalendarBridge(), "AndroidCalendarBridge");

            // Allow home Synology NAS self-signed SSL certificates for image streaming in WebView
            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                    handler.proceed();
                }
            });

            // Grant WebRTC / Web Audio microphone capture requests inside WebView when runtime permission is granted
            webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    mainHandler.post(() -> {
                        try {
                            request.grant(request.getResources());
                        } catch (Exception e) {
                            super.onPermissionRequest(request);
                        }
                    });
                }
            });
        }
    }

    private void initNativeTextToSpeech() {
        try {
            nativeTts = new TextToSpeech(getApplicationContext(), status -> {
                if (status == TextToSpeech.SUCCESS && nativeTts != null) {
                    isTtsInitialized = true;
                    try {
                        AudioAttributes attrs = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build();
                        nativeTts.setAudioAttributes(attrs);
                    } catch (Exception ignored) {
                        // Ignore audio attribute fallback
                    }

                    try {
                        nativeTts.setLanguage(Locale.KOREAN);
                    } catch (Exception ignored) {
                        // Ignore initial locale error
                    }

                    nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {
                            dispatchJsTtsEvent(utteranceId, "start");
                        }

                        @Override
                        public void onDone(String utteranceId) {
                            dispatchJsTtsEvent(utteranceId, "done");
                        }

                        @Override
                        @SuppressWarnings("deprecation")
                        public void onError(String utteranceId) {
                            dispatchJsTtsEvent(utteranceId, "error");
                        }

                        @Override
                        public void onError(String utteranceId, int errorCode) {
                            dispatchJsTtsEvent(utteranceId, "error");
                        }
                    });

                    if (pendingSpeech != null) {
                        PendingSpeech queued = pendingSpeech;
                        pendingSpeech = null;
                        performOfflineLocalSpeak(
                            queued.text,
                            queued.lang,
                            queued.pitch,
                            queued.rate,
                            queued.speakerKey,
                            queued.utteranceId
                        );
                    }
                } else {
                    isTtsInitialized = false;
                    if (pendingSpeech != null) {
                        String failedId = pendingSpeech.utteranceId;
                        pendingSpeech = null;
                        dispatchJsTtsEvent(failedId, "error");
                    }
                }
            });
        } catch (Exception ignored) {
            isTtsInitialized = false;
        }
    }

    private void stopActiveNeuralPlayerOnMainThread() {
        if (activeNeuralPlayer != null) {
            try {
                if (activeNeuralPlayer.isPlaying()) {
                    activeNeuralPlayer.stop();
                }
            } catch (Exception ignored) {}
            try {
                activeNeuralPlayer.reset();
                activeNeuralPlayer.release();
            } catch (Exception ignored) {}
            activeNeuralPlayer = null;
        }
    }

    private void performNativeSpeak(
        String text,
        String lang,
        float pitch,
        float rate,
        String speakerKey,
        String utteranceId
    ) {
        final long myGen = activeSpeechGeneration.incrementAndGet();

        mainHandler.post(() -> {
            // Stop active STT mic before speaking so Android does not route TTS to earpiece or hear its own voice
            stopNativeListeningInternal(false);
            stopActiveNeuralPlayerOnMainThread();

            if (nativeTts != null) {
                try {
                    nativeTts.stop();
                } catch (Exception ignored) {}
            }

            try {
                AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
                if (am != null && am.getMode() != AudioManager.MODE_NORMAL) {
                    am.setMode(AudioManager.MODE_NORMAL);
                }
            } catch (Exception ignored) {
                // Ignore AudioManager mode reset
            }
        });

        final boolean isEnglish = lang != null && lang.toLowerCase(Locale.ROOT).startsWith("en");

        // Primary Engine: Natural Human-Grade Neural Voice (Edge Read-Aloud Neural TTS with Disk Cache)
        neuralTtsExecutor.execute(() -> {
            if (activeSpeechGeneration.get() != myGen) return;
            try {
                File mp3File = EdgeNeuralTtsClient.synthesizeToCachedMp3(
                    getApplicationContext(),
                    text,
                    speakerKey,
                    isEnglish
                );
                if (activeSpeechGeneration.get() != myGen) return;

                mainHandler.post(() -> {
                    if (activeSpeechGeneration.get() != myGen) return;
                    playSynthesizedNeuralMp3OnMainThread(
                        mp3File,
                        myGen,
                        text,
                        lang,
                        pitch,
                        rate,
                        speakerKey,
                        utteranceId
                    );
                });
            } catch (Exception neuralErr) {
                if (activeSpeechGeneration.get() != myGen) return;
                // Offline / Network Fallback: Local Android TextToSpeech with gentle non-robotic pitch
                mainHandler.post(() -> {
                    if (activeSpeechGeneration.get() != myGen) return;
                    performOfflineLocalSpeak(text, lang, pitch, rate, speakerKey, utteranceId);
                });
            }
        });
    }

    private void playSynthesizedNeuralMp3OnMainThread(
        File mp3File,
        long myGen,
        String text,
        String lang,
        float pitch,
        float rate,
        String speakerKey,
        String utteranceId
    ) {
        stopActiveNeuralPlayerOnMainThread();
        MediaPlayer mp = new MediaPlayer();
        activeNeuralPlayer = mp;
        FileInputStream fis = null;
        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
            mp.setAudioAttributes(attrs);

            // CRITICAL: Keep FileInputStream open until AFTER mp.prepare() completes!
            // Closing fis before mp.prepare() invalidates the OS file descriptor on Android.
            fis = new FileInputStream(mp3File);
            mp.setDataSource(fis.getFD(), 0, mp3File.length());
            mp.setVolume(1.0f, 1.0f);

            mp.setOnCompletionListener(player -> {
                if (activeNeuralPlayer == player) {
                    stopActiveNeuralPlayerOnMainThread();
                } else {
                    try {
                        player.release();
                    } catch (Exception ignored) {}
                }
                if (activeSpeechGeneration.get() == myGen) {
                    dispatchJsTtsEvent(utteranceId, "done");
                }
            });

            mp.setOnErrorListener((player, what, extra) -> {
                if (activeNeuralPlayer == player) {
                    stopActiveNeuralPlayerOnMainThread();
                } else {
                    try {
                        player.release();
                    } catch (Exception ignored) {}
                }
                if (activeSpeechGeneration.get() == myGen) {
                    performOfflineLocalSpeak(text, lang, pitch, rate, speakerKey, utteranceId);
                }
                return true;
            });

            mp.prepare();
            if (activeSpeechGeneration.get() != myGen) {
                stopActiveNeuralPlayerOnMainThread();
                return;
            }
            dispatchJsTtsEvent(utteranceId, "start");
            mp.start();
        } catch (Exception playErr) {
            stopActiveNeuralPlayerOnMainThread();
            if (activeSpeechGeneration.get() == myGen) {
                performOfflineLocalSpeak(text, lang, pitch, rate, speakerKey, utteranceId);
            }
        } finally {
            if (fis != null) {
                try {
                    fis.close();
                } catch (Exception ignored) {}
            }
        }
    }

    private void performOfflineLocalSpeak(
        String text,
        String lang,
        float pitch,
        float rate,
        String speakerKey,
        String utteranceId
    ) {
        mainHandler.post(() -> {
            if (nativeTts == null) {
                initNativeTextToSpeech();
                pendingSpeech = new PendingSpeech(text, lang, pitch, rate, speakerKey, utteranceId);
                return;
            }

            if (!isTtsInitialized) {
                pendingSpeech = new PendingSpeech(text, lang, pitch, rate, speakerKey, utteranceId);
                return;
            }

            try {
                boolean isEnglish = lang != null && lang.toLowerCase(Locale.ROOT).startsWith("en");
                Locale targetLocale = isEnglish ? Locale.US : Locale.KOREAN;
                int langResult = nativeTts.setLanguage(targetLocale);
                if (
                    langResult == TextToSpeech.LANG_MISSING_DATA ||
                    langResult == TextToSpeech.LANG_NOT_SUPPORTED
                ) {
                    if (!isEnglish) {
                        nativeTts.setLanguage(new Locale("ko", "KR"));
                    }
                }

                // Select distinct installed voice when multiple local voices exist for the language
                selectBestVoiceForSpeaker(isEnglish ? "en" : "ko", speakerKey);

                // Clamp offline fallback pitch to a natural human range (0.92 ~ 1.18) so it never sounds metallic
                float safePitch = Math.max(0.92f, Math.min(1.18f, pitch));
                float safeRate = Math.max(0.82f, Math.min(1.15f, rate));
                nativeTts.setPitch(safePitch);
                nativeTts.setSpeechRate(safeRate);

                Bundle params = new Bundle();
                params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
                params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);

                int speakCode = nativeTts.speak(
                    text,
                    TextToSpeech.QUEUE_FLUSH,
                    params,
                    utteranceId
                );
                if (speakCode == TextToSpeech.ERROR) {
                    dispatchJsTtsEvent(utteranceId, "error");
                }
            } catch (Exception e) {
                dispatchJsTtsEvent(utteranceId, "error");
            }
        });
    }

    private void selectBestVoiceForSpeaker(String langPrefix, String speakerKey) {
        if (nativeTts == null) return;
        try {
            Set<Voice> allVoices = nativeTts.getVoices();
            if (allVoices == null || allVoices.isEmpty()) return;

            List<Voice> matchingLocal = new ArrayList<>();
            for (Voice v : allVoices) {
                if (v == null || v.getLocale() == null) continue;
                String vLang = v.getLocale().getLanguage();
                if (vLang != null && vLang.toLowerCase(Locale.ROOT).startsWith(langPrefix)) {
                    if (!v.isNetworkConnectionRequired()) {
                        matchingLocal.add(v);
                    }
                }
            }

            if (matchingLocal.isEmpty()) return;

            Collections.sort(matchingLocal, Comparator.comparing(Voice::getName));

            int idx = 0;
            if ("tosuni".equals(speakerKey)) {
                idx = 0;
            } else if ("tosili".equals(speakerKey)) {
                idx = 1 % matchingLocal.size();
            } else if ("toddungi".equals(speakerKey)) {
                idx = 2 % matchingLocal.size();
            } else if ("tobyeori".equals(speakerKey)) {
                idx = 3 % matchingLocal.size();
            } else if ("togureum".equals(speakerKey)) {
                idx = 4 % matchingLocal.size();
            } else {
                idx = 0;
            }

            Voice chosen = matchingLocal.get(idx);
            if (chosen != null) {
                nativeTts.setVoice(chosen);
            }
        } catch (Exception ignored) {
            // Keep default engine voice for the locale
        }
    }

    private void ensureSpeechRecognizerOnMainThread() {
        if (speechRecognizer != null) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            dispatchJsSttState(false, "not-available");
            return;
        }
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                isRecognizerListening = true;
                dispatchJsSttState(true, "");
            }

            @Override
            public void onBeginningOfSpeech() {}

            @Override
            public void onRmsChanged(float rmsdB) {}

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                isRecognizerListening = false;
            }

            @Override
            public void onError(int error) {
                isRecognizerListening = false;
                String code;
                switch (error) {
                    case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                        code = "not-allowed";
                        break;
                    case SpeechRecognizer.ERROR_NO_MATCH:
                        code = "no-match";
                        break;
                    case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                        code = "speech-timeout";
                        break;
                    case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                        code = "busy";
                        break;
                    default:
                        code = "error-" + error;
                        break;
                }
                dispatchJsSttState(false, code);
            }

            @Override
            public void onResults(Bundle results) {
                isRecognizerListening = false;
                ArrayList<String> matches = results != null
                    ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    : null;
                if (matches != null && !matches.isEmpty() && matches.get(0) != null) {
                    dispatchJsSttResult(matches.get(0), true);
                }
                dispatchJsSttState(false, "ended");
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults != null
                    ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    : null;
                if (matches != null && !matches.isEmpty() && matches.get(0) != null) {
                    dispatchJsSttResult(matches.get(0), false);
                }
            }

            @Override
            public void onEvent(int eventType, Bundle params) {}
        });
    }

    private void startNativeListeningInternal(String lang) {
        mainHandler.post(() -> {
            String targetLang = (lang == null || lang.trim().isEmpty()) ? "ko-KR" : lang.trim();
            if (
                ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                pendingSttLang = targetLang;
                ActivityCompat.requestPermissions(
                    this,
                    new String[] { Manifest.permission.RECORD_AUDIO },
                    MIC_PERMISSION_FOR_STT_CODE
                );
                return;
            }

            try {
                ensureSpeechRecognizerOnMainThread();
                if (speechRecognizer == null) return;

                if (isRecognizerListening) {
                    try {
                        speechRecognizer.cancel();
                    } catch (Exception ignored) {}
                    isRecognizerListening = false;
                }

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                );
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, targetLang);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());

                speechRecognizer.startListening(intent);
                isRecognizerListening = true;
            } catch (Exception e) {
                isRecognizerListening = false;
                dispatchJsSttState(false, "start-failed");
            }
        });
    }

    private void stopNativeListeningInternal(boolean notifyJs) {
        mainHandler.post(() -> {
            isRecognizerListening = false;
            if (speechRecognizer != null) {
                try {
                    speechRecognizer.stopListening();
                    speechRecognizer.cancel();
                } catch (Exception ignored) {
                    // Ignore recognizer stop errors
                }
            }
            if (notifyJs) {
                dispatchJsSttState(false, "stopped");
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        @NonNull String[] permissions,
        @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MIC_PERMISSION_FOR_STT_CODE) {
            boolean granted =
                grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted && pendingSttLang != null) {
                String lang = pendingSttLang;
                pendingSttLang = null;
                startNativeListeningInternal(lang);
            } else {
                pendingSttLang = null;
                dispatchJsSttState(false, "not-allowed");
            }
        } else if (requestCode == CALENDAR_PERMISSION_CODE) {
            boolean granted =
                grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            dispatchJsCalendarPermResult(granted);
        }
    }

    private void dispatchJsCalendarPermResult(boolean granted) {
        mainHandler.post(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            try {
                JSONObject payload = new JSONObject();
                payload.put("granted", granted);
                String js =
                    "window.dispatchEvent(new CustomEvent('nativeCalendarPermEvent', { detail: " +
                    payload.toString() +
                    " }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        });
    }

    private void dispatchJsPhotoOptReady(String requestId) {
        mainHandler.post(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            try {
                JSONObject payload = new JSONObject();
                payload.put("requestId", requestId != null ? requestId : "");
                String js =
                    "window.dispatchEvent(new CustomEvent('nativePhotoOptReady', { detail: " +
                    payload.toString() +
                    " }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        });
    }

    private void dispatchJsTtsEvent(String utteranceId, String type) {
        mainHandler.post(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            try {
                JSONObject payload = new JSONObject();
                payload.put("id", utteranceId != null ? utteranceId : "");
                payload.put("type", type);
                String js =
                    "window.dispatchEvent(new CustomEvent('nativeTtsEvent', { detail: " +
                    payload.toString() +
                    " }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        });
    }

    private void dispatchJsSttResult(String transcript, boolean isFinal) {
        mainHandler.post(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            try {
                JSONObject payload = new JSONObject();
                payload.put("transcript", transcript != null ? transcript : "");
                payload.put("isFinal", isFinal);
                String js =
                    "window.dispatchEvent(new CustomEvent('nativeSttResult', { detail: " +
                    payload.toString() +
                    " }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        });
    }

    private void dispatchJsSttState(boolean listening, String statusOrError) {
        mainHandler.post(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            try {
                JSONObject payload = new JSONObject();
                payload.put("listening", listening);
                payload.put("status", statusOrError != null ? statusOrError : "");
                String js =
                    "window.dispatchEvent(new CustomEvent('nativeSttState', { detail: " +
                    payload.toString() +
                    " }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        });
    }

    public class AndroidSpeechBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public boolean isTtsReady() {
            return true;
        }

        @JavascriptInterface
        public void speak(
            String text,
            String lang,
            float pitch,
            float rate,
            String speakerKey,
            String utteranceId
        ) {
            if (text == null || text.trim().isEmpty()) {
                dispatchJsTtsEvent(utteranceId, "done");
                return;
            }
            performNativeSpeak(
                text,
                lang != null ? lang : "ko-KR",
                pitch,
                rate,
                speakerKey != null ? speakerKey : "tosuni",
                utteranceId != null ? utteranceId : ("utt-" + System.currentTimeMillis())
            );
        }

        @JavascriptInterface
        public void stopSpeak() {
            activeSpeechGeneration.incrementAndGet();
            mainHandler.post(() -> {
                pendingSpeech = null;
                stopActiveNeuralPlayerOnMainThread();
                if (nativeTts != null) {
                    try {
                        nativeTts.stop();
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public boolean isSttAvailable() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface
        public void startListening(String lang) {
            startNativeListeningInternal(lang);
        }

        @JavascriptInterface
        public void stopListening() {
            stopNativeListeningInternal(true);
        }
    }

    public class AndroidPhotoBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public void optimizePhotoAsync(
            String requestId,
            String candidateUrlsJson,
            String headersJson,
            String sharePassword,
            int maxDisplayDim,
            int displayQuality,
            int aiThumbDim
        ) {
            final String safeReqId =
                (requestId != null && !requestId.isEmpty())
                    ? requestId
                    : ("req-" + System.currentTimeMillis());

            photoOptExecutor.execute(() -> {
                JSONObject res = NativePhotoOptimizer.fetchAndOptimize(
                    getApplicationContext(),
                    candidateUrlsJson,
                    headersJson,
                    sharePassword,
                    maxDisplayDim,
                    displayQuality,
                    aiThumbDim
                );
                // Cap pending map size just in case a caller timed out
                if (completedPhotoPayloads.size() > 40) {
                    completedPhotoPayloads.clear();
                }
                completedPhotoPayloads.put(safeReqId, res.toString());
                dispatchJsPhotoOptReady(safeReqId);
            });
        }

        @JavascriptInterface
        public String consumeCompletedResult(String requestId) {
            if (requestId == null) return "{\"ok\":false}";
            String val = completedPhotoPayloads.remove(requestId);
            return val != null ? val : "{\"ok\":false}";
        }
    }

    public class AndroidCalendarBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public boolean hasCalendarPermission() {
            return NativeCalendarHelper.hasPermission(MainActivity.this);
        }

        @JavascriptInterface
        public void requestCalendarPermission() {
            mainHandler.post(() -> {
                if (NativeCalendarHelper.hasPermission(MainActivity.this)) {
                    dispatchJsCalendarPermResult(true);
                    return;
                }
                ActivityCompat.requestPermissions(
                    MainActivity.this,
                    new String[] { Manifest.permission.READ_CALENDAR },
                    CALENDAR_PERMISSION_CODE
                );
            });
        }

        @JavascriptInterface
        public String listCalendars() {
            return NativeCalendarHelper.listDeviceCalendarsJson(MainActivity.this);
        }

        @JavascriptInterface
        public String getEvents(String calendarIdsJson, int daysAhead) {
            return NativeCalendarHelper.getSelectedCalendarEventsJson(
                MainActivity.this,
                calendarIdsJson,
                daysAhead
            );
        }
    }

    @Override
    public void onDestroy() {
        activeSpeechGeneration.incrementAndGet();
        stopActiveNeuralPlayerOnMainThread();
        try {
            neuralTtsExecutor.shutdownNow();
        } catch (Exception ignored) {}
        try {
            photoOptExecutor.shutdownNow();
            completedPhotoPayloads.clear();
        } catch (Exception ignored) {}

        try {
            if (nativeTts != null) {
                nativeTts.stop();
                nativeTts.shutdown();
                nativeTts = null;
            }
        } catch (Exception ignored) {}

        try {
            if (speechRecognizer != null) {
                speechRecognizer.destroy();
                speechRecognizer = null;
            }
        } catch (Exception ignored) {}

        super.onDestroy();
    }

    private void configureNativeHttpForHomeNasAndShareLinks() {
        try {
            if (CookieHandler.getDefault() == null) {
                CookieHandler.setDefault(new java.net.CookieManager(null, CookiePolicy.ACCEPT_ALL));
            }
        } catch (Exception ignored) {
            // Ignore cookie handler init failure
        }

        try {
            TrustManager[] trustAllCerts = new TrustManager[] {
                new X509TrustManager() {
                    @Override
                    public void checkClientTrusted(X509Certificate[] chain, String authType) {}

                    @Override
                    public void checkServerTrusted(X509Certificate[] chain, String authType) {}

                    @Override
                    public X509Certificate[] getAcceptedIssuers() {
                        return new X509Certificate[0];
                    }
                }
            };
            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, trustAllCerts, new SecureRandom());
            HttpsURLConnection.setDefaultSSLSocketFactory(sslContext.getSocketFactory());
            HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> true);
        } catch (Exception ignored) {
            // Ignore SSL customization failure
        }
    }

    private void requestRequiredRuntimePermissions() {
        String[] permissions = new String[] {
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        };
        List<String> needed = new ArrayList<>();
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needed.add(perm);
            }
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                needed.toArray(new String[0]),
                PERMISSION_REQUEST_CODE
            );
        }
    }
}
