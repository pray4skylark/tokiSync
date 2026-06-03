/**
 * tokiSync - Unified Worker Controller
 * Manages single popup lifecycle and IPC routing for sequential download mode.
 */

import { fetchNovelTextViaApi } from './novel-decryptor.js';
import { registerIpcListener, sendToWorker } from './ipc-broker.js';
import { updateQueueItem, WORKER_STAGE, activeWorkers, getQueue, runSchedulerOnce } from './queue.js';
import { EventBus, EVT } from './EventBus.js';
import { getConfig } from './config.js';
import { refreshCacheAfterUpload } from './gas.js';

// Reference for the single worker popup (used in sequential mode)
let activeWorkerRef = null;

/**
 * Close active single worker popup window
 */
export function closeActiveWorker() {
    if (activeWorkerRef && !activeWorkerRef.closed) {
        console.log('[WorkerController] 단일 워커 팝업 세션 수동 폐쇄');
        activeWorkerRef.close();
    }
    activeWorkerRef = null;
}

/**
 * Run a single collection attempt via the Worker Popup
 */
async function fetchMediaViaWorkerSingleAttempt(episodeUrl, targetType = 'novel', config = {}) {
    const timeoutDuration = config.timeout || 45000;

    return new Promise((resolve) => {
        let timeoutId = null;
        let handshakeTimeoutId = null;
        let cleanupIpc = null;
        let livenessInterval = null;

        const cleanup = () => {
            if (cleanupIpc) { cleanupIpc(); cleanupIpc = null; }
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (handshakeTimeoutId) { clearTimeout(handshakeTimeoutId); handshakeTimeoutId = null; }
            if (livenessInterval) { clearInterval(livenessInterval); livenessInterval = null; }
        };

        // Register consolidated IPC Listener
        cleanupIpc = registerIpcListener(async (msg) => {
            const { type, payload } = msg;

            // 1. Handshake Ready Received ➡️ Inject Action Instructions
            if (type === 'WORKER_READY') {
                if (handshakeTimeoutId) {
                    console.log('[WorkerController] 🎉 단일 워커 핸드셰이킹 성공 (30초 세이프티 해제)');
                    clearTimeout(handshakeTimeoutId);
                    handshakeTimeoutId = null;
                }

                if (activeWorkerRef && !activeWorkerRef.closed) {
                    console.log(`[WorkerController] 📢 READY 수신 ➡️ 지시 주입 (유형: ${targetType})`);
                    
                    // Inject metadata bundle for local self-contained execution
                    sendToWorker(activeWorkerRef, 'START_EXTRACTION', {
                        queueId: config.queueId || `${location.pathname.split('/')[2] || '0'}_${location.pathname.split('/')[3] || '0'}`,
                        targetType: targetType,
                        seriesTitle: config.seriesTitle || 'UnknownSeries',
                        rootFolder: config.rootFolder || config.seriesTitle || 'UnknownSeries', // Explicit normalized drive root folder name
                        episodeTitle: config.episodeTitle || 'UnknownEpisode',
                        episodeNum: config.episodeNum || '0000',
                        folderId: config.folderId || '',
                        destination: config.destination || 'local',
                        novelFormat: config.novelFormat || 'epub',
                        matchedRule: config.matchedRule || {},
                        protocolDomain: config.protocolDomain || window.location.origin,
                        scanSpeedMultiplier: config.scanSpeedMultiplier || 1.0,
                        localNameTemplate: config.localNameTemplate || "{number} - {title}",
                        localEpisodePadding: config.localEpisodePadding || "4"
                    });
                }
            }

            // 2. CAPTCHA detected ➡️ Extend timeout to 5 minutes
            if (type === 'CAPTCHA_DETECTED') {
                console.warn('[WorkerController] ⚠️ 캡차/CF 감지 ➡️ 타임아웃 5분으로 확장');
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => {
                        cleanup();
                        console.error('[WorkerController] 캡차 타임아웃 (5분)');
                        closeActiveWorker();
                        resolve(false);
                    }, 300000);
                }
            }

            // 3. Child Progress reporting ➡️ Forward to logger
            if (type === 'WORKER_PROGRESS') {
                const { percent, stage } = payload;
                
                let stageText = '대기 중';
                if (stage === WORKER_STAGE.DOM_READY) stageText = '페이지 로딩';
                else if (stage === WORKER_STAGE.SCROLLING) stageText = '스크롤 스캔';
                else if (stage === WORKER_STAGE.PARSING) stageText = '미디어 파싱';
                else if (stage === WORKER_STAGE.DOWNLOADING) stageText = '다운로드';
                else if (stage === WORKER_STAGE.UPLOADING) stageText = '드라이브 저장';
                else if (stage === WORKER_STAGE.COMPLETED) stageText = '완료';

                EventBus.emit(EVT.LOG, {
                    msg: `[수집 진행] [${config.episodeTitle || '에피소드'}] -> ${stageText} (${Math.round(percent)}%)`,
                    tag: 'Downloader',
                    level: 'info'
                });
            }

            // 4. Task completed successfully
            if (type === 'TASK_COMPLETED') {
                cleanup();
                
                // Add WAF jitter delay (3~5s) to stay stealthy
                const jitterDelay = 3000 + Math.random() * 2000;
                console.log(`[WorkerController] WAF 지터 대기 (${(jitterDelay / 1000).toFixed(2)}초)...`);
                await new Promise(r => setTimeout(r, jitterDelay));
                
                resolve(true); // Success
            }

            // 5. Task failed with error
            if (type === 'TASK_FAILED') {
                cleanup();
                console.error(`[WorkerController] 자식 워커가 에러를 보고함: ${payload.errorMsg}`);
                resolve(false); // Fail
            }
        });

        // 팝업 수동 종료 실시간 감시 타이머 (Liveness Guard)
        livenessInterval = setInterval(() => {
            if (activeWorkerRef && activeWorkerRef.closed) {
                console.warn('[WorkerController] ⚠️ 단일 워커 팝업 수동 종료 감지 (즉시 예외 복구)');
                cleanup();
                closeActiveWorker();
                resolve(false);
            }
        }, 1000);

        // 30s Handshake Safety (Fast-fail if redirect blocked or popup frozen)
        handshakeTimeoutId = setTimeout(() => {
            cleanup();
            console.error('[WorkerController] ⚠️ 30초 핸드셰이킹 타임아웃 (리다이렉션 차단 의심)');
            closeActiveWorker();
            resolve(false);
        }, 30000);

        // General Timeout
        timeoutId = setTimeout(() => {
            cleanup();
            console.error(`[WorkerController] 수집 타임아웃 (${timeoutDuration / 1000}초)`);
            closeActiveWorker();
            resolve(false);
        }, timeoutDuration);

        // Start or Recycle Popup window
        try {
            if (activeWorkerRef && !activeWorkerRef.closed) {
                console.log('[WorkerController] 기존 워커 팝업 재사용 (location.replace):', episodeUrl);
                try {
                    activeWorkerRef.location.replace(episodeUrl);
                    activeWorkerRef.name = 'tokisync-novel-worker';
                } catch (replaceErr) {
                    console.warn('[WorkerController] location.replace 차단 ➡️ href 폴백:', replaceErr);
                    activeWorkerRef.location.href = episodeUrl;
                    activeWorkerRef.name = 'tokisync-novel-worker';
                }
            } else {
                console.log('[WorkerController] 신규 단일 워커 팝업 기동:', episodeUrl);
                activeWorkerRef = window.open(
                    episodeUrl,
                    'tokisync-novel-worker',
                    'width=400,height=600,left=0,top=0,noopener=false,scrollbars=yes,resizable=yes'
                );
                if (!activeWorkerRef) {
                    throw new Error('브라우저 팝업 차단이 감지되었습니다.');
                }
            }
        } catch (err) {
            cleanup();
            console.error('[WorkerController] 워커 팝업 기동 실패:', err);
            closeActiveWorker();
            alert(`[TokiSync 팝업 차단 알림]\n\n브라우저 주소창 우측에서 [팝업 및 리다이렉트 항상 허용]으로 설정해 주셔야 합니다.\n(오류: ${err.message})`);
            resolve(false);
        }
    });
}

/**
 * Manage retries for worker popup collection
 */
async function fetchMediaViaWorker(episodeUrl, targetType = 'novel', config = {}) {
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`[WorkerController] 🚀 수집 시도 (${attempt}/${MAX_RETRIES}) — URL: ${episodeUrl}`);

        if (attempt > 1) {
            console.warn('[WorkerController] ⚠️ 이전 시도 실패 — 워커 세션 재설정');
            closeActiveWorker();
            await new Promise(r => setTimeout(r, 1500));
        }

        try {
            const success = await fetchMediaViaWorkerSingleAttempt(episodeUrl, targetType, config);
            if (success) {
                console.log(`[WorkerController] 🎉 수집 성공 (${attempt}/${MAX_RETRIES})`);
                return true; // Return success status
            }
            console.warn(`[WorkerController] ⚠️ 수집 실패 (${attempt}/${MAX_RETRIES}) — 작업 불완성`);
        } catch (err) {
            console.error(`[WorkerController] ❌ 수집 예외 (${attempt}/${MAX_RETRIES}):`, err);
        }
    }

    console.error(`[WorkerController] 🛑 총 ${MAX_RETRIES}회 전부 실패 — URL: ${episodeUrl}`);
    return false;
}

// =============================================================
// 공개 진입점 (Gateway) — downloader.js 전용
// =============================================================

/**
 * 소설 본문 수집 (Plan B: 자립형 팝업 ➡️ Plan C: API 복호화 폴백)
 */
export async function fetchNovelText(episodeUrl, config = {}) {
    console.log('[WorkerController] 소설 수집 개시 (Plan B — 자립형 팝업)');
    const success = await fetchMediaViaWorker(episodeUrl, 'novel', config);

    if (success) return true; // Success (Worker already saved it!)

    // Plan C Fallback: Local API Decryption (if decryptApi configuration exists)
    if (config.decryptApi || config.endpoint) {
        console.warn('[WorkerController] Plan B 실패 ➡️ Plan C(API 복호화) 로컬 폴백 시도');
        const content = await fetchNovelTextViaApi(episodeUrl, config.decryptApi || config);
        if (content) {
            // Since API fallback runs in parent, parent must write it
            return content; // Return raw text so downloader.js can package and save
        }
    }

    return null;
}

/**
 * 만화/웹툰 이미지 수집 (Plan B: 자립형 팝업)
 */
export async function fetchComicImages(episodeUrl, config = {}) {
    console.log('[WorkerController] 만화 이미지 수집 개시 (Plan B — 자립형 팝업)');
    return await fetchMediaViaWorker(episodeUrl, 'comic', config);
}

/**
 * 🚦 배치/드라이브 전용 자율 분산형 멀티 워커 제어 엔진 (v1.21.0)
 * 여러 개의 자식 팝업 창으로부터 오는 IPC 이벤트를 독립적으로 라우팅하여 멀티태스킹 수행
 */
export function initBatchWorkerController() {
    if (window.tokisync_batch_controller_initialized) return;
    window.tokisync_batch_controller_initialized = true;

    console.log('[WorkerController] 🚦 [배치 모드] 백그라운드 영속성 IPC 라우터 활성화 완료');

    // 정기적인 자식 팝업 닫힘 실시간 감시 (Batch Liveness Guard)
    const batchClosedCounts = new Map();
    setInterval(() => {
        const queue = getQueue();
        for (const [id, popupRef] of activeWorkers.entries()) {
            const actualRef = popupRef && (popupRef.ref || popupRef);
            if (actualRef && actualRef.closed) {
                const closedCount = (batchClosedCounts.get(id) || 0) + 1;
                batchClosedCounts.set(id, closedCount);

                if (closedCount >= 5) {
                    console.warn(`[WorkerController] ⚠️ [배치] 자식 팝업 수동 종료 확정: ${id}`);
                    activeWorkers.delete(id);
                    batchClosedCounts.delete(id);

                    const item = queue.find(i => i.id === id);
                    if (item && item.status === 'processing') {
                        const nextRetry = (item.retryCount || 0) + 1;
                        updateQueueItem(id, {
                            status: nextRetry >= 3 ? 'failed' : 'pending',
                            retryCount: nextRetry,
                            errorMsg: '자식 팝업 창이 비정상적으로 강제 종료되었습니다.'
                        });
                        EventBus.emit(EVT.LOG, {
                            msg: `❌ [배치 수동종료] [${item.episodeTitle}] 자식 팝업이 종료되어 복구를 단행합니다.`,
                            tag: 'Queue',
                            level: 'error'
                        });
                        runSchedulerOnce();
                    }
                }
            } else {
                batchClosedCounts.set(id, 0);
            }
        }
    }, 2000);

    registerIpcListener(async (msg) => {
        const { type, payload, sourceEvent } = msg;
        if (!sourceEvent || !sourceEvent.source) return;

        // 1. WORKER_READY: 자식 워커 핸드셰이킹 수신
        if (type === 'WORKER_READY') {
            const { targetUrl } = payload || {};
            let matchedId = null;

            // 1차: activeWorkers의 window 참조 비교
            for (const [id, popupRef] of activeWorkers.entries()) {
                if (popupRef === sourceEvent.source) {
                    matchedId = id;
                    break;
                }
            }

            // 2차: URL 기반 매칭 폴백 (리다이렉션으로 주소가 완전히 틀어졌을 때 복구)
            if (!matchedId && targetUrl) {
                const queue = getQueue();
                const matchedItem = queue.find(item => 
                    (item.status === 'pending' || item.status === 'processing') && 
                    item.episodeUrl === targetUrl
                );
                if (matchedItem) {
                    matchedId = matchedItem.id;
                    // 최신 Window 참조로 activeWorkers 즉시 복원 갱신
                    activeWorkers.set(matchedId, sourceEvent.source);
                    console.log(`[WorkerController] ♻️ URL 매칭 성공 ➡️ Window 참조 복원 갱신 (ID: ${matchedId})`);
                }
            }

            if (matchedId) {
                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                
                if (item) {
                    console.log(`[WorkerController] 📢 [배치] READY 수신 (ID: ${matchedId}) ➡️ START_EXTRACTION 주입`);
                    
                    sendToWorker(sourceEvent.source, 'START_EXTRACTION', {
                        queueId: item.id,
                        targetType: (item.category === 'Novel' || item.category === 'novel') ? 'novel' : 'comic',
                        seriesTitle: item.title,
                        rootFolder: item.rootFolder || item.title || 'UnknownSeries',
                        episodeTitle: item.episodeTitle,
                        episodeNum: item.episodeNum,
                        folderId: item.folderId || '',
                        destination: item.destination || 'local',
                        novelFormat: item.novelFormat || 'epub',
                        matchedRule: item.matchedRule || {},
                        protocolDomain: item.protocolDomain || window.location.origin,
                        scanSpeedMultiplier: getConfig().scanSpeed / 750,
                        localNameTemplate: getConfig().localNameTemplate || "{number} - {title}",
                        localEpisodePadding: getConfig().localEpisodePadding || "4"
                    });
                }
            } else {
                console.warn('[WorkerController] [배치] WORKER_READY 수신했으나 매칭되는 activeWorkers 항목을 찾지 못했습니다.', targetUrl);
            }
        }

        // 2. CAPTCHA_DETECTED: WAF/보안 방어막 대기 상태
        if (type === 'CAPTCHA_DETECTED') {
            const { queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    if (popupRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.warn(`[WorkerController] ⚠️ [배치] WAF 캡차 차단막 감지 (ID: ${matchedId})`);
                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    EventBus.emit(EVT.LOG, {
                        msg: `⚠️ [캡차 대기] [${item.episodeTitle}] 브라우저 창에서 보안 해제를 수행해 주세요.`,
                        tag: 'Downloader',
                        level: 'warn'
                    });
                }
            }
        }

        // 3. WORKER_PROGRESS: 자식 워커 실시간 진행률 UI 반영
        if (type === 'WORKER_PROGRESS') {
            const { percent, stage, queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    if (popupRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    updateQueueItem(matchedId, { progressPercent: percent, stage: stage });
                    
                    let stageText = '대기 중';
                    if (stage === WORKER_STAGE.DOM_READY) stageText = '페이지 로딩';
                    else if (stage === WORKER_STAGE.SCROLLING) stageText = '스크롤 스캔';
                    else if (stage === WORKER_STAGE.PARSING) stageText = '미디어 파싱';
                    else if (stage === WORKER_STAGE.DOWNLOADING) stageText = '다운로드';
                    else if (stage === WORKER_STAGE.UPLOADING) stageText = '드라이브 저장';
                    else if (stage === WORKER_STAGE.COMPLETED) stageText = '완료';

                    EventBus.emit(EVT.LOG, {
                        msg: `[수집 진행] [${item.episodeTitle}] -> ${stageText} (${Math.round(percent)}%)`,
                        tag: 'Downloader',
                        level: 'info'
                    });
                    EventBus.emit(EVT.UPDATE_PROGRESS);
                }
            }
        }

        // 4. TASK_COMPLETED: 자식 워커 수집 및 드라이브 저장 정상 완료
        if (type === 'TASK_COMPLETED') {
            const { queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    if (popupRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.log(`[WorkerController] 🎉 [배치] 수집 완료 (ID: ${matchedId})`);
                
                const popupRef = activeWorkers.get(matchedId);
                if (popupRef && !popupRef.closed) {
                    // [최종 패치] 대기열에 pending 상태의 작업이 남아 있으면 창을 닫지 않고 릴레이용 보존!
                    const queue = getQueue();
                    const pendingExists = queue.some(i => i.status === 'pending');
                    if (!pendingExists) {
                        popupRef.close();
                        activeWorkers.delete(matchedId);
                    }
                } else {
                    activeWorkers.delete(matchedId);
                }
                
                updateQueueItem(matchedId, { status: 'completed', progressPercent: 100, stage: WORKER_STAGE.COMPLETED });
                EventBus.emit(EVT.UPDATE_PROGRESS);

                // [배치 최종 갱신] 전 대기열 수집 완료 시 원격 드라이브 캐시 최종 갱신 수행
                const currentQueue = getQueue();
                const hasActive = currentQueue.some(i => i.status === 'pending' || i.status === 'processing');
                if (!hasActive) {
                    const completedItem = currentQueue.find(i => i.id === matchedId);
                    if (completedItem && completedItem.destination === 'drive') {
                        console.log(`[WorkerController] ☁️ 전 대기열 수집 완료 -> 드라이브 캐시 갱신 시작: ${completedItem.rootFolder}`);
                        refreshCacheAfterUpload(
                            completedItem.rootFolder,
                            completedItem.category,
                            completedItem.seriesMetadata || {}
                        ).catch(e =>
                            console.warn(`[WorkerController] 캐시 갱신 실패: ${e.message}`)
                        );
                    }
                }

                // 다음 대기 항목 릴레이 스케줄링
                runSchedulerOnce();
            }
        }

        // 5. TASK_FAILED: 예외 및 복구 불능 실패 보고
        if (type === 'TASK_FAILED') {
            const { errorMsg, queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    if (popupRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.error(`[WorkerController] ❌ [배치] 수집 실패 (ID: ${matchedId}): ${errorMsg}`);
                
                const popupRef = activeWorkers.get(matchedId);
                if (popupRef && !popupRef.closed) {
                    // [최종 패치] 대기열에 남은 작업이 없으면 닫고, 있으면 릴레이용으로 킵!
                    const queue = getQueue();
                    const pendingExists = queue.some(i => i.status === 'pending');
                    if (!pendingExists) {
                        popupRef.close();
                        activeWorkers.delete(matchedId);
                    }
                } else {
                    activeWorkers.delete(matchedId);
                }

                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    const nextRetry = (item.retryCount || 0) + 1;
                    updateQueueItem(matchedId, {
                        status: nextRetry >= 3 ? 'failed' : 'pending',
                        retryCount: nextRetry,
                        errorMsg: errorMsg || '자식 워커가 에러를 보고함'
                    });
                    EventBus.emit(EVT.UPDATE_PROGRESS);
                }

                // [배치 최종 갱신] 실패 상황이더라도 전 대기열 수집이 완전히 종료되면 캐시 갱신 수행
                const currentQueue = getQueue();
                const hasActive = currentQueue.some(i => i.status === 'pending' || i.status === 'processing');
                if (!hasActive) {
                    const failedItem = currentQueue.find(i => i.id === matchedId);
                    if (failedItem && failedItem.destination === 'drive') {
                        console.log(`[WorkerController] ☁️ 전 대기열 수집 종료(실패 포함) -> 드라이브 캐시 갱신 시작: ${failedItem.rootFolder}`);
                        refreshCacheAfterUpload(
                            failedItem.rootFolder,
                            failedItem.category,
                            failedItem.seriesMetadata || {}
                        ).catch(e =>
                            console.warn(`[WorkerController] 캐시 갱신 실패: ${e.message}`)
                        );
                    }
                }

                // 다음 대기 항목 릴레이 스케줄링
                runSchedulerOnce();
            }
        }
    });
}
