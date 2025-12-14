# TokiSync Project Rules & Memory

## Project Overview

**TokiSync** is an all-in-one solution for archiving webtoons/novels from sites like 'NewToki', 'ManaToki', 'BookToki' directly to **Google Drive** and managing/viewing them via a dedicated web dashboard (**TokiView**).

### 🛠 Core Architecture

1. **Client (Tampermonkey)**

   - **Loader**: Dynamically loads `Core` script via GitHub/CDN (Supports auto-update).
   - **Core**: Handles crawling, concurrent image downloading, compression (.cbz), and resumable upload to GAS.
   - **Features**: Captcha detection/pause, Background audio (keep-alive), Smart Sync (downloads missing episodes only).

2. **Server (Google Apps Script - TokiSync)**

   - **Role**: Google Drive Interface API.
   - **Func**: Receives chunked data from Client, saves to Drive, manages `info.json` metadata.

3. **Dashboard (Google Apps Script - TokiView)**
   - **Role**: Web App for viewing the collected library.
   - **Func**: High-speed loading via `library_index.json` caching/SSR, Search, and Viewer.

## Critical Memory Conditions

- **Language**: JavaScript (Google Apps Script), HTML
- **Communication**: Korean (as per global rules)
- **Commit Messages**: Korean (as per global rules)
- **Testing**: Run build tests before commits.

## Architecture Notes

- Client-driven architecture: API calls should carry necessary state (e.g., folderId).
- Tampermonkey script interacts with GAS backend.

## Deployment & Versioning Rules

### 🚀 Google Apps Script (Clasp) Workflow

This project uses `@google/clasp` for CLI-based development.

1.  **Pull**: `clasp pull` (Keep local consistent with remote if edited online)
2.  **Push**: `clasp push` (Upload local changes to GAS)
3.  **Deploy**: `clasp deploy -i [DeploymentID] -d "Version Description"` (Update Existing Deployment)
    - **IMPORTANT**: Always use `-i` to keep the URL consistent. Do NOT create new deployments unless necessary.
    - **Prod URL**: Always use the `exec` URL from the _Manage Deployments_ active version.

### 🏷 Versioning Strategy (SemVer)

We follow **Semantic Versioning 2.0.0** (`MAJOR.MINOR.PATCH`).

- **MAJOR**: Breaking changes (e.g., API Protocol change, re-auth required).
- **MINOR**: New features (e.g., Support for new site, new Dashboard UI).
- **PATCH**: Bug fixes, hotfixes.

#### 🏷 Versioning Strategy (CalVer for Beta)

- **Versioning**: strictly use `v3.0.0-beta.YYMMDD.NNNN` (e.g., `v3.0.0-beta.251212.0001`).
  - `YYMMDD`: Date of the release.
  - `NNNN`: 4-digit daily build sequence (0001, 0002, ...).
  - Do not add a suffix after the sequence.
  - This ensures version uniqueness and proper ordering in Tampermonkey.
  - Example: `v3.0.0-beta.251211`
  - If multiple updates/day: `v3.0.0-beta.251211.2`
- **Reason**: Avoids sorting ambiguity of `BETA1` vs `BETA10` in GitHub API.
- **Release**:
  1.  Update `update_history.md`.
  2.  Sync `Client` & `Server` version strings.
  3.  Git Tag & Push.

## Specific Constraints

<!-- Add further project-specific constraints below -->
