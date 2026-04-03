# TokiSync Project: AI Agent Context

This document is the **single source of truth (SSOT)** for the project's static blueprint—architecture, core design principles, and technical conventions. It serves as the foundation for the AI Agent's understanding of the system.

## 1. Project Identity & Architecture

- **Project Name**: TokiSync
- **Target**: Manga/Webtoon/Novel Synchronizer & Viewer
- **Architecture**:
  - **Backend**: Google Apps Script (Stateless API).
  - **Bridge**: Tampermonkey UserScript (Core logic, DOM Scraping, `GM_xmlhttpRequest` for Direct Drive Access).
  - **Frontend (Viewer)**: Vue 3 (Composition API) + Tailwind CSS SPA, hosted on GitHub Pages.
- **Storage**: Dexie.js for offline viewer cache (IndexedDB).

### Core Design Principles

- **Stateless GAS**: The Google Apps Script backend must remain stateless.
  Do NOT use `PropertiesService` for user settings; everything must be payload-driven.
- **Direct Drive Access**: Use `GM_xmlhttpRequest` (via Tampermonkey) to bypass GAS 6-minute execution limits and CORS restrictions.
- **Single Controller Rule**: All viewer input (mouse, touch, keyboard, wheel) MUST be handled through a single composable: `useViewerInput.js`.
  - DO NOT split input handling across component event handlers and composables.
  - Mouse clicks: Use `@mousedown.left` attached directly to `viewer-container`.
  - Touch: Attach `touchstart`/`touchend` directly to `viewer-container`. Use `lastTouch` timestamp (+300ms) to prevent ghost events after touch.
  - `nav-zone` div pattern is **ABOLISHED**. Do not re-introduce it.
- **Merge-First Cloud Sync**: To prevent data loss across multiple devices/browsers, ALL history uploads MUST perform a 'Pull & Merge' before pushing back to the cloud.
  - ❌ WRONG: Uploading local history directly as a replacement.
  - ✅ CORRECT: Fetch remote history -> Merge with local based on `lastReadAt` -> Upload consolidated result.
- **Viewer Engine Stability**:
  - **Virtual Scroll**: Must use `aspect-ratio` to preserve layout height even when images are unmounted from DOM.
  - **Scroll Mode Exclusion**: Auto-crop (`clip-path`) must be disabled in scroll mode to maintain vertical continuity of webtoon content.
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
- **Verification Reporting**: The agent must report the outcome of its self-audit.
  - Include a summary of "What was verified" and "Potential risks" in the `walkthrough.md` or final summary.
- **Atomic Changelog Protocol**: All technical changes MUST be recorded in `CHANGELOG.md` immediately upon completion of the sub-task, ensuring no history is lost.

---

## 6. Release & Deployment Protocol

### 6.1. GitHub Release Artifacts

**⚠️ 중요**: 공식 릴리즈 발행 및 자산 업로드 전, 반드시 **`npm run build`**를 실행하여 모든 모듈(Viewer, Core, GAS)의 최신 산출물을 생성해야 합니다.

GitHub 공식 릴리즈 발행 시, 자동 생성되는 소스 코드 외에 다음의 **빌드 산출물(Artifacts)**을 반드시 자산으로 포함해야 합니다:

1. **`tokiSync.user.js`**: 클라이언트가 브라우저에 즉시 설치/업데이트할 수 있는 최종 번들 유저스크립트.
2. **`TokiSync_Server_Bundle.gs`**: 서버 설치 및 복구가 용이하도록 모든 모듈이 병합된 최종 GAS 서버 코드.

### 6.2. Deployment

- **Viewer**: `npm run build:viewer` 수행 후 `docs/` 디렉토리 내용이 GitHub Pages를 통해 정상 배포되는지 확인합니다.
- **GAS**: 코드 변경 시 `clasp push`를 권장하며, 배포 설정 변경(Access Control 등) 필요 시 사용자 가이드를 동반해야 합니다.

---

### 7. 파서 설계 및 확장 규칙 (v1.7.2)

- **Decoupling First**: 사이트별 DOM 구조 의존적인 모든 로직(목록 추출, 제목 파싱, 이미지 리스트 수집 등)은 반드시 `src/core/parsers/` 내의 파서 클래스에서 처리한다.
- **Inheritance Pattern**: 모든 파서는 `BaseParser`를 상속받아 인터페이스 일관성을 유지하며, 공통 로직(더미 이미지 필터, 제목 정규화 등)은 부모 클래스의 메서드를 재사용한다.
- **Singleton Factory**: 파서 인스턴스는 직접 생성하지 않고 `ParserFactory.getParser()`를 통해서만 호출하며, 이는 메모리 효율과 상태 일관성을 위해 싱글톤으로 관리한다.
- **Unified Title Source**: 시리즈 제목 및 폴더명 생성 로직은 `BaseParser.getFormattedTitle()`이 단일 진실 소스(SSOT)가 되며, `downloader.js`와 `main.js`는 이를 호출하여 사용한다.
