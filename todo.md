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
- [ ] **PWA(Progressive Web App) 전환** (최우선 목표)
    - [ ] `manifest.json` 구현 (Data URI 방식)
    - [ ] Service Worker 등록 및 오프라인 캐싱 전략 수립
    - [ ] 아이콘 및 메타 태그 최적화
    - [ ] 다중 로그인 이슈 해결을 위한 "앱 설치" 유도 UI 강화
- [ ] **CBZ 뷰어 구현**
    - [ ] TokiView에 `JSZip` 라이브러리 추가 (CDN)
    - [ ] CBZ 파일을 Base64로 가져오는 로직 구현 (필요 시 청크 분할)
    - [ ] 클라이언트 측 압축 해제 및 이미지 렌더링 구현
- [ ] **UI 개선**
    - [ ] "자동 동기화" 버튼 개선
    - [ ] 버전 확인 UI (앱 버전 vs GitHub 태그 비교)