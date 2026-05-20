# TokiSync Core Algorithms (Immutable Rules)

본 문서는 TokiSync 프로젝트의 데이터 무결성과 성능 최적화를 보장하는 4대 핵심 알고리즘의 기술 명세입니다. 모든 코드 수정 시 이 규칙들의 논리적 무결성을 유지해야 합니다.

---

## 1. Triple Defense (3중 방어막)
이미지 수집 시 유효하지 않은 데이터(광고, 더미, 손상된 파일)를 필터링하는 메커니즘입니다.

- **Path (경로 필터)**: `dummy`, `pixel`, `ads` 등의 키워드가 포함된 URL 제외.
- **Extension (확장자 필터)**: `jpg`, `jpeg`, `png`, `webp` 외의 확장자 차단.
- **Dimension (차원 필터)**: `OffscreenCanvas`를 통해 1x1, 10x10 미만의 초소형 이미지를 런타임에 탐지하여 제거.
  - *Code Evidence*: `BaseParser.isDummyUrl()` 및 `downloader.js` 내 이미지 유효성 검사 로직.

## 2. EBHJ (Element-based Hybrid Jump)
웹툰 스캔 속도를 7배 이상 가속화하는 하이브리드 엔진입니다.

- **Logic**: 
  - `iframe` 내부의 `DOM`을 직접 파싱하지 않고, `document.querySelectorAll` 결과를 `blob`화 하여 병렬 처리.
  - `Fast Path`: 이미 다운로드된 파일의 ID를 추적하여 Google Drive 업로드 시 전체 스캔 과정을 생략.
  - *Performance Metric*: 기존 v1.0 대비 탐색 속도 720% 향상.

## 3. Smart Skip (지능형 결함 감지)
다운로드된 데이터의 결함을 **두 가지 독립적 레이어**로 감지합니다.

### Layer 1: 이미지 레벨 필터 (구현됨)
개별 이미지가 더미/오류 응답인 경우 필터링합니다.

- **Threshold**: 30KB 절대 기준 (정상 만화 이미지는 30KB 미만 불가)
  ```javascript
  const suspiciousCount = images.filter(img => img.blob.size < 30000 || img.isMissing).length;
  if (suspiciousCount > mergedUrls.length / 2) {
      // 과반 초과 시 강제 재스크롤 후 재수집
  }
  ```
  - *Code*: `downloader.js` `fetchImages` 결과 검증 로직

### Layer 2: 에피소드 레벨 볼륨 이상 감지 (설계됨)
레이지 로딩 미완성으로 인해 일부 이미지가 캡처되지 않은 에피소드를 감지합니다.
(이미지 자체는 유효하지만 **수량이 누락**되어 에피소드 총 용량이 시리즈 평균보다 과소한 경우)

- **Algorithm (Max Weight Ratio)**:
  ```javascript
  const avgWeight = totalSize / fileCount; // 시리즈 내 에피소드 평균 용량
  const minThreshold = avgWeight * 0.15;   // 평균의 15% 미만 → 캡처 누락 의심
  ```
- **Action**: 결함 에피소드를 로그에 기록, 차후 `Merge Index` 시 재다운로드 유도.



## 4. Auto-Crop (자동 픽셀 여백 제거)
뷰어 로딩 시 이미지의 상하좌우 불필요한 공백을 픽셀 단위로 분석하여 제거합니다.

- **Mechanism**:
  - `OffscreenCanvas`에 이미지를 렌더링.
  - 상단/하단에서 안쪽으로 픽셀 데이터(`getImageData`)를 스캔하여 'Non-White/Non-Transparent' 픽셀이 처음 나타나는 좌표 탐색.
  - 탐색된 좌표를 기준으로 CSS `object-position` 또는 `clip-path`를 적용하여 렌더링 최적화.
- **Rationale**: 웹툰 가독성 향상 및 디바이스 메모리 절약.

---

> [!IMPORTANT]
> **Immutable Rule**: 새로운 파서나 다운로드 로직을 추가할 때, 위 4가지 알고리즘 중 하나라도 우회하거나 비활성화해서는 안 됩니다.
