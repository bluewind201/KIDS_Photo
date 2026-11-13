import { tryBackendJson } from './standaloneApi';

let activeAudio: HTMLAudioElement | null = null;
let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      sharedAudioCtx = new Ctor();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Unlocks Web Audio & SpeechSynthesis on first user pointer/key gesture
 * so bunny voices and chimes always play audibly.
 */
export function installGlobalAudioUnlock() {
  if (typeof window === 'undefined' || audioUnlocked) return;

  const unlock = () => {
    audioUnlocked = true;
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

/**
 * Plays a cheerful, soft 3D marimba/pop chime when a bunny hops out or speaks,
 * giving immediate audible feedback while TTS audio streams or synthesizes.
 */
export function playBunnyChime(
  speaker: 'assistant' | 'tosuni' | 'tosili' | 'toddungi',
  enabled = true
) {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes =
      speaker === 'tosuni'
        ? [587.33, 783.99, 1046.5] // D5 - G5 - C6
        : speaker === 'tosili'
        ? [659.25, 880.0, 1174.66] // E5 - A5 - D6
        : speaker === 'toddungi'
        ? [523.25, 659.25, 783.99] // C5 - E5 - G5
        : [523.25, 783.99];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);

      gain.gain.setValueAtTime(0.001, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.065 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.065 + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.25);
    });
  } catch {
    // Ignore audio context restrictions
  }
}

export function stopCurrentSpeech() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function speakWithBrowserFallback(
  text: string,
  speaker: 'assistant' | 'tosuni' | 'tosili' | 'toddungi',
  lang: 'ko-KR' | 'en-US' = 'ko-KR',
  onSpeakingChange?: (speaking: boolean) => void
): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onSpeakingChange?.(false);
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    window.speechSynthesis.cancel();
    window.setTimeout(() => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;

      const voices = window.speechSynthesis.getVoices();
      const prefix = lang === 'en-US' ? 'en' : 'ko';
      const preferredVoice =
        voices.find((v) => v.lang.toLowerCase().startsWith(prefix) && v.name.includes('Google')) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
      if (preferredVoice) {
        utter.voice = preferredVoice;
      }

      if (lang === 'en-US') {
        utter.pitch = 1.15;
        utter.rate = 0.88; // Slightly slower & clearer for 3~7 year old English learners!
      } else if (speaker === 'tosuni') {
        utter.pitch = 1.28;
        utter.rate = 1.03;
      } else if (speaker === 'tosili') {
        utter.pitch = 1.38;
        utter.rate = 1.08;
      } else if (speaker === 'toddungi') {
        utter.pitch = 1.18;
        utter.rate = 0.96;
      } else {
        utter.pitch = 1.0;
        utter.rate = 1.0;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        onSpeakingChange?.(false);
        resolve();
      };

      const maxWait = Math.max(3000, text.length * 260);
      const timer = window.setTimeout(finish, maxWait);

      utter.onend = () => {
        window.clearTimeout(timer);
        finish();
      };
      utter.onerror = () => {
        window.clearTimeout(timer);
        finish();
      };

      window.speechSynthesis.speak(utter);
    }, 35);
  });
}

export async function speakText(
  text: string,
  speaker: 'assistant' | 'tosuni' | 'tosili' | 'toddungi',
  enabled = true,
  onSpeakingChange?: (speaking: boolean) => void
): Promise<void> {
  if (!enabled || !text.trim()) {
    onSpeakingChange?.(false);
    return;
  }

  stopCurrentSpeech();
  playBunnyChime(speaker, enabled);
  onSpeakingChange?.(true);

  try {
    const res = await tryBackendJson<{ audioBase64?: string; mimeType?: string; fallback?: boolean }>(
      '/api/gemini/tts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker, lang: 'ko' }),
      },
      4500
    );

    if (res.ok) {
      const data = res.data;
      if (data.audioBase64 && !data.fallback) {
        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        activeAudio = audio;
        const playedOk = await new Promise<boolean>((resolve) => {
          audio.onended = () => {
            activeAudio = null;
            onSpeakingChange?.(false);
            resolve(true);
          };
          audio.onerror = () => {
            activeAudio = null;
            resolve(false);
          };
          audio.play().catch(() => {
            activeAudio = null;
            resolve(false);
          });
        });

        if (playedOk) {
          return;
        }
      }
    }
  } catch {
    // Fall through to browser TTS
  }

  await speakWithBrowserFallback(text, speaker, 'ko-KR', onSpeakingChange);
}

/**
 * Pronounces kid-friendly English sentences or flashcard words clearly
 * for 3-7 year old learners using Gemini TTS (with crisp en-US browser fallback).
 */
export async function speakEnglishPhrase(
  englishText: string,
  speaker: 'assistant' | 'tosuni' | 'tosili' | 'toddungi' = 'tosuni',
  enabled = true,
  onSpeakingChange?: (speaking: boolean) => void
): Promise<void> {
  if (!enabled || !englishText.trim()) {
    onSpeakingChange?.(false);
    return;
  }

  stopCurrentSpeech();
  playBunnyChime(speaker, enabled);
  onSpeakingChange?.(true);

  try {
    const res = await tryBackendJson<{ audioBase64?: string; mimeType?: string; fallback?: boolean }>(
      '/api/gemini/tts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: englishText, speaker, lang: 'en' }),
      },
      4500
    );

    if (res.ok) {
      const data = res.data;
      if (data.audioBase64 && !data.fallback) {
        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        activeAudio = audio;
        const playedOk = await new Promise<boolean>((resolve) => {
          audio.onended = () => {
            activeAudio = null;
            onSpeakingChange?.(false);
            resolve(true);
          };
          audio.onerror = () => {
            activeAudio = null;
            resolve(false);
          };
          audio.play().catch(() => {
            activeAudio = null;
            resolve(false);
          });
        });

        if (playedOk) {
          return;
        }
      }
    }
  } catch {
    // Fall through to native en-US speechSynthesis
  }

  await speakWithBrowserFallback(englishText, speaker, 'en-US', onSpeakingChange);
}
