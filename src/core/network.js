/**
 * Direct Drive Access Module
 * Bypasses GAS relay for high-speed uploads using GM_xmlhttpRequest
 */

import { getConfig } from './config.js';
import { EventBus, EVT } from './EventBus.js';
import { logger } from './logger.js';
import { extractEpisodeNum } from './utils.js';


let cachedToken = null;
let tokenExpiry = 0;
let tokenFetchPromise = null; // [v1.27.3] 토큰 fetch 뮤텍스: 동시 요청 경합 방지

/**
 * [v1.28.0] 업로드 직렬화 락: 동일 파일명 동시 업로드 → Drive 중복 파일 생성 방지
 * Map<fileName, Promise> — 동일 키에 대한 동시 호출은 기존 Promise 재사용
 */
const uploadLocks = new Map();

function withUploadLock(fileName, fn) {
    if (uploadLocks.has(fileName)) {
        return uploadLocks.get(fileName);
    }
    const promise = fn().finally(() => uploadLocks.delete(fileName));
    uploadLocks.set(fileName, promise);
    return promise;
}

/**
 * Fetches OAuth token from GAS server
 * @returns {Promise<string>} Access token
 */
async function fetchToken() {
    const config = getConfig();
    
    console.log('[DirectUpload] Fetching token from GAS...');
    
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: config.gasUrl,
            data: JSON.stringify({
                folderId: config.folderId,
                type: 'view_get_token',
                apiKey: config.apiKey,
                protocolVersion: 3
            }),
            headers: { 'Content-Type': 'text/plain' },
            timeout: 30000,
            onload: (response) => {
                console.log('[DirectUpload] Token response status:', response.status);
                
                try {
                    const result = JSON.parse(response.responseText);
                    
                    if (result.status === 'success') {
                        console.log('[DirectUpload] Token received successfully');
                        resolve(result.body.token);
                    } else {
                        console.error('[DirectUpload] Token fetch failed:', result.error);
                        console.error('[DirectUpload] Debug logs:', result.logs);
                        logger.error(`Token fetch failed: ${result.error}`, 'Network:Auth');
                        reject(new Error(result.error || 'Token fetch failed'));
                    }
                } catch (e) {
                    console.error('[DirectUpload] JSON parse error:', e);
                    reject(new Error(`Token parse error: ${e.message}`));
                }
            },
            onerror: (error) => {
                console.error('[DirectUpload] Request error:', error);
                logger.error('Token request network error', 'Network:Auth');
                reject(new Error('Token request failed'));
            },
            ontimeout: () => {
                console.error('[DirectUpload] Token request timed out (30s)');
                logger.error('Token request timed out (30s)', 'Network:Auth');
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
    
    // [v1.27.3] 토큰 뮤텍스: 이미 fetch 중인 Promise가 있으면 재사용
    if (tokenFetchPromise) {
        console.log('[DirectUpload] Token fetch in progress, waiting...');
        return tokenFetchPromise;
    }
    
    // Return cached token if still valid (with 5min safety margin)
    if (cachedToken && tokenExpiry > now + 300000) {
        console.log('[DirectUpload] Using cached token');
        return cachedToken;
    }
    
    console.log('[DirectUpload] Fetching new token...');
    tokenFetchPromise = fetchToken().then(token => {
        cachedToken = token;
        tokenExpiry = now + 3600000; // 1 hour
        tokenFetchPromise = null;
        return token;
    }).catch(err => {
        tokenFetchPromise = null;
        throw err;
    });
    
    return tokenFetchPromise;
}

/**
 * [v1.27.3] 토큰 TTL 확인 및 필요 시 갱신. 청크 업로드 전 호출.
 * @returns {Promise<string>} Access token (fresh or cached)
 */
async function ensureFreshToken() {
    const now = Date.now();
    // 남은 TTL이 5분 미만이면 refresh (업로드 도중 만료 방지)
    if (cachedToken && tokenExpiry > now + 300000) {
        return cachedToken;
    }
    return getToken();
}

/**
 * Finds or creates a series folder directly in the root. (Kavita 호환 플랫 구조)
 * 카테고리(Webtoon/Novel/Manga) 폴더는 더 이상 생성하지 않습니다.
 */
export async function getOrCreateFolder(folderName, parentId, token, _category) {
    // Search by name or [ID] prefix in root
    const idMatch = folderName.match(/^\[([a-zA-Z0-9_\-]+)\]/);
    const idPrefix = idMatch ? idMatch[0] : null;
    
    let queryPart = "";
    if (idPrefix) {
        queryPart = `name contains '${idPrefix}'`;
    } else {
        queryPart = `name = '${folderName.replace(/'/g, "\\'")}'`; 
    }

    const fullQuery = `${queryPart} and '${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=${encodeURIComponent(fullQuery)}` +
        `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    
    const searchResult = await new Promise((resolve, reject) => {
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
            ontimeout: () => reject(new Error('[DirectUpload] 폴더 검색 타임아웃'))
        });
    });
    
    if (searchResult.files && searchResult.files.length > 0) {
        const found = idPrefix
            ? searchResult.files.find(f => f.name.startsWith(idPrefix))
            : searchResult.files[0];
        if (found) {
            console.log(`[DirectUpload] Folder found: ${found.name} (ID: ${found.id})`);
            return found.id;
        }
    }
    
    // Create series folder in root
    console.log(`[DirectUpload] Creating series folder: ${folderName}`);
    const createResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            }),
            timeout: 30000,
            onload: (res) => {
                try { resolve(JSON.parse(res.responseText)); }
                catch (e) { reject(e); }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 폴더 생성 타임아웃'))
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
        `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    
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
            url: 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
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
    const CHUNK_SIZE = 5 * 1024 * 1024;
    const totalSize = blob.size;
    let start = 0;

    while (start < totalSize) {
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunk = blob.slice(start, end);
        const contentRange = `bytes ${start}-${end - 1}/${totalSize}`;

        // [v1.27.3]  각 청크 전 토큰 TTL 확인 → 만료 임박 시 갱신
        const freshToken = await ensureFreshToken();

        // [v1.27.3] 청크 재시도 루프 (최대 3회, 지수 백오프)
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            if (attempt > 1) {
                const delay = Math.min(2000 * Math.pow(2, attempt - 2), 10000);
                console.log(`[Chunk] 재시도 ${attempt}/3: ${(delay/1000).toFixed(1)}초 대기 후 재전송 (${contentRange})`);
                await new Promise(r => setTimeout(r, delay));
            }

            try {
                await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'PUT',
                        url: uploadUrl,
                        headers: {
                            'Authorization': `Bearer ${freshToken}`,
                            'Content-Range': contentRange,
                            'Content-Type': blob.type || 'application/octet-stream'
                        },
                        data: chunk,
                        binary: true,
                        timeout: 300000,
                        onload: (res) => {
                            if (res.status === 308 || (res.status >= 200 && res.status < 300)) {
                                // [v1.27.3] 308 응답 시 Range 헤더로 실제 수신 위치 확인
                                if (res.status === 308 && res.responseHeaders) {
                                    const rangeMatch = res.responseHeaders.match(/range:\s*bytes=0-(\d+)/i);
                                    if (rangeMatch) {
                                        const receivedEnd = parseInt(rangeMatch[1], 10) + 1;
                                        if (receivedEnd > start) {
                                            start = receivedEnd;
                                        }
                                    }
                                }
                                resolve();
                            } else {
                                EventBus.emit(EVT.LOG, { msg: `[${fileName}] 청크 업로드 실패 (${res.status})`, level: 'error', tag: 'Upload' });
                                reject(new Error(`Chunk upload failed: ${res.status}`));
                            }
                        },
                        onerror: () => reject(new Error('Chunk upload network error')),
                        ontimeout: () => reject(new Error(`Chunk upload timed out: ${contentRange}`))
                    });
                });

                start = end;
                lastError = null;
                break;
            } catch (err) {
                lastError = err;
                if (attempt < 3) {
                    console.warn(`[Chunk] 청크 실패 (${attempt}/3), 재시도: ${err.message}`);
                } else {
                    console.error(`[Chunk] 청크 실패 (3/3): ${err.message}`);
                    EventBus.emit(EVT.LOG, { msg: `[${fileName}] 청크 업로드 3회 실패`, level: 'error', tag: 'Upload' });
                    throw lastError;
                }
            }
        }
    }
}
export async function uploadDirect(blob, folderName, fileName, metadata = {}) {
    try {
        const { forceOverwrite = false } = metadata;
        if (forceOverwrite) {
            console.log(`[DirectUpload] Force overwrite mode: ${fileName}`);
        }
        EventBus.emit(EVT.LOG, { msg: `☁️ [${fileName}] Drive 직접 업로드 준비 중... (${(blob.size / 1024 / 1024).toFixed(1)}MB)`, level: 'info', tag: 'Upload' });
        
        const config = getConfig();
        const token = await getToken();
        
        // 1. Get Series Folder ID
        let seriesFolderId = metadata.folderId;
        if (!seriesFolderId) {
            let parentFolderId = config.folderId;
            const isDriveOrKavita = (metadata.destination === 'drive' || metadata.destination === 'drive_kavita');
            if (isDriveOrKavita) {
                const categoryFolder = metadata.category || 'Webtoon';
                parentFolderId = await getOrCreateFolder(categoryFolder, config.folderId, token);
            }
            seriesFolderId = await getOrCreateFolder(folderName, parentFolderId, token);
        }
        
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

        // 3+4. [v1.28.0] Search + Session Init under per-filename lock (prevents duplicate Drive files)
        const { existingFileId, uploadUrl } = await withUploadLock(finalFileName, async () => {
            // 3. Search for existing file to decide POST (New) or PATCH (Update)
            let existingFileId = null;
            try {
                const q = `name='${finalFileName.replace(/'/g, "\\'")}' and '${targetFolderId}' in parents and trashed=false`;
                const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
                    `q=${encodeURIComponent(q)}` +
                    `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

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
                    EventBus.emit(EVT.LOG, { msg: `📎 [${fileName}] 기존 파일 발견 → 업데이트(PATCH) 모드`, level: 'info', tag: 'Upload' });
                }
            } catch (searchErr) {
                console.warn('[DirectUpload] Existing file check failed:', searchErr);
                throw new Error('기존 파일 검색 실패: ' + searchErr.message);
            }

            // 4. Initialize Resumable Session
            let uploadUrl = "";
            const sessionMetadata = {
                name: finalFileName,
                parents: existingFileId ? undefined : [targetFolderId]
            };

            const sessionUrl = existingFileId
                ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=resumable&supportsAllDrives=true`
                : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true`;

            // [v1.27.3] 세션 초기화 재시도 (최대 2회, anonymous true → false fallback)
            uploadUrl = await (async () => {
                for (let attempt = 1; attempt <= 2; attempt++) {
                    const useAnonymous = (attempt === 1); // 1회차만 anonymous: true

                    try {
                        return await new Promise((resolve, reject) => {
                            GM_xmlhttpRequest({
                                method: existingFileId ? 'PATCH' : 'POST',
                                url: sessionUrl,
                                anonymous: useAnonymous,
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
                                            const sessionUri = new URL(sessionUrl);
                                            sessionUri.searchParams.set('upload_id', uploadIdMatch[1].trim());
                                            resolve(sessionUri.toString());
                                        } else {
                                            reject(new Error(`Session URL extraction failed`));
                                        }
                                    } else {
                                        reject(new Error(`Session init failed with status: ${res.status}`));
                                    }
                                },
                                onerror: () => reject(new Error('Session init network error'))
                            });
                        });
                    } catch (err) {
                        if (attempt >= 2) throw err;
                        console.warn(`[DirectUpload] 세션 초기화 ${attempt}회 실패, 재시도: ${err.message}`);
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
                throw new Error('Session init failed after 2 attempts');
            })();

            return { existingFileId, uploadUrl };
        });

        // 5. Send chunks
        await sendResumableChunks(uploadUrl, blob, token, finalFileName);
        EventBus.emit(EVT.LOG, { msg: `✅ [${finalFileName}] Drive 업로드 완료!`, level: 'success', tag: 'Upload' });
        return;

    } catch (error) {
        EventBus.emit(EVT.LOG, { msg: `❌ [${fileName}] Drive 업로드 실패: ${error.message}`, level: 'error', tag: 'Upload' });
        throw error;
    }
}

// Export helper for main.js migration
export const getOAuthToken = getToken;

/**
 * [v1.7.4] Direct History Fetch with Size Heuristic
 * Bypasses GAS relay and directly queries the Google Drive API for the series folder.
 * Automatically filters out corrupted/incomplete files using the `(Max + Min) / 2 * 0.5` heuristic.
 * 
 * @param {string} seriesTitle 
 * @param {string} category 
 * @returns {Promise<{success: boolean, folderId: string|null, data: string[]}>} Object with valid episode IDs
 */
export async function fetchHistoryDirect(seriesTitle, category = 'Webtoon') {
    const config = getConfig();
    if (!config.folderId) return { success: false, folderId: null, data: [] };

    let currentSeriesFolderId = null;

    try {
        console.log(`[DirectHistory] Fetching history for: ${seriesTitle} (${category})`);
        const token = await getToken();
        
        const isDriveOrKavita = (config.policy === 'drive' || config.policy === 'drive_kavita');
        let parentFolderId = config.folderId;
        if (isDriveOrKavita) {
            parentFolderId = await getOrCreateFolder(category, config.folderId, token);
        }

        // Find the Series Folder ID
        currentSeriesFolderId = await getOrCreateFolder(seriesTitle, parentFolderId, token);
        
        if (!currentSeriesFolderId) {
            console.log(`[DirectHistory] Series folder not found or created.`);
            return { success: true, folderId: null, data: [] };
        }

        const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
            `q='${currentSeriesFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'` +
            `&fields=files(id,name,size)` +
            `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
            
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
            const episodeNum = extractEpisodeNum(file.name);

            if (!episodeNum) return;
            
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
export async function checkSingleHistoryDirect(folderId, episodeNumStr) {
    if (!folderId) return false;
    
    try {
        const token = await getToken();
        // Since we don't know the full exact title, we query for the number.
        // Google Drive API tokenizes queries, so querying for the number works.
        const query = `name contains '${episodeNumStr}'`;
        
        const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
            `q=${encodeURIComponent(query)} and '${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'` +
            `&fields=files(id,size,name)` +
            `&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`; // Safe margin if multiple files contain the number
            
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
            // Strict filter clientside: 다양한 파일명 규칙에서 추출한 번호가 매칭되는지 확인
            const file = result.files.find(f => {
                const episodeNum = extractEpisodeNum(f.name);

                return episodeNum && parseInt(episodeNum, 10) === parseInt(episodeNumStr, 10);
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

