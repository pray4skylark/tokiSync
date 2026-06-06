/**
 * tokiSync - Self-contained Worker Extractor
 * Executes extraction and forwards raw content back to the parent controller.
 */

import { sleep, waitForContent, scrollToLoad, fetchBlobWithXHR, blobToArrayBuffer } from './utils.js';
import { updateQueueItem, WORKER_STAGE } from './queue.js';
import { registerIpcListener, sendToParent } from './ipc-broker.js';
import { GenericParser } from './parsers/GenericParser.js';
import { fetchNovelTextViaApi } from './novel-decryptor.js';

// Define localized stage reporting helper
function reportProgress(queueId, percent, stage) {
    updateQueueItem(queueId, {
        progressPercent: Math.min(100, Math.max(0, Math.round(percent))),
        stage: stage
    });
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
    const cleanupIpc = registerIpcListener(async (msg) => {
        if (msg.type === 'START_EXTRACTION') {
            const { queueId } = msg.payload;

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
                scanSpeedMultiplier = 1.0
            } = msg.payload;

            console.log(`🚀 [TokiSync:Worker] 동작 지시문 수신 (ID: ${queueId}, 유형: ${targetType})`);
            reportProgress(queueId, 10, WORKER_STAGE.DOM_READY);

            // Reconstruct parser instance using injected matchedRule
            const parser = new GenericParser(protocolDomain || window.location.origin, matchedRule);
            const viewerCfg = parser.rule.viewer || {};

            try {
                let content = "";
                let resolvedImages = [];

                // --- 1. SOSEL EXTRACTION ---
                if (targetType === 'novel') {
                    reportProgress(queueId, 20, WORKER_STAGE.DOM_READY);
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
                        await sleep(500);
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
                        sendToParent('TASK_COMPLETED', payload, transferables);
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
                let ackTimeout = null;
                const ackCleanup = registerIpcListener(async (ackMsg) => {
                    if (ackMsg.type === 'IPC_ACK' && ackMsg.payload?.queueId === queueId) {
                        console.log(`[TokiSync:Worker] 🎉 부모의 ACK 수신 완료! 안전하게 세션을 종료합니다.`);
                        if (ackTimeout) clearTimeout(ackTimeout);
                        ackCleanup();
                        
                        // 최종 큐 상태 업데이트
                        updateQueueItem(queueId, { 
                            status: 'completed', 
                            stage: WORKER_STAGE.COMPLETED, 
                            progressPercent: 100 
                        });
                        reportProgress(queueId, 100, WORKER_STAGE.COMPLETED);
                        
                        cleanupIpc();
                        
                        // 팝업 닫기 세이프가드
                        setTimeout(() => {
                            window.close();
                        }, 500);
                    }
                });

                // ACK 대기 타임아웃 (15초간 부모 무반응 시 강제 종료)
                ackTimeout = setTimeout(() => {
                    console.warn(`[TokiSync:Worker] ⚠️ 부모 ACK 대기 타임아웃 (15초). 강제 완료 처리합니다.`);
                    ackCleanup();
                    updateQueueItem(queueId, { 
                        status: 'completed', 
                        stage: WORKER_STAGE.COMPLETED, 
                        progressPercent: 100 
                    });
                    reportProgress(queueId, 100, WORKER_STAGE.COMPLETED);
                    cleanupIpc();
                    window.close();
                }, 15000);

                await sendData();

            } catch (err) {
                console.error(`[TokiSync:Worker] ❌ 에피소드 수집 중 치명적 오류 발생:`, err);
                
                updateQueueItem(queueId, { 
                    status: 'failed', 
                    stage: WORKER_STAGE.FAILED, 
                    errorMsg: err.message 
                });
                
                reportProgress(queueId, 0, WORKER_STAGE.FAILED);
                
                // Notify parent that task failed
                sendToParent('TASK_FAILED', { queueId, errorMsg: err.message });
                cleanupIpc();
            }
        }
    });
}
