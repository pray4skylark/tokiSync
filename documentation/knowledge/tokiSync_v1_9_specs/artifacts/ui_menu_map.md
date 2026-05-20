# TokiSync UI Menu Structure (v1.9.1)

TokiSync v1.9.1의 프리미엄 디자인 시스템 기반 사용자 인터페이스 구성 및 메뉴 구조 명세입니다.

---

## 1. 디자인 시스템 (Premium Design System)

v1.9.1에서 도입된 고도화된 UI/UX 사양입니다.

- **테마 (Theme)**: **Glassmorphism (유리 테마)** 적용. `backdrop-filter: blur(30px)`와 반투명 배경을 조합한 프리미엄 앱 질감.
- **타이포그래피**: **Inter 폰트** (`wght@400-800`) 기반의 가독성 중심 설계.
- **컴포넌트 (Components)**: 브라우저 기본 스타일을 배제한 전용 커스텀 컴포넌트 사용.
  - `.toki-input`: 둥근 모서리(16px)와 부드러운 그림자가 적용된 프리미엄 입력창.
  - `.toki-checkbox`: 체크 아이콘(✓)이 포함된 커스텀 체크박스.
  - `.toki-btn-action`: 호버 시 입체감이 살아나는 애니메이션 버튼.

---

## 2. 전역 인터페이스 (Global UI)

| 요소 | 기능 | 트리거 |
| :--- | :--- | :--- |
| **FAB (Floating Button)** | 메인 대시보드 호출 | 화면 우측 하단 그라데이션 버튼 클릭 |
| **로그 박스 (LogBox)** | 실시간 작업 현황 출력 | 시스템 탭 토글 / 유리 테마 적용 |
| **알림 (Notifier)** | OS 수준 알림 | 시스템 이벤트 발생 시 |

## 3. 통합 메뉴 모달 (MenuModal)

메인 대시보드는 **520px 고정 너비**의 1컬럼 리스트 기반 구조입니다.

### 📥 다운로드 탭 (Download)
- **프리미엄 컴포넌트**: 에피소드 범위 입력 및 체크박스에 현대화된 스타일 적용.
- **범위 지정 다운로드**: 쉼표(,)와 하이픈(-) 이용 (예: `1,3,5-10`).
- **가독성 최적화**: 인터랙티브 요소 호버 시 텍스트 명암 대비 자동 교정.

### ⚙️ 설정 탭 (Settings)
- **저장 정책**: `Individual`, `ZIP of CBZs`, `Native`, `GoogleDrive`.
- **속도 정책**: `Agile`, `Cautious`, `Thorough`, `Slow`, `Very Slow`.
- **고급 설정 진입**: `config.js` 기반의 상세 설정 모달 호출.

### 📝 시스템 탭 (System)
- **로그창 토글**: 실시간 로그 대시보드 표시.
- **파일명/썸네일 최적화**: 라이브러리 정규화 및 캐시 갱신 도구 제공.
- **Tree Editor**: JSON 기반 파싱 규칙을 시각적으로 편집하는 고급 도구.

## 4. 상세 설정 모달 (ConfigModal)

`config.js`에서 관리되는 상세 설정창으로, v1.9.1에서 유리 테마로 전면 리뉴얼되었습니다.

| 필드명 | 설명 |
| :--- | :--- |
| **GAS Script ID** | Google Apps Script 배포 ID 관리. |
| **Folder ID** | 구글 드라이브 루트 폴더 ID. |
| **API Key** | 백엔드 보안 통신 키. |
| **Global Rules** | 원격 파싱 룰 URL 및 커스텀 JSON 룰 관리. |

---

## 5. 단축키 명세 (Key Bindings)

- **`Ctrl + Shift + T`**: 통합 메뉴 모달 열기/닫기.
- **`ESC`**: 모든 모달 및 로그창 닫기.

---

## 4. 단축키 명세 (Key Bindings)

- **`Ctrl + Shift + T`**: 통합 메뉴 모달 열기/닫기.
- **`ESC`**: 활성화된 모든 모달 및 로그창 닫기.
