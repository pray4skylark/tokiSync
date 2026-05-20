# tokiSync 다운로더 정책 & V2 뷰어 진도 동기화 명세

## 1. 다운로더 속도 정책 (SLEEP_POLICIES)

### 1.1 5단계 정책 (v2.1 기준)

| 단계 | 키 | 대기 시간 |
|------|-----|----------|
| 매우 빠름 | `very_fast` | 0~2초 |
| 빠름 | `fast` | 1~4초 |
| 보통 | `normal` | 2~8초 |
| 느림 | `slow` | 5~15초 |
| **매우 느림** | `very_slow` | **10~30초** |

### 1.2 API 복호화 정책 (기획 이력)

> **[설계 철회됨]** 초기 설계에서는 `fetchMethod === 'api'` 시 사용자 설정과 무관하게 `very_slow`를 강제 적용하는 로직이 있었으나, **이후 의도적으로 철회**되었습니다.
> 현재 코드는 사용자가 선택한 `sleepMode` 설정(`config.sleepMode`)을 그대로 사용합니다.

```js
// 현재 구현 (downloader.js:33, 66)
let policy = SLEEP_POLICIES[config.sleepMode] || SLEEP_POLICIES.agile;
// ...
await sleep(policy.min, policy.max); // 사용자 설정 그대로 적용
```

**배경**: WAF/DDoS 차단 회피를 위해 강제 슬로우 정책을 설계했으나, 사용자 제어권 우선 원칙에 따라 철회. 대신 `very_slow` 옵션을 UI에 노출하여 사용자가 직접 선택하도록 변경.

### 1.3 범위 다운로드 정렬 보장

범위 지정(`rangeSet`) 시 에피소드를 **번호(num) 기준 오름차순** 정렬 후 처리.

```js
// 사이트의 역순(최신순) 정렬 보정
if (rangeSet) {
  items = items
    .map(el => ({ el, num: parser.parseListItem(el).num }))
    .sort((a, b) => a.num - b.num)
    .map(({ el }) => el);
}
```

**효과**: `1-10` 지정 시 1화부터 10화 순서로 다운로드.

### 1.4 Anti-Sleep 모듈 (`anti_sleep.js`)

장시간 다운로드 중 브라우저 탭 스로틀링으로 인한 타임아웃/중단을 방지하는 모듈.

- **동작**: `AudioContext`로 **1Hz 무음 오실레이터**를 재생하여 탭을 활성 상태로 유지
- **자동 활성화**: `tokiDownload()` 시작 시 자동 호출, 종료/오류 시 `stopSilentAudio()` 정리
- **Autoplay 차단 대응**: 사용자 상호작용 없이 실행 불가한 환경에서는 catch로 처리 후 계속 진행

```js
// downloader.js:207~212
try {
    startSilentAudio(); // 다운로드 시작 시 자동 활성화
} catch (e) {
    logger.log('[Anti-Sleep] 자동 시작 실패 (사용자 상호작용 필요)', 'error');
    // 실패해도 다운로드는 계속 진행
}
```

| 함수 | 역할 |
|------|------|
| `startSilentAudio()` | AudioContext + Oscillator 시작 |
| `stopSilentAudio()` | 모든 오디오 리소스 정리 |
| `isAudioRunning()` | 현재 활성 여부 확인 |

### 1.5 다운로드 실패 리포팅 (v1.8.1)

다운로드 루프에서 발생한 실패를 두 단계로 분류하여 추적.

| 배열 | 조건 | 내용 |
|------|------|------|
| `failedEpisodes` | 에피소드 처리 자체 실패 | `{ num, title, error }` |
| `partialFailures` | 이미지 일부 누락 (`isMissing`) | `{ num, title, missingCount }` |

- 실패 에피소드는 `continue`로 건너뛰고 루프 **계속 진행** (전체 중단 없음)
- 루프 종료 후 사용자에게 실패 목록 리포트 (LogBox 출력)

---

## 2. V2 소설 뷰어 진도 동기화 (DOM Offset Locator System)

### 2.1 문제 배경

기존 비율 기반(Heuristic) 계산은 폰트 크기 변경 시 수십 페이지 오차 발생.

### 2.2 DOM Offset 기반 Locator 시스템

**저장 로직**
- 현재 Viewport 맨 앞에 위치한 문단의 `data-locator` 인덱스를 `logicalIndex`로 저장.

**복원 로직**
- 대상 DOM 요소의 `offsetLeft` ÷ `clientWidth` = 정확한 컬럼(페이지) 번호

```js
// useProgressMarker.js - getPageFromLocator
const el = document.querySelector(`[data-locator="${logicalIndex}"]`);
const page = Math.floor(el.offsetLeft / viewerEl.clientWidth);
scrollToPage(page);
```

**효과**: 폰트를 극단적으로 바꿔도 읽던 문단으로 1px 오차 없이 복원.

### 2.3 에피소드 전환 데이터 무결성 (Flush & Reset)

에피소드 이동 시 이전 진도 잔류로 인한 페이지 건너뜀 방지를 위한 이중 안전장치.

| 시점 | 동작 | 목적 |
|------|------|------|
| 에피소드 이동 **직전** | `flushSaveToDB()` | 현재 위치 즉시 DB 저장, 유실 방지 |
| 새 에피소드 **로드 시** | `resetLocator()` (→ logicalIndex = 0) | 오염 원천 차단 |

```js
// useStore.js - startReading 호출 순서 (반드시 지킬 것)
await flushSaveToDB();   // 1. Flush 먼저
resetLocator();          // 2. Reset 후
loadEpisode(newEp);      // 3. 새 에피소드 로드
```

> ⚠️ Flush 없이 Reset만 하면 현재 진도 유실. 순서 역전 금지.

### 2.4 핵심 파일 위치

| 파일 | 역할 |
|------|------|
| `src/viewer/composables/useProgressMarker.js` | `flushSaveToDB`, `resetLocator`, `getPageFromLocator` |
| `src/viewer/composables/useStore.js` | `startReading` - Flush/Reset 호출 순서 보장 |
| `src/viewer/components/TextRenderer.vue` | 720px 고정 가로폭, `column-width` 자동 계산 |

### 2.5 레이아웃 표준

- 소설 뷰어 가로폭: **720px 고정** (전문 전자책 수준 가독성)
- 텍스트 설정: 테마(Sepia/Dark 등), 폰트 크기, 줄 간격 → Floating Footer에서 실시간 조절
- 설정 변경 시 `@paginate` 이벤트 즉시 트리거 → 페이지 재계산 → Locator 재복원
