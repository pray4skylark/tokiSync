# TokiSync v1.27.3 프리 릴리즈 노트 (Pre-release Notes)

본 문서는 **TokiSync v1.27.3** 프리 릴리즈(Pre-release)의 주요 변경 사항 및 배포 정보를 요약합니다.
이번 버전에서는 수집기 코어의 핵심적인 백그라운드 세션 및 레이스 컨디션 오류를 대대적으로 안정화하였으며, 누락된 백그라운드 인덱스 병합 가이드 및 신규 DOM 검사기 가이드를 추가하였습니다.

---

## 🚀 1. 코어 안정화 패치 (Core Stability Patches)

### 1-1. 워커(Worker) 라이프사이클 및 세션 소실 방지
- **워커 중복 처리 및 세션 소실 수정 (B+C 하이브리드)**:
  - 브라우저 환경 및 탭 활성화 상태에 따라 워커 세션이 소실되던 오류를 보완하기 위해 세션 정보를 보존하는 하이브리드 생명주기 관리 로직을 도입했습니다.
  - 워커 준비 단계(`WORKER_READY`)의 중복 처리 사이클과 레이스 컨디션 조건을 수정하여 멀티 수집 창이 안정적으로 대기열을 소화하도록 개선했습니다.
- **큐 상태 미갱신 방어선 강화**:
  - 활성 상태 업데이트(`touchSessionActivity`) 시 발생하던 큐 아이템 상태 갱신 누락 문제를 수정하고 안정성을 높였습니다.
- **보안 토큰(Nonce) 우회 차단 버그 수정**:
  - `Pre-open` 단계에서 `START_EXTRACTION` 메시지가 정상 전달되지 않아 팝업 수집 시 무한 대기가 발생하던 문제를 해결하고, Nonce 인증 실패로 인한 세션 차단 오류를 수정하였습니다.

---

## 📚 2. 문서화 및 가이드 개선 (Documentation Update)

### 2-1. [수정] 설치 및 설정 가이드 ([INSTALL_GUIDE.md](file:///Users/pray4skylark/Documents/WorkSpace/tokiSync/documentation/guides/INSTALL_GUIDE.md))
- **백그라운드 병합 트리거 가이드 추가**:
  - Apps Script의 이력 정합성 관리를 담당하는 `TimeDriven_SweepMergeIndex` 트리거 등록 절차(5분 주기)를 새롭게 안내하여 동기화 딜레이를 예방합니다.
- **스텔스 기능 변경에 따른 UI 호출 방법 정정**:
  - 보안 및 스텔스 강화를 위해 제거된 기존 단축키(`Ctrl+Shift+T`) 및 FAB 버튼 설명을 삭제하고, **Tampermonkey 사용자 명령 메뉴**를 통한 설정 대화상자 기동법으로 수정하였습니다.
- **수동 연동 시 인풋 오류 경고 보완**:
  - 뷰어(Viewer) 설정에서 `Deployment ID` 입력 시 전체 웹 앱 URL을 복사하여 기입하는 흔한 실수를 예방하기 위해, **배포 ID 단독 난수 문자열**만 입력해야 함을 명확히 명시했습니다.
- **확장자 화이트리스트 보강**:
  - 소설 단건 다운로드의 `txt` 포맷을 위해 Tampermonkey의 로컬 저장 예외 확장자 대상에 `txt`를 추가하도록 안내를 보완하였습니다.

### 2-2. [신규] DOM 검사기 활용 가이드 ([DOM_INSPECTOR_GUIDE.md](file:///Users/pray4skylark/Documents/WorkSpace/tokiSync/documentation/guides/DOM_INSPECTOR_GUIDE.md))
- **기능 및 화면 구성 소개**:
  - F12(개발자 도구)를 열지 않고 수집기 내부에서 CSS 셀렉터를 즉시 자동 생성하고 자동 완성 주입할 수 있는 빌트인 검사기(`DomInspector`) 활용법을 작성하였습니다.
- **미끼 요소 우회 팁 제공**:
  - `_detectHidden` 함수를 통한 광고/미끼 요소 감지 유형(display-none, visibility-hidden, faded, offscreen, clipped 등)에 대응하는 실전 노하우를 기재했습니다.
- **제약 사항 고지**:
  - Shadow DOM 및 가상 요소(`::before`, `::after`) 선택 시의 셀렉터 생성 한계와 해결 방안을 투명하게 안내합니다.

---

## 📦 3. 배포 패키지 구성 요소 (Assets)

3-1. **UserScript (수집기)**: `dist/tokiSync.user.js`
   - Tampermonkey 브라우저 확장 크래들에서 로드 및 실행되는 클라이언트 스크립트.
3-2. **Apps Script Server Bundle (서버)**: `dist/TokiSync_Server_Bundle.gs`
   - 구글 드라이브와 뷰어 간 이력 통신 및 파일 입출력을 처리하는 API 게이트웨이 백엔드 번들.
3-3. **Web Viewer (공식 뷰어)**: `dist-viewer/`
   - 구글 드라이브 내 수집 데이터를 스트리밍으로 열람하기 위한 Vue 3/Vite 기반 프론트엔드 정적 파일 세트.

---

## 🛠️ 4. 검증 및 품질 상태

- **테스트 커버리지**:
  - 총 30건의 Core 유닛 테스트(기존 14건에서 30건으로 테스트 케이스 고도화 및 안정화 검증 적용) 및 3건의 교차 윈도우 실환경 시나리오 시뮬레이션 테스트를 성공적으로 통과하였습니다.
  - 빌드 검증(`npm run build:core`) 완료 상태입니다.
- **보안 및 정적 분석**:
  - `auditor` 에이전트를 통한 문서의 논리 흐름 및 스키마 일치 여부 정합성 검토 피드백을 릴리즈 전 전면 수용 및 보완 완료하였습니다.

