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
- `parser.js`: DOM analysis, image extraction.
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
- **Global theme state** is managed via `appTheme` (ref) and `toggleTheme` in `useStore.js`. Applied via `data-theme` attribute on `document.documentElement`. Do NOT create per-component theme states.
