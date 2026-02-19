import { tokiDownload } from './downloader.js';
import { detectSite, getMaxEpisodes, parseEpisodeRange } from './detector.js'; // Need to export getMaxEpisodes/parseEpisodeRange if possible, or implement logic here.
import { showConfigModal, getConfig, setConfig } from './config.js';
import { LogBox, markDownloadedItems, MenuModal } from './ui.js';
import { fetchHistory } from './gas.js';
import { getListItems, parseListItem } from './parser.js';
import { getOAuthToken } from './network.js';

import { getCommonPrefix, blobToArrayBuffer } from './utils.js';

export function main() {
    console.log("🚀 TokiDownloader Loaded (New Core v1.5.0)");
    
    const logger = LogBox.getInstance();

    // -- Helper Functions for Menu Actions --

    const openViewer = () => {
         const config = getConfig();
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
        
        const config = getConfig();
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
            
            const token = await getOAuthToken(); // FIXME: OAuth or API Key? Config uses API Key usually.
            const config = getConfig();
            
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
    new MenuModal({
        onDownload: () => {}, // Not used directly, specific methods below
        downloadAll: () => {
            const config = getConfig();
            tokiDownload(undefined, undefined, config.policy);
        },
        downloadRange: (start, end) => {
            const config = getConfig();
            tokiDownload(start, end, config.policy);
        },
        openViewer: openViewer,
        openSettings: () => showConfigModal(),
        toggleLog: () => logger.toggle(),
        getConfig: getConfig,
        setConfig: setConfig,
        getEpisodeRange: () => {
            const list = getListItems();
            if (list.length > 0) {
                const first = parseListItem(list[0]);
                const last = parseListItem(list[list.length - 1]);
                const min = Math.min(parseInt(first.num), parseInt(last.num));
                const max = Math.max(parseInt(first.num), parseInt(last.num));
                return { min, max };
            }
            return { min: 1, max: 100 };
        },
        migrateFilenames: runFilenameMigration,
        migrateThumbnails: runThumbnailMigration
    });


    // -- 2. Register Legacy Menu Commands (Fallback) --
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('⚙️ 설정 (Settings)', () => showConfigModal());
        GM_registerMenuCommand('📜 로그창 토글 (Log)', () => logger.toggle());
        GM_registerMenuCommand('🌐 Viewer 열기', openViewer);
        GM_registerMenuCommand('📥 전체 다운로드', () => {
            const config = getConfig();
            tokiDownload(undefined, undefined, config.policy);
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
                            payload = await blobToArrayBuffer(res.response);
                        } else {
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
    if(!siteInfo) return; 

    // -- 4. History Sync (Async) --
    console.log('[TokiSync] Starting history sync...');
    (async () => {
        try {
            const list = getListItems();
            console.log(`[TokiSync] Found ${list.length} list items`);
            if (list.length === 0) {
                console.warn('[TokiSync] No list items found, skipping history sync');
                return;
            }

            const first = parseListItem(list[0]);
            const last = parseListItem(list[list.length - 1]);

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

            let category = 'Webtoon';
            if (siteInfo.site === '북토끼') category = 'Novel';
            else if (siteInfo.site === '마나토끼') category = 'Manga';

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
