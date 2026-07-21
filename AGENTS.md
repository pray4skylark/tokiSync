# TokiSync — Agent Rules

## Context
- Always read `AI_AGENT_CONTEXT.md` (SSOT) and `PROJECT_HANDOVER_MASTER.md` before starting tasks.
- Check `.agent_checkpoint.md` for current session state and pending work.
- All markdown docs (except root) live under `documentation/`: `guides/`, `reports/`, `archive/`, `knowledge/`.

## Permissions
- **PROHIBITED**: `clasp push`, `rm -rf`, `git push`. Guide the human instead.
- **REQUIRED**: Run `npm run build:core` before any commit to verify the bundle.
- **REQUIRED**: Run `npm run build` for full release builds (Viewer + Core + GAS).

## Graphify MCP
- Knowledge graph at `graphify-out/graph.json`. MCP server configured in `opencode.json`.
- Use graphify tools for cross-module dependency analysis and architecture questions.
- After significant code changes, re-run: `python3 -c "from graphify.extract import extract; ..."` or run `/graphify --update` to refresh the graph.
- Key tools: `graphify_query`, `shortest_path`, `god_nodes`, `get_neighbors`.

## Build Commands
```bash
npm run build:core      # Webpack → dist/tokiSync.user.js
npm run build:viewer    # Vite → dist-viewer/
npm run build:gas       # Bundle → TokiSync_Server_Bundle.gs
npm run build           # All three
npm run test            # Unit tests (30 tests)
npm run dev:viewer      # Vite dev server
```

## Architecture Rules
- **Stateless GAS**: No `PropertiesService`. Everything payload-driven.
- **Zero DriveApp**: All Drive ops through `DriveAccessService.gs`.
- **Single Input Controller**: `useViewerInput.js` handles all viewer input.
- **Merge-First Sync**: Pull → Merge → Push for history.
- **Queue Write Monopoly**: Only `worker-controller.js` (parent) writes queue state.
- **Singleton Parser**: Always via `ParserFactory.getParser()`, never `new`.
- **Theme Variables**: No hardcoded colors. Use `--t-*` CSS variables.
- **nav-zone pattern**: ABOLISHED. Do not reintroduce.
- **DI Storage Mandate**: 모든 저장소 접근은 `StorageBackend` 추상화를 통해서만 수행한다.

### DI Storage 규격 (v1.27.7+)
모든 모듈에서 `GM_getValue` / `GM_setValue` / `GM_deleteValue` 직접 호출은 **금지**된다. 대신 `StorageBackend` 인터페이스를 주입받아 사용한다.

| 모듈 | 주입 함수 | 저장소 도메인 | 예시 |
|------|----------|-------------|------|
| `config.js` | `setConfigStorage(backend)` | 설정 | `_storage.get(CFG_ID_KEY, "")` |
| `queue.js` | `setQueueStorage(backend)` | 대기열 | `_storage.get(STORAGE_KEY, [])` |
| `utils.js` | `setDownloadBackend(backend)` | 파일 다운로드 | `_downloadBackend.download(blob, path)` |
| `series-config.js` | `setSeriesStorage(backend)` | 시리즈 공유 데이터 | `_storage.get(seriesKey, null)` |

**Fallback chain** (모든 모듈 공통):
```
_storage (DI 주입) → GM_* (Tampermonkey) → localStorage → defaultValue/null
```

**신규 저장소 모듈 생성 시**:
1. `let _storage = null` + `export function setXxxStorage(backend)` 패턴 사용
2. `_get(k, d)` / `_set(k, v)` / `_delete(k)` 3단계 폴백 구현
3. `main.js`에 `setXxxStorage(new GMStorageBackend())` 주입 호출 추가
4. DI 미설정 시 직접 GM 호출로 폴백 (Prod 호환 유지, Test에서는 Mock 주입)
5. `StorageBackend`가 JSON 직렬화를 처리하므로 수동 `JSON.stringify`/`JSON.parse` 불필요

**예외**: `localStorage` 백업(shadow copy)은 config.js의 `backupToLocalStorage()`처럼 DI 외부에서 readonly 용도로만 허용.

### EventBus Patterns (v1.26.0+)
| 패턴 | 용도 | 예시 |
|------|------|------|
| `emit` / `on` | 단방향 통지 (응답 불필요) | `LOG`, `UPDATE_PROGRESS`, `STORAGE_FATAL` |
| `request` / `respond` | 양방향 요청-응답 (Promise) | `TEST_NATIVE_DOWNLOAD`, `PARSE_VERIFY`, `PARSE_TEST` |

- **Timeout**: 기본 8초. 진단/테스트용은 3초 이하. `request()` 호출 시 명시적 timeoutMs 전달.
- **Responder 반드시 등록**: `request()` 호출 전에 반드시 `on()`으로 responder 등록. `init()` 단계에서 등록하고 runtime 동적 등록 금지.
- **Respond guard**: 모든 `respond()` 경로는 try/catch로 감싸서 항상 응답 보장. 미응답 = caller timeout → 사용자 경험 저하.
- **Pre-emit check** (v1.28.1): `request()`는 emit 전에 `_listeners[event].length === 0` 체크 → 리스너 없으면 즉시 reject (8초 대기 불필요).

### Queue State Consistency (v1.28.1+)
- **3개 레지스트리 동기화**: `processingSlots`, `sessionRegistry`, `activeWorkers`는 항상 같은 worker 집합.
- **assertConsistent**: 모든 상태 변경 지점(create, destroy, liveness, scheduler entry/exit)에서 호출. 불일치 감지 시 자동 reconcile (멤버십 비교 + 교집합 self-healing).
- **Session cleanup 단일 경로**: 세션 제거는 `destroyWorkerSession()`으로만 수행. `processingSlots.delete()` 등 개별 레지스트리 직접 조작 금지.
- **zombie detection**: 좀비 팝업 감지 5회(10초) → 3회(6초)로 단축. `closedCounts` 추적.

### Storage Safety Rules (v1.28.1+)
- **STORAGE_FATAL listener mandatory**: 저장 실패 이벤트(`STORAGE_FATAL`)는 반드시 UI 리스너 존재. Dead event 금지. LogBox에서 toast/alert 표시.
- **No silent data loss**: 저장 실패 시 항상 user-facing 경고 (alert/toast/log). console.error만으로 충분하지 않음.
- **localStorage = backup only**: runtime primary storage로 전환 금지. config.js `backupToLocalStorage()` 패턴만 허용.
- **No backend switching mid-session**: GM_setValue → localStorage 자동 전환 금지 (데이터 사일로, 크로스탭 동기화 깨짐).

### Queue Key Splitting (v1.28.0+)
- **공유 데이터 분리**: `matchedRule`, `viewerCfg`, `seriesMetadata` 등은 seriesKey로 참조. 큐 아이템에 inline 저장 금지.
- **normalizeQueueItem 필수**: seriesKey가 있는 큐 아이템 읽을 때 반드시 `normalizeQueueItem()` 통과. 원본 item 직접 읽기 금지.
- **saveSeriesConfig 실패 대비**: 저장 실패(`false` 반환) 시 episode에 inline fallback 필드 포함. dangling seriesKey 금지.
- **getSeriesConfigKey**: `ruleId + shortHash(seriesTitle, 4 chars) + seriesId` 조합. 단순 `ruleId + seriesId`만으로 충돌 가능 (P3).
- **Series Config GC**: `removeCompletedAndFailedItems`, `clearQueue` 호출 시 고아 seriesKey 자동 정리. 진행 중인 작업의 seriesKey는 보존.

### Test Conventions
- **Prefix**: `D#`=DI, `E#`=Edge Case, `M#`=Misc Regression, `H#`=Heisenbug, `L#`=Leak. 신규는 `E#` 다음 번호.
- **mockStorage()**: DI 모듈 테스트 시 `const { store } = mockStorage(true, false)` 사용. `setSeries`/`setQueue` 플래그로 도메인 선택.
- **State cleanup**: 각 테스트 종료 시 `setXxxStorage(null)` + `clearQueue()` + 레지스트리 초기화 호출.
- **No production store mutation**: 테스트에서 GM_* 직접 호출 금지. 항상 `mockStorage()` 또는 `globalThis.GM_getValue` mock 통해.
- **실환경 테스트**: `test-real-env.js` — JSDOM mock (`window.addEventListener`, `window.open`, `document`). 실제 Tampermonkey 환경 시뮬레이션.

## Layer Boundaries
```
core/ → parser/ → ui/ → viewer/ (preferred direction)
```
- UI → Core/Parser direct calls are violations. Route through `EventBus` when possible.
- Viewer composables (useStore, useFetcher) should not import core modules directly.

## Documentation Workflow
- Update `.agent_checkpoint.md` after each subtask completion.
- Update `CHANGELOG.md` immediately with every technical change (Atomic Changelog).
- After a session, ensure checkpoint is synced to HANDOVER/CONTEXT/CHANGELOG.

## Pre-Push Workflow (3-Tier Promotion)

### Tier 1: Beta (develop → origin/develop)
1. **문서화 완료**: `.agent_checkpoint.md` 및 `CHANGELOG.md` 업데이트 확인
2. **Graphify 갱신**: `/graphify --update` 실행하여 knowledge graph 최신화
3. **빌드 검증**: `npm run build:core` 성공 확인
4. **버전 범프**: `package.json` → `components.script/viewer/gas` 모두 `vM.m.p-beta.N` (최초 beta는 `v1.27.7-beta.1`)
5. **문서화 커밋 머지**: 직전 작업 커밋과 문서화 커밋을 하나로 합친 후 태그 지정
   - 태그는 최종 머지된 커밋에 부여 (`git tag -a vM.m.p-beta.N`)
6. **Push**: `git push origin develop --tags` (사용자 직접 실행)

### Tier 2: RC (rc → origin/rc)
1. 직전 beta 커밋에서 rc 브랜치 생성/갱신: `git branch -f rc HEAD && git checkout rc`
2. 버전 범프: `vM.m.p-rc.N`
3. 빌드 검증: `npm run build` (전체 빌드)
4. 태그: `git tag -a vM.m.p-rc.N`
5. Push: `git push origin rc:rc --tags` (사용자 직접 실행)

### Tier 3: Stable (rc → main → origin/main)
1. RC 검증 완료 → PR: `rc` → `main` (human)
2. main 병합 후 정식 태그: `git tag -a vM.m.p`
3. GitHub Release 작성, assets 첨부 (human)

## Release Workflow (3-Tier)
- No auto-commits or auto-releases. Always get human approval.
- Version bump only at commit phase after approval.
- Release assets: `dist/tokiSync.user.js`, `dist/TokiSync_Server_Bundle.gs`.

| 단계 | 브랜치 | 태그 예시 | gh-pages | 배포 대상 |
|------|--------|-----------|----------|-----------|
| Beta | develop | `v1.27.7-beta.1` | `/dev/` | 최신 기능 조기 테스트 |
| RC | rc | `v1.27.7-rc.1` | `/rc/` | 정식 전 최종 검증 |
| Stable | main | `v1.27.7` | `/` (root) | 실서비스 정식 배포 |

### Promotion 체크리스트
- **Beta → RC**: 기능 완료, 모든 테스트 통과, 릴리즈 노트 초안
- **RC → Stable**: RC 기간 내 P1/P2 없음, 최종 QA 완료, 정식 릴리즈 노트 완료

## Commit Convention
- 커밋 메시지는 **한글**로 작성한다.
- Conventional Commits 포맷 사용: `type(scope): subject` (영어). 본문(body)은 한글.
  - 예시: `fix(core): 다운로드 워커 경합 레이스 조건 수정`

## Error Handling
- Error found → Document in `.agent_checkpoint.md` → Re-plan if needed → Fix.
- Never hotfix without understanding the root cause.
- Check `sem impact <entity>` before changes, `sem diff` after.

## Multi-Agent Cross-Validation Workflow

동일 문제를 서로 다른 모델 2개가 병렬 분석 → cross-validator가 비교/중재 → 합일.

### Agent 구성 (`opencode.json`)

| Agent | Model | Edit | Task Permission | 역할 |
|-------|-------|------|----------------|------|
| `solver-a` | deepseek-v4-pro | allow | - | 1차 해결안 |
| `solver-b` | mimo-v2.5-pro | allow | - | 2차 해결안 (다른 모델) |
| `cross-validator` | qwen3.6-plus | deny | solver-a, solver-b, mediator | 오케스트레이터 |
| `mediator` | deepseek-v4-pro | deny | - | 3R 실패 시 최종 중재 |

### 사용법

```bash
# ⭐ 한 줄로 전체 실행 (권장)
@cross-validator <문제>

# 또는 역할을 지정해서 토론/분석
@cross-validator <문제> A는 부먹파 B는 찍먹파로 토론

# 개별 호출
@solver-a <질문>
@solver-b <질문>
@mediator <두 해결안>
```

### 내부 워크플로우

```
@cross-validator "문제"
  ↓
Round 1:
  Task solver-a (신규 session) "문제" → solution_A
  Task solver-b (신규 session) "문제" → solution_B
  ↓
Cross-Check:
  비교 → CONVERGED? → FINAL_SOLUTION
  ↓ (DIVERGED, round < 3)
Round N:
  Task solver-a (task_id 재사용) "Peer: <B_CRITIQUE>. Revise."
  Task solver-b (task_id 재사용) "Peer: <A_CRITIQUE>. Revise."
  ↓ (3R 초과)
Mediator:
  Task mediator "3 rounds history" → unified solution
  ↓
사용자에게 결과 반환
```

## Session Handover
When handing off to another model:
1. Update `.agent_checkpoint.md` with current state and pending items.
2. Summarize what was done, what's pending, and any decisions made.
3. Note any build/verification results.
