# Core Module Handover Report (v1.2.2)

**Role:** Core Developer  
**Scope:** `src/core/*` (Integrated `downloader.js`, `gas.js`, `ui.js`, etc.)  
**Status:** **v1.2.2 Released** (Bug Fixes & Auto-Update)

---

## 🚀 Released Changes (v1.2.2)

### 1. Critical Bug Fixes (Completed)

- **Filename Logic (Split Policy):**
  - **Local Download:** `[ID] Title [1-100].cbz` (Added Range)
  - **GAS Upload:** `0001 - 1화.cbz` (Removed Series Title for clean Drive structure)
- **Title Parsing:**
  - Fixed redundant title bug (`255 - 255 화` -> `255 화`) via improved Regex.
- **Auto-Update:**
  - Added `@updateURL` & `@downloadURL` pointing to GitHub `main` branch.

### 2. Version Synchronization

- **UserScript:** `v1.2.2` (Header)
- **Internal Client:** `v1.2.2` (`gas.js` - `CLIENT_VERSION`)
- **Package:** `v1.2.2` (`package.json`)

---

## 🚨 Ongoing / Pending Tasks

### 1. [Optimization] Thumbnail Stability

- **Issue:** The `main` branch viewer handles thumbnails more stably than `v1.2.0+` despite the same GAS backend.
- **Plan:** Compare legacy vs current viewer code and port stability fixes (e.g., caching, pre-fetching strategies).
- **Status:** **Postponed** (Focus was on critical filename bugs).

---

## 🛠 Module Status Overview

### `src/core/downloader.js`

- **Status:** **Stable**
- **Updates:** Implemented conditional filename logic for Local vs GAS.

### `src/core/parser.js`

- **Status:** **Stable**
- **Updates:** Enhanced regex for cleaner title extraction.

### `src/core/gas.js`

- **Status:** **Stable**
- **Updates:** Updated `CLIENT_VERSION` to match release.

### `src/core/index.js`

- **Status:** **Stable**
- **Updates:** Handshake retry logic implemented (v1.2.1).

---

## 📝 Next Steps for Reviewer

1. **Verify Auto-Update:** Install v1.2.2 and check if Tampermonkey detects future updates.
2. **Thumbnail Investigation:** Resume the postponed stability task.
