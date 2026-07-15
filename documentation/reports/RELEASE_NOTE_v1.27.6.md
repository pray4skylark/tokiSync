# TokiSync v1.27.6 프리 릴리즈 노트 (Pre-release Notes)

본 문서는 **TokiSync v1.27.6** 프리 릴리즈(Pre-release)의 주요 변경 사항 및 배포 정보를 요약합니다.
이번 버전에서는 배치 워커 안전 대기 중 `tokiDownload()` 호출로 인한 세션 소실 버그를 수정하고, Drive 업로드 사전 작업(pre-work) 진행률을 큐에 반영하였습니다. 또한 `sessionToken` 복원으로 IPC 매칭 안정성을 개선하고, 뷰어 URL deep link 버그를 수정하였습니다.

---

## 🐛 1. stopAllWorkers 경합 방어 (Batch Worker Session Guard)

### 1-1. 문제 상황
배치 다운로드가 진행 중인 상태(안전 대기 3.0초 구간)에서 사용자가 새 `tokiDownload()`를 호출하면 `confirm()` 대화상자가 표시되고, 사용자 확인 시 `stopAllWorkers()`가 실행되어 세션 레지스트리(`activeWorkers`, `processingSlots`, `sessionRegistry`)가 일괄 초기화됨. 이후 WORKER_READY 핸드셰이크 세션을 찾지 못해 배치가 강제 중단되는 버그.

### 1-2. 수정 사항
- **`src/core/downloader.js`**: `tokiDownload()` 진입 시 `processingSlots.size > 0 || activeWorkers.size > 0` 감지 가드 추가. 활성 batch/단일 워커가 존재하면 다운로드 요청을 차단하고 경고 로그 출력.
- 배치 안전 대기 구간에서 `stopAllWorkers()`로 인한 세션 소실 원천 차단.

---

## 📊 2. Drive Pre-work Progress 통합 (Upload Preparation Queue)

### 2-1. 문제 상황
Drive 업로드 시 썸네일 업로드(thumbnail upload), 스마트 스킵 이력 조회(Smart Skip), 고속 업로드 캐시 로드(Fast Path) 등의 사전 작업이 큐 진행률에 전혀 반영되지 않아 사용자가 작업 진행 상태를 인지할 수 없었음. Local 다운로드는 해당 단계가 없어 문제가 드러나지 않았음.

### 2-2. 수정 사항
- **`src/core/downloader.js`**: Drive 전용 pre-work 구간에 가상 PREP 큐 아이템(`id: toki_prep_...`)을 등록. 진행률 0%→5%(썸네일 업로드)→30%(Smart Skip)→50%(Fast Path) 단계별 갱신.
- **`src/core/queue.js`**: `saveRawQueue` 함수를 export하여 외부 모듈에서 큐 직접 조작 가능하도록 변경.

---

## 🔑 3. sessionToken 복원 (Nonce-based IPC Matching)

### 3-1. 문제 상황
`runSchedulerOnce()`에서 `sessionRegistry` 등록 시 `sessionToken: null`로 저장하고 `registerWorkerOrigin()`을 호출하지 않아 nonce가 생성되지 않음. WORKER_READY 매칭 1순위(토큰 기반)가 항상 실패하여 Window 참조 매칭(2순위)에만 의존하는 취약한 구조.

### 3-2. 수정 사항
- **`src/core/queue.js`**: `runSchedulerOnce()`에서 `registerWorkerOrigin(nextItem.id, 'null')` 호출하여 정상 nonce 생성 및 저장. `sessionToken: null` 제거.
- **`src/core/queue.js`**: `openEpisodePopup()`에 sessionToken 파라미터 추가 → popup URL에 `ts_token` query param으로 주입.

---

## 📡 4. WORKER_READY sessionToken 포함 (Heartbeat Payload)

### 4-1. 문제 상황
자식 워커가 1초마다 전송하는 WORKER_READY heartbeat payload에 `sessionToken` 필드가 없어 1순위 토큰 매칭이 항상 skip됨. Window 참조 매칭만으로는 크로스 오리진 네비게이션 등 엣지 케이스에서 세션 매칭 실패 가능성 존재.

### 4-2. 수정 사항
- **`src/core/worker-extractor.js`**: popup URL에서 `ts_token` 파라미터 추출 → WORKER_READY heartbeat payload에 `sessionToken` 필드 포함 전송.

---

## 🐛 5. 뷰어 URL Deep Link 복원 (Viewer Episode Route)

### 5-1. 문제 상황
뷰어 모바일에서 에피소드 주소(`#/SERIES_ID/EP_NUMBER`)로 직접 접속 시 `openSeries()` 내부의 `pushUrlState()`가 `currentEpisode`가 null인 상태에서 URL hash를 `#/SERIES_ID`로 덮어쓰기하여 에피소드 번호가 소실됨. 이후 `getUrlEpisodeNumber()`가 빈 문자열을 반환하여 목록 페이지로 리디렉션.

### 5-2. 수정 사항
- **`src/viewer/composables/useStore.js`**: `getUrlEpisodeNumber()` 호출을 `openSeries()` 이전으로 이동. 먼저 episode 번호를 캡처한 후 상태 변경 진행.

---

## 🔧 변경 파일 요약

| 파일 | 변경 내용 | 분류 |
|------|----------|------|
| `src/core/downloader.js` | `stopAllWorkers()` 경합 방어 가드 + PREP 큐 아이템 | P0 |
| `src/core/queue.js` | `registerWorkerOrigin()` 호출, `openEpisodePopup` token 파라미터, `saveRawQueue` export | P1 |
| `src/core/worker-extractor.js` | WORKER_READY payload에 `sessionToken` 포함 | P1 |
| `src/viewer/composables/useStore.js` | URL deep link — episode 번호 캡처 순서 변경 | P0 |
| `README.md` | v1.27.6 버전 범프 및 업데이트 요약 | 문서 |
| `CHANGELOG.md` | v1.27.6 변경 이력 추가 | 문서 |
| `.agent_checkpoint.md` | 세션 상태 갱신 | 문서 |

---

## ✅ 검증

| 항목 | 결과 |
|------|------|
| `npm run build:core` (Webpack 번들) | ✅ 성공 |
| `npm run build:viewer` (Vite 번들) | ✅ 성공 |
| `npm run test` (유닛 테스트 30건) | ✅ 30/30 Pass |
| graphify AST incremental (261 nodes, 597 edges) | ✅ 병합 완료 |
