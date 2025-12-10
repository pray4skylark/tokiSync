# Task: TokiSync v3.0.0 (뷰어 업데이트)

## Phase 1: 아키텍처 대수술 (GAS)

- [x] **배포 전략 변경**
  - [x] 웹 앱 배포 방식을 `Execute as User` (사용자로 실행)로 변경
  - [x] `PropertiesService`를 활용한 사용자 설정(폴더 ID) 저장 로직 구현
  - [x] TokiView UI 업데이트: 폴더 ID 입력 및 저장 기능 (LocalStorage -> Properties)

## Phase 2: 메타데이터 고도화 (Core)

- [x] **`info.json` 스키마 확장**
  - [x] DOM에서 전체 회차 목록(배열) 수집
  - [x] GAS 다운로드 기록과 대조하여 "최종 다운로드 회차" 판별
  - [x] 확장된 메타데이터를 `info.json`에 저장

## Phase 2.5: 클라이언트 주도형 리팩토링 (View & Script)

- [x] **TokiView 서버(GAS) 경량화**
  - [x] `PropertiesService` 및 서버 측 설정 저장 로직 제거 (Stateless)
  - [x] `doGet`은 HTML 템플릿만 반환하도록 변경 (SSR -> CSR)
  - [x] 모든 데이터 요청(`getLibraryData` 등)에 `folderId` 파라미터 필수화
- [x] **TokiView 클라이언트(HTML) 개편**
  - [x] 초기 로딩 시 스크립트 통신 대기 로직 구현 (`postMessage`)
  - [x] 스크립트 미감지 시 "설치 가이드/수동 입력" 모달 구현
  - [x] `localStorage`를 활용한 설정 캐싱 (스크립트 없을 때 대비)
- [x] **TokiSync 스크립트(Tampermonkey) 연동**
  - [x] TokiView URL(`script.google.com`) 매칭 추가
  - [x] 뷰어 접속 시 저장된 `ROOT_FOLDER_ID` 자동 주입 기능 구현

## Phase 3: 뷰어 진화 (TokiView)

- [x] **PWA(Progressive Web App) 전환** (최우선 목표)
  - [x] `manifest.json` 구현 (Data URI 방식)
  - [x] Service Worker 대체 (Data URI Manifest & Meta Tags)
  - [x] 아이콘 및 메타 태그 최적화
  - [x] 다중 로그인 이슈 해결을 위한 "앱 설치" 유도 UI 강화
  - [x] **기능 제한(Feature Gating)**: 스크립트 미감지 시 동기화/다운로드 기능 비활성화
- [x] **CBZ 뷰어 구현**
  - [x] TokiView에 `JSZip` 라이브러리 추가 (CDN)
  - [x] CBZ 파일을 Base64로 가져오는 로직 구현 (필요 시 청크 분할)
  - [x] 클라이언트 측 압축 해제 및 이미지 렌더링 구현
  - [x] 대용량 파일 다운로드 최적화 (청크 로딩, 미리보기)
  - [x] 에러 핸들링 강화 (날짜 직렬화 문제 해결)
- [ ] **UI 개선**
  - [x] "자동 동기화" 버튼 개선 (애니메이션, 상태 피드백)
  - [x] 회차 목록 정렬 및 로딩 카운트 표시 개선
  - [ ] 버전 확인 UI (앱 버전 vs GitHub 태그 비교)

## Phase 4: 안정성 및 유지보수 (New)

- [x] **코드 모듈화 (Modularization)**
  - [x] **TokiView**: `Code.gs` 분리 (`Main`, `LibraryService`, `BookService`, `Utils`)
  - [x] **TokiSync**: `Code.gs` 분리 (`Main`, `SyncService`, `UploadService`, `Utils`)
- [ ] **에러 모니터링 및 로깅 강화**
  - [ ] 클라이언트 사이드 에러 수집 (선택 사항)

## Phase 5: 프론트엔드 모듈화 (HTML/JS/CSS)

- [x] **HTML 구조 분리**
  - [x] `Main.gs`: `include()` 헬퍼 함수 구현
  - [x] `Styles.html`: `<style>` 태그 내용 분리 및 이관
  - [x] `Client.js.html`: `<script>` 태그 내용 분리 및 이관
  - [x] `Index.html`: `<?!= include() ?>` 구문으로 통합 및 경량화
