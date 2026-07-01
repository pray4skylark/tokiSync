# Changelog

All notable changes to this project will be documented in this file.

## [v1.26.4] - 2026-07-01

### 🛠️ Local/Drive Download Pipeline Consolidation
- **`src/core/downloader.js`**:
  - **Unified Queue Delegation**: Simplified the scheduling branch condition (`!currentIsSingleVolume`) to route both local downloads (`local` / `native`) and drive uploads (`drive` / `drive_kavita`) through the centralized batch queue scheduler. This effectively deprecates the buggy, error-prone Sequential iFrame/popup reuse loops for individual local downloads, aligning the entire codebase under a single, robust scheduling engine.
- **`src/core/worker-controller.js`**:
  - **Dynamic Filename Parsing & Save Dispatch**: Refactored `handleBatchSuccess()` to dynamically format the local destination filename using the user's `localNameTemplate` (fetched directly from config to avoid `undefined` queue properties).
  - **Save Target Normalization**: Resolved a critical failure case by mapping `drive_kavita` to `'drive'` before calling `saveFile()`, matching the exact save API signatures and avoiding silent download skips.
  - **Liveness Reset Hotfix**: Synchronously updated `lastActivity` with `Date.now()` upon receiving `WORKER_READY` in both single-mode (L131) and batch-mode (L744) handlers, resetting the 60s timeout countdown to prevent premature worker failures during the safety delays.

## [v1.26.3] - 2026-06-30

### 🐛 Worker Scroll Hang (40%) and Log Mirroring Fix
- **`src/core/utils.js`**:
  - **Worker Log Proxy**: Implemented log mirroring proxy using `window.opener.postMessage` under worker context, solving the issue where worker detailed scrolling logs (`[Scroll] Page [X / Y] ...`) were trapped in the worker's local `LogBox` instance and not mirrored to the parent UI dashboard.
  - **Virtualization Timeout Optimization**: Implemented a 1-second (`1000ms * multiplier`) early exit bypass for elements in the virtualized image container that do not transition to standard `img` tags (e.g. ads, comment sections, whitespace div spacers). This prevents stalling the scrolling loop for 4 seconds per non-image element, dramatically increasing scrolling extraction speed.

### ✨ Log Custom Template and Debug Tag Hiding
- **`src/core/ui/LogBox.js`**:
  - **Dynamic Log Template**: Added template parsing support (`config.logTemplate`) to customize output message structure.
  - **Debug Tag Hiding**: Automatically filters out internal debug tags (e.g. `[Worker:Batch]`, `[DOM:Scroll]`, `[GAS:Cache]`, etc.) from the dashboard log list when `logLevel` is not set to `debug` or `normal`, providing a clean user log interface while maintaining full prefix logs in developer devtools console output.

### 🐛 False Positive Batch Collection Timeout Fix
- **`src/core/worker-controller.js`**:
  - **Liveness Tracking**: Explicitly updates `lastActivity` using `updateQueueItem()` in the IPC event handlers for `WORKER_LOG` and `WORKER_PROGRESS`. This resolves false positive batch timeouts (where scrolling taking longer than 60s caused a recovery restart) by continually resetting the 60s limit as long as the worker sends scrolling logs.
  - **Upload Handover Liveness Bypass**: Prevented active worker manual closure checks from triggering recovery restarts if the episode is currently in the `UPLOADING` or `COMPLETED` stages. This resolves a race condition where the scraper closed the popup normally upon extraction success, but the background liveness tracker immediately flagged the closed state as an anomaly during the file packaging/uploading phases.
  - **Enhanced Upload Visibility**: Emitted dashboard `EVT.LOG` messages for archive compilation (`📦 [Episode] compressing...`) and Google Drive upload initialization (`🚀 [Episode] uploading... (X.X MB)`) to give users immediate feedback about background processing after the child window closes.

### 🧹 Queue Actions Consolidation and Sandbox Dialog Crash Fix
- **`src/core/ui/MenuModal.js`**:
  - **Button Consolidation**: Consolidated the 🧹 (clean completed items) and 🗑️ (reset queue) buttons into a single 🗑️ (clear entire queue) button to simplify the queue UI and workflow.
  - **Direct Core Invocations**: Refactored the UI control listeners for queue actions (reset, pause, stop, and individual item deletion) to directly invoke imported functions from `queue.js` (e.g. `stopAllWorkers()`, `setQueuePaused()`, and `removeQueueItem()`) rather than emitting indirect EventBus events. This permanently resolves cross-window sandbox execution isolation that previously caused EventBus control signals to get lost.
  - **Sandbox Safe Dialogs**: Restored dialogue context from native `confirm/alert` to `popupWindow.confirm/alert` to prevent browser silent blocking caused by focus-loss.
- **`src/core/queue.js`**:
  - **Liveness Lock Prevention**: Removed `GM_deleteValue(STORAGE_KEY)` during soft queue resets, standardizing on writing a clean empty array (`saveRawQueue([])`) to prevent liveness-monitoring tab races and listener value parsing errors.
  - **Deprecated Methods Removal**: Cleaned up the unused `removeCompletedItems` helper and `EVT.QUEUE_CLEAR` event listener.
- **`src/core/worker-controller.js` & `src/core/queue.js`**:
  - **Pause Timeout Protection**: Skipped liveness timeout evaluation when the queue is paused (`getQueuePaused() === true`). Additionally, updated `setQueuePaused()` to reset the `lastActivity` timestamp to `Date.now()` for all active (`processing`) items when resuming (unpausing), preventing instant false-positive timeouts right after unpausing.

## [v1.26.2] - 2026-06-30

### 🐛 H1: Queue Write Monopoly Violation Fix
- **`src/core/downloader.js`**: `processItem()` 내 직접 `updateQueueItem()` 호출 3곳(L66, L101, L145)을 `EventBus.emit(EVT.QUEUE_ITEM_UPDATE, { id, updates })`로 변경. AGENTS.md 규칙 "Only worker-controller.js (parent) writes queue state" 준수.
- **`src/core/queue.js`**: `initQueueScheduler()` 내 `EventBus.on(EVT.QUEUE_ITEM_UPDATE)` 리스너 추가. 외부 모듈의 상태 변경 요청을 queue 모듈이 전담 처리하여 write monopoly 유지.

### 🐛 H2: Dual-writer Race (Single-volume) Fix
- **`src/core/downloader.js`**: `processItem()` 시작 시 `activeWorkers.set(id, { type: 'single-volume' })` 등록. finally 블록에서 `activeWorkers.delete(id)` 항상 실행.
- **효과**: 스케줄러의 `activeWorkers.has(nextItem.id)` 중복 기동 가드가 단일 볼륨 경로도 인지 가능. 동일 아이템에 대한 popup 중복 실행 방지.

### ℹ️ C3: IPC listenerId Collision — Already Fixed
- `worker-controller.js` L235: `single_attempt_${queueId}` (고유 ID per queue)
- `worker-controller.js` L951: `'batch_controller'` (고정 ID)
- 두 리스너가 서로 다른 listenerId를 사용하므로 충돌 없음. 추가 수정 불필요.

### 🔧 EventBus
- **`src/core/EventBus.js`**: `QUEUE_ITEM_UPDATE: 'queue:item_update'` 이벤트 상수 추가.

## [v1.26.1] - 2026-06-30

### 🔒 C4/H12: IPC Message Security — Nonce-based Session Token System
- **`src/core/ipc-broker.js`**: 
  - **H12 fix**: Added nonce-based session token system. `postMessage` still uses `'*'` for Tampermonkey `about:blank` popups (origin="null"), but every message now carries a cryptographically random 64-char hex nonce. Messages without valid nonces are rejected.
  - **C4 fix**: Added origin validation in IPC listener handler — rejects messages from non-null origins that don't match `window.location.origin`. Combined with nonce validation, this provides 3-layer defense: (1) origin check, (2) nonce validation, (3) `event.source` verification.
  - New exports: `registerWorkerOrigin(workerId, origin)`, `removeWorkerOrigin(workerId, nonce)`, `validateNonce(nonce)`, `getWorkerOrigin(workerId)`.
  - `registerIpcListener` now accepts options object with `requireNonce` flag (backward compatible with legacy string `listenerId` parameter).
  - `sendToWorker` and `sendToParent` accept optional `nonce` parameter, included in message payload.
- **`src/core/worker-controller.js`**:
  - Single worker mode: generates session nonce on popup open via `registerWorkerOrigin()`, includes `sessionNonce` in `START_EXTRACTION` payload, invalidates nonce on success/failure/close.
  - Batch worker mode: same nonce lifecycle per worker in `activeWorkers` Map. Nonces tracked in `batchWorkerNonces` Map, cleaned up on timeout, manual close, success, and failure.
- **`src/viewer/composables/useBridge.js`**:
  - **C4 fix**: Added origin validation in message handler — rejects messages from untrusted origins (only accepts `null`, `''`, or `window.location.origin`).
  - **H12 fix**: `bridgeFetch` now uses `window.opener.location.origin` as target origin when accessible, falling back to `'*'` only when cross-origin access is blocked.

## [v1.26.0] - 2026-06-30

### 🐛 C5/H8: GAS `index.json` 동시 쓰기 레이스 컨디션 수정
- **`src/gas/View_LibraryService.gs`**: `withIndexLock(folderId, modifyFn)` 헬퍼 추가. `LockService.getScriptLock()`으로 read-modify-write 전체를 원자화. 15초 타임아웃, 3회 재시도. `SweepMergeIndex()`와 `View_updateMetadata()`의 index.json 접근을 이 헬퍼로 통합. 기존 `View_saveIndex()` 직접 호출 제거.
- **`src/gas/SyncService.gs`**: `updateLibraryStatus()`의 read-modify-write를 `withIndexLock()`으로 래핑. 기존 수동 Drive 읽기/쓰기 로직 제거.
- **레이스 시나리오**: 크론(SweepMergeIndex) + 사용자(View_updateMetadata/updateLibraryStatus) 동시 요청 시 서로의 변경을 덮어쓰던 문제 해결. GAS `LockService`는 스크립트 전체 글로벌 락이므로 동일 프로젝트 내 모든 .gs 파일에서 공유됨.

### 🐛 Hotfix: `logger.init is not a function` 런타임 크래시 수정
- **`src/core/logger.js`**: 추상화 레이어에 누락된 `init()` 빈 메서드 추가. `v1.26.0` 리팩토링에서 `downloader.js`의 `logger.init()` 호출이 신규 logger 객체에 포팅되지 않아 발생한 `TypeError` 해결. LogBox 초기화는 `main.js`에서 이미 수행되므로 no-op으로 충분.

### ✨ EventBus 아키텍처 결합 완화, 비동기 요청-응답 패턴 및 로거 디커플링 통합 릴리즈
- **Promise 기반 비동기 요청-응답(Request-Response) 패턴 구현**: 기존의 단방향 통신 후 동적 임시 리스너 대기 루프 형식을 폐기하고, Promise로 래핑된 `EventBus.request()` 및 `EventBus.respond()` 메커니즘을 구축하여 파서 검증(`PARSE_VERIFY`) 및 추출 테스트(`PARSE_TEST`) 트랜잭션 흐름을 일차원 동기식 제어 구조로 일원화했습니다.
- **리스너 자가 소거 및 타임아웃 가드 탑재**: 비동기 `request` 요청 시 지정된 타임아웃(기본 15초/테스트 30초) 만료 즉시 타이머를 해제하고 동적으로 생성된 일시적 리스너를 강제 해제(cleanup)하는 클린업 파이프라인을 구축하여 메모리 누수와 UI 데드락 위험을 원천 해결했습니다.
- **중간 로깅 추상화 레이어(logger.js) 신설**: 코어 비즈니스 모듈(`downloader`, `extractor`, `gas`, `network`, `cbz`, `epub`, `main`)이 UI 단일 객체인 `LogBox`를 다이렉트로 임포트하던 레이어 경계 위반(Layer Boundary Violation) 결함을 해소하고자 중간 대리자 `logger.js`를 신설했습니다. 모든 코어 엔진은 `logger` 인터페이스만을 바라보고, 실제 처리는 `EventBus.emit(EVT.LOG)`를 거쳐 `LogBox`가 간접 수신 렌더링하도록 강결합을 해소했습니다.
- **사문화된 백업 디렉토리(old_core) 소거**: `src/old_core/` 내 잔재하던 11개의 미사용 레거시 백업 소스코드 파일을 완전히 제거하여 빌드 대상 및 컴파일 영역을 최적화했습니다.
- **테스트 환경 브리지(Bridge) 보강**: `test-real-env.js` 테스트 가상 런타임(Node.js)에 `initQueueScheduler`를 직접 가동하고 가상 `localStorage` 모의 객체를 이식함으로써 크로스 윈도우 스코프 중계 검증 시나리오가 100% 정상 가동 및 Pass하도록 수정했습니다.
- **규칙 편집기(FormRuleEditor) 폼 리뉴얼**: 난해했던 트리뷰 에디터(`TreeRuleEditor.js`)를 전격 폐기하고, 더욱 간결하며 직관적인 폼 편집 인터페이스(`FormRuleEditor.js`) 및 스타일링을 전면 적용하였습니다.
- **크롬 DevTools 스타일 DOM 인스펙터**: 수집 규칙 작성 시 직접 요소를 클릭하여 대상 CSS 셀렉터를 즉시 식별할 수 있는 시각적 검사 도구 `DomInspector.js`를 개발 및 통합했습니다.
- **원격 규칙 구독 관리자**: 규칙의 외부 갱신을 위해 구독 설정과 동기화를 지원하는 `SubscriptionManager.js` 모듈을 도입하였습니다.
- **GAS 디스패처 및 빌드 배포 체인 최적화**: 신규 API 호출 경로를 `View_Dispatcher.gs`에 등록하고 Webpack 및 `build_bundle.cjs` 번들러 빌드 설정을 보강했습니다.

## [v1.25.0] - 2026-06-17

### ✨ 1.5 배포 전 파서 안정화 및 중복 기동 방어 통합 릴리즈
- **파서 규칙 스토리지 단일 통합 및 Seed 구조 경량화**: `TOKI_CUSTOM_RULES`와 `TOKI_REMOTE_RULES_CACHE` 및 원격 룰 백그라운드 다운로드 설정을 단일 변수인 `TOKI_PARSER_RULES`로 통합했습니다. 최초 구동 시 지연을 유발하는 비동기 다운로드 및 Seed 이식 메커니즘을 걷어내고, 로컬에 내장된 샘플 규칙(`toki_common` 통합 규칙)을 즉시 동기식으로 주입하여 가동 속도와 보안 신뢰성을 강화했습니다.
- **트리뷰 규칙 편집기 로컬 임포트 단일화**: 원격 룰 URL을 입력받아 가져오던 복잡한 임포트 모달 창을 제거하고, 곧바로 로컬 JSON 파서 파일을 선택하여 병합/덮어쓸 수 있도록 직관적으로 단순화했습니다.
- **벤더 식별자(vendorId) 파서 고유 ID 강제화**: 작품의 고유 벤더 ID에 작품의 단순 숫자 번호(`seriesId`)가 잘못 기입될 수 있었던 예외 폴백 로직을 완벽히 제거하고, 항상 파서 고유 ID 또는 벤더 슬러그만 강제 매핑되도록 강화했습니다.
- **iframe 내 스크립트 과다 주입 차단**: `@noframes` 지시어 적용 및 `window.self !== window.top` 조건 분기를 통해 광고나 소셜 위젯 등의 외부 iframe 영역 내에서 유저스크립트 및 스케줄러가 중복 기동되는 결함을 원천 해결했습니다.
- **전역 IPC 리스너 레지스트리 및 중복 방어 가드**: 최상위 윈도우 레벨의 글로벌 IPC 리스너 레지스트리(`__tokisync_ipc_listeners`) 및 `isWorkerExtractorInitialized` 가드를 도입하여, 다중 리스너 누적 생성 문제와 자식 워커의 하트비트로 인한 안전 대기 이중 실행 현상을 봉쇄했습니다.
- **Kavita 표준 만화/소설 뷰어 호환성 및 메타데이터 정합성 고도화**: 파일명 파싱 방식의 오차를 방어하기 위해 클라이언트가 수집한 상세 회차명 맵(`episodeTitles`)을 캐시 갱신 시 백엔드로 직접 전송하고 백엔드 DB에서 이를 매핑 기록하도록 하는 Double-Safe 파이프라인을 확립했습니다.

## [v1.24.0] - 2026-06-15

### ✨ 소스벤더(vendor) 전파 체인 및 Liveness Guard 데드락 방지 도입
- **소스벤더(vendor) 식별 데이터 전파 체인 연동**: 클라이언트 파서부터 구글 드라이브 스토리지의 `info.json` 및 메타데이터 색인(`index.json`, `mergedMeta`)까지 소스벤더 식별자를 온전히 전파하여 구조적 작품 식별성을 고도화하고 외부 연동 기틀을 확보했습니다.
- **수집기 데드락 방지 Liveness Guard (Failsafe) 탑재**: 팝업 수집 진행 중 사용자가 수동으로 팝업을 닫거나 비정상 크래시가 발생했을 때, 이를 단일 모드(1초) 및 배치 모드(2초) 단위로 실시간 감지하여 세마포어 락 동결을 깨고 다음 대기열로 복구/전진시킵니다.
- **EPUB 빌드 안정성 개선**: XML 파싱 시 특수 문자 및 앰퍼샌드(&) 오류를 예방하기 위한 `escapeXml` 헬퍼 함수를 적용하여 소설 EPUB 결합 과정의 오류를 사전 차단했습니다.
- **불필요한 레거시 설정 제거**: `config.js` 내 미사용 변수(`CFG_LOCAL_EPISODE_PADDING`)를 제거하여 설정을 단순화했습니다.

## [v1.23.0] - 2026-06-11

### ✨ 속도 정책 가변 배율화 및 큐 경쟁 조건 수정
- **가변 배율 속도 정책(SLEEP_MULTIPLIERS) 도입**: 기존의 고정 범위 형태인 `SLEEP_POLICIES`를 폐기하고, 사용자가 선택한 속도 모드(신중 1.0, 철저 1.5, 느림 2.2, 매우 느림 3.0)에 연동되는 **속도 배율(Multiplier)** 개념을 도입했습니다. 팝업 첫 통신, 가상 스크롤, 폴링 주기, 마지막 지터까지 배율을 곱해 유기적으로 속도가 조절됩니다.
- **크로스 윈도우 스토리지 경쟁 조건(Race Condition) 해소**: 다중 팝업(자식 창)들이 거의 동시에 진행률이나 완료 상태를 스토리지(`GM_setValue`)에 쓰는 과정에서 이전 완료 이력을 덮어써 UI상 롤백되던 결함을 픽스했습니다. 자식 워커(`worker-extractor.js`)의 직접 쓰기 권한을 회수하고 부모 컨트롤러 단일 채널로 큐 쓰기 권한을 일원화했습니다.
- **첫 통신 안전 대기 추가**: 자식 워커가 기동되어 `READY` 신호를 전송한 뒤 부모가 명령을 내리기 직전에 `(3.0초 * 배율)`만큼의 비동기 안전 대기를 진행하도록 설계하여, Cloudflare WAF 등의 보안 검문소 우회 성공률과 로딩 정합성을 극대화했습니다.
- **소설 가상 스크롤 개선 및 키보드 시뮬레이션 탑재**: `container.scrollTop`과 `window.scrollTo` 대입 방식을 병행하여 CSS overflow 환경 및 smooth behavior 미지원 브라우저 탭에서도 강제 스크롤되도록 개선했습니다. 또한 스크롤 단계마다 `PageDown` 및 `ArrowDown` 키보드 이벤트를 함께 디스패치하여 키보드 입력을 감지하는 뷰어 환경에 대응했습니다.
- **스케줄러 기동 지터 분리**: 팝업창을 여는 부모 스케줄러 자체의 지터 대기시간만 배율의 영향을 받지 않는 **2.0~4.0초** 고정 시간으로 격리하여 연속 기동 방어력을 확보했습니다.

## [v1.22.4] - 2026-06-08

### 🛠️ 백그라운드 팝업 차단 및 크로스 오리진 보안 에러 우회
- **메시지 기반 간접 릴레이 도입**: 부모 창에서 자식 팝업 창의 `location` 주소를 직접 변경 시 발생하던 크로스 도메인 보안 오류(`SecurityError`)를 방지하기 위해, 부모가 완료 응답(`IPC_ACK`)에 다음 수집 타겟 URL을 포함해 보내고, 자식 팝업 창이 **스스로 `location.replace`를 호출하여 리다이렉트**하도록 우회 설계했습니다. 이로 인해 백그라운드 탭 상태에서도 팝업이 무한히 릴레이 재사용되어 안정적으로 수집이 지속됩니다.
- **부모/자식 안티 슬립(절전 방지) 연동**: 부모 스케줄러(`queue.js`)와 자식 팝업 워커(`worker-extractor.js`)의 생명주기에 각각 안티 슬립(무음 오디오 재생) 모듈을 연동했습니다. 백그라운드 멀티태스킹 서핑 도중에도 브라우저가 타이머를 강제 지연시키거나 멈추지 않도록 스로틀링을 완벽히 격하 제어합니다.
- **로그 상세 수준 제어 기능 추가**: 통합 대시보드 설정 탭에 로그 상세 수준 드롭다운(디버그 / 정보 / 경고 / 오류) 필터를 추가하고 가중치 우선순위를 설계하여 불필요한 자잘한 로그 노출량을 유동적으로 거를 수 있도록 동적 필터링을 구현했습니다.
- **단위 테스트 및 가상 환경 안전 보강**: 가상 테스트(Node.js) 및 Mock Popup 환경에서 렌더링 시 발생할 수 있는 `document` 널 참조 크래시를 막기 위해 타입 안전 코드를 보강했으며, 단위 테스트(`npm run test`) 14개 전체가 정상 통과함을 검증했습니다.

## [v1.22.3] - 2026-06-07

### 🛠️ 구글 드라이브 배치 수집 완료 시 파일 업로드 누락 버그 핫픽스
- **배치 조립 및 saveFile 연동**: 구글 드라이브 배치 다운로드(`destination === 'drive'`) 모드 실행 시, 자식 워커가 수집한 텍스트/이미지를 실물 책 파일(EPUB/CBZ/TXT)로 조립한 후 구글 드라이브 업로드 프로세스(`saveFile`)를 안정적으로 거쳐 저장되도록 백그라운드 콜백 루틴(`handleBatchSuccess`)을 전면 수정했습니다.
- **예외 발생 시 큐 상태 롤백**: 업로드 도중 에러가 감지되면 대기열 상태를 성공(`completed`)으로 무조건 넘기지 않고 `failed` 또는 `pending` 상태로 롤백 및 재시도(최대 3회)하도록 예외 처리 안전 장치를 보강했습니다.

## [v1.22.2] - 2026-06-07

### 🛠️ 소설 본문 정제 정규식 개선 및 괄호 구문 유실 버그 핫픽스
- **소설 괄호 구문(<...>) 보존**: 소설 텍스트 정제 시 모든 `<...>`를 HTML 태그로 오인하여 삭제하던 기존 정규식(`/<[^>]+>/g`)을 폐기하고, 소설 본문 구조에 쓰이는 실제 HTML 표준 태그들만 선별적으로 제거하는 화이트리스트 기반 정규식으로 개선하여 영문/한글 괄호 텍스트(예: `<system>`, `<용사>`) 유실 결함을 완벽히 핫픽스했습니다.
- **`sem` 의미론적 분석 도구 정비**: 에이전트의 규칙과 워크플로우에 `sem` 도구 연동 규정을 추가하여 배포 및 변경 영향 범위를 사전에 완벽히 파악하고 구조적으로 검증할 수 있는 품질 보증 인프라를 도입했습니다.

## [v1.22.1] - 2026-06-07

### ✨ tokiSync 뷰어 편의 기능 개선 및 대기열 안정화 핫픽스 (Viewer v1.22.0)
- **라이브러리 3종 정렬 필터 도입**: 최근읽은순(최근 열람 기록 기준), 최신 업데이트순(드라이브 갱신일 기준), 가나다순 정렬 기능을 추가하여 컬렉션 탐색 사용성을 대폭 개선했습니다.
- **5방향 터치 커스터마이징 및 즉시 이동**: 상/하/좌/우/중앙의 5개 영역에 이전/다음/메뉴 토글 동작을 자유롭게 매핑하고, 즉각 이동(behavior: auto) 모드를 지원합니다.
- **IndexedDB 오프라인 스토리지 GC 패널**: 로컬 브라우저에 캐시된 에피소드 목록과 스토리지 점유 용량을 시각화하고, 캐시 정리 기능을 구현했습니다.
- **작품 메타데이터 수정 및 썸네일 직접 업로드**: 뷰어 내에서 작품명, 작가, 연재상태, 카테고리, 요약을 수정할 수 있으며, 썸네일 이미지를 업로드하면 구글 드라이브에 직접 저장되도록 GAS 백엔드를 확장했습니다.
- **대기열 프리체크 스마트 필터 추가**: 새 수집 기동 시 기존 대기열에 실패(`failed`)나 미완료 항목이 있는 경우 안내창(`confirm`)을 띄우며, 대시보드 대기열 창을 자동으로 노출하여 사용자가 수동으로 제어하도록 개선했습니다.
- **클리어(🧹) 버튼 동작 수정**: 완료 정리(🧹) 시 실패 항목은 그대로 유지하고 오직 성공(`completed`)한 이력만 큐에서 지우도록 변경하여 실패 내역의 가시성을 높였습니다.
- **ReferenceError (config is not defined) 핫픽스**: `downloader.js` 내부에서 패딩 및 템플릿 정보 획득 시 `config` 객체가 정의되지 않아 발생하던 런타임 참조 결함을 해결했습니다.

## [v1.22.0] - 2026-06-03

### ✨ 이벤트 버스 기반 서비스/UI 분리 및 설정 UI 대시보드 단일화
- **이벤트 버스(EventBus) 통신 인프라 도입**: `downloader.js`, `worker-controller.js` 등 비즈니스 로직(서비스) 레이어에서 UI 요소(`LogBox`, `alert` 등)의 직접적인 의존성을 제거하고, 오직 단방향 이벤트(`EVT.LOG`, `EVT.NOTIFY_ERROR`, `EVT.UPDATE_PROGRESS`)를 통해서만 통신하도록 리팩터링하여 완벽한 계층 분리를 달성했습니다.
- **상세 설정 모달(config.js) 폐기 및 설정 탭 단일화**: 호스트 화면에 뜨던 구형 오버레이 설정 모달창 코드를 전면 폐기하고, 신규 대시보드 팝업창 내의 설정 탭으로 설정을 단일 통합했습니다.
- **불필요한 설정 필드 제거 및 레이아웃 정리**: 사용되지 않는 구버전 JSON 파서 규칙 입력 폼을 완전히 삭제하고, 상대적으로 입력 빈도가 낮은 클라우드 설정(GAS ID, Folder ID 등) 영역을 하단으로 내려 시각적 사용성을 극대화했습니다.
- **12 KiB 번들 크기 경량화 성공**: 중복 UI 렌더링 코드 소거를 통해 최종 번들 파일(`tokiSync.user.js`) 크기를 `428 KiB`에서 `416 KiB`로 경량화시켰습니다.
- **단위 테스트 및 테스트 자동화 지원**: `test-eventbus.js` 경량 테스트 스크립트를 작성하고 `package.json` 내 `npm test` 명령어를 매핑하여, 이벤트 발행/구독 및 Mock UI의 연동 정합성을 배포 전 상시 자동 검증할 수 있도록 지원 체계를 확보했습니다.

## [v1.21.5] - 2026-06-01

### 🛠️ 템퍼몽키 런타임 검증 에러 및 팝업창 confirm 격리 차단 해소
- **TM Header 규격 준수 (`@match` ➡️ `@include` 전환)**: 포트 번호가 들어가는 로컬 호스트 테스트용 주소(`http://localhost:*/*` 및 `http://127.0.0.1:*/*`)가 정식 Match Pattern 규격을 위반해 템퍼몽키에서 "유효하지 않은 유저스크립트" 에러로 거부되던 현상을 우회 해결하기 위해 유연한 `@include`로 전환했습니다.
- **팝업창 격리 보안 우회 (`confirm` ➡️ `popupWindow.confirm` 전환)**: 독립된 자식 대시보드 팝업창에서 confirm 다이얼로그 호출 시 브라우저가 포커스 불일치 및 크로스 윈도우 통제에 의해 다이얼로그 창을 침묵 차단(Silent Rejection)하던 보안 제약을 우회하기 위해, 이벤트 위임 내 모든 confirm 호출의 창 객체를 명시적 바인딩으로 수정했습니다.

## [v1.21.3] - 2026-05-29

### 🛠️ 리팩토링 검증 오류 수정 및 레거시 파서/워커 코드 제거
- **`activeWorkers` 타입 정합성 복구**: `downloader.js` L506의 `activeWorkers.set(id, { ref, closedCount })`를 윈도우 객체 자체인 `activeWorkers.set(id, popupRef)`로 저장하도록 교정하여, 타 모듈에서 TypeError로 인해 수집기 및 Liveness Check가 마비되던 치명적인 논리 결함을 해결했습니다.
- **`index.js` ReferenceError 해결**: `index.js` L4에서 `updateQueueItemProgress` 임포트 누락으로 인해 에피소드 진행률 통제 시 ReferenceError가 발생하던 문제를 임포트 목록 추가로 바로잡았습니다.
- **사문화된 `fetchImages` 함수 제거**: `downloader.js` 내부에서 더 이상 호출되지 않던 구형 `fetchImages` 함수를 제거하여, `response` 변수 부재로 인한 잠재적 런타임 오류 가능성을 제거하고 리소스를 슬림화했습니다.
- **레거시 자식 워커 및 IPC 메시지 수신기 전격 제거**: `index.js` 내에 잔존하여 새 IPC 브로커와 이중 충돌 및 데드락을 유발하던 레거시 `isWorkerPopup` 블록(460줄 규모)과 부모 측의 구형 `message` 이벤트 리스너를 완전히 청소했습니다.
- **자립형 워커 엔진 `initWorkerExtractor` 연동**: 자식 팝업 기동 시 신규 자립형 워커인 `initWorkerExtractor()`를 즉시 호출하고 Early Return 하도록 `index.js` 구조를 정밀히 리팩터링하여 완벽한 신규 IPC 프로토콜(Controller-Worker)로의 이전을 완료했습니다.
- **종합 유효성 빌드 완료**: `npm run build:core` 실행 결과, 392 KiB 크기의 최종 유저스크립트 `tokiSync.user.js` 빌드가 100% 정상적으로 컴파일 완료됨을 확인하고 `graphify`를 통해 코드 간 지식 관계망도 최신화했습니다.

## [v1.20.6] - 2026-05-28

### 🔒 파싱 규칙 캐시 제거 및 사용자 제어 주권 복구 (TOKI_CUSTOM_RULES Seed 이식)
- **강제 덮어쓰기 캐시 소멸**: 매 접속 시 백그라운드에서 원격 규칙을 다운로드하여 로컬 수정을 무자비하게 날려버리던 `TOKI_REMOTE_RULES_CACHE` 임시 스토리지 캐시 메커니즘을 완전히 제거했습니다.
- **1회성 Seed 규칙 주입 (Bootstrap)**: 커스텀 규칙 저장소인 `TOKI_CUSTOM_RULES`가 비어있는 최초 구동 시에만 원격 기본 규칙 파일(`rules.json`)로부터 씨드 규칙을 비동기로 딱 1회만 다운로드해 와 로컬 설정으로 고정 이식하는 스마트 자가 설치 루틴을 신설했습니다.
- **로컬 규칙 영구 영속화**: 이로써 사용자가 파싱 규칙 에디터(`TreeRuleEditor`) 및 상세 설정 화면에서 직접 파싱 규칙을 추가, 수정, 삭제하더라도 백그라운드에서 날아가는 버그를 원천 차단하고 영구 영속화된 규칙 제어 주권을 복구했습니다.

## [v1.20.5] - 2026-05-26

### 📐 팝업 수집기 50x400 극슬림(Ultra-Slim) 최적화
- **화면 간섭 제로화**: 수집 진행 시 유저 화면을 많이 차지하던 기존 팝업 규격을 가로 폭이 실선 수준으로 얇은 **`50x400`** 극초소형 규격으로 정교하게 조율하여 수동 조작 및 멀티태스킹 편의성을 극대화했습니다.
- **브라우저 최적화 우회 보장**: 가로 폭을 극소화하더라도 브라우저가 화면상 가시적인 뷰포트 영역으로 인지하는 최소 세로 높이(`400px`)를 확보하여, 이미지 렌더링 스킵 및 스크롤 감지 동결 현상을 지능적으로 우회했습니다.

### 🛡️ 팝업 미디어 수집 안정화 3회 자동 재시도(Retry Wrapper) 및 물리 리셋 도입
- **최대 3회 자동 재시도 가동**: 팝업 수집 도중 일시적 네트워크 통신 불안정, 사이트 지연, 혹은 클라우드플레어 인증 깜빡임으로 인해 발생하는 `"이미지 팝업 패키지 획득 불가"` 결함을 완벽히 해결했습니다.
- **물리 세션 리셋**: 수집 시도가 실패하면 즉시 기존 팝업 세션을 `closeActivePopup()`으로 물리 강제 셧다운해 찌꺼기를 클린업한 뒤, 1.5초 안정화 딜레이를 확보하고 새롭게 창을 띄워 시도를 연장하는 Wrapper를 구현하여 수집 신뢰도를 대폭 향상했습니다.

### 📖 초보자용 인스톨 가이드(INSTALL_GUIDE.md) 전면 대개편 및 대보강
- **5대 장애물 사전 해결책 제시**:
  - **기본 코드 삭제**: Apps Script 최초 프로젝트 생성 시 들어있는 기본 소스 코드를 지우지 않아 생기는 에러 사전 경고 지침 기재.
  - **드라이브 API GUI 활성화법**: 복잡한 JSON 편집 없이 서비스 탭 클릭으로 드라이브 API v3 권한을 편하게 획득하는 대안 설명 추가.
  - **웹 앱 새 배포 버전 올리기 수칙**: 코드를 수정했거나 업데이트 시 버전 관리를 하지 않아 생기는 런타임 무반응 결함에 대한 주의 및 가이드 명기.
  - **팝업 허용 및 확장자 권한**: 극슬림 팝업 창 차단 해제법과 로컬 저장 에러 방지를 위한 템퍼몽키 다운로드 화이트리스트(.cbz, .epub) 지정법 명기.
  - **뷰어 수동 연동 우회**: 쿠키 차단 등으로 인한 뷰어 자동 동기화 어긋남 대처를 위해 톱니바퀴 설정을 통한 수동 설정 동기화법 기재.

## [v1.20.0] - 2026-05-25

### 📐 스크롤 뷰어 이미지 왜곡(Layout Shift) 방지 및 min-height 복원 고도화
- **로드 후 min-height 자동 해제**: 뷰어 스크롤 모드에서 `avgHeight`(평균 높이 플레이스홀더) 제약조건이 이미지가 완전히 로드된 후에도 `img` 태그에 계속 강제 적용되어 실제 크기가 작고 비율이 다른 이미지들이 찌그러지고 요동치는 문제를 근본적으로 해결했습니다.
- **이미지 개별 로드 상태 머신 도입**: `ImageRenderer.vue` 내에 개별 이미지의 로딩 완료 성공/실패 여부를 추적하는 `loadedImages` Set 상태를 도입하여 상태 관리를 체계화했습니다.
- **동적 플레이스홀더 스위치 탑재**: 이미지가 로드 대기 중일 때는 Layout Shift(스크롤 튐)를 막기 위해 기존처럼 `avgHeight` 또는 `200px`을 유지하고, 로드 즉시 `minHeight: 'auto'`로 신속히 환원해 원본 비율 그대로 100% 매끄럽게 렌더링되도록 구현했습니다.

### 🔒 소설 복호화 API 시드 추출 방식 변경 및 디코딩 정제 고도화
- **토큰 기반 XOR 시드 적용**: 소설 복호화에 사용되던 기존 `nv` 쿠키 기반의 시드 추출을 폐기하고, 최신 API 스펙에 맞추어 **JWT 토큰의 첫 번째 파트(`token.split('.')[0]`)**를 XOR 키로 직접 사용하도록 구조를 변경했습니다.
- **동적 Nonce 추출 분석 엔진 구현**: 신형 토큰 내부의 Payload에 `nonce`가 강제되는 사양을 파악하여, 토큰 디코딩 후 `nonce`가 내장된 경우 이를 강제 사용하고 없는 경우 랜덤 24바이트를 폴백 생성하는 `getValidNonce` 지능형 흐름을 설계 및 도입했습니다.
- **바이너리 처리 호환성 확보**: Node.js의 `Buffer` 의존적 연산 코드를 브라우저(유저스크립트) 환경의 표준 스펙 (`TextEncoder`, `TextDecoder`, `atob`)으로 완벽히 재구현하여 호환성 결함을 해결했습니다.
- **URI 디코딩 정제 간소화**: 그동안 사용되던 불안정하고 복잡한 정규식 기반 JSON 정제 로직을 `decodeURIComponent` 기반의 단순하고 명확한 복원 방식으로 통합하여 코드 복잡도를 획기적으로 낮췄습니다.
- **PoC 및 Core 동기화 완료**: `src/core/novel-decryptor.js`와 `tools/novel-decrypt-poc.user.js` PoC 스크립트를 동시 현행화하여 검증 안정성을 높였습니다.
- **하이브리드 예비 스위치(플랜 C 페이퍼 플랜) 장전**: 팝업 수집(플랜 B)에 장애가 발생할 최악의 경우를 대비하여, 상기 완성된 동적 Nonce XOR 복호화 엔진 전문을 예비용(`fetchNovelTextViaApi`)으로 완벽하게 구현하여 탑재하고, 게이트웨이 영역에 비활성 조건문 스위치(`EMERGENCY_API_FALLBACK = false`)를 걸어 언제든 주석 한 줄로 백그라운드 API 복호화를 즉각 교대 투입할 수 있도록 초장기 생존성을 확보했습니다.
- **3단계 소설 정밀 문단 복원 엔진 탑재**: `textContent` 무분별 획기 시 발생하는 문단 줄바꿈 증발 현상을 해결하기 위해, Shadow DOM 내 `<p>` 요소를 우선 조립(`paragraphs.join('\n\n')`)하고, 없을 시 `innerText` 줄바꿈 보존 폴백 및 DOM 스트립 정제를 거치도록 3중 가드를 구현했습니다.
- **사용자 로그 메시지 직관적 단순화**: 불필요하게 난해한 기술 명칭을 외부 UI 로그창에 노출하지 않도록, 기존 API/복호화 문구를 `[소설] 추출 중...` 및 `✅ 추출 성공:` 으로 일괄 단순 통합했습니다.

### 🏛️ 차세대 다형성 팝업 IPC 미디어 수집 엔진 및 보안 극복 시스템 안착
- **Controller-Worker 팝업 IPC 모델 도입**: 복잡하고 가변적인 복호화 API 경로를 우회하기 위해, 다운로드 시 백그라운드 팝업(`tokisync-novel-worker`)을 기동하여 크로스 도메인 `postMessage`로 최종 렌더링된 데이터를 교환하는 실시간 통신 엔진을 성공적으로 구현했습니다.
- **다형성 미디어(소설/만화) 지원**: 팝업이 로드될 때 에피소드 타입(텍스트/이미지)을 자동 판별하여 소설 본문 노이즈 프리 텍스트 파싱 및 웹툰/만화 이미지 리스트(`images`) 수집을 동적으로 처리하는 범용 수집 라이프사이클을 탑재했습니다.
- **오염 방지 텍스트 정제(Cleansing)**: `innerHTML` 기반 임시 DOM 래퍼를 생성하여 Shadow DOM 렌더링 시 포함되는 불필요한 `<style>` 및 `<script>` 태그를 강제 배제함으로써 본문 데이터 오염을 완벽히 차단했습니다.
- **3대 보안 극복 대응(toString Spoofing, Opener 격리, Jitter Delay)**:
  - **Spoofing**: 사이트 측의 네이티브 함수 변조 탐지를 방어하기 위해 `attachShadow.toString()`의 네이티브 포맷 위장을 탑재했습니다.
  - **Opener**: 부모 창 통신망 바인딩 즉시 `window.opener = null`을 강제 주입해 팝업 호출 관계를 은폐했습니다.
  - **Jitter**: WAF 봇 행동 감지를 무력화하도록 수집 성공 후 다음 화 갱신 전 3~5초 범위의 랜덤 임의 대기(Jitter Delay) 시간을 자동 부여했습니다.
- **통합 수집 세션 클린업**: 다운로드 큐가 끝나거나 예외 타임아웃 발생 시 켜져 있는 팝업창을 즉각 자동 폐쇄(`closeActivePopup()`)하는 안정적인 수명 주기를 연동했습니다.

## [v1.10.0] - 2026-05-18

### ✨ 파싱 규칙 가져오기(Import) 다중 선택 모달 도입 및 초기 데드락 제거
- **가져오기 방식 다변화 (모달 팝업)**: 트리 에디터의 "가져오기" 클릭 시 로컬 JSON 파일과 원격 URL을 자유롭게 선택하여 가져올 수 있는 Glassmorphism 스타일 모달을 구축했습니다.
- **초기 사용자 메뉴 데드락 해제**: 사이트 감지(`detectSite`) 동작 전 Tampermonkey 전역 메뉴(`GM_registerMenuCommand`)를 즉시 등록하여, 신규 사이트나 지원되지 않는 도메인에서도 설정 모달 및 규칙 편집기를 자유롭게 호출해 교착 상태(Deadlock)를 돌파할 수 있도록 수정했습니다.
- **원격 URL 캐싱 아키텍처**: 페이지 렌더링을 블로킹하지 않도록 로컬 캐시를 우선 반환한 뒤 백그라운드에서 비동기로 원격 규칙을 갱신하는 라이프사이클을 확립했습니다.

## [v1.9.41] - 2026-05-18

### 🐛 GAS 번들 빌더 누락 핫픽스 (DriveAccessService 해결)
- **번들 구성 정상화**: 구글 앱스 스크립트(GAS)용 단일 번들 파일(`TokiSync_Server_Bundle.gs`) 빌드 시 `DriveAccessService.gs` 파일이 번들러 소스 리스트(`build_bundle.cjs`)에서 누락되었던 문제를 발견하고 수정했습니다.
- **설치 오류 해결**: v1.8.0 이후 신규 설치하는 사용자가 번들 파일을 복사해서 사용할 때 발생하던 `ReferenceError: DriveAccessService is not defined` 런타임 에러가 완전히 해소되었습니다.

## [v1.9.4] - 2026-05-17

### ✨ 제너릭 파서 고도화 및 도메인 유연성 확보
- **하드코딩 idMatch 제거 및 지능형 Fallback ID 추출**: 룰 설정 내에 `idMatch`가 없거나 빈 값이어도 카테고리(Webtoon/Manga/Novel)와 `urlPattern`을 분석하여 작품 고유 ID를 안전하게 파싱해내는 지능형 복구 엔진을 탑재했습니다.
- **RegExp 조립 도메인 대응**: 복잡한 사이트 주소 로테이션(예: `sbxh1.com` 등) 환경에서 수동 도메인 매칭 부담을 없애기 위해, `urlPattern` 기반으로 정규표현식을 실시간으로 자동 조립하여 대응하는 아키텍처로 개편했습니다.

### 🛡️ 이미지 격리 차단 및 폴백 무결성 보장
- **`imageRegex`와 `imageContainer` 상호배타적 처리**: 두 방식의 동작 한계를 명확히 규정하여, `imageContainer`가 명시된 경우 광고 배너 등 페이지 전체의 이미지가 과다 파싱되는 문제를 차단했습니다.
- **수집 규칙 최적화**: `rules.sample.json` 내 `sbxh_webtoon` 및 `sbxh_manhwa` 항목의 불필요한 `imageRegex`를 완전히 지우고, 본문 이미지만 골라내도록 `div.vw-imgs` 컨테이너 전용으로 깔끔하게 마이그레이션했습니다.

## [v1.9.3] - 2026-05-17

### ✨ UI 아키텍처 현대화 및 클래스 기반 리팩터링 완료
- **인라인 스타일 완전 제거**: `ui.js`, `config.js`, `downloader.js` 등 전 모듈에서 하드코딩된 `style=""` 속성을 제거하고 `ui.css` 클래스 기반으로 전환했습니다.
- **동적 상태 관리 개선**: `element.style.display` 조작 방식을 `classList.toggle` 방식으로 개편하여 UI 렌더링 성능과 유지보수성을 향상시켰습니다.
- **Glassmorphism 디자인 완성**: 텍스트에어리어(`.toki-textarea`), 정보 카드(`.toki-info-card`), 동기화 상태 표시기 등 모든 UI 요소에 일관된 프리미엄 디자인을 적용했습니다.
- **핫픽스 통합**: 상세 설정 모달 내 History 탭 레이아웃 및 입력 폼 스타일 누락 문제를 해결했습니다.

## [v1.8.3] - 2026-05-12



### 🎨 UI/UX 전면 개편 및 사용성 향상
- **모달 너비 확장 (520px)**: 기존 360px에서 520px로 모달 너비를 확장하여 시각적 답답함을 해소하고 가독성을 높였습니다.
- **상단 가로형 탭 인터페이스 도입**: 아코디언 방식의 메뉴 구조를 직관적인 상단 탭 시스템(다운로드, 설정, 시스템)으로 개편하여 원하는 기능에 더 빠르게 접근할 수 있도록 개선했습니다.
- **공간 밸런스 최적화**: 넓어진 너비에 맞춰 버튼 크기, 폰트 사이즈, 내부 여백을 재조정하여 세련된 디자인을 구현했습니다.
### ✨ 다운로드 엔진 안정화 및 실패 관리 시스템

- **상세 실패 리포트 자동 생성**: 다운로드 중 발생한 완전 실패 및 부분 실패(이미지 누락 등) 내역을 추적하여 세션 종료 시 `[작품명]_다운로드_실패_리포트.txt` 파일을 자동으로 생성합니다.
- **Lazy 로딩 완벽 대응 (`keyDiscovery`)**: 사이트별 동적 속성을 자동으로 탐색하는 `keyDiscovery` 엔진을 강화하여 지연 로딩 방식의 웹툰/소설 수집 안정성을 극대화했습니다.
- **소설 API 복호화 정제 로직 고도화**: 암호화된 소설 데이터 수신 시 포함되는 불필요한 JSON 래퍼 및 이스케이프 문자를 정규식 기반으로 완벽히 제거하여 깨끗한 텍스트 추출을 보장합니다.
- **소설 API 속도 제한 해제**: 기존에 IP 차단 방지를 위해 강제되었던 `very_slow` 속도 제한을 해제하고, 사용자가 설정한 다운로드 속도 정책을 따르도록 변경했습니다. (설정된 대기 시간을 존중합니다.)

### 🛠 빌드 및 기타 수정

- **변수 선언 중복 오류 수정**: 모달 렌더링 로직의 변수 중복 선언 버그를 해결하여 빌드 안정성을 확보했습니다.

## [v1.8.1] - 2026-05-08

### 🐛 GAS V8 런타임 호이스팅 버그 픽스 (ReferenceError 해결)

- **전역 스코프 안전성 확보**: GAS V8 런타임 환경에서 `DriveAccessService`, `Debug`, `Main` 등 다중 파일 간 상태를 공유하는 최상위 `const` 변수들이 로딩 순서에 따라 `ReferenceError`를 발생시키는 문제를 해결했습니다.
- **TDZ(Temporal Dead Zone) 회피**: 문제가 되는 모든 최상위 변수 선언을 글로벌 호이스팅이 보장되는 `var` 키워드로 일괄 변경하여 뷰어 구동 중 발생하던 "로드 실패" 에러를 완벽히 차단했습니다.

### ✨ 다운로드 안정성 및 순서 최적화

- **속도 제어 정책 확장**: 기존 3단계 정책의 한계를 넘어 서버의 봇 방어 기제(WAF, DDoS 감지)를 우회하기 위해 `느림(5-15초)`과 `매우 느림(10-30초)` 옵션을 새롭게 추가했습니다.
- **API 복호화 안전장치**: 소설 복호화(API 모드) 시 IP 차단 리스크를 최소화하기 위해 사용자의 설정과 관계없이 가장 안전한 `very_slow` 단계를 강제 적용하도록 로직을 강화했습니다.
- **범위 다운로드 정렬 보장**: 특정 회차 범위 지정 다운로드 시, 역순 목록 구조로 인해 역방향으로 다운로드되던 문제를 해결하고 오름차순(1화 -> 10화) 정렬 처리를 내장하여 사용자 경험을 개선했습니다.


### ✨ V2 소설 뷰어 고도화 및 정밀 동기화 (Precision Reading)

- **V1 텍스트 설정 툴바 완벽 이식**: 테마(Light/Sepia/Dark), 폰트 크기, 줄 간격 조절 기능을 V2 플로팅 툴바에 통합했습니다.
- **DOM Offset 기반 Locator 엔진 도입**: 기존 비율 기반 추측을 폐기하고, DOM 요소의 `offsetLeft`를 이용한 정밀 계산 방식을 도입하여 설정 변경 후에도 읽던 위치를 1px 오차 없이 유지합니다.
- **독서 가로폭 표준화**: 가독성 향상을 위해 본문 최대 폭을 소설책 규격인 **720px**로 고정하고 중앙 정렬 레이아웃을 적용했습니다.
- **진도 유실 방지 (Flush & Reset Policy)**:
    - 에피소드 전환 및 종료 시 현재 위치를 즉시 DB에 저장하는 `flushSaveToDB` 로직을 추가했습니다.
    - 새 에피소드 로드 시 이전 마커가 잔류하는 '데이터 오염' 문제를 해결하기 위해 `resetLocator`를 통한 초기화 프로세스를 강제했습니다.
- **UI/UX 폴리싱**: 설정 변경 시 실시간 페이지 재계산 반영 및 로딩 오버레이 연동 안정화.

## [v1.8.0] - 2026-04-17

### 🚀 차세대 Drive API V3 아키텍처 전환 및 백엔드 전면 개편

- **Legacy `DriveApp` 완전 제거 (Zero-DriveApp)**: 권한 스코프 경고 최소화 및 속도 향상을 위해 기존의 무겁고 제약이 많은 `DriveApp` 클래스 의존성을 100% 걷어냈습니다.
- **Drive API V3 기반 중앙 추상화 계층 (DriveAccessService) 정립**:
    - 파일/폴더 I/O, 메타데이터 연산 및 스캔 등 구글 드라이브와 상호작용하는 모든 로직을 Advanced Service 기반 V3 API로 통일했습니다.
    - 루트 폴더 조회(`getRootId`), 파일명 변경(`patch`), 폴더간 이동(`move`) 등 강력한 V3 기반 메서드들을 추가 지원합니다.
- **REST 통신을 통한 첨단 미디어 폴백 시스템 구현**:
    - Drive V3 변경 후 발생하는 Blob 타입 캐스팅 오류(`getDataAsString is not a function` 등) 현상을 선제적으로 방어하기 위해, **UrlFetchApp 기반의 명시적 REST API 호출**을 결합(Hybrid)하여 가장 최신의 파일 내용과 바이트 스트림을 고속으로 다운로드하도록 안정성을 극대화했습니다.
- **데이터 흐름 정합성 및 인덱스 최적화**:
    - `SyncService`, `View_LibraryService` 등 전 구간의 인덱스 검색, 객체 반환(`id` 통일) 인터페이스를 정밀히 리팩터링하여 향후 업데이트(i18n, 설정 동기화 등) 확장에 유리한 확고한 설계 기반을 다졌습니다.
- **뷰어 V1/V2 정합성 복구 및 페이지 모드 최적화**:
    - **하위 호환성 완벽 복구 (V1 Recovery)**: 데이터 파이프라인(`useFetcher.js`)의 필드명을 `content`로 원복하여, 최신 업데이트 후 빈 화면이 나오던 V1 소설 뷰어를 즉시 정상화했습니다.
    - **V1-Logic 기반 정밀 페이지 엔진 (Option A)**: V2 `TextRenderer`에 V1의 검증된 페이지 알고리즘을 이식했습니다.
        - **자가 페이지 제어**: 컴포넌트가 직접 `clientWidth`를 측정해 컬럼 폭을 `px`로 고정하여 서브픽셀 오차를 차단합니다.
        - **단위 정밀도**: 기존의 불안정한 `vw` 이동을 폐기하고, 자기 자신을 기준으로 한 `%` 단위(`translateX(-N * 100%)`)를 사용하여 모든 환경에서 1px의 어긋남 없는 정확한 페이지 넘김을 구현했습니다.
    - **메모리 최적화**: HTML 원본을 중복 저장하지 않고 `content` 필드 하나로 V1(HTML)과 V2(파싱 단락)가 공존하도록 설계하여 대용량 EPUB 로드 시의 안정성을 높였습니다.

## [v1.7.6] - 2026-04-16

### ✨ 뷰어 안정성 및 네트워크 최적화 (Stability & Traffic Control)

- **무한 루프 차단 (Sync Guard Implementation)**: 뷰어 하단 슬라이더(Slider)와 실제 스크롤 위치 간의 무한 동기화 재귀 호출을 근본적으로 해결했습니다.
    - **Synchronous Sync**: 슬라이더 조작 시 `smooth` 애니메이션 대신 즉시 이동(`auto`)하도록 변경하여 비동기 스크롤 이벤트 폭주를 방지했습니다.
    - **Position Guard**: 이동하려는 목표 위치가 현재 뷰포트와 임계값(20px) 이내일 경우 스크롤 연산을 건너뛰어 화면 튐 현상을 제거했습니다.
    - **Locking Refinement**: `isScrollSyncing` 잠금 해제 타이밍을 최적화하여 브라우저의 스크롤 처리와 상태 반영 주기를 안정화했습니다.
- **스마트 사전 다운로드 (Preload Threshold)**: 다음 화를 미리 가져오는 시점을 지능화하여 네트워크 부하와 GAS 서버 에러(`ERR_HTTP2`)를 해결했습니다.
    - **50% Trigger**: 에피소드 진입 즉시 다운로드하던 방식에서, 사용자가 본문의 50% 이상을 읽었을 때만 백그라운드 다운로드를 시작하도록 변경했습니다.
    - **Single-fire Flag**: `isPreloadTriggered` 플래그를 통해 한 에피소드 내에서 사전 다운로드 요청이 단 1회만 발생하도록 보장했습니다.

## [v1.7.5] - 2026-04-15

### ✨ 다운로드 매니저 모달화 및 UX 고도화 (Refined Control)

- **Download Manager (모달형 관리자)**: 기존의 별도 페이지 방식에서 시청 중에도 즉시 호출 가능한 **슬라이드업 모달 UI**로 전면 개편했습니다. 
    - **UX 최적화**: 어느 화면에서나 다운로드 아이콘을 터치하여 실시간 진행 상황을 확인하고 관리할 수 있습니다.
    - **ESC 키 지원**: 데스크탑 환경에서 ESC 키로 간편하게 모달을 닫을 수 있는 편의 기능을 추가했습니다.
- **AbortController 이중화 (Network Isolation)**: 뷰어 세션과 다운로드 매니저 세션의 네트워크 컨트롤러를 완전 분리했습니다. 이제 뷰어 종료 시 실시간 로딩은 즉시 중단되지만, 매니저를 통한 백그라운드 다운로드는 간섭 없이 지속됩니다.
- **Zero-Waste 중단 로직 (Early Abort)**: 뷰어를 나갈 때 다음 화 미리 읽기(Preload) 작업뿐만 아니라, 모든 무거운 연산 진입 전 중단 신호를 체크하여 불필요한 리소스 소모를 제로화했습니다.
- **LRU GC 고착 결함 수정 (Critical Fix)**: 에피소드가 5개 이하일 때 가비지 컬렉션(GC) 상태가 해제되지 않아 자동 용량 관리가 불가능해지던 치명적인 논리 결함을 수정했습니다.
- **매니저 동기화 보강**: 관리자 UI에서 항목 제거 시, 현재 진행 중인 실제 네트워크 요청도 즉시 중단(Abort)되도록 로직을 일원화하여 성능 누수를 방지했습니다.
- **Dexie DB v6 마이그레이션**: `seriesId` 인덱스를 추가하여 수천 개의 에피소드가 쌓인 라이브러리에서도 시리즈 단위의 캐시 조회 및 삭제 성능을 대폭 향상시켰습니다.
- **UI/UX 폴리싱**:
    - **ReaderView**: 다운로드 오버레이에 즉시 취소 및 탈출 버튼 추가.
    - **NavHeader**: 다운로드 매니저 토글 아이콘 배치 및 변수 누락 핫픽스.
    - **EpisodesView**: 에피소드별 캐시 상태 표시(PK 조회 최적화) 및 수동 다운로드 트리거 추가.
    - **Design**: 전반적인 인터페이스에 Glassmorphism 및 고급스러운 애니메이션 체계 적용.
- **개발 환경 최적화 (Dev Experience)**:
    - **Local CORS Proxy**: `vite.config.js`에 GAS 전용 프록시 설정을 추가하여 로컬 환경에서도 API 통신 테스트가 가능하도록 개선했습니다.
    - **Dynamic BaseUrl**: 개발 모드(`import.meta.env.DEV`)와 프로덕션 모드에 따라 API 주소를 자동 전환하도록 설계했습니다.

## [v1.7.4] - 2026-04-14

### ✨ 엔진 안정성 및 사용자 경험 고도화 (Performance & Fail-safe)

- **히스토리 조회 페일세이프 (Pinpoint Check)**: 전체 에피소드 이력 조회 타임아웃 발생 시, 다운로드 중단을 방지하기 위해 개별 에피소드 단위로 드라이브를 정밀 검증하는 2차 방어 로직을 구현했습니다.
- **뷰어 사전 다운로드 (Background Preload)**: 현재 회차를 감상하는 동안 다음 회차를 백그라운드에서 미리 다운로드하여 대기 시간을 제거했습니다. (설정 패널에서 온/오프 가능)
- **레이스 컨디션 방어 (Promise Cache)**: 사전 다운로드 중 사용자가 다음 화로 즉시 이동할 경우, 중복 다운로드 없이 기존 진행 중인 다운로드 프로세스를 안전하게 계승하는 구조를 구축했습니다.
- **영구 캐시 엔진 (Level 2 Cache)**: IndexedDB 기반의 바이너리 캐싱 시스템을 도입하여, 한 번 읽은 에피소드는 새로고침 후에도 다시 다운로드하지 않고 즉시 로드됩니다.
- **6분할 터보 다운로드 엔진**: 모든 파일(5MB+)을 균등하게 6개 청크로 분할하여 다운로드하는 고정형 병렬 엔진을 탑재했습니다. 잔여 바이트 계산 오차를 완벽 보정하여 압축 해제 안정성을 극대화했습니다.
- **가변 병렬도 설정**: 뷰어 설정 메뉴에서 1~3개의 다운로드 스레드를 선택할 수 있는 기능을 추가하여 하위 대역폭(4G/3G) 환경 최적화를 지원합니다.
- **고도화된 진행률 UI**: `(33%) [2/6]`와 같이 현재 청크 단계와 퍼센티지를 결합하여 직관적인 다운로드 상태를 제공합니다.
- **LRU 기반 자동 관리 (GC)**: 저장 공간 확보를 위해 최신 열람 에피소드 5개만 캐시에 유지하고 오래된 데이터는 자동으로 삭제하는 가비지 컬렉션 시스템을 적용했습니다.
- **레이지 로딩 고속화 (Hybrid Jump Engine)**: 기존 스크롤 방식 대비 최대 7배 빠른 이미지 로딩 스캔 엔진을 통합하여 대용량 작품의 초기 로딩 속도를 혁신적으로 단축했습니다.
- **썸네일 파싱 로직 다각화(Deep Fallback)** 및 **빌드 호환성 핫픽스**: 모듈 임포트 오동작 수정 및 본문 이미지 추출 성공률을 개선했습니다.


## [v1.7.3-hotfix] - 2026-04-09

### 🚀 Direct Drive 업로드 안정화 및 자가 회복 로직 도입

- **Resumable Upload (5MB Chunk)**: `uploadDirect` 함수를 멀티파트 방식에서 Google Drive 공식 분할 전송 방식으로 전면 개편했습니다. 대용량 파일(33MB+) 처리 시 브라우저 메모리 제한 및 서버 응답 크기 제한 에러를 완벽히 해결했습니다.
- **자가 회복 로직 (Self-Healing)**: Fast Path(직행 덮어쓰기) 시도 중 구글 드라이브에서 'Trash' 또는 'Not Found' 에러가 발생할 경우, 유저스크립트 내 `episodeCacheMap`을 즉시 정리하고 일반 업로드 분기로 자동 전환하는 지능형 복구 시스템을 구축했습니다.
- **고성능 Base64 엔진 전면 적용**: `gas.js` 및 `downloader.js` 내부의 저효율 Base64 변환 루프를 청크 기반 고속 알고리즘으로 교체하여, 대용량 파일 전송 시의 CPU 부하를 줄이고 처리 속도를 극대화했습니다.

## [v1.7.3] - 2026-04-08

- **동적 LazyKey 탐지 시스템**: 마나토끼 등에서 매 화차마다 랜덤하게 생성하는 `data-*` 속성명을 자동으로 추적하는 엔진을 도입했습니다. (스크립트 파싱 및 요소 역추적 하이브리드 방식)
- **더미 플레이스홀더 차단 강화**: `loading-image.gif` 등 최신 안티 봇용 플레이스홀더 패턴을 `isDummyUrl` 필터에 추가하여 초기 로드 시의 오탐지를 완벽히 제거했습니다.
- **주요 컨테이너 정밀 선별**: `.view-padding` 요소가 여러 개 존재하는 경우(미끼 요소 포함), 이미지 개수가 가장 많은 요소를 본문으로 자동 선택하여 데이터 무결성을 확보했습니다.
- **이미지 수집 우선순위 최적화**: 동적 탐지된 키를 1순위로 배치하고, 실패 시 기존 속성과 전체 data 속성 순회로 이어지는 5단계 폴백 시스템을 구축했습니다.
- **로직 동기화**: `BaseParser`를 중심으로 인라인 파싱 함수(`parser.js`, `utils.js`)들을 최신 규격으로 일괄 업데이트했습니다.
- **Native 다운로드 확장자 변조 수정**: Blob 생성 시 MIME 타입을 명시적으로 지정하여 `.cbz`가 `.zip`으로 저장되는 이슈를 해결했습니다.

## [v1.7.2] - 2026-04-03

### ✨ 파서 아키텍처 모듈화 및 하이브리드 수집 엔진 고도화

- **전략 패턴(Strategy Pattern) 파서 도입**: `BaseParser`, `TokiParser`, `ParserFactory`를 통한 클래스 기반 파싱 엔진을 구축하여 사이트별 파싱 로직을 완전히 분리(Decoupling)했습니다.
- **코드 중복 제거 및 로직 일원화**: `main.js`와 `downloader.js`에 산재해 있던 `rootFolder` 생성 및 제목 정규화 로직을 `BaseParser`로 통합하여 데이터 일관성을 확보했습니다.
- **UI 정합성 강화**: `ui.js`의 다운로드 표시(Marking) 로직을 하드코딩된 셀렉터에서 추상화된 파서 메서드로 교체하여, 사이트 구조 변경 시에도 유연하게 대처할 수 있도록 개선했습니다.
- **하이브리드 이미지 수집 (Hybrid Fetching)**: 렌더링 전 `data-original` 속성 선점과 스크롤 후 최종 URL을 병합하는 로직을 `downloader.js`에 안착시켜 레이지 로딩 방어력을 극대화했습니다.

## [v1.7.1] - 2026-03-31

### ✨ 소설 단행본(Single Volume) 합본 기능 고도화

- **화수 범위 네이밍**: 기존 `(합본)` 표기 대신 `(시작화-끝화화)` 형식으로 자동 명명되도록 개선하여 회차 범위를 직관적으로 표시합니다.
- **NaN 방어 로직**: 에피소드 번호가 숫자가 아닌 경우(공지, 특별편 등)에도 파일명이 깨지지 않도록 예외 처리 코드를 추가했습니다.
- **강제 빌드 보장**: 합본 모드에서는 Smart Skip을 무시하고 전체 회차가 포함된 완전한 파일을 생성하도록 로직을 강화했습니다.

### 🐛 UI 및 안정성 핫픽스

- **상세 설정 모달 TypeError 수정**: 특정 상황에서 DOM 요소를 찾지 못해 발생하던 `Cannot set properties of null` 오류를 해결하고 방어 코드를 적용했습니다.
- **뷰어 타이틀 정리**: 브라우저 탭에 표시되는 구형 버전 정보를 제거하고 `TokiSync Viewer`로 일관성을 맞췄습니다.
- **GAS 호환성**: 서버 코드에 클라이언트 v1.7.1+ 대응을 위한 하위 호환성 메모를 추가했습니다.

### 🔒 보안 정밀 점검

- **ID/Key 노출 검증**: 전 커밋 히스토리 및 소스 코드를 대상으로 GAS 배포 ID와 API_KEY 유출 여부를 정밀 조사하여 안전함을 확인했습니다.
- **내부 문서 보호**: 분석 보고서 및 기밀 문서들이 Git에 추적되지 않도록 `.gitignore`를 업데이트했습니다.

## [v1.7.0] - 2026-03-31

### ✨ AI Agent 운영 및 검증 프로토콜 도입

- **자체 논리 감사(Self-Audit) 의무화**: 모든 코드 수정 전후로 논리적 결함, 아키텍처 정합성, 에지 케이스를 자가 진단하도록 `AI_AGENT_CONTEXT.md` 및 `.geminirules`에 프로토콜을 명시했습니다.
- **실시간 기록 원칙 (Immediate Record)**: 정보 누락을 방지하기 위해 모든 기술적 변경 사항을 수정 즉시 `CHANGELOG.md`에 반영하는 규칙을 도입했습니다.
- **검증 보고(Reporting) 강화**: 작업 완료 후 `documentation/reports/walkthrough.md` 등을 통해 검증 내용과 예상 결과를 사용자에게 명확히 보고하도록 프로세스를 표준화했습니다.

### ✨ Smart Skip 엔진 고도화 및 강제 재다운로드 UI

- **용량 기반 결함 파일 필터링**: 기존의 단순 파일명 탐색을 넘어, Google Drive API를 직접 호출(Direct Fetch)하여 파일의 메타데이터(용량: size)를 수집합니다.
- **Max 기반 휴리스틱 검증**: 다운로드 중 캡처 미스로 발생한 더미 파일(예: 1~2MB)을 걸러내기 위해, 해당 폴더 내 최고 용량(Max) 에피소드를 기준으로 삼아 N% 미만의 용량을 가진 파일은 손상된 것으로 간주하고 재다운로드 대상에 포함합니다.
- **민감도 조절 UI**: 환경 설정(⚙️) 메뉴에 `Smart Skip 민감도 (최고 용량 기준)` 옵션을 추가하여, 사용자가 직접 손상 판별 기준(90%, 80%, 70%, 50%)을 세밀하게 조절할 수 있도록 개선했습니다.
- **강제 덮어쓰기 (Force Overwrite)**: Smart Skip(기존 기록 기반 건너뛰기) 로직을 무시하고 강제로 전체 데이터를 다시 받아 기존 파일을 덮어쓰는 `⚠️ 강제 재다운로드 (기존 파일 덮어쓰기)` 옵션을 다운로드 모달에 추가했습니다.

### 🐛 Fast Path (덮어쓰기) 안정화

- **Missing folderId 에러 수정**: GAS 서버 구조 개편으로 인해 모든 요청에 `folderId`가 필수로 요구됨에 따라, Fast Path 캐시 조회(`getBooksByCacheId`), 빠른 덮어쓰기 세션 초기화(`init_update`), 청크 데이터 업로드(`upload`) 페이로드에 누락되었던 `folderId`를 추가하여 덮어쓰기 시 발생하는 500 에러를 완벽히 해결했습니다.

### ✨ 고성능 뷰어 엔진 및 하이브리드 동기화 시스템

- **Virtual Scroll Stabilization**: `pendingElements` 큐 도입으로 렌더링 누락을 방지하고, `aspect-ratio` 캐싱을 통해 이미지가 DOM에서 해제되어도 스크롤 위치와 레이아웃 높이를 1px 단위까지 완벽하게 보존합니다.
- **Merge-First Cloud Sync Policy**: 여러 기기/브라우저 사용 시 발생하는 이력 덮어쓰기(Conflict) 문제를 해결하기 위해, 업로드 전 항상 서버 데이터를 먼저 가져와 병합(Pull & Merge)하는 정책을 아키텍처 레벨에서 강제합니다.
- **Real-time Cross-Tab Sync**: 다른 탭에서 발생한 이력을 감지하기 위해 `visibilitychange` 이벤트를 리스닝하며, 탭 복귀 시 페이지 새로고침 없이 최신 열람 상태를 즉시 UI에 반영합니다.
- **Scroll Mode Optimization**: 웹툰의 상하 연결성을 보존하기 위해 스크롤 모드(`viewerData.mode === 'scroll'`)에서는 Auto-Crop(`clip-path`) 기능을 자동으로 제외하도록 레이아웃 로직을 분기 처리했습니다.
- **Manual Sync Support**: 뷰어 에피소드 목록 좌측 하단에 [동기화 (Sync)] 버튼을 추가하여, 언제든 수동으로 클라우드 최신 상태를 당겨올 수 있도록 지원합니다.

#### 🛠 Technical Details (v1.7.0)

- **Engine**: `useVirtualScroll.js` 내 `IntersectionObserver` 마진 최적화(3000px) 및 `aspectRatioMap` 구현.
- **Sync**: `useStore.js` 내 `pushHistoryToDrive` 리팩토링 (무조건 `syncHistoryFromDrive` 선행).
- **Bridge**: `src/core/main.js` 내 `visibilitychange` 리스너 및 `TOKI_HISTORY_DIRTY` (GM_setValue) 플래그 시스템 구축.
- **UI**: `EpisodesView.vue` 내 동기화 버튼 UI 및 로딩 스피너 연동.
- **Smart Double Spread**: 지능형 2쪽 보기 알고리즘 (`useSpread.js`) 및 RTL/CoverFirst 옵션 완벽 지원.
- **Auto-Crop Engine**: OffscreenCanvas 분석 기반 여백 제거 및 IndexedDB(`imageMeta`) 캐싱 연동.

---

## [v1.6.0] - 2026-03-15

### ✨ Kavita 호환성 강화 및 배치 다운로드 시스템

- **CBZ 구조 표준화**: 이미지를 루트 폴더에 직접 배치하고 `ComicInfo.xml` 메타데이터를 자동 생성하여 Kavita 등 외부 뷰어 호환성 극대화.
- **5개 단위 배치(Batching) 다운로드**: 대량 다운로드 시 브라우저 메모리 부족으로 인한 크래시를 방지하기 위해 `zipOfCbzs` 사용 시 5화마다 ZIP 파일을 생성하여 저장하도록 로직 개선.
- **정책 정비**: `folderInCbz` 정책 폐기 (사용 시 자동으로 `zipOfCbzs` 배치 모드로 전환).

#### 🛠 Technical Details (v1.6.0)

- **File ID Tracking (Fast Path)**: 드라이브 내 동일 이름 파일 검색 시간을 단축하여 업로드 속도 5배 이상 향상. `cacheFileId` 필드를 `index.json`에 저장하여 PUT 청크 업로드 수행.
- **Background Merge Automation (`SweepMergeIndex`)**: 업로드 직후 생성된 `_MergeIndex` 파편을 크론 트리거(`TimeDriven_SweepMergeIndex`)를 통해 자동 병합.
- **갈무리 안정화 (DOM 폴링)**: `waitForContent` (최대 8초) 및 `scrollToLoad` (800px 스텝) 도입으로 Lazy-render 대응 강화.
- **네트워크 Anti-Hang**: `GM_xmlhttpRequest`에 업로드 시 5분 타임아웃 및 에러 핸들링 도입.
- **커스텀 범위 선택**: 드래그 슬라이더 대신 텍스트 입력(`1,2,4-10`) 방식의 `parseRangeSpec` 구현.
- **GAS Script ID 전환**: 배포 URL 대신 Script ID만 관리하도록 개선 및 자동 마이그레이션 도입.
- **LogBox 2.0**: 3단계 심각도(INFO/WARN/CRITICAL) 정밀 로깅 및 원클릭 버그 리포트 생성기 도입.

## [v1.5.6] - 2026-03-05

### 🛠 배포(Deployment) 안정화 및 파이프라인 개편

- 기존 GitHub Actions의 Artifact 덮어쓰기 방식으로 인한 '호스팅 초기화(404 에러)' 충돌 문제 해결.
- `peaceiris/actions-gh-pages` 플러그인을 도입하여 `gh-pages` 브랜치 전용 배포로 마이그레이션.
- Push(`dev`) 환경과 Release(`stable`) 환경이 완전히 독립적인 경로로 병합되도록 구조 개선.

### 💾 GAS 구글 드라이브 스토리지 누수 방지

- Drive 단일 폴더 내 중복 파일 무한 생성 버그 픽스 (`index.json`, `cover.jpg` 등).
- 기존 파일 덮어쓰기 로직에 순회(`while`)를 추가하여, 잔존하는 동일 이름의 복제 좀비 파일들을 자동으로 휴지통(Trash)으로 폐기하도록 최적화.

### 🧩 메타데이터(Config) 링크 갱신

- Tampermonkey 스크립트의 404 오작동 업데이트 경로(`@updateURL` 등)를 정상적으로 작동하는 `gh-pages` 호스팅 주소(`https://pray4skylark.github.io/tokiSync/tokiSync.user.js`)로 복구 완료.

### 📋 프로젝트 마스터 룰 업데이트

- AI 코딩 어시스턴트의 명령어 접근 및 빌드 권한에 대한 엄격한 규칙 세분화 적용 (`.geminirules`).

## [v1.5.5] - 2026-03-03

### 🎨 EpisodesView 전면 재설계

- KakaoPage 스타일 2패널 레이아웃 도입: 왼쪽 사이드바(커버 + 액션 버튼) + 오른쪽 에피소드 목록 카드.
- 세로형 썸네일(`aspect-[1/1.45]`), 커버 후광 효과(`ring-8 ring-white/10`), 첫 화 보기 버튼 강조(옐로우) 등 디자인 디테일 대폭 강화.
- "End of Collection" 마커 및 hover scale 효과 추가.

### 🌗 전역 테마 시스템 구축

- `html[data-theme="dark"|"light"]` 속성 기반의 전역 다크/라이트 모드 전환 시스템 신설.
- 모든 컬러를 `--t-*` CSS 변수 체계로 통일, 컴포넌트 내 하드코딩 색상 완전 제거.
- `useStore.js`의 `appTheme` / `toggleTheme`으로 단일 관리, NavHeader 토글 버튼 항시 표시, `localStorage` 설정 유지.

### ⚙️ 뷰어 이벤트 아키텍처 전면 재설계

- 마우스·터치·키보드 이벤트가 분산된 구조(`nav-zone`, `useTouch.js`, `useKeyboard.js`)를 **`useViewerInput.js` 단일 컨트롤러**로 통합.
- 화면 좌 15% / 우 15% / 중앙 영역 자동 판별 (`getZone(clientX)`) 로직 구현.
- 터치 후 Ghost Click 500ms 방지 내장, `nav-zone` HTML 패턴 완전 폐기.
- 리더 툴바의 하드코딩 색상을 테마 변수 클래스(`viewer-toolbar-icon` 등)로 교체.

### 🐛 모바일 터치 버그 3종 수정

- 툴바 위 터치 오동작: `isUIElement` 선택자에 `.viewer-toolbar` 누락 추가.
- iOS 장시간 사용 시 터치 저하: `touchmove` passive 옵션을 뷰어 모드 전환 시 동적 교체.
- Blob URL 메모리 누수: `startReading()` 진입 시 `cleanupBlobUrls()` 즉시 호출.

### ✨ 마지막 화 다음 에피소드 안내 화면

- 스크롤 모드: 콘텐츠 하단 인라인 안내 섹션(다음 화 썸네일 + 제목 + 이동 버튼).
- 페이지 모드: `showNextEpisodeGuide` 전체화면 fade 전환, `prev()` 시 마지막 페이지 복귀.
- 이미지/소설 양쪽 모드 모두 적용.

#### 🛠 Technical Details (v1.5.5)

- **EpisodesView 2패널 레이아웃**: `rounded-[32px]` 카드, `aspect-[1/1.45]` 세로형 썸네일, `ring-8` 후광 효과 적용.
- **전역 테마 시스템**: `html[data-theme]` 속성 및 `--t-*` CSS 변수 체계 구축. `useStore.js` 싱글톤에서 상태 관리.
- **통합 입력 컨트롤러 (`useViewerInput.js`)**: 마우스/터치/키보드 이벤트를 단일 지점에서 처리. `getZone()` 기반 구역 판별 및 Ghost Click(500ms) 방지.
- **모바일 최적화**: iOS 스크롤 저하 해결을 위한 동적 `passive` 옵션 교체 및 Blob URL 메모리 누수 방지(`cleanupBlobUrls`).
- **이어보기 위치 정합성**: `startReading()` 및 `openSeries()` 시점에 이력을 강제 리프레시하여 '마지막 읽은 곳' 추적 정밀화.

### 🗑️ Deprecated

- `src/viewer/composables/useTouch.js` 삭제 (`useViewerInput.js`로 완전 대체).

## [v1.5.0] - 2026-02-19

### 📱 Unified Menu Modal (Modern UI)

- **Centralized Control**: 기존의 산재된 Tampermonkey 메뉴(다운로드, 설정, 마이그레이션 등)를 **단일 통합 모달**로 통합했습니다.
- **Improved UX**:
  - **FAB (Floating Action Button)**: 화면 우측 하단 버튼으로 언제든지 호출 가능.
  - **Keyboard Shortcut**: `Ctrl + Shift + T` 단축키 지원.
  - **Accordion Layout**: 다운로드/동기화/설정 카테고리화.

### 🎥 Viewer 2.0 (Cinematic Update)

- **Tech Stack Overhaul**: 기존 HTML/jQuery 기반에서 **Vue 3 + Tailwind CSS** 아키텍처로 완전히 리베이스(Rebase)되었습니다.
- **Cinematic Experience**:
  - **Glassmorphism**: 전체 UI에 글래스모피즘(`backdrop-blur`) 디자인 적용.
  - **Immersive Details**: 3D 커버 아트와 배경 흐림 효과가 적용된 에피소드 상세 페이지 신설.
- **Unified Engine**: 웹툰(스크롤), 만화(페이지/스프레드), 소설(텍스트) 뷰어를 하나의 **SPA(Single Page Application)** 엔진으로 통합.
- **Dexie.js Cache**: IndexedDB 기반의 오프라인 데이터 캐싱 도입.

### ⚠️ Deferred Features

- **Advanced Metadata**: 태그/작가 정보 수집 기능은 v1.6.0으로 연기되었습니다.
- **Smart Sync**: 중복 다운로드 방지 로직은 다음 버전에서 고도화될 예정입니다.

## [v1.4.0] - 2026-02-09

### 🖼️ Thumbnail Optimization

- **Centralized Thumbnail Management**: 모든 썸네일을 `_Thumbnails` 폴더로 통합 관리하여 로딩 속도와 구조를 최적화했습니다.
- **Migration Tool**: 기존 구버전 데이터의 썸네일을 최적화 폴더로 이동시키는 마이그레이션 도구(`🔄 썸네일 최적화 변환`)를 메뉴에 추가했습니다.
- **Auto Cover Upload**: 구글 드라이브 업로드 시, 시리즈 표지(Cover)를 자동으로 감지하여 `_Thumbnails` 폴더에 업로드합니다.

### 🎨 UI Improvements

- **Completion Badge**: 다운로드가 완료된 항목에 즉시 '✅' 뱃지와 시각적 표시(배경색 변경)를 적용하여 진행 상황을 직관적으로 보여줍니다.

## [v1.3.5] - 2026-02-06

### 🌉 Viewer Bridge (Direct Access)

- **Proxy Implementation**: 뷰어에서 CORS 제약 없이 Google Drive API를 호출할 수 있도록 UserScript Bridge(`window.TokiBridge`)를 구현했습니다.
- **Improved Thumbnail Loading**: 썸네일 로딩 시 Bridge를 통해 직접 데이터를 받아오도록 하여 429 오류를 줄이고 속도를 개선했습니다.

## [v1.3.0] - 2026-02-06

### 🚀 Direct Access (Performance)

- **Direct Drive Upload/Download**: GAS를 거치지 않고 Google Drive API에 직접 연결하여 속도가 2배 이상 향상되었습니다.
- **Auto Fallback**: Direct Access 실패 시 기존 GAS Relay 방식으로 자동 전환되어 안정성을 보장합니다.

### 🛡️ Stability (Anti-Ban)

- **Anti-Sleep**: 백그라운드 탭에서도 다운로드가 멈추지 않도록 무음 오디오 재생 기능을 탑재했습니다.
- **Captcha Detection**: Cloudflare 및 각종 캡차 감지 시 다운로드를 일시정지하고 사용자에게 알림을 보냅니다.
- **Sleep Policy Presets**: `Agile(빠름)`, `Cautious(신중)`, `Thorough(철저)` 모드를 설정 메뉴에서 선택할 수 있습니다.

### 🛠 Improvements

- **Refactored Core**: `fetcher.js`, `downloader.js` 등이 Direct Access를 지원하도록 구조가 개선되었습니다.
- **UI Enchancement**: 설정 모달에 `다운로드 속도(Sleep Mode)` 옵션 추가, 로그창에 Anti-Sleep 토글 버튼 추가.

## [v1.2.0] - 2026-02-04

### 🔒 Security (Critical)

- **API Key Enforcement**: GAS 서버의 모든 요청(업로드, 리스트 조회, 뷰어 접속 등)에 API Key가 필수로 변경되었습니다.
- **Script Properties**: API Key를 소스 코드 내 하드코딩하지 않고 GAS '스크립트 속성'(`API_KEY`)에 안전하게 저장합니다.

### 📡 Server (GAS)

- **Version Bump**: v1.0.0 -> v1.2.0
- **Validation**: `doPost`에서 모든 `view_*` 요청에 대해서도 API Key 검증 로직 추가.
- **Response**: `doGet` 응답 메시지에 서버 버전(v1.2.0) 표시.

### 📥 Client (UserScript)

- **Bundled Core**: `tokiSync.user.js` 하나로 모든 기능 통합 (기존 `new_core` 병합).
- **Zero-Config Injection**: 로컬(`localhost`, `127.0.0.1`) 또는 공식 뷰어(`github.io`) 접속 시, 자동으로 API Key와 설정을 주입하는 기능 추가.
- **Proxy**: Cross-Origin 요청(CORS)을 우회하기 위한 메시지 프록시 기능 최적화.

### 📊 Viewer

- **Hybrid Configuration**:
  - **Auto**: UserScript가 설치된 브라우저에서 접속 시 자동 설정.
  - **Manual**: 설정 메뉴에서 API Key 수동 입력 지원 (localStorage 저장).
- **Thumbnail Reliability**: Google Drive 썸네일(lh3) 로딩 실패(429 Error) 시 자동 재시도 및 지연 로딩(Lazy Loading) 구현.
- **UI Update**: 설정 모달 및 패널에 'API Key' 입력 필드 추가 (`input[type="password"]`).

---

## [v1.1.3] - 2026-01-XX

- **Remote Loader**: 수집기 로직 개선.
- **Unified Viewer**: 텍스트/이미지 통합 뷰어 최초 도입.
