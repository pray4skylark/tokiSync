# tokiSync 동적 파서 규칙 시스템 (v1.25.0)

## 핵심 원칙

TokiSync는 사이트별 하드코딩 대신 **JSON 기반 동적 규칙**으로 데이터를 추출한다.
규칙은 사용자가 **트리 에디터(Tree Editor)** UI를 통해 시각적으로 관리하며, 실시간 업데이트가 가능하다.

> [!TIP]
> 상세한 계층 구조 및 노드 명세는 [트리 구조 명세서](tree_structure_spec.md)를 참조하십시오.

---

## 1. 규칙 스키마

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

## 2. 필드 명세

### 2.1 `meta` (작품 메타데이터)

| 형태 | 예시 | 동작 |
|------|------|------|
| 문자열 | `"h1.title"` | CSS 셀렉터 → `innerText` 추출 |
| 객체 | `{ selector, attr, regex }` | attr: 속성값 추출, regex: match[1] 캡처 |

```json
"meta": {
  "title": "h1.title",
  "thumb": { "selector": "img.cover", "attr": "src" }
}
```

### 2.2 `list` (에피소드 목록)

| 필드 | 설명 |
|------|------|
| `container` | 목록 전체 부모 요소 |
| `item` | 개별 회차 단위 요소 |
| `num` | 회차 번호 셀렉터 |
| `title` | 회차 제목 셀렉터 |
| `link` | `{ selector, attr: "href" }` |
| `sub` | [선택] 추가 구분자 정규식 |

### 2.3 `viewer` (본문/이미지 추출)

| 필드 | 설명 |
|------|------|
| `fetchMethod` | `"iframe"` (가시성 로딩) / `"xhr"` (백그라운드) |
| `imageContainer` | 이미지 부모 셀렉터 (쉼표로 다수 지정 가능) |
| `imageItem` | 이미지 태그 셀렉터 (기본: `"img"`) |
| `novelContent` | 소설 텍스트 본문 셀렉터 |
| `imageRegex` | 헤드리스 URL 추출용 정규식 (Next.js 사이트 필수) |
| `keyDiscovery` | 동적 lazy 키 탐지 객체 (↓ 상세) |
| `exclude` | [선택] 이미지 추출 전 DOM에서 사전 제거할 요소의 CSS 셀렉터 (단일 문자열 혹은 문자열 배열) |
| `remove` | [선택] `exclude`와 동일하게 작동하는 제거용 서브 키워드 (동의어) |

---

## 3. 고급 기능

### 3.1 헤드리스 이미지 추출 (`imageRegex`)

DOM 렌더링 전 소스 코드(JSON 페이로드)에서 이미지 URL을 직접 추출.
Next.js 기반처럼 이미지가 순식간에 교체되는 사이트에 **필수**.

```json
"imageRegex": "https?:\\/\\/[a-zA-Z0-9_.\\/-]+\\.(?:jpg|png|webp|gif)"
```

> ⚠️ JSON 내 역슬래시는 이중 이스케이프 필요: `\d` → `"\\d"`

### 3.2 동적 LazyKey 탐지 (`keyDiscovery`) [v1.8.1]

사이트가 `data-{random_key}` 같이 유동적 속성명을 사용하는 경우 자동 탐지.

```json
"keyDiscovery": {
  "regex": "data_attribute\\s*:\\s*['\"]([^'\"]+)['\"]",
  "prefix": "data-"
}
```

- `regex`: 키값을 찾는 정규식, 첫 번째 그룹(`match[1]`) 사용
- `prefix`: 속성명 앞에 붙을 접두사 (기본값: `"data-"`)

### 3.3 동적 렌더링 대응 (`waitForSelector`)

`container` 셀렉터가 DOM에 나타날 때까지 **최대 5초 대기**.
Next.js Hydration 지연에도 안전하게 파싱 가능.

### 3.4 광고 및 불필요 요소 제거 (`exclude` / `remove`) [v1.9.5]

뷰어 본문 내부의 광고 영역, 소셜 공유 버튼, 노이즈성 텍스트/이미지를 본 수집 단계 전 DOM에서 완전히 박멸합니다.
단일 셀렉터 문자열 및 복수 셀렉터 배열 모두 완벽히 수용합니다.

```json
"viewer": {
  "imageContainer": "div.vw-imgs",
  "exclude": [
    "div.banner-ad-container",
    ".sponsored-link",
    "iframe[src*='googleads']"
  ]
}
```

---

## 4. 설정 및 규칙 관리 방법

v1.25.0부터는 모든 파싱 규칙이 단일 로컬 스토리지(`TOKI_PARSER_RULES`)를 통해 관리됩니다. 대시보드를 통해 두 가지 시각적 편집 도구를 선택적으로 사용할 수 있습니다:

### 4.1 Form Rule Editor (간편 에디터)
1. TokiSync 메뉴 → **[설정]** 탭 → **[파서 관리]** 대시보드 진입
2. 직관적인 폼 필드를 통해 개별 룰의 주요 속성(id, name, urlPattern 등)을 쉽고 빠르게 수정/추가
3. **[저장]** 버튼을 클릭하여 스토리지에 즉시 반영

### 4.2 Tree Rule Editor (정밀 트리 에디터)
1. 동일한 대시보드 화면 내에서 **트리 뷰** 모드로 전환
2. JSON의 모든 필드를 노드(Key-Value) 단위로 시각적인 트리 형태로 추가, 삭제, 수정
3. **[규칙 적용]** 버튼을 클릭하여 반영

### 4.3 JSON Import / Export (가져오기 및 내보내기)
1. 대시보드 하단의 JSON 텍스트 필드를 통해 작성된 JSON 배열 형태의 규칙들을 한 번에 복사해서 붙여넣고 **[가져오기]** 수행 가능
2. 현재 저장된 전체 규칙셋을 텍스트 파일로 백업할 수 있는 **[내보내기]** 기능 제공

---

## 5. 완성 예시 (블랙툰 웹툰)

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
    "imageRegex": "https?:\\/\\/[a-zA-Z0-9_.\\/-]+\\.(?:jpg|png|webp|gif)",
    "imageContainer": "div.vw-imgs, main.vw-main",
    "exclude": [".ad-banner", "#sponsored-bottom"]
  }
}
```

---

## 6. 신규 사이트 파서 DOM 추출 가이드

신규 사이트 추가 시 아래 두 페이지의 HTML을 추출하여 제공해야 함:

### 추출 대상

| 페이지 | 추출 영역 | 목적 |
|--------|----------|------|
| 작품 메인 | 에피소드 목록 컨테이너 + 항목 1~2개 | `list` 규칙 작성 |
| 작품 메인 | 제목/썸네일/작가 영역 or `<meta>` 태그 | `meta` 규칙 작성 |
| 뷰어 | 본문 이미지 컨테이너 + `<img>` 1~2개 | `viewer` 규칙 작성 |
| 뷰어 | 소설 텍스트 본문 컨테이너 (소설 전용) | `novelContent` 셀렉터 |

> 💡 `src`, `data-src`, `data-lazy` 등 커스텀 속성이 보이도록 복사해야 `keyDiscovery` 설정 가능.
