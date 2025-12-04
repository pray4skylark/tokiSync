# Task: TokiSync v3.0.0 (뷰어 업데이트)

## Phase 1: 아키텍처 대수술 (GAS)
- [ ] **배포 전략 변경**
    - [ ] 웹 앱 배포 방식을 `Execute as User` (사용자로 실행)로 변경
    - [ ] `PropertiesService`를 활용한 사용자 설정(폴더 ID) 저장 로직 구현
    - [ ] TokiView UI 업데이트: 폴더 ID 입력 및 저장 기능 (LocalStorage -> Properties)

## Phase 2: 메타데이터 고도화 (Core)
- [ ] **`info.json` 스키마 확장**
    - [ ] DOM에서 전체 회차 목록(배열) 수집
    - [ ] GAS 다운로드 기록과 대조하여 "최종 다운로드 회차" 판별
    - [ ] 확장된 메타데이터를 `info.json`에 저장

## Phase 3: 뷰어 진화 (TokiView)
- [ ] **CBZ 뷰어 구현**
    - [ ] TokiView에 `JSZip` 라이브러리 추가 (CDN)
    - [ ] CBZ 파일을 Base64로 가져오는 로직 구현 (필요 시 청크 분할)
    - [ ] 클라이언트 측 압축 해제 및 이미지 렌더링 구현
- [ ] **UI 개선**
    - [ ] "자동 동기화" 버튼 개선
    - [ ] 버전 확인 UI (앱 버전 vs GitHub 태그 비교)