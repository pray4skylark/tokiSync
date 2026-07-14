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

## Pre-Push Workflow
Develop 브랜치로 push 전 필수 선행 작업:
1. **문서화 완료**: `.agent_checkpoint.md` 및 `CHANGELOG.md` 업데이트 확인
2. **Graphify 갱신**: `/graphify --update` 실행하여 knowledge graph 최신화
3. **빌드 검증**: `npm run build:core` 성공 확인
4. **문서화 커밋 머지**: 직전 작업 커밋과 문서화 커밋을 하나로 합친 후 태그 지정
   - `git rebase -i HEAD~2` 또는 `git commit --amend`로 작업 커밋에 문서 포함
   - 태그는 최종 머지된 커밋에 부여 (`git tag -a vMAJOR.MINOR.PATCH`)
5. **Push**: `git push origin develop --tags` (사용자 직접 실행)

## Release Workflow
- No auto-commits or auto-releases. Always get human approval.
- Version bump only at commit phase after approval.
- Release assets: `dist/tokiSync.user.js`, `dist/TokiSync_Server_Bundle.gs`.
- Tag releases with `vMAJOR.MINOR.PATCH` format.

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
