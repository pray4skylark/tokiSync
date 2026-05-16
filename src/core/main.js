import { tokiDownload, processItem } from './downloader.js';
import { detectSite, getMaxEpisodes, parseEpisodeRange } from './detector.js'; 
import { showConfigModal, getConfig, setConfig, isConfigValid } from './config.js';
import { LogBox, markDownloadedItems, MenuModal, TreeRuleEditor } from './ui.js';
import { extractEpisodeData } from './extractor.js';
import { EpubBuilder } from './epub.js';
import { CbzBuilder } from './cbz.js';
import { TxtBuilder } from './txt.js';
import { fetchHistory } from './gas.js';
import { ParserFactory } from './parsers/ParserFactory.js';
import { getOAuthToken, fetchHistoryDirect } from './network.js';

import { getCommonPrefix, blobToArrayBuffer, saveFile } from './utils.js';

export async function main() {
    console.log("🚀 TokiDownloader Loaded (New Core v1.9.3)");
    
    const logger = LogBox.getInstance();

    // -- 0. Pre-detection & Core States --
    const siteInfo = await detectSite();
    if(!siteInfo) return; 

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
                    apiKey: config.apiKey,
                    protocolVersion: 3
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
                    apiKey: config.apiKey,
                    protocolVersion: 3
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

    // -- History Sync (Async) & Cross-Tab Auto Refresh --
    let lastSyncTime = Date.now();
    let isSyncing = false;

    const syncHistory = async () => {
        if (isSyncing) return;
        isSyncing = true;
        try {
            const parser = await ParserFactory.getParser();
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
            const rootFolder = parser.getFormattedTitle(seriesId, first.title, last.title, getCommonPrefix);

            const category = siteInfo.category || 'Webtoon';

            if (!isConfigValid()) {
                console.log('[TokiSync] GAS 설정을 찾을 수 없어 이력 동기화를 건너뜁니다.');
                return;
            }

            console.log(`[TokiSync] Fetching history for: ${rootFolder} (${category})`);
            
            // [v1.9.1] Use fetchHistoryDirect for faster & more reliable sync
            const result = await fetchHistoryDirect(rootFolder, category);
            
            if (result.success) {
                console.log(`[TokiSync] Received ${result.data.length} history items via Direct API`);
                if (result.data.length > 0) {
                    await markDownloadedItems(result.data);
                } else {
                    console.log('[TokiSync] No history items found in Drive');
                }
            } else {
                // Fallback to Legacy GAS if Direct fails
                console.warn('[TokiSync] Direct history fetch failed, trying legacy GAS relay...');
                const legacyHistory = await fetchHistory(rootFolder, category);
                if (legacyHistory && legacyHistory.length > 0) {
                    await markDownloadedItems(legacyHistory);
                }
            }
        } catch (e) {
            console.warn('[TokiSync] History check failed:', e);
        } finally {
            isSyncing = false;
            lastSyncTime = Date.now();
        }
    };

    // -- 1. Initialize MenuModal --
    new MenuModal({
        onDownload: () => {}, // Not used directly, specific methods below
        downloadAll: (forceOverwrite) => {
            const config = getConfig();
            tokiDownload(undefined, config.policy, forceOverwrite);
        },
        downloadRange: (spec, forceOverwrite) => {
            const config = getConfig();
            tokiDownload(spec, config.policy, forceOverwrite);
        },
        openViewer: openViewer,
        openSettings: () => showConfigModal(),
        toggleLog: () => logger.toggle(),
        getConfig: getConfig,
        setConfig: setConfig,
        getEpisodeRange: async () => {
            const parser = await ParserFactory.getParser();
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
        syncHistory: syncHistory,
        testNativeDownload: async () => {
            try {
                const testBlob = new Blob(["TokiSync Native Mode Test File"], { type: "text/plain" });
                await saveFile(testBlob, "test", "native", "txt", { folderName: "_Test" });
                return true;
            } catch (e) {
                console.error("[Native Test Failed]", e);
                return false;
            }
        },
        testExtraction: async () => {
            try {
                const logger = LogBox.getInstance();
                logger.show();
                logger.log('🧪 추출 테스트 시작...', 'Debug');
                
                const parser = await ParserFactory.getParser();
                if (!parser) {
                    logger.error('❌ 파서를 찾을 수 없습니다.', 'Debug');
                    return;
                }

                const siteInfo = await detectSite();
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
                LogBox.getInstance().error(`❌ 테스트 실패: ${e.message}`, 'Debug');
                console.error(e);
            }
        },
        downloadCurrent: async () => {
            const logger = LogBox.getInstance();
            try {
                logger.show();
                logger.log('🚀 현재 에피소드 다운로드 시작...', 'System');
                
                const siteInfo = await detectSite();
                const parser = await ParserFactory.getParser();
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
                    const novelFormat = getConfig().novelFormat || 'epub';
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

                await saveFile(blob, filename, 'local', extension, { category: siteInfo.category });
                logger.success('✅ 다운로드 완료!', 'System');

            } catch (e) {
                logger.error(`❌ 다운로드 실패: ${e.message}`, 'System');
                console.error(e);
            }
        }
    });


    // -- 2. Register Legacy Menu Commands (Fallback) --
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('⚙️ 설정 (Settings)', () => showConfigModal());
        GM_registerMenuCommand('🧩 파싱 규칙 관리', () => {
            const editor = new TreeRuleEditor();
            editor.show();
        });
        GM_registerMenuCommand('📜 로그창 토글 (Log)', () => logger.toggle());
        GM_registerMenuCommand('🌐 Viewer 열기', openViewer);
        GM_registerMenuCommand('📥 전체 다운로드', () => {
            const config = getConfig();
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
                            payload = await blobToArrayBuffer(res.response);
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
