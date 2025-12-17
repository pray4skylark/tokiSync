# TokiSync v3.1 전체 함수 레퍼런스 (Comprehensive Function Reference)

이 문서는 TokiSync 프로젝트의 **모든 함수와 메서드**를 포함하는 완벽한 레퍼런스입니다. AI는 코드 수정 시 이 문서를 참조하여 로직을 이해해야 합니다.

---

## 1. Google Apps Script (Server-Side)

서버 로직은 `google_app_script/TokiView/` 디렉토리에 위치합니다.

### 📄 `Main.gs`

웹 앱의 진입점(Entry Point)입니다.

| 함수                | 설명                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `doGet(e)`          | HTTP GET 요청을 처리합니다. 클라이언트(Index.html)를 렌더링하거나, 서버 상태 정보(`get_server_info`)를 JSON으로 반환합니다. |
| `include(filename)` | HTML 템플릿 내에서 다른 파일(CSS/JS 등)을 포함할 때 사용하는 헬퍼 함수입니다.                                               |

### 📄 `LibraryService.gs`

전체 라이브러리 스캔 및 인덱싱을 담당합니다.

| 함수                            | 설명                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `getSeriesList(folderId)`       | 루트 폴더 ID를 받아 시리즈 목록을 반환합니다. 먼저 `library_index.json`(캐시)을 찾고, 없으면 `rebuildLibraryIndex`를 호출합니다. |
| `rebuildLibraryIndex(folderId)` | 루트 폴더의 하위 폴더들을 **실제로 스캔**하여 메타데이터(Series DTO)를 생성하고 `library_index.json`에 저장합니다.               |

### 📄 `BookService.gs`

특정 시리즈 내의 회차(Books) 및 파일 다운로드를 처리합니다.

| 함수                                   | 설명                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getBooks(seriesId)`                   | 시리즈 폴더 ID를 받아 내부의 파일(.cbz/.zip) 및 폴더를 스캔하여 에피소드 목록을 반환합니다. 파일명 파싱 로직이 포함됩니다.                       |
| `getFileChunk(fileId, offset, length)` | 대용량 파일을 분할 전송하기 위한 핵심 함수입니다. Google Drive 파일의 Blob을 바이트 배열로 읽어, 지정된 범위만큼 Base64로 인코딩하여 반환합니다. |

### 📄 `Utils.gs`

공통 유틸리티입니다.

| 함수               | 설명                                                        |
| ------------------ | ----------------------------------------------------------- |
| `authorizeCheck()` | 스크립트 권한 승인용 더미 함수입니다. 실제 로직은 없습니다. |

---

## 2. Client Scripts (GitHub Pages)

프론트엔드 로직은 `docs/js/` 디렉토리에 위치합니다.

### 📄 `js/api_client.js`

GAS 백엔드와의 통신을 전담하는 클래스입니다.

| 클래스/함수              | 설명                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `TokiApiClient`          | API 통신 관리 클래스입니다.                                                                                                     |
| `setConfig(url, id)`     | GAS Web App URL과 루트 폴더 ID를 설정하고 `localStorage`에 저장합니다.                                                          |
| `isConfigured()`         | 현재 URL과 ID가 설정되어 있는지 확인합니다.                                                                                     |
| `request(type, payload)` | GAS로 POST 요청을 보냅니다. CORS 문제를 피하기 위해 `Content-Type: text/plain`을 사용하며, 페이로드는 JSON 문자열로 전송합니다. |

### 📄 `js/main.js`

메인 대시보드(그리드 목록, 설정)를 관리합니다.

| 함수                              | 설명                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `window.onload`                   | 페이지 로드 시 실행. 도메인 설정 로드, Zero-Config 리스너 등록, 초기 데이터 로드(`refreshDB`)를 수행합니다. |
| `handleMessage(event)`            | `postMessage`로 전달된 설정(Zero-Config)을 수신하고 저장합니다.                                             |
| `refreshDB(forceId, silent)`      | API를 통해 라이브러리 목록을 가져와 그리드를 갱신합니다. 로딩 스피너 제어 로직이 포함됩니다.                |
| `renderGrid(seriesList)`          | 시리즈 목록 데이터를 순회하며 카드 UI 요소를 생성하여 DOM에 추가합니다.                                     |
| `showToast(msg, duration)`        | 화면 하단에 알림 메시지를 일시적으로 표시합니다.                                                            |
| `saveManualConfig()`              | 설정 모달에서 사용자가 입력한 값을 저장합니다.                                                              |
| `filterData()`                    | 검색창 입력값에 따라 카드들을 필터링(display: none)합니다.                                                  |
| `saveDomains()` / `loadDomains()` | 대체 도메인 설정(마나/뉴/북토끼)을 `localStorage`에 저장하고 불러옵니다.                                    |
| `getDynamicLink(series)`          | 작품명에 따라 적절한 외부 사이트(마나/뉴/북토끼)의 상세 페이지 링크를 생성합니다.                           |
| `toggleSettings()`                | 도메인 설정 패널을 열거나 닫습니다.                                                                         |

### 📄 `js/viewer.js`

이미지 뷰어, 파일 압축 해제, 네비게이션을 담당합니다.

| 함수                                       | 설명                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `openEpisodeList(seriesId, title)`         | 회차 목록 모달을 열고 데이터를 로드합니다.                                                                          |
| `renderEpisodeList(books, seriesId)`       | 회차 목록 UI를 렌더링합니다. 읽음 여부(READ 뱃지)를 확인합니다.                                                     |
| `closeEpisodeModal()`                      | 회차 목록 모달을 닫습니다.                                                                                          |
| `loadViewer(index, isContinuous)`          | **[핵심]** 뷰어를 실행합니다. `isContinuous=true`면 1페이지부터, `false`면 이어보기(저장된 페이지)로 시작합니다.    |
| `fetchAndUnzip(fileId, onProgress)`        | **[핵심]** API로 파일 청크를 다운로드하고, 클라이언트(`JSZip`)에서 압축을 풀어 Blob URL 배열을 생성합니다.          |
| `recalcSpreads(resetPage)`                 | 이미지들을 현재 보기 모드(1쪽/2쪽)에 맞춰 Spread(펼침면) 단위로 재구성합니다.                                       |
| `renderCurrentSpread()`                    | `vState.currentSpreadIndex`에 해당하는 Spread를 화면에 그립니다. 읽음 저장 및 진행도 저장 로직이 여기서 실행됩니다. |
| `navigateViewer(dir)`                      | 뷰어 페이지를 이동합니다. 경계(첫/끝) 처리 및 다음 화 이동 확인 로직이 있습니다.                                    |
| `closeViewer()`                            | 뷰어를 닫고 생성된 Blob URL들을 메모리 해제(`revokeObjectURL`)합니다.                                               |
| `loadAllImageDimensions(images)`           | 스마트 2쪽 보기를 위해 이미지들의 실제 크기(가로/세로)를 미리 로드합니다.                                           |
| `preloadNextEpisode()`                     | 다음 화 데이터를 백그라운드에서 미리 다운로드합니다. (남은 페이지 4장 이하일 때 트리거)                             |
| `updateNavHandlers()`                      | 뷰어 좌우 터치 영역의 클릭 이벤트 핸들러를 갱신합니다.                                                              |
| `loadViewerSettings()`                     | `localStorage`에서 뷰어 설정(2쪽, 표지, RTL, 미리보기)을 불러와 적용합니다.                                         |
| `toggleViewMode()`, `toggleCoverMode()`... | 각 설정값 토글 함수들입니다. 변경 시 `recalcSpreads()`를 호출하여 즉시 반영합니다.                                  |
| `getReadHistory` / `saveReadHistory`       | 읽음(완독) 기록을 입출력합니다.                                                                                     |
| `getProgress` / `saveProgress`             | 현재 읽고 있는 페이지 진행도를 입출력합니다.                                                                        |
| `toggleControls()`                         | 뷰어 상단 헤더의 표시 여부를 토글합니다.                                                                            |

---

## 3. Bridge Scripts (UserScript)

### 📄 `tokiSyncScript.js`

웹사이트와 스크립트 간의 연결 고리입니다.

| 함수                           | 설명                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `checkAndLoadCore()`           | GitHub 태그 API를 확인하여 최신 버전인지 검사하고, 코어 스크립트를 로드합니다.                   |
| `fetchAndStoreScript(version)` | `raw.githubusercontent.com`에서 실제 코어 스크립트(`tokiSyncCore.js`)를 다운로드하여 캐싱합니다. |
| `executeScript(content)`       | 다운로드한 스크립트 문자열을 `new Function`으로 실행합니다.                                      |
| **Event Listeners**            | `github.io` 접속 시 `TOKI_CONFIG` 메시지를 전송하여 인증 정도를 주입(Injection)합니다.           |

---

## 4. 로직 규칙 및 주의사항 (Critical Logic Rules)

1.  **CORS**: `api_client.js`에서 반드시 `Content-Type: text/plain`을 사용해야 합니다.
2.  **읽음 처리 (Mark as Read)**: `renderCurrentSpread` 함수 내에서, **마지막 Spread**에 진입했을 때만 수행해야 합니다.
3.  **이어보기 (Resume)**:
    - **목록 클릭 시**: `loadViewer(index, false)` -> 저장된 페이지(Progress) 복원.
    - **다음 화 이동 시**: `loadViewer(index, true)` -> 0페이지부터 시작(Reset).
4.  **이미지 해제**: `closeViewer`에서 반드시 `URL.revokeObjectURL`을 호출애야 메모리 누수를 방지할 수 있습니다.
5.  **비동기 압축 해제**: `fetchAndUnzip`은 대용량 데이터를 다루므로, UI가 멈추지 않도록 비동기 처리와 Progress 콜백을 신중하게 다뤄야 합니다.
