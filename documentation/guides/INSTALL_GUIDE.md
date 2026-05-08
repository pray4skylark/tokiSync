# TokiSync v1.8.1 설치 및 설정 가이드

이 가이드는 **TokiSync v1.8.1**의 설치 및 설정 방법을 안내합니다. 최신 버전은 구글 드라이브 API v3를 기반으로 더욱 빠르고 안정적인 수집 환경을 제공합니다.

---

## ✅ 사전 준비

1. **Google 계정**: Google Drive 및 Apps Script 사용을 위해 필요합니다.
2. **Google Drive 저장 폴더**: 콘텐츠를 저장할 폴더를 생성하고 **Folder ID**를 메모해두세요.
   - 폴더 URL `.../folders/1ABC_xE...` 에서 뒷부분의 난수 문자열이 ID입니다.

---

## 1단계: Google Apps Script (서버) 설정

### 1-1. 프로젝트 생성 및 코드 복사

1. [Google Apps Script](https://script.google.com/)에 접속하여 **[새 프로젝트]**를 생성합니다.
2. 프로젝트 이름 예시: `TokiSync Server v1.8.1`.
3. 아래 링크에서 최신 번들 코드를 복사하여 `Code.gs`에 붙여넣습니다:
   - 🌟 **[TokiSync_Server_Bundle.gs (Stable 정식 버전)](https://pray4skylark.github.io/tokiSync/TokiSync_Server_Bundle.gs)** (권장)
   - 🧪 **[TokiSync_Server_Bundle.gs (Dev 개발 빌드)](https://pray4skylark.github.io/tokiSync/dev/TokiSync_Server_Bundle.gs)** (최신 기능 테스트)

### 1-2. appsscript.json 매니페스트 설정 (중요)

> [!IMPORTANT]
> 이 설정이 누락되면 Drive API v3 권한 오류가 발생합니다.

1. 좌측 **[프로젝트 설정]** (톱니바퀴 아이콘) 클릭.
2. **「appsscript.json」 매니페스트 파일을 편집기에 표시** 체크박스 활성화.
3. 편집기 파일 목록에서 `appsscript.json`을 열고 아래 내용으로 교체합니다:

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

### 1-3. 🔒 보안(API Key) 및 배포

1. **[프로젝트 설정]** > **[스크립트 속성]** 섹션에서 아래 항목을 추가합니다.
   - **속성**: `API_KEY`
   - **값**: 본인이 사용할 비밀번호 (예: `toki_secret_9999`)
2. 우측 상단 **[배포]** > **[새 배포]**를 클릭합니다.
   - 유형: **웹 앱**
   - 다음 사용자로 실행: **나 (Me)**
   - 액세스 권한: **모든 사용자 (Anyone)** (⚠️ 필수: 뷰어 접근용)
3. 배포 완료 후 생성된 **웹 앱 URL**을 복사해둡니다.

---

## 2단계: UserScript (수집기) 설치

1. 브라우저에 [Tampermonkey](https://www.tampermonkey.net/)를 설치합니다.
2. 최신 **[TokiSync UserScript](https://pray4skylark.github.io/tokiSync/tokiSync.user.js)**를 설치합니다.
3. 지원 사이트(뉴토끼 등) 접속 후 통합 메뉴를 엽니다.
   - 단축키: **`Ctrl + Shift + T`**
   - 또는 우측 하단 **⚙️ 플로팅 버튼** 클릭.
4. **Settings** 섹션에서 다음 정보를 입력하고 저장합니다:
   - **GAS WebApp URL**: 1-3에서 복사한 URL.
   - **Folder ID**: 저장용 구글 드라이브 폴더 ID.
   - **API Key**: 1-3에서 설정한 비밀번호.

> [!TIP]
> **v1.8.1 신규 설정**: 다운로드 속도를 5단계(`빠름` ~ `매우 느림`)로 조절할 수 있습니다. 차단 위험이 있는 사이트에서는 `느림` 설정을 권장합니다.

---

## 3단계: 뷰어 (Viewer) 설정

1. **[TokiSync 공식 웹 뷰어](https://pray4skylark.github.io/tokiSync/)**에 접속합니다.
2. UserScript가 설치된 브라우저라면 설정이 자동으로 주입되어 즉시 라이브러리가 로드됩니다.
3. **소설 뷰어 V2 안내**:
   - 읽기 중 상단/중앙을 터치하여 **플로팅 툴바**를 호출할 수 있습니다.
   - 테마, 폰트 크기, 줄 간격을 실시간으로 변경해도 **Locator 엔진**이 읽던 위치를 정확히 고정해줍니다.

---

## 🔧 문제 해결 (FAQ)

> [!WARNING]
> **Q. 뷰어 로딩 중 'ReferenceError'가 발생해요.**
> A. 구형 GAS 코드를 사용 중일 수 있습니다. 1단계의 최신 번들 코드로 업데이트한 후 다시 배포(새 버전) 해주세요.

**Q. 소설 다운로드 속도가 너무 느려요.**
A. v1.8.1부터 소설 복호화(API 모드) 시 안정성을 위해 `매우 느림(10-30초)` 정책이 강제 적용됩니다. 이는 IP 차단을 방지하기 위한 필수 조치입니다.

**Q. 드라이브에 파일은 있는데 뷰어에 안 보여요.**
A. 뷰어 우측 상단의 **[동기화(Sync)]** 버튼을 눌러 최신 이력을 서버에서 다시 가져오세요.
