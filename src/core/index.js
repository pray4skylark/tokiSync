import { main } from './main.js';
import { getConfig } from './config.js';
import { scrollToLoad, fetchBlobWithXHR, blobToArrayBuffer, waitForContent, sleep } from './utils.js';

(async function () {
    'use strict';

    // =============================================================
    // 📝 [통합 로깅 시스템] localStorage 기반 부모-자식 통합 로그 캡처
    // =============================================================
    const originalConsole = {
        log: console.log,
        debug: console.debug,
        warn: console.warn,
        error: console.error
    };
    
    const ctxMarker = (window.name === 'tokisync-novel-worker' || (window.opener && window.name === '')) ? '[Worker]' : '[Parent]';

    function saveLogToStorage(level, args) {
        try {
            const msg = args.map(a => {
                if (a && typeof a === 'object') {
                    try { return JSON.stringify(a); } catch(e) { return String(a); }
                }
                return String(a);
            }).join(' ');
            
            const now = new Date();
            const timeStr = now.toISOString().split('T')[1].replace('Z', '') + '.' + String(now.getMilliseconds()).padStart(3, '0');
            const line = `[${timeStr}] ${ctxMarker} [${level}] ${msg}\n`;
            
            let existing = localStorage.getItem('TOKI_DEBUG_LOGS') || '';
            if (existing.length > 300000) existing = existing.slice(-150000);
            localStorage.setItem('TOKI_DEBUG_LOGS', existing + line);
        } catch (err) {}
    }

    console.log = function(...args) { saveLogToStorage('LOG', args); originalConsole.log.apply(this, args); };
    console.debug = function(...args) { saveLogToStorage('DEBUG', args); originalConsole.debug.apply(this, args); };
    console.warn = function(...args) { saveLogToStorage('WARN', args); originalConsole.warn.apply(this, args); };
    console.error = function(...args) { saveLogToStorage('ERROR', args); originalConsole.error.apply(this, args); };

    window.downloadTokiLogs = function() {
        try {
            const logs = localStorage.getItem('TOKI_DEBUG_LOGS') || '로그가 없습니다.';
            const blob = new Blob([logs], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tokisync_debug_${new Date().getTime()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            originalConsole.log("💾 텍스트 로그 파일 다운로드 완료.");
        } catch (e) {
            originalConsole.error("로그 다운로드 실패:", e);
        }
    };
    
    window.clearTokiLogs = function() {
        localStorage.removeItem('TOKI_DEBUG_LOGS');
        originalConsole.log("🗑️ 텍스트 로그 초기화 완료.");
    };



    // =============================================================
    // 🛡️ [보안 극복] 네이티브 함수 가로채기 (Proxy 기반 위장)
    // =============================================================
    const originalAttachShadow = Element.prototype.attachShadow;

    Element.prototype.attachShadow = new Proxy(originalAttachShadow, {
        apply(target, thisArg, argumentsList) {
            if (argumentsList[0] && argumentsList[0].mode === 'closed') {
                console.log('[TokiSync-Worker] 🔒 닫힌 Shadow DOM 감지 -> Open 모드로 개방 완료');
                argumentsList[0].mode = 'open';
            }
            return Reflect.apply(target, thisArg, argumentsList);
        }
    });

    // =============================================================
    // 🚀 [자식 팝업 - Worker] 다형성 미디어 수집 및 부모 창 IPC 브릿지
    // =============================================================
    let isSessionWorker = false;
    try { isSessionWorker = sessionStorage.getItem('tokisync_worker_flag') === '1'; } catch(e) {}

    const isWorkerPopup = (
        window.name === 'tokisync-novel-worker' || 
        (window.opener && window.name === '') ||
        isSessionWorker
    );



    if (isWorkerPopup) {
        // 향후 location.replace 등으로 인한 컨텍스트 소실(짝수 회차 방어)을 대비해 현재 탭(세션)에 워커 각인
        try { sessionStorage.setItem('tokisync_worker_flag', '1'); } catch(e) {}
        console.log("🚀 [TokiSync-Worker] 자식 팝업 수동 대기 모드 기동");
        
        // window.opener 은폐 및 로컬 참조 복사
        const parentWin = window.opener;
        try {
            Object.defineProperty(window, 'opener', { value: null });
        } catch (e) {
            window.opener = null;
        }

        // 부모 창에게 준비 완료 신호 전송 (부모가 지시를 줄 때까지 1초마다 Heartbeat)
        let readyInterval = null;
        const startReadyHeartbeat = () => {
            if (readyInterval) clearInterval(readyInterval);
            
            const sendReady = () => {
                if (parentWin) {
                    console.log("[TokiSync-Worker] 📢 부모 창에 준비 완료 신호 전송 (Handshake Heartbeat)");
                    parentWin.postMessage({
                        type: 'TOKI_WORKER_READY',
                        timestamp: Date.now()
                    }, '*');
                }
            };

            sendReady();
            readyInterval = setInterval(sendReady, 1000);
        };

        // 중복 실행 방지용 락(Lock)
        let isExtracting = false;

        // 지시 수신 리스너 셋업
        window.addEventListener('message', async (event) => {
            if (event.data && event.data.type === 'TOKI_START_EXTRACTION') {
                // --- Cloudflare/Captcha Check ---
                const isCloudflare = document.title.includes('Just a moment') ||
                                     document.getElementById('cf-challenge-running') ||
                                     document.querySelector('.cf-browser-verification') ||
                                     document.getElementById('challenge-running');
                
                if (isCloudflare) {
                    console.warn("⚠️ [TokiSync-Worker] 클라우드플레어 인증/대기 페이지 감지. 통과를 대기합니다.");
                    if (parentWin) {
                        parentWin.postMessage({ type: 'TOKI_CAPTCHA_DETECTED', timestamp: Date.now() }, '*');
                    }
                    return; // 캡차가 통과되어 새 페이지로 리다이렉트 될 때까지 중복 실행을 막으며 조용히 대기
                }

                if (isExtracting) {
                    return;
                }
                isExtracting = true;

                const { targetType, viewerCfg } = event.data;
                console.log(`🚀 [TokiSync-Worker] 부모의 동작 지시문 수신 완료! (유형: ${targetType})`);

                // 하트비트 즉각 해제
                if (readyInterval) {
                    clearInterval(readyInterval);
                    readyInterval = null;
                }

                if (targetType === 'novel') {
                    // [소설 수집 동작]
                    let attempt = 0;
                    const checkInterval = setInterval(() => {
                        attempt++;
                        console.log(`[TokiSync-Worker] 소설 Shadow DOM 대기 중... (시도: ${attempt}회)`);

                        const novelSel = viewerCfg.novelContent || '#novel_content';
                        // 동적 셀렉터 및 폴백 적용
                        const shadowHost = document.querySelector(novelSel)?.getRootNode()?.host
                                        || document.querySelector('.novel-epub-rendered')?.getRootNode()?.host
                                        || document.querySelector('.vw-bot-mini--novel')?.parentElement?.querySelector('div[style*="--novel-font-size"]');

                        if (shadowHost && shadowHost.shadowRoot) {
                            clearInterval(checkInterval);
                            let content = '';

                            // 1차: <p> 태그 수집
                            const pTags = shadowHost.shadowRoot.querySelectorAll('.novel-epub-rendered p, p');
                            if (pTags.length > 0) {
                                content = Array.from(pTags)
                                    .map(p => p.textContent.trim())
                                    .filter(text => text.length > 0)
                                    .join('\n\n');
                            } else {
                                // 2차 폴백: innerText
                                const bodyEl = shadowHost.shadowRoot.querySelector('.novel-epub-rendered');
                                if (bodyEl) {
                                    content = bodyEl.innerText || bodyEl.textContent;
                                } else {
                                    // 3차 폴백: 노이즈 제거
                                    const tempDiv = document.createElement('div');
                                    tempDiv.innerHTML = shadowHost.shadowRoot.innerHTML;
                                    tempDiv.querySelectorAll('style, script').forEach(el => el.remove());
                                    content = tempDiv.innerText || tempDiv.textContent;
                                }
                            }

                            if (content && content.trim().length > 100) {
                                console.log(`🎯 [TokiSync-Worker] 소설 텍스트 정밀 조립 완료 - 길이: ${content.length}자`);
                                if (parentWin) {
                                    parentWin.postMessage({
                                        type: 'TOKI_MEDIA_DATA',
                                        data: {
                                            novelId: location.pathname.split('/')[2] || '0',
                                            episodeId: location.pathname.split('/')[3] || '0',
                                            contentType: 'novel',
                                            content: content.trim(),
                                            images: null,
                                            nextUrl: document.querySelector('a#next_episode')?.href || null,
                                            timestamp: Date.now()
                                        }
                                    }, '*');
                                }
                            }
                        }
                    }, 500);
                } else if (targetType === 'comic') {
                    // [만화 수집 동작]
                    try {
                        console.log("[TokiSync-Worker] ⏳ 웹툰/만화 콘텐츠 DOM 렌더링 대기 시작...");
                        
                        // 1) 팝업 창 내부에 실제 만화 이미지 요소가 렌더링될 때까지 최대 10초 대기
                        const contentDoc = await waitForContent(window, 10000, viewerCfg);
                        
                        if (!contentDoc) {
                            console.warn("[TokiSync-Worker] ⚠️ 10초 대기 내에 콘텐츠 렌더링 미감지. 갈무리 우선 진행.");
                        } else {
                            console.log("[TokiSync-Worker] 🎯 웹툰 콘텐츠 감지 완료! 1.5초 안정화 대기 시작...");
                        }

                        // 2) 1.5초 DOM 안정화 딜레이 (사용자 제안 반영 - 스크롤 꼬임 완벽 방지)
                        await sleep(1500);

                        console.log("[TokiSync-Worker] 🚀 1.5초 안정화 완료. 1차 스크롤 및 다운로드 돌입.");

                        // 3) 지연 로딩 이미지 스크롤 활성화 (부모가 제공한 viewerCfg 적용)
                        await scrollToLoad(document, 25000, viewerCfg);

                        // 이미지 다운로드를 처리하는 비동기 헬퍼 정의 (동시성 5개 한계 제어)
                        const runImageDownloads = async (imageUrls) => {
                            const downloaded = [];
                            const CONCURRENCY_LIMIT = 5;

                            for (let i = 0; i < imageUrls.length; i += CONCURRENCY_LIMIT) {
                                const chunk = imageUrls.slice(i, i + CONCURRENCY_LIMIT);
                                const chunkPromises = chunk.map(async (url, index) => {
                                    const globalIndex = i + index;
                                    try {
                                        const blob = await fetchBlobWithXHR(url);
                                        const arrayBuffer = await blobToArrayBuffer(blob);
                                        return {
                                            url,
                                            index: globalIndex,
                                            data: arrayBuffer,
                                            size: blob.size,
                                            type: blob.type
                                        };
                                    } catch (err) {
                                        console.error(`[TokiSync-Worker] 이미지 다운로드 실패 (${url}):`, err);
                                        return {
                                            url,
                                            index: globalIndex,
                                            data: null,
                                            error: err.message
                                        };
                                    }
                                });

                                const chunkResults = await Promise.all(chunkPromises);
                                downloaded.push(...chunkResults);
                            }
                            return downloaded;
                        };

                        // 이미지 URL 목록을 추출하는 헬퍼 정의 (하이브리드 파싱)
                        const extractImageUrls = () => {
                            let imageSelector = '.view-padding img, .viewer-main img, #v_content img, .img-tag';
                            if (viewerCfg.imageContainer) {
                                const itemSel = viewerCfg.imageItem || 'img';
                                imageSelector = viewerCfg.imageContainer.split(',').map(c => `${c.trim()} ${itemSel}`).join(', ');
                            }

                            const urls = Array.from(document.querySelectorAll(imageSelector))
                                .map(img => img.src || img.dataset.src || img.dataset.original)
                                .filter(src => src && !src.includes('blank.gif') && !src.includes('loading.gif'))
                                .map(src => src.trim());
                            return urls;
                        };

                        // 4) 1차 추출 및 다운로드 실행
                        let finalImages = extractImageUrls();
                        console.log(`🎯 [TokiSync-Worker] 1차 이미지 주소 ${finalImages.length}개 추출. 다운로드 개시...`);
                        let downloadedData = await runImageDownloads(finalImages);

                        // ── [iframe 명작 딥 폴백 로직 100% 재활용 이식] ──
                        // 만약 크기가 30KB 미만인 더미 플레이스홀더 이미지나 누락된 파일이 절반 이상인 경우 2차 정밀 재스크롤 구동
                        const suspiciousCount = downloadedData.filter(d => !d.data || d.size < 30000).length;
                        
                        if (suspiciousCount > finalImages.length / 2) {
                            console.warn(`⚠️ [Deep Fallback] 다수의 저용량/누락 이미지 감지 (${suspiciousCount}/${finalImages.length}). 2초 후 15초 강제 재스크롤 재시도!`);
                            await sleep(2000);
                            
                            // 2차 정밀 강제 징검다리 스크롤 기동 (15초)
                            await scrollToLoad(document, 15000, viewerCfg);
                            
                            // 최종 재추출 및 2차 재다운로드 단행
                            finalImages = extractImageUrls();
                            console.log(`🎯 [Deep Fallback] 2차 이미지 주소 ${finalImages.length}개 재추출. 최종 다운로드 재수행...`);
                            downloadedData = await runImageDownloads(finalImages);
                        }

                        console.log(`🎯 [TokiSync-Worker] 모든 이미지 수집 완료 (최종 성공: ${downloadedData.filter(d => d.data).length}/${downloadedData.length})`);

                        if (parentWin) {
                            parentWin.postMessage({
                                type: 'TOKI_MEDIA_DATA',
                                data: {
                                    novelId: location.pathname.split('/')[2] || '0',
                                    episodeId: location.pathname.split('/')[3] || '0',
                                    contentType: 'comic',
                                    content: null,
                                    images: downloadedData,
                                    nextUrl: document.querySelector('a#next_episode')?.href || null,
                                    timestamp: Date.now()
                                }
                            }, '*');
                        }
                    } catch (err) {
                        console.error('[TokiSync-Worker] 만화 이미지 수집 중 예외 발생:', err);
                    }
                }
            }
        });

        // 팝업 로딩 시 핸드셰이킹 시작
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            startReadyHeartbeat();
        } else {
            window.addEventListener('DOMContentLoaded', startReadyHeartbeat);
        }
        return; // 팝업 모드에서는 다운로더 UI 등 메인 스크립트 실행 조기 종료 (Early Exit)
    }
    
    // Viewer Config Injection (Zero-Config)
    if (location.hostname.includes('github.io') || location.hostname.includes('localhost') || location.hostname.includes('127.0.0.1')) {
        console.log("📂 TokiView (Frontend) detected. Injecting Config...");
        
        const config = getConfig();
        
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
