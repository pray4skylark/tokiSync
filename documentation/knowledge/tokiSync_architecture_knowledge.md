# tokiSync 프로젝트 핵심 아키텍처 및 영구 지식 문서 (v1.10.0 기준)

본 문서는 **tokiSync** 프로젝트의 최신 버전(v1.10.0) 사양과 3대 핵심 컴포넌트(GAS Backend, Tampermonkey Core, Vue 3 SPA Viewer)의 설계 및 제어 원칙을 수록한 영구 지식 베이스(Knowledge Base)입니다. 에이전트는 새로운 개발 세션 진행 시 본 지침을 절대적 진실 소스(SSOT)로 활용하여 코드 품질을 보장해야 합니다.

---

## 1. 프로젝트 정체성 및 3대 핵심 아키텍처

tokiSync는 로컬 환경의 강력한 스크래핑 엔진과 구글 드라이브 클라우드 스토리지를 밀접하게 결합한 **하이브리드 만화/웹툰/소설 동기화 및 뷰어 솔루션**입니다.

### 1.1. GAS 백엔드 (Google Apps Script)
*   **Stateless API**: 서버는 상태를 가지지 않으며, 모든 요청은 payload-driven으로 처리됩니다. `PropertiesService`를 사용자 설정 저장에 활용하는 것을 엄격히 금지합니다.
*   **Drive API v3 & DriveAccessService.gs**: 레거시 `DriveApp`은 전면 배제되고, 모든 Google Drive 입출력은 v3 API 기반의 단일 게이트웨이(`DriveAccessService.gs`)를 통해서만 수행되어 성능과 권한 범위를 최적화합니다.
*   **SweepMergeIndex**: 백그라운드 Time-Driven 트리거를 통해 다중 클라이언트의 신규 업로드 내역과 카테고리를 비동기 병합 및 최적화합니다.

### 1.2. Tampermonkey 브릿지 (Core JS)
*   **동적 파서 아키텍처 (GenericParser)**: 사이트별 DOM 스크래핑 로직은 `BaseParser`를 상속받은 전용 파서에서 처리하며, `ParserFactory` 싱글톤을 통해서만 접근합니다.
*   **EBHJ (Element-based Hybrid Jump) 엔진**: 물리 픽셀 루프 대신 DOM 이미지 요소를 직접 타격하여 `scrollIntoView`로 점프 스캔하는 초고속 레이지 로딩 센서 우회 장치(utils.js). 스캔 시간을 30초에서 4초로 단축시켰으며, 백그라운드 탭 렌더링 스로틀링 극복을 위한 Bottom Slam 폴백을 내장하고 있습니다.
*   **v1.10.0 모달화 및 데드락 완전 해결**: 파싱 규칙 로딩 방식을 모달 팝업 구조로 전면 리팩터링 및 클래스화하여 초기 스크립트 로드 시점의 스레드 대기 데드락 현상을 완벽히 제거했습니다.

### 1.3. Vue 3 SPA 뷰어 (Viewer)
*   **Single Controller Rule**: 모든 사용자 입력(Mouse, Touch, Wheel)은 단 하나의 Composable인 `useViewerInput.js`에서만 통합 처리합니다. 컴포넌트 내부 개별 이벤트 핸들러나 `nav-zone` Div 패턴의 재도입은 엄격히 금지됩니다.
*   **Virtual Scroll & Aspect-Ratio Preserving**: IntersectionObserver 기반의 지역 렌더링 시, 이미지가 DOM에서 언마운트되어도 기캐싱된 가로/세로 비율을 `aspect-ratio` 인라인 스타일로 고정하여 고속 스크롤 시의 레이아웃 튐 현상을 1px 단위까지 완전 방어합니다.
*   **텍스트 렌더러 (TextRenderer.vue - Option A)**: EPUB/TXT 소설 파일의 오차 없는 페이지 렌더링을 위해 `column-width`를 px 단위로 자가 잠금(Self-Lock)하고, 이동 단위를 `%`로 통일(`translateX(-N * 100%)`)하여 오차 누적을 원천 배제합니다.

---

## 2. 데이터 무결성 및 성능 최적화 핵심 지침

### 2.1. 3중 방어막 이미지 추출 (Triple Defense Filtering)
뷰어 이미지 로드 시 손상된 파일이나 시스템 파일을 완벽 필터링하기 위한 `useFetcher.js` 내 핵심 정합성 지침입니다.
1.  **경로 필터 (Blacklist)**: macOS 전용 숨김 파일(`._*`) 및 `__MACOSX` 등 시스템 폴더 경로가 섞인 리소스 배제.
2.  **확장자 필터 (Whitelist)**: 정규식 `/\.(jpg|jpeg|png|webp|gif)$/i` 허용 포맷 엄격 검사.
3.  **물리 검증 (Validation)**: naturalWidth가 0인 리소스를 최종 목록에서 즉시 배제하여 가짜 이미지/오류 데이터 필터링.

### 2.2. Merge-First Cloud Sync (이력 유실 방지)
다중 브라우저/기기간의 읽기 이력 덮어쓰기 분쟁을 해결하는 정책입니다.
*   로컬 IndexedDB(Dexie) 이력을 클라우드로 단순 업로드하여 덮어씌우는 것을 엄격히 금지합니다.
*   반드시 구글 드라이브의 원격 이력을 먼저 Pull 한 뒤, `lastReadAt` 타임스탬프를 기준으로 원격과 로컬 데이터를 정밀 병합(Merge)한 통합 데이터를 다시 클라우드에 푸시해야 합니다.
*   슬라이더와 뷰포트 간 무한 동기화 루프 방지를 위해 **20px Position Guard**를 적용하고, programmatic 스크롤 시 event flooding 방지를 위해 항상 `behavior: 'auto'`를 사용합니다.

### 2.3. Smart Preload (네트워크 최적화)
사용자가 현재 에피소드를 **50% 이상 스크롤 독파**한 시점에만 다음 화 background 다운로드 프리로딩을 트리거하여 서버 부하와 클라이언트 트래픽을 합리적으로 통제합니다.

---

## 3. 에이전트 개발 협업 및 검증 프로토콜

*   **Plan-First 원칙**: 코드 변경 전에 반드시 구현 계획(`task.md`)을 수립하고 사전에 자가 검증 항목을 설계해야 합니다.
*   **Audit-Driven Verification**: 모든 구현 결과는 GAS V8 런타임 호이스팅 예외(최상위 const -> var 원칙), cross-browser 이벤트 전파 정합성, multi-device 동기화 무결성에 대해 자가 감사를 진행한 후 최종 walkthrough 리포트에 기록해야 합니다.
