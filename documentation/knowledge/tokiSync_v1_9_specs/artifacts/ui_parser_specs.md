# TokiSync v1.9.1 UI & Parser Specifications

## UI/UX Standards (v1.9.1)

### 1. Premium Design Language
- **Glassmorphism**: `backdrop-filter: blur(30px)`와 반투명 유리 질감을 전역 모달에 적용.
- **Typography**: **Inter** 폰트 시스템을 통한 가독성 강화.
- **Interactive States**: 모든 입력창(`.toki-input`)과 체크박스(`.toki-checkbox`)는 커스텀 스타일을 따르며, 호버 시 명암 대비 최적화 로직 적용.

### 2. Modal Architecture
- **Width**: 메인 대시보드 520px 고정 너비.
- **Navigation**: 탭 기반 네비게이션 (Download, Settings, History, Tools).
- **Initialization**: `syncHistory`와 `siteInfo`가 완벽히 초기화된 후 UI 렌더링 시작.

---

## Dynamic Parser Rules (JSON)

TokiSync v1.9.0+는 `GenericParser`를 통한 순수 JSON 기반 룰 시스템으로 전환되었습니다.

### 1. Tree Rule Editor (v1.9.1)
사용자가 직접 파싱 규칙을 관리할 수 있는 고성능 트리 에디터를 제공합니다.
- **Tree-View**: JSON 구조를 트리 형태로 시각화 및 노드별 편집.
- **Live Preview**: 수정 사항을 즉시 JSON 텍스트로 확인.
- **Test Bench**: 특정 URL을 대상으로 규칙이 정상 작동하는지 즉시 테스트 가능.

### 2. Rule Structure
- **Site Detection**: URL 정규표현식 패턴 매칭.
- **Category**: `Webtoon`, `Novel`, `Manga` 분류.
- **Viewer Config**: 
    - `fetchMethod`: `xhr`, `iframe`, `api` 등 추출 방식 정의.
    - `decryptApi`: 소설 전용 API 복호화 설정.

### 3. Rule Management
- **Local/Remote**: `toki_parser_rules.json` 및 원격 URL을 통한 실시간 룰 업데이트 지원.
- **Custom Persistence**: 사용자 정의 규칙은 `GM_setValue`를 통해 브라우저 로컬 저장소에 영구 보존.
