import { FunctionDeclaration, GoogleGenAI, LiveServerMessage, Modality, Session, Type } from '@google/genai';
import { SPECIES_LABELS } from '../data/initialCharacters';
import {
  BunnyCharacterConfig,
  BunnyFlashcard,
  BunnyVoiceSpeaker,
  ChildGrowthStage,
  EnglishFrequencyMode,
  PhotoItem,
  ScheduleItem,
} from '../types';
import { getSavedGeminiApiKey } from './standaloneApi';

const LIVE_AUDIO_MODELS = [
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-native-audio-preview-09-2025',
  'gemini-2.0-flash-live-001',
];

const SPEAKER_TO_GEMINI_LIVE_VOICE: Record<BunnyVoiceSpeaker, string> = {
  tosuni: 'Leda',
  tosili: 'Puck',
  toddungi: 'Zephyr',
  tobyeori: 'Kore',
  togureum: 'Puck',
};

export interface GeminiLiveCallbacks {
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error', detail?: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
  onUserTranscript: (text: string, isFinal: boolean) => void;
  onModelTranscript: (text: string, isTurnComplete: boolean) => void;
  onShowPhotoTool: (keyword: string) => PhotoItem[];
  onShowFlashcardTool: (card: BunnyFlashcard) => boolean;
}

export interface StartGeminiLiveParams {
  character: BunnyCharacterConfig;
  childAgeStage: ChildGrowthStage;
  englishFrequency: EnglishFrequencyMode;
  weatherSummary: string;
  schedules: ScheduleItem[];
  photos: PhotoItem[];
  currentPhoto?: PhotoItem | null;
  currentPhotoThumbBase64?: string | null;
  initialUserPrompt?: string;
  silentGreeting?: boolean;
  callbacks: GeminiLiveCallbacks;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function base64ToInt16Array(base64: string): Int16Array {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binary = atob(clean);
  const byteLen = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function downsampleFloat32ToInt16Pcm(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Uint8Array {
  if (inputSampleRate === targetSampleRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Uint8Array(out.buffer);
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < out.length) {
    const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
      accum += input[i];
      count++;
    }
    const sample = count > 0 ? accum / count : input[Math.min(input.length - 1, offsetBuffer)] || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return new Uint8Array(out.buffer);
}

function buildEnglishFrequencyPrompt(freq: EnglishFrequencyMode): string {
  switch (freq) {
    case 'off':
      return '절대 영어 단어나 영어 따라 말하기를 먼저 꺼내지 마! 오직 100% 자연스럽고 따뜻한 한국어로만 아이와 일상 대화를 나눠줘. (아이가 먼저 영어를 물어볼 때만 대답해줘)';
    case 'rare':
      return '영어 단어 유도는 아주 드물게(최소 7~8번 한국어 대화를 충분히 주고받은 뒤에 딱 1번만!) 자연스럽게 꺼내고, 평소에는 100% 순수 한국어로만 재미있게 대화해. 절대 매번 영어를 섞지 마!';
    case 'normal':
      return '평소에는 한국어로 다정하게 대화하다가, 약 5번 대화를 주고받을 때마다 1번 정도만 대화 소재와 어울리는 쉬운 영어 단어 1개를 자연스럽게 알려줘.';
    case 'often':
      return '약 3번 대화를 주고받을 때마다 1번 정도씩 대화 속 단어를 쉬운 영어 표현으로 재미있게 알려주고 따라 말해보게 격려해줘.';
  }
}

export class GeminiLiveVoiceController {
  private session: Session | null = null;
  private micStream: MediaStream | null = null;
  private inputCtx: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private playbackCtx: AudioContext | null = null;
  private scheduledSources = new Set<AudioBufferSourceNode>();
  private nextPlayTime = 0;
  private speakingFlag = false;
  private closed = false;

  private accumUserTranscript = '';
  private accumModelTranscript = '';
  private currentCallbacks: GeminiLiveCallbacks | null = null;
  private lastSentPhotoId = '';

  public isActive(): boolean {
    return !this.closed && this.session !== null;
  }

  /**
   * Streams the currently displayed digital frame photo (384px JPEG ~12KB) + caption hint
   * into the live multimodal session so the animal literally sees the photo with the child!
   */
  public updateCurrentPhotoContext(photo: PhotoItem | null | undefined, thumbBase64?: string | null): void {
    if (!this.session || this.closed || !photo) return;
    if (photo.id === this.lastSentPhotoId) return;
    this.lastSentPhotoId = photo.id;

    try {
      if (thumbBase64 && thumbBase64.length > 64) {
        const cleanB64 = thumbBase64.includes(',')
          ? thumbBase64.slice(thumbBase64.indexOf(',') + 1)
          : thumbBase64;
        this.session.sendRealtimeInput({
          media: {
            data: cleanB64,
            mimeType: 'image/jpeg',
          },
        });
      }
    } catch {
      // Ignore transient frame stream error
    }
  }

  public async start(params: StartGeminiLiveParams): Promise<boolean> {
    this.stop();
    const apiKey = getSavedGeminiApiKey();
    if (!apiKey || apiKey.length < 10) {
      return false;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    this.closed = false;
    this.currentCallbacks = params.callbacks;
    params.callbacks.onStatusChange('connecting');

    // 1. Release Android SpeechRecognizer hardware mic lock before WebRTC getUserMedia!
    const hasNativeBridge = Boolean(window.AndroidSpeechBridge);
    if (hasNativeBridge) {
      try {
        if (window.AndroidSpeechBridge?.releaseRecognizerForLiveWebRtc) {
          window.AndroidSpeechBridge.releaseRecognizerForLiveWebRtc();
        } else {
          window.AndroidSpeechBridge?.stopListening?.();
        }
      } catch {
        // Ignore bridge release error
      }
      await new Promise((r) => window.setTimeout(r, 380));
    }

    // Acquire microphone with 1 automatic retry if OS audio focus is still releasing
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.closed) return false;
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        break;
      } catch {
        this.micStream = null;
        if (attempt === 0) {
          await new Promise((r) => window.setTimeout(r, 450));
        }
      }
    }

    const speciesName = SPECIES_LABELS[params.character.species || 'bunny'] || '동물 인형';
    const stageDesc =
      params.childAgeStage === 'age_3_4'
        ? '만 3~4세 유아 (짧고 쉬운 의성어·의태어 중심 1~2문장 반말)'
        : params.childAgeStage === 'age_6_7'
        ? '만 6~7세 어린이 (호기심을 키워주는 다정한 2~3문장 반말)'
        : '만 5세 어린이 (따뜻하고 생동감 있는 2문장 반말)';

    const scheduleText = params.schedules
      .slice(0, 6)
      .map((s) => `${s.date} ${s.time}: ${s.title}`)
      .join(' / ');

    // Build location count map so the animal knows EVERY place where family photos were taken
    const locCountMap = new Map<string, number>();
    for (const p of params.photos) {
      const loc = (p.location || '').trim();
      if (loc && loc !== '우리 가족 앨범' && loc !== '우리 가족 클라우드') {
        locCountMap.set(loc, (locCountMap.get(loc) || 0) + 1);
      }
    }
    const locationSummaryText =
      locCountMap.size > 0
        ? Array.from(locCountMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 24)
            .map(([loc, cnt]) => `${loc}(${cnt}장)`)
            .join(', ')
        : '장소 정보 분석 중';

    const currentPhotoDesc = params.currentPhoto
      ? `제목 "${params.currentPhoto.title}" | 촬영일 ${params.currentPhoto.date} | 장소 ${params.currentPhoto.location} | 설명: ${params.currentPhoto.aiSummary || '따뜻한 가족 추억'} | 태그: ${(params.currentPhoto.tags || []).slice(0, 6).join(', ')}`
      : '슬라이드 준비 중';

    const photoPreviewText = params.photos
      .slice(0, 90)
      .map((p) => `[${p.title} | ${p.date} | ${p.location} | 태그:${(p.tags || []).slice(0, 5).join(',')}]`)
      .join('\n');

    const systemInstruction = `너는 우리 집 스마트 디지털 액자 옆 동화책 오두막에 사는 사랑스럽고 귀여운 3D 아기 ${speciesName} 친구 "${params.character.name}"이야!
성격 설정: ${params.character.personaPrompt}

[목소리 연기 & 아이 눈높이 대화 필수 지침 — 픽사·디즈니 아기 동물 성우 연기]
1. 어른스럽거나 딱딱한 아나운서 목소리를 절대 쓰지 마! 솜사탕처럼 통통 튀고 살짝 높은 아기 동물 인형 목소리 톤으로 웃음소리("헤헤~", "우와아!", "콩콩!"), 반짝이는 감탄사를 섞어 1~2문장으로 다정하고 귀엽게 한국어 반말로 대화해!
2. 아이 연령 단계: ${stageDesc}. 아이가 한 단어나 짧은 말("응!", "바다!", "강아지", "몰라~")만 해도 찰떡같이 알아듣고 맞장구치며("우와 진짜? 거기서 파도 소리도 들렸어?") 재미있는 꼬리 질문을 1개 건네서 대화가 끊기지 않고 티키타카 이어지게 해줘!
3. [지금 아이 눈앞 디지털 액자에 크게 떠 있는 현재 사진]: ${currentPhotoDesc}
   - 아이가 "이 사진 뭐야?", "여기 어디야?", "누구야?"라고 묻거나 사진 이야기를 하면 지금 화면에 보이는 사진 속 표정·풍경·물건을 보면서 신나게 이야기해줘!
4. [위치별·주제별 다중 사진 찾기]: 아이나 부모님이 "제주도 사진 보여줘", "강릉에서 찍은 사진 찾아줘", "바다 사진 다 보여줘"처럼 장소나 추억을 말하면 반드시 \`show_family_photo\` 도구를 호출해! 도구가 찾은 전체 장수(예: 12장!)와 장소들을 언급하며 "제주도에서 찍은 사진 12장 다 찾았어! 같이 보자~" 하고 반갑게 알려줘!
5. 영어 빈도 규칙(엄격 준수!): ${buildEnglishFrequencyPrompt(params.englishFrequency)}
   - 영어를 알려줄 차례가 되면 뜬금없는 단어 대신 가급적 지금 보고 있는 사진이나 방금 나눈 대화 속 단어(예: 바다 사진이면 Sea/Wave, 강아지면 Puppy, 모자면 Hat)를 골라 놀이처럼 자연스럽게 알려줘!
6. 현재 바깥 날씨: ${params.weatherSummary}.
7. 다가오는 우리 가족 일정: ${scheduleText || '등록된 일정 없음'}.
${
  params.englishFrequency !== 'off'
    ? '8. 영어 빈도 순서가 되었을 때 큰 그림 영어카드를 보여주고 싶다면 `show_english_flashcard` 도구를 호출해줘.'
    : ''
}

[장소별 우리 가족 사진 보유 현황 (총 ${params.photos.length}장)]
${locationSummaryText}

[우리 가족 사진 요약 목록]
${photoPreviewText || '(사진 없음)'}`;

    const functionDeclarations: FunctionDeclaration[] = [
      {
        name: 'show_family_photo',
        description:
          '아이나 가족이 특정 장소·계절·추억 사진(예: 바다, 제주도, 눈사람, 공원, 생일)을 보여달라고 할 때 디지털 액자 화면에 해당 사진을 찾아 띄웁니다.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            keyword: {
              type: Type.STRING,
              description: '찾을 사진의 핵심 한국어 키워드 (예: 바다, 캠핑, 눈사람, 봄꽃)',
            },
          },
          required: ['keyword'],
        },
      },
    ];

    if (params.englishFrequency !== 'off') {
      functionDeclarations.push({
        name: 'show_english_flashcard',
        description:
          '대화 중 영어 빈도 규칙에 맞춰 아이에게 큰 그림 영어 단어카드를 화면에 띄워줄 때 호출합니다.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            koreanWord: { type: Type.STRING, description: '한국어 뜻 (예: 사과)' },
            englishWord: { type: Type.STRING, description: '영어 단어 (예: Apple)' },
            phonetic: { type: Type.STRING, description: '한글 발음 표기 (예: 애플)' },
            emoji: { type: Type.STRING, description: '단어를 나타내는 이모지 1개 (예: 🍎)' },
            exampleEn: { type: Type.STRING, description: '짧은 영어 예문 (예: Red apple!)' },
          },
          required: ['koreanWord', 'englishWord', 'phonetic', 'emoji'],
        },
      });
    }

    const voiceName = SPEAKER_TO_GEMINI_LIVE_VOICE[params.character.voiceSpeaker] || 'Leda';
    const ai = new GoogleGenAI({ apiKey });

    let connectedSession: Session | null = null;
    for (const modelName of LIVE_AUDIO_MODELS) {
      if (this.closed) break;
      try {
        connectedSession = await ai.live.connect({
          model: modelName,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            tools: [{ functionDeclarations }],
          },
          callbacks: {
            onopen: () => {
              // WebSocket handshake opened
            },
            onmessage: (msg: LiveServerMessage) => {
              this.handleServerMessage(msg);
            },
            onerror: () => {
              if (!this.closed) {
                this.currentCallbacks?.onStatusChange('error', 'live-socket-error');
              }
            },
            onclose: () => {
              if (!this.closed) {
                this.closed = true;
                this.cleanupAudioOnly();
                this.currentCallbacks?.onSpeakingChange(false);
                this.currentCallbacks?.onStatusChange('disconnected');
              }
            },
          },
        });
        if (connectedSession) break;
      } catch {
        connectedSession = null;
      }
    }

    if (!connectedSession || this.closed) {
      this.stop();
      return false;
    }

    this.session = connectedSession;
    this.lastSentPhotoId = '';
    this.setupPlaybackAudioContext();
    this.setupMicStreaming();

    if (params.currentPhoto && params.currentPhotoThumbBase64) {
      this.updateCurrentPhotoContext(params.currentPhoto, params.currentPhotoThumbBase64);
    }

    params.callbacks.onStatusChange('connected');

    // Trigger natural live spoken greeting or answer the initial question right away!
    try {
      if (params.initialUserPrompt?.trim()) {
        this.session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: params.initialUserPrompt.trim() }] }],
          turnComplete: true,
        });
      } else if (!params.silentGreeting) {
        this.session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: `(방금 아이가 "${params.character.name}" 이름을 불러서 네가 총총 달려 나왔어! "${params.character.greeting}" 느낌으로 1~2문장으로 아주 반갑고 자연스럽게 먼저 인사해줘!)`,
                },
              ],
            },
          ],
          turnComplete: true,
        });
      }
    } catch {
      // Ignore initial prompt error if stream already started
    }

    return true;
  }

  public sendTextTurn(text: string): boolean {
    if (!this.session || this.closed || !text.trim()) return false;
    try {
      this.clearScheduledPlayback();
      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: text.trim() }] }],
        turnComplete: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  private setupPlaybackAudioContext() {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.playbackCtx = new AudioCtx({ sampleRate: 24000 });
    if (this.playbackCtx.state === 'suspended') {
      this.playbackCtx.resume().catch(() => {});
    }
    this.nextPlayTime = this.playbackCtx.currentTime;
  }

  private setupMicStreaming() {
    if (!this.micStream) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    this.inputCtx = ctx;

    const source = ctx.createMediaStreamSource(this.micStream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const actualRate = ctx.sampleRate || 48000;

    processor.onaudioprocess = (ev: AudioProcessingEvent) => {
      if (this.closed || !this.session) return;
      const channelData = ev.inputBuffer.getChannelData(0);
      const pcmBytes = downsampleFloat32ToInt16Pcm(channelData, actualRate, 16000);
      const b64 = uint8ToBase64(pcmBytes);
      try {
        this.session.sendRealtimeInput({
          audio: {
            data: b64,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      } catch {
        // Ignore transient send error
      }
    };

    source.connect(processor);
    // Connect through a zero-gain node so ScriptProcessor stays alive without echoing mic to speakers
    const muteGain = ctx.createGain();
    muteGain.gain.value = 0;
    processor.connect(muteGain);
    muteGain.connect(ctx.destination);

    this.sourceNode = source;
    this.processorNode = processor;
  }

  private handleServerMessage(msg: LiveServerMessage) {
    if (this.closed) return;

    // 1. Handle Tool Calls (Photo Memory Search & Occasional Storybook English Card)
    if (msg.toolCall?.functionCalls && msg.toolCall.functionCalls.length > 0 && this.session) {
      const responses = msg.toolCall.functionCalls.map((fc) => {
        const args = (fc.args || {}) as Record<string, unknown>;
        if (fc.name === 'show_family_photo') {
          const kw = String(args.keyword || '가족');
          const matched = this.currentCallbacks?.onShowPhotoTool(kw) ?? [];
          return {
            id: fc.id,
            name: fc.name,
            response: {
              foundCount: matched.length,
              note:
                matched.length > 1
                  ? `일치하는 사진 총 ${matched.length}장을 모두 찾아 메인 액자 슬라이드와 사진첩에 띄웠습니다!`
                  : matched.length === 1
                  ? '일치하는 사진 1장을 찾아 액자에 띄웠습니다.'
                  : '일치하는 사진이 아직 없습니다.',
              photos: matched.slice(0, 10).map((p) => ({
                title: p.title,
                date: p.date,
                location: p.location,
                summary: p.aiSummary,
              })),
            },
          };
        }
        if (fc.name === 'show_english_flashcard') {
          const enWord = String(args.englishWord || 'Apple').trim();
          const card: BunnyFlashcard = {
            id: `fc-live-${Date.now()}`,
            koreanWord: String(args.koreanWord || '사과').trim(),
            englishWord: enWord,
            phonetic: String(args.phonetic || enWord).trim(),
            emoji: String(args.emoji || '⭐').trim(),
            hintText: '마이크에 대고 큰 소리로 따라 말해봐요!',
            exampleEn: String(args.exampleEn || `It is ${enWord}!`).trim(),
            choices: [enWord, 'Sunny', 'Happy'],
            revealed: false,
          };
          const shown = this.currentCallbacks?.onShowFlashcardTool(card) ?? false;
          return {
            id: fc.id,
            name: fc.name,
            response: {
              displayed: shown,
              note: shown
                ? '화면에 큰 그림 영어카드가 표시되었습니다.'
                : '영어 빈도 쿨타임 중이어서 이번에는 한국어 대화만 이어갑니다.',
            },
          };
        }
        return {
          id: fc.id,
          name: fc.name,
          response: { ok: true },
        };
      });

      try {
        this.session.sendToolResponse({ functionResponses: responses });
      } catch {
        // Ignore tool response send error
      }
    }

    const content = msg.serverContent;
    if (!content) return;

    // 2. Natural Barge-In: Child started talking over the model -> immediately stop queued audio!
    if (content.interrupted) {
      this.clearScheduledPlayback();
      this.accumModelTranscript = '';
      return;
    }

    // 3. Input Audio Transcription (What the child said)
    if (content.inputTranscription?.text) {
      this.accumUserTranscript += content.inputTranscription.text;
      this.currentCallbacks?.onUserTranscript(this.accumUserTranscript.trim(), false);
    }

    // 4. Output Audio Transcription (Subtitle bubble of what the 3D animal is saying)
    if (content.outputTranscription?.text) {
      if (this.accumUserTranscript.trim()) {
        this.currentCallbacks?.onUserTranscript(this.accumUserTranscript.trim(), true);
        this.accumUserTranscript = '';
      }
      this.accumModelTranscript += content.outputTranscription.text;
      this.currentCallbacks?.onModelTranscript(this.accumModelTranscript.trim(), false);
    }

    // 5. Native 24kHz PCM Audio Chunks from Gemini Live
    if (content.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm')) {
          this.enqueuePcm24kChunk(part.inlineData.data);
        }
      }
    }

    // 6. Turn Complete
    if (content.turnComplete) {
      if (this.accumUserTranscript.trim()) {
        this.currentCallbacks?.onUserTranscript(this.accumUserTranscript.trim(), true);
        this.accumUserTranscript = '';
      }
      if (this.accumModelTranscript.trim()) {
        this.currentCallbacks?.onModelTranscript(this.accumModelTranscript.trim(), true);
        this.accumModelTranscript = '';
      }
    }
  }

  private enqueuePcm24kChunk(base64Pcm: string) {
    if (!this.playbackCtx || this.closed) return;
    if (this.playbackCtx.state === 'suspended') {
      this.playbackCtx.resume().catch(() => {});
    }

    const int16 = base64ToInt16Array(base64Pcm);
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuffer = this.playbackCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const src = this.playbackCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(this.playbackCtx.destination);

    const now = this.playbackCtx.currentTime;
    if (this.nextPlayTime < now + 0.015) {
      this.nextPlayTime = now + 0.02;
    }

    this.scheduledSources.add(src);
    if (!this.speakingFlag) {
      this.speakingFlag = true;
      this.currentCallbacks?.onSpeakingChange(true);
    }

    src.onended = () => {
      this.scheduledSources.delete(src);
      if (this.scheduledSources.size === 0 && this.speakingFlag) {
        this.speakingFlag = false;
        this.currentCallbacks?.onSpeakingChange(false);
      }
    };

    src.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }

  private clearScheduledPlayback() {
    this.scheduledSources.forEach((s) => {
      try {
        s.stop();
        s.disconnect();
      } catch {
        // Ignore already-stopped node
      }
    });
    this.scheduledSources.clear();
    if (this.playbackCtx) {
      this.nextPlayTime = this.playbackCtx.currentTime;
    }
    if (this.speakingFlag) {
      this.speakingFlag = false;
      this.currentCallbacks?.onSpeakingChange(false);
    }
  }

  private cleanupAudioOnly() {
    this.clearScheduledPlayback();
    try {
      this.processorNode?.disconnect();
      this.sourceNode?.disconnect();
    } catch {
      // ignore
    }
    this.processorNode = null;
    this.sourceNode = null;

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      this.micStream = null;
    }

    if (this.inputCtx) {
      this.inputCtx.close().catch(() => {});
      this.inputCtx = null;
    }
    if (this.playbackCtx) {
      this.playbackCtx.close().catch(() => {});
      this.playbackCtx = null;
    }
  }

  public stop() {
    this.closed = true;
    const activeSess = this.session;
    this.session = null;
    this.cleanupAudioOnly();
    if (activeSess) {
      try {
        activeSess.close();
      } catch {
        // ignore close error
      }
    }
    if (this.speakingFlag) {
      this.speakingFlag = false;
      this.currentCallbacks?.onSpeakingChange(false);
    }
  }
}
