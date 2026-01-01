# TokiSync v3.3.1 Installation Guide

This guide will help you perform a fresh installation of the TokiSync system (v3.3.1), which includes the **Google Apps Script (GAS) Server** and the **Client Script** (Tampermonkey).

## Prerequisites

1.  **Google Account**: Required for Google Drive and Google Apps Script.
2.  **Google Drive Folder**: Create a dedicated folder in your Google Drive (e.g., named "TokiSync_Library").
    - **Note the Folder ID**: This is the string of characters at the end of the URL when you open the folder (e.g., `1aBcDeFgHiJkLmNoPqRsTuVwXyZ`).

---

## Step 1: Set up Google Apps Script (Server)

The GAS Server handles file processing, uploading to Drive, and serving the Viewer content.

1.  Go to [script.google.com](https://script.google.com/).
2.  Click **"New Project"**.
3.  Name the project (e.g., "TokiSync Server v3").
4.  **Reference Code**:
    - Open the attached artifact: `gas_server_code.js`.
    - Copy **ALL** the code from that file.
5.  **Paste Code**:
    - In the GAS editor, open `Code.gs` (default file).
    - Delete any existing code.
    - Paste the copied code completely.
6.  **Enable Advanced Services** (Critical):
    - On the left sidebar, click **"Editor"** (< > icon) -> **"Services"** (+ icon).
    - Select **Google Drive API**.
    - Identifier: `Drive`.
    - Click **Add**.
7.  **Deploy**:
    - Click top-right **"Deploy"** > **"New deployment"**.
    - Click the gear icon (Settings) next to "Select type" > **"Web app"**.
    - **Description**: "v3.3.1".
    - **Execute as**: **Me** (your email).
    - **Who has access**: **Anyone** (Anyone with Google Account may also work, but "Anyone" is recommended to avoid login loops in the iframe).
    - Click **Deploy**.
    - **Authorize**: You will be asked to authorize the script.
      - Click "Review Permissions".
      - Choose your account.
      - You may see "App isn't verified" -> Click "Advanced" -> "Go to ... (unsafe)".
      - Click "Allow".
8.  **Copy URL**:
    - Copy the **Web App URL** (ends with `/exec`). You will need this for the client setup.

---

## Step 2: Set up Client (Tampermonkey)

1.  Make sure [Tampermonkey](https://www.tampermonkey.net/) is installed in your browser.
2.  **Install Script**:
    - Use the `tokiSyncScript.js` file from your workspace.
    - Or create a new script in Tampermonkey and copy-paste the content of `tokiSyncScript.js`.
3.  **Configure**:
    - Visit a supported site (e.g., Newtoki).
    - The script should load. If it's the first run, it might ask for permission or setup.
    - **Menu Setup**:
      - Click the Tampermonkey icon > TokiSync.
      - Select **"⚙️ 설정 (URL/FolderID)"**.
      - **Folder ID**: Enter the Drive Folder ID from Prerequisites.
      - **API URL**: Enter the Web App URL from Step 1.
      - **Dashboard URL**: (Optional) Enter the GitHub Pages Viewer URL if you have one deployed (e.g., `https://yourname.github.io/tokiSync/`).

---

## Step 3: Verify Installation

1.  **Sync Test**:
    - Go to a comic list page on Newtoki.
    - You should see status indicators (colored backgrounds) on list items once the script scans your Drive.
    - Click a "Download" button (if available) or use "One-time download" menu.
    - Monitor the **Status Box** (bottom right) for "Upload Complete".
2.  **Viewer Test**:
    - Open your Dashboard URL (Viewer).
    - If connected correctly, it should display your library.
    - Try opening a book to verify the new v3.3.1 Scroll Mode works (Double-tap at bottom, etc.).

## Troubleshooting

- **"ScriptError: Authorization is required"**: Re-deploy the GAS Web App and ensure you authorized it.
- **"Network Error"**: Check if the Web App URL is correct in the Tampermonkey settings (must end in `/exec`).
- **API Limit**: If uploads fail repeatedly, you may have hit Google's daily quota. Wait 24 hours.
