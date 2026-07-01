import { getConfig, isConfigValid } from './config.js';
import { uploadDirect } from './network.js';
import { EventBus, EVT } from './EventBus.js';
import { logger } from './logger.js';
import { arrayBufferToBase64 } from './utils.js';

function gasRequest(payload, options = {}) {
    const config = getConfig();
    if (!config.gasUrl || !config.folderId) {
        if (options.rejectOnConfigError) {
            return Promise.reject(new Error("GAS 설정이 누락되었습니다."));
        }
        return Promise.resolve(options.defaultValue);
    }
    const timeout = options.timeout || 30000;
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: config.gasUrl,
            data: JSON.stringify({
                folderId: config.folderId,
                apiKey: config.apiKey,
                protocolVersion: 3,
                ...payload
            }),
            headers: { 'Content-Type': 'text/plain' },
            timeout: timeout,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        resolve(options.onSuccess ? options.onSuccess(json) : json.body);
                    } else {
                        if (options.onError) options.onError(json.body);
                        if (options.rejectOnError) reject(new Error(json.body || "GAS Request Failed"));
                        else resolve(options.defaultValue);
                    }
                } catch (e) {
                    if (options.onParseError) options.onParseError(res.responseText, e);
                    if (options.rejectOnError) reject(new Error("GAS 응답 오류"));
                    else resolve(options.defaultValue);
                }
            },
            onerror: (err) => {
                if (options.onNetworkError) options.onNetworkError(err);
                if (options.rejectOnError) reject(new Error("네트워크 오류"));
                else resolve(options.defaultValue);
            },
            ontimeout: () => {
                if (options.onTimeout) options.onTimeout();
                if (options.rejectOnError) reject(new Error("타임아웃"));
                else resolve(options.defaultValue);
            }
        });
    });
}

/**
 * Uploads a Blob to Google Drive via Direct Access (primary) or GAS Relay (fallback)
 * @param {Blob} blob File content
 * @param {string} folderName Target folder name (e.g. "[123] Title")
 * @param {string} fileName Target file name (e.g. "[123] Title.zip")
 */
export async function uploadToGAS(blob, folderName, fileName, options = {}) {
    const config = getConfig();
    if (!isConfigValid()) throw new Error("GAS 설정이 누락되었습니다. 메뉴에서 설정을 완료해주세요.");
    
    // Try Direct Upload first
    try {
        console.log('[Upload] Attempting Direct Drive API upload...');
        await uploadDirect(blob, folderName, fileName, options);
        console.log('[Upload] ✅ Direct upload succeeded');
        return; // Success!
    } catch (directError) {
        console.warn('[Upload] ⚠️  Direct upload failed, falling back to GAS relay:', directError.message);
        logger.warn('Direct 업로드 실패 → GAS 릴레이 폴백: ' + directError.message + ' (' + fileName + ')', 'GAS:Upload');
    }
    
    // Fallback to GAS Relay
    console.log('[Upload] Using GAS relay fallback...');
    await uploadViaGASRelay(blob, folderName, fileName, options);
}

/**
 * 업로드 완료 후 GAS의 _toki_cache.json을 갱신합니다 (비동기, fire-and-forget)
 * 에피소드 c30치 다운로드 완료 후 한 번만 호출하세요.
 */
export async function refreshCacheAfterUpload(folderName, category = 'Unknown', metadata = {}) {
    console.log(`[Cache] 업로드 완료 → Drive 캐시 갱신 요청 (${folderName})`);
    return gasRequest({
        type: 'view_update_cache',
        folderName,
        category,
        metadata
    }, {
        timeout: 30000,
        defaultValue: undefined,
        onSuccess: (json) => {
            console.log('[Cache] 갱신 요청 완료. 병합 파편 생성됨:', json.body);
        },
        onParseError: () => {
            console.log('[Cache] 갱신 완료 응답 수신 (상세없음)');
        },
        onNetworkError: () => {
            logger.warn(`캐시 갱신 네트워크 오류 (${folderName}) — 다음 실행 시 자동 복구됨`, 'GAS:Cache');
        },
        onTimeout: () => {
            logger.warn(`캐시 갱신 타임아웃 30초 (${folderName}) — 스킬폭 포함 가능`, 'GAS:Cache');
        }
    });
}

/**
 * Legacy GAS Relay Upload (Fallback)
 * @param {Blob} blob File content
 * @param {string} folderName Target folder name
 * @param {string} fileName Target file name
 */
async function uploadViaGASRelay(blob, folderName, fileName, options = {}) {
    const config = getConfig();
    if (!isConfigValid()) throw new Error("GAS 설정이 누락되었습니다. 메뉴에서 설정을 완료해주세요.");
    
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
        EventBus.emit(EVT.LOG, {
            msg: `☁️ GAS 릴레이 업로드 중... ${percentage}%`,
            level: 'info',
            tag: 'Upload'
        });

        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", 
                url: config.gasUrl,
                data: JSON.stringify({ 
                    folderId: config.folderId, 
                    type: "upload", 
                    protocolVersion: 3,
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

export async function fetchHistory(seriesTitle, category = 'Webtoon') {
    if (!isConfigValid()) return [];
    console.log(`[GAS] 다운로드 기록 조회 중... (${seriesTitle})`);
    return gasRequest({
        type: "check_history",
        folderName: seriesTitle,
        category: category
    }, {
        timeout: 30000,
        defaultValue: [],
        onSuccess: (json) => Array.isArray(json.body) ? json.body : [],
        onError: (errBody) => {
            logger.warn(`다운로드 기록 조회 실패: ${errBody}`, 'GAS:History');
        },
        onParseError: () => {
            logger.warn(`다운로드 기록 응답 파싱 실패`, 'GAS:History');
        },
        onNetworkError: () => {
            logger.warn(`다운로드 기록 조회 네트워크 오류`, 'GAS:History');
        },
        onTimeout: () => {
            logger.warn(`다운로드 기록 조회 타임아웃 (30초)`, 'GAS:History');
        }
    });
}

export async function getBooksByCacheId(cacheFileId) {
    if (!isConfigValid()) return [];
    console.log(`[GAS] 캐시 파일 직행 조회 중... (${cacheFileId})`);
    return gasRequest({
        type: "view_get_books_by_cache",
        cacheFileId: cacheFileId
    }, {
        timeout: 10000,
        defaultValue: [],
        onSuccess: (json) => Array.isArray(json.body) ? json.body : [],
        onError: (errBody) => {
            logger.warn(`Fast Path 캐시 직행 조회 실패: ${errBody}`, 'GAS:FastPath');
        },
        onParseError: () => {
            logger.warn(`Fast Path 캐시 응답 파싱 실패`, 'GAS:FastPath');
        },
        onNetworkError: () => {
            logger.warn(`Fast Path 캐시 네트워크 오류`, 'GAS:FastPath');
        },
        onTimeout: () => {
            logger.warn(`Fast Path 캐시 조회 타임아웃 (10초)`, 'GAS:FastPath');
        }
    });
}

export async function initUpdateUploadViaGASRelay(fileId, fileName) {
    if (!isConfigValid()) throw new Error("GAS 설정이 누락되었습니다.");
    console.log(`[GAS] 빠른 덮어쓰기(PUT) 세션 초기화 중... (${fileName} -> ${fileId})`);
    return gasRequest({
        type: "init_update",
        fileId: fileId,
        fileName: fileName
    }, {
        timeout: 30000,
        rejectOnConfigError: true,
        rejectOnError: true,
        onSuccess: (json) => (typeof json.body === 'object') ? json.body.uploadUrl : json.body,
        onError: (errBody) => {
            logger.critical(`Fast Path PUT 세션 초기화 실패: ${errBody} (${fileName})`, 'GAS:FastPath');
        },
        onParseError: () => {
            logger.critical(`Fast Path PUT 레스폰스 파싱 실패 (${fileName})`, 'GAS:FastPath');
        },
        onNetworkError: () => {
            logger.critical(`Fast Path PUT 네트워크 오류 (${fileName})`, 'GAS:FastPath');
        },
        onTimeout: () => {
            logger.critical(`Fast Path PUT 타임아웃 30초 (${fileName})`, 'GAS:FastPath');
        }
    });
}

export async function getMergeIndexFragment(sourceId) {
    if (!isConfigValid()) return { found: false, data: null };
    console.log(`[GAS] 병합 인덱스 파편 조회 중... (Source ID: ${sourceId})`);
    return gasRequest({
        type: "view_get_merge_index",
        sourceId: sourceId
    }, {
        timeout: 10000,
        defaultValue: { found: false, data: null },
        onError: (errBody) => {
            logger.warn(`MergeIndex 파편 조회 실패: ${errBody} (ID: ${sourceId})`, 'GAS:FastPath');
        },
        onParseError: () => {
            logger.warn(`MergeIndex 파편 응답 파싱 실패`, 'GAS:FastPath');
        },
        onNetworkError: () => {
            logger.warn(`MergeIndex 파편 조회 네트워크 오류`, 'GAS:FastPath');
        },
        onTimeout: () => {
            logger.warn(`MergeIndex 파편 조회 타임아웃 (10초)`, 'GAS:FastPath');
        }
    });
}

