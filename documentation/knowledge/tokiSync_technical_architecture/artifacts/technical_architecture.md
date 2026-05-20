# TokiSync Technical Architecture (Master)

TokiSync는 브라우저(Edge)의 강력한 렌더링 성능과 Google Drive(Cloud)의 안정적인 저장 공간을 결합한 **Cloud-Edge 하이브리드 아키텍처**를 채택하고 있습니다.

---

## 1. The Golden Loop (데이터 흐름 모델)
사용자의 요청부터 저장, 동기화까지 이어지는 순환 구조입니다.

1.  **Extraction (Edge)**: `GenericParser` + **`extractor.js`** 가 사이트별 JSON 룰을 기반으로 에피소드 목록과 이미지/텍스트 데이터를 추출.
2.  **Transformation (Edge)**: 추출된 데이터를 `blob` 또는 `txt` 포맷으로 가공하고, `Smart Skip` 알고리즘으로 무결성 검증.
3.  **Persistence (Cloud)**: Google Apps Script(GAS)를 통해 Google Drive v3 API로 데이터 전송 및 `info.json` 생성.
4.  **Synchronization (Cloud-Edge)**: 
    - **Fast Path**: `fetchHistoryDirect`를 통해 Google Drive API v3로 에피소드 이력을 직접 조회 (공유 드라이브 대응).
    - **Fallback**: Direct API 실패 시 GAS Relay(`fetchHistory`)로 전환.
    - `Merge Index` 전략을 통해 클라이언트의 `library_index.json`과 클라우드 상태를 최종 동기화.
5.  **Rendering (Edge)**: `Viewer V2`가 정밀 로케이터를 사용하여 최적화된 독서 경험 제공.

## 1-1. Extraction Pipeline: `extractor.js`

`downloader.js`와 `parser` 사이의 **중간 계층 모듈**. DOM 추출의 모든 복잡성을 캡슐화한다.

```js
// 시그니처
extractEpisodeData(targetDoc, parser, siteInfo, isStaticDoc, episodeUrl)
// 반환: { urls: string[], content: string, seriesTitle, episodeTitle, episodeNum }
```

### 처리 순서 (웹툰)
1. `parser.getImageList(targetDoc)` — 초기 파싱
2. `scrollToLoad(targetDoc, 20000)` — 레이지 로딩 대기 (정적 문서 제외)
3. 재파싱 후 **Placeholder 우회 병합**: 스크롤 후 이미지가 더미로 교체된 경우 초기값 복원
4. 0개 감지 시 1.5초 대기 후 자동 재파싱

### 처리 순서 (소설)
1. `parser.getNovelContent(targetDoc)` — DOM 텍스트 추출
2. 실패 시 → `fetchNovelText(episodeUrl, decryptApi)` **API 복호화 자동 폴백**

### 호출처
- `downloader.js:129` — 메인 다운로드 루프
- `main.js:199, 232` — 단건 추출 / 뷰어 메타데이터

## 2. Cloud-Edge 분리 아키텍처
- **Edge Layer (Client-side UserScript)**:
  - **Responsibilities**: DOM 파싱, 복호화(HMAC-SHA256/XOR), 다운로드 가속, v1.9.1 Glassmorphism UI 렌더링.
  - **Technology**: Javascript (ES6+), Vanilla CSS (Custom Tokens), Vite.
- **Cloud Layer (Google Apps Script)**:
  - **Responsibilities**: 파일 시스템 관리, 인증 관리, 대용량 인덱스 검색, 라이브러리 메타데이터 통합.
  - **Technology**: GAS (V8 Engine), Drive API v3.

## 3. Communication Protocols
- **Client -> GAS**: `google.script.run` 또는 `UrlFetchApp` (v1.9+ 에서는 성능 향상을 위해 직접 OAuth 토큰을 이용한 `GM_xmlhttpRequest` 직접 업로드 방식 병행).
- **Security**: 
  - Novel 사이트 인증은 로컬 브라우저 세션을 활용 (CORS 우회 불필요).
  - 클라우드 전송 데이터는 HTTPS 암호화 채널 사용.

## 4. Scalability Strategy
- **Modular Parser**: 새로운 사이트 추가 시 `BaseParser`를 상속받거나 `toki_parser_rules.json`에 룰을 추가하는 것만으로 대응 가능.
- **Storage**: 사용자 드라이브 공간을 활용하므로 무한 확장이 가능하며, `SyncService`의 페이지네이션 로직으로 수천 개의 작품 관리 가능.

---

> [!NOTE]
> **Architectural Goal**: 서버(GAS) 비용은 0원으로 유지하면서, 모든 연산 부하를 클라이언트(브라우저)로 분산하여 무한한 수평 확장을 실현함.
