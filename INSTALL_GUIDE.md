# TokiSync v1.5.6 설치 가이드

이 가이드는 **TokiSync v1.5.6**의 설치 및 설정 방법을 안내합니다.

## ✅ 사전 준비

1. **Google 계정**: Google Drive 및 Apps Script 사용.
2. **Google Drive 폴더**: 만화를 저장할 폴더를 생성하고 **Folder ID**를 메모해두세요.
   - (폴더 주소 `.../folders/1ABC_xE...` 에서 뒷부분 ID)

---

## 1단계: Google Apps Script (서버) 설정

### 1-1. 프로젝트 생성 및 코드 복사

1. [Google Apps Script](https://script.google.com/) 접속 -> **새 프로젝트**.
2. 프로젝트 이름: `TokiSync Server v1.5.6`.
3. 👉 **[TokiSync_Server_Bundle.gs (서버 코드)](https://pray4skylark.github.io/tokiSync/TokiSync_Server_Bundle.gs)** 링크 클릭 후 화면의 전체 내용을 복사하여 `Code.gs`에 붙여넣기.
4. **저장** (Ctrl+S).

### 1-1-b. appsscript.json 매니페스트 설정 (중요)

GAS 매니페스트 파일(`appsscript.json`)이 올바르게 설정되어야 Drive API 권한과 웹앱 배포가 정상 작동합니다.

**웹 편집기에서 확인/수정하는 방법:**

1. 좌측 **프로젝트 설정** (톱니바퀴 아이콘) 클릭.
2. **「appsscript.json」 매니페스트 파일을 편집기에 표시** 체크박스 활성화.
3. 편집기 파일 목록에서 `appsscript.json` 클릭 후 아래 내용으로 교체.

**`appsscript.json` 전체 내용:**

```json
{
  "timeZone": "Asia/Seoul",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Drive",
        "serviceId": "drive",
        "version": "v3"
      }
    ]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request"
  ],
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

| 항목                      | 설명                                        |
| ------------------------- | ------------------------------------------- |
| `timeZone`                | 한국 시간대 (`Asia/Seoul`)                  |
| `enabledAdvancedServices` | Drive API v3 고급 서비스 활성화             |
| `oauthScopes`             | Google Drive 접근 및 외부 HTTP 요청 권한    |
| `webapp.executeAs`        | 스크립트 소유자(나) 권한으로 실행           |
| `webapp.access`           | 익명 사용자 접근 허용 (API Key로 실제 보안) |

> ⚠️ **clasp 사용자:** `google_app_script/TokiSync/appsscript.json` 파일이 이미 위 내용으로 작성되어 있습니다. `clasp push` 시 자동으로 적용됩니다.

### 1-2. 라이브러리 추가 (Drive API)

1. 좌측 **서비스(Services)** 옆 `+` 클릭.
2. **Drive API** 선택 -> **추가**.

### 1-3. 🔒 API Key 설정 (중요)

**v1.2.0부터 API Key가 필수입니다.**

1. 좌측 **프로젝트 설정** (톱니바퀴 아이콘) 클릭.
2. 스크롤을 내려 **스크립트 속성 (Script Properties)** 섹션 찾기.
3. **스크립트 속성 수정** -> **행 추가** 클릭.
   - **속성 (Property)**: `API_KEY`
   - **값 (Value)**: `toki_secret_1234` (본인이 원하는 비밀번호 입력)
4. **스크립트 속성 저장** 클릭.

### 1-4. 배포

1. 우측 상단 **배포 (Deploy)** -> **새 배포**.
2. 유형: **웹 앱 (Web app)**.
3. 다음 사용자로 실행: **`나 (Me)`**.
4. 액세스 권한 승인: **`모든 사용자 (Anyone)`** (⚠️ 필수).
   - _뷰어에서 로그인 없이 접근하기 위해 '모든 사용자'가 필요하지만, 실제로는 위에서 설정한 API Key가 없으면 접근이 불가능하므로 안전합니다._
5. **배포** 클릭 -> 권한 승인 진행.
6. **웹 앱 URL** 복사 (`.../exec`로 끝남).

---

## 2단계: UserScript (수집기) 설치

1. 브라우저에 [Tampermonkey](https://www.tampermonkey.net/) 설치.
2. 다음 링크를 클릭하여 스크립트를 설치합니다:
   👉 **[TokiSync UserScript 설치하기](https://pray4skylark.github.io/tokiSync/tokiSync.user.js)**
3. Tampermonkey 설치 화면이 뜨면 **설치(Install)**를 클릭합니다.
4. **동작 확인 및 설정**:
   - 뉴토끼/북토끼 사이트 접속.
   - 우측 하단의 **원형 플로팅 메뉴 버튼(⚙️)**을 누르거나, 단축키 **`Ctrl + Shift + T`**를 눌러 **통합 메뉴 모달**을 엽니다.
   - `Settings` 섹션을 열고 다음 항목을 입력합니다:
     - **GAS WebApp URL**: 1-4에서 복사한 URL 입력.
     - **Folder ID**: 사전 준비한 폴더 ID 입력.
     - **API Key**: 1-3에서 설정한 값 입력.
   - **설정 저장** 클릭 후 페이지를 새로고침합니다.

---

## 3단계: 뷰어 (Viewer) 설정

### A. 간편 연동 (UserScript 이용) - 권장

1. 다음 웹 뷰어 주소로 접속합니다:
   👉 **[TokiSync 웹 뷰어](https://pray4skylark.github.io/tokiSync/)**
2. **UserScript가 설치된 브라우저**라면, 자동으로 설정이 주입됩니다.
   - _"⚡️ Auto-Config Injected"_ 메시지와 함께 즉시 사용 가능합니다.
   - 즐겨찾기(북마크)에 등록해 두고 사용하시면 편리합니다.

### B. 수동 설정 (Standalone)

1. 위 웹 뷰어 페이지 접속 시 설정 패널이 뜹니다.
2. 설정 패널 톱니바퀴 아이콘을 클릭한 뒤 **GAS App ID**(URL 복사값 전체 가능), **Drive Folder ID**, **Security Key(API Key)**를 직접 입력합니다.
3. **Save Config(저장)**를 누르면 브라우저에 설정이 영구 보관되며 라이브러리가 로드됩니다.

---

## 🔧 문제 해결

**Q. 401 Unauthorized 에러가 떠요.**
A. 입력한 `API Key`가 GAS 스크립트 속성의 `API_KEY` 값과 일치하는지 확인하세요.

**Q. 429 Too Many Requests 에러가 떠요.**
**Q. 429 Too Many Requests 에러가 떠요.**
A. 구글 API 호출 제한입니다. 잠시 기다리면 해결됩니다. 현재 버전 뷰어는 이미지 로딩 시 자동으로 이를 감지하고 재시도합니다.

**Q. 통합 메뉴 창이 안 보여요.**
A. 지원되는 사이트(뉴토끼 등 본문 환경)에 접속해야 우측 하단 플로팅 버튼과 단축키(`Ctrl+Shift+T`)가 활성화됩니다.
