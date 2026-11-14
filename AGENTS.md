# 📋 KIDS_Photo 워크스페이스 AI 개발 가이드 (Single-Agent End-to-End)

본 워크스페이스(`C:\ai\KIDS_Photo`)에서 작업하는 AI 에이전트(Antigravity, Claude Code, Codex, Paseo)는 다음 개발 가이드를 준수한다.

---

## 1. 🚀 역할 분리 폐지 및 개별 AI 단독 진행
- 개발자·디자이너·리뷰어 등으로 역할을 나누어 에이전트를 생성하던 기존 룰을 전면 폐지한다.
- 배정받은 **단일 AI가 UI/UX 디자인, 프론트엔드, 백엔드, 테스트, 로컬 PC 빌드 및 패키징/배포까지 단독으로 완수**한다.

## 2. 🧠 Obsidian AI 메모리 필수 참조 및 최신화
- **개발 전 확인**:
  - `C:\obsidian\sync_folder\AI 메모리\00_AI_메모리_시스템_가이드.md`
  - `C:\obsidian\sync_folder\AI 메모리\02_인프라_빌드_런타임_자산_메모리.md`
  - `C:\obsidian\sync_folder\GIT 프로젝트\12_KIDS_Photo.md`
- **개발 후 반영**:
  - 코드/기능 변경 사항을 `C:\obsidian\sync_folder\GIT 프로젝트\12_KIDS_Photo.md`와 `C:\obsidian\sync_folder\AI 메모리\06_업데이트_및_변경_이력_로그.md`에 갱신한다.

## 3. 🏢 Main AI 지시 수행 및 결과만 간결히 보고
- **Main AI (`C:\ai`)**가 본 워크스페이스에 지시하면, 본 워크스페이스 안에서 단독으로 작업을 완료하고 **최종 결과만 Main AI에게 간결하게 보고**한다:
  ``markdown
  ### [작업 완료] KIDS_Photo - {작업 요약}
  - **상태**: SUCCESS | FAILED
  - **변경 파일**: `주요 수정/생성 파일 경로`
  - **검증 결과**: `테스트 및 로컬 PC 빌드/배포 결과 요약`
  - **Obsidian 메모리 반영**: `갱신한 문서 경로`
  - **비고/잔여 이슈**: 없음 (또는 1줄 요약)
  ``

## 4. 📱 Android APK 빌드·배포 및 설치 차단 방지 필수 수칙 (전 워크스페이스 공통)
스토어 외부(GitHub Release `latest-apk` 등)로 배포되는 모든 Android 앱은 안드로이드/갤럭시(One UI Auto Blocker 및 Google Play 프로텍트 '향상된 사기 방지 EFP') 설치 차단을 막기 위해 다음 수칙을 엄격히 준수한다:
1. **사이드로딩 차단 민감 권한 절대 사용 금지**:
   - `RECEIVE_SMS`, `READ_SMS` (문자 수신/읽기), `BIND_NOTIFICATION_LISTENER_SERVICE` (알림 접근 리스너), `BIND_ACCESSIBILITY_SERVICE` (접근성 서비스) 권한은 스토어 외부 APK에서 보이스피싱·스미싱 위험 앱으로 분류되어 **설치 자체가 강제 차단**되므로 `AndroidManifest.xml`에 절대 선언하지 않는다.
   - 문자나 SNS/알림을 읽어오는 기능 및 금융 결제문자 파싱 키워드(`[Web발신]`, `승인`, `일시불`, `잔액` 등)도 온디바이스 휴리스틱 차단을 유발하므로 앱 내부에 포함하지 않는다.
2. **오버레이(`SYSTEM_ALERT_WINDOW`) + 자체 패키지 설치(`REQUEST_INSTALL_PACKAGES`) 동시 사용 금지**:
   - `SYSTEM_ALERT_WINDOW`를 사용하는 앱에 `REQUEST_INSTALL_PACKAGES` / `UPDATE_PACKAGES_WITHOUT_USER_ACTION` (`PackageInstaller` 자체 설치)을 함께 넣으면 Play 프로텍트가 **드로퍼(Dropper) 악성코드**로 분류해 설치를 차단하므로 동시 사용을 금지한다.
3. **로컬 PC 고정 릴리스 키스토어(`C:\BuildToolset\signing\`) 서명 및 `versionCode` 자동 증가 필수**:
   - 임시 `debug.keystore` 빌드를 업로드하면 기존 설치본과 서명 불일치(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) 및 버전 다운그레이드로 설치가 거부된다.
   - 반드시 **로컬 PC 고정 릴리스 키스토어(`C:\BuildToolset\signing\<app>-release.jks`)**와 **자동 증가 `versionCode`(`C:\BuildToolset\signing\version-codes.json` / `scripts\build-and-release.ps1`)**로 빌드·서명된 APK만 배포한다.

## 5. 🖥️ GitHub Actions 폐지 및 로컬 PC 단독 빌드·배포 원칙 (Local PC Build-Only Policy)
- **GitHub Actions 사용 금지**:
  - GitHub Actions 용량/쿼터 제한으로 인해 전 저장소의 GitHub Actions 워크플로우는 비활성화(`disabled_manually`)되었으며, 모든 빌드·서명·배포 환경이 **로컬 PC(`C:\BuildToolset`)로 완전 이관**되었다.
  - 앞으로 어떤 작업도 GitHub Actions에 빌드를 위임하지 않고, **반드시 로컬 PC에서 직접 빌드·테스트·서명·배포를 수행**한다.
- **로컬 PC 표준 빌드·배포 도구**:
  - 환경 로더: `. C:\BuildToolset\setenv.ps1`
  - Android 앱 빌드·배포: 각 워크스페이스의 `scripts\build-and-release.ps1` (또는 `C:\ai\Vaulta\native\android\build-apk.ps1`)
  - Windows 네이티브 빌드·배포: `C:\ai\JUMPGATE\scripts\release\publish-github-release.ps1` 또는 `C:\ai\.team\dev\build-windows-targets.ps1`
  - Docker Hub 이미지 로컬 빌드·푸시: `powershell -ExecutionPolicy Bypass -File C:\BuildToolset\build-and-push-docker.ps1 -Workspace KIDS_Photo`