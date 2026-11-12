# 🐰 토순이네 스마트 액자 (KIDS_Photo)

> **디지털 앨범과 아이의 상상력을 높이는 패밀리 스마트 프레임 & 인터랙티브 3D 비서**  
> Google 드라이브 · Microsoft OneDrive · Synology NAS 사진 폴더 연동, 음성 호출 AI 비서, 그리고 귀여운 3D 토순이/토실이/토뚱이가 함께하는 안드로이드 디지털 액자 앱입니다.

---

## 📱 주요 기능 (Key Features)

1. **스마트 디지털 액자 (Smart Photo Frame)**
   - 클라우드 앨범 연동 (Google Drive, OneDrive, Synology NAS WebDAV)
   - 부드러운 화면 전환 효과 (Ken Burns 줌/팬, 슬라이드, 페이드)
   - 사진 자동 분석 및 설명 생성 (Gemini 2.5 Flash Vision 기반)

2. **인터랙티브 3D 캐릭터 (Bunny 3D)**
   - Three.js 기반의 실시간 3D 토순이 캐릭터 렌더링
   - 날씨(비, 눈, 맑음, 번개)에 따른 실시간 날씨 이펙트 파티클
   - 아이 맞춤형 대화 및 칭찬 스티커 시스템

3. **AI 음성 비서 & 학습 지원**
   - 음성 호출 ("토순아", "안녕 토순아" 등)
   - 실시간 날씨, 미세먼지 정보 조회 (Open-Meteo)
   - 유아/어린이 맞춤형 단어 카드(Flashcard) 및 상호작용 학습

---

## 🛠️ 기술 스택 (Tech Stack)

- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite, Three.js, Lucide Icons, Framer Motion
- **Native Wrapper**: Capacitor 7 Android
- **Backend / AI Engine**: Node.js / Express, Google GenAI SDK (`@google/genai`, Gemini 2.5)
- **CI/CD**: GitHub Actions (자동 APK 빌드 및 `latest-apk` 릴리즈 배포)

---

## 🚀 빠른 시작 (Quick Start)

### 1. 웹 개발 모드 실행
```bash
# 의존성 설치
npm install --legacy-peer-deps

# 개발 서버 실행
npm run dev
```

### 2. 프로덕션 웹 빌드
```bash
npm run build
```

---

## 🤖 Android APK 빌드 안내 (Android Build)

### 방법 A: GitHub Actions 자동 빌드 (권장)
- `main` 브랜치에 코드가 푸시되면 `.github/workflows/android.yml`에 의해 **GitHub Actions가 자동으로 APK를 빌드**합니다.
- 빌드가 완료되면 저장소의 **[Releases (latest-apk)](https://github.com/bluewind201/KIDS_Photo/releases/tag/latest-apk)**에서 최신 `KIDS_Photo.apk` 파일을 즉시 다운로드할 수 있습니다.

### 방법 B: 로컬 환경에서 빌드
```bash
# 1. 웹 빌드 및 안드로이드 에셋 동기화
npm run build
npx cap sync android

# 2. 안드로이드 디버그 APK 빌드
cd android
./gradlew assembleDebug

# 빌드 결과 위치:
# android/app/build/outputs/apk/debug/app-debug.apk
```
