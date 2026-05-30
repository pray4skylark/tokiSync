import { main } from './main.js';
import { getConfig } from './config.js';
import { scrollToLoad, fetchBlobWithXHR, blobToArrayBuffer, waitForContent, sleep, saveFile } from './utils.js';
import { getQueue, addEpisodesToQueue, updateQueueItem, updateQueueItemProgress, clearQueue, removeCompletedItems, getQueueStats, WORKER_STAGE, activeWorkers } from './queue.js';
import { EpubBuilder } from './epub.js';
import { CbzBuilder } from './cbz.js';
import { TxtBuilder } from './txt.js';
import { LogBox } from './ui.js';
import { initWorkerExtractor } from './worker-extractor.js';

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
    
    const ctxMarker = (window.name === 'tokisync-novel-worker' || window.name.startsWith('tokisync_novel_worker_') || (window.opener && window.name === '')) ? '[Worker]' : '[Parent]';

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
    // 📊 [멀티큐] 영속성 큐 인터페이스 전역 노출 (디버그 및 UI 연동용)
    // =============================================================
    window.tokiQueue = {
        getQueue,
        addEpisodesToQueue,
        updateQueueItem,
        clearQueue,
        removeCompletedItems,
        getQueueStats,
        WORKER_STAGE
    };



    // =============================================================
    // 🛡️ [보안 극복] 자체 보안 스크립트 무력화 (Bypass Anti-Debugger)
    // =============================================================
    try {
        // 1. 뉴토끼 자체 개발자 도구 감지 차단막(Preflight) 우회 선점
        window.__ntkDevtoolsPreflight = 1;
        if (typeof unsafeWindow !== 'undefined') {
            unsafeWindow.__ntkDevtoolsPreflight = 1;
        }

        // 2. 혹시 모를 차단 이력(ntk_blk) 초기화 및 차단 해제
        document.cookie = "ntk_blk=; Path=/; Max-Age=0; SameSite=Lax; Secure";
        localStorage.removeItem("ntk_blk");
        console.log('[TokiSync] 🛡️ ntkDevtoolsPreflight 우회 플래그 적용 및 ntk_blk 차단 초기화 완료');

        // 3. 3중 정밀 네트워크 스푸핑 가드 (sendBeacon, fetch, XHR)
        // A. sendBeacon 투명 스푸핑 (가짜 true 반환 및 실제 전송 차단)
        const originalSendBeacon = navigator.sendBeacon;
        if (originalSendBeacon) {
            navigator.sendBeacon = new Proxy(originalSendBeacon, {
                apply(target, thisArg, argumentsList) {
                    const url = argumentsList[0];
                    if (typeof url === 'string' && url.includes('/api/dev-block')) {
                        console.log('[TokiSync] 🛡️ 차단 로그 비콘 전송 차단 완료 (Bypass /api/dev-block)');
                        return true; // 전송이 성공한 것으로 사이트를 속임
                    }
                    return Reflect.apply(target, thisArg, argumentsList);
                }
            });
        }

        // B. fetch 투명 스푸핑 (가짜 200 OK Response 반환)
        const originalFetch = window.fetch;
        if (originalFetch) {
            window.fetch = new Proxy(originalFetch, {
                apply(target, thisArg, argumentsList) {
                    const input = argumentsList[0];
                    let url = '';
                    if (typeof input === 'string') {
                        url = input;
                    } else if (input && typeof input === 'object' && 'url' in input) {
                        url = input.url;
                    }
                    if (typeof url === 'string' && url.includes('/api/dev-block')) {
                        console.log('[TokiSync] 🛡️ Fetch 차단 로그 전송 차단 완료 (Fake 200 OK)');
                        return Promise.resolve(new Response(JSON.stringify({ status: 'success' }), {
                            status: 200,
                            statusText: 'OK',
                            headers: new Headers({ 'Content-Type': 'application/json' })
                        }));
                    }
                    return Reflect.apply(target, thisArg, argumentsList);
                }
            });
        }

        // C. XHR 투명 스푸핑 (실제 통신을 끊고 가짜 200 OK 이벤트 강제 트리거)
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._isDevBlock = typeof url === 'string' && url.includes('/api/dev-block');
            return originalXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function() {
            if (this._isDevBlock) {
                console.log('[TokiSync] 🛡️ XHR 차단 로그 전송 차단 완료 (Fake 200 OK)');
                // read-only 속성들을 writable로 임시 재정의하여 값 변경
                Object.defineProperty(this, 'readyState', { value: 4, writable: true, configurable: true });
                Object.defineProperty(this, 'status', { value: 200, writable: true, configurable: true });
                Object.defineProperty(this, 'statusText', { value: 'OK', writable: true, configurable: true });
                Object.defineProperty(this, 'responseText', { value: JSON.stringify({ status: 'success' }), writable: true, configurable: true });
                
                if (typeof this.onreadystatechange === 'function') {
                    this.onreadystatechange();
                }
                this.dispatchEvent(new Event('readystatechange'));
                this.dispatchEvent(new Event('load'));
                return;
            }
            return originalXHRSend.apply(this, arguments);
        };

    } catch (e) {
        console.warn('[TokiSync] 보안 스크립트 및 API 우회 적용 중 오류:', e.message);
    }

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
        window.name.startsWith('tokisync_novel_worker_') ||
        (window.opener && window.name === '') ||
        isSessionWorker
    );



    if (isWorkerPopup) {
        // 향후 location.replace 등으로 인한 컨텍스트 소실(짝수 회차 방어)을 대비해 현재 탭(세션)에 워커 각인
        try { sessionStorage.setItem('tokisync_worker_flag', '1'); } catch(e) {}
        
        initWorkerExtractor();
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
