/**
 * Direct Drive Access Module
 * Bypasses GAS relay for high-speed uploads using GM_xmlhttpRequest
 */

import { getConfig } from './config.js';

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
            onload: (response) => {
                console.log('[DirectUpload] Token response status:', response.status);
                console.log('[DirectUpload] Token response text:', response.responseText);
                
                try {
                    const result = JSON.parse(response.responseText);
                    console.log('[DirectUpload] Parsed result:', result);
                    
                    if (result.status === 'success') {
                        console.log('[DirectUpload] Token received successfully');
                        resolve(result.body.token); // Fixed: body instead of data
                    } else {
                        console.error('[DirectUpload] Token fetch failed:', result.error);
                        console.error('[DirectUpload] Debug logs:', result.logs);
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
                reject(new Error('Token request failed'));
            },
            ontimeout: () => {
                console.error('[DirectUpload] Request timeout');
                reject(new Error('Token request timeout'));
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
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject
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
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject
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
                onload: (res) => {
                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
        categoryFolderId = createCategoryResult.id;
    }
    
    // 3. Get or create series folder in category
    const seriesSearchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=name='${encodeURIComponent(folderName)}' and '${categoryFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'` +
        `&fields=files(id,name)`;
    
    const seriesResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: seriesSearchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject
        });
    });
    
    if (seriesResult.files && seriesResult.files.length > 0) {
        console.log(`[DirectUpload] Folder found: ${folderName}`);
        return seriesResult.files[0].id;
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
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject
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
            onload: (res) => resolve(JSON.parse(res.responseText)),
            onerror: reject
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
            onload: (res) => resolve(JSON.parse(res.responseText)),
            onerror: reject
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
                            onload: (res) => resolve(JSON.parse(res.responseText)),
                            onerror: reject
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
                                    onload: () => {
                                        console.log(`[DirectUpload] Deleted old file: ${file.id}`);
                                        resolve();
                                    },
                                    onerror: reject
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
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        console.log(`[DirectUpload] ✅ Upload successful: ${finalFileName}`);
                        resolve();
                    } else {
                        reject(new Error(`Upload failed: ${response.status}`));
                    }
                },
                onerror: reject
            });
        });
        
    } catch (error) {
        console.error(`[DirectUpload] Error:`, error);
        throw error;
    }
}
