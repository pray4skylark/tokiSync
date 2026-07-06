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
npm run test            # Unit tests (14 tests)
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

## Session Handover
When handing off to another model:
1. Update `.agent_checkpoint.md` with current state and pending items.
2. Summarize what was done, what's pending, and any decisions made.
3. Note any build/verification results.
