# TokiSync 동적 파싱 규칙(JSON) 가이드 (v1.8.0)

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

### 2.3 Viewer (본문/이미지 추출)
실제 뷰어 페이지에서 내용을 가져오는 핵심 설정입니다.

- `fetchMethod`: `"iframe"` (가시성 로딩) 또는 `"xhr"` (백그라운드 로딩)
- **헤드리스 이미지 추출 (`imageRegex`)**: 
  - DOM 렌더링 전 소스 코드(JSON 페이로드 등)에서 정규식으로 이미지 URL을 직접 추출합니다.
  - Next.js 기반 사이트에서 이미지가 순식간에 사라지거나 교체되는 경우 필수입니다.
  - 예: `"https?:\\\\/\\\\/[a-zA-Z0-9_.\\\\/-]+\\\\.(?:jpg|png|webp|gif)"`
- `imageContainer`: 이미지가 포함된 부모 요소 셀렉터 (여러 개인 경우 쉼표로 구분)
- `imageItem`: 이미지 태그 셀렉터 (보통 `"img"`)
- `novelContent`: 소설 본문이 위치한 셀렉터 (소설 전용)

---

## 3. 고급 기능 및 팁

### 3.1 동적 렌더링 대응 (`waitForSelector`)
TokiSync 엔진은 설정된 `container` 셀렉터가 DOM에 나타날 때까지 최대 5초간 대기합니다. Next.js의 Hydration 과정으로 인해 리스트가 늦게 나타나는 경우에도 안전하게 파싱이 가능합니다.

### 3.2 정규식 주의사항
JSON 문자열 내에서 정규식의 역슬래시(`\`)는 이중으로 이스케이프(`\\`) 처리해야 합니다.
- 정규식의 `\d` -> JSON에서는 `"\\d"`
- 정규식의 `\/` -> JSON에서는 `"\\/"`

### 3.3 설정 적용 방법
1. 브라우저에서 TokiSync 메뉴의 **[설정]**을 클릭합니다.
2. **커스텀 파싱 룰 (JSON Array)** 칸에 작성한 JSON을 붙여넣습니다.
   - 이때 `rules` 배열만 넣거나, 전체 JSON 구조를 그대로 넣어도 엔진이 알아서 처리합니다.
3. **저장** 버튼을 누르면 즉시 적용됩니다.

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
    "imageRegex": "https?:\\\\/\\\\/[a-zA-Z0-9_.\\\\/-]+\\\\.(?:jpg|png|webp|gif)",
    "imageContainer": "div.vw-imgs, main.vw-main"
  }
}
```
