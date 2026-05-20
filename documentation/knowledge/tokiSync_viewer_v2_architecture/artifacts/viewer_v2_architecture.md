# TokiSync Viewer V2 Architecture

Viewer V2는 웹툰과 소설 모두에서 **0.1% 미만의 오차**를 목표로 하는 정밀 위치 동기화 시스템을 탑재하고 있습니다.

---

## 1. Paragraph-based Locator (PBL)
전통적인 페이지 번호 기반 동기화의 한계(디바이스 크기 변경 시 위치 유실)를 극복하기 위해 도입된 시스템입니다.

- **Logical Index**: 콘텐츠를 최소 논리 단위(문단 또는 개별 이미지)로 분할하고 각 요소에 `data-locator` 속성 부여.
- **SSOT (Single Source of Truth)**: 현재 사용자가 읽고 있는 위치는 페이지 번호가 아닌 `logicalIndex`로 저장됨.

## 2. 정밀 동기화 엔진 (Precision Engine)
### 웹툰 (Image Mode)
- **Strategy**: 스크롤 위치를 감시하여 뷰포트 중앙에 가장 근접한 이미지의 `data-locator`를 실시간 업데이트.
- **Restoration**: 저장된 인덱스를 기반으로 해당 이미지의 `offsetTop`을 계산하여 즉시 스크롤.

### 소설 (Text Mode)
- **Pagination**: 텍스트를 숨겨진 컨테이너에 먼저 렌더링하여 전체 문단 수와 뷰포트 너비를 기준으로 페이지 분할 계산.
- **OffsetLeft Sync**: 페이지 모드에서 특정 문단을 찾을 때, 해당 문단의 `offsetLeft` 값을 컨테이너 너비로 나누어 정확한 페이지 인덱스를 산출.
  - *Logic*: `pageIndex = Math.floor(el.offsetLeft / container.clientWidth)`
  - *Result*: 폰트 크기나 줄 간격이 변경되어도 사용자가 읽던 **문단**이 포함된 페이지를 즉시 찾아냄.

## 3. Heuristic Jump (초고속 초기 진입)
이미지가 수백 장인 에피소드에서 DOM이 완전히 렌더링되기 전(Lazy loading)에도 대략적인 위치로 이동하는 기술입니다.

- **Algorithm**: 초기에 로드된 상위 3개 이미지의 평균 높이를 계산하여 타겟 인덱스의 예상 위치 산출.
- **Execution**: 
  1. `HeuristicJump`: 예상 위치로 즉시 스크롤 (사용자 체감 속도 향상).
  2. `PrecisionJump`: DOM 렌더링 완료 시 `offsetTop` 기반으로 위치 미세 보정.

## 4. State Management & Persistence
- **Internal Sync Lock**: 위치 복구(`Restore`) 중 사용자의 조작이 섞여 위치가 오염되는 것을 방지하기 위한 `isInternalSyncing` 플래그 운용.
- **Flush Save**: 페이지 전환 또는 브라우저 종료 시 Debounce를 무시하고 즉시 IndexedDB에 위치 저장.

---

> [!TIP]
> **Performance Tip**: 폰트 크기 변경 시 `onNovelPaginate` 이벤트를 통해 전체 페이지 수를 재계산하고, `logicalIndex`를 활용해 즉시 페이지를 보정하십시오.
