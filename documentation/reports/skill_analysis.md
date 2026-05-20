# tokiSync 프로젝트 최적 스킬 목록 분석 보고서 (v1.8.3)

본 보고서는 **tokiSync** 프로젝트의 v1.8.3 사양과 고유한 3대 핵심 아키텍처(GAS 백엔드, Tampermonkey 브릿지, Vue 3 SPA 프론트엔드)를 기준으로, 최상의 품질과 생산성을 보장하기 위해 적용해야 할 최적의 AI 스킬 목록 및 시너지 방안을 분석합니다.

---

## 1. 프로젝트 아키텍처 및 요구사항 요약

tokiSync는 로컬 환경의 강력한 스크래핑 기능과 구글 드라이브의 범용 클라우드 스토리지를 밀접하게 결합한 **하이브리드 만화/웹툰/소설 동기화 및 뷰어 솔루션**입니다.

*   **GAS 백엔드 (Google Apps Script)**: stateless API, Advanced Drive API v3 중앙 게이트웨이(`DriveAccessService.gs`), 파일 ID 트래킹(`Fast Path`), 백그라운드 인덱스 병합(`SweepMergeIndex`).
*   **Tampermonkey 브릿지 (Core JS)**: 비동기 4~5단계 속도 제어식 다운로더, EBHJ(Element-based Hybrid Jump) 초고속 레이지 로딩 탐색기, CORS 우회용 `GM_xmlhttpRequest` 직접 접근 계층.
*   **Vue 3 SPA 프론트엔드 (Viewer)**: IntersectionObserver 기반의 `Virtual Scroll`, 픽셀 분석 기반의 `Auto-Crop`, `Smart Double Spread` 2쪽 슬롯 레이아웃, `Dexie.js` 오프라인 캐시 및 `Merge-First` 클라우드 동기화.

---

## 2. 프로젝트 정의 커스텀 스킬 분석 (SSOT 기반)

`AI_AGENT_CONTEXT.md` 5.1절에 정의된 expert 스킬들은 프로젝트의 고유 설계 원칙(Stateless GAS, Single Controller, Sync Guard)을 유지하기 위해 반드시 준수해야 하는 지침 집합입니다.

### 2.1. 기획 및 아키텍처 계층
*   **`@[concise-planning]` (간결한 기획)**
    *   **적용 목적**: 요구사항 변동 시 speculative(추측성) 추상화를 배제하고 필요한 핵심 로직만 간결하게 코딩하도록 계획을 통제합니다.
    *   **효과**: 200줄의 불필요한 추상 코드를 50줄의 명확하고 동작 가능한 코드로 줄이는 프로젝트 핵심 단순성 원칙에 일치합니다.
*   **`@[wiki-architect]` (위키 아키텍트)**
    *   **적용 목적**: GAS와 Tampermonkey, SPA 간의 복잡한 페이로드 인터페이스 및 상태 공유 스펙을 정합성 있게 정형화하고 문서화합니다.

### 2.2. 프론트엔드 및 코어 로직 계층
*   **`@[javascript-pro]` (자바스크립트 프로)**
    *   **적용 목적**: `GM_xmlhttpRequest` 비동기 흐름 제어, 5MB 덩어리의 Resumable Upload 스트림 파이프라인, Promise 기반 다운로드 조절 큐 설계의 무결성을 담보합니다.
*   **`@[frontend-design]` (프론트엔드 디자인) & `@[tailwind-patterns]` (테마/스타일)**
    *   **적용 목적**: 뷰어 컴포넌트 내에 하드코딩된 색상을 배제하고, CSS 테마 변수(`text-theme-text`, `--t-glass-bg` 등)와 유동적인 유리효과(Glassmorphism) 스타일 템플릿을 엄격히 적용합니다.

### 2.3. 성능 최적화 및 디버깅 계층
*   **`@[performance-engineer]` (성능 엔지니어)**
    *   **적용 목적**: 대용량 웹툰 스크롤(EBHJ 스캔 시간 30초 ➡️ 4초 단축) 최적화, `aspect-ratio` 캐싱을 통한 1px 단위의 Virtual Scroll 레이아웃 튐 방지 등을 제어합니다.
*   **`@[systematic-debugging]` (체계적 디버깅)**
    *   **적용 목적**: 사이트별 안티 스크래핑(랜덤 이미지 속성명 변경, 미끼 이미지 유입 등)에 대처하여 Heuristic Container Selection 및 Dynamic LazyKey Detection을 정밀 추적하고 수정합니다.

### 2.4. 품질 보증 및 감사 계층
*   **`@[security-auditor]` / `@[vibe-code-auditor]` / `@[lint-and-validate]`**
    *   **적용 목적**: 구글 드라이브 업로드 시 데이터가 유실되지 않도록 `Merge-First Policy` 동작성을 점검하고, GAS V8 런타임의 Temporal Dead Zone(TDZ) 오류(최상위 const ➡️ var 전환)와 같은 문법 및 런타임 예외를 사전 필터링합니다.

---

## 3. Antigravity 가용 코어/플러그인 스킬 매핑 시너지

Antigravity 시스템에 탑재된 최신 플러그인 스킬들은 tokiSync의 모던 브라우저 API 환경 및 실시간 성능 모니터링 요구와 결합하여 엄청난 시너지를 낼 수 있습니다.

### 3.1. `modern-web-guidance` (모던 웹 기술 표준 탐색) — 🌟 최우선 필수 스킬
*   **연계 가치**:
    *   `useVirtualScroll.js`에서 사용되는 `IntersectionObserver`의 최신 동작 방식 및 비활성 탭에서의 브라우저 리소스 스로틀링 가이드라인을 제공합니다.
    *   `useAutoCrop.js`에서 여백을 검출할 때 사용하는 `OffscreenCanvas` API의 메모리 누수 방지 및 브라우저 호환 렌더링 최적화 팁을 확보할 수 있습니다.
    *   `utils.js`의 `img.naturalWidth > 100` 이미지 로드 검증과 같은 최신 이미지 디코딩 API 및 Fetch Priority 지침을 신속하게 획득합니다.

### 3.2. `chrome-devtools` (실시간 브라우저 디버깅 및 자동화)
*   **연계 가치**:
    *   Tampermonkey UserScript는 디버깅이 까다롭기 때문에, Chrome DevTools를 활용해 `GM_xmlhttpRequest` 헤더 위조 및 REST API(alt=media) 다운로드 트래픽을 정밀 모니터링할 수 있습니다.
    *   크로스 탭 실시간 동기화를 위해 사용되는 `visibilitychange` 이벤트와 `localStorage` 실시간 변경 상태를 브라우저 단에서 직접 추적하고 모의 이벤트를 발생시켜 완벽한 결함 검증이 가능해집니다.

### 3.3. `memory-leak-debugging` (자바스크립트 메모리 누수 방지)
*   **연계 가치**:
    *   100~300장의 고해상도 이미지가 뷰어에 연속 로드 및 가상 해제될 때 브라우저 힙(Heap) 메모리가 해제되지 않고 쌓이는 누수 원인을 규명합니다.
    *   IndexedDB(Dexie.js)의 읽기/쓰기 커넥션이 제대로 닫히지 않아 발생하는 DB Lock 현상이나 메모리 오염 문제를 Heap Snapshot 분석 스킬을 통해 완전 차단합니다.

### 3.4. `debug-optimize-lcp` (Largest Contentful Paint 최적화)
*   **연계 가치**:
    *   뷰어 첫 페이지 진입 시 가장 큰 콘텐츠인 첫 에피소드 표지나 첫 웹툰 이미지가 화면에 출력되는 속도(LCP)를 비약적으로 개선합니다.
    *   RootMargin Expansion(3000px 확장) 지침과 lazy-loading 최적화 지향점을 분석하여 첫 렌더링 체감 지연 시간을 극단적으로 감소시킵니다.

### 3.5. `chrome-extensions` (Tampermonkey 호환성 및 샌드박스 정책)
*   **연계 가치**:
    *   Tampermonkey가 구동되는 브라우저 샌드박스 권한 및 보안 규정(Manifest V3 사양, 스크립트 인젝션 차단 정책 등)을 분석하여 향후 UserScript의 외부 호환성 저하 이슈를 선제 대응합니다.

---

## 4. 최종 스킬 권장 활용 가이드라인 매트릭스

tokiSync의 유지보수 및 향후 고도화 작업 시, 작업 성격에 맞게 AI 에이전트와 매칭할 스킬 매트릭스는 다음과 같습니다.

| 작업 성격 (Feature / Bug) | 주 적용 커스텀 스킬 | 추천 가용 플러그인 스킬 | 워크플로우 / 도구 | 검증 방법 (Verification) |
| :--- | :--- | :--- | :--- | :--- |
| **사이트 파서 추가/수정**<br>(안티 스크래핑 극복) | `@[systematic-debugging]` | `modern-web-guidance` | `grep_search` | `img.naturalWidth` 및 이미지 컨테이너 밀도 데이터 검증 |
| **뷰어 렌더링 속도 개선**<br>(가상 스크롤 튐, LCP 최적화) | `@[performance-engineer]` | `debug-optimize-lcp`<br>`memory-leak-debugging` | `/graphify` | Chrome DevTools Performance 탭 및 Aspect-ratio 정합성 검사 |
| **데이터 동기화 고도화**<br>(IndexedDB & GAS 클라우드 머지) | `@[concise-planning]` | `chrome-devtools` | `view_file` | 다중 브라우저 크로스 탭 동기화 테스트 및 20px Position Guard 무한 루프 검사 |
| **GAS 백엔드 안정성**<br>(Drive API V3 이식 및 리팩토링) | `@[wiki-architect]` | `@[security-auditor]` | `list_dir` | Stateless API 페이로드 규격 및 백그라운드 sweepMerge 정상 도약 테스트 |

---

## 5. 아키텍처 분석을 위한 워크플로우 도구 활용 제언

프로젝트 루트 폴더에는 `graphify-out`이 완벽히 구축되어 있습니다.
새로운 기능 수정 또는 의존성 리팩토링(특히 `DriveAccessService.gs` 독립 계층 고도화 등)에 착수하기 전, `graphify-out/GRAPH_REPORT.md`를 우선적으로 리딩함으로써 **프로젝트 핵심 "God Node"**(예: `useStore.js`, `downloader.js`, `DriveAccessService.gs` 등)들의 연계 관계를 한눈에 파악할 것을 강력히 권장합니다.

코드 수정 후에는 즉시 **`graphify update .`**를 실행하여 그래프 아키텍처 문서의 동기화를 상시 유지해야 합니다.
