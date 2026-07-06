# TokiSync 동적 파싱 규칙(JSON) 가이드 (v1.26.5)

TokiSync는 사이트별 하드코딩 대신 JSON 기반의 동적 규칙을 사용하여 데이터를 추출합니다. 이 가이드는 새로운 규칙을 작성하거나 기존 규칙을 수정하는 방법을 설명합니다.

---

## 1. 기본 구조
규칙 파일은 전체 JSON 객체 또는 `rules` 배열 형태로 작성할 수 있습니다.

```json
{
  "version": "1.0",
  "rules": [
    {
      "id": "site_id",
      "name": "규칙 이름",
      "urlPattern": "URL 매칭 정규식",
      "idMatch": "작품 고유 ID 정규식 (선택 사항)",
      "category": "Webtoon | Manga | Novel",
      "meta": { ... },
      "list": { ... },
      "viewer": { ... }
    }
  ]
}
```

---

## 2. 주요 필드 설명

### 2.1 Meta (작품 정보)
작품의 메인 페이지에서 제목, 작가, 썸네일 등을 추출합니다.

- **단순 문자열**: CSS 셀렉터 (innerText 추출)
- **객체 형태**: `{ "selector": "CSS 셀렉터", "attr": "속성명", "regex": "정규식" }`
  - `attr`: 속성값 추출 (예: `src`, `href`)
  - `regex`: 추출된 문자열에서 특정 부분만 캡처 (첫 번째 괄호 그룹 `match[1]` 사용)

```json
"meta": {
  "title": "h1.title",
  "author": "div.author",
  "thumb": { "selector": "img.cover", "attr": "src" },
  "tags": "div.tags"
}
```

### 2.2 List (에피소드 목록)
에피소드 목록 페이지에서 각 회차 정보를 추출합니다.

- `container`: 목록을 감싸는 전체 부모 요소 (예: `ul.ep-list`)
- `item`: 각 회차 단위 요소 (예: `li.ep-row`)
- `num`: 회차 번호 셀렉터
- `title`: 회차 제목 셀렉터
- `link`: 이동 링크 (`{ "selector": "a", "attr": "href" }`)
- `sub`: [선택] 추가 구분자 (예: `[단편]`, `[부록]` 등 정규식으로 추출)

### 2.3 idMatch와 지능형 Fallback ID 추출 (v1.9.4 신규)
* `idMatch`는 URL에서 작품 고유 ID(예: `33251` 등)를 추출하기 위한 정규표현식입니다.
* **지능형 Fallback ID 추출:** 만약 규칙에 `idMatch`가 지정되지 않았거나 비어있는 경우, 엔진은 `urlPattern`과 `category`를 분석하여 `(?:\d+)` 또는 `(?:[a-zA-Z0-9_-]+)` 패턴을 동적으로 조립해 작품 ID를 자동으로 찾아냅니다. 따라서 대부분의 일반적인 사이트는 `idMatch`를 비워두셔도 정상 작동합니다.

### 2.4 Viewer (본문/이미지 추출)
실제 뷰어 페이지에서 내용을 가져오는 핵심 설정입니다.

- `fetchMethod`: `"iframe"` (가시성 로딩) 또는 `"xhr"` (백그라운드 로딩)
- **헤드리스 이미지 추출 (`imageRegex`)**: 
  - DOM 렌더링 전 소스 코드(JSON 페이로드 등)에서 정규식으로 이미지 URL을 직접 추출합니다.
  - Next.js 기반 사이트에서 이미지가 순식간에 사라지거나 교체되는 경우 사용합니다.
  - ⚠️ **중요 (광고 관련 경고):** `imageRegex`가 활성화되면 `imageContainer` 셀렉터 설정은 **완전히 무시**되고 전체 문서에서 무작위로 패턴 일치 이미지를 긁어옵니다. 이 경우 페이지 내 광고 배너, 썸네일, 로고 등 원치 않는 이미지들이 대량(60개 이상) 섞여 들어오게 됩니다.
  - 💡 **광고 필터링 팁:** 광고를 완벽하게 배제하고 본문만 깨끗하게 긁어가려면 **`imageRegex` 항목을 완전히 지우고**, 본문 상자만 특정하는 `imageContainer` 셀렉터(예: `"div.vw-imgs"`)를 정밀하게 입력하여 DOM 추출 모드로 구동해야 합니다.
- `imageContainer`: 이미지가 포함된 부모 요소 셀렉터 (여러 개인 경우 쉼표로 구분)
- `imageItem`: 이미지 태그 셀렉터 (보통 `"img"`)
- **동적 레이지 키 탐지 (`keyDiscovery`)**: 사이트가 `data-{random_key}`와 같이 유동적인 속성명을 사용할 경우 이를 자동으로 찾아냅니다.
  - `regex`: 키값을 찾기 위한 정규식 (첫 번째 그룹 `match[1]` 사용)
  - `prefix`: [선택] 속성명 앞에 붙을 접두사 (기본값: `"data-"`)
- `novelContent`: 소설 본문이 위치한 셀렉터 (소설 전용)

---

## 3. 고급 기능 및 팁

### 3.1 동적 렌더링 대응 (`waitForSelector`)
TokiSync 엔진은 설정된 `container` 셀렉터가 DOM에 나타날 때까지 최대 5초간 대기합니다. Next.js의 Hydration 과정으로 인해 리스트가 늦게 나타나는 경우에도 안전하게 파싱이 가능합니다.

### 3.2 정규식 주의사항
JSON 문자열 내에서 정규식의 역슬래시(`\`)는 이중으로 이스케이프(`\\`) 처리해야 합니다.
- 정규식의 `\d` -> JSON에서는 `"\\d"`
- 정규식의 `\/` -> JSON에서는 `"\\/"`

### 3.3 설정 적용 및 고급 편집 도구 활용 방법

1. **파서 대시보드 진입**:
   * 브라우저에서 TokiSync 대시보드 창을 켜고 **[설정]** 탭 내 **[파서 관리]** 영역을 엽니다.
   * 리뉴얼된 간편 폼 에디터(Form Editor)를 통해 시각적으로 규칙을 수정하거나 작성할 수 있습니다.

2. **크롬 DevTools 스타일 시각적 DOM 인스펙터 활용**:
   * 폼 에디터의 입력창 옆에 있는 **[검사/돋보기]** 모양 아이콘을 누르면 페이지 상에 DOM 인스펙터가 실행됩니다.
   * 마우스 커서로 대상 요소(제목, 이미지 부모, 다음 버튼 등)를 직접 호버하면 실물 페이지에서 하이라이트됩니다.
   * 대상을 클릭하면 엔진이 전체 DOM 트리상에서 가장 최적의 **CSS Selector**를 자동 추출하여 에디터 폼의 대상 필드에 실시간으로 즉시 입력해 줍니다. 

3. **원격 규칙 구독 관리**:
   * 대시보드 하단의 **[구독 설정]** 영역을 사용하여 외부에서 정기적으로 업데이트되는 파서 규칙(rules.json 등)의 URL 주소를 등록할 수 있습니다.
   * 등록된 구독 규칙은 백그라운드에서 24시간 주기로 자동 갱신되며 로컬 커스텀 규칙과 머지됩니다. (304 Not Modified 가드 장착으로 불필요한 트래픽 완전 차단)

4. **규칙 가져오기 (Import)**:
   * 로컬에 파일로 보관 중인 JSON 파일이 있다면 **[가져오기]** 버튼을 통해 `TOKI_PARSER_RULES` 스토리지에 즉시 동기 병합할 수 있습니다.
   * 편집 완료 후 **[저장]** 또는 **[규칙 적용]** 버튼을 클릭하면 활성 수집기에 실시간 반영됩니다.

---

## 4. 예시: 블랙툰 웹툰 규칙
```json
{
  "id": "blacktoon_webtoon",
  "name": "블랙툰 웹툰",
  "urlPattern": ".*/webtoon/.*",
  "category": "Webtoon",
  "meta": {
    "title": "h1.hero-v2-title",
    "author": "div.hero-v2-author",
    "thumb": { "selector": "div.hero-v2-thumb > img", "attr": "src" }
  },
  "list": {
    "container": "ul.ep-list-v2",
    "item": "li.ep-row-v2",
    "num": "span.ep-row-v2-no",
    "title": ".ep-row-v2-title strong",
    "link": { "selector": "a.ep-row-v2-link", "attr": "href" }
  },
  "viewer": {
    "fetchMethod": "iframe",
    "keyDiscovery": {
      "regex": "data_attribute\\s*:\\s*['\"]([^'\"]+)['\"]",
      "prefix": "data-"
    },
    "imageRegex": "https?:\\\\/\\\\/[a-zA-Z0-9_.\\\\/-]+\\\\.(?:jpg|png|webp|gif)",
    "imageContainer": "div.vw-imgs, main.vw-main"
  }
}
```
