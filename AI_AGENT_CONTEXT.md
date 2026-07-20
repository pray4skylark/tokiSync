# TokiSync Project: AI Agent Context

This document is the **single source of truth (SSOT)** for the project's static blueprint—architecture, core design principles, and technical conventions. It serves as the foundation for the AI Agent's understanding of the system.

## 1. Project Identity & Architecture

- **Project Name**: TokiSync
- **Target**: Manga/Webtoon/Novel Synchronizer & Viewer
- **Architecture**:
  - **Backend**: Google Apps Script (Stateless API + Drive API V3).
  - **Bridge**: Tampermonkey UserScript (Core logic, DOM Scraping, `GM_xmlhttpRequest` for Direct Drive Access).
  - **Frontend (Viewer)**: Vue 3 (Composition API) + Tailwind CSS SPA, hosted on GitHub Pages.
- **Storage**: Dexie.js for offline viewer cache (IndexedDB).

### Core Design Principles

- **Stateless GAS**: The Google Apps Script backend must remain stateless.
  Do NOT use `PropertiesService` for user settings; everything must be payload-driven.
- **Drive API V3 & Zero-DriveApp (v1.8.0+)**: All Google Drive interactions MUST use the **Drive API v3 (Advanced Service)**. 
  - Usage of legacy `DriveApp` is strictly forbidden to minimize permission scopes and improve performance.
  - All Drive operations must be routed through `DriveAccessService.gs`.
- **Hybrid Media Access (v1.8.0)**: Due to v3 API's Blob compatibility issues in GAS, file content/bytes retrieval must use the **UrlFetchApp + REST API (alt=media)** pattern for stability.
- **Direct Drive Access**: Use `GM_xmlhttpRequest` (via Tampermonkey) to bypass GAS 6-minute execution limits and CORS restrictions.
  - **Resumable Upload (v1.7.3+)**: Use Google Drive's Resumable Upload protocol (5MB chunks) for all direct uploads to prevent memory/size limits.
- **Single Controller Rule**: All viewer input (mouse, touch, keyboard, wheel) MUST be handled through a single composable: `useViewerInput.js`.
  - DO NOT split input handling across component event handlers and composables.
  - Mouse clicks: Use `@mousedown.left` attached directly to `viewer-container`.
  - Touch: Attach `touchstart`/`touchend` directly to `viewer-container`. Use `lastTouch` timestamp (+300ms) to prevent ghost events after touch.
  - `nav-zone` div pattern is **ABOLISHED**. Do not re-introduce it.
- **Sync Guard (v1.7.6)**: To prevent infinite scroll sync loops between the slider and the viewport, a **20px Position Guard** must be used. If the scroll target is within 20px of the current position, skip the scroll operation. Always use `behavior: 'auto'` for programmatic scroll sync to prevent event flooding.
- **Smart Preload (v1.7.6)**: Background downloading of the next episode must be triggered only after the user reaches **50% reading progress** (or scroll percentage) of the current episode to optimize network and server resources.
- **Merge-First Cloud Sync**: To prevent data loss across multiple devices/browsers, ALL history uploads MUST perform a 'Pull & Merge' before pushing back to the cloud.
  - ❌ WRONG: Uploading local history directly as a replacement.
  - ✅ CORRECT: Fetch remote history -> Merge with local based on `lastReadAt` -> Upload consolidated result.
- **Viewer Engine Stability**:
  - **Virtual Scroll**: Must use `aspect-ratio` to preserve layout height even when images are unmounted from DOM.
  - **Scroll Mode Exclusion**: Auto-crop (`clip-path`) must be disabled in scroll mode to maintain vertical continuity of webtoon content.
  - **RootMargin Expansion**: 고속 스크롤 대응을 위해 마진을 `3000px`로 확장.
  - **Dynamic Min-Height Calibration (v1.20.0)**: 스크롤 뷰어에서 이미지 로드 완료 시 `minHeight` 속성을 `auto`로 즉시 환원하여, 플레이스홀더 제약으로 인한 이미지 가로세로 비율 왜곡 및 찌그러짐 현상을 영구 차단한다.
- **Cinematic Design**: The viewer follows a glassmorphism aesthetic with subtle animations and a premium feel.

---

## 2. File Structure & Dependencies

### 2.1. Viewer (Vue 3 SPA)

`src/viewer/`

- `App.vue`: Root component, routing.
- `style.css`: Global CSS variables, theme system.
- `composables/`:
  - `useStore.js`: Global state singleton (History sync, settings persistence).
  - `useViewerInput.js`: Unified input controller.
  - `useVirtualScroll.js`: High-performance image rendering.
  - `useSpread.js`: Double-page spread logic.
  - `useAutoCrop.js`: Margin detection engine.

### 2.2. Core (Tampermonkey UserScript)

`src/core/`

- `main.js`: Entry point, site detection.
- `downloader.js`: Download queue, 4-tier policy, Fast Path.
- `parsers/`: Modular strategy-based parsers (Base, Toki, Factory).
- `network.js`: `GM_xmlhttpRequest` wrapper with timeout & chunk support.
- `ui.js`: LogBox, MenuModal, Setup UI.

### 2.3. GAS Server (Google Apps Script)

`google_app_script/TokiSync/`

- `Main.gs`: Entry points (`doPost`, `doGet`) and triggers.
- **`DriveAccessService.gs`**: v1.8.0 central gateway for all Drive API v3 operations. Modular abstraction for I/O, metadata, and search.
- `SyncService.gs`: History management, index handling.
- `UploadService.gs`: Resumable upload sessions.
- `View_LibraryService.gs`: Background index merging (`SweepMergeIndex`).

---

## 3. Naming & Data Standards

- **Google Drive Folders**: `[ID] Series Title`
- **Files**: `Number - Title.cbz` (or `.epub` for novels)
- **Universal CBZ**: Images in root folder, no subfolders, includes `ComicInfo.xml`.

---

## 4. Theme System Conventions

- **No hardcoded colors in viewer components.** All colors MUST use CSS theme variables.
  - ❌ WRONG: `bg-black/95`, `text-white`, `text-zinc-400`
  - ✅ CORRECT: `text-theme-text`, `text-theme-sub`, `text-theme-muted`, `hover:bg-theme-surface-hover`
- **Glass UI elements** (e.g., `.glass-controls`) must use `--t-glass-bg` and `--t-glass-border` CSS variables for both dark and light themes.

---

## 5. Development & Verification Protocol

### 5.1. Tech-Stack Specific AI Skill Usage

AI Agents MUST apply or be prompted with the appropriate expert skills corresponding to the current task.
(Source: <https://github.com/sickn33/antigravity-awesome-skills>)

- **Planning & Architecture**: `@[concise-planning]`, `@[wiki-architect]`
- **Frontend & Core Logic** (Vue 3, Vanilla JS, Tailwind): `@[javascript-pro]`, `@[tailwind-patterns]`, `@[frontend-design]`
- **Performance & Debugging** (Virtual Scroll, Dexie DB): `@[performance-engineer]`, `@[systematic-debugging]`
- **Security & Quality Audit**: `@[security-auditor]`, `@[vibe-code-auditor]`, `@[lint-and-validate]`

### 5.2. Audit & Verification

- **Logical Self-Audit**: Every code change must be preceded and followed by a self-audit.
  - Check for logical contradictions with existing project principles (Stateless GAS, etc.).
  - Identify potential edge cases (e.g., empty Drive folders, timeout scenarios).
  - Ensure cross-browser and mobile compatibility of UI changes.
- **sem Semantic Verification & Impact Analysis (v1.22.3+)**:
  - **Pre-change**: When planning edits to a function or class, run `sem impact <entity>` to identify potential side effects on other parts of the codebase.
  - **Post-change**: Run `sem diff` to verify that only the target structural logic changes are introduced, discarding cosmetic/formatting noise.
- **Verification Reporting**: The agent must report the outcome of its self-audit.
  - Include a summary of "What was verified" and "Potential risks" in the `documentation/reports/walkthrough.md` or final summary.
- **Atomic Changelog Protocol**: All technical changes MUST be recorded in `CHANGELOG.md` immediately upon completion of the sub-task, ensuring no history is lost.

---

## 6. Release & Deployment Protocol (3-Tier)

### 6.0. Branch Strategy
```
develop (Beta, vM.m.p-beta.N) → rc (RC, vM.m.p-rc.N) → main (Stable, vM.m.p)
```
- 자세한 규칙은 `AGENTS.md`의 Pre-Push Workflow 참조.
- gh-pages 배포 경로: `develop` → `/dev/`, `rc` → `/rc/`, `main`/tag → `/` (root)

### 6.1. GitHub Release Artifacts

**⚠️ 중요**: 공식 릴리즈 발행 및 자산 업로드 전, 반드시 **`npm run build`**를 실행하여 모든 모듈(Viewer, Core, GAS)의 최신 산출물을 생성해야 합니다.

GitHub 공식 릴리즈 발행 시, 자동 생성되는 소스 코드 외에 다음의 **빌드 산출물(Artifacts)**을 반드시 자산으로 포함해야 합니다:

1. **`tokiSync.user.js`**: 클라이언트가 브라우저에 즉시 설치/업데이트할 수 있는 최종 번들 유저스크립트.
2. **`TokiSync_Server_Bundle.gs`**: 서버 설치 및 복구가 용이하도록 모든 모듈이 병합된 최종 GAS 서버 코드.

### 6.2. Deployment

- **Viewer**: `npm run build:viewer` 수행 후 `docs/` 디렉토리 내용이 GitHub Pages를 통해 정상 배포되는지 확인합니다.
- **GAS**: 코드 변경 시 `clasp push`를 권장하며, 배포 설정 변경(Access Control 등) 필요 시 사용자 가이드를 동반해야 합니다.

---

### 7. 파서 설계 및 확장 규칙 (v1.20.0)

- **Controller-Worker IPC 수집 (v1.20.0)**: 보안 강화 도메인의 암호화 API 및 봇 감지 우회를 위해 `postMessage` 기반의 팝업 IPC 통신망을 기동하여 최종 렌더링된 소설/만화 데이터를 캡처하고, Shadow DOM 내 불필요한 style/script 노이즈가 제거된 클린 텍스트를 정제한다.
- **XOR Decryption (v1.20.0)**: 신형 복호화 사양에 대응하기 위해 JWT 토큰의 1부(XOR 키) 및 동적 Nonce를 자동 추출 및 디코딩하여 실시간 XOR 복호화 엔진에 적용한다.
- **Decoupling First**: 사이트별 DOM 구조 의존적인 모든 로직(목록 추출, 제목 파싱, 이미지 리스트 수집 등)은 반드시 `src/core/parsers/` 내의 파서 클래스에서 처리한다.
- **Inheritance Pattern**: 모든 파서는 `BaseParser`를 상속받아 인터페이스 일관성을 유지하며, 공통 로직(더미 이미지 필터, 제목 정규화 등)은 부모 클래스의 메서드를 재사용한다.
- **Dynamic LazyKey Tracking (v1.7.3)**: 사이트가 이미지 URL 속성명을 랜덤하게 변경하는 경우(안티 스크래핑), 파서는 소스 스크립트 정규식 매칭 및 이미지 속성 역추적(Backtracking)을 통해 실시간으로 키를 탐지해야 한다.
- **Heuristic Container Selection (v1.7.3)**: 본문 영역이 복수의 후보(`.view-padding` 등)로 파편화된 경우, 이미지 밀도(Density)가 가장 높은 요소를 주 컨테이너로 자동 선택하여 가짜/광고 영역 유입을 차단한다.
- **Singleton Factory**: 파서 인스턴스는 직접 생성하지 않고 `ParserFactory.getParser()`를 통해서만 호출하며, 이는 메모리 효율과 상태 일관성을 위해 싱글톤으로 관리한다.


---

## 8. Hybrid Multi-Agent Orchestration Protocol

프로젝트의 복잡성을 관리하고 코드 품질을 극대화하기 위해, 아래와 같은 멀티-모델 협업 체계를 기본 운영 원칙으로 채택한다.

### 8.1. Roles & Models

- **Main Agent (Planner)**: **Claude / Gemini Pro (High Effort)**
  - 고차원적 전략 수립, `task.md` 작성, 예외 상황에 대한 **재기획(Re-planning)** 담당.
- **Worker Agent (Coder)**: **Gemini Flash**
  - 메인 에이전트의 플랜에 따른 초고속 코드 구현 및 반복 작업 담당.
- **Auditor Agent (Validator)**: **Gemini 3 Pro (Low Effort)**
  - 독립적 코드 리뷰, 에지 케이스 분석, 보안 감사 및 **PASS/FAIL** 판정 담당.

### 8.2. Operational Loop

1. **Planning**: Main이 작업을 분석하고 상세 구현 계획(`task.md`)을 수립한다.
2. **Execution**: Worker가 계획에 따라 원자적 단위(Atomic Task)로 코드를 구현한다.
3. **Verification**: Auditor가 구현된 코드를 검토하고 리포트를 작성한다.
4. **Correction**: `FAIL` 발생 시, Worker가 직접 수정하지 않고 **Main이 재기획**한 후 업데이트된 지침에 따라 Worker가 재수정한다.

### 8.3. Continuity (Checkpointing)

- 모델 간 전환(Handoff) 및 세션 단절 시, 워크스페이스 내 **`.agent_checkpoint.md`**를 최우선 진실 소스로 활용하여 컨텍스트 무결성을 유지한다.
- 모든 에이전트는 작업 시작 전 반드시 해당 체크포인트와 `AI_AGENT_CONTEXT.md`를 필독해야 한다.

---

## 9. Graphify MCP Knowledge Graph Integration

- **MCP Server**: Graphify knowledge graph is available as `graphify` MCP tools.
- Use `graphify_query` to search the knowledge graph when you need to understand relationships between modules, identify cross-component dependencies, or find relevant code for a given concept.
- Use `shortest_path` to trace dependency chains between two modules.
- Use `god_nodes` to identify the most central/highly-connected abstractions in the system.
- The graph lives at `graphify-out/graph.json`. Run `python3 -m graphify.serve graphify-out/graph.json` to start the MCP server manually if needed.

### 9.1. MCP Server Configuration by Tool

| Tool | Config File | Notes |
|------|------------|-------|
| **opencode** | `opencode.json` (project root) | `type: "local"`, `command: ["python3", "-m", "graphify.serve", "graphify-out/graph.json"]` |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` | Add under `mcpServers.graphify` |
| **Antigravity IDE / Cursor / VS Code** | `.mcp.json` (project root) | Standard project-level MCP config. Antigravity/Antigravity IDE reads `.mcp.json` for MCP tool support. |
| **Any MCP client** | `python3 -m graphify.serve <path>/graphify-out/graph.json` | 직접 실행 후 stdio 또는 HTTP로 연결 |

### 9.2. `.mcp.json` format (for Cursor, VS Code, Antigravity IDE)

```json
{
  "mcpServers": {
    "graphify": {
      "command": "python3",
      "args": ["-m", "graphify.serve", "${workspaceFolder}/graphify-out/graph.json"]
    }
  }
}
```

### 9.3. Antigravity Skills 경로

Antigravity IDE/CLI 에서는 `~/.agents/skills/` 경로의 SKILL.md를 읽습니다. Graphify MCP는 스킬이 아닌 **프로토콜 레벨**이므로 `.mcp.json`에 설정해야 합니다. 별도 스킬 설치가 필요하면 `npx antigravity-awesome-skills --path ~/.agents/skills` 명령으로 설치 가능합니다.
