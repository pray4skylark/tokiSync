import { getConfig, isConfigValid } from './config.js';
import { uploadDirect } from './network.js';

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
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
    }
    
    // Fallback to GAS Relay
    console.log('[Upload] Using GAS relay fallback...');
    await uploadViaGASRelay(blob, folderName, fileName, options);
}

/**
 * 업로드 완료 후 GAS의 _toki_cache.json을 갱신합니다 (비동기, fire-and-forget)
 * 에피소드 c30치 다운로드 완료 후 한 번만 호출하세요.
 */
export async function refreshCacheAfterUpload(folderName, category = 'Unknown') {
    const config = getConfig();
    if (!config.gasUrl || !config.folderId) return;
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
                apiKey: config.apiKey,
                protocolVersion: 3,
            }),
            headers: { 'Content-Type': 'text/plain' },
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    console.log('[Cache] 갱신 결과:', json.body);
                } catch (_) {}
                resolve();
            },
            onerror: () => resolve(),
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
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') { 
                        // uploadUrl can be string or object depending on server version, handling both
                        uploadUrl = (typeof json.body === 'object') ? json.body.uploadUrl : json.body;
                        resolve(); 
                    } else {
                        reject(new Error(json.body || "Init failed"));
                    }
                } catch (e) { reject(new Error("GAS 응답 오류(Init): " + res.responseText)); }
            },
            onerror: (e) => reject(new Error("네트워크 오류(Init)"))
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
                onload: (res) => {
                    try { 
                        const json = JSON.parse(res.responseText); 
                        if (json.status === 'success') resolve(); 
                        else reject(new Error(json.body || "Upload failed")); 
                    } catch (e) { reject(new Error("GAS 응답 오류(Upload): " + res.responseText)); }
                },
                onerror: (e) => reject(new Error("네트워크 오류(Upload)"))
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
export async function fetchHistory(seriesTitle, category = 'Webtoon') {
    const config = getConfig();
    if (!config.gasUrl) return [];

    console.log(`[GAS] 다운로드 기록 조회 중... (${seriesTitle})`);

    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: config.gasUrl,
            data: JSON.stringify({
                type: "check_history",
                folderId: config.folderId,
                folderName: seriesTitle, // Using seriesTitle as folderName for check
                category: category,
                apiKey: config.apiKey
            }),
            headers: { "Content-Type": "text/plain" },
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        // json.body should be an array of episode IDs (e.g. ["0001", "0002"])
                        resolve(Array.isArray(json.body) ? json.body : []);
                    } else {
                        console.warn("[GAS] 기록 조회 실패:", json.body);
                        resolve([]);
                    }
                } catch (e) {
                    console.error("[GAS] 응답 파싱 실패:", e);
                    resolve([]);
                }
            },
            onerror: () => {
                console.error("[GAS] 기록 조회 네트워크 오류");
                resolve([]);
            }
        });
    });
}
