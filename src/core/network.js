/**
 * Direct Drive Access Module
 * Bypasses GAS relay for high-speed uploads using GM_xmlhttpRequest
 */

import { getConfig } from './config.js';
import { LogBox } from './ui.js';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Fetches OAuth token from GAS server
 * @returns {Promise<string>} Access token
 */
async function fetchToken() {
    const config = getConfig();
    
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
                        LogBox.getInstance().error(`Token fetch failed: ${result.error}`, 'Network:Auth');
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
                LogBox.getInstance().error('Token request network error', 'Network:Auth');
                reject(new Error('Token request failed'));
            },
            ontimeout: () => {
                console.error('[DirectUpload] Token request timed out (30s)');
                LogBox.getInstance().error('Token request timed out (30s)', 'Network:Auth');
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
 * Uploads file directly to Google Drive
 * v1.4.0: Centralized Thumbnail Support
 */
export async function uploadDirect(blob, folderName, fileName, metadata = {}) {
    try {
        console.log(`[DirectUpload] Starting upload: ${fileName} (${blob.size} bytes)`);
        
        const config = getConfig();
        const token = await getToken();
        
        // Determine category
        const category = metadata.category || (fileName.endsWith('.epub') ? 'Novel' : 'Webtoon');
        
        // 1. Get Series Folder ID (Always needed for info.json and content)
        const seriesFolderId = await getOrCreateFolder(folderName, config.folderId, token, category);
        
        let targetFolderId = seriesFolderId;
        let finalFileName = fileName;

        // 2. [v1.4.0] Centralized Thumbnail Logic
        if (fileName === 'cover.jpg' || fileName === 'Cover.jpg') {
            console.log('[DirectUpload] 🖼️ Detected Cover Image -> Redirecting to _Thumbnails');
            
            // Extract Series ID: "[12345] Title" -> "12345"
            const idMatch = folderName.match(/^\[(\d+)\]/);
            if (idMatch) {
                const seriesId = idMatch[1];
                finalFileName = `${seriesId}.jpg`;
                targetFolderId = await getOrCreateThumbnailFolder(token, config.folderId);
                console.log(`[DirectUpload] Target: _Thumbnails/${finalFileName}`);
                
                // Check for existing file and delete to prevent duplicates
                try {
                    const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
                        `q=name='${finalFileName}' and '${targetFolderId}' in parents and trashed=false` +
                        `&fields=files(id,name)`;
                    
                    const searchResult = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: searchUrl,
                            headers: { 'Authorization': `Bearer ${token}` },
                            timeout: 30000,
                            onload: (res) => resolve(JSON.parse(res.responseText)),
                            onerror: reject,
                            ontimeout: () => reject(new Error('[DirectUpload] 기존 파일 검색 타임아웃 (30초)'))
                        });
                    });
                    
                    // Delete existing files (there might be duplicates)
                    if (searchResult.files && searchResult.files.length > 0) {
                        console.log(`[DirectUpload] Found ${searchResult.files.length} existing file(s), deleting...`);
                        for (const file of searchResult.files) {
                            await new Promise((resolve, reject) => {
                                GM_xmlhttpRequest({
                                    method: 'DELETE',
                                    url: `https://www.googleapis.com/drive/v3/files/${file.id}`,
                                    headers: { 'Authorization': `Bearer ${token}` },
                                    timeout: 15000,
                                    onload: () => {
                                        console.log(`[DirectUpload] Deleted old file: ${file.id}`);
                                        resolve();
                                    },
                                    onerror: reject,
                                    ontimeout: () => reject(new Error('[DirectUpload] 파일 삭제 타임아웃 (15초)'))
                                });
                            });
                        }
                    }
                } catch (deleteError) {
                    console.warn('[DirectUpload] Failed to check/delete existing file:', deleteError);
                    // Continue anyway - upload will create duplicate but system still works
                }
            } else {
                console.warn('[DirectUpload] Could not extract Series ID, uploading to series folder as fallback.');
            }
        }

        // 3. Upload File
        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelim = `\r\n--${boundary}--`;
        
        const fileMetadata = {
            name: finalFileName,
            parents: [targetFolderId]
        };
        
        const metadataPart = new Blob([
            delimiter,
            'Content-Type: application/json\r\n\r\n',
            JSON.stringify(fileMetadata),
            delimiter,
            'Content-Type: application/octet-stream\r\n\r\n'
        ], { type: 'text/plain' });
        
        const closePart = new Blob([closeDelim], { type: 'text/plain' });
        const multipartBody = new Blob([metadataPart, blob, closePart]);
        
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                data: multipartBody,
                binary: true,
                timeout: 300000,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        console.log(`[DirectUpload] ✅ Upload successful: ${finalFileName}`);
                        resolve();
                    } else {
                        LogBox.getInstance().error(`Upload failed: ${response.status} - ${finalFileName}`, 'Network:Upload');
                        reject(new Error(`Upload failed: ${response.status}`));
                    }
                },
                onerror: (e) => {
                    LogBox.getInstance().error(`Upload block network error: ${finalFileName}`, 'Network:Upload');
                    reject(e);
                },
                ontimeout: () => {
                    LogBox.getInstance().error(`Upload request timed out (5m): ${finalFileName}`, 'Network:Upload');
                    reject(new Error(`[DirectUpload] 파일 업로드 타임아웃 (5분): ${finalFileName}`));
                }
            });
        });
        
    } catch (error) {
        console.error(`[DirectUpload] Error:`, error);
        LogBox.getInstance().error(`[DirectUpload] Error: ${error.message}`, 'Network:UploadException');
        throw error;
    }
}

// Export helper for main.js migration
export const getOAuthToken = getToken;

/**
 * [v1.8.0] Direct History Fetch with Size Heuristic
 * Bypasses GAS relay and directly queries the Google Drive API for the series folder.
 * Automatically filters out corrupted/incomplete files using the `(Max + Min) / 2 * 0.5` heuristic.
 * 
 * @param {string} seriesTitle 
 * @param {string} category 
 * @returns {Promise<string[]>} Array of valid episode IDs (e.g. "0001", "0002")
 */
export async function fetchHistoryDirect(seriesTitle, category = 'Webtoon') {
    const logger = LogBox.getInstance();
    const config = getConfig();
    if (!config.folderId) return [];

    try {
        console.log(`[DirectHistory] Fetching history for: ${seriesTitle} (${category})`);
        const token = await getToken();
        
        // Find the Series Folder ID
        // (If the folder doesn't exist, getOrCreateFolder might create it, which is fine, it will just be empty)
        const seriesFolderId = await getOrCreateFolder(seriesTitle, config.folderId, token, category);
        
        if (!seriesFolderId) {
            console.log(`[DirectHistory] Series folder not found or created.`);
            return [];
        }

        // Query files inside the folder (getting name and size)
        // Note: Google Drive API sizes are returned as strings
        const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
            `q='${seriesFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'` +
            `&fields=files(id,name,size)` +
            `&pageSize=1000`; // Assuming max 1000 chapters per series
            
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
            return [];
        }

        // 1. Parse and collect sizes
        const fileInfos = [];
        let maxSize = 0;
        let minSize = Infinity;

        result.files.forEach(file => {
            const match = file.name.match(/^(\d+)/);
            if (!match) return; // Skip non-episode files like info.json, cover.jpg
            
            const episodeNum = match[1];
            // If size is missing (like Google Docs), default to 0. CBZ/EPUB should always have size.
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

        if (fileInfos.length === 0) return [];

        // 2. Heuristic Logic: Max * Ratio
        // Ignore minimum size completely, as partially downloaded data might pull down the midpoint
        let threshold = 0;
        if (maxSize > 0 && fileInfos.length > 1) {
            const ratio = (config.smartSkipRatio !== undefined ? config.smartSkipRatio : 50) / 100;
            threshold = maxSize * ratio;
            logger.log(`[SmartSkip] 용량 분석 완료 - Max: ${(maxSize/1024/1024).toFixed(1)}MB, 통과 기준: ${config.smartSkipRatio || 50}% (${(threshold/1024/1024).toFixed(1)}MB 이상)`);
        }

        // 3. Filter valid files
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
        return [...new Set(validEpisodes)].sort((a,b) => parseInt(a) - parseInt(b));

    } catch (err) {
        console.error(`[DirectHistory] Failed:`, err);
        logger.warn(`기록 직접 조회 실패: ${err.message}`, 'Network:History');
        return []; // Fail safe: download all
    }
}
