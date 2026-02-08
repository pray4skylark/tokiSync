import { tokiDownload } from './downloader.js';
import { detectSite } from './detector.js';
import { showConfigModal, getConfig } from './config.js';
import { LogBox, markDownloadedItems } from './ui.js';
import { fetchHistory } from './gas.js';
import { getListItems, parseListItem } from './parser.js';

import { getCommonPrefix, blobToArrayBuffer } from './utils.js';

export function main() {
    console.log("🚀 TokiDownloader Loaded (New Core)");
    
    // 1. Global Settings (Always available)
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('설정', () => showConfigModal());
        GM_registerMenuCommand('로그창 토글', () => LogBox.getInstance().toggle());

        GM_registerMenuCommand('Viewer 열기 (설정 전송)', () => {
             const config = getConfig();
             const viewerUrl = "https://pray4skylark.github.io/tokiSync/";
             const win = window.open(viewerUrl, "_blank");
             
             if(win) {
                 // Try to send config periodically until success or timeout
                 let attempts = 0;
                 const interval = setInterval(() => {
                     attempts++;
                     win.postMessage({ type: 'TOKI_CONFIG', config: config }, '*');
                     if(attempts > 10) clearInterval(interval);
                 }, 500);
             } else {
                 alert("팝업 차단을 해제해주세요.");
             }
        });

        GM_registerMenuCommand('🔄 썸네일 최적화 변환 (v1.4.0)', async () => {
            if(!confirm("이 작업은 기존 다운로드된 작품들의 썸네일을 새로운 최적화 폴더(_Thumbnails)로 이동시킵니다.\n실행하시겠습니까? (서버 부하가 발생할 수 있습니다)")) return;
            
            const config = getConfig();
            const win = window.open("", "MigrationLog", "width=600,height=800");
            win.document.write("<h3>🚀 v1.4.0 Migration Started...</h3><pre id='log'></pre>");
            
            try {
                // Trigger GAS Migration
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: config.gasUrl,
                    data: JSON.stringify({
                        type: 'view_migrate_thumbnails', // New Action
                        folderId: config.folderId,
                        apiKey: config.apiKey
                    }),
                    onload: (res) => {
                        try {
                            const result = JSON.parse(res.responseText);
                            if(result.status === 'success') {
                                const logs = result.body.join('\n');
                                win.document.getElementById('log').innerText = logs;
                                alert("✅ 마이그레이션이 완료되었습니다!\n이제 Viewer에서 썸네일이 정상적으로 표시됩니다.");
                            } else {
                                win.document.getElementById('log').innerText = "Failed: " + result.error;
                                alert("❌ 오류 발생: " + result.error);
                            }
                        } catch (e) {
                            // GAS returned HTML error instead of JSON
                            win.document.getElementById('log').innerText = res.responseText;
                            alert("❌ GAS 서버 오류 (JSON 파싱 실패)\n로그 창을 확인해주세요.");
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
        });
    }

    // 1-1. Bridge Listener (New: Direct Access Proxy)
    window.addEventListener("message", async (event) => {
        if (event.data.type === 'TOKI_BRIDGE_REQUEST') {
            const { requestId, url, options } = event.data;
            const sourceWindow = event.source;
            const origin = event.origin;

            // Simple Origin Check (Allow GitHub Pages & Localhost)
            if (!origin.includes("github.io") && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
                console.warn("[Bridge] Blocked request from unknown origin:", origin);
                return;
            }

            console.log(`[Bridge] Proxying request: ${url}`);

            try {
                // Execute GM_xmlhttpRequest
                GM_xmlhttpRequest({
                    method: options.method || 'GET',
                    url: url,
                    headers: options.headers,
                    responseType: 'blob', // Always get blob for binary safety
                    onload: async (res) => {
                        let payload = null;
                        
                        // Convert Blob to ArrayBuffer for postMessage transfer
                        if (res.response instanceof Blob) {
                            payload = await blobToArrayBuffer(res.response);
                        } else {
                            // Fallback for text/json
                            payload = res.responseText;
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

    const siteInfo = detectSite();
    if(!siteInfo) return; // Not a target page

    // 2. Site Specific Commands
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('전체 다운로드', () => {
            const config = getConfig();
            tokiDownload(undefined, undefined, config.policy);
        });
        
        GM_registerMenuCommand('N번째 회차부터', () => {
             const start = prompt('몇번째 회차부터 저장할까요?', 1);
             if(start) {
                 const config = getConfig();
                 tokiDownload(parseInt(start), undefined, config.policy);
             }
        });

        GM_registerMenuCommand('N번째 회차부터 N번째 까지', () => {
             const start = prompt('몇번째 회차부터 저장할까요?', 1);
             const end = prompt('몇번째 회차까지 저장할까요?', 2);
             if(start && end) {
                 const config = getConfig();
                 tokiDownload(parseInt(start), parseInt(end), config.policy);
             }
        });
    }

    // 3. History Sync (Async)
    console.log('[TokiSync] Starting history sync...');
    (async () => {
        try {
            const list = getListItems();
            console.log(`[TokiSync] Found ${list.length} list items`);
            if (list.length === 0) {
                console.warn('[TokiSync] No list items found, skipping history sync');
                return;
            }

            // Replicate RootFolder Logic (Series Title Resolution)
            const first = parseListItem(list[0]);
            const last = parseListItem(list[list.length - 1]);

            // Extract Series ID from URL
            const idMatch = document.URL.match(/\/(novel|webtoon|comic)\/([0-9]+)/);
            const seriesId = idMatch ? idMatch[2] : "0000";

            let seriesTitle = "";
            let rootFolder = "";

            if (list.length > 1) {
                seriesTitle = getCommonPrefix(first.title, last.title);
                if (seriesTitle.length > 2) {
                    rootFolder = `[${seriesId}] ${seriesTitle}`;
                } else {
                    rootFolder = `[${seriesId}] ${first.title} ~ ${last.title}`;
                }
            } else {
                rootFolder = `[${seriesId}] ${first.title}`;
            }

            // Determine Category
            let category = 'Webtoon';
            if (siteInfo.site === '북토끼') category = 'Novel';
            else if (siteInfo.site === '마나토끼') category = 'Manga';

            // Fetch & Mark
            console.log(`[TokiSync] Fetching history for: ${rootFolder} (${category})`);
            const history = await fetchHistory(rootFolder, category);
            console.log(`[TokiSync] Received ${history.length} history items:`, history);
            if (history.length > 0) {
                markDownloadedItems(history);
            } else {
                console.log('[TokiSync] No history items to mark');
            }
        } catch (e) {
            console.warn('[TokiSync] History check failed:', e);
        }
    })();
}

// Auto-run main if imported? Or let index.js call it.
// Since we are refactoring, likely index.js will just import and call main().
