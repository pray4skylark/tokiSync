/**
 * tokiSync - Self-contained Worker Extractor
 * Executes extraction, packaging, and direct Drive uploading inside the child popup.
 */

import { sleep, waitForContent, scrollToLoad, fetchBlobWithXHR, blobToArrayBuffer, saveFile } from './utils.js';
import { EpubBuilder } from './epub.js';
import { CbzBuilder } from './cbz.js';
import { TxtBuilder } from './txt.js';
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
    console.log("🚀 [TokiSync:Worker] 자립형 워커 엔진 시동 완료");

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
                rootFolder, // Normalized parent-side root folder name ([ID] Title)
                episodeTitle, 
                episodeNum, 
                folderId, 
                destination, 
                novelFormat, 
                matchedRule,
                protocolDomain,
                scanSpeedMultiplier = 1.0,
                localNameTemplate = "{number} - {title}",
                localEpisodePadding = "4"
            } = msg.payload;

            console.log(`🚀 [TokiSync:Worker] 동작 지시문 수신 (ID: ${queueId}, 유형: ${targetType})`);
            reportProgress(queueId, 10, WORKER_STAGE.DOM_READY);

            // Reconstruct parser instance using injected matchedRule
            const parser = new GenericParser(protocolDomain || window.location.origin, matchedRule);
            const viewerCfg = parser.rule.viewer || {};

            try {
                let blob = null;
                const configNovelFormat = novelFormat || 'epub';
                const extension = (targetType === 'novel') ? configNovelFormat : 'cbz';
                
                // Final Filename: Dynamic based on Template or Drive fallback
                let fullFilename;
                if (destination !== 'drive') {
                    const paddingVal = parseInt(localEpisodePadding, 10);
                    const paddedNum = paddingVal > 0 
                        ? (episodeNum || '').toString().padStart(paddingVal, '0') 
                        : (episodeNum || '').toString();

                    const template = localNameTemplate || "{number} - {title}";
                    fullFilename = template
                        .replace(/{number}/g, paddedNum)
                        .replace(/{rawNumber}/g, (episodeNum || '').toString())
                        .replace(/{series}/g, seriesTitle || rootFolder || '')
                        .replace(/{title}/g, episodeTitle || '');
                } else {
                    const paddedNum = (episodeNum || '').toString().padStart(4, '0');
                    fullFilename = `${paddedNum} - ${episodeTitle}`;
                }

                // --- 1. SOSEL EXTRACTION ---
                if (targetType === 'novel') {
                    reportProgress(queueId, 20, WORKER_STAGE.DOM_READY);
                    let content = "";
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

                    reportProgress(queueId, 70, WORKER_STAGE.PARSING);
                    console.log(`[TokiSync:Worker] 소설 빌더 가동 시작 (${configNovelFormat.toUpperCase()})`);

                    const builder = (configNovelFormat === 'txt') ? new TxtBuilder() : new EpubBuilder();
                    builder.addChapter(episodeTitle, content.trim());
                    const zip = await builder.build({
                        series: seriesTitle,
                        title: episodeTitle,
                        number: episodeNum,
                        writer: 'TokiSync'
                    });
                    blob = await zip.generateAsync({ type: 'blob' });

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

                    console.log(`🎯 [TokiSync:Worker] 이미지 조립 및 CBZ 빌딩 개시`);
                    reportProgress(queueId, 85, WORKER_STAGE.PARSING);

                    const builder = new CbzBuilder();
                    const resolvedImages = mergedData.map(img => {
                        const mimeType = img.type || 'image/jpeg';
                        return {
                            url: img.url,
                            blob: img.data ? new Blob([img.data], { type: mimeType }) : new Blob([]),
                            ext: img.type?.includes('png') ? '.png' : (img.type?.includes('webp') ? '.webp' : '.jpg'),
                            isMissing: !img.data
                        };
                    });

                    builder.addChapter(episodeTitle, resolvedImages);
                    const zip = await builder.build({
                        series: seriesTitle,
                        title: episodeTitle,
                        number: episodeNum,
                        writer: 'TokiSync'
                    });
                    blob = await zip.generateAsync({ type: 'blob' });
                }

                // --- 3. STORAGE PERSISTENCE (Direct Save/Upload) ---
                console.log(`[TokiSync:Worker] I/O 드라이버 기동 - 저장소 적재 시작 (${destination})`);
                reportProgress(queueId, 90, WORKER_STAGE.UPLOADING);

                await saveFile(blob, fullFilename, destination || 'drive', extension, {
                    folderName: rootFolder || seriesTitle,
                    category: targetType,
                    folderId: folderId || ''
                });

                console.log(`[TokiSync:Worker] 🎉 에피소드 수집 & 저장 완착 완료! (${fullFilename})`);
                
                // Update final queue status inside Dexie/GM storage
                updateQueueItem(queueId, { 
                    status: 'completed', 
                    stage: WORKER_STAGE.COMPLETED, 
                    progressPercent: 100 
                });
                
                reportProgress(queueId, 100, WORKER_STAGE.COMPLETED);
                
                // Notify parent that task succeeded
                sendToParent('TASK_COMPLETED', { queueId });
                cleanupIpc();

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
