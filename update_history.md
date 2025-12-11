# 📜 TokiSync Update History

## 📥 Client (Tampermonkey)

### v3.0.0-beta.251211 (CalVer Transition) - 2025.12.11

- **[Core]** 자체 캐싱(`GM_setValue`) 도입으로 로딩 속도 비약적 향상.
- **[Protocol]** `Ping-Pong` 핸드쉐이크 도입으로 연결 안정성 확보.
- **[Policy]** 버전 태그 정책을 날짜 기반(CalVer)으로 변경.
- **[Refactor]** 불필요한 Timestamp 파라미터 제거 (CDN 캐싱 최적화).

### v3.0.0-BETA8 (Hotfix) - 2025.12.10

- **[Hotfix]** CDN(jsdelivr) 캐시 문제 해결을 위한 버전 범프 (`BETA7` -> `BETA8`).

* **[Doc]** 프로젝트 규칙(`project_rules.md`) 및 배포 가이드라인 수립.

### v2.2.1 (Remote Execution) - 2025.12.03

- **[New]** **TokiView 원격 실행 지원**:
  - URL 파라미터 `?toki_action=sync`가 있으면 자동으로 동기화를 시작합니다.
  - TokiView 대시보드에서 버튼 클릭 한 번으로 동기화를 수행할 수 있습니다.

### v2.2.0 (Manual Update) - 2025.12.03

- **[New]** **수동 업데이트 제어 기능**:
  - 이제 로더가 자동으로 업데이트를 적용하지 않습니다.
  - 새 버전이 발견되면 Tampermonkey 메뉴에 `✨ 업데이트 가능 (vX.X.X)` 버튼이 나타납니다.
  - 사용자가 해당 메뉴를 클릭해야만 업데이트가 적용됩니다.
  - 원하는 시점에 안정적으로 업데이트할 수 있습니다.

### v2.1.0 (Auto-Update) - 2025.12.03

- **[New]** **자동 버전 감지 기능 탑재**:
  - 로더가 GitHub API를 통해 최신 버전을 자동으로 확인합니다.
  - 이제 코어 업데이트 시 로더를 재설치할 필요가 없습니다.
  - API 호출 제한 방지를 위해 1시간 캐싱이 적용됩니다.

### v2.0.5 (JSZip Fix) - 2025.12.02

- **[Fix]** `JSZip is not defined` 오류 해결.
- **[Fix]** 로더에서 코어 스크립트로 `JSZip` 객체를 명시적으로 전달하도록 수정.

### v2.0.4 (Scope Fix) - 2025.12.02

- **[Fix]** `new Function` 실행 시 `window` 객체 스코프 문제 해결 (명시적 전달).

### v2.0.3 (Cache Fix) - 2025.12.02

- **[Fix]** jsDelivr 캐시 문제로 구버전 스크립트가 로드되는 현상 해결 (Cache Busting 추가).
- **[Fix]** 스크립트 내용 검증 로직 추가.

### v2.0.2 (Safe Loader) - 2025.12.02

- **[Refactor]** `eval` 사용을 제거하고 `new Function` + `window` 전역 변수 방식으로 변경.
- **[Breaking]** 코어 스크립트(`tokiSyncCore.js`) 구조 변경 (`window.TokiSyncCore` 할당 필수).

### v2.0.1 (Loader Fix) - 2025.12.02

- **[Fix]** 로더가 코어 스크립트를 실행하지 못하는 버그 수정 (`eval` 적용).
- **[Note]** GitHub에 있는 `v2.0.0` 코어 파일은 그대로 사용 가능 (로더만 업데이트하면 됨).

### v2.0.0 (Remote Loader) - 2025.12.02

- **[New] Remote Loader Architecture**:
  - 클라이언트 스크립트(`tokiSyncScript.js`)를 경량화된 **Loader**로 변경.
  - 핵심 로직(`tokiSyncCore.js`)은 **GitHub CDN**을 통해 실시간으로 로드.
  - 사용자는 스크립트 재설치 없이 최신 기능을 바로 적용받을 수 있음.
- **[Rollback]**: 안정성을 위해 v1.6.2 기반의 로직으로 복귀 (업데이트 확인 기능 제거).

### v1.7.3 (Iframe Update Check) - 2025.12.01

- **[New]** `checkAllLibraryUpdates` 기능 추가 (Iframe 방식).
- **[Fix]** XHR 방식의 부정확한 파싱 문제 해결.

### v1.7.2 (Sync Check Persistence) - 2025.12.01

- **[New]** `update_library_status` API 연동.
- **[New]** 업데이트 확인 결과를 `library_index.json`에 영구 저장.

### v1.7.1 (Bug Fix) - 2025.12.01

- **[Fix]** `checkAllLibraryUpdates`에서 `last_episode` 속성명 불일치 수정.

### v1.7.0 (Library Update Check) - 2025.12.01

- **[New]** 전체 라이브러리 업데이트 확인 기능 추가.
- **[New]** `GM_registerMenuCommand`에 업데이트 확인 메뉴 추가.

### v1.6.2 (Error Log in Zip) - 2025.12.01

- **[New]** 다운로드 중 누락된 이미지가 있을 경우, ZIP 파일 내에 `!MISSING_FILES_LOG.txt` 생성.
- **[Fix]** 404 에러 발생 시 다운로드가 멈추지 않고 스킵하도록 개선.

### v1.6.1 (Captcha Pause) - 2025.11.30

- **[New]** 다운로드 중 캡차/Cloudflare 감지 시 일시 정지 기능 추가.
- **[UI]** 상태창에 "캡차 해결 완료" 버튼 추가.

### v1.6.0 (Status UI) - 2025.11.30

- **[New]** 화면 우측 하단에 진행 상태를 보여주는 플로팅 UI 추가.
- **[New]** 백그라운드 실행을 위한 오디오 엔진(Oscillator) 탑재.

### v1.5.0 (Resumable Upload) - 2025.11.29

- **[New]** 구글 드라이브 Resumable Upload API 적용 (대용량 파일 지원).
- **[Fix]** 메모리 부족으로 인한 업로드 실패 해결.

---

## 📡 Server (Google Apps Script)

### v1.1.0 (Library API) - 2025.12.01

- **[New]** `get_library` 요청 처리 추가.
- **[New]** `update_library_status` 요청 처리 추가.

### v1.0.0 (Initial Release) - 2025.11.28

- 기본적인 파일 업로드 및 폴더 관리 기능.

---

## 📊 Dashboard (TokiView)

### v1.1.0 (Remote Action) - 2025.12.03

- **[New]** **자동 동기화 버튼 추가**:
  - 작품 카드에 `⚡️ 자동 동기화` 버튼 추가.
  - 클릭 시 해당 사이트로 이동하며 즉시 동기화 스크립트 실행.

### v1.0.0 (Initial Release) - 2025.12.01

- 웹 기반 라이브러리 뷰어 출시.
- 검색, 정렬, 다크 모드 지원.
