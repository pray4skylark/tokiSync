# ⚡️ TokiSync (토끼싱크) v1.5.0

**북토끼, 뉴토끼, 마나토끼**의 콘텐츠를 **구글 드라이브로 직접 업로드**하고, **전용 웹 뷰어**를 통해 편리하게 관리/열람할 수 있는 올인원 솔루션입니다.

> **🚀 v1.5.0 업데이트:**
> **Viewer 2.0 (Cinematic)**: Vue 3 + Tailwind 기반의 새로운 몰입형 뷰어가 적용되었습니다.
> **Unified Menu Modal**: 기존 메뉴를 직관적인 모달 UI로 통합하여 사용성을 개선했습니다.

---

## ✨ 주요 기능

### 📥 수집기 (UserScript) - v1.5.0

- **📱 통합 메뉴 모달 (New)**: `Ctrl+Shift+T` 또는 우측 하단 버튼으로 모든 기능을 한 곳에서 제어.
- **🚀 Direct Drive Access**: GAS 서버의 병목 없이 **구글 드라이브 API로 직접 데이터를 전송**합니다.
- **🛡️ 차단 방지 시스템**:
  - **Anti-Sleep**: 백그라운드에서도 멈춤 없이 다운로드가 지속됩니다.
  - **Captcha 감지**: Cloudflare/캡차 발생 시 자동으로 일시정지하고 알림을 보냅니다.
- **⚡️ Zero-Config 뷰어 연동**: 로컬/웹 뷰어 접속 시 API Key 자동 주입.
- **🔄 스마트 동기화**: 중복 없이 신규 회차만 다운로드.
- **☁️ 구글 드라이브 직통 업로드**: PC 저장공간 최소화.

### 📡 서버 (GAS API) - v1.3.0

- **🔑 OAuth 토큰 발급 (New)**: 클라이언트의 Direct Access를 위한 권한 위임.
- **🛡️ Fallback 시스템**: Direct Access 실패 시 기존 방식을 통한 안전한 중계 처리.
- **🔒 API Key 보안**: 전체 API 인증 강제.
- **📦 대용량 Resumable Upload**: 5GB+ 파일 지원.

### 📊 뷰어 2.0 (Cinematic Update) - v1.5.0

- **🎥 Cinematic Experience**: 글래스모피즘 UI와 몰입형 에피소드 상세 페이지 제공.
- **🚀 Tech Stack**: **Vue 3 + Tailwind CSS** 기반의 SPA 구조로 완전 개편.
- **📱 통합 엔진**: 웹툰/만화/소설 뷰어를 하나의 엔진으로 통합 및 오프라인 캐싱(Dexie.js) 지원.

---

## ⚙️ 설치 가이드 (Quick Start)

자세한 단계별 설치 방법은 **[INSTALL_GUIDE.md](./INSTALL_GUIDE.md)** 문서를 참고하세요.

### 1. 📡 GAS 서버 배포

1. `google_app_script/TokiSync_Server_Bundle.gs` 코드를 [Google Apps Script](https://script.google.com/)에 붙여넣습니다.
2. **프로젝트 설정** > **스크립트 속성**에서 `API_KEY`를 추가하고 원하는 비밀번호를 입력합니다.
3. `배포` > `새 배포` > `웹 앱` 선택 후 `Anyone (모든 사용자)` 권한으로 배포합니다.

### 2. 📥 UserScript 설치

1. [Tampermonkey](https://www.tampermonkey.net/) 확장 프로그램을 설치합니다.
2. `docs/tokiSync.user.js` 파일 내용을 복사하여 새 스크립트로 추가합니다.
3. 웹툰 사이트 접속 후 메뉴에서 **설정**을 열고 `GAS URL`, `Folder ID`, `API Key`를 입력합니다.

### 3. 📊 뷰어 실행

- **방법 A (로컬)**: `docs/` 폴더를 VS Code `Live Server` 등으로 엽니다.
- **방법 B (웹 호스팅)**: GitHub Pages 등을 통해 호스팅합니다.
- **연동**: UserScript가 실행 중인 브라우저로 뷰어에 접속하면 **자동으로 설정이 완료**됩니다.

---

## 📖 사용 방법

### ☁️ 다운로드

1. 웹툰/소설 리스트 페이지에 접속합니다.
2. Tampermonkey 메뉴에서 `☁️ 전체 다운로드` 또는 `N번째 회차부터`를 클릭합니다.
3. 우측 하단 로그창에서 진행 상황을 확인합니다.

### 👁️ 뷰어 감상

1. 뷰어 URL로 접속합니다.
2. (첫 접속 시) UserScript가 없다면 **설정 모달**에 API Key 등을 입력합니다.
3. 라이브러리에서 표지를 클릭하여 감상합니다.

---

## 📜 라이선스

[MIT License](./LICENSE). Use responsibly.
