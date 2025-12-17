# TokiSync v3.1 함수 레퍼런스 가이드 (Function Reference Guide)

이 문서는 AI가 코드 수정 시 로직 오류나 환각을 일으키지 않도록 사전에 참고하는 **진실의 원천(Source of Truth)**입니다. 각 파일의 핵심 함수와 동작 방식을 정의합니다.

---

## 🏗️ Frontend Core (`docs/js/`)

### 1. `api_client.js` (Backend 통신)

GAS 백엔드와 표준 Fetch API로 통신하는 모듈입니다.

| 함수/메서드       | 시그니처                       | 역할 및 주의사항                                                                                                                                                                         |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API.setConfig** | `setConfig(url, id)`           | GAS URL과 루트 폴더 ID를 `localStorage`에 저장합니다.                                                                                                                                    |
| **API.request**   | `async request(type, payload)` | 백엔드에 POST 요청을 보냅니다. <br>⚠️ **CORS 회피**: `text/plain`으로 전송하므로 백엔드가 이를 파싱해야 합니다. <br>⚠️ **프로토콜**: 요청 시 자동으로 `protocolVersion: 3`을 포함합니다. |

### 2. `main.js` (메인 UI)

그리드 렌더링, 설정 관리, 도메인 연결을 담당합니다.

| 함수               | 시그니처                           | 역할 및 주의사항                                                                                                                   |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **refreshDB**      | `async refreshDB(forceId, silent)` | 라이브러리를 새로고침합니다. <br>⚠️ 로딩 스피너 제어(`pageLoader`)가 포함되어 있습니다.                                            |
| **renderGrid**     | `renderGrid(seriesList)`           | API로 받은 시리즈 목록을 HTML 카드(`div.card`)로 변환합니다. <br>⚠️ 썸네일이 없으면 Base64 SVG(`NO_IMAGE_SVG`)를 사용합니다.       |
| **getDynamicLink** | `getDynamicLink(series)`           | 작품 이름을 분석하여 현재 설정된 도메인(마나/뉴/북토끼) 링크를 생성합니다. <br>⚠️ `localStorage`의 `toki_domains` 값을 참조합니다. |
| **saveDomains**    | `saveDomains()`                    | 사용자가 입력한 대체 도메인 주소를 `localStorage`에 저장합니다.                                                                    |

### 3. `viewer.js` (이미지 뷰어)

가장 복잡한 로직(압축 해제, 페이지 계산, 이어보기)이 포함되어 있습니다.

| 함수                    | 시그니처                                  | 역할 및 핵심 로직 (Logic Rules)                                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **loadViewer**          | `async loadViewer(index, isContinuous)`   | 뷰어를 초기화하고 이미지를 로드합니다. <br>🔹 **isContinuous=true**: 정주행 모드. `vState.currentSpreadIndex`를 0으로 강제합니다. <br>🔹 **isContinuous=false**: 이어보기 모드. `localStorage`의 `prog_{seriesId}` 값을 읽어 마지막 페이지로 복원합니다.             |
| **fetchAndUnzip**       | `async fetchAndUnzip(fileId, onProgress)` | `.cbz` 파일을 10MB 청크로 나누어 다운로드 후, JSZip으로 메모리상에서 압축을 풉니다. <br>⚠️ 대용량 파일 처리의 핵심 병목 지점이므로 수정 시 주의 필요.                                                                                                                |
| **recalcSpreads**       | `recalcSpreads(resetPage)`                | 이미지들을 **Spread(펼침면)** 단위로 묶습니다. <br>🔹 **규칙**: 2쪽 보기 모드일 때 가로가 긴 이미지(Landscape)는 단독 페이지로 처리합니다. <br>🔹 `resetPage=true`면 1페이지로 이동하지만, `loadViewer`에서는 보통 `false`로 호출 후 별도 위치 복원 로직을 따릅니다. |
| **renderCurrentSpread** | `renderCurrentSpread()`                   | 현재 Spread를 화면에 그립니다. <br>🔹 **읽음 처리**: 마지막 Spread에 도달했을 때만 `saveReadHistory`를 호출합니다. (완독 기준) <br>🔹 **진행도 저장**: 페이지를 넘길 때마다 `saveProgress`를 호출합니다.                                                             |
| **preloadNextEpisode**  | `preloadNextEpisode()`                    | 미리보기 기능. 현재 남은 Spread가 **4장 이하**일 때 다음 화를 백그라운드에서 다운로드합니다. `vState.preload` 설정에 따릅니다.                                                                                                                                       |

---

## 🛠️ Bridge (`tokiSyncScript.js`)

Tampermonkey UserScript입니다. 정적 페이지에 동적 설정을 주입합니다.

- **동작 원리**: GitHub Pages(`pray4skylark.github.io`)에 접속하면 `postMessage`를 통해 `TOKI_CONFIG` 이벤트를 발송합니다.
- **하이브리드 모드**: 유저가 설정한 `USE_DEV_SERVER` 값에 따라 `DEFAULT_ID`(공용) 또는 `TOKI_DEPLOY_ID`(개인) 중 하나를 선택하여 보냅니다.

---

## ☁️ Backend (Google Apps Script)

서버 사이드 로직입니다.

- **`view_get_library`**: 루트 폴더(`folderId`)를 깊이 탐색하지 않고 **1단계(Depth 1)**만 스캔하여 캐싱합니다.
- **`view_get_chunk`**: `Utilities.base64Encode`를 사용하여 바이너리 데이터를 텍스트로 변환해 전송합니다. `offset`과 `length` 파라미터로 파일을 분할 전송합니다.

---

## 🚨 AI 작업 시 주의사항 (Rules for AI)

1.  **변수 중복 선언 금지**: `viewer.js` 수정 시 `vState`나 `window` 전역 객체 할당 코드가 중복되지 않도록 diff 범위를 넓게 확인하십시오.
2.  **읽음 로직**: "읽음(READ)" 마킹은 **반드시 마지막 페이지**에 도달했을 때만 수행해야 합니다. (진입 시 마킹 금지)
3.  **정주행 vs 이어보기**: `loadViewer` 호출 시 두 번째 인자(`isContinuous`)를 올바르게 전달해야 합니다. (목록 클릭=`false`, 다음화 이동=`true`)
4.  **CORS**: `api_client.js`의 `fetch` 헤더는 `Content-Type: text/plain`을 유지해야 합니다. (`application/json` 사용 시 Preflight 실패)
