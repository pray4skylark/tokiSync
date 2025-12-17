# TokiSync v3.1 시스템 명세서 (System Specification)

## 1. 프로젝트 개요 (Overview)

**TokiSync**는 만화 모음 사이트(마나토끼 등)와 개인 Google Drive 라이브러리를 연결하는 **개인 만화 라이브러리 동기화 및 뷰어 시스템**입니다.

버전 3.1에서는 **Headless 아키텍처**를 도입하여, 백엔드(Google Apps Script)와 프론트엔드(GitHub Pages)를 완전히 분리하고, Tampermonkey UserScript를 통해 이 둘을 매끄럽게 연결합니다.

---

## 2. 시스템 아키텍처 (Architecture)

```mermaid
graph TD
    User[사용자 / 브라우저]

    subgraph "Client Side"
        TM[Tampermonkey 스크립트]
        FE[GitHub Pages 프론트엔드]
    end

    subgraph "Server Side"
        GAS[Google Apps Script (API)]
        Drive[Google Drive]
    end

    User -->|접속| TM
    TM -->|설정 주입 (Auto-Config)| FE
    FE -->|Fetch API 요청| GAS
    GAS -->|파일 읽기/쓰기| Drive
```

### 핵심 컴포넌트

| 컴포넌트     | 기술 스택                | 역할                                                      |
| ------------ | ------------------------ | --------------------------------------------------------- |
| **Backend**  | Google Apps Script (GAS) | REST API 서버, 구글 드라이브 파일 관리, 라이브러리 인덱싱 |
| **Frontend** | HTML5, CSS3, Vanilla JS  | Headless 웹 앱, 라이브러리 UI, 이미지 뷰어 (압축 해제)    |
| **Bridge**   | Tampermonkey UserScript  | 자동 설정(Zero-Config) 주입, 크로스 도메인 연결 브리지    |

---

## 3. 컴포넌트 상세 명세 (Component Details)

### 3.1 백엔드: Google Apps Script (GAS)

중앙 API 서버 역할을 수행합니다. 웹 앱으로 배포되며(`Execute as Me`, `Access: Anyone`), 클라이언트의 요청을 처리합니다.

**주요 파일:**

- **`Main.gs`**: 진입점(`doGet`, `doPost`). `action` 파라미터에 따라 요청을 라우팅합니다.
- **`View_Dispatcher.gs`**: 뷰어 관련 요청(`view_*`)을 처리하는 컨트롤러입니다.
- **`View_LibraryService.gs`**: 폴더 스캔 및 메타데이터 캐싱을 담당합니다.
- **`View_BookService.gs`**: 에피소드 목록 조회(`view_get_books`) 및 대용량 파일 분할 다운로드(`view_get_chunk`)를 처리합니다.
- **`Utils.gs`**: 드라이브 탐색 및 에러 처리를 위한 헬퍼 함수 모음입니다.

**API 엔드포인트 (JSON):**
| Action Type | 설명 |
|---|---|
| `view_get_library` | 루트 디렉토리의 시리즈(폴더) 목록을 반환합니다. |
| `view_get_books` | 특정 시리즈 내의 에피소드(Zip/폴더) 목록을 반환합니다. |
| `view_get_chunk` | 대용량 CBZ/ZIP 파일을 10MB 단위의 Base64 청크로 분할하여 반환합니다. |

### 3.2 프론트엔드: GitHub Pages (TokiView)

GitHub Pages에 호스팅되는 정적 SPA(Single Page Application)입니다. 배포된 **어떤 GAS 백엔드와도** 연결될 수 있는 Headless 구조입니다.

**주요 파일:**

- **`index.html`**: 메인 진입점. UI 기본 골격(그리드, 모달, 뷰어 오버레이)을 포함합니다.
- **`css/style.css`**: 다크 모드 스타일, 반응형 그리드, 뷰어 애니메이션 등을 정의합니다.
- **`js/api_client.js`**: `google.script.run`을 대체하여, 표준 `fetch` API로 GAS와 통신합니다.
- **`js/main.js`**: 앱의 핵심 로직. 'Zero-Config' 핸드쉐이크, 그리드 렌더링, 검색 기능을 담당합니다.
- **`js/viewer.js`**:
  - **이미지 뷰어**: 1쪽 보기, 2쪽 보기(표지 우선), 일본 만화 모드(RTL) 지원.
  - **클라이언트 압축 해제**: `JSZip`을 사용하여 브라우저 메모리상에서 `.cbz` 파일을 직접 풉니다.
  - **사전 다운로드 (Preload)**: 남은 페이지가 4장(Spread) 이하일 때 다음 화를 백그라운드에서 미리 받습니다.
  - **이어보기 (Smart Resume)**: 읽던 페이지를 기억하며, 다음 화로 넘어가면(정주행) 1페이지부터 시작합니다.

### 3.3 브리지: Tampermonkey Script

정적 프론트엔드가 사용자의 **개인 백엔드(GAS)** 주소를 알 수 있도록 연결해주는 역할을 합니다.

**주요 기능:**

- **스크립트 로더**: 캐싱 문제를 피하기 위해 핵심 로직을 동적으로 로드합니다.
- **설정 주입 (Injection)**: GitHub Pages 접속 시 자동으로 감지하여, 사용자의 `GAS Web App URL`과 `Folder ID`를 `postMessage`로 전달합니다.
- **하이브리드 지원**: 공용 GAS(체험용)와 개인 GAS(실사용) 간의 전환을 지원합니다.

---

## 4. 핵심 기능 및 워크플로우 (Key Features)

### 4.1 하이브리드 배포 전략 (Hybrid Deployment)

- **PC 사용자 (Tampermonkey)**: **"Zero-Config"**. 스크립트가 알아서 인증 정보를 주입하므로, URL을 입력할 필요가 없습니다.
- **모바일/기타 사용자**: **"Manual Config"**. 설정 모달에서 GAS URL과 폴더 ID를 한 번만 입력하면 `localStorage`에 저장되어 계속 사용할 수 있습니다.

### 4.2 웹 기반 스트리밍 뷰어 (CBZ Streaming)

- **문제점**: Google Drive API는 압축된 파일 내부의 이미지를 효율적으로 서빙하기 어렵고, 파일 전체 다운로드는 속도가 느립니다.
- **해결책**:
  1. **백엔드**: 100MB가 넘는 `.cbz` 파일을 10MB 단위 청크로 쪼개서 보냅니다.
  2. **프론트엔드**: 청크를 받아 합친 뒤, 브라우저 메모리에서 압축을 풉니다.
  3. **결과**: 파일을 완전히 다운로드하기 전에도 뷰어를 시작할 수 있으며, 전송 효율이 높습니다.

### 4.3 읽음 상태 및 히스토리 관리

- **저장 위치**: 브라우저 `localStorage` (시리즈 ID 기반).
- **로직**:
  - **이어보기**: 목록에서 클릭 시, 읽던 페이지로 즉시 이동합니다.
  - **정주행**: 뷰어 내에서 '다음 화' 버튼 클릭 시, 1페이지부터 시작합니다.
  - **읽음 마킹**: 에피소드의 **마지막 페이지**를 볼 때만 'READ' 상태로 기록됩니다.

### 4.4 도메인 관리 및 동적 링크

- 외부 사이트(마나토끼, 뉴토끼 등)의 도메인이 자주 바뀌는 점을 고려하여, 사용자가 도메인을 설정할 수 있습니다.
- 폴더에 저장된 `Source ID`를 기반으로 현재 유효한 도메인의 링크를 동적으로 생성합니다.

---

## 5. 버전 관리 (Versioning)

- **형식**: `vX.Y.Z-beta.YYYYMMDD.NNNN`
- **동기화**: 프론트엔드 로드 시 백엔드 버전을 체크하여, 버전 불일치 시 업데이트를 유도합니다.
- **관리 대상**:
  - Frontend (`api_client.js`)
  - Backend (`Main.gs`)
  - UserScript (`tokiSyncScript.js`)
