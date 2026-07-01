/**
 * tokiSync - Self-contained Worker Extractor
 * Executes extraction and forwards raw content back to the parent controller.
 */

import { sleep, waitForContent, scrollToLoad, fetchBlobWithXHR, blobToArrayBuffer } from './utils.js';
import { WORKER_STAGE, getQueue } from './queue.js';
import { registerIpcListener, sendToParent } from './ipc-broker.js';
import { GenericParser } from './parsers/GenericParser.js';
import { fetchNovelTextViaApi } from './novel-decryptor.js';
import { startSilentAudio, stopSilentAudio } from './anti_sleep.js';

// 🛡️ 자립형 워커 엔진 중복 실행 방지 가드용 변수
let isWorkerExtractorInitialized = false;
let workerIpcCleanup = null;

// Define localized stage reporting helper
function reportProgress(queueId, percent, stage) {
    // Send lightweight progress update to parent UI
    sendToParent('WORKER_PROGRESS', {
        queueId,
        percent: Math.min(100, Math.max(0, Math.round(percent))),
        stage
    });
}

/**
 * Main execution of the Self-contained Worker
 */
export function initWorkerExtractor() {
    if (window.tokisync_worker_extractor_initialized || isWorkerExtractorInitialized) {
        console.log("[TokiSync:Worker] 📢 이미 워커 엔진이 기동되어 중복 실행을 차단합니다.");
        return;
    }
    window.tokisync_worker_extractor_initialized = true;
    isWorkerExtractorInitialized = true;

    console.log("🚀 [TokiSync:Worker] 자립형 워커 엔진 시동 완료 (수집 전담 모드)");

    // Establish Handshake Heartbeat every second until parent injects instructions
    let handshakeInterval = setInterval(() => {
        console.log("[TokiSync:Worker] 📢 READY 핸드셰이킹 하트비트 전송 중...");
        sendToParent('WORKER_READY', {
            targetUrl: window.location.href,
            timestamp: Date.now()
        });
    }, 1000);

    let isExtracting = false;

    // Register listener for commands from parent
    if (workerIpcCleanup) {
        try {
            workerIpcCleanup();
        } catch (e) {
            console.warn('[TokiSync:Worker] 기존 워커 IPC 리스너 해제 실패:', e);
        }
        workerIpcCleanup = null;
    }

    const cleanupIpc = () => {
        if (workerIpcCleanup) {
            workerIpcCleanup();
            workerIpcCleanup = null;
        }
    };

    workerIpcCleanup = registerIpcListener(async (msg) => {
        if (msg.type === 'EMERGENCY_STOP') {
            console.warn('[TokiSync:Worker] ⏹️ 긴급 정지 명령 수신 (EMERGENCY_STOP)');
            cleanupIpc();
            stopSilentAudio();
            window.close();
            return;
        }

        if (msg.type === 'START_EXTRACTION') {
            const { queueId } = msg.payload;

            // 안티 슬립 오디오 기동 (백그라운드 스로틀링 회피)
            try {
                startSilentAudio();
            } catch (e) {
                console.warn('[TokiSync:Worker] 안티 슬립 기동 실패 (무시 가능):', e.message);
            }

            // CF Challenge Check
            const isCloudflare = document.title.includes('Just a moment') ||
                                 document.getElementById('cf-challenge-running') ||
                                 document.querySelector('.cf-browser-verification') ||
                                 document.getElementById('challenge-running');
            
            if (isCloudflare) {
                console.warn("⚠️ [TokiSync:Worker] 클라우드플레어 보안 챌린지 감지 - 대기 모드 진입");
                sendToParent('CAPTCHA_DETECTED', { queueId });
                return;
            }

            if (isExtracting) return;
            isExtracting = true;

            // Stop Handshake Heartbeat
            if (handshakeInterval) {
                clearInterval(handshakeInterval);
                handshakeInterval = null;
            }

            const { 
                targetType, 
                seriesTitle, 
                rootFolder, 
                episodeTitle, 
                episodeNum, 
                matchedRule,
                protocolDomain,
                scanSpeedMultiplier = 1.0,
                speedMultiplier = 1.0,
                sessionNonce
            } = msg.payload;

            console.log(`🚀 [TokiSync:Worker] 동작 지시문 수신 (ID: ${queueId}, 유형: ${targetType})`);
            reportProgress(queueId, 10, WORKER_STAGE.DOM_READY);

            // Reconstruct parser instance using injected matchedRule
            const parser = new GenericParser(protocolDomain || window.location.origin, matchedRule);
            const viewerCfg = parser.rule.viewer || {};

            // 생명주기 제어 변수 및 헬퍼 선제 선언 (try-catch 양쪽 스코프 공유)
            let ackTimeout = null;
            let stateListenerId = null;
            let fallbackInterval = null;
            let ackCleanup = null;

            const closeSelf = () => {
                if (ackTimeout) clearTimeout(ackTimeout);
                if (fallbackInterval) clearInterval(fallbackInterval);
                if (stateListenerId && typeof GM_removeValueChangeListener !== 'undefined') {
                    try {
                        GM_removeValueChangeListener(stateListenerId);
                    } catch (e) {}
                }
                if (ackCleanup) {
                    try { ackCleanup(); } catch (e) {}
                }
                cleanupIpc();
                stopSilentAudio();
                console.log(`[TokiSync:Worker] 🏁 자체 파기(window.close)를 집행합니다.`);
                window.close();
            };

            try {
                let content = "";
                let resolvedImages = [];

                // --- 1. SOSEL EXTRACTION ---
                if (targetType === 'novel') {
                    reportProgress(queueId, 20, WORKER_STAGE.DOM_READY);

                    // [v1.21.9] 소설 가상 스크롤 시뮬레이션 작동 (인간 행동 분석 우회)
                    console.log("[TokiSync:Worker] 소설 가상 스크롤 시뮬레이션 작동...");
                    sendToParent('WORKER_LOG', { msg: `소설 가상 스크롤 시뮬레이션 시작...`, level: 'info' });
                    reportProgress(queueId, 30, WORKER_STAGE.SCROLLING);

                    const findScrollContainer = () => {
                        const candidates = [
                            document.querySelector('.viewer-container'),
                            document.querySelector('.episode-body'),
                            document.querySelector('main'),
                            document.body,
                            document.documentElement
                        ];
                        return candidates.find(el => el && el.scrollHeight > el.clientHeight) || document.documentElement;
                    };

                    const container = findScrollContainer();
                    console.log(`[TokiSync:Worker] 감지된 스크롤 컨테이너:`, container.tagName, container.className);
                    sendToParent('WORKER_LOG', { msg: `스크롤 컨테이너 감지: <${container.tagName.toLowerCase()}> (전체 높이: ${container.scrollHeight}px)`, level: 'info' });

                    const totalHeight = container.scrollHeight || 3000;
                    const scrollSteps = 5;
                    const behavior = 'smooth';

                    for (let step = 1; step <= scrollSteps; step++) {
                        // 중단 여부 체크 (스토리지에서 큐 상태 확인)
                        const queue = getQueue();
                        const currentItem = queue.find(q => q.id === queueId);
                        if (!currentItem || currentItem.status === 'failed') {
                            console.warn('[TokiSync:Worker] ⏹️ 소설 가상 스크롤 중 대기열 중단 감지 -> 즉시 정지');
                            cleanupIpc();
                            stopSilentAudio();
                            window.close();
                            return;
                        }

                        const targetY = (totalHeight / scrollSteps) * step;
                        
                        // 1. 강제 스크롤 대입 및 scrollTo 병행
                        if (container === document.documentElement || container === document.body) {
                            window.scrollTo({ top: targetY });
                            document.documentElement.scrollTop = targetY;
                            document.body.scrollTop = targetY;
                        } else {
                            container.scrollTo({ top: targetY });
                            container.scrollTop = targetY;
                        }

                        // 2. 키보드 이벤트 시뮬레이션 디스패치 (PageDown, ArrowDown)
                        const simulateKey = (target, keyStr, code) => {
                            try {
                                target.dispatchEvent(new KeyboardEvent('keydown', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                                target.dispatchEvent(new KeyboardEvent('keypress', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                                target.dispatchEvent(new KeyboardEvent('keyup', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                            } catch (e) {}
                        };
                        simulateKey(container, 'PageDown', 34);
                        simulateKey(container, 'ArrowDown', 40);
                        simulateKey(window, 'PageDown', 34);
                        simulateKey(window, 'ArrowDown', 40);

                        container.dispatchEvent(new Event('scroll'));
                        window.dispatchEvent(new Event('scroll'));

                        sendToParent('WORKER_LOG', { msg: `가상 스크롤 진행 중: ${Math.round((step / scrollSteps) * 100)}%`, level: 'info' });
                        await sleep(800 * speedMultiplier);
                    }

                    // 최종 스크롤 아래로 고정
                    if (container === document.documentElement || container === document.body) {
                        window.scrollTo({ top: totalHeight });
                        document.documentElement.scrollTop = totalHeight;
                        document.body.scrollTop = totalHeight;
                    } else {
                        container.scrollTo({ top: totalHeight });
                        container.scrollTop = totalHeight;
                    }
                    
                    // 최종 키보드 이벤트 디스패치
                    const finalSimulateKey = (target, keyStr, code) => {
                        try {
                            target.dispatchEvent(new KeyboardEvent('keydown', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                            target.dispatchEvent(new KeyboardEvent('keyup', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                        } catch (e) {}
                    };
                    finalSimulateKey(container, 'PageDown', 34);
                    finalSimulateKey(window, 'PageDown', 34);

                    container.dispatchEvent(new Event('scroll'));
                    window.dispatchEvent(new Event('scroll'));
                    await sleep(300 * speedMultiplier);

                    let attempt = 0;
                    const maxAttempts = 10;

                    // Poll Shadow DOM for novel text
                    while (attempt < maxAttempts) {
                        attempt++;
                        console.log(`[TokiSync:Worker] 소설 Shadow DOM 폴링 중... (${attempt}/${maxAttempts})`);
                        
                        const novelSel = viewerCfg.novelContent || '#novel_content';
                        const shadowHost = document.querySelector(novelSel)?.getRootNode()?.host
                                        || document.querySelector('.novel-epub-rendered')?.getRootNode()?.host
                                        || document.querySelector('.vw-bot-mini--novel')?.parentElement?.querySelector('div[style*="--novel-font-size"]');

                        if (shadowHost && shadowHost.shadowRoot) {
                            reportProgress(queueId, 50, WORKER_STAGE.PARSING);
                            const pTags = shadowHost.shadowRoot.querySelectorAll('.novel-epub-rendered p, p');
                            if (pTags.length > 0) {
                                content = Array.from(pTags)
                                    .map(p => p.textContent.trim())
                                    .filter(text => text.length > 0)
                                    .join('\n\n');
                            } else {
                                const bodyEl = shadowHost.shadowRoot.querySelector('.novel-epub-rendered');
                                if (bodyEl) {
                                    content = bodyEl.innerText || bodyEl.textContent;
                                } else {
                                    const tempDiv = document.createElement('div');
                                    tempDiv.innerHTML = shadowHost.shadowRoot.innerHTML;
                                    tempDiv.querySelectorAll('style, script').forEach(el => el.remove());
                                    content = tempDiv.innerText || tempDiv.textContent;
                                }
                            }
                            break;
                        }
                        await sleep(200 * speedMultiplier);
                    }

                    // Fallback to Plan C: Decryption API
                    if ((!content || content.trim().length < 100) && viewerCfg.decryptApi) {
                        console.warn("[TokiSync:Worker] Shadow DOM 추출 실패 - Plan C API 복호화 폴백 구동");
                        content = await fetchNovelTextViaApi(window.location.href, viewerCfg.decryptApi);
                    }

                    if (!content || content.trim().length < 100) {
                        throw new Error("소설 본문 추출에 실패했습니다. (Shadow DOM/API 복호화 무반응)");
                    }

                    reportProgress(queueId, 85, WORKER_STAGE.PARSING);
                } 
                // --- 2. MANHWA EXTRACTION ---
                else {
                    console.log("[TokiSync:Worker] 웹툰 콘텐츠 DOM 렌더링 대기 중...");
                    reportProgress(queueId, 20, WORKER_STAGE.DOM_READY);

                    // Wait for comic content inside DOM
                    const contentDoc = await waitForContent(window, Math.round(10000 * scanSpeedMultiplier), viewerCfg);
                    if (!contentDoc) {
                        console.warn("[TokiSync:Worker] 10초 내 콘텐츠 렌더링 미감지. 갈무리 강행.");
                    }

                    // 1.5s DOM Stabilization delay
                    reportProgress(queueId, 30, WORKER_STAGE.DOM_READY);
                    await sleep(1500);

                    console.log("[TokiSync:Worker] 스크롤 로드 및 이미지 다운로드 활성화");
                    reportProgress(queueId, 40, WORKER_STAGE.SCROLLING);

                    // Physical scroll down
                    await scrollToLoad(document, 25000, viewerCfg, scanSpeedMultiplier);

                    // Downloader helper with concurrency 5
                    const runImageDownloads = async (imageUrls) => {
                        const downloaded = [];
                        const CONCURRENCY_LIMIT = 5;
                        let processedCount = 0;

                        reportProgress(queueId, 0, WORKER_STAGE.DOWNLOADING);

                        for (let i = 0; i < imageUrls.length; i += CONCURRENCY_LIMIT) {
                            // [v1.21.8] 다운로드 루프 중 중단 여부 체크 (스토리지에서 큐 상태 확인)
                            const queue = getQueue();
                            const currentItem = queue.find(q => q.id === queueId);
                            if (!currentItem || currentItem.status === 'failed') {
                                console.warn('[TokiSync:Worker] ⏹️ 이미지 다운로드 중 대기열 중단 감지 -> 즉시 정지');
                                cleanupIpc();
                                stopSilentAudio();
                                window.close();
                                return [];
                            }

                            const chunk = imageUrls.slice(i, i + CONCURRENCY_LIMIT);
                            const chunkPromises = chunk.map(async (url, index) => {
                                const globalIndex = i + index;
                                try {
                                    const imgBlob = await fetchBlobWithXHR(url, window.location.href);
                                    const arrayBuffer = await blobToArrayBuffer(imgBlob);
                                    processedCount++;

                                    const percent = (processedCount / imageUrls.length) * 100;
                                    reportProgress(queueId, percent, WORKER_STAGE.DOWNLOADING);

                                    return {
                                        url,
                                        index: globalIndex,
                                        data: arrayBuffer,
                                        size: imgBlob.size,
                                        type: imgBlob.type
                                     };
                                } catch (err) {
                                    console.error(`[TokiSync:Worker] 이미지 다운로드 실패 (${url}):`, err);
                                    processedCount++;
                                    const percent = (processedCount / imageUrls.length) * 100;
                                    reportProgress(queueId, percent, WORKER_STAGE.DOWNLOADING);

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

                    // Execute initial fetch & download
                    let finalImages = parser.getImageList(document);
                    console.log(`🎯 [TokiSync:Worker] 1차 이미지 주소 ${finalImages.length}개 추출 완료.`);
                    let downloadedData = await runImageDownloads(finalImages.map(img => img.url));

                    // Deep Fallback: Trigger 15s retry if >50% placeholder dummy detected
                    const suspiciousCount = downloadedData.filter(d => !d.data || d.size < 30000).length;
                    if (suspiciousCount > finalImages.length / 2) {
                        console.warn(`⚠️ [Deep Fallback] 다수 더미 파일 감지 (${suspiciousCount}/${finalImages.length}) - 15초 정밀 재스크롤 시도`);
                        reportProgress(queueId, 35, WORKER_STAGE.SCROLLING);
                        await sleep(2000);
                        
                        await scrollToLoad(document, 15000, viewerCfg, scanSpeedMultiplier);
                        
                        finalImages = parser.getImageList(document);
                        console.log(`🎯 [Deep Fallback] 2차 이미지 주소 ${finalImages.length}개 재추출 완료.`);
                        downloadedData = await runImageDownloads(finalImages.map(img => img.url));
                    }

                    // Placeholders Bypass Integration
                    const mergedData = downloadedData.map((downloadedItem, idx) => {
                        const originalInfo = finalImages[idx];
                        if ((!downloadedItem.data || downloadedItem.size < 100) && originalInfo && !originalInfo.isDummy) {
                            console.log(`[Worker] Dummy placeholder bypassed back to verified URL: ${downloadedItem.url}`);
                        }
                        return downloadedItem;
                    });

                    console.log(`🎯 [TokiSync:Worker] 이미지 조립 준비 (부모 스레드 전달용)`);
                    reportProgress(queueId, 85, WORKER_STAGE.PARSING);

                    resolvedImages = mergedData.map(img => {
                        return {
                            url: img.url,
                            data: img.data, // ArrayBuffer 유지 (Transferable)
                            ext: img.type?.includes('png') ? '.png' : (img.type?.includes('webp') ? '.webp' : '.jpg'),
                            isMissing: !img.data
                        };
                    });
                }

                // --- 3. DATA TRANSMISSION & ACK LIFECYCLE ---
                console.log(`[TokiSync:Worker] 데이터 전송 기동 - 부모 스레드로 전달 시작`);
                reportProgress(queueId, 95, WORKER_STAGE.UPLOADING);

                let completed = false;

                const sendData = async () => {
                    const payload = { queueId };
                    const transferables = [];

                    if (targetType === 'novel') {
                        payload.content = content.trim();
                    } else {
                        payload.images = resolvedImages;
                        resolvedImages.forEach(img => {
                            if (img.data) {
                                transferables.push(img.data);
                            }
                        });
                    }

                    try {
                        console.log(`[TokiSync:Worker] 1차 시도: postMessage 기반 전송 개시...`);
                        sendToParent('TASK_COMPLETED', payload, sessionNonce, transferables);
                        console.log(`[TokiSync:Worker] postMessage 송신 완료. 부모의 ACK를 기다립니다.`);
                    } catch (ipcErr) {
                        console.warn(`[TokiSync:Worker] ⚠️ postMessage 실패 (샌드박스 차단 의심) -> GM_setValue 2차 폴백 구동:`, ipcErr);
                        
                        await new Promise((resolve) => {
                            GM_setValue(`tokisync_fallback_${queueId}`, payload);
                            // 전송 알림
                            sendToParent('TASK_COMPLETED_FALLBACK', { queueId });
                            resolve();
                        });
                    }
                };

                // 부모의 ACK 응답을 받기 위한 이벤트 리스너 등록
                const checkStateAndClose = (queueData) => {
                    try {
                        const items = Array.isArray(queueData) ? queueData : [];
                        const myItem = items.find(i => i.id === queueId);
                        if (myItem && (myItem.status === 'completed' || myItem.status === 'failed')) {
                            console.log(`[TokiSync:Worker] 🎯 중앙 스토리지에서 상태 감지 완료: ${myItem.status}`);
                            closeSelf();
                        }
                    } catch (e) {
                        console.error('[TokiSync:Worker] 상태 감지 분석 오류:', e);
                    }
                };

                ackCleanup = registerIpcListener(async (ackMsg) => {
                    if (ackMsg.type === 'IPC_ACK' && ackMsg.payload?.queueId === queueId) {
                        console.log(`[TokiSync:Worker] 🎉 부모의 ACK 수신 완료! 중앙 스토리지 완료/실패 대기 개시...`);
                        if (ackTimeout) clearTimeout(ackTimeout);
                        ackCleanup();

                        // 즉시 1회 검사
                        checkStateAndClose(getQueue());

                        // 1. GM Storage 리스너 등록
                        if (typeof GM_addValueChangeListener !== 'undefined') {
                            stateListenerId = GM_addValueChangeListener('TOKI_DOWNLOAD_QUEUE', (key, oldValue, newValue, remote) => {
                                try {
                                    const parsed = typeof newValue === 'string' ? JSON.parse(newValue) : newValue;
                                    checkStateAndClose(parsed);
                                } catch (e) {
                                    checkStateAndClose(newValue);
                                }
                            });
                        }

                        // 2. 일반 환경 Fallback 폴링 가동
                        fallbackInterval = setInterval(() => {
                            checkStateAndClose(getQueue());
                        }, 500);
                    }
                }, `worker_ack_${queueId}`);

                // ACK 대기 타임아웃 (15초간 부모 무반응 시 강제 종료)
                ackTimeout = setTimeout(() => {
                    console.warn(`[TokiSync:Worker] ⚠️ 부모 ACK 대기 타임아웃 (15초). 세션을 강제 종료합니다.`);
                    ackCleanup();
                    closeSelf();
                }, 15000);

                await sendData();

                } catch (err) {
                    console.error(`[TokiSync:Worker] ❌ 에피소드 수집 중 치명적 오류 발생:`, err);
                    // Notify parent that task failed
                    sendToParent('TASK_FAILED', { queueId, errorMsg: err.message });
                    closeSelf();
                }
            }
        }, 'worker_extractor');
    }
