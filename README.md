# ⚡️ TokiSync (토끼싱크) v1.10.0

**북토끼, 뉴토끼, 마나토끼**의 콘텐츠를 **구글 드라이브로 직접 업로드**하고, **전용 웹 뷰어**를 통해 편리하게 관리/열람할 수 있는 올인원 솔루션입니다.

> **🚀 v1.10.0 업데이트 요약:**
> **파싱 규칙 가져오기(Import) 모달화 및 초기 데드락 완전 해결**: 신규 도메인/신규 설치 시 설정 메뉴를 열지 못해 교착 상태에 빠지는 문제를 해결하기 위해 선행 메뉴 등록 구조를 이식하고, 트리 에디터에 로컬 JSON 및 원격 URL을 선택하여 즉시 파싱 규칙을 복구/갱신할 수 있는 Glassmorphism 모달을 완비했습니다.

---

## ✨ 주요 기능

### 📥 수집기 (UserScript) - v1.10.0

- **🧩 지능형 제너릭 파서 (New)**: `idMatch` 하드코딩 완전 탈피, 카테고리 기반 Fallback ID 자동 탐색 및 정규식 동적 조립.
- **🛡️ 광고 이미지 원천 차단 (New)**: DOM 컨테이너 기반 수집 시 `imageRegex`와의 상호 배타성 검증 강화를 통한 광고 완벽 배제.
- **✨ Glassmorphism UI**: 블러(Blur) 효과와 반투명 레이아웃을 적용한 프리미엄 디자인 시스템.
- **🔄 Direct Sync Engine**: GAS를 거치지 않는 Direct Drive API v3 활용으로 이력 동기화 속도 3배 향상.
- **✅ 시각적 다운로드 표시**: 다운로드 완료 항목에 클래스 기반의 체크마크 및 오버레이 효과 적용.
- **🧩 Tree Rule Editor**: JSON 트리 구조로 파싱 규칙을 관리하고 즉시 테스트 가능한 전용 인터페이스.
- **⚙️ 소설 출력 포맷 선택**: EPUB 표준 포맷 및 일반 텍스트(TXT) 지원.

### 📡 서버 (GAS API) - v1.10.0

- **📚 읽기 이력 동기화**: `read_history.json`을 통한 기기 간 열람 이력 공유.
- **🔑 OAuth 토큰 발급**: 클라이언트의 Direct Access를 위한 고속 권한 위임.
- **📦 대용량 Resumable Upload**: 5GB+ 대용량 파일 지원 및 자가 회복 로직.

### 📊 뷰어 2.0 (Cinematic & Refined) - v1.10.0

- **📖 소설 전용 설정 (v2.9.2)**: 테마(Light/Sepia/Dark), 폰트 크기, 줄 간격 조절 기능을 포함한 플로팅 툴바 이식.
- **🎯 정밀 위치 동기화 (Locator)**: DOM 기반 정밀 트래킹으로 설정 변경이나 에피소드 전환 후에도 읽던 문단을 정확히 유지.
- **📏 가독성 최적화**: 표준 소설책 기준인 720px 가로폭 고정 및 반응형 레이아웃 적용.
- **🚀 Download Manager (Modal UI)**: 시청 중에도 진행 상황을 즉시 확인하고 제어할 수 있는 슬라이드업 모달 전용 UI.
- **⚡️ Zero-Waste Network**: 뷰어 종료/이동 시 지연 없는 즉시 저장(Flush) 및 불필요한 요청 중단.


---

## ⚙️ 설치 가이드 (Quick Start)

자세한 단계별 설치 방법은 **[설치 가이드 (INSTALL_GUIDE.md)](./documentation/guides/INSTALL_GUIDE.md)** 문서를 참고하세요.

### 1. 📡 GAS 서버 배포

1. **[TokiSync_Server_Bundle.gs (정식 버전)](https://pray4skylark.github.io/tokiSync/TokiSync_Server_Bundle.gs)** 코드를 복사하여 [Google Apps Script](https://script.google.com/)에 붙여넣습니다.
   - 🧪 *(선택 사항)* 최신 기능 사전 테스트를 원하시면 **[개발 빌드(Dev)](https://pray4skylark.github.io/tokiSync/dev/TokiSync_Server_Bundle.gs)** 코드를 사용하세요.
2. **프로젝트 설정** > **스크립트 속성**에서 `API_KEY`를 추가하고 원하는 비밀번호를 입력합니다.
3. `배포` > `새 배포` > `웹 앱` 선택 후 `Anyone (모든 사용자)` 권한으로 배포합니다.

### 2. 📥 UserScript (수집기) 설치

1. 브라우저에 [Tampermonkey](https://www.tampermonkey.net/) 확장 프로그램을 설치합니다.
2. 다음 링크 중 하나를 선택하여 UserScript를 설치합니다:
   - 🌟 **[TokiSync UserScript (Stable 정식 버전)](https://pray4skylark.github.io/tokiSync/tokiSync.user.js)** (권장)
   - 🧪 **[TokiSync UserScript (Dev 개발 빌드)](https://pray4skylark.github.io/tokiSync/dev/tokiSync.user.js)** (최신 기능 테스트)
3. 웹툰 사이트 접속 후 메뉴에서 **설정**을 열고 `GAS URL`, `Folder ID`, `API Key`를 입력합니다.

### 3. 📊 뷰어 실행

- 🌟 **[TokiSync 웹 뷰어 (Stable 정식 버전)](https://pray4skylark.github.io/tokiSync/)** (권장)
- 🧪 **[TokiSync 웹 뷰어 (Dev 개발 빌드)](https://pray4skylark.github.io/tokiSync/dev/)** (최신 기능 테스트)

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

## 📂 문서 지도 (Documentation Map)

프로젝트에 대한 더 자세한 정보는 `documentation/` 폴더 내의 문서들을 확인하세요.

- **[가이드 (Guides)](./documentation/guides/)**: [설치 방법](./documentation/guides/INSTALL_GUIDE.md), [동적 파싱 규칙 작성](./documentation/guides/DYNAMIC_RULE_GUIDE.md) 등
- **[보고서 (Reports)](./documentation/reports/)**: 최신 릴리즈 분석, 리팩토링 보고서, 워크스루 등
- **[아카이브 (Archive)](./documentation/archive/)**: 과거 업데이트 이력, 참고 자료 등

---

## 📜 라이선스

[MIT License](./LICENSE). Use responsibly.
