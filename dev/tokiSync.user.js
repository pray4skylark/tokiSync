// ==UserScript==
// @name         TokiSync (Link to Drive)
// @namespace    http://tampermonkey.net/
// @version      1.8.3
// @description  Toki series sites -> Google Drive syncing tool (Bundled)
// @author       pray4skylark
// @updateURL    https://pray4skylark.github.io/tokiSync/tokiSync.user.js
// @downloadURL  https://pray4skylark.github.io/tokiSync/tokiSync.user.js
// @match        https://*.com/webtoon/*
// @match        https://*.com/novel/*
// @match        https://*.com/manhwa/*
// @match        https://*.net/comic/*
// @match        https://script.google.com/*
// @match        https://*.github.io/tokiSync/*
// @match        https://pray4skylark.github.io/tokiSync/*
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @icon         https://github.com/user-attachments/assets/99f5bb36-4ef8-40cc-8ae5-e3bf1c7952ad
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      pray4skylark.github.io
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.js
// @run-at       document-end
// @license      MIT
// ==/UserScript==

/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 209:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Cv: function() { return /* binding */ stopSilentAudio; },
/* harmony export */   S2: function() { return /* binding */ isAudioRunning; },
/* harmony export */   yS: function() { return /* binding */ startSilentAudio; }
/* harmony export */ });
/**
 * Anti-Sleep Module
 * Prevents browser tab throttling by playing silent audio
 */

let audioContext = null;
let audioEl = null;
let oscillator = null;

function startSilentAudio() {
    if (audioContext && audioContext.state === 'running') {
        console.log('[Anti-Sleep] Already running');
        return;
    }
    
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const dest = audioContext.createMediaStreamDestination();
        const gain = audioContext.createGain();
        
        oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 1; // 1Hz (Inaudible)
        oscillator.type = 'sine';
        gain.gain.value = 0.001; // Near silence
        
        oscillator.connect(gain);
        gain.connect(dest);
        oscillator.start();
        
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.style.display = "none";
            document.body.appendChild(audioEl);
        }
        
        audioEl.srcObject = dest.stream;
        audioEl.play()
            .then(() => console.log('🔊 [Anti-Sleep] Audio started successfully'))
            .catch(e => {
                console.warn('🚫 [Anti-Sleep] Autoplay blocked:', e);
                throw e; // Re-throw to let caller handle
            });
            
    } catch (e) {
        console.error('[Anti-Sleep] Failed to start:', e);
        throw e;
    }
}

function stopSilentAudio() {
    try {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }
        
        if (audioEl) {
            audioEl.pause();
            audioEl.srcObject = null;
        }
        
        if (audioContext) {
            audioContext.close().then(() => {
                audioContext = null;
                console.log('🔇 [Anti-Sleep] Audio stopped');
            });
        }
    } catch (e) {
        console.error('[Anti-Sleep] Failed to stop:', e);
    }
}

function isAudioRunning() {
    return audioContext && audioContext.state === 'running';
}


/***/ }),

/***/ 391:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   GA: function() { return /* binding */ fetchHistoryDirect; },
/* harmony export */   OS: function() { return /* binding */ checkSingleHistoryDirect; },
/* harmony export */   Py: function() { return /* binding */ getOAuthToken; },
/* harmony export */   r9: function() { return /* binding */ uploadDirect; }
/* harmony export */ });
/* harmony import */ var _config_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(899);
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(963);
/**
 * Direct Drive Access Module
 * Bypasses GAS relay for high-speed uploads using GM_xmlhttpRequest
 */




let cachedToken = null;
let tokenExpiry = 0;

/**
 * Fetches OAuth token from GAS server
 * @returns {Promise<string>} Access token
 */
async function fetchToken() {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    
    console.log('[DirectUpload] Fetching token from GAS...');
    console.log('[DirectUpload] GAS URL:', config.gasUrl);
    
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: config.gasUrl,
            data: JSON.stringify({
                folderId: config.folderId,
                type: 'view_get_token',
                apiKey: config.apiKey
            }),
            headers: { 'Content-Type': 'text/plain' },
            timeout: 30000,
            onload: (response) => {
                console.log('[DirectUpload] Token response status:', response.status);
                console.log('[DirectUpload] Token response text:', response.responseText);
                
                try {
                    const result = JSON.parse(response.responseText);
                    console.log('[DirectUpload] Parsed result:', result);
                    
                    if (result.status === 'success') {
                        console.log('[DirectUpload] Token received successfully');
                        resolve(result.body.token);
                    } else {
                        console.error('[DirectUpload] Token fetch failed:', result.error);
                        console.error('[DirectUpload] Debug logs:', result.logs);
                        _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().error(`Token fetch failed: ${result.error}`, 'Network:Auth');
                        reject(new Error(result.error || 'Token fetch failed'));
                    }
                } catch (e) {
                    console.error('[DirectUpload] JSON parse error:', e);
                    console.error('[DirectUpload] Raw response:', response.responseText);
                    reject(new Error(`Token parse error: ${e.message}`));
                }
            },
            onerror: (error) => {
                console.error('[DirectUpload] Request error:', error);
                _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().error('Token request network error', 'Network:Auth');
                reject(new Error('Token request failed'));
            },
            ontimeout: () => {
                console.error('[DirectUpload] Token request timed out (30s)');
                _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().error('Token request timed out (30s)', 'Network:Auth');
                reject(new Error('[DirectUpload] 토큰 요청 타임아웃 (30초)'));
            }
        });
    });
}

/**
 * Gets OAuth token with caching (1 hour TTL)
 * @returns {Promise<string>} Access token
 */
async function getToken() {
    const now = Date.now();
    
    // Return cached token if still valid (with 5min safety margin)
    if (cachedToken && tokenExpiry > now + 300000) {
        console.log('[DirectUpload] Using cached token');
        return cachedToken;
    }
    
    console.log('[DirectUpload] Fetching new token...');
    cachedToken = await fetchToken();
    tokenExpiry = now + 3600000; // 1 hour
    
    return cachedToken;
}

/**
 * Finds or creates a folder in Google Drive with category support
 * Mirrors GAS server's getOrCreateSeriesFolder logic:
 * 1. Check root for legacy folders
 * 2. Get/Create category folder (Webtoon/Novel/Manga)
 * 3. Get/Create series folder in category
 * 
 * @param {string} folderName - Series folder name (e.g. "[123] Title")
 * @param {string} parentId - Parent folder ID (root)
 * @param {string} token - OAuth token
 * @param {string} category - Category name ("Webtoon", "Novel", or "Manga")
 * @returns {Promise<string>} Series folder ID
 */
async function getOrCreateFolder(folderName, parentId, token, category = 'Webtoon') {
    // 1. Check for legacy folder in root (migration compatibility)
    const legacySearchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=name='${encodeURIComponent(folderName)}' and '${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'` +
        `&fields=files(id,name)`;
    
    const legacyResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: legacySearchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000,
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 레거시 폴더 검색 타임아웃 (30초)'))
        });
    });
    
    if (legacyResult.files && legacyResult.files.length > 0) {
        console.log(`[DirectUpload] ♻️ Found legacy folder in root: ${folderName}`);
        return legacyResult.files[0].id;
    }
    
    // 2. Get or create category folder
    const categoryName = category || 'Webtoon';
    const categorySearchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=name='${categoryName}' and '${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'` +
        `&fields=files(id,name)`;
    
    const categoryResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: categorySearchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000,
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 카테고리 폴더 검색 타임아웃 (30초)'))
        });
    });
    
    let categoryFolderId;
    if (categoryResult.files && categoryResult.files.length > 0) {
        categoryFolderId = categoryResult.files[0].id;
        console.log(`[DirectUpload] 📂 Category folder found: ${categoryName}`);
    } else {
        // Create category folder
        console.log(`[DirectUpload] 📂 Creating category folder: ${categoryName}`);
        const createCategoryResult = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.googleapis.com/drive/v3/files',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    name: categoryName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [parentId]
                }),
                timeout: 30000,
                onload: (res) => {
                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('[DirectUpload] 카테고리 폴더 생성 타임아웃 (30초)'))
            });
        });
        categoryFolderId = createCategoryResult.id;
    }
    
    // 3. Get or create series folder in category
    // [v1.4.0 Fix] Search by ID prefix "[12345]" instead of full name to handle title changes
    // folderName format: "[12345] Title"
    const idMatch = folderName.match(/^\[\d+\]/);
    const idPrefix = idMatch ? idMatch[0] : null;
    
    let queryPart = "";
    if (idPrefix) {
        // Search for folders containing "[12345]"
        queryPart = `name contains '${idPrefix}'`;
    } else {
        // Fallback: Exact match
        queryPart = `name = '${folderName.replace(/'/g, "\\'")}'`; 
    }

    const seriesSearchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=${queryPart} and '${categoryFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'` +
        `&fields=files(id,name)`;
    
    const seriesResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: seriesSearchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000,
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 시리즈 폴더 검색 타임아웃 (30초)'))
        });
    });
    
    // Filter results to ensure it starts with the ID (double check)
    let foundFolder = null;
    if (seriesResult.files && seriesResult.files.length > 0) {
        if (idPrefix) {
            // Find the first folder that STARTS with the ID
            foundFolder = seriesResult.files.find(f => f.name.startsWith(idPrefix));
        } else {
            foundFolder = seriesResult.files[0];
        }
    }

    if (foundFolder) {
        console.log(`[DirectUpload] Folder found: ${foundFolder.name} (ID: ${foundFolder.id})`);
        return foundFolder.id;
    }
    
    // Create series folder
    console.log(`[DirectUpload] Creating series folder: ${folderName} in ${categoryName}`);
    const createResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://www.googleapis.com/drive/v3/files',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [categoryFolderId]
            }),
            timeout: 30000,
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 시리즈 폴더 생성 타임아웃 (30초)'))
        });
    });
    
    return createResult.id;
}

/**
 * Finds or creates the centralized '_Thumbnails' folder
 */
async function getOrCreateThumbnailFolder(token, parentId) {
    const thumbName = '_Thumbnails';
    const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=name='${thumbName}' and '${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'` +
        `&fields=files(id,name)`;
    
    const result = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: searchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000,
            onload: (res) => resolve(JSON.parse(res.responseText)),
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 썸네일 폴더 검색 타임아웃 (30초)'))
        });
    });

    if (result.files && result.files.length > 0) {
        return result.files[0].id; // Found
    }

    // Create
    console.log(`[DirectUpload] Creating folder: ${thumbName}`);
    const createResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://www.googleapis.com/drive/v3/files',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                name: thumbName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            }),
            timeout: 30000,
            onload: (res) => resolve(JSON.parse(res.responseText)),
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 썸네일 폴더 생성 타임아웃 (30초)'))
        });
    });
    return createResult.id;
}

/**
 * Sends data in chunks to a Google Drive Resumable Upload session
 */
async function sendResumableChunks(uploadUrl, blob, token, fileName) {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB (Minimum for Drive is 256KB, 5MB is standard)
    const totalSize = blob.size;
    let start = 0;
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();

    while (start < totalSize) {
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunk = blob.slice(start, end);
        const contentRange = `bytes ${start}-${end - 1}/${totalSize}`;
        
        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'PUT',
                url: uploadUrl,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Range': contentRange,
                    'Content-Type': blob.type || 'application/octet-stream'
                },
                data: chunk,
                binary: true,
                timeout: 300000, // 5 minutes per chunk
                onload: (res) => {
                    if (res.status === 308) {
                        // Resume Incomplete (Standard Response for chunks)
                        resolve();
                    } else if (res.status >= 200 && res.status < 300) {
                        // Done (Final chunk)
                        resolve();
                    } else {
                        reject(new Error(`Chunk upload failed: ${res.status} ${res.responseText}`));
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error(`Chunk upload timed out: ${contentRange}`))
            });
        });
        
        start = end;
        const progress = Math.min(100, Math.floor((start / totalSize) * 100));
        console.log(`[DirectUpload] ${fileName} -> ${progress}% (${start}/${totalSize})`);
    }
}

/**
 * Uploads file directly to Google Drive using Resumable Upload (5MB Chunks)
 */
async function uploadDirect(blob, folderName, fileName, metadata = {}) {
    try {
        console.log(`[DirectUpload] Preparing: ${fileName} (${blob.size} bytes)`);
        
        const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
        const token = await getToken();
        const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();
        
        // Determine category
        const category = metadata.category || (fileName.endsWith('.epub') ? 'Novel' : 'Webtoon');
        
        // 1. Get Series Folder ID
        const seriesFolderId = await getOrCreateFolder(folderName, config.folderId, token, category);
        
        let targetFolderId = seriesFolderId;
        let finalFileName = fileName;

        // 2. [v1.4.0] Centralized Thumbnail Logic
        if (fileName === 'cover.jpg' || fileName === 'Cover.jpg') {
            const idMatch = folderName.match(/^\[(\d+)\]/);
            if (idMatch) {
                const seriesId = idMatch[1];
                finalFileName = `${seriesId}.jpg`;
                targetFolderId = await getOrCreateThumbnailFolder(token, config.folderId);
            }
        }

        // 3. Search for existing file to decide POST (New) or PATCH (Update)
        let existingFileId = null;
        try {
            const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
                `q=name='${finalFileName}' and '${targetFolderId}' in parents and trashed=false` +
                `&fields=files(id,name)`;
            
            const searchRes = await new Promise((res, rej) => {
                GM_xmlhttpRequest({
                    method: 'GET', url: searchUrl,
                    headers: { 'Authorization': `Bearer ${token}` },
                    timeout: 30000,
                    onload: (r) => res(JSON.parse(r.responseText)),
                    onerror: rej
                });
            });
            
            if (searchRes.files && searchRes.files.length > 0) {
                existingFileId = searchRes.files[0].id;
                console.log(`[DirectUpload] Existing file found: ${existingFileId} (Mode: UPDATE)`);
            }
        } catch (searchErr) {
            console.warn('[DirectUpload] Existing file check failed:', searchErr);
        }

        // 4. Initialize Resumable Session
        let uploadUrl = "";
        const sessionMetadata = {
            name: finalFileName,
            parents: existingFileId ? undefined : [targetFolderId]
        };

        const sessionUrl = existingFileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=resumable`
            : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`;

        uploadUrl = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: existingFileId ? 'PATCH' : 'POST',
                url: sessionUrl,
                anonymous: true, // Bypass CORS Origin header to ensure Location header is visible
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': blob.type || 'application/octet-stream',
                    'X-Upload-Content-Length': blob.size.toString()
                },
                data: JSON.stringify(sessionMetadata),
                timeout: 30000,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        const locationMatch = res.responseHeaders.match(/location:\s*([^\r\n]+)/i);
                        const uploadIdMatch = res.responseHeaders.match(/x-guploader-uploadid:\s*([^\r\n]+)/i);
                        
                        if (locationMatch && locationMatch[1]) {
                            resolve(locationMatch[1].trim());
                        } else if (uploadIdMatch && uploadIdMatch[1]) {
                            // Fallback: Manually build URI if Location is stripped by CORS
                            const sessionUri = new URL(sessionUrl);
                            sessionUri.searchParams.set('upload_id', uploadIdMatch[1].trim());
                            resolve(sessionUri.toString());
                        } else {
                            console.error('[DirectUpload] Response Headers:', res.responseHeaders);
                            console.error('[DirectUpload] Response Body:', res.responseText);
                            reject(new Error(`Failed to extract session URL. Headers: ${res.responseHeaders}`));
                        }
                    } else {
                        reject(new Error(`Session init failed with status: ${res.status}`));
                    }
                },
                onerror: reject
            });
        });

        // 5. Send chunks
        await sendResumableChunks(uploadUrl, blob, token, finalFileName);
        console.log(`[DirectUpload] ✅ Upload successful: ${finalFileName}`);
        return;

    } catch (error) {
        console.error(`[DirectUpload] Error:`, error);
        _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().error(`[DirectUpload] ${error.message}`, 'Network:Upload');
        throw error;
    }
}

// Export helper for main.js migration
const getOAuthToken = getToken;

/**
 * [v1.7.4] Direct History Fetch with Size Heuristic
 * Bypasses GAS relay and directly queries the Google Drive API for the series folder.
 * Automatically filters out corrupted/incomplete files using the `(Max + Min) / 2 * 0.5` heuristic.
 * 
 * @param {string} seriesTitle 
 * @param {string} category 
 * @returns {Promise<{success: boolean, folderId: string|null, data: string[]}>} Object with valid episode IDs
 */
async function fetchHistoryDirect(seriesTitle, category = 'Webtoon') {
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!config.folderId) return { success: false, folderId: null, data: [] };

    let currentSeriesFolderId = null;

    try {
        console.log(`[DirectHistory] Fetching history for: ${seriesTitle} (${category})`);
        const token = await getToken();
        
        // Find the Series Folder ID
        currentSeriesFolderId = await getOrCreateFolder(seriesTitle, config.folderId, token, category);
        
        if (!currentSeriesFolderId) {
            console.log(`[DirectHistory] Series folder not found or created.`);
            return { success: true, folderId: null, data: [] };
        }

        const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
            `q='${currentSeriesFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'` +
            `&fields=files(id,name,size)` +
            `&pageSize=1000`;
            
        const result = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: searchUrl,
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 30000,
                onload: (res) => {
                    try { resolve(JSON.parse(res.responseText)); } 
                    catch (e) { reject(e); }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('[DirectHistory] Timeout'))
            });
        });

        if (!result.files || result.files.length === 0) {
            console.log(`[DirectHistory] No files found in folder.`);
            return { success: true, folderId: currentSeriesFolderId, data: [] };
        }

        const fileInfos = [];
        let maxSize = 0;
        let minSize = Infinity;

        result.files.forEach(file => {
            const match = file.name.match(/^(\d+)/);
            if (!match) return; 
            
            const episodeNum = match[1];
            const sizeBytes = parseInt(file.size || "0", 10); 
            
            if (sizeBytes > 0) {
                if (sizeBytes > maxSize) maxSize = sizeBytes;
                if (sizeBytes < minSize) minSize = sizeBytes;
            }

            fileInfos.push({
                num: episodeNum,
                name: file.name,
                size: sizeBytes
            });
        });

        if (fileInfos.length === 0) return { success: true, folderId: currentSeriesFolderId, data: [] };

        let threshold = 0;
        if (maxSize > 0 && fileInfos.length > 1) {
            const ratio = (config.smartSkipRatio !== undefined ? config.smartSkipRatio : 50) / 100;
            threshold = maxSize * ratio;
            logger.log(`[SmartSkip] 용량 분석 완료 - Max: ${(maxSize/1024/1024).toFixed(1)}MB, 통과 기준: ${config.smartSkipRatio || 50}% (${(threshold/1024/1024).toFixed(1)}MB 이상)`);
        }

        const validEpisodes = [];
        const ignoredEpisodes = [];

        fileInfos.forEach(info => {
            if (info.size >= threshold) {
                validEpisodes.push(info.num);
            } else {
                ignoredEpisodes.push(info.name);
            }
        });

        if (ignoredEpisodes.length > 0) {
            logger.warn(`[SmartSkip] ⚠️ 용량 미달(손상 의심)로 무시된 파일 ${ignoredEpisodes.length}개 (재다운로드 됨): \n - ${ignoredEpisodes.slice(0, 3).join('\n - ')}${ignoredEpisodes.length > 3 ? '\n - ...' : ''}`);
        }

        console.log(`[DirectHistory] Final valid episodes: ${validEpisodes.length}`);
        return { 
            success: true, 
            folderId: currentSeriesFolderId, 
            data: [...new Set(validEpisodes)].sort((a,b) => parseInt(a) - parseInt(b))
        };

    } catch (err) {
        console.error(`[DirectHistory] Failed:`, err);
        logger.warn(`기록 전체 조회 실패(플래그 활성화됨): ${err.message}`, 'Network:History');
        return { success: false, folderId: currentSeriesFolderId, data: [] };
    }
}

/**
 * [v1.7.4] Targeted Single Episode Check
 * Used as a fallback when fetchHistoryDirect fails (e.g. timeout on huge folders).
 * 
 * @param {string} folderId 
 * @param {string} episodeNumStr 
 * @returns {Promise<boolean>} True if the episode file already exists
 */
async function checkSingleHistoryDirect(folderId, episodeNumStr) {
    if (!folderId) return false;
    
    try {
        const token = await getToken();
        // Since we don't know the full exact title, we query for the number.
        // Google Drive API tokenizes queries, so querying for the number works.
        const query = `name contains '${episodeNumStr}'`;
        
        const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
            `q=${encodeURIComponent(query)} and '${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'` +
            `&fields=files(id,size,name)` +
            `&pageSize=10`; // Safe margin if multiple files contain the number
            
        const result = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: searchUrl,
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 5000,
                onload: (res) => {
                    try { resolve(JSON.parse(res.responseText)); } 
                    catch (e) { reject(e); }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Timeout'))
            });
        });

        if (result.files && result.files.length > 0) {
            // Strict filter clientside: filename must start with the exact episode number.
            // Because 'name contains 1' might also match '10', '11' or other text.
            const file = result.files.find(f => {
                const match = f.name.match(/^(\d+)/);
                return match && parseInt(match[1], 10) === parseInt(episodeNumStr, 10);
            });
            if (file && parseInt(file.size || "0", 10) > 1000) { // arbitrary small size check (1KB)
                return true;
            }
        }
    } catch (e) {
        console.warn(`[SingleCheck] Error checking ${episodeNumStr}:`, e);
    }
    return false;
}



/***/ }),

/***/ 488:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   B0: function() { return /* binding */ getBooksByCacheId; },
/* harmony export */   Jb: function() { return /* binding */ getMergeIndexFragment; },
/* harmony export */   Ny: function() { return /* binding */ fetchHistory; },
/* harmony export */   fA: function() { return /* binding */ initUpdateUploadViaGASRelay; },
/* harmony export */   jz: function() { return /* binding */ refreshCacheAfterUpload; },
/* harmony export */   yv: function() { return /* binding */ uploadToGAS; }
/* harmony export */ });
/* harmony import */ var _config_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(899);
/* harmony import */ var _network_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(391);
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(963);




function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk_size = 0x8000; // 32KB
    for (let i = 0; i < bytes.length; i += chunk_size) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size));
    }
    return window.btoa(binary);
}

/**
 * Uploads a Blob to Google Drive via Direct Access (primary) or GAS Relay (fallback)
 * @param {Blob} blob File content
 * @param {string} folderName Target folder name (e.g. "[123] Title")
 * @param {string} fileName Target file name (e.g. "[123] Title.zip")
 */
async function uploadToGAS(blob, folderName, fileName, options = {}) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) throw new Error("GAS 설정이 누락되었습니다. 메뉴에서 설정을 완료해주세요.");
    
    // Try Direct Upload first
    try {
        console.log('[Upload] Attempting Direct Drive API upload...');
        await (0,_network_js__WEBPACK_IMPORTED_MODULE_1__/* .uploadDirect */ .r9)(blob, folderName, fileName, options);
        console.log('[Upload] ✅ Direct upload succeeded');
        return; // Success!
    } catch (directError) {
        console.warn('[Upload] ⚠️  Direct upload failed, falling back to GAS relay:', directError.message);
        _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().warn('Direct 업로드 실패 → GAS 릴레이 폴백: ' + directError.message + ' (' + fileName + ')', 'GAS:Upload');
    }
    
    // Fallback to GAS Relay
    console.log('[Upload] Using GAS relay fallback...');
    await uploadViaGASRelay(blob, folderName, fileName, options);
}

/**
 * 업로드 완료 후 GAS의 _toki_cache.json을 갱신합니다 (비동기, fire-and-forget)
 * 에피소드 c30치 다운로드 완료 후 한 번만 호출하세요.
 */
async function refreshCacheAfterUpload(folderName, category = 'Unknown', metadata = {}) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!config.gasUrl || !config.folderId) return;
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();
    console.log(`[Cache] 업로드 완료 → Drive 캐시 갱신 요청 (${folderName})`);
    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: config.gasUrl,
            data: JSON.stringify({
                type: 'view_update_cache',
                folderId: config.folderId,
                folderName,
                category,
                metadata, // [v1.7.0] Pass full metadata
                apiKey: config.apiKey,
                protocolVersion: 3,
            }),
            headers: { 'Content-Type': 'text/plain' },
            timeout: 30000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    console.log('[Cache] 갱신 요청 완료. 병합 파편 생성됨:', json.body);
                } catch (e) {
                    console.log('[Cache] 갱신 완료 응답 수신 (상세없음)');
                }
                resolve();
            },
            onerror: () => {
                logger.warn(`캐시 갱신 네트워크 오류 (${folderName}) — 다음 실행 시 자동 복구됨`, 'GAS:Cache');
                resolve();
            },
            ontimeout: () => {
                logger.warn(`캐시 갱신 타임아웃 30초 (${folderName}) — 스킬폭 포함 가능`, 'GAS:Cache');
                resolve();
            },
        });
    });
}

/**
 * Legacy GAS Relay Upload (Fallback)
 * @param {Blob} blob File content
 * @param {string} folderName Target folder name
 * @param {string} fileName Target file name
 */
async function uploadViaGASRelay(blob, folderName, fileName, options = {}) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) throw new Error("GAS 설정이 누락되었습니다. 메뉴에서 설정을 완료해주세요.");
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();
    
    // Constants
    const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB
    const CLIENT_VERSION = "1.2.2";
    const totalSize = blob.size;
    let uploadUrl = "";

    console.log(`[GAS] 업로드 초기화 중... (${fileName})`);
    
    // Determine Category
    // Default to Webtoon if not provided
    const category = options.category || (fileName.endsWith('.epub') ? 'Novel' : 'Webtoon');

    // 1. Init Session
    await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST", 
            url: config.gasUrl,
            data: JSON.stringify({ 
                folderId: config.folderId, 
                type: "init", 
                protocolVersion: 3, 
                clientVersion: CLIENT_VERSION, 
                folderName: folderName, 
                fileName: fileName,
                category: category,
                apiKey: config.apiKey
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 30000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') { 
                        uploadUrl = (typeof json.body === 'object') ? json.body.uploadUrl : json.body;
                        resolve(); 
                    } else {
                        logger.critical(`GAS 릴레이 세션 초기화 실패: ${json.body || 'Init failed'} (${fileName})`, 'GAS:Relay');
                        reject(new Error(json.body || "Init failed"));
                    }
                } catch (e) { 
                    logger.critical(`GAS 서버 응답 파싱 실패 (Init): ${res.responseText?.substring(0, 80)}`, 'GAS:Relay');
                    reject(new Error("GAS 응답 오류(Init): " + res.responseText)); 
                }
            },
            onerror: (e) => {
                logger.critical(`GAS 릴레이 네트워크 오류 (Init) — ${fileName}`, 'GAS:Relay');
                reject(new Error("네트워크 오류(Init)"));
            },
            ontimeout: () => {
                logger.critical(`GAS 릴레이 세션 초기화 타임아웃 (30초) — ${fileName}`, 'GAS:Relay');
                reject(new Error("[GAS] 업로드 초기화 타임아웃 (30초)"));
            }
        });
    });

    console.log(`[GAS] 세션 생성 완료. 업로드 시작...`);

    // 2. Chunk Upload Loop
    let start = 0;
    const buffer = await blob.arrayBuffer();
    
    while (start < totalSize) {
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunkBuffer = buffer.slice(start, end);
        const chunkBase64 = arrayBufferToBase64(chunkBuffer);
        const percentage = Math.floor((end / totalSize) * 100);
        
        console.log(`[GAS] 전송 중... ${percentage}% (${start} ~ ${end} / ${totalSize})`);

        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", 
                url: config.gasUrl,
                data: JSON.stringify({ 
                    folderId: config.folderId, 
                    type: "upload", 
                    clientVersion: CLIENT_VERSION, 
                    uploadUrl: uploadUrl, 
                    chunkData: chunkBase64, 
                    start: start, end: end, total: totalSize,
                    apiKey: config.apiKey
                }),
                headers: { "Content-Type": "text/plain" },
                timeout: 300000,
                onload: (res) => {
                    try { 
                        const json = JSON.parse(res.responseText); 
                        if (json.status === 'success') resolve(); 
                        else {
                            logger.critical(`GAS 청크 업로드 실패: ${json.body || 'Upload failed'} (${start}~${end})`, 'GAS:Relay');
                            reject(new Error(json.body || "Upload failed")); 
                        }
                    } catch (e) { 
                        logger.critical(`GAS 청크 응답 파싱 실패 (${start}~${end})`, 'GAS:Relay');
                        reject(new Error("GAS 응답 오류(Upload): " + res.responseText)); 
                    }
                },
                onerror: (e) => {
                    logger.critical(`GAS 청크 네트워크 오류 (${start}~${end} / ${totalSize})`, 'GAS:Relay');
                    reject(new Error("네트워크 오류(Upload)"));
                },
                ontimeout: () => {
                    logger.critical(`GAS 청크 타임아웃 5분 (${start}~${end} / ${totalSize})`, 'GAS:Relay');
                    reject(new Error(`[GAS] 청크 업로드 타임아웃 (5분): ${start}~${end}`));
                }
            });
        });
        
        start = end;
    }

    console.log(`[GAS] 업로드 완료!`);
}

/**
 * Fetch download history from GAS
 * @param {string} seriesTitle
 * @param {string} category 
 * @returns {Promise<string[]>} List of completed episode IDs
 */
async function fetchHistory(seriesTitle, category = 'Webtoon') {
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) return [];
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();

    console.log(`[GAS] 다운로드 기록 조회 중... (${seriesTitle})`);

    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: config.gasUrl,
            data: JSON.stringify({
                type: "check_history",
                folderId: config.folderId,
                folderName: seriesTitle,
                category: category,
                apiKey: config.apiKey
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 30000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        resolve(Array.isArray(json.body) ? json.body : []);
                    } else {
                        logger.warn(`다운로드 기록 조회 실패: ${json.body}`, 'GAS:History');
                        resolve([]);
                    }
                } catch (e) {
                    logger.warn(`다운로드 기록 응답 파싱 실패`, 'GAS:History');
                    resolve([]);
                }
            },
            onerror: () => {
                logger.warn(`다운로드 기록 조회 네트워크 오류`, 'GAS:History');
                resolve([]);
            },
            ontimeout: () => {
                logger.warn(`다운로드 기록 조회 타임아웃 (30초)`, 'GAS:History');
                resolve([]);
            }
        });
    });
}

/**
 * [v1.6.0] Fetch cached episode list directly using cacheFileId
 * @param {string} cacheFileId 
 * @returns {Promise<Array>} List of cached episodes
 */
async function getBooksByCacheId(cacheFileId) {
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) return [];
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();

    console.log(`[GAS] 캐시 파일 직행 조회 중... (${cacheFileId})`);

    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: config.gasUrl,
            data: JSON.stringify({
                type: "view_get_books_by_cache",
                cacheFileId: cacheFileId,
                apiKey: config.apiKey
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 10000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        resolve(Array.isArray(json.body) ? json.body : []);
                    } else {
                        logger.warn(`Fast Path 캐시 직행 조회 실패: ${json.body}`, 'GAS:FastPath');
                        resolve([]);
                    }
                } catch (e) {
                    logger.warn(`Fast Path 캐시 응답 파싱 실패`, 'GAS:FastPath');
                    resolve([]);
                }
            },
            onerror: () => {
                logger.warn(`Fast Path 캐시 네트워크 오류`, 'GAS:FastPath');
                resolve([]);
            },
            ontimeout: () => {
                logger.warn(`Fast Path 캐시 조회 타임아웃 (10초)`, 'GAS:FastPath');
                resolve([]);
            }
        });
    });
}

/**
 * [v1.6.0] Initialize an update upload session via GAS using fileId (Fast Path)
 * @param {string} fileId 
 * @param {string} fileName 
 */
async function initUpdateUploadViaGASRelay(fileId, fileName) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) throw new Error("GAS 설정이 누락되었습니다.");

    console.log(`[GAS] 빠른 덮어쓰기(PUT) 세션 초기화 중... (${fileName} -> ${fileId})`);

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST", 
            url: config.gasUrl,
            data: JSON.stringify({ 
                type: "init_update", 
                fileId: fileId,
                fileName: fileName,
                apiKey: config.apiKey
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 30000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') { 
                        resolve((typeof json.body === 'object') ? json.body.uploadUrl : json.body);
                    } else {
                        _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().critical(`Fast Path PUT 세션 초기화 실패: ${json.body || 'Init Update failed'} (${fileName})`, 'GAS:FastPath');
                        reject(new Error(json.body || "Init Update failed"));
                    }
                } catch (e) { 
                    _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().critical(`Fast Path PUT 레스폰스 파싱 실패 (${fileName})`, 'GAS:FastPath');
                    reject(new Error("GAS 응답 오류(Init Update): " + res.responseText)); 
                }
            },
            onerror: (e) => {
                _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().critical(`Fast Path PUT 네트워크 오류 (${fileName})`, 'GAS:FastPath');
                reject(new Error("네트워크 오류(Init Update)"));
            },
            ontimeout: () => {
                _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().critical(`Fast Path PUT 타임아웃 30초 (${fileName})`, 'GAS:FastPath');
                reject(new Error("[GAS] 덧쓰기 세션 초기화 타임아웃 (30초)"));
            }
        });
    });
}

/**
 * [v1.6.1] Fetch Series-specific Merge Index Fragment
 * Retrieves the temporary cacheFileId generated after recent uploads without needing a full master_index rebuild.
 * @param {string} sourceId The `12345` ID of the series
 * @returns {Promise<Object>} { found: boolean, data: { cacheFileId: string, ... } }
 */
async function getMergeIndexFragment(sourceId) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!config.gasUrl || !config.folderId) return { found: false, data: null };
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();

    console.log(`[GAS] 병합 인덱스 파편 조회 중... (Source ID: ${sourceId})`);

    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: config.gasUrl,
            data: JSON.stringify({
                type: "view_get_merge_index",
                folderId: config.folderId,
                sourceId: sourceId,
                apiKey: config.apiKey
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 10000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        resolve(json.body);
                    } else {
                        logger.warn(`MergeIndex 파편 조회 실패: ${json.body} (ID: ${sourceId})`, 'GAS:FastPath');
                        resolve({ found: false, data: null });
                    }
                } catch (e) {
                    logger.warn(`MergeIndex 파편 응답 파싱 실패`, 'GAS:FastPath');
                    resolve({ found: false, data: null });
                }
            },
            onerror: () => {
                logger.warn(`MergeIndex 파편 조회 네트워크 오류`, 'GAS:FastPath');
                resolve({ found: false, data: null });
            },
            ontimeout: () => {
                logger.warn(`MergeIndex 파편 조회 타임아웃 (10초)`, 'GAS:FastPath');
                resolve({ found: false, data: null });
            }
        });
    });
}



/***/ }),

/***/ 729:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  O: function() { return /* binding */ ParserFactory; }
});

;// ./src/core/parsers/BaseParser.js
/**
 * BaseParser (Abstract)
 * Provides common logic and defines interface for site-specific parsers.
 */
class BaseParser {
    constructor(protocolDomain) {
        this.protocolDomain = protocolDomain;
    }

    /**
     * Common: Dummy image detection
     */
    isDummyUrl(url) {
        if (!url) return true;
        if (url.startsWith('data:image')) return true;
        const lower = url.toLowerCase();

        // 알려진 더미 파일명 패턴
        const dummyFilenames = [
            'blank.gif', 'loading.gif', 'loading-image.gif',
            'pixel.gif', 'spacer.gif', 'transparent.gif',
            '1x1.gif', 'dot.gif',
        ];
        if (dummyFilenames.some(p => lower.includes(p))) return true;

        // 경로 기반 패턴: /img/loading*, /img/placeholder*
        if (/\/img\/loading/.test(lower)) return true;
        if (/\/img\/placeholder/.test(lower)) return true;

        return false;
    }

    /**
     * Common: Ensure URL is absolute
     */
    getAbsoluteUrl(url) {
        if (!url) return "";
        if (url.startsWith('http')) return url;
        if (url.startsWith('//')) return `https:${url}`;
        if (url.startsWith('/')) return `${this.protocolDomain}${url}`;
        return url;
    }

    /**
     * Helper: Wait for a selector to appear in the DOM
     */
    async waitForSelector(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }, timeout);
        });
    }

    /**
     * Interface: Extract list elements (li or similar)
     * @returns {HTMLElement[]}
     */
    getListItems() {
        throw new Error('getListItems() must be implemented');
    }

    /**
     * Interface: Parse single list item into normalized object
     * @param {HTMLElement} element 
     * @returns {Object} { num, title, src, element }
     */
    parseListItem(element) {
        throw new Error('parseListItem() must be implemented');
    }

    /**
     * Interface: Extract novel content from iframe
     */
    getNovelContent(iframeDocument) {
        throw new Error('getNovelContent() must be implemented');
    }

    /**
     * Interface: Extract image list for webtoon/manga
     */
    getImageList(iframeDocument) {
        throw new Error('getImageList() must be implemented');
    }

    /**
     * Interface: Extract thumbnail URL
     */
    getThumbnailUrl() {
        throw new Error('getThumbnailUrl() must be implemented');
    }

    /**
     * Interface: Extract series title
     */
    getSeriesTitle() {
        throw new Error('getSeriesTitle() must be implemented');
    }

    /**
     * Interface: Extract series metadata
     */
    getSeriesMetadata() {
        throw new Error('getSeriesMetadata() must be implemented');
    }
    /**
     * Common: Generate unified folder name / series title
     * @param {string} seriesId - Unique ID from URL
     * @param {string} firstTitle - Title of first episode in list
     * @param {string} lastTitle - Title of last episode in list
     * @param {function} getCommonPrefixFn - Callback to calculate prefix
     * @returns {string} "[ID] Title"
     */
    getFormattedTitle(seriesId, firstTitle, lastTitle, getCommonPrefixFn) {
        let seriesTitle = this.getSeriesTitle();
        let formatted = "";

        if (seriesTitle) {
            formatted = `[${seriesId}] ${seriesTitle}`;
        } else {
            // Fallback Logic
            let listPrefixTitle = "";
            if (firstTitle && lastTitle && getCommonPrefixFn) {
                listPrefixTitle = getCommonPrefixFn(firstTitle, lastTitle);
            }

            if (listPrefixTitle && listPrefixTitle.length > 2) {
                formatted = `[${seriesId}] ${listPrefixTitle}`;
            } else if (firstTitle) {
                // Single item or distinct titles: fallback to regex or full title
                const cleanTitle = firstTitle.replace(/\s+\d+화$/, '').trim();
                formatted = `[${seriesId}] ${cleanTitle || firstTitle}`;
            } else {
                formatted = `[${seriesId}] Unknown Series`;
            }
        }

        // Final cleanup for filesystem compatibility
        return formatted.replace(/[<>:"/\\|?*]/g, '').trim();
    }
}

;// ./src/core/parsers/GenericParser.js


/**
 * GenericParser
 * A dynamic parser that uses JSON rules to extract data from the DOM.
 */
class GenericParser extends BaseParser {
    /**
     * @param {string} protocolDomain 
     * @param {Object} rule - The matched JSON rule object
     */
    constructor(protocolDomain, rule) {
        super(protocolDomain);
        this.rule = rule;
    }

    /**
     * Helper to extract value from DOM based on rule config (String selector or { selector, attr })
     * @private
     */
    _extractValue(root, config) {
        if (!config || !root) return null;
        
        const selector = typeof config === 'string' ? config : config.selector;
        const attr = typeof config === 'object' ? config.attr : null;
        const regexStr = typeof config === 'object' ? config.regex : null;

        const el = root.querySelector(selector);
        if (!el) return null;

        let val = null;
        if (attr) {
            val = el.getAttribute(attr)?.trim() || null;
        } else {
            val = el.innerText?.trim() || el.textContent?.trim() || null;
        }

        if (val && regexStr) {
            try {
                const regex = new RegExp(regexStr, 'i');
                const match = val.match(regex);
                if (match) {
                    val = match[1] || match[0];
                } else {
                    val = null;
                }
            } catch (e) {
                console.warn(`[GenericParser] Invalid regex pattern: ${regexStr}`, e);
            }
        }

        return val;
    }

    /**
     * [v1.8.1] 동적 레이지 키 탐지 (Toki 등 보안 우회용)
     * @private
     */
    _detectDynamicKey(doc, config) {
        if (!config || !config.regex) return null;
        
        try {
            // 1. 스크립트 태그 우선 스캔 (성능 및 정확도 최적화)
            const scripts = doc.querySelectorAll('script');
            const regex = new RegExp(config.regex, 'i');
            
            for (const script of scripts) {
                const match = (script.textContent || "").match(regex);
                if (match) {
                    const key = match[1] || match[0];
                    console.log(`[GenericParser] 스크립트 내 동적 키 탐지 성공: ${key}`);
                    return key;
                }
            }
            
            // 2. 전체 HTML 스캔 (폴백)
            const html = doc.documentElement.innerHTML || "";
            const match = html.match(regex);
            if (match) {
                const key = match[1] || match[0];
                console.log(`[GenericParser] HTML 내 동적 키 탐지 성공: ${key}`);
                return key;
            }
        } catch (e) {
            console.warn('[GenericParser] 동적 키 탐지 중 오류 발생:', e);
        }
        return null;
    }

    async getListItems() {
        const listCfg = this.rule.list || {};
        let container = document.querySelector(listCfg.container);
        
        // [v1.8.1] 동적 로딩(Next.js 등) 대응: 컨테이너가 나타날 때까지 대기
        if (!container) {
            console.log(`[GenericParser] 컨테이너(${listCfg.container}) 대기 중...`);
            container = await this.waitForSelector(listCfg.container, 5000);
        }

        if (!container) {
            console.warn(`[GenericParser] Container not found: ${listCfg.container}`);
            return [];
        }

        const items = Array.from(container.querySelectorAll(listCfg.item));
        // Reverse if it's a typical episode list where latest is on top but we need chronological for some logic?
        // Actually, TokiParser reverses. Let's check if we should always reverse.
        // For now, return as is.
        return items;
    }

    parseListItem(el) {
        const listCfg = this.rule.list || {};
        const numRaw = this._extractValue(el, listCfg.num) || "0";
        const subRaw = this._extractValue(el, listCfg.sub) || "";
        const title = this._extractValue(el, listCfg.title) || "Unknown";
        const src = this._extractValue(el, listCfg.link) || "";

        // Extract numbers only for zero padding, if possible
        let num = numRaw;
        const match = numRaw.match(/(\d+)/);
        if (match) {
            num = match[1].padStart(4, '0');
        } else {
            num = numRaw.padStart(4, '0');
        }

        if (subRaw) {
            num = `${num}_${subRaw}`;
        }

        return {
            num: num,
            title: title,
            src: this.getAbsoluteUrl(src),
            element: el
        };
    }

    getNovelContent(iframeDocument) {
        const viewerCfg = this.rule.viewer || {};
        const selector = viewerCfg.novelContent || 'body';
        const el = iframeDocument.querySelector(selector);
        return el ? el.innerText : "";
    }

    getImageList(iframeDocument) {
        const viewerCfg = this.rule.viewer || {};

        // [v1.8.1] 동적 키 탐지 수행
        let dynamicLazyAttr = null;
        if (viewerCfg.keyDiscovery) {
            const key = this._detectDynamicKey(iframeDocument, viewerCfg.keyDiscovery);
            if (key) {
                dynamicLazyAttr = (viewerCfg.keyDiscovery.prefix || 'data-') + key;
            }
        }

        // 1. 헤드리스(Headless) 정규식 추출 지원 (Next.js 페이로드 등 DOM 미렌더링 대응)
        if (viewerCfg.imageRegex) {
            const html = iframeDocument.documentElement.innerHTML || iframeDocument.body.innerHTML;
            const regex = new RegExp(viewerCfg.imageRegex, 'g');
            const urls = [];
            let match;
            
            while ((match = regex.exec(html)) !== null) {
                // 캡처 그룹이 있으면 그것을, 없으면 전체 매치(match[0])를 사용
                let url = match[1] || match[0];
                url = url.replace(/\\/g, ''); // 불필요한 이스케이프 백슬래시(\) 제거
                
                if (!this.isDummyUrl(url)) {
                    urls.push(this.getAbsoluteUrl(url));
                }
            }
            
            // 중복 제거 후 리턴 (정규식 특성상 중복 캡처 가능성 높음)
            const uniqueUrls = Array.from(new Set(urls));
            if (uniqueUrls.length > 0) {
                console.log(`[GenericParser] Regex 기반 이미지 추출 성공: ${uniqueUrls.length}개 발견`);
                return uniqueUrls.map(url => ({ url, isDummy: false }));
            } else {
                console.warn(`[GenericParser] Regex 설정이 있으나 매칭되는 이미지를 찾지 못했습니다.`);
            }
        }

        // 2. DOM 기반 추출 (기본)
        const container = iframeDocument.querySelector(viewerCfg.imageContainer) || iframeDocument;
        const imgs = Array.from(container.querySelectorAll(viewerCfg.imageItem || 'img'));

        return imgs.map(img => {
            let foundUrl = null;
            // [v1.8.1] 동적 키가 발견되면 최우선 순위로 설정하여 탐지 성공률 극대화
            const lazyAttrs = [
                ...(dynamicLazyAttr ? [dynamicLazyAttr] : []),
                ...(viewerCfg.lazyAttrOptions || ['data-src', 'data-lazy', 'src'])
            ];

            for (const attr of lazyAttrs) {
                const val = img.getAttribute(attr);
                if (val) {
                    const absoluteUrl = this.getAbsoluteUrl(val);
                    if (absoluteUrl && !this.isDummyUrl(absoluteUrl)) {
                        foundUrl = absoluteUrl;
                        break;
                    }
                }
            }

            const finalUrl = foundUrl || this.getAbsoluteUrl(img.src) || "";
            return {
                url: finalUrl,
                isDummy: this.isDummyUrl(finalUrl)
            };
        });
    }

    getThumbnailUrl() {
        const meta = this.rule.meta || {};
        const thumb = this._extractValue(document, meta.thumb);
        return thumb ? this.getAbsoluteUrl(thumb) : null;
    }

    getSeriesTitle() {
        const meta = this.rule.meta || {};
        return this._extractValue(document, meta.title);
    }

    getSeriesMetadata() {
        const meta = this.rule.meta || {};
        return {
            author: this._extractValue(document, meta.author) || "",
            status: this._extractValue(document, meta.status) || "연재중",
            summary: this._extractValue(document, meta.summary) || ""
        };
    }

    getViewerMetadata(viewerDocument) {
        const viewerCfg = this.rule.viewer || {};
        
        let seriesTitle = this._extractValue(viewerDocument, viewerCfg.seriesTitle) || "UnknownSeries";
        let episodeTitle = this._extractValue(viewerDocument, viewerCfg.episodeTitle) || "UnknownEpisode";
        let episodeNum = this._extractValue(viewerDocument, viewerCfg.episodeNum) || "0000";

        // Clean up episodeNum
        const match = episodeNum.match(/(\d+)/);
        if (match) {
            episodeNum = match[1].padStart(4, '0');
        } else {
            episodeNum = episodeNum.padStart(4, '0');
        }

        return {
            seriesTitle,
            episodeTitle,
            episodeNum
        };
    }
}

// EXTERNAL MODULE: ./src/core/detector.js + 1 modules
var detector = __webpack_require__(739);
;// ./src/core/parsers/ParserFactory.js



/**
 * ParserFactory
 * Creates and provides the appropriate parser for the current site.
 */
class ParserFactory {
    static #instance = null;

    /**
     * Get the appropriate parser for the current site (Singleton)
     * @returns {Promise<BaseParser|null>}
     */
    static async getParser() {
        if (this.#instance) return this.#instance;

        const siteInfo = await (0,detector/* detectSite */.T)();
        if (!siteInfo) {
            console.error('[ParserFactory] Failed to detect site');
            alert("TokiSync 파서 에러: 매칭되는 파싱 룰이 없습니다.\n\n해당 사이트를 지원하려면 설정에서 커스텀 파싱 룰(JSON)을 등록해야 합니다.\n(자세한 방법은 Github의 rules.sample.json을 참조하세요)");
            return null;
        }

        const { site, protocolDomain, matchedRule } = siteInfo;

        // Dynamic Generic Parser
        if (site === 'generic' && matchedRule) {
            this.#instance = new GenericParser(protocolDomain, matchedRule);
            return this.#instance;
        }

        return null;
    }
}


/***/ }),

/***/ 739:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  T: function() { return /* binding */ detectSite; }
});

// EXTERNAL MODULE: ./src/core/config.js
var config = __webpack_require__(899);
;// ./src/core/parsers/RuleManager.js


/**
 * RuleManager
 * Manages parsing rules from built-in templates and user custom definitions.
 */
class RuleManager {
    // Built-in rules as fallback/templates
    static #builtInRules = [];

    /**
     * Get all merged rules: Custom > Built-in
     * @returns {Promise<Array>}
     */
    static async getRules() {
        let rules = [...this.#builtInRules];

        // 1. Load Custom Rules from GM storage
        if (typeof GM_getValue !== 'undefined') {
            const customStr = GM_getValue(config/* CFG_CUSTOM_RULES */.PT, '[]');
            try {
                const customRules = JSON.parse(customStr);
                if (Array.isArray(customRules)) {
                    // Custom rules at the beginning to take precedence during matching
                    rules = [...customRules, ...rules];
                }
            } catch (e) {
                console.error('[RuleManager] Failed to parse custom rules:', e);
            }
        }

        return rules;
    }

    /**
     * Find a matching rule for the current URL
     * @param {string} url 
     * @returns {Promise<Object|null>}
     */
    static async matchRule(url) {
        const rules = await this.getRules();
        for (const rule of rules) {
            if (!rule.urlPattern) continue;
            try {
                const regex = new RegExp(rule.urlPattern, 'i');
                if (regex.test(url)) {
                    console.log(`[RuleManager] Matched rule: ${rule.name || rule.id}`);
                    return rule;
                }
            } catch (e) {
                console.warn(`[RuleManager] Invalid regex pattern: ${rule.urlPattern}`, e);
            }
        }
        return null;
    }
}

;// ./src/core/detector.js


/**
 * detectSite
 * Detects the current site and returns site info.
 * Now supports both dynamic rules and legacy hardcoded patterns.
 * @returns {Promise<Object|null>}
 */
async function detectSite() {
    const url = window.location.href;
    const domain = window.location.hostname;
    const protocolDomain = `${window.location.protocol}//${domain}`;

    // Dynamic Rule Matching
    const matchedRule = await RuleManager.matchRule(url);
    if (matchedRule) {
        return { 
            site: 'generic', 
            protocolDomain, 
            matchedRule,
            category: matchedRule.category || 'Webtoon'
        };
    }

    return null;
}


/***/ }),

/***/ 899:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Jb: function() { return /* binding */ isConfigValid; },
/* harmony export */   Nk: function() { return /* binding */ setConfig; },
/* harmony export */   PT: function() { return /* binding */ CFG_CUSTOM_RULES; },
/* harmony export */   Vh: function() { return /* binding */ showConfigModal; },
/* harmony export */   zj: function() { return /* binding */ getConfig; }
/* harmony export */ });
/* unused harmony exports CFG_URL_KEY, CFG_ID_KEY, CFG_FOLDER_ID, CFG_POLICY_KEY, CFG_API_KEY, CFG_SLEEP_MODE, CFG_SMART_SKIP_RATIO, CFG_NOVEL_MODE, CFG_NOVEL_FORMAT, CFG_REMOTE_RULE_URL */
const CFG_URL_KEY = "TOKI_GAS_URL"; // legacy
const CFG_ID_KEY = "TOKI_GAS_ID";
const CFG_FOLDER_ID = "TOKI_FOLDER_ID";
const CFG_POLICY_KEY = "TOKI_DOWNLOAD_POLICY";
const CFG_API_KEY = "TOKI_API_KEY";
const CFG_SLEEP_MODE = "TOKI_SLEEP_MODE";
const CFG_SMART_SKIP_RATIO = "TOKI_SMART_SKIP_RATIO";
const CFG_NOVEL_MODE = "TOKI_NOVEL_MODE";
const CFG_NOVEL_FORMAT = "TOKI_NOVEL_FORMAT";
const CFG_REMOTE_RULE_URL = "TOKI_REMOTE_RULE_URL";
const CFG_CUSTOM_RULES = "TOKI_CUSTOM_RULES";

/**
 * Get current configuration
 * @returns {{gasId: string, gasUrl: string, folderId: string, policy: string, apiKey: string, sleepMode: string, smartSkipRatio: number}}
 */
function getConfig() {
    let gasId = GM_getValue(CFG_ID_KEY, "");
    let gasUrl = GM_getValue(CFG_URL_KEY, "");

    // Auto-migration: gasUrl -> gasId
    if (!gasId && gasUrl) {
        const match = gasUrl.match(/\/s\/([^\/]+)\/exec/);
        if (match) {
            gasId = match[1];
            GM_setValue(CFG_ID_KEY, gasId);
            console.log("✅ [Config] Auto-migrated GAS URL to ID:", gasId);
        }
    }

    const finalGasId = gasId;
    // URL fallback for legacy or reconstructed from ID
    const finalGasUrl = finalGasId 
        ? `https://script.google.com/macros/s/${finalGasId}/exec` 
        : gasUrl;

    return {
        gasId: finalGasId,
        gasUrl: finalGasUrl,
        folderId: GM_getValue(CFG_FOLDER_ID, ""),
        policy: GM_getValue(CFG_POLICY_KEY, "folderInCbz"),
        apiKey: GM_getValue(CFG_API_KEY, ""),
        sleepMode: GM_getValue(CFG_SLEEP_MODE, "agile"), // default: agile
        smartSkipRatio: parseInt(GM_getValue(CFG_SMART_SKIP_RATIO, "50"), 10), // default 50% of Max
        novelMode: GM_getValue(CFG_NOVEL_MODE, "perChapter"), // default: chapter-by-chapter
        novelFormat: GM_getValue(CFG_NOVEL_FORMAT, "epub"), // default: EPUB
        remoteRuleUrl: GM_getValue(CFG_REMOTE_RULE_URL, ""),
        customRules: GM_getValue(CFG_CUSTOM_RULES, "[]")
    };
}

/**
 * Set configuration value
 * @param {string} key 
 * @param {string} value 
 */
function setConfig(key, value) {
    GM_setValue(key, value);
}

/**
 * Show Configuration Modal
 */
function showConfigModal() {
    // Remove existing modal if any
    const existing = document.getElementById('toki-config-modal');
    if (existing) existing.remove();

    const config = getConfig();

    // -- Styles --
    const styleId = 'toki-config-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .toki-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(5px);
                z-index: 10000;
                display: flex; justify-content: center; align-items: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .toki-modal-container {
                background: rgba(30, 32, 35, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                border-radius: 16px;
                padding: 28px;
                width: 500px;
                max-height: 85vh;
                overflow-y: auto;
                color: #fff;
            }
            /* Custom Scrollbar for Modal */
            .toki-modal-container::-webkit-scrollbar {
                width: 8px;
            }
            .toki-modal-container::-webkit-scrollbar-track {
                background: transparent;
            }
            .toki-modal-container::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }
            .toki-modal-container::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.4);
            }
            .toki-modal-header {
                font-size: 20px; font-weight: 600; margin-bottom: 20px;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            }
            .toki-input-group { margin-bottom: 16px; }
            .toki-label { display: block; font-size: 12px; color: #aaa; margin-bottom: 6px; }
            .toki-input, .toki-select, .toki-textarea {
                width: 100%; padding: 10px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #fff; font-size: 14px;
                box-sizing: border-box;
            }
            .toki-textarea {
                font-family: monospace;
                font-size: 12px;
                resize: vertical;
                min-height: 100px;
            }
            .toki-input:focus, .toki-select:focus, .toki-textarea:focus {
                outline: none; border-color: #6a5acd;
                box-shadow: 0 0 0 2px rgba(106, 90, 205, 0.3);
            }
            .toki-modal-footer {
                display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;
            }
            .toki-btn {
                padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
                font-size: 14px; font-weight: 500; transition: all 0.2s;
            }
            .toki-btn-cancel { background: transparent; color: #aaa; border: 1px solid rgba(255,255,255,0.1); }
            .toki-btn-cancel:hover { background: rgba(255,255,255,0.05); color: #fff; }
            .toki-btn-save {
                background: linear-gradient(135deg, #6a5acd, #483d8b);
                color: #fff;
                box-shadow: 0 4px 15px rgba(106, 90, 205, 0.4);
            }
            .toki-btn-save:hover { filter: brightness(1.1); transform: translateY(-1px); }
        `;
        document.head.appendChild(style);
    }

    // -- HTML Structure --
    const overlay = document.createElement('div');
    overlay.id = 'toki-config-modal';
    overlay.className = 'toki-modal-overlay';
    
    overlay.innerHTML = `
        <div class="toki-modal-container">
            <div class="toki-modal-header">TokiSync 설정</div>
            
            <div class="toki-input-group">
                <label class="toki-label">GAS Script ID</label>
                <input type="text" id="toki-cfg-gas-id" class="toki-input" placeholder="AKfycb..." value="${config.gasId}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">Google Drive Folder ID</label>
                <input type="text" id="toki-cfg-folder" class="toki-input" placeholder="Folder ID" value="${config.folderId}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">API Key (보안)</label>
                <input type="password" id="toki-cfg-apikey" class="toki-input" placeholder="API Key" value="${config.apiKey}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">다운로드 정책</label>
                <select id="toki-cfg-policy" class="toki-select">
                    <option value="individual">1. 개별 파일 (Individual)</option>
                    <option value="zipOfCbzs">2. 챕터 묶음 (ZIP of CBZs)</option>
                    <option value="native">3. 자동 분류 (Native)</option>
                    <option value="drive">4. 드라이브 업로드 (GoogleDrive)</option>
                    <option value="folderInCbz" style="display:none;">[구버전] 통합 파일 (Folder in CBZ/EPUB)</option>
                </select>
            </div>

            <div class="toki-input-group">
                <label class="toki-label">다운로드 속도</label>
                <select id="toki-cfg-sleepmode" class="toki-select">
                    <option value="agile">빠름 (1-3초)</option>
                    <option value="cautious">신중 (2-5초)</option>
                    <option value="thorough">철저 (3-8초)</option>
                </select>
            </div>

            <div class="toki-input-group">
                <label class="toki-label">Smart Skip 민감도 (최고 용량 기준)</label>
                <select id="toki-cfg-smartskip" class="toki-select">
                    <option value="90">90% (매우 민감: 최고 용량의 90% 미만 재다운로드)</option>
                    <option value="80">80% (민감: 최고 용량의 80% 미만 재다운로드)</option>
                    <option value="70">70% (보통: 최고 용량의 70% 미만 재다운로드)</option>
                    <option value="50">50% (기본: 최고 용량 대비 반토막 난 파일만 감지)</option>
                </select>
            </div>
            
            <div class="toki-input-group">
                <label class="toki-label">소설 패키징 방식 (Novel Mode)</label>
                <select id="toki-cfg-novel-mode" class="toki-select">
                    <option value="perChapter">개별 회차 저장 (1회차 = 1파일)</option>
                    <option value="singleVolume">단행본 합본 저장 (선택 범위 = 1파일)</option>
                </select>
            </div>

            <div class="toki-input-group">
                <label class="toki-label">소설 출력 포맷 (Novel Format)</label>
                <select id="toki-cfg-novel-format" class="toki-select">
                    <option value="epub">EPUB (전자책 표준)</option>
                    <option value="txt">TXT (일반 텍스트)</option>
                </select>
            </div>

            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">

            <div class="toki-input-group">
                <label class="toki-label">원격 파싱 룰 URL (JSON)</label>
                <input type="text" id="toki-cfg-remote-rule" class="toki-input" placeholder="https://example.com/rules.json" value="${config.remoteRuleUrl}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">커스텀 파싱 룰 (JSON Array)</label>
                <textarea id="toki-cfg-custom-rule" class="toki-textarea" placeholder="[{...}]">${config.customRules}</textarea>
            </div>

            <div class="toki-modal-footer">
                <button id="toki-btn-cancel" class="toki-btn toki-btn-cancel">취소</button>
                <button id="toki-btn-save" class="toki-btn toki-btn-save">저장</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // -- Logic --
    const policySelect = document.getElementById('toki-cfg-policy');
    if(policySelect) policySelect.value = config.policy;
    
    const sleepModeSelect = document.getElementById('toki-cfg-sleepmode');
    if(sleepModeSelect) sleepModeSelect.value = config.sleepMode;

    const smartSkipSelect = document.getElementById('toki-cfg-smartskip');
    if(smartSkipSelect) smartSkipSelect.value = config.smartSkipRatio;

    const novelModeSelect = document.getElementById('toki-cfg-novel-mode');
    if(novelModeSelect) novelModeSelect.value = config.novelMode;

    const novelFormatSelect = document.getElementById('toki-cfg-novel-format');
    if(novelFormatSelect) novelFormatSelect.value = config.novelFormat;

    document.getElementById('toki-btn-cancel').onclick = () => overlay.remove();
    
    document.getElementById('toki-btn-save').onclick = () => {
        const newGasId = document.getElementById('toki-cfg-gas-id').value.trim();
        const newFolder = document.getElementById('toki-cfg-folder').value.trim();
        const newApiKey = document.getElementById('toki-cfg-apikey').value.trim();
        const newPolicy = document.getElementById('toki-cfg-policy').value;
        const newSleepMode = document.getElementById('toki-cfg-sleepmode').value;
        const newSmartSkip = document.getElementById('toki-cfg-smartskip').value;
        const newNovelMode = document.getElementById('toki-cfg-novel-mode').value;
        const newNovelFormat = document.getElementById('toki-cfg-novel-format').value;
        const newRemoteRule = document.getElementById('toki-cfg-remote-rule').value.trim();
        const newCustomRule = document.getElementById('toki-cfg-custom-rule').value.trim() || '[]';

        // Validate Custom Rules JSON
        let validCustomRule = '[]';
        try {
            let parsed = JSON.parse(newCustomRule);
            
            // [v1.8.1] 룰 구조 유연화: { rules: [...] } 형태의 전체 구조를 넣었을 경우 자동 처리
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                if (Array.isArray(parsed.rules)) {
                    parsed = parsed.rules;
                } else {
                    throw new Error("커스텀 룰은 JSON 배열이거나, 'rules' 키를 포함한 객체여야 합니다.");
                }
            }

            if (!Array.isArray(parsed)) {
                throw new Error("커스텀 룰은 JSON 배열(Array) 형태여야 합니다.");
            }
            validCustomRule = JSON.stringify(parsed, null, 2);
        } catch (e) {
            alert(`커스텀 룰 JSON 파싱 오류:\n${e.message}\n설정을 저장할 수 없습니다.`);
            return;
        }

        // URL 입력 시 ID 추출 로직 병합 (사용자 편의성)
        let finalGasId = newGasId;
        const urlMatch = newGasId.match(/\/s\/([^\/]+)\/exec/);
        if (urlMatch) finalGasId = urlMatch[1];

        setConfig(CFG_ID_KEY, finalGasId);
        setConfig(CFG_FOLDER_ID, newFolder);
        setConfig(CFG_API_KEY, newApiKey);
        setConfig(CFG_POLICY_KEY, newPolicy);
        setConfig(CFG_SLEEP_MODE, newSleepMode);
        setConfig(CFG_SMART_SKIP_RATIO, newSmartSkip);
        setConfig(CFG_NOVEL_MODE, newNovelMode);
        setConfig(CFG_NOVEL_FORMAT, newNovelFormat);
        setConfig(CFG_REMOTE_RULE_URL, newRemoteRule);
        setConfig(CFG_CUSTOM_RULES, validCustomRule);

        alert('설정이 저장되었습니다.');
        overlay.remove();
    };


    // Close on background click
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

/**
 * Check if configuration is valid
 * @returns {boolean}
 */
function isConfigValid() {
    const config = getConfig();
    return (config.gasId || config.gasUrl) && config.folderId;
}

/***/ }),

/***/ 924:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OJ: function() { return /* binding */ saveFile; },
/* harmony export */   Vs: function() { return /* binding */ scrollToLoad; },
/* harmony export */   _L: function() { return /* binding */ blobToArrayBuffer; },
/* harmony export */   eO: function() { return /* binding */ waitIframeLoad; },
/* harmony export */   getImageDimensions: function() { return /* binding */ getImageDimensions; },
/* harmony export */   iL: function() { return /* binding */ getCommonPrefix; },
/* harmony export */   yy: function() { return /* binding */ sleep; }
/* harmony export */ });
/* unused harmony export waitForContent */
/* harmony import */ var _gas_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(488);
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(963);



async function blobToArrayBuffer(blob) {
    if (blob.arrayBuffer) {
        return await blob.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

function sleep(ms, randomRange) {
    if (randomRange) {
        ms = Math.floor(Math.random() * randomRange) + ms;
    }
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    });
}

function getCommonPrefix(str1, str2) {
    if (!str1 || !str2) return '';
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
        i++;
    }
    let prefix = str1.substring(0, i).trim();
    
    // Remove trailing partial numbers (e.g. "인싸 공명 1" → "인싸 공명")
    // Stop at last word boundary before a number
    prefix = prefix.replace(/\s+\d+$/, '');
    
    return prefix;
}

async function waitIframeLoad(iframe, url, viewerCfg = {}) {
    return new Promise((resolve) => {
        const handler = async () => {
            iframe.removeEventListener('load', handler);
            
            // [Fix] 시나리오 1/4: 고정 sleep(500) 대신 실제 콘텐츠 DOM 폴링
            // load 이벤트 후에도 JS lazy-render 페이지는 DOM이 비어있을 수 있음
            // 이미지(.view-padding div img) 또는 소설 텍스트(#novel_content) 중 하나가
            // 나타날 때까지 최대 8초 폴링 (200ms 간격 × 40회)
            await waitForContent(iframe, 8000, viewerCfg);
            
            // Captcha Detection
            let isCaptcha = false;
            let isCloudflare = false;
            
            try {
                const iframeDoc = iframe.contentWindow.document;
                console.log('[Captcha Debug] iframe URL:', iframe.contentWindow.location.href);
                console.log('[Captcha Debug] iframe title:', iframeDoc.title);
                
                // Check for various captcha types
                const hcaptcha = iframeDoc.querySelector('iframe[src*="hcaptcha"]');
                const recaptcha = iframeDoc.querySelector('.g-recaptcha');
                
                // Gnuboard captcha (corrected selectors based on actual HTML)
                const kcaptchaFieldset = iframeDoc.querySelector('fieldset#captcha, fieldset.captcha');
                const kcaptchaImg = iframeDoc.querySelector('img.captcha_img, img[src*="kcaptcha_image.php"]');
                const kcaptchaForm = iframeDoc.querySelector('form[action*="captcha_check.php"]');
                const kcaptcha = kcaptchaFieldset || kcaptchaImg || kcaptchaForm;
                
                console.log('[Captcha Debug] hCaptcha:', !!hcaptcha);
                console.log('[Captcha Debug] reCaptcha:', !!recaptcha);
                console.log('[Captcha Debug] Gnuboard kCaptcha:', !!kcaptcha);
                if (kcaptcha) {
                    console.log('[Captcha Debug] - fieldset:', !!kcaptchaFieldset);
                    console.log('[Captcha Debug] - img:', !!kcaptchaImg);
                    console.log('[Captcha Debug] - form:', !!kcaptchaForm);
                }
                
                isCaptcha = !!(hcaptcha || recaptcha || kcaptcha);
                
                // Cloudflare detection
                const titleCheck = iframeDoc.title.includes('Just a moment');
                const cfElement = iframeDoc.getElementById('cf-challenge-running');
                const cfWrapper = iframeDoc.querySelector('.cf-browser-verification');
                
                console.log('[Captcha Debug] Cloudflare title check:', titleCheck);
                console.log('[Captcha Debug] cf-challenge-running:', !!cfElement);
                console.log('[Captcha Debug] cf-browser-verification:', !!cfWrapper);
                
                isCloudflare = titleCheck || !!cfElement || !!cfWrapper;
                
            } catch (e) {
                console.warn('[Captcha Debug] CORS Error or Access Denied:', e.message);
                // If CORS blocks us, check from outside
                try {
                    const iframeUrl = iframe.contentWindow.location.href;
                    if (iframeUrl.includes('challenge') || iframeUrl.includes('captcha')) {
                        console.warn('[Captcha Debug] URL contains captcha keyword!');
                        isCaptcha = true;
                    }
                } catch (corsError) {
                    console.warn('[Captcha Debug] Cannot access iframe URL due to CORS');
                }
            }
            
            if (isCaptcha || isCloudflare) {
                console.warn('[Captcha] 감지됨! 사용자 조치 필요');
                const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();
                logger.error('[Captcha] 캡차가 감지되었습니다. 해결 후 "재개" 버튼을 눌러주세요.');
                await pauseForCaptcha(url);
                logger.log('[Captcha] 해결 확인됨! 원본 주소로 다운로드 프레임 재개 중...', 'System');
                
                // 기존 다운로드용 iframe은 그대로 두고, 
                // 원본 주소(url)를 다시 로드하여 처음부터 캡차 검사 단계를 정상적으로 통과하도록 재귀호출
                await waitIframeLoad(iframe, url, viewerCfg);
                resolve();
            } else {
                console.log('[Captcha Debug] No captcha detected');
                resolve();
            }
        };
        iframe.addEventListener('load', handler);
        iframe.src = url;
    });
}

/**
 * 창(Window) 내부에 실제 콘텐츠가 로드될 때까지 폴링 대기
 * 웹툰: .view-padding div img / 소설: #novel_content
 * @param {Window} targetWindow 대기할 대상 창 (현재 창 또는 iframe.contentWindow)
 * @param {number} maxWaitMs 최대 대기 시간 (ms), 기본 8000
 * @param {object} viewerCfg 동적 파서 뷰어 설정
 * @returns {Document|null} 성공 시 Document 객체 반환, 실패/시간초과 시 null
 */
async function waitForContent(targetWindow, maxWaitMs = 8000, viewerCfg = {}) {
    const POLL_INTERVAL = 200;
    const maxAttempts = Math.ceil(maxWaitMs / POLL_INTERVAL);
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            if (!targetWindow) return null;
            const targetDoc = targetWindow.document;
            const title = targetDoc.title; // CORS 확인용 강제 접근
            
            let imgSelector = '.view-padding div img';
            if (viewerCfg.imageContainer) {
                const itemSel = viewerCfg.imageItem || 'img';
                imgSelector = viewerCfg.imageContainer.split(',').map(c => `${c.trim()} ${itemSel}`).join(', ');
            }
            const novelSelector = viewerCfg.novelContent || '#novel_content';
            
            const hasImages = targetDoc.querySelector(imgSelector) !== null;
            const novelEl = targetDoc.querySelector(novelSelector);
            const hasNovel = novelEl && novelEl.innerText.trim().length > 50;
            
            if (hasImages || hasNovel) {
                const type = hasImages ? 'Webtoon' : 'Novel';
                _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().log(`[DOM Poll] ${type} 콘텐츠 감지 (${(i + 1) * POLL_INTERVAL}ms)`, 'DOM:Poll');
                return targetDoc; // 콘텐츠 발견 → 즉시 반환
            }
        } catch (e) {
            if (e.name === 'SecurityError' || e.message.includes('Blocked a frame')) {
                // CORS로 완전히 막힌 경우 호출자에게 알림
                throw e;
            }
        }
        await sleep(POLL_INTERVAL);
    }
    // 타임아웃 — 콘텐츠 없이 진행 (후속 로직에서 빈 결과 처리)
    console.warn(`[DOM Poll] ${maxWaitMs}ms 내 콘텐츠 미감지 — 갈무리 시도`);
    _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().warn(`DOM 폴링 타임아웃 ${maxWaitMs}ms — 콘텐츠 미감지, 멈춰서 물 평가`, 'DOM:Poll');
}

/**
 * iframe 내부를 끝까지 스크롤하여 레이지 로딩 이미지가 실제 URL을 불러오도록 강제하는 함수
 * [v1.7.4] 시간 기반 → 진행도 기반으로 개편
 *   Phase 1: 페이지 최하단까지 스크롤 (횟수 제한 없음, 위치 기반 종료)
 *   Phase 2: 모든 lazy 이미지가 실제 URL로 전환될 때까지 폴링
 *            - 개수가 줄어드는 한 계속 대기 (진행 중)
 *            - stallTimeoutMs 동안 변화 없으면 포기 (스톨)
 * @param {HTMLDocument} iframeDoc
 * @param {number} stallTimeoutMs 진행 없을 때 포기하는 시간 (ms), 기본 20000
 * @param {object} viewerCfg 동적 파서 뷰어 설정
 */
async function scrollToLoad(iframeDoc, stallTimeoutMs = 20000, viewerCfg = {}) {
    const POLL_INTERVAL = 300;

    const win = iframeDoc.defaultView || iframeDoc.parentWindow;
    if (!win) return;

    const isHidden = document.visibilityState === 'hidden';
    const behavior = isHidden ? 'auto' : 'smooth';
    const scrollInterval = isHidden ? 200 : 100;

    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();

    // ── Phase 1: 요소 추적 하이브리드 점프 (EBHJ) ────────────────
    logger.log(`[ScrollToLoad] Phase 1: 고속 점프 시작 (${behavior} 모드)`, 'DOM:Scroll');

    // 범용적인 이미지 컨테이너 탐지 (마나토끼 등 다양한 사이트 구조 대응)
    let targetSelectors;
    if (viewerCfg.imageContainer) {
        const itemSel = viewerCfg.imageItem || 'img';
        targetSelectors = viewerCfg.imageContainer.split(',')
            .map(c => `${c.trim()} ${itemSel}`)
            .join(', ');
    } else {
        targetSelectors = '.view-padding div img, .viewer-main img, #v_content img, .img-tag';
    }
    
    const allImages = Array.from(iframeDoc.querySelectorAll(targetSelectors));
    
    if (allImages.length > 0) {
        // 4개 단위로 샘플링하여 징검다리 점프 수행 (IntersectionObserver rootMargin 활용)
        const SAMPLE_STEP = 4;
        const jumpTargets = allImages.filter((_, idx) => idx % SAMPLE_STEP === 0);
        
        // 마지막 이미지는 무조건 포함
        if (allImages.length % SAMPLE_STEP !== 1) {
            jumpTargets.push(allImages[allImages.length - 1]);
        }

        for (let i = 0; i < jumpTargets.length; i++) {
            const target = jumpTargets[i];
            target.scrollIntoView({ behavior, block: 'center' });
            
            // 전역 스크롤 이벤트 발화 (일부 사이트용)
            if (isHidden) win.dispatchEvent(new Event('scroll'));
            
            logger.log(`[EBHJ] 점프 중... (${i + 1}/${jumpTargets.length})`, 'DOM:Jump');
            await sleep(scrollInterval);
        }
    } else {
        logger.warn('[EBHJ] 화면 내 이미지 요소를 찾을 수 없어 물리 스크롤 모드로 전환합니다.', 'DOM:Scroll');
    }

    // Hybrid Fallback: 마지막에 문서를 바닥으로 내려꽂아 무한 스크롤 및 지연 로직 강제 기상
    win.scrollTo({ top: iframeDoc.documentElement.scrollHeight, behavior });
    if (isHidden) win.dispatchEvent(new Event('scroll'));
    await sleep(scrollInterval * 2);

    logger.log('[ScrollToLoad] Phase 1 완료 (요소 점프 및 바닥 도달). Phase 2: 이미지 활성화 대기...', 'DOM:Scroll');

    // ── Phase 2: lazy 이미지가 모두 실제 URL로 바뀔 때까지 폴링 ────
    const isDummySrc = (src) => {
        if (!src || src.trim() === '') return true;
        if (src.startsWith('data:image')) return true;
        const lower = src.toLowerCase();
        
        // 알려진 더미 파일명 패턴
        const dummyFilenames = [
            'blank.gif', 'loading.gif', 'loading-image.gif',
            'pixel.gif', 'spacer.gif', 'transparent.gif',
            '1x1.gif', 'dot.gif',
        ];
        if (dummyFilenames.some(p => lower.includes(p))) return true;

        // 경로 기반 패턴
        if (/\/img\/loading/.test(lower)) return true;
        if (/\/img\/placeholder/.test(lower)) return true;

        return false;
    };

    let lastCount = -1;
    let stallElapsed = 0;

    while (true) {
        const images = Array.from(iframeDoc.querySelectorAll(targetSelectors));
        const remaining = images.filter(img => {
            const src = img.src || '';
            // 1. 알려진 플레이스홀더 URL → 대기
            if (isDummySrc(src)) return true;
            // 2. 이미지가 아직 로딩 중 → 대기
            if (!img.complete) return true;
            // 3. complete=true → 성공이든 실패든 확정 상태, 더 기다려도 바뀌지 않음
            //    (naturalWidth=0 + complete=true = HTML 페이지 URL이거나 CORS/404 실패)
            return false;
        });

        if (remaining.length === 0) {
            logger.log('[ScrollToLoad] Phase 2 완료: 모든 이미지 URL 활성화!', 'DOM:Scroll');
            break;
        }

        if (remaining.length < lastCount || lastCount === -1) {
            // 진행 중 → 스톨 타이머 리셋
            stallElapsed = 0;
            logger.log(`[ScrollToLoad] 진행 중... 잔여 lazy: ${remaining.length}개`, 'DOM:Scroll');
        } else {
            // 변화 없음 → 스톨 누적
            stallElapsed += POLL_INTERVAL;

            // 5초마다 스톨 대상 이미지 상세 정보 출력
            if (stallElapsed % 5000 < POLL_INTERVAL) {
                logger.warn(`[ScrollToLoad] 스톨 중 (${stallElapsed / 1000}s 경과) — 미해결 이미지 목록:`, 'DOM:Scroll');
                remaining.forEach((img, i) => {
                    const src = img.src || '(empty)';
                    const shortSrc = src.length > 80 ? '...' + src.slice(-77) : src;
                    const reason = isDummySrc(img.src || '')
                        ? ((!img.src || img.src.trim() === '') ? 'src 없음' : img.src.startsWith('data:image') ? 'data:image' : '더미 URL 패턴')
                        : `naturalWidth=${img.naturalWidth} (complete=${img.complete})`;
                    logger.warn(`  [${i + 1}] ${reason} | ${shortSrc}`, 'DOM:Stall');
                });
            }

            if (stallElapsed >= stallTimeoutMs) {
                logger.warn(`[ScrollToLoad] 스톨 감지: ${remaining.length}개 미활성화 상태로 ${stallTimeoutMs / 1000}초 경과. 갈무리 진행.`, 'DOM:Scroll');
                // 최종 스톨 목록 출력
                remaining.forEach((img, i) => {
                    const src = img.src || '(empty)';
                    const shortSrc = src.length > 80 ? '...' + src.slice(-77) : src;
                    logger.warn(`  [최종 스톨 ${i + 1}] src="${shortSrc}" | naturalWidth=${img.naturalWidth} | complete=${img.complete}`, 'DOM:Stall');
                });
                break;
            }
        }

        lastCount = remaining.length;
        await sleep(POLL_INTERVAL);
    }
}

// Pause execution until user resolves captcha
function pauseForCaptcha(targetUrl) {
    return new Promise((resumeCallback) => {
        // Create full-screen overlay
        const overlay = document.createElement('div');
        overlay.id = 'toki-captcha-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.9); z-index: 999999;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: white; font-family: Arial, sans-serif;
        `;
        
        overlay.innerHTML = `
            <h1 style="font-size: 32px; margin-bottom: 20px;">⚠️ 캡차 감지</h1>
            <p style="font-size: 18px; margin-bottom: 30px;">아래 프레임에서 캡차를 해결해주세요. (전용 프레임 모드)</p>
            <div style="width: 80%; height: 60%; background: white; border-radius: 10px; overflow: hidden; margin-bottom: 20px;" id="toki-captcha-frame-container"></div>
            <button id="toki-resume-btn" style="padding: 15px 40px; font-size: 18px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer;">
                해결 후 재개하기
            </button>
        `;
        
        document.body.appendChild(overlay);
        
        // 캡차 조작 전용 신규 프레임 띄우기 (다운로드용 프레임의 간섭 방지)
        const captchaIframe = document.createElement('iframe');
        captchaIframe.src = targetUrl;
        captchaIframe.style.width = '100%';
        captchaIframe.style.height = '100%';
        captchaIframe.style.border = 'none';
        
        const container = document.getElementById('toki-captcha-frame-container');
        if (container) {
            container.appendChild(captchaIframe);
        }

        captchaIframe.onload = () => {
            try {
                const iframeDoc = captchaIframe.contentWindow.document;
                const captchaField = iframeDoc.querySelector('fieldset#captcha, fieldset.captcha, .captcha_box');
                if (captchaField) {
                    captchaField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                const captchaInput = iframeDoc.querySelector('#captcha_key, input.captcha_box');
                if (captchaInput) {
                    setTimeout(() => captchaInput.focus(), 300);
                }
            } catch (e) {
                console.warn('[Captcha] Auto-scroll/focus failed (May be CORS):', e.message);
            }
        };
        
        // Periodic check for captcha resolution (auto-resume)
        const checkInterval = setInterval(() => {
            try {
                const iframeDoc = captchaIframe.contentWindow.document;
                
                // Check if captcha fields still exist
                const captchaFieldset = iframeDoc.querySelector('fieldset#captcha, fieldset.captcha');
                const captchaImg = iframeDoc.querySelector('img.captcha_img, img[src*="kcaptcha_image.php"]');
                const captchaForm = iframeDoc.querySelector('form[action*="captcha_check.php"]');
                
                const hcaptcha = iframeDoc.querySelector('iframe[src*="hcaptcha"]');
                const recaptcha = iframeDoc.querySelector('.g-recaptcha');
                const cloudflare = iframeDoc.querySelector('.cf-browser-verification');
                
                const hasCaptcha = !!(captchaFieldset || captchaImg || captchaForm || hcaptcha || recaptcha || cloudflare);
                
                if (!hasCaptcha) {
                    console.log('[Captcha] 자동 감지: 캡차 해결됨!');
                    clearInterval(checkInterval);
                    overlay.remove();
                    resumeCallback();
                }
            } catch (e) {
                // CORS error or iframe changed - likely resolved
                console.log('[Captcha] 자동 감지: 상위 프레임 권한 막힘 또는 리다이렉트 발생 (해결됨으로 추정)');
                clearInterval(checkInterval);
                overlay.remove();
                resumeCallback();
            }
        }, 1000); // Check every 1 second
        
        // Resume button (manual override)
        document.getElementById('toki-resume-btn').onclick = () => {
            clearInterval(checkInterval);
            overlay.remove();
            resumeCallback();
        };
    });
}


// data: JSZip object OR Blob OR Promise<Blob>
async function saveFile(data, filename, type = 'local', extension = 'zip', metadata = {}) {
    const fullFileName = `${filename}.${extension}`;
    
    let content;
    if (data.generateAsync) {
        // [v1.7.3] Native 다운로드 시 확장자 변조 방지를 위해 MIME 타입 명시
        const mimeMap = {
            cbz: 'application/octet-stream', // content-sniffing 방지를 위해 범용 바이너리 타입 사용
            epub: 'application/epub+zip',
            zip: 'application/zip'
        };
        content = await data.generateAsync({ 
            type: "blob",
            mimeType: mimeMap[extension] || 'application/zip'
        });
    } else {
        content = await data; // Unbox promise or use blob directly
    }

    if (type === 'local') {
        console.log(`[Local] 다운로드 중... (${fullFileName})`);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = fullFileName;
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
        console.log(`[Local] 완료`);
    } else if (type === 'native') {
        // [v1.6.0] GM_download with subfolder support
        const folderName = metadata.folderName || "TokiSync";
        // Final Path: "TokiSync/SeriesTitle/Filename.zip"
        const finalPath = `TokiSync/${folderName}/${fullFileName}`.replace(/[<>:"|?*]/g, '_'); // Sanitization for safety

        console.log(`[Native] 자동 분류 다운로드 시도... (${finalPath})`);
        const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();

        return new Promise((resolve, reject) => {
            if (typeof GM_download !== 'function') {
                const err = "GM_download 권한이 없거나 지원되지 않는 환경입니다.";
                logger.error(`[Native] 실패: ${err}`);
                reject(new Error(err));
                return;
            }

            GM_download({
                url: URL.createObjectURL(content),
                name: finalPath,
                saveAs: false, // Use browser setting or automatic
                onload: () => {
                   logger.success(`[Native] 자동 저장 완료: ${fullFileName}`);
                   resolve(true);
                },
                onerror: (err) => {
                    const errMsg = err ? (err.error || err.reason || "알 수 없는 오류") : "알 수 없는 오류";
                    if (err && err.error === 'not_whitelisted') {
                        logger.critical(`[Native 방어] 다운로드 차단됨: 지원하지 않는 확장자입니다.\n👉 템퍼몽키 [설정] -> [고급] -> [Whitelisted File Extensions]에 '${extension}' 확장자(cbz/epub)를 추가해주세요.`);
                    } else {
                        logger.error(`[Native] 다운로드 실패: ${errMsg}`);
                    }
                    console.error("[Native Error]", err);
                    reject(new Error(errMsg));
                }
            });
        });
    } else if (type === 'drive') {
        const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();
        logger.log(`[Drive] 구글 드라이브 업로드 준비 중... (${fullFileName})`);
        
        try {
            // Call separate GAS module
            // metadata.folderName: Series Title (if provided), otherwise fallback to filename
            const targetFolder = metadata.folderName || filename;
            await (0,_gas_js__WEBPACK_IMPORTED_MODULE_0__/* .uploadToGAS */ .yv)(content, targetFolder, fullFileName, metadata);
            
            logger.success(`[Drive] 업로드 완료: ${fullFileName}`);
            // alert(`구글 드라이브 업로드 완료!\n${fullFileName}`); // Removed to prevent spam
        } catch (e) {
            console.error(e);
            logger.error(`[Drive] 업로드 실패: ${e.message}`);
            // Optional: Notify on error only if it's critical, but for individual files, log is better.
        }
    }
}

/**
 * Blob으로부터 이미지의 가로/세로 크기를 추출 (비동기)
 * @param {Blob} blob 
 * @returns {Promise<{width: number, height: number}>}
 */
async function getImageDimensions(blob) {
    try {
        const bitmap = await createImageBitmap(blob);
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close(); // 메모리 해제
        return dimensions;
    } catch (e) {
        console.warn('[Utils] Image dimensions extraction failed:', e);
        return { width: 0, height: 0 };
    }
}


/***/ }),

/***/ 963:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   LogBox: function() { return /* binding */ LogBox; },
/* harmony export */   fo: function() { return /* binding */ MenuModal; },
/* harmony export */   hV: function() { return /* binding */ markDownloadedItems; },
/* harmony export */   ze: function() { return /* binding */ Notifier; }
/* harmony export */ });
/* harmony import */ var _anti_sleep_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(209);
/* harmony import */ var _config_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(899);
/* harmony import */ var _parsers_ParserFactory_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(729);
/**
 * UI Module for TokiSync
 * Handles Logging Overlay and OS Notifications
 */





class LogBox {
    static instance = null;

    constructor() {
        if (LogBox.instance) return LogBox.instance;
        this.logs = [];
        this.MAX_LOGS = 500;
        this.init();
        LogBox.instance = this;
    }

    init() {
        if (document.getElementById('toki-logbox')) return;

        // -- Styles --
        const styleId = 'toki-logbox-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                #toki-logbox {
                    position: fixed; bottom: 90px; right: 100px;
                    width: 320px; height: 200px;
                    background: rgba(0, 0, 0, 0.85);
                    color: #0f0; font-family: monospace; font-size: 11px;
                    border: 1px solid #333; border-radius: 8px;
                    padding: 0; z-index: 9999;
                    display: none; flex-direction: column;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    backdrop-filter: blur(2px);
                }
                #toki-logbox-header {
                    padding: 5px 10px; background: rgba(255,255,255,0.1);
                    border-bottom: 1px solid #333;
                    display: flex; justify-content: space-between; align-items: center;
                    cursor: move; /* Dragging not implemented yet but visual cue */
                }
                #toki-logbox-title { font-weight: bold; color: #fff; }
                #toki-logbox-controls span { cursor: pointer; margin-left: 8px; color: #aaa; }
                #toki-logbox-controls span:hover { color: #fff; }
                #toki-logbox-content {
                    flex: 1; overflow-y: auto; padding: 10px; margin: 0;
                    list-style: none;
                }
                #toki-logbox-content li { margin-bottom: 2px; word-break: break-all; }
                #toki-logbox-content li.critical { color: #ff3333; font-weight: bold; background: rgba(255,50,50,0.1); padding: 1px 3px; border-radius: 2px; }
                #toki-logbox-content li.error { color: #ff5555; }
                #toki-logbox-content li.warn { color: #ffaa00; }
                #toki-logbox-content li.success { color: #55ff55; }
                
                /* Scrollbar */
                #toki-logbox-content::-webkit-scrollbar { width: 6px; }
                #toki-logbox-content::-webkit-scrollbar-track { background: transparent; }
                #toki-logbox-content::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

                /* --- MenuModal Styles (v1.5.0) --- */
                .toki-modal-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    z-index: 9999;
                    display: flex; justify-content: center; align-items: center;
                    opacity: 0; animation: tokiFadeIn 0.2s forwards;
                }
                .toki-modal {
                    width: 520px; max-width: 95%;
                    background: rgba(30, 32, 35, 0.95);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    overflow: hidden;
                    display: flex; flex-direction: column;
                    transform: translateY(20px); animation: tokiSlideUp 0.3s forwards;
                }
                .toki-modal-header {
                    padding: 18px 24px;
                    background: rgba(255, 255, 255, 0.05);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex; justify-content: space-between; align-items: center;
                }
                .toki-modal-title { font-size: 20px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 8px; }
                .toki-modal-close {
                    background: none; border: none; color: #aaa;
                    font-size: 20px; cursor: pointer; padding: 4px;
                }
                .toki-modal-close:hover { color: white; }
                
                .toki-modal-body { padding: 0; max-height: 80vh; overflow-y: auto; }
                
                /* Tabs (v1.8.1) */
                .toki-tabs {
                    display: flex; background: rgba(0,0,0,0.2);
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }
                .toki-tab-btn {
                    flex: 1; padding: 14px; background: none; border: none;
                    color: #888; font-size: 14px; font-weight: 600; cursor: pointer;
                    transition: all 0.2s; border-bottom: 2px solid transparent;
                    display: flex; justify-content: center; align-items: center; gap: 6px;
                }
                .toki-tab-btn:hover { color: #ddd; background: rgba(255,255,255,0.05); }
                .toki-tab-btn.active {
                    color: #fff; border-bottom-color: #6a5acd;
                    background: rgba(106, 90, 205, 0.1);
                }
                .toki-tab-content { display: none; padding: 24px; animation: tokiFadeIn 0.2s forwards; }
                .toki-tab-content.active { display: block; }

                /* Controls */
                .toki-control-group { margin-bottom: 15px; }
                .toki-control-group:last-child { margin-bottom: 0px; }
                .toki-label { display: block; font-size: 11px; color: #aaa; margin-bottom: 6px; }
                .toki-select {
                    width: 100%; padding: 8px;
                    background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px; color: #fff; font-size: 13px;
                }
                .toki-btn-action {
                    width: 100%; padding: 10px;
                    background: linear-gradient(135deg, #6a5acd, #483d8b);
                    border: none; border-radius: 6px;
                    color: #fff; font-size: 14px; font-weight: 500;
                    cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px;
                    transition: filter 0.2s;
                }
                .toki-btn-action:hover { filter: brightness(1.1); }
                .toki-btn-secondary { background: rgba(255,255,255,0.1); color: #ddd; }
                .toki-btn-secondary:hover { background: rgba(255,255,255,0.15); color: #fff; }
                
                /* Range Input */
                .toki-range-input {
                    width: 100%; padding: 8px 10px;
                    background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 6px; color: #fff; font-size: 13px; font-family: monospace;
                    transition: border-color 0.2s;
                    box-sizing: border-box;
                }
                .toki-range-input:focus { outline: none; border-color: #6a5acd; }
                .toki-range-hint { font-size: 11px; color: #666; margin-top: 5px; }

                /* FAB */
                .toki-fab {
                    position: fixed; bottom: 30px; right: 100px;
                    width: 56px; height: 56px;
                    background: #6a5acd; border-radius: 50%;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                    display: flex; justify-content: center; align-items: center;
                    cursor: pointer; transition: transform 0.2s, background 0.2s;
                    z-index: 9998;
                }
                .toki-fab:hover { background: #483d8b; transform: scale(1.05); }
                .toki-fab svg { width: 24px; height: 24px; fill: white; }

                @keyframes tokiFadeIn { to { opacity: 1; } }
                @keyframes tokiSlideUp { to { transform: translateY(0); } }
            `;
            document.head.appendChild(style);
        }

        // -- HTML --
        this.container = document.createElement('div');
        this.container.id = 'toki-logbox';
        this.container.innerHTML = `
            <div id="toki-logbox-header">
                <span id="toki-logbox-title">TokiSync Log</span>
                <div id="toki-logbox-controls">
                    <span id="toki-btn-report" title="버그 리포트 복사" style="cursor:pointer; color:#facc15;">📋</span>
                    <span id="toki-btn-audio" title="백그라운드 모드" style="cursor:pointer;">🔊</span>
                    <span id="toki-btn-clear" title="Clear">🚫</span>
                    <span id="toki-btn-close" title="Hide">❌</span>
                </div>
            </div>
            <ul id="toki-logbox-content"></ul>
        `;
        document.body.appendChild(this.container);

        // -- Events --
        this.list = this.container.querySelector('#toki-logbox-content');
        
        document.getElementById('toki-btn-report').onclick = () => this.exportReport();
        document.getElementById('toki-btn-clear').onclick = () => this.clear();
        document.getElementById('toki-btn-close').onclick = () => this.hide();
        
        // Anti-Sleep Button
        const audioBtn = document.getElementById('toki-btn-audio');
        if (audioBtn) {
            audioBtn.onclick = () => {
                try {
                    if ((0,_anti_sleep_js__WEBPACK_IMPORTED_MODULE_0__/* .isAudioRunning */ .S2)()) {
                        (0,_anti_sleep_js__WEBPACK_IMPORTED_MODULE_0__/* .stopSilentAudio */ .Cv)();
                        audioBtn.textContent = '🔊';
                        audioBtn.title = '백그라운드 모드 (꺼짐)';
                        this.log('[Anti-Sleep] 백그라운드 모드 비활성화');
                    } else {
                        (0,_anti_sleep_js__WEBPACK_IMPORTED_MODULE_0__/* .startSilentAudio */ .yS)();
                        audioBtn.textContent = '🔇';
                        audioBtn.title = '백그라운드 모드 (켜짐)';
                        this.log('[Anti-Sleep] 백그라운드 모드 활성화', 'success');
                    }
                } catch (e) {
                    this.error(`[Anti-Sleep] 실패: ${e.message}`);
                }
            };
        }
    }

    static getInstance() {
        if (!LogBox.instance) {
            new LogBox();
        }
        return LogBox.instance;
    }

    log(msg, type = 'normal', context = '') {
        if (!this.list) return;

        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        const prefix = context ? `[${context}] ` : '';
        const fullMsg = `[${time}] ${prefix}${msg}`;
        
        // Save to memory
        this.logs.push({ time, type, context, msg: typeof msg === 'string' ? msg : JSON.stringify(msg) });
        if (this.logs.length > this.MAX_LOGS) this.logs.shift();

        const li = document.createElement('li');
        li.textContent = fullMsg;
        
        if (type === 'error') li.classList.add('error');
        if (type === 'success') li.classList.add('success');

        this.list.appendChild(li);
        this.list.scrollTop = this.list.scrollHeight;
    }

    critical(msg, context = '') {
        this.show(); // Always surface critical errors
        this.log(msg, 'critical', context);
    }

    error(msg, context = '') {
        this.show(); // Auto-show on error
        this.log(msg, 'error', context);
    }

    warn(msg, context = '') {
        this.log(msg, 'warn', context);
    }

    success(msg, context = '') {
        this.log(msg, 'success', context);
    }

    clear() {
        if (this.list) this.list.innerHTML = '';
        this.logs = [];
    }

    show() {
        if (this.container) this.container.style.display = 'flex';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
    }

    async exportReport() {
        const version = typeof GM_info !== 'undefined' ? GM_info.script.version : 'Unknown';
        const ua = navigator.userAgent;
        // Include query parameters for accurate book ID tracking
        let currentUrl = window.location.href;
        // Sanitize sensitive tokens if any (like '?token=')
        currentUrl = currentUrl.replace(/([&?])(token|key|pwd)=[^&]+/g, '$1$2=***');
        
        // Retrieve run settings
        const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_1__/* .getConfig */ .zj)();
        const dest = config.destination || 'native';
        const isCbz = config.saveAs === 'cbz';
        const smartSkip = config.useSmartSkip ? 'ON' : 'OFF';

        // Severity grouping
        const critical = this.logs.filter(l => l.type === 'critical');
        const warn     = this.logs.filter(l => l.type === 'warn' || l.type === 'error');
        const info     = this.logs.filter(l => l.type !== 'critical' && l.type !== 'warn' && l.type !== 'error');

        const fmt = (logs) => logs.length
            ? logs.map(l => { const ctx = l.context ? `[${l.context}] ` : ''; return `[${l.time}] ${ctx}${l.msg}`; }).join('\n')
            : '(없음)';

        const report = `### 🐞 TokiSync Bug Report

**System Information:**
- **Version:** ${version}
- **URL:** \`${currentUrl}\`
- **User Agent:** ${ua}

**Execution Settings:**
- **Destination:** \`${dest}\`
- **Format:** \`${isCbz ? 'CBZ Archive' : 'Raw Images'}\`
- **Smart Skip:** \`${smartSkip}\`

### 🔴 CRITICAL (작업 중단 오류)
\`\`\`
${fmt(critical)}
\`\`\`

### 🟡 WARN (비치명 / 폴백 발생)
\`\`\`
${fmt(warn)}
\`\`\`

### ⚪ INFO (정상 흐름)
\`\`\`
${fmt(info)}
\`\`\`
`.trim();

        try {
            // Priority: GM_setClipboard > navigator.clipboard > execCommand
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(report);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(report);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = report;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                } catch (err) {
                    console.error('Copy Failed', err);
                }
                document.body.removeChild(textArea);
            }
            
            this.success('버그 리포트가 클립보드에 복사되었습니다.', 'System');
            Notifier.notify('TokiSync 버그 리포트', '클립보드 복사 완료! GitHub 이슈 탭이 열립니다.');
            
            setTimeout(() => {
                window.open('https://github.com/pray4skylark/tokiSync/issues/new', '_blank');
            }, 800);
            
        } catch (e) {
            this.error('리포트 복사실패: ' + e.message, 'System');
        }
    }

    toggle() {
        if (!this.container) return;
        if (this.container.style.display === 'none' || this.container.style.display === '') {
            this.show();
        } else {
            this.hide();
        }
    }

}

class Notifier {
    /**
     * Send OS Notification
     * @param {string} title 
     * @param {string} text 
     * @param {Function} onclick 
     */
    static notify(title, text, onclick = null) {
        if (typeof GM_notification === 'function') {
            GM_notification({
                title: title,
                text: text,
                timeout: 5000,
                onclick: onclick
            });
        } else {
            // Fallback
            console.log(`[Notification] ${title}: ${text}`);
            // Do not use alert() as it blocks execution
        }
    }
}

/**
 * MenuModal (v1.5.0)
 * Unified Menu with Accordion & FAB
 */
class MenuModal {
    static instance = null;

    constructor(handlers = {}) {
        if (MenuModal.instance) return MenuModal.instance;
        this.handlers = handlers; // { onDownload, openViewer, openSettings, toggleLog, ... }
        this.init();
        MenuModal.instance = this;
    }

    init() {
        if (document.getElementById('toki-menu-fab')) return;
        
        // 1. Create FAB
        this.createFAB();
        
        // 2. Keyboard Shortcut (Ctrl+Shift+T)
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't' || e.code === 'KeyT')) {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    createFAB() {
        const fab = document.createElement('div');
        fab.id = 'toki-menu-fab';
        fab.className = 'toki-fab';
        fab.title = 'TokiSync 메뉴 (Ctrl+Shift+T)';
        fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>`;
        
        fab.onclick = () => this.show();
        document.body.appendChild(fab);
    }

    render() {
        // Retrieve current config for UI state
        // We assume config is available or we pass it. For simplicity, we read it here if available, 
        // but ui.js doesn't import config directly to avoid circular dependency if possible.
        // Better to pass current state or read from GM_getValue directly purely for UI init if needed.
        
        const overlay = document.createElement('div');
        overlay.className = 'toki-modal-overlay';
        overlay.onclick = (e) => { if(e.target === overlay) this.close(overlay); };

        const modal = document.createElement('div');
        modal.className = 'toki-modal';
        overlay.appendChild(modal);

        // -- Header --
        const header = document.createElement('div');
        header.className = 'toki-modal-header';
        header.innerHTML = `
            <div class="toki-modal-title"><span>⚡ TokiSync</span></div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <button class="toki-modal-close" style="font-size: 14px; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; display: flex; align-items: center; gap: 4px;" id="toki-btn-viewer-link" title="Open Viewer">
                    🌐 <span style="font-size: 12px;">Viewer</span>
                </button>
                <button class="toki-modal-close" id="toki-btn-menu-close" title="Close">&times;</button>
            </div>
        `;
        modal.appendChild(header);

        // -- Tabs Header --
        const tabsHeader = document.createElement('div');
        tabsHeader.className = 'toki-tabs';
        tabsHeader.innerHTML = `
            <button class="toki-tab-btn active" data-tab="download">📥 다운로드</button>
            <button class="toki-tab-btn" data-tab="settings">⚙️ 설정</button>
            <button class="toki-tab-btn" data-tab="system">📝 시스템</button>
        `;
        modal.appendChild(tabsHeader);

        // -- Body --
        const body = document.createElement('div');
        body.className = 'toki-modal-body';
        
        // 1. Download Tab
        const tabDown = document.createElement('div');
        tabDown.className = 'toki-tab-content active';
        tabDown.id = 'toki-tab-download';
        tabDown.innerHTML = `
                <div class="toki-control-group">
                    <label class="toki-label">에피소드 범위 지정</label>
                    <input type="text" id="toki-range-input" class="toki-range-input"
                        placeholder="예: 1,2,4-10,15 (비우면 전체)">
                    <div class="toki-range-hint">쉼표(,)로 개별 번호, 하이픈(-)으로 연속 범위 지정</div>
                </div>
                <div class="toki-control-group">
                    <label class="toki-label" style="display:flex; align-items:center; gap:8px; cursor:pointer; color: #ddd; font-size: 13px;">
                        <input type="checkbox" id="toki-chk-force-overwrite" style="accent-color:#facc15; width: 16px; height: 16px;"> ⚠️ 강제 재다운로드 (기존 파일 덮어쓰기)
                    </label>
                </div>
                <button class="toki-btn-action" id="toki-btn-down-range" style="margin-top: 20px; height: 48px;">
                    <span>선택 다운로드 시작</span>
                </button>
                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
                <button class="toki-btn-action toki-btn-secondary" id="toki-btn-down-all" style="height: 44px;">
                    <span>전체 다운로드 (All Items)</span>
                </button>
        `;
        body.appendChild(tabDown);

        // 2. Settings Tab
        const tabSettings = document.createElement('div');
        tabSettings.className = 'toki-tab-content';
        tabSettings.id = 'toki-tab-settings';
        tabSettings.innerHTML = `
            <div class="toki-control-group">
                <label class="toki-label">다운로드 저장 방식</label>
                <select id="toki-sel-policy" class="toki-select">
                    <option value="individual">1. 개별 파일 (Individual)</option>
                    <option value="zipOfCbzs">2. 챕터 묶음 (ZIP of CBZs)</option>
                    <option value="native">3. 자동 분류 (Native)</option>
                    <option value="drive">4. 드라이브 업로드 (GoogleDrive)</option>
                </select>
            </div>
            <div id="toki-native-helper" style="display:none; margin-bottom: 20px; padding: 12px; background: rgba(255,165,0,0.1); border: 1px solid rgba(255,165,0,0.3); border-radius: 8px;">
                <div style="font-size: 11px; color: #ffa500; margin-bottom: 10px; line-height: 1.4;">
                    ⚠️ Native 모드는 Tampermonkey 설정에서 <b>'Download Mode: Browser API'</b> 활성화가 필요합니다.
                </div>
                <button class="toki-btn-action toki-btn-secondary" id="toki-btn-test-native" style="font-size: 12px; height: 32px;">
                    📂 자동 분류 기능 테스트
                </button>
            </div>
            <div class="toki-control-group">
                <label class="toki-label">다운로드 속도 (대기 시간)</label>
                <select id="toki-sel-speed" class="toki-select">
                        <option value="agile">빠름 (1-3초)</option>
                        <option value="cautious">신중 (2-5초)</option>
                        <option value="thorough">철저 (3-8초)</option>
                        <option value="slow">느림 (5-15초)</option>
                        <option value="very_slow">매우 느림 (10-30초)</option>
                </select>
            </div>
            <div class="toki-control-group">
                <label class="toki-label">소설 패키징 정책</label>
                <select id="toki-sel-novel-mode" class="toki-select">
                        <option value="perChapter">개별 회차 저장 (1회차 = 1파일)</option>
                        <option value="singleVolume">단행본 합본 저장 (범위 = 1파일)</option>
                </select>
            </div>
            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.05); margin: 20px 0;">
            <div class="toki-control-group">
                <button class="toki-btn-action toki-btn-secondary" id="toki-btn-advanced" style="font-size: 13px; height: 40px;">
                    🛠️ 고급 설정 상세 (경로, API키, 필터)
                </button>
            </div>
        `;
        body.appendChild(tabSettings);

        // 3. System Tab
        const tabSystem = document.createElement('div');
        tabSystem.className = 'toki-tab-content';
        tabSystem.id = 'toki-tab-system';
        tabSystem.innerHTML = `
                <div class="toki-control-group">
                    <button class="toki-btn-action toki-btn-secondary" id="toki-btn-log" style="height: 40px;">
                        <span>로그창 표시/숨기기</span>
                    </button>
                </div>
                <div class="toki-control-group">
                        <button class="toki-btn-action toki-btn-secondary" id="toki-btn-migration" style="font-size: 13px; height: 40px;">
                        📂 기존 파일명 표준화 (Migration)
                    </button>
                </div>
                <div class="toki-control-group">
                    <button class="toki-btn-action toki-btn-secondary" id="toki-btn-thumb-optim" style="font-size: 13px; height: 40px;">
                        🔄 썸네일 최적화 및 캐시 갱신
                    </button>
                </div>
                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.05); margin: 20px 0;">
                <div class="toki-control-group" style="display: flex; gap: 10px;">
                    <button class="toki-btn-action toki-btn-secondary" id="toki-btn-debug-extract" style="flex: 1; font-size: 12px; background: rgba(255, 255, 255, 0.05); border: 1px dashed rgba(255, 255, 255, 0.2);">
                        🧪 추출 테스트 (Debug)
                    </button>
                    <button class="toki-btn-action" id="toki-btn-debug-download" style="flex: 1.5; font-size: 13px; background: #2563eb; color: white;">
                        🚀 현재 회차 즉시 다운로드
                    </button>
                </div>
        `;
        body.appendChild(tabSystem);

        modal.appendChild(body);
        document.body.appendChild(overlay);

        // --- Bind Events & Init Logic ---
        this.bindEvents(overlay);
    }

    // Helper removed as no longer using accordion

    bindEvents(overlay) {
        // Tab Switching Logic
        const tabBtns = overlay.querySelectorAll('.toki-tab-btn');
        const tabContents = overlay.querySelectorAll('.toki-tab-content');

        tabBtns.forEach(btn => {
            btn.onclick = () => {
                const target = btn.getAttribute('data-tab');
                
                // Toggle Buttons
                tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                // Toggle Contents
                tabContents.forEach(c => {
                    c.classList.toggle('active', c.id === `toki-tab-${target}`);
                });
            };
        });

        // Headers
        document.getElementById('toki-btn-menu-close').onclick = () => this.close(overlay);
        document.getElementById('toki-btn-viewer-link').onclick = () => {
             if(this.handlers.openViewer) this.handlers.openViewer();
        };

        // Download
        document.getElementById('toki-btn-down-all').onclick = () => {
            const force = document.getElementById('toki-chk-force-overwrite').checked;
            if(this.handlers.downloadAll) this.handlers.downloadAll(force);
            this.close(overlay);
        };
        document.getElementById('toki-btn-down-range').onclick = () => {
            const spec = document.getElementById('toki-range-input').value.trim();
            const force = document.getElementById('toki-chk-force-overwrite').checked;
            if (this.handlers.downloadRange) {
                this.handlers.downloadRange(spec || undefined, force);
            }
            this.close(overlay);
        };

        // Settings
        const selPolicy = document.getElementById('toki-sel-policy');
        const selSpeed = document.getElementById('toki-sel-speed');
        const selNovelTerm = document.getElementById('toki-sel-novel-mode');

        // Load Initial Values (Need to fetch via handler or GM)
        if (this.handlers.getConfig) {
            const cfg = this.handlers.getConfig();
            if (cfg.policy && selPolicy) selPolicy.value = cfg.policy;
            if (cfg.sleepMode && selSpeed) selSpeed.value = cfg.sleepMode;
            if (cfg.novelMode && selNovelTerm) selNovelTerm.value = cfg.novelMode;
        }

        selPolicy.onchange = () => { 
            if(this.handlers.setConfig) this.handlers.setConfig('TOKI_DOWNLOAD_POLICY', selPolicy.value);
            this.updateNativeHelper(selPolicy.value);
        };
        this.updateNativeHelper(selPolicy.value);
        
        // Native Test Button
        const testBtn = document.getElementById('toki-btn-test-native');
        if (testBtn) {
            testBtn.onclick = async () => {
                if (this.handlers.testNativeDownload) {
                    testBtn.disabled = true;
                    testBtn.textContent = '⏳ 테스트 중...';
                    const success = await this.handlers.testNativeDownload();
                    if (success) {
                        testBtn.textContent = '✅ 테스트 성공 (폴더 확인)';
                        testBtn.style.color = '#55ff55';
                    } else {
                        testBtn.textContent = '❌ 테스트 실패 (설정 확인)';
                        testBtn.style.color = '#ff5555';
                    }
                    setTimeout(() => {
                        testBtn.disabled = false;
                        testBtn.textContent = '📂 자동 분류 기능 테스트';
                        testBtn.style.color = '';
                    }, 3000);
                }
            };
        }

        if (selSpeed) selSpeed.onchange = () => { if(this.handlers.setConfig) this.handlers.setConfig('TOKI_SLEEP_MODE', selSpeed.value); };
        if (selNovelTerm) selNovelTerm.onchange = () => { if(this.handlers.setConfig) this.handlers.setConfig('TOKI_NOVEL_MODE', selNovelTerm.value); };

        document.getElementById('toki-btn-advanced').onclick = () => {
            if(this.handlers.openSettings) this.handlers.openSettings();
            // Typically advanced settings opens another modal, so we might want to close this one or keep it behind.
            // Let's keep it open or close it? 
            // Existing logic: showConfigModal() removes existing modal? 
            // Let's close this menu for clarity.
            this.close(overlay); 
        };
        document.getElementById('toki-btn-migration').onclick = () => {
            if(this.handlers.migrateFilenames) this.handlers.migrateFilenames();
            this.close(overlay);
        };

        // System
        document.getElementById('toki-btn-log').onclick = () => {
            if(this.handlers.toggleLog) this.handlers.toggleLog();
        };
        document.getElementById('toki-btn-debug-extract').onclick = () => {
             if(this.handlers.testExtraction) this.handlers.testExtraction();
        };
        document.getElementById('toki-btn-debug-download').onclick = () => {
             if(this.handlers.downloadCurrent) this.handlers.downloadCurrent();
             this.close(overlay);
        };
         document.getElementById('toki-btn-thumb-optim').onclick = () => {
            if(this.handlers.migrateThumbnails) this.handlers.migrateThumbnails();
            this.close(overlay);
        };
    }

    // getEpisodeRange 핸들러는 슬라이더 제거로 더 이상 UI에서 사용 안 함 (main.js 호환용으로 유지)

    show() {
        this.render();
    }

    close(overlay) {
        if(overlay) {
            overlay.style.transition = 'opacity 0.2s';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
        }
    }

    toggle() {
        const existing = document.querySelector('.toki-modal-overlay');
        if (existing) this.close(existing);
        else this.show();
    }

    updateNativeHelper(policy) {
        const helper = document.getElementById('toki-native-helper');
        if (helper) {
            helper.style.display = (policy === 'native') ? 'block' : 'none';
        }
    }
}

/**
 * Mark downloaded items in the list (UI Sync)
 * @param {string[]} historyList Array of episode IDs (e.g. ["0001", "0002"])
 */
async function markDownloadedItems(historyList) {
    if (!historyList || historyList.length === 0) return;

    // Use Set for fast lookup
    const historySet = new Set(historyList.map(id => id.toString())); // Ensure string comparison

    const parser = await _parsers_ParserFactory_js__WEBPACK_IMPORTED_MODULE_2__/* .ParserFactory */ .O.getParser();
    if (!parser) {
        console.warn('[UI] 파서를 찾을 수 없어 다운로드 표시를 생략합니다.');
        return;
    }

    const items = parser.getListItems();
    let markedCount = 0;

    items.forEach(li => {
        try {
            const item = parser.parseListItem(li);
            if (!item) return; // Skip if parse failed
            
            const { num, element } = item;

            if (num) {
                // Normalize: '0001' -> '1', '1' -> '1' for comparison
                const normalizedNum = parseInt(num).toString();
                
                // Check if ANY items in history set matches this number
                let isDownloaded = historySet.has(num) || historySet.has(normalizedNum);
                
                // Try left-pad match
                if(!isDownloaded && normalizedNum.length < 4) {
                    const padded = normalizedNum.padStart(4, '0');
                    isDownloaded = historySet.has(padded);
                }

                if (isDownloaded) {
                    // Visual Indicator
                    element.style.opacity = '0.6';
                    element.style.backgroundColor = 'rgba(0, 255, 0, 0.05)';
                    
                    // Add Badge if not exists
                    if (!element.querySelector('.toki-badge')) {
                        const badge = document.createElement('span');
                        badge.className = 'toki-badge';
                        badge.innerText = '✅';
                        badge.style.marginLeft = '5px';
                        badge.style.fontSize = '12px';
                        
                        // Priority: Link element inside the list item
                        const linkEl = element.querySelector('a');
                        if (linkEl) {
                            linkEl.prepend(badge);
                        } else {
                            element.prepend(badge);
                        }
                    }
                    markedCount++;
                }
            }
        } catch (e) {
            console.warn('[UI] 특정 항목(li) 마킹 중 오류 발생 (건너뜀):', e);
        }
    });

    
    console.log(`[UI] ${markedCount}개 항목에 다운로드 완료 표시 적용.`);
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	!function() {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = function(exports, definition) {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	!function() {
/******/ 		__webpack_require__.o = function(obj, prop) { return Object.prototype.hasOwnProperty.call(obj, prop); }
/******/ 	}();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};

// EXTERNAL MODULE: ./src/core/utils.js
var utils = __webpack_require__(924);
// EXTERNAL MODULE: ./src/core/ui.js
var ui = __webpack_require__(963);
;// ./src/core/novel-decryptor.js
/**
 * [전략 B] 소설 API 기반 복호화 모듈
 * Closed Shadow DOM 및 XOR 암호화를 우회하여 API를 통해 직접 평문을 추출합니다.
 */

// 이스케이프 유무 모두 대응: "token":"eyJ..." 또는 \"token\":\"eyJ...\"
const RE_TOKEN = /\\?"token\\?":\\?"(eyJ[A-Za-z0-9_-]+[A-Za-z0-9_=.-]*)\\?"/;

/**
 * Base64URL 디코딩
 */
function b64urlDecode(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - str.length % 4);
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/**
 * Base64URL 인코딩
 */
function b64urlEncode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * HMAC-SHA256 서명 (Proof 생성용)
 */
async function hmacSign(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return b64urlEncode(new Uint8Array(sig));
}

/**
 * XOR 복호화
 */
function xorDecrypt(payloadB64, keyB64) {
    const payload = b64urlDecode(payloadB64);
    const key = b64urlDecode(keyB64);
    const result = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) {
        result[i] = payload[i] ^ key[i % key.length];
    }
    return new TextDecoder('utf-8').decode(result);
}

/**
 * document.cookie에서 특정 쿠키 값 가져오기
 */
function getCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * nv 쿠키 삭제 후 새로 발급 (세션 차단 복구용)
 */
async function resetNvCookie(cookieName) {
    console.log(`[Decryptor] ${cookieName} 쿠키 리셋 중...`);
    // 모든 경로에 대해 쿠키 삭제
    document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    // 새 쿠키 발급
    await fetch('/api/nv-issue', { method: 'POST', credentials: 'same-origin' });
    console.log(`[Decryptor] ${cookieName} 쿠키 재발급 완료`);
}

/**
 * URL에서 novelId와 episodeId 추출
 */
function getIdsFromUrl(url) {
    const match = url.match(/\/novel\/(\d+)\/(\d+)/);
    if (!match) return null;
    return { novelId: match[1], episodeId: match[2] };
}

/**
 * [Main] 에피소드 URL로부터 평문 텍스트를 직접 추출하여 반환
 * @param {string} episodeUrl 에피소드 주소
 * @param {Object} config 규칙의 decryptApi 설정
 * @param {boolean} _isRetry 내부 재시도 여부 (외부에서 사용 금지)
 * @returns {Promise<string|null>} 복호화된 평문 (실패 시 null)
 */
async function fetchNovelText(episodeUrl, config = {}, _isRetry = false) {
    const endpoint = config.endpoint || '/api/novel-content';
    const cookieName = config.cookieName || 'nv';
    const clientHeader = config.clientHeader || 'shadow-v2';

    try {
        const ids = getIdsFromUrl(episodeUrl);
        if (!ids) return null;

        // 1. Fresh Token 추출 (토큰은 에피소드별 + 짧은 TTL이므로 항상 새로 가져옴)
        const html = await fetch(episodeUrl, { credentials: 'same-origin' }).then(r => r.text());
        const tokenMatch = html.match(RE_TOKEN);
        if (!tokenMatch) {
            console.warn('[Decryptor] 토큰 추출 실패 (API 호출 중단)');
            return null;
        }
        const token = tokenMatch[1];

        // 2. 쿠키 확인 (XOR 키)
        let cookie = getCookie(cookieName);
        if (!cookie) {
            console.log('[Decryptor] 쿠키 없음 - nv-issue 시도');
            await fetch('/api/nv-issue', { method: 'POST', credentials: 'same-origin' });
            cookie = getCookie(cookieName);
        }
        if (!cookie) return null;
        const xorKey = cookie.split('.')[0];

        // 3. Proof 생성 (HMAC)
        const nonce = b64urlEncode(crypto.getRandomValues(new Uint8Array(24)));
        const proof = await hmacSign(cookie, `${token}.${nonce}.${navigator.userAgent}`);

        // 4. API 호출
        const resp = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'content-type': 'application/json',
                'x-novel-client': clientHeader
            },
            body: JSON.stringify({
                novelId: ids.novelId,
                episodeId: ids.episodeId,
                token, nonce, proof
            })
        });

        // 5. API 실패 시 — 세션 차단 감지 → 쿠키 리셋 후 1회 재시도
        if (!resp.ok) {
            if (!_isRetry) {
                console.warn(`[Decryptor] API 실패 (${resp.status}) → 세션 차단 의심, 쿠키 리셋 후 재시도`);
                await resetNvCookie(cookieName);
                return fetchNovelText(episodeUrl, config, true); // 재시도는 딱 1회
            }
            console.error(`[Decryptor] 재시도 후에도 실패 (${resp.status})`);
            return null;
        }

        const data = await resp.json();
        if (!data.ok || !data.payload) return null;

        // 6. XOR 복호화
        return xorDecrypt(data.payload, xorKey);

    } catch (e) {
        console.error('[Decryptor] 복호화 과정 중 예외 발생:', e);
        return null;
    }
}

;// ./src/core/extractor.js




/**
 * 뷰어 페이지(또는 팝업 워커) 내에서 직접 데이터를 추출하는 범용 모듈
 * 
 * @param {Document} targetDoc 대상 문서 객체 (현재 창의 document 또는 iframe 내부 document)
 * @param {Object} parser 선택된 사이트의 GenericParser 인스턴스
 * @param {Object} siteInfo 사이트 메타데이터 (category 등)
 * @param {boolean} isStaticDoc XHR로 가져온 정적 HTML인지 여부
 * @param {string} episodeUrl 에피소드 URL (API 복호화 폴백용)
 * @returns {Promise<Object>} 추출 결과 { urls: string[], content: string, title: string, episodeTitle: string }
 */
async function extractEpisodeData(targetDoc, parser, siteInfo, isStaticDoc = false, episodeUrl = null) {
    const logger = ui.LogBox.getInstance();
    const isNovel = (siteInfo.category === 'Novel' || siteInfo.category === 'novel');
    const viewerCfg = parser.rule.viewer || {};

    let extractedData = {
        urls: [],
        content: "",
        seriesTitle: "",
        episodeTitle: "",
        episodeNum: ""
    };

    // 1. 소설 텍스트 추출 로직
    if (isNovel) {
        extractedData.content = parser.getNovelContent(targetDoc);

        // [전략 B] DOM 추출 실패 + API 복호화 설정이 있는 경우 폴백 시도
        if (!extractedData.content && viewerCfg.decryptApi && episodeUrl) {
            logger.log('[Extractor] DOM 추출 실패 - API 복호화 폴백 시도...', 'Extractor');
            extractedData.content = await fetchNovelText(episodeUrl, viewerCfg.decryptApi);
            if (extractedData.content) {
                logger.log('✅ API 복호화 폴백 성공', 'Extractor');
            }
        }
    } 
    // 2. 웹툰 이미지 추출 로직
    else {
        // 초기 파싱 (정규식/DOM)
        const initialUrls = parser.getImageList(targetDoc);

        // 물리 스크롤 대기 (정적 문서는 스킵)
        if (!isStaticDoc && targetDoc.defaultView) {
            await (0,utils/* scrollToLoad */.Vs)(targetDoc, 20000, viewerCfg);
        } else {
            console.log('[Extractor] 정적 문서이거나 Window 객체가 없어 스크롤을 건너뜁니다.');
        }

        // 스크롤 후 최종 파싱
        let finalUrls = isStaticDoc ? initialUrls : parser.getImageList(targetDoc);

        // Dummy(Placeholder) 우회 병합
        const mergedUrls = finalUrls.map((final, idx) => {
            const initial = initialUrls[idx];
            if (final.isDummy && initial && !initial.isDummy) {
                console.log(`[Extractor] Placeholder 우회: ${final.url.split('/').pop()} -> ${initial.url.split('/').pop()}`);
                return initial.url;
            }
            return final.url;
        }).filter(url => url !== "");

        logger.log(`[Extractor] 이미지 ${mergedUrls.length}개 감지`, 'Extractor');

        // 이미지 감지 0개 시 1.5초 대기 후 재시도
        if (mergedUrls.length === 0 && !isStaticDoc) {
            logger.warn('[Extractor] 이미지 0개 — 1.5초 후 재파싱 시도', 'Extractor');
            await (0,utils/* sleep */.yy)(1500);
            const retryUrls = parser.getImageList(targetDoc);
            if (retryUrls.length > 0) mergedUrls.push(...retryUrls.map(u => u.url).filter(u => u !== ""));
            logger.log(`[Extractor] 재파싱 결과: ${mergedUrls.length}개`, 'Extractor');
        }

        extractedData.urls = mergedUrls;
    }

    // 3. 메타데이터 (작품명, 에피소드 제목) 자체 추출 시도
    // 뷰어 페이지에서 직접 단건 실행하거나 팝업 워커일 경우를 대비함
    try {
        if (parser.getViewerMetadata) {
            const metadata = parser.getViewerMetadata(targetDoc);
            extractedData.seriesTitle = metadata.seriesTitle;
            extractedData.episodeTitle = metadata.episodeTitle;
            extractedData.episodeNum = metadata.episodeNum;
        }
    } catch (e) {
        console.warn("[Extractor] 뷰어 메타데이터 추출 실패:", e);
    }

    return extractedData;
}

// EXTERNAL MODULE: ./src/core/parsers/ParserFactory.js + 2 modules
var ParserFactory = __webpack_require__(729);
// EXTERNAL MODULE: ./src/core/detector.js + 1 modules
var detector = __webpack_require__(739);
;// ./src/core/epub.js
class EpubBuilder {
    constructor() {
        this.chapters = [];
    }

    addChapter(title, textContent) {
        // Simple text to HTML conversion
        // Splits by newlines and wraps in <p>
        const htmlContent = textContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => `<p>${line}</p>`)
            .join('\n');
            
        this.chapters.push({ title, content: htmlContent });
    }

    async build(metadata = {}) {
        try {
            const zip = new JSZip();
            const title = metadata.title || "Unknown Title";
            const author = metadata.author || "Unknown Author";
            const uid = "urn:uuid:" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());

            // 1. mimetype (must be first, uncompressed)
            zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

            // 2. container.xml
            zip.folder("META-INF").file("container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`);

            // 3. OEBPS Folder
            const oebps = zip.folder("OEBPS");

            // styles.css
            oebps.file("styles.css", `body { font-family: sans-serif; } p { text-indent: 1em; margin-bottom: 0.5em; }`);

            // Chapters
            this.chapters.forEach((chapter, index) => {
                const filename = `chapter_${index + 1}.xhtml`;
                const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>${chapter.title}</title>
<link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
<h2>${chapter.title}</h2>
${chapter.content}
</body>
</html>`;
                oebps.file(filename, xhtml);
            });

            // content.opf
            let manifest = `<item id="style" href="styles.css" media-type="text/css"/>\n`;
            let spine = ``;
            let tocNav = `<navMap>\n`;

            this.chapters.forEach((c, i) => {
                const id = `chap${i + 1}`;
                const href = `chapter_${i + 1}.xhtml`;
                manifest += `<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>\n`;
                spine += `<itemref idref="${id}"/>\n`;
                tocNav += `<navPoint id="${id}" playOrder="${i+1}"><navLabel><text>${c.title}</text></navLabel><content src="${href}"/></navPoint>\n`;
            });
            // Add NCX to manifest
            manifest += `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`;

            const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:title>${title}</dc:title>
        <dc:creator opf:role="aut">${author}</dc:creator>
        <dc:language>ko</dc:language>
        <dc:identifier id="BookId">${uid}</dc:identifier>
    </metadata>
    <manifest>
        ${manifest}
    </manifest>
    <spine toc="ncx">
        ${spine}
    </spine>
</package>`;

            oebps.file("content.opf", opf);

            // toc.ncx
            const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
    <meta name="dtb:uid" content="${uid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${title}</text></docTitle>
${tocNav}
</navMap>
</ncx>`;

            oebps.file("toc.ncx", ncx);

            // Return the ZIP object (which IS the EPUB)
            return zip; 
        } catch (e) {
            const { LogBox } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 963));
            LogBox.getInstance().critical(`EPUB 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, 'Builder:EPUB');
            throw e;
        }
    }
}

;// ./src/core/cbz.js

class CbzBuilder {
    constructor() {
        this.chapters = [];
    }

    addChapter(title, images) {
        // images: array of { blob, ext }
        this.chapters.push({ title, images });
    }

    async build(metadata = {}) {
        try {
            const zip = new JSZip();
            
            // Kavita Compatibility: Images at root, no subfolders
            // Note: As per new strategy, we only build one chapter per CBZ.
            this.chapters.forEach((chapter) => {
                chapter.images.forEach((img, idx) => {
                    if (img && img.blob) {
                        const filename = img.isMissing 
                            ? `[PAGE_MISSING]_image_${String(idx).padStart(4, '0')}${img.ext}`
                            : `image_${String(idx).padStart(4, '0')}${img.ext}`;
                        zip.file(filename, img.blob);
                    }
                });
            });

            const comicInfo = this.generateComicInfo(metadata);
            zip.file("ComicInfo.xml", comicInfo);

            return zip;
        } catch (e) {
            const { LogBox } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 963));
            LogBox.getInstance().critical(`CBZ 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, 'Builder:CBZ');
            throw e;
        }
    }

    generateComicInfo(metadata) {
        const series = metadata.series || "Unknown Series";
        const title = metadata.title || "";
        const number = metadata.number || "";
        const writer = metadata.writer || "";
        const pageCount = this.chapters.reduce((acc, chap) => acc + chap.images.length, 0);

        return `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Series>${this.escapeXml(series)}</Series>
  <Number>${number}</Number>
  <Title>${this.escapeXml(title)}</Title>
  <Writer>${this.escapeXml(writer)}</Writer>
  <LanguageISO>ko</LanguageISO>
  <PageCount>${pageCount}</PageCount>
  <Manga>YesAndRightToLeft</Manga>
</ComicInfo>`;
    }

    escapeXml(unsafe) {
        return unsafe.replace(/[<>&"']/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '"': return '&quot;';
                case "'": return '&apos;';
            }
        });
    }
}

;// ./src/core/txt.js
class TxtBuilder {
    constructor() {
        this.content = "";
    }

    addChapter(title, textContent) {
        this.content += `\n\n=== ${title} ===\n\n`;
        this.content += textContent;
    }

    async build(metadata = {}) {
        try {
            // Return an object that duck-types JSZip's generateAsync
            return {
                generateAsync: async () => {
                    // Prepend metadata title at the top if available
                    let finalContent = this.content;
                    if (metadata.title) {
                        finalContent = `[ ${metadata.title} ]\n` + finalContent;
                    }
                    return new Blob([finalContent], { type: 'text/plain;charset=utf-8' });
                }
            };
        } catch (e) {
            const { LogBox } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 963));
            LogBox.getInstance().critical(`TXT 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, 'Builder:TXT');
            throw e;
        }
    }
}

// EXTERNAL MODULE: ./src/core/config.js
var core_config = __webpack_require__(899);
// EXTERNAL MODULE: ./src/core/anti_sleep.js
var anti_sleep = __webpack_require__(209);
// EXTERNAL MODULE: ./src/core/gas.js
var gas = __webpack_require__(488);
// EXTERNAL MODULE: ./src/core/network.js
var network = __webpack_require__(391);
;// ./src/core/downloader.js














// Sleep Policy Presets
const SLEEP_POLICIES = {
    agile: { min: 1000, max: 3000 },      // 빠름 (1-3초)
    cautious: { min: 2000, max: 5000 },   // 신중 (2-5초)
    thorough: { min: 3000, max: 8000 },   // 철저 (3-8초)
    slow: { min: 5000, max: 15000 },      // 느림 (5-15초)
    very_slow: { min: 10000, max: 30000 } // 매우 느림 (10-30초)
};

// Processing Loop에 해당되는 로직을 분리 한다.
async function processItem(item, builder, siteInfo, iframe, parser, seriesTitle = "", targetDoc = null) {
    const { category } = siteInfo;
    const isNovel = (category === 'Novel' || category === 'novel');
    const viewerCfg = parser.rule.viewer || {};
    const fetchMethod = viewerCfg.fetchMethod || (isNovel ? 'xhr' : 'iframe');

    // Apply Dynamic Sleep based on Policy
    const config = (0,core_config/* getConfig */.zj)();
    let policy = SLEEP_POLICIES[config.sleepMode] || SLEEP_POLICIES.agile;

    let iframeDoc = targetDoc;
    let isStaticDoc = false;

    // [전략 B] fetchMethod === 'api'는 targetDoc 여부와 무관하게 항상 API 경로 우선
    if (fetchMethod === 'api') {
        const logger = ui.LogBox.getInstance();
        logger.log(`[API] 직접 복호화 시도 중 (대기: ${policy.min / 1000}~${policy.max / 1000}초): ${item.title}`, 'Downloader');

        const text = await fetchNovelText(item.src, viewerCfg.decryptApi || {});

        if (text) {
            let cleanText = text;
            
            // 1. 앞부분 껍데기 제거 (text 또는 html 형식을 모두 지원하며, 문자열 시작 부분만 타겟팅)
            cleanText = cleanText.replace(/^\{"kind"\s*:\s*"(text|html)"\s*,\s*"(text|html)"\s*:\s*"/, '');
            
            // 2. 뒷부분 껍데기 제거 (", "css":"" } 또는 "} 로 끝나는 모든 경우 대응)
            cleanText = cleanText.replace(/"\s*(,\s*"css"\s*:\s*""\s*)?\}$/, '');
            
            // 3. 줄바꿈 이스케이프(\n)를 실제 줄바꿈으로 변환
            cleanText = cleanText.replace(/\\n/g, '\n');
            
            // 4. 따옴표 이스케이프(\")를 실제 쌍따옴표로 변환
            cleanText = cleanText.replace(/\\"/g, '"');

            builder.addChapter(item.title, cleanText);
            logger.log(`✅ 복호화 성공: ${item.title}`, 'Downloader');
        } else {
            throw new Error(`복호화 실패 (API 응답 없음)`);
        }

        await (0,utils/* sleep */.yy)(policy.min, policy.max);
        return; // DOM 파이프라인 완전 우회
    }

    if (!iframeDoc) {
        if (fetchMethod === 'xhr') {
            const logger = ui.LogBox.getInstance();
            logger.log(`[XHR] 문서 파싱 중...`, 'Downloader');
            
            const responseText = await new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest === 'undefined') {
                    reject(new Error("GM_xmlhttpRequest 권한이 없습니다. iframe 폴백을 설정해주세요."));
                    return;
                }
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: item.src,
                    headers: { "Referer": window.location.origin },
                    onload: (res) => resolve(res.responseText),
                    onerror: (err) => reject(new Error("네트워크 오류: " + (err.statusText || 'Unknown')))
                });
            });

            const parserObj = new DOMParser();
            iframeDoc = parserObj.parseFromString(responseText, "text/html");
            isStaticDoc = true;

            await (0,utils/* sleep */.yy)(policy.min, policy.max);
        } else {
            await (0,utils/* waitIframeLoad */.eO)(iframe, item.src, viewerCfg);
            await (0,utils/* sleep */.yy)(policy.min, policy.max);
            
            try {
                const win = iframe.contentWindow;
                if (!win) throw new Error("NoWindow");
                iframeDoc = win.document;
                const title = iframeDoc.title; // CORS/Access Check
                
                // [v1.8.1] 만약 내용이 아예 없거나 보안 차단 문구가 보인다면 에러 발생시켜 XHR로 유도
                if (!title || title.includes('403') || title.includes('Cloudflare')) {
                    if (iframeDoc.body.innerHTML.length < 100) {
                        throw new Error("IframeBlockedOrEmpty");
                    }
                }
            } catch (e) {
                console.warn('[Downloader] iframe 접근 차단 감지(CORS). XHR 방식으로 즉시 폴백합니다.', e);
                const responseText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: item.src,
                        headers: { "Referer": window.location.origin },
                        onload: (res) => resolve(res.responseText),
                        onerror: (err) => reject(new Error("XHR 폴백 실패: " + (err.statusText || 'Unknown')))
                    });
                });
                const parserObj = new DOMParser();
                iframeDoc = parserObj.parseFromString(responseText, "text/html");
                isStaticDoc = true;
            }
        }
    }

    // --- [v1.8.2] 1단계: 모듈화된 파이프라인(Extractor) 호출 ---
    const extractedData = await extractEpisodeData(iframeDoc, parser, siteInfo, isStaticDoc, item.src);
    
    // 메타데이터가 뷰어에서 추출되었다면 활용 (단건 다운로드 등)
    const finalTitle = extractedData.episodeTitle && extractedData.episodeTitle !== "UnknownEpisode" 
                       ? extractedData.episodeTitle 
                       : item.title;

    if (isNovel) {
        if (!extractedData.content) {
            throw new Error(`텍스트 본문 추출 실패 (DOM 또는 API 모두 감지 불가)`);
        }
        builder.addChapter(finalTitle, extractedData.content);
    } 
    else {
        const logger = ui.LogBox.getInstance();
        const mergedUrls = extractedData.urls;

        if (mergedUrls.length === 0) {
            throw new Error(`이미지 URL 감지 실패 (뷰어 컨테이너 또는 속성 탐색 불가)`);
        }

        // Fetch Images Parallel
        let images = await fetchImages(mergedUrls);
        
        // [v1.7.3] Deep Fallback: 기준 하향 (70KB -> 30KB) 및 누락 확인
        const suspiciousCount = images.filter(img => img.blob.size < 30000 || img.isMissing).length;
        if (suspiciousCount > mergedUrls.length / 2) {
            logger.warn(`[Deep Fallback] 다수의 저용량 이미지 감지 (${suspiciousCount}/${mergedUrls.length}). 2초 후 강제 재스크롤 재시도...`, 'System');
            await (0,utils/* sleep */.yy)(2000); // v1.7.2: 5s -> 2s
            await (0,utils/* scrollToLoad */.Vs)(iframeDoc, 12000); // 더 길게 대기
            const finalRetryUrls = parser.getImageList(iframeDoc);
            images = await fetchImages(finalRetryUrls);
        }

        // Add chapter to builder
        let chapterTitleOnly = item.title;
        if (seriesTitle && chapterTitleOnly.startsWith(seriesTitle)) {
            chapterTitleOnly = chapterTitleOnly.replace(seriesTitle, '').trim();
        }

        const chapterMatch = chapterTitleOnly.match(/(\d+)화/);
        const chapterNum = chapterMatch ? chapterMatch[1].padStart(4, '0') : item.num;
        const cleanChapterTitle = `${chapterNum} ${chapterTitleOnly}`;
        builder.addChapter(cleanChapterTitle, images);
    }
}


/**
 * "1,2,4-10,15" 형식 문자열을 에피소드 번호 Set으로 변환
 * @param {string} spec - 범위 문자열. 빈 값이면 null 반환 (전체 의미)
 * @returns {Set<number>|null}
 */
function parseRangeSpec(spec) {
    if (!spec || !spec.trim()) return null; // 빈 입력 = 전체
    const nums = new Set();
    const parts = spec.split(',');
    for (const part of parts) {
        const trimmed = part.trim();
        const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const from = parseInt(rangeMatch[1]);
            const to   = parseInt(rangeMatch[2]);
            for (let n = Math.min(from, to); n <= Math.max(from, to); n++) nums.add(n);
        } else if (/^\d+$/.test(trimmed)) {
            nums.add(parseInt(trimmed));
        }
    }
    return nums.size > 0 ? nums : null;
}

async function tokiDownload(rangeSpec, policy = 'zipOfCbzs', forceOverwrite = false) {
    const logger = ui.LogBox.getInstance();
    logger.init();
    logger.show();
    logger.log(`다운로드 시작 (정책: ${policy}, 강제 덮어쓰기: ${forceOverwrite})...`);

    // Auto-start Anti-Sleep mode
    try {
        (0,anti_sleep/* startSilentAudio */.yS)();
        logger.success('[Anti-Sleep] 백그라운드 모드 자동 활성화');
    } catch (e) {
        logger.log('[Anti-Sleep] 자동 시작 실패 (사용자 상호작용 필요)', 'error');
    }

    const failedEpisodes = [];  // [v1.8.1] 완전 실패 리스트
    const partialFailures = []; // [v1.8.1] 부분 실패 리스트 (이미지 일부 누락)
    const siteInfo = await (0,detector/* detectSite */.T)();
    if (!siteInfo) {
        alert("지원하지 않는 사이트이거나 다운로드 페이지가 아닙니다.");
        (0,anti_sleep/* stopSilentAudio */.Cv)();
        return;
    }

    const parser = await ParserFactory/* ParserFactory */.O.getParser();
    if (!parser) {
        alert("파서를 초기화할 수 없습니다.");
        (0,anti_sleep/* stopSilentAudio */.Cv)();
        return;
    }

    const { category, matchedRule } = siteInfo;
    const siteName = matchedRule?.name || "TokiSync Parser";
    const isNovel = (category === 'Novel' || category === 'novel');

    try {
        // Prepare Strategy Variables
        let mainBuilder = null;
        let masterZip = null;
        let extension = 'zip';
        let destination = 'local'; // 기본 저장 대상
        let buildingPolicy = 'individual'; // 기본 빌딩 정책
        
        // [v1.6.0] 4대 정책 라우팅
        if (policy === 'individual') {
            buildingPolicy = 'individual';
            destination = 'local';
        } else if (policy === 'zipOfCbzs') {
            buildingPolicy = 'zipOfCbzs';
            destination = 'local';
        } else if (policy === 'native') {
            buildingPolicy = 'individual'; // 빌딩은 개별 CBZ 단위로 동일
            destination = 'native';        // 저장 대상만 GM_download로 변경
        } else if (policy === 'drive') {
            buildingPolicy = 'individual'; // 빌딩은 개별 CBZ 단위
            destination = 'drive';         // 저장 대상은 Google Drive
        // 하위 호환: 구버전 정책 명칭 지원
        } else if (policy === 'gasUpload') {
            buildingPolicy = 'individual';
            destination = 'drive';
            logger.log('⚠️ gasUpload 정책은 drive로 대체되었습니다.', 'warn');
        } else if (policy === 'folderInCbz') {
            buildingPolicy = 'zipOfCbzs';
            destination = 'local';
            logger.log('⚠️ folderInCbz 정책이 폐기되어 zipOfCbzs(배치)로 전환되었습니다.', 'warn');
        }

        // [v1.8.2] Graceful Fallback for missing Drive configuration
        if (destination === 'drive' && !(0,core_config/* isConfigValid */.Jb)()) {
            alert('구글 드라이브 설정(Folder ID 등)이 누락되었습니다. 임시로 개별 로컬 다운로드 정책으로 전환합니다.');
            logger.warn('⚠️ 구글 드라이브 설정 누락 감지. 정책을 개별 로컬 다운로드로 자동 전환합니다.', 'System');
            buildingPolicy = 'individual';
            destination = 'local';
        }

        const configNovelFormat = (0,core_config/* getConfig */.zj)().novelFormat || 'epub';
        const EXTENSION_MAP = {
            'Novel': configNovelFormat,
            'novel': configNovelFormat,
            'Webtoon': 'cbz',
            'webtoon': 'cbz',
            'Manga': 'cbz',
            'manga': 'cbz'
        };

        if (buildingPolicy === 'zipOfCbzs') {
            masterZip = new JSZip(); // Master Container for current batch
            extension = EXTENSION_MAP[category] ?? 'cbz';
        } else {
            // Individual / native / drive
            extension = EXTENSION_MAP[category] ?? 'cbz';
        }

        // Get List
        let list = await parser.getListItems();

        // [v2.0] 커스텀 범위 필터 ("1,2,4-10" 형식)
        const rangeSet = parseRangeSpec(rangeSpec);
        if (rangeSet) {
            // 필터링 및 번호 오름차순 정렬 (1부터 다운로드 되도록)
            const mappedList = list.map(li => {
                const item = parser.parseListItem(li.element || li);
                return { li, num: parseInt(item.num) };
            }).filter(item => rangeSet.has(item.num));

            mappedList.sort((a, b) => a.num - b.num);
            list = mappedList.map(item => item.li);
            
            logger.log(`범위 필터 적용 및 오름차순 정렬 완료: ${rangeSpec} → ${list.length}개 항목`);
        }
        
        // Log episode range
        if (list.length > 0) {
            const first = parser.parseListItem(list[list.length - 1]); // usually reversed order
            const last = parser.parseListItem(list[0]);
            logger.log(`총 ${list.length}개 항목 처리 예정. (${first.title} ~ ${last.title})`, 'Downloader');
        } else {
            logger.log(`총 0개 항목 처리 예정.`, 'Downloader');
        }

        if (list.length === 0) {
            logger.warn('에피소드 목록이 0개입니다. 사이트 구조가 달라졌거나 올바른 목록 페이지인지 확인하세요.', 'Downloader');
            alert("다운로드할 항목이 없습니다.");
            return;
        }

        // Folder Name (Title) & Common Title Extraction
        const first = parser.parseListItem(list[0]);
        const last = parser.parseListItem(list[list.length - 1]);
        
        // Extract Series ID from URL
        // https://.../webtoon/123456?page=...
        // Pattern: /novel/(\d+) or /webtoon/(\d+) or /comic/(\d+)
        const idMatch = document.URL.match(/\/(novel|webtoon|comic)\/([0-9]+)/);
        const seriesId = idMatch ? idMatch[2] : "0000";

        // Determine Root Folder Name & Series Title
        const rootFolder = parser.getFormattedTitle(seriesId, first.title, last.title, utils/* getCommonPrefix */.iL);
        // Extract raw title from rootFolder (e.g., "[1234] Title" -> "Title")
        const seriesTitle = rootFolder.replace(/^\[[0-9]+\]\s*/, '');
        const listPrefixTitle = (list.length > 1) ? (0,utils/* getCommonPrefix */.iL)(first.title, last.title) : "";

        // [v1.7.0] Collect detailed metadata for Phase 3 Persistence
        const seriesMetadata = {
            ...parser.getSeriesMetadata(),
            title: seriesTitle || rootFolder,
            thumbnail: parser.getThumbnailUrl() || ""
        };

        // [Fix] Append Range [Start-End] for Local Merged Files (folderInCbz / zipOfCbzs)
        // GAS Upload uses individual files so no range needed in folder name
        // [v1.6.0 Update] Batch range is handled during saving, not in rootFolder variable
        if (buildingPolicy === 'zipOfCbzs') {
            const startNum = parseInt(first.num);
            const endNum = parseInt(last.num);
            // We'll append batch info later
        }

        // [v1.4.0] Upload Series Thumbnail (if uploading to Drive)
        if (destination === 'drive') {
            try {
                const thumbnailUrl = parser.getThumbnailUrl();
                if (thumbnailUrl) {
                    logger.log('📷 시리즈 썸네일 업로드 중...');
                    const thumbResponse = await fetch(thumbnailUrl);
                    const thumbBlob = await thumbResponse.blob();
                    
                    // Upload as 'cover.jpg' - network.js will auto-redirect to _Thumbnails/{ID}.jpg
                    // saveFile(data, filename, type, extension, metadata)
                    // → fullFileName = "cover.jpg"
                    await (0,utils/* saveFile */.OJ)(thumbBlob, 'cover', 'drive', 'jpg', { 
                        category,
                        folderName: rootFolder  // Target folder for upload
                    });
                    logger.success('✅ 썸네일 업로드 완료');
                } else {
                    logger.log('⚠️  썸네일을 찾을 수 없습니다 (건너뜀)', 'warn');
                }
            } catch (thumbError) {
                logger.warn(`썸네일 업로드 실패 (계속 진행): ${thumbError.message}`, 'Downloader');
            }
        }

        // [v1.5.0 Smart Skip] Pre-load history for Drive uploads to skip already-uploaded episodes
        let uploadedHistorySet = new Set();
        // [v1.6.0 Fast Path] Pre-load episode cache
        let episodeCacheMap = new Map(); // key: "0001 - Title", value: "fileId"

        let historyCheckTimeoutFlag = false;
        let historyFolderId = null;

        if (destination === 'drive') {
            try {
                if (forceOverwrite) {
                    logger.log('⚠️ 강제 재다운로드 옵션 활성화: 기존 업로드 기록 무시 (전체 덮어쓰기)');
                } else {
                    logger.log('☁️ 드라이브 업로드 기록 및 용량 확인 중 (Smart Skip)...');
                    const histResult = await (0,network/* fetchHistoryDirect */.GA)(rootFolder, category);
                    
                    if (histResult.success) {
                        // Normalize: accept padded ("0001") and plain ("1") forms
                        histResult.data.forEach(id => {
                            const plain = parseInt(id).toString();
                            uploadedHistorySet.add(id.toString());   // e.g. "0001"
                            uploadedHistorySet.add(plain);           // e.g. "1"
                        });
                        if (uploadedHistorySet.size > 0) {
                            logger.log(`⏭️ 조건 만족(기존 정상 업로드) 에피소드 ${histResult.data.length}개 감지 — 건너뜁니다.`);
                        }
                    } else {
                        historyCheckTimeoutFlag = true;
                        historyFolderId = histResult.folderId;
                        logger.log(`⚠️ 업로드 기록 조회 지연/타임아웃 감지. 개별 스킵(페일세이프) 모드로 전환합니다.`, 'warn');
                    }
                }
            } catch (histErr) {
                // Non-fatal: if history check fails unexpectedly
                logger.log(`⚠️ 업로드 기록 조회 실패: ${histErr.message}`, 'warn');
            }

            // [v1.6.0] Phase B-2: Load Master Index -> Cache File ID -> Episode List
            try {
                logger.log('⚡ 고속 업로드(Fast Path) 캐시 조회 중...');
                const config = (0,core_config/* getConfig */.zj)();
                
                // 1. Fetch Complete Master Index
                const indexResponse = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "POST", url: config.gasUrl,
                        data: JSON.stringify({ type: "get_library", folderId: config.folderId, apiKey: config.apiKey }),
                        headers: { "Content-Type": "text/plain" },
                        onload: (r) => {
                            try { resolve(JSON.parse(r.responseText)); } 
                            catch(e) { reject(e); }
                        },
                        onerror: reject
                    });
                });

                if (indexResponse.status === 'success') {
                    // 2. Find Current Series in Index by ID or Title
                    // [Fix] Handle both indexResponse.body (cached) and indexResponse.list (rebuild) structures
                    const seriesList = indexResponse.body || indexResponse.list || [];
                    
                    // Match by sourceId or title
                    const matchedSeries = seriesList.find(s => 
                        (s.sourceId && s.sourceId === seriesId) || 
                        (s.name && s.name.includes(seriesTitle))
                    );

                    let targetCacheFileId = matchedSeries ? matchedSeries.cacheFileId : null;
                    
                    if (targetCacheFileId) {
                        logger.log(`[Fast Path] 마스터 카탈로그에서 신규 캐시 파일 발견: ${targetCacheFileId}`);
                    } else {
                        // [v1.6.1] 2nd Attempt: Fetch Merge Index Fragment directly (Fallback for newly uploaded series)
                        logger.log(`[Fast Path] 마스터 카탈로그에 캐시 부재. _MergeIndex 대기열 파편을 탐색합니다...`);
                        const fragRes = await (0,gas/* getMergeIndexFragment */.Jb)(seriesId);
                        if (fragRes.found && fragRes.data && fragRes.data.cacheFileId) {
                            targetCacheFileId = fragRes.data.cacheFileId;
                            logger.log(`[Fast Path] 큐에서 비동기 병합 파편 발견 성공! (ID: ${targetCacheFileId})`);
                        }
                    }

                    if (targetCacheFileId) {
                        // 3. Directly load episode cache using the cacheFileId
                        const cachedEpisodes = await (0,gas/* getBooksByCacheId */.B0)(targetCacheFileId);
                        
                        if (cachedEpisodes && cachedEpisodes.length > 0) {
                             cachedEpisodes.forEach(ep => {
                                 // Map "name" (e.g. "0001 - Title.cbz") to its Drive File ID
                                 // We strip the extension to match our `fullFilename` variable later
                                 const nameWithoutExt = ep.name.replace(/\.[^/.]+$/, "");
                                 episodeCacheMap.set(nameWithoutExt, ep.id);
                             });
                             logger.success(`[Fast Path] 맵핑 테이블 완성: ${episodeCacheMap.size}개 에피소드 캐시 로드 성공!`);
                        }
                    } else {
                        logger.log('[Fast Path] 신규 작품이거나 캐시 파편이 아직 없습니다 (일반 업로드 분기로 진행)');
                    }
                }
            } catch (cacheErr) {
                logger.log(`⚠️ 고속 업로드 캐시 로드 실패 (일반 분기로 진행방향 전환): ${cacheErr.message}`, 'warn');
            }
        }

        // Create IFrame
        // 목록 페이지 최하단에 배치 + opacity 0.1
        // IntersectionObserver가 정상 동작하며, 브라우저가 일반 문서 흐름으로 렌더링
        const iframe = document.createElement('iframe');
        iframe.style.display = 'block';
        iframe.style.width = '100%';
        iframe.style.height = '600px';
        iframe.style.opacity = '0.1';
        iframe.style.pointerEvents = 'none';
        iframe.style.border = 'none';
        iframe.style.marginTop = '40px';
        document.body.appendChild(iframe);

        // [v1.7.1] Novel Single Volume Mode Init
        const configParams = (0,core_config/* getConfig */.zj)();
        const novelMode = configParams.novelMode;
        const novelFormat = configParams.novelFormat || 'epub';
        const isSingleVolume = isNovel && novelMode === 'singleVolume';
        let masterNovelBuilder = null;
        if (isSingleVolume) {
            masterNovelBuilder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder();
            logger.log(`📙 소설 단행본 합본 모드 활성화 (${novelFormat.toUpperCase()}) (마지막에 한 번에 저장됩니다)`);
        }

        // --- Processing Loop ---
        for (let i = 0; i < list.length; i++) {
            const item = parser.parseListItem(list[i].element || list[i]); 
            console.clear();
            logger.log(`[${i + 1}/${list.length}] 처리 중: ${item.title}`);

            // [v1.5.0 Smart Skip] Skip already-uploaded episodes (Drive policy only)
            // [v1.7.1] Bypass skipping in Single Volume mode (we need all chapters)
            if (!isSingleVolume && destination === 'drive') {
                const numStr = item.num ? item.num.toString() : '';
                const numPlain = parseInt(numStr).toString();
                if (uploadedHistorySet.size > 0 && (uploadedHistorySet.has(numStr) || uploadedHistorySet.has(numPlain))) {
                    logger.log(`⏭️ 건너뜀 (이미 업로드됨): ${item.title}`);
                    continue;
                }
                
                // [v1.7.4] 페일세이프: 타임아웃 발생 시 개별 단위 핀셋 조회 수행
                if (historyCheckTimeoutFlag && historyFolderId) {
                    logger.log(`🔍 [페일세이프] 타임아웃 2차 단일 로컬/원격 검사 중: ${item.title}`);
                    const isUploaded = await (0,network/* checkSingleHistoryDirect */.OS)(historyFolderId, numStr);
                    if (isUploaded) {
                        logger.log(`⏭️ [페일세이프 재검사] 건너뜀 (이미 업로드됨): ${item.title}`);
                        continue;
                    }
                }
            }

            // Decision based on Policy
            let currentBuilder = null;

            // [v1.6.0] Strategy: Always use a FRESH builder per item for Kavita compatibility
            // [v1.7.1] Except for Novel Single Volume Mode
            if (isSingleVolume) {
                currentBuilder = masterNovelBuilder;
            } else {
                if (isNovel) currentBuilder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder();
                else currentBuilder = new CbzBuilder();
            }

            // Process Item
            try {
                const result = await processItem(item, currentBuilder, siteInfo, iframe, parser, seriesTitle);
                
                // [v1.8.1] 부분 실패 체크 (이미지 누락 여부)
                if (currentBuilder && currentBuilder.chapters) {
                    const latestChapter = currentBuilder.chapters[currentBuilder.chapters.length - 1];
                    if (latestChapter && Array.isArray(latestChapter.images)) {
                        const missingCount = latestChapter.images.filter(img => img.isMissing).length;
                        if (missingCount > 0) {
                            console.warn(`[Downloader] 부분 실패 감지: ${item.title} (이미지 ${missingCount}개 누락)`);
                            partialFailures.push({
                                num: item.num,
                                title: item.title,
                                missingCount: missingCount
                            });
                        }
                    }
                }

                if (isSingleVolume) {
                    const currentSize = currentBuilder.chapters ? currentBuilder.chapters.length : (currentBuilder.content ? currentBuilder.content.split('===').length - 1 : 0);
                    logger.log(`📥 챕터 추가 완료: ${item.title} (현재 ${currentSize}개)`, 'Downloader');
                }
            } catch (err) {
                console.error(err);
                const errorMsg = err.message || "알 수 없는 오류";
                logger.error(`항목 처리 실패 (${item.title}): ${errorMsg}`, 'Downloader');
                
                // [v1.8.1] 실패 내역 저장
                failedEpisodes.push({
                    num: item.num,
                    title: item.title,
                    error: errorMsg
                });
                continue; // Skip faulty item but continue loop
            }

            // Post-Process for Non-Default Policies
            if (buildingPolicy !== 'folderInCbz' && !isSingleVolume) {
                // Build the individual chapter file
             
                // Clean Filename Logic
                // [v1.4.0 Update] Standardized format: "0001 - SeriesTitle 1화" (Keep Full Title)
                // Reason: Better identification when moving files out of folder
                
                let chapterTitle = item.title;
                
                // [v1.4.0] Title Normalization
                // If list title text differs from official metadata title, replace it.
                // Ex: List="Hot Manga 19", Meta="Cool Manga" -> "Cool Manga 19"
                // Condition: We have both titles, they differ, and item starts with list prefix
                if (seriesTitle && listPrefixTitle && seriesTitle !== listPrefixTitle && listPrefixTitle.length > 2) {
                     if (chapterTitle.startsWith(listPrefixTitle)) {
                         chapterTitle = chapterTitle.replace(listPrefixTitle, seriesTitle).trim();
                     }
                }
                
                // Only clean (remove series title) if uploading to Drive
                // [Deprecated] User requested to keep series title
                /*
                if (destination === 'drive' && seriesTitle && chapterTitle.startsWith(seriesTitle)) {
                    chapterTitle = chapterTitle.replace(seriesTitle, '').trim();
                }
                */

                // Final Filename: "0001 - Title"
                const fullFilename = `${item.num} - ${chapterTitle}`;

                // [v1.6.0] Kavita Metadata Insertion
                const innerZip = await currentBuilder.build({ 
                    series: seriesTitle || rootFolder,
                    title: chapterTitle,
                    number: item.num,
                    writer: siteName
                });
                const blob = await innerZip.generateAsync({ type: "blob" });

                if (buildingPolicy === 'zipOfCbzs') {
                    console.log(`[MasterZip] 추가 중: ${fullFilename}.${extension}`);
                    masterZip.file(`${fullFilename}.${extension}`, blob);
                    
                    // [v1.8.2] Batching Logic
                    // Novel: Infinite batch. Webtoon: 20 per batch to prevent OOM
                    const processedCount = i + 1;
                    const isLastItem = (i === list.length - 1);
                    const BATCH_SIZE = isNovel ? Infinity : 20;

                    if ((BATCH_SIZE !== Infinity && processedCount % BATCH_SIZE === 0) || isLastItem) {
                        const batchNum = Math.ceil(processedCount / BATCH_SIZE);
                        const batchFilename = `${rootFolder}_Part${batchNum}`;
                        
                        logger.log(`📦 배치 저장 중... (${batchFilename})`);
                        await (0,utils/* saveFile */.OJ)(masterZip, batchFilename, 'local', 'zip', { category });
                        
                        // Clear masterZip for next batch to save memory
                        masterZip = new JSZip();
                    }
                } else if (buildingPolicy === 'individual') {
                    // [v1.6.0] Phase B-3: Fast Path Smart Branching
                    let success = false;
                    const cachedFileId = episodeCacheMap.get(fullFilename);

                    if (destination === 'drive' && cachedFileId) {
                        try {
                            logger.log(`⚡ [Fast Path] 캐시 히트! 무탐색 덮어쓰기 (PUT) 진행 -> ID: ${cachedFileId}`);
                            
                            // 1. Init Update Session
                            // Notice: We do NOT use direct upload here because direct upload deletes existing files.
                            // We MUST use GAS Relay to trigger the specific PATCH/PUT resumable session.
                            const updateUrl = await (0,gas/* initUpdateUploadViaGASRelay */.fA)(cachedFileId, `${fullFilename}.${extension}`);
                            
                            // 2. Transmit chunks (re-use standard GM_xmlHttpRequest logic from gas.js)
                            // We can build a quick uploader here or expose a method. Since gas.js encapsulates it tightly,
                            // we inline the chunk upload for the Fast Path for maximum control:
                            const CHUNK_SIZE = 20 * 1024 * 1024;
                            const totalSize = blob.size;
                            let start = 0;
                            const buffer = await blob.arrayBuffer();
                            
                            while (start < totalSize) {
                                const end = Math.min(start + CHUNK_SIZE, totalSize);
                                const chunkBuffer = buffer.slice(start, end);
                                
                                // High-speed Base64 encode
                                let binary = "";
                                const chunk_size = 0x8000; // 32KB
                                for (let j = 0; j < bytes.length; j += chunk_size) {
                                    binary += String.fromCharCode.apply(null, bytes.subarray(j, j + chunk_size));
                                }
                                const chunkBase64 = window.btoa(binary);

                                await new Promise((res, rej) => {
                                    GM_xmlhttpRequest({
                                        method: "POST", url: (0,core_config/* getConfig */.zj)().gasUrl,
                                        data: JSON.stringify({ 
                                            type: "upload", uploadUrl: updateUrl, chunkData: chunkBase64, 
                                            folderId: (0,core_config/* getConfig */.zj)().folderId,
                                            start: start, end: end, total: totalSize, apiKey: (0,core_config/* getConfig */.zj)().apiKey
                                        }),
                                        headers: { "Content-Type": "text/plain" },
                                        timeout: 300000,
                                        onload: (resp) => {
                                            try { 
                                                const json = JSON.parse(resp.responseText); 
                                                if (json.status === 'success') res(); else rej(new Error("Fail")); 
                                            } catch (e) { rej(e); }
                                        },
                                        onerror: rej
                                    });
                                });
                                start = end;
                            }
                            
                            logger.success(`⚡ [Fast Path] ${fullFilename} 업데이트(PUT) 완료!`, 'FastPath');
                            success = true;
                        } catch (fastPathErr) {
                            const errMsg = fastPathErr.message || "";
                            logger.log(`⚠️ Fast Path 업로드 중 에러 발생 (${errMsg}), Fallback 시작...`, 'warn', 'FastPath');
                            
                            // [v1.7.3] 자가 회복 로직: 휴지통 또는 파일 부재 시 캐시 삭제
                            const lowerMsg = errMsg.toLowerCase();
                            if (lowerMsg.includes('trash') || lowerMsg.includes('not found')) {
                                logger.warn(`🗑️ [Fast Path] 휴지통/부재 감지 → 캐시에서 해당 항목 삭제 및 일반 업로드 전환: ${fullFilename}`);
                                episodeCacheMap.delete(fullFilename);
                            }
                            
                            success = false; // Fallback
                        }
                    }

                    if (!success) {
                        // Fallback (or local save)
                        logger.log(`[Upload] 일반 업로드(Create/POST) 진행...`);
                        await (0,utils/* saveFile */.OJ)(blob, fullFilename, destination, extension, {
                            folderName: rootFolder,
                            category: category
                        });
                    }
                }
            }
            
            // [v1.4.0] Add completion badge to list item (real-time feedback)
            if (item.element && !item.element.querySelector('.toki-badge')) {
                const badge = document.createElement('span');
                badge.className = 'toki-badge';
                badge.innerText = '✅';
                badge.style.marginLeft = '5px';
                badge.style.fontSize = '12px';
                
                // Target: .wr-subject > a (link element)
                const linkEl = item.element.querySelector('.wr-subject > a');
                if (linkEl) {
                    linkEl.prepend(badge);
                } else {
                    // Fallback
                    const titleEl = item.element.querySelector('.wr-subject, .item-subject, .title');
                    if (titleEl) {
                        titleEl.prepend(badge);
                    } else {
                        item.element.appendChild(badge);
                    }
                }
                
                // Visual feedback
                item.element.style.opacity = '0.6';
                item.element.style.backgroundColor = 'rgba(0, 255, 0, 0.05)';
            }
        }


        // [v1.7.1] Finalize Single Volume EPUB/TXT
        if (isSingleVolume && masterNovelBuilder) {
            const hasContent = masterNovelBuilder.chapters ? masterNovelBuilder.chapters.length > 0 : masterNovelBuilder.content.length > 0;
            if (hasContent) {
                try {
                    // [v1.7.1 Update] Use Chapter Range for Filename instead of "(합본)"
                    // [v1.7.1 Update] Use Chapter Range for Filename instead of "(합본)" - Safe Parsing
                    const startRaw = last.num;
                    const endRaw = first.num;
                    const startNum = parseInt(startRaw);
                    const endNum = parseInt(endRaw);

                    let rangeLabel = "";
                    if (isNaN(startNum) || isNaN(endNum)) {
                        // Fallback to original labels if either is not numeric (e.g., "공지")
                        rangeLabel = (startRaw === endRaw) ? `${startRaw}` : `${startRaw}-${endRaw}`;
                    } else {
                        rangeLabel = (startNum === endNum) ? `${startNum}화` : `${Math.min(startNum, endNum)}-${Math.max(startNum, endNum)}화`;
                    }
                    const finalFilename = `${seriesTitle || rootFolder} (${rangeLabel})`;
                    
                    logger.log(`📚 단행본 조립 및 저장 중... (${finalFilename})`);
                    
                    const finalZip = await masterNovelBuilder.build({
                        series: seriesTitle || rootFolder,
                        title: seriesTitle || rootFolder,
                        writer: siteName
                    });
                    const finalBlob = await finalZip.generateAsync({ type: "blob" });
                    
                    await (0,utils/* saveFile */.OJ)(finalBlob, finalFilename, destination, extension, {
                        folderName: rootFolder,
                        category: category
                    });
                    
                    logger.success(`✅ 단행본 합본 저장 완료: ${finalFilename}`);
                } catch (epubErr) {
                    logger.error(`단행본 빌드 실패: ${epubErr.message}`);
                }
            } else {
                logger.warn('⚠️ 유효한 챕터가 없어 단행본 빌드를 취소합니다.', 'Downloader');
            }
        }

        // Cleanup
        iframe.remove();

        // Finalize Build (Batching logic already handles zipOfCbzs during loop)
        if (buildingPolicy === 'folderInCbz') {
            // Deprecated path, handled by zipOfCbzs transition
        }

        // [v1.5.5] 배치 완료 후 Drive 캐시 단일 갱신 (에피소드마다 호출하지 않음)
        if (destination === 'drive') {
            (0,gas/* refreshCacheAfterUpload */.jz)(rootFolder, category, seriesMetadata).catch(e =>
                logger.warn(`캐시 갱신 호출 중 실패 (무시): ${e.message}`, 'GAS:Cache')
            );
        }

        logger.success(`✅ 모든 작업 완료!`);
        ui/* Notifier */.ze.notify('TokiSync', `다운로드 완료! (${list.length - failedEpisodes.length}개 성공, ${failedEpisodes.length}개 실패)`);

        // [v1.8.1] 고도화된 실패 리포트 생성 및 저장 (MCP 검토 반영)
        await generateDownloadReport(seriesTitle || rootFolder, seriesId, list.length, failedEpisodes, partialFailures);

    } catch (error) {
        console.error(error);
        logger.error(`전체 다운로드 루틴 오류 발생: ${error.message}`, 'System');
        alert(`다운로드 중 오류 발생:\n${error.message}`);
    } finally {
        // Auto-stop Anti-Sleep mode
        (0,anti_sleep/* stopSilentAudio */.Cv)();
        logger.log('[Anti-Sleep] 백그라운드 모드 자동 종료');
        
        // Cleanup
        const iframe = document.querySelector('iframe');
        if (iframe) iframe.remove();
    }
}

async function fetchImages(imageUrls) {
    const logger = ui.LogBox.getInstance();
    const promises = imageUrls.map(async (src) => {
        let retries = 3;
        let lastBlob = null;
        let lastExt = '.jpg';
        
        while (retries > 0) {
            try {
                const response = await fetch(src);
                const blob = await response.blob();
                
                if (blob.size === 0) {
                    throw new Error("빈 이미지 데이터 (Blob size 0)");
                }

                // Metadata Extraction
                let ext = '.jpg';
                const extMatch = src.match(/\.[a-zA-Z]+$/);
                
                if (extMatch) {
                    ext = extMatch[0];
                } else {
                    // Fallback: Infer from Content-Type
                    const type = response.headers.get('content-type');
                    if (type) {
                        if (type.includes('png')) ext = '.png';
                        else if (type.includes('gif')) ext = '.gif';
                        else if (type.includes('webp')) ext = '.webp';
                        else if (type.includes('jpeg') || type.includes('jpg')) ext = '.jpg';
                    }
                }

                lastBlob = blob;
                lastExt = ext;

                // [v1.7.3] Hybrid Dummy Detection: Size + Resolution
                // 100KB 이하일 경우 Dummy일 확률이 있으나, 해상도가 높으면 정상으로 수용
                if (blob.size < 100 * 1024 && retries > 1) {
                    // 1. 확실한 더미 패턴 URL이면 재시도 없이 즉시 실패 처리
                    const isDummyUrl = (u) => u && (u.includes('blank.gif') || u.includes('loading.gif') || u.includes('pixel.gif'));
                    if (isDummyUrl(src)) {
                        retries = 1; 
                        throw new Error(`더미 이미지 URL 확인됨 (Skip retry)`);
                    }

                    // 2. 해상도 체크 (가로 또는 세로가 300px 이상이면 정상 이미지로 간주)
                    const { getImageDimensions } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 924));
                    const { width, height } = await getImageDimensions(blob);
                    
                    if (width > 300 || height > 300) {
                        // 규격이 정상인 경우 용량에 상관없이 수용
                        return { src, blob, ext };
                    }

                    throw new Error(`저용량 및 저해상도 의심 (${(blob.size/1024).toFixed(1)}KB, ${width}x${height}) - Lazy 더미 이미지일 수 있으므로 재시도`);
                }

                return { src, blob, ext };
            } catch (e) {
                retries--;
                const retryCount = 3 - retries;
                if (retries > 0) logger.warn(`이미지 다운로드 재시도 (${retryCount}/3): ${e.message}`, 'Network:Image');
                
                if (retries === 0) {
                    // 3회 모두 실패했고 lastBlob이 존재하지만, 여전히 dummy 성격이면 거절
                    if (lastBlob && lastBlob.size > 10000) { // 10KB 이상일 때만 보수적 수용
                        logger.log(`⚠️ 용량이 작지만 수용 (${(lastBlob.size/1024).toFixed(1)}KB): ${src.split('/').pop()}`, 'Network:Image');
                        return { src, blob: lastBlob, ext: lastExt };
                    }
                    
                    console.error(`이미지 다운로드 최종 실패 (${src}):`, e);
                    logger.error(`⚠️ 이미지 누락: ${src.split('/').pop()} (3회 재시도 실패)`, 'Network:Image');
                    
                    // [Fix] 다운로드 실패 시 null 반환 대신 안내 페이지 삽입
                    const placeholderText = `[PAGE_MISSING]\n\n해당 웹툰 페이지를 다운로드할 수 없었습니다.\n원인: 서버 제한 또는 백그라운드 스로틀링 (Lazy Load 실패)\n\nURL: ${src}`;
                    const placeholderBlob = new Blob([placeholderText], { type: 'text/plain' });
                    
                    return { src, blob: placeholderBlob, ext: '.txt', isMissing: true };
                }
                
                // 재시도 대기 (v1.7.2: 1.5초 -> 0.5초)
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
    });

    return await Promise.all(promises);
}

/**
 * [v1.8.1] 다운로드 실패 리포트 생성 및 다운로드 (MCP 검토 의견 반영)
 * @private
 */
async function generateDownloadReport(seriesTitle, seriesId, listCount, failedEpisodes, partialFailures) {
    const logger = ui.LogBox.getInstance();
    if (failedEpisodes.length === 0 && partialFailures.length === 0) return;

    logger.warn(`⚠️ 다운로드 중 일부 오류가 발견되었습니다. 리포트를 생성합니다.`, 'System');

    const timestamp = new Date().toLocaleString();
    const lines = [
        `[TokiSync 다운로드 리포트]`,
        `작품명: ${seriesTitle}`,
        `일시: ${timestamp}`,
        `--------------------------------------------------`,
        `■ 요약 (Summary)`,
        `- 총 시도: ${listCount}개`,
        `- 성공: ${listCount - failedEpisodes.length}개`,
        `- 완전 실패: ${failedEpisodes.length}개 (파일이 생성되지 않음)`,
        `- 부분 실패: ${partialFailures.length}개 (파일은 생성되었으나 일부 데이터 누락)`,
        `--------------------------------------------------`,
    ];

    if (failedEpisodes.length > 0) {
        lines.push(``, `■ 완전 실패 목록 (Critical Failures)`, `(원인 분석 후 해당 회차만 재시도해 보세요)`);
        failedEpisodes.forEach(fail => {
            lines.push(`- [${fail.num}] ${fail.title} : ${fail.error}`);
        });
    }

    if (partialFailures.length > 0) {
        lines.push(``, `■ 부분 실패 목록 (Warnings/Partial Success)`, `(다운로드는 완료되었으나 일부 페이지가 누락된 항목입니다)`);
        partialFailures.forEach(fail => {
            lines.push(`- [${fail.num}] ${fail.title} : 이미지 ${fail.missingCount}개 누락`);
        });
    }

    lines.push(``, `--------------------------------------------------`, `위 리포트를 참고하여 누락된 회차를 확인하시기 바랍니다.`);

    const reportContent = lines.join('\n');
    const reportBlob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const cleanSeriesTitle = (seriesTitle || "Unknown").replace(/[<>:"/\\|?*]/g, '').trim();
    const reportFilename = `${cleanSeriesTitle}_다운로드_실패_리포트`;

    try {
        await (0,utils/* saveFile */.OJ)(reportBlob, reportFilename, 'local', 'txt');
        logger.success(`✅ 실패 리포트 다운로드 완료: ${reportFilename}.txt`);
    } catch (e) {
        console.error('[Downloader] 리포트 저장 실패:', e);
    }
}

;// ./src/core/main.js

 












async function main() {
    console.log("🚀 TokiDownloader Loaded (New Core v1.7.4)");
    
    const logger = ui.LogBox.getInstance();

    // -- Helper Functions for Menu Actions --

    const openViewer = () => {
         const config = (0,core_config/* getConfig */.zj)();
         const viewerUrl = "https://pray4skylark.github.io/tokiSync/";
         const win = window.open(viewerUrl, "_blank");
         
         if(win) {
             let attempts = 0;
             const interval = setInterval(() => {
                 attempts++;
                 win.postMessage({ type: 'TOKI_CONFIG', config: config }, '*');
                 if(attempts > 10) clearInterval(interval);
             }, 500);
         } else {
             alert("팝업 차단을 해제해주세요.");
         }
    };

    const runThumbnailMigration = async () => {
        if(!confirm("이 작업은 기존 다운로드된 작품들의 썸네일을 새로운 최적화 폴더(_Thumbnails)로 이동시킵니다.\n실행하시겠습니까? (서버 부하가 발생할 수 있습니다)")) return;
        
        const config = (0,core_config/* getConfig */.zj)();
        const win = window.open("", "MigrationLog", "width=600,height=800");
        win.document.write("<h3>🚀 v1.4.0 Migration Started...</h3><pre id='log'></pre>");
        
        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: config.gasUrl,
                data: JSON.stringify({
                    type: 'view_migrate_thumbnails',
                    folderId: config.folderId,
                    apiKey: config.apiKey
                }),
                onload: (res) => {
                    try {
                        const result = JSON.parse(res.responseText);
                        if(result.status === 'success') {
                            const logs = result.body.join('\n');
                            win.document.getElementById('log').innerText = logs;
                            alert("✅ 마이그레이션이 완료되었습니다!");
                        } else {
                            win.document.getElementById('log').innerText = "Failed: " + result.body;
                            alert("❌ 오류 발생: " + result.body);
                        }
                    } catch (e) {
                        win.document.getElementById('log').innerText = res.responseText;
                        alert("❌ GAS 서버 오류");
                    }
                },
                onerror: (err) => {
                     win.document.getElementById('log').innerText = "Network Error";
                     alert("❌ 네트워크 오류");
                }
            });
        } catch(e) {
            alert("오류: " + e.message);
        }
    };

    const runFilenameMigration = async () => {
        if (!confirm('현재 작품의 파일명을 표준화하시겠습니까?\n(예: "0001 - 1화.cbz" -> "0001 - 제목 1화.cbz")')) return;
        
        const idMatch = document.URL.match(/\/(novel|webtoon|comic)\/([0-9]+)/);
        const seriesId = idMatch ? idMatch[2] : null;

        if (!seriesId) {
            alert('시리즈 ID를 찾을 수 없습니다.');
            return;
        }

        try {
            logger.show();
            logger.log('이름 변경 작업 요청 중...');
            
            const token = await (0,network/* getOAuthToken */.Py)(); // FIXME: OAuth or API Key? Config uses API Key usually.
            const config = (0,core_config/* getConfig */.zj)();
            
            if (!config.gasUrl) {
                alert('GAS URL이 설정되지 않았습니다.');
                return;
            }

            GM_xmlhttpRequest({
                method: "POST",
                url: config.gasUrl,
                data: JSON.stringify({
                    type: 'view_migrate_filenames',
                    seriesId: seriesId,
                    folderId: config.folderId,
                    apiKey: config.apiKey
                }),
                headers: {
                    // "Authorization": `Bearer ${token}`, // If using OAuth
                    "Content-Type": "application/json"
                },
                onload: (res) => {
                    try {
                        const result = JSON.parse(res.responseText);
                        if (result.status === 'success') {
                            const logs = Array.isArray(result.body) ? result.body.join('\n') : result.body;
                            logger.success(`작업 완료!\n로그:\n${logs}`);
                            alert(`작업이 완료되었습니다.`);
                        } else {
                            logger.error(`작업 실패: ${result.body}`);
                            alert(`실패: ${result.body}`);
                        }
                    } catch (parseErr) {
                        logger.error(`응답 파싱 실패: ${parseErr.message}`);
                    }
                },
                onerror: (err) => {
                    logger.error(`네트워크 오류: ${err.statusText}`);
                    alert('네트워크 오류 발생');
                }
            });
        } catch (e) {
            alert('오류 발생: ' + e.message);
            console.error(e);
        }
    };

    // -- 1. Initialize MenuModal --
    new ui/* MenuModal */.fo({
        onDownload: () => {}, // Not used directly, specific methods below
        downloadAll: (forceOverwrite) => {
            const config = (0,core_config/* getConfig */.zj)();
            tokiDownload(undefined, config.policy, forceOverwrite);
        },
        downloadRange: (spec, forceOverwrite) => {
            const config = (0,core_config/* getConfig */.zj)();
            tokiDownload(spec, config.policy, forceOverwrite);
        },
        openViewer: openViewer,
        openSettings: () => (0,core_config/* showConfigModal */.Vh)(),
        toggleLog: () => logger.toggle(),
        getConfig: core_config/* getConfig */.zj,
        setConfig: core_config/* setConfig */.Nk,
        getEpisodeRange: async () => {
            const parser = await ParserFactory/* ParserFactory */.O.getParser();
            if (!parser) return { min: 1, max: 100 };
            
            const list = parser.getListItems();
            if (list.length > 0) {
                const first = parser.parseListItem(list[0]);
                const last = parser.parseListItem(list[list.length - 1]);
                const min = Math.min(parseInt(first.num), parseInt(last.num));
                const max = Math.max(parseInt(first.num), parseInt(last.num));
                return { min, max };
            }
            return { min: 1, max: 100 };
        },
        migrateFilenames: runFilenameMigration,
        migrateThumbnails: runThumbnailMigration,
        testNativeDownload: async () => {
            try {
                const testBlob = new Blob(["TokiSync Native Mode Test File"], { type: "text/plain" });
                await (0,utils/* saveFile */.OJ)(testBlob, "test", "native", "txt", { folderName: "_Test" });
                return true;
            } catch (e) {
                console.error("[Native Test Failed]", e);
                return false;
            }
        },
        testExtraction: async () => {
            try {
                const logger = ui.LogBox.getInstance();
                logger.show();
                logger.log('🧪 추출 테스트 시작...', 'Debug');
                
                const parser = await ParserFactory/* ParserFactory */.O.getParser();
                if (!parser) {
                    logger.error('❌ 파서를 찾을 수 없습니다.', 'Debug');
                    return;
                }

                const siteInfo = await (0,detector/* detectSite */.T)();
                // 현재 페이지(document)를 대상으로 추출 테스트
                const result = await extractEpisodeData(document, parser, siteInfo, false);
                
                console.log('[Debug Result]', result);
                
                if (result.urls && result.urls.length > 0) {
                    logger.success(`✅ 이미지 추출 성공: ${result.urls.length}개`, 'Debug');
                } else if (result.content) {
                    logger.success(`✅ 소설 추출 성공: ${result.content.length}자`, 'Debug');
                } else {
                    logger.warn('⚠️ 추출된 데이터가 없습니다. (뷰어 페이지가 아닐 수 있음)', 'Debug');
                }
                
                if (result.seriesTitle && result.seriesTitle !== "UnknownSeries") {
                    logger.log(`📚 작품명: ${result.seriesTitle}`, 'Debug');
                    logger.log(`🔖 에피소드: ${result.episodeTitle} (${result.episodeNum})`, 'Debug');
                }

            } catch (e) {
                ui.LogBox.getInstance().error(`❌ 테스트 실패: ${e.message}`, 'Debug');
                console.error(e);
            }
        },
        downloadCurrent: async () => {
            const logger = ui.LogBox.getInstance();
            try {
                logger.show();
                logger.log('🚀 현재 에피소드 다운로드 시작...', 'System');
                
                const siteInfo = await (0,detector/* detectSite */.T)();
                const parser = await ParserFactory/* ParserFactory */.O.getParser();
                if (!parser) throw new Error('파서를 찾을 수 없습니다.');

                // 1. 메타데이터 추출 (제목 등 확인용)
                const metadata = await extractEpisodeData(document, parser, siteInfo, false);
                const title = metadata.episodeTitle || "Current_Episode";
                const seriesTitle = metadata.seriesTitle || "Unknown_Series";

                // 2. 빌더 생성 (카테고리에 따라)
                const isNovel = (siteInfo.category === 'Novel' || siteInfo.category === 'novel');
                let builder;
                let extension = 'cbz';
                if (isNovel) {
                    const novelFormat = (0,core_config/* getConfig */.zj)().novelFormat || 'epub';
                    builder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder(seriesTitle, { author: "TokiSync" });
                    extension = novelFormat;
                } else {
                    builder = new CbzBuilder(title);
                }

                // 3. 임시 아이템 객체 생성 (processItem 호환용)
                const tempItem = {
                    title: title,
                    src: document.URL,   // processItem에서 item.src 참조 (API 복호화 포함)
                    url: document.URL,   // 하위 호환성 유지
                    num: metadata.episodeNum || "0000"
                };

                // 4. 단건 다운로드 실행 (현재 페이지의 document를 직접 전달)
                await processItem(tempItem, builder, siteInfo, null, parser, seriesTitle, document);

                // 5. 파일 생성 및 저장
                logger.log('💾 파일 생성 및 저장 중...', 'System');
                
                const zip = await builder.build({
                    series: seriesTitle,
                    title: title,
                    number: tempItem.num
                });
                
                const blob = await zip.generateAsync({ type: "blob" });
                const filename = `${tempItem.num} - ${title}`;

                await (0,utils/* saveFile */.OJ)(blob, filename, 'local', extension, { category: siteInfo.category });
                logger.success('✅ 다운로드 완료!', 'System');

            } catch (e) {
                logger.error(`❌ 다운로드 실패: ${e.message}`, 'System');
                console.error(e);
            }
        }
    });


    // -- 2. Register Legacy Menu Commands (Fallback) --
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('⚙️ 설정 (Settings)', () => (0,core_config/* showConfigModal */.Vh)());
        GM_registerMenuCommand('📜 로그창 토글 (Log)', () => logger.toggle());
        GM_registerMenuCommand('🌐 Viewer 열기', openViewer);
        GM_registerMenuCommand('📥 전체 다운로드', () => {
            const config = (0,core_config/* getConfig */.zj)();
            tokiDownload(undefined, config.policy);
        });
        GM_registerMenuCommand('📂 파일명 표준화 (Migration)', runFilenameMigration);
    }

    // -- 3. Bridge Listener --
    window.addEventListener("message", async (event) => {
        if (event.data.type === 'TOKI_BRIDGE_REQUEST') {
            const { requestId, url, options } = event.data;
            const sourceWindow = event.source;
            const origin = event.origin;

            if (!origin.includes("github.io") && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
                console.warn("[Bridge] Blocked request from unknown origin:", origin);
                return;
            }

            console.log(`[Bridge] Proxying request: ${url}`);

            try {
                GM_xmlhttpRequest({
                    method: options.method || 'GET',
                    url: url,
                    headers: options.headers,
                    data: options.data,
                    responseType: options.responseType || undefined,
                    onload: async (res) => {
                        let payload = null;
                        if (res.response instanceof Blob) {
                            payload = await (0,utils/* blobToArrayBuffer */._L)(res.response);
                        } else {
                            payload = res.responseText;
                        }

                        // [v1.7.0] Cross-tab 상태 갱신 인지: Viewer가 GAS에 뭔가 썼을 경우 (업로드 / 이력 갱신)
                        if (options.data && typeof options.data === 'string') {
                            if (options.data.includes('"type":"upload"') || options.data.includes('"type":"view_update_cache"')) {
                                if (typeof payload === 'string' && payload.includes('"status":"success"')) {
                                    if (typeof GM_setValue !== 'undefined') GM_setValue("TOKI_HISTORY_DIRTY", Date.now());
                                }
                            }
                        }

                        sourceWindow.postMessage({
                            type: 'TOKI_BRIDGE_RESPONSE',
                            requestId: requestId,
                            payload: payload,
                            contentType: res.responseHeaders.match(/content-type:\s*(.*)/i)?.[1]
                        }, origin, [payload instanceof ArrayBuffer ? payload : undefined].filter(Boolean));
                    },
                    onerror: (err) => {
                        sourceWindow.postMessage({
                            type: 'TOKI_BRIDGE_RESPONSE',
                            requestId: requestId,
                            error: 'Network Error'
                        }, origin);
                    }
                });
            } catch (e) {
                console.error("[Bridge] Error:", e);
                sourceWindow.postMessage({
                    type: 'TOKI_BRIDGE_RESPONSE',
                    requestId: requestId,
                    error: e.message
                }, origin);
            }
        }
    });

    const siteInfo = await (0,detector/* detectSite */.T)();
    if(!siteInfo) return; 

    // -- 4. History Sync (Async) & Cross-Tab Auto Refresh --
    let lastSyncTime = Date.now();
    let isSyncing = false;

    const syncHistory = async () => {
        if (isSyncing) return;
        isSyncing = true;
        try {
            const parser = await ParserFactory/* ParserFactory */.O.getParser();
            if (!parser) return;
            const list = await parser.getListItems();
            console.log(`[TokiSync] Found ${list.length} list items`);
            if (list.length === 0) {
                console.warn('[TokiSync] No list items found, skipping history sync');
                return;
            }

            const first = parser.parseListItem(list[0]);
            const last = parser.parseListItem(list[list.length - 1]);

            const idMatch = document.URL.match(/\/(novel|webtoon|comic)\/([0-9]+)/);
            const seriesId = idMatch ? idMatch[2] : "0000";

            // Determine Root Folder Name (Unified with Downloader)
            const rootFolder = parser.getFormattedTitle(seriesId, first.title, last.title, utils/* getCommonPrefix */.iL);

            let category = 'Webtoon';
            if (siteInfo.site === '북토끼') category = 'Novel';
            else if (siteInfo.site === '마나토끼') category = 'Manga';

            if (!(0,core_config/* isConfigValid */.Jb)()) {
                console.log('[TokiSync] GAS 설정을 찾을 수 없어 이력 동기화를 건너뜁니다.');
                return;
            }

            console.log(`[TokiSync] Fetching history for: ${rootFolder} (${category})`);
            const history = await (0,gas/* fetchHistory */.Ny)(rootFolder, category);
            console.log(`[TokiSync] Received ${history.length} history items`);
            if (history.length > 0) {
                await (0,ui/* markDownloadedItems */.hV)(history);
            } else {
                console.log('[TokiSync] No history items to mark');
            }
        } catch (e) {
            console.warn('[TokiSync] History check failed:', e);
        } finally {
            isSyncing = false;
            lastSyncTime = Date.now();
        }
    };

    // Initial load
    console.log('[TokiSync] Starting history sync...');
    syncHistory();

    // Cross-tab sync listener
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            if (typeof GM_getValue !== 'undefined') {
                const dirtyTime = GM_getValue("TOKI_HISTORY_DIRTY", 0);
                if (dirtyTime > lastSyncTime) {
                    console.log(`[TokiSync] 다른 탭에서 이력 갱신 감지! 백그라운드 새로고침 수행...`);
                    syncHistory();
                }
            }
        }
    });
}

// Auto-run main if imported? Or let index.js call it.
// Since we are refactoring, likely index.js will just import and call main().

;// ./src/core/index.js




(async function () {
    'use strict';
    
    // Viewer Config Injection (Zero-Config)
    if (location.hostname.includes('github.io') || location.hostname.includes('localhost') || location.hostname.includes('127.0.0.1')) {
        console.log("📂 TokiView (Frontend) detected. Injecting Config...");
        
        const config = (0,core_config/* getConfig */.zj)();
        
        if (config.gasUrl && config.folderId) {
            // [Fix] Retry injection to handle timing issues (Viewer might not be ready)
            let retryCount = 0;
            const maxRetries = 5;
            let injectionConfirmed = false;
            let retryTimer = null;
            let pollTimer = null;
            
            // Check localStorage to verify injection success
            const checkInjection = () => {
                const storedUrl = localStorage.getItem('TOKI_API_URL');
                const storedGasId = localStorage.getItem('TOKI_GAS_ID');
                const storedId = localStorage.getItem('TOKI_ROOT_ID');
                const storedKey = localStorage.getItem('TOKI_API_KEY');
                
                // Matches if either URL matches or ID matches
                const urlMatches = (storedUrl === config.gasUrl || storedGasId === config.gasId);
                
                if (urlMatches && 
                    storedId === config.folderId && 
                    storedKey === (config.apiKey || '')) {
                    
                    injectionConfirmed = true;
                    if (retryTimer) clearTimeout(retryTimer);
                    if (pollTimer) clearInterval(pollTimer);
                    console.log("✅ Config injection confirmed (localStorage verified)");
                    return true;
                }
                return false;
            };
            
            const injectConfig = () => {
                if (injectionConfirmed) return; // Stop if already confirmed
                
                window.postMessage({ 
                    type: 'TOKI_CONFIG', 
                    url: config.gasUrl,
                    folderId: config.folderId,
                    apiKey: config.apiKey
                }, '*');
                
                console.log(`🚀 Config Injection Attempt ${retryCount + 1}/${maxRetries}:`, { 
                    gasUrl: config.gasUrl, 
                    apiKey: config.apiKey ? '***' : '(empty)'
                });

                retryCount++;
                if (retryCount < maxRetries && !injectionConfirmed) {
                    retryTimer = setTimeout(injectConfig, 1000);
                }
            };

            // Start polling localStorage (check every 200ms)
            pollTimer = setInterval(checkInjection, 200);
            
            // Timeout after 5 seconds
            setTimeout(() => {
                if (pollTimer) clearInterval(pollTimer);
                if (!injectionConfirmed) {
                    console.warn("⚠️ Config injection timeout (5s)");
                }
            }, 5000);

            // Start injection loop
            setTimeout(injectConfig, 500);

        } else {
            console.warn("⚠️ GAS URL or Folder ID missing. Please configure via menu.");
        }
        
        // API Proxy (CORS Bypass using GM_xmlhttpRequest)
        window.addEventListener('message', (event) => {
            // Security: Only accept from same origin
            if (event.source !== window) return;
            
            const msg = event.data;
            if (msg.type === 'TOKI_API_REQUEST') {
                console.log('[Proxy] Received API request:', msg.payload);
                
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: config.gasUrl,
                    data: JSON.stringify(msg.payload),
                    headers: { 'Content-Type': 'text/plain' },
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            window.postMessage({
                                type: 'TOKI_API_RESPONSE',
                                requestId: msg.requestId,
                                result: result
                            }, '*');
                        } catch (e) {
                            window.postMessage({
                                type: 'TOKI_API_RESPONSE',
                                requestId: msg.requestId,
                                error: 'Parse error: ' + e.message
                            }, '*');
                        }
                    },
                    onerror: () => {
                        window.postMessage({
                            type: 'TOKI_API_RESPONSE',
                            requestId: msg.requestId,
                            error: 'Network error'
                        }, '*');
                    }
                });
            }
        });
        
        console.log("✅ API Proxy initialized (CORS bypass)");
    }
    // Delay main execution to prevent React Hydration errors (#418) on SPA sites
    const startMain = async () => {
        setTimeout(async () => {
            await main();
        }, 500); // 500ms buffer for hydration to complete
    };

    if (document.readyState === 'complete') {
        startMain();
    } else {
        window.addEventListener('load', startMain);
    }
})();
/******/ })()
;