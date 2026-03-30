# Changelog

All notable changes to this project will be documented in this file.

## [v1.7.0] - 2026-03-30

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
