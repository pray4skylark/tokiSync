/**
 * tokiSync - Unified Worker Controller
 * Manages single popup lifecycle and IPC routing for sequential download mode.
 */

import { fetchNovelTextViaApi } from './novel-decryptor.js';
import { registerIpcListener, sendToWorker, registerWorkerOrigin, removeWorkerOrigin, validateNonce, getWorkerIdByNonce } from './ipc-broker.js';
import { updateQueueItem, WORKER_STAGE, activeWorkers, getQueue, runSchedulerOnce, getQueuePaused, _activeProcessing, processingSlots, sessionRegistry, destroyWorkerSession, getSessionToken, touchSessionActivity, updateSessionPopupRef } from './queue.js';
import { EventBus, EVT } from './EventBus.js';
import { getConfig, SLEEP_MULTIPLIERS } from './config.js';
import { refreshCacheAfterUpload } from './gas.js';
import { EpubBuilder } from './epub.js';
import { CbzBuilder } from './cbz.js';
import { TxtBuilder } from './txt.js';
import { saveFile } from './utils.js';

// Reference for the single worker popup (used in sequential mode)
let activeWorkerRef = null;

// Security: Current session nonce for single worker mode
let activeWorkerNonce = null;
let activeWorkerId = null;

// 🧠 인메모리 수집 콘텐츠 데이터 캐시 (GM Storage 512KB 용량 초과 및 ArrayBuffer 직렬화 실패 원천 차단)
const extractedDataCache = new Map();

// 대기열 전체 삭제 또는 중단 시 인메모리 캐시 강제 비우기
EventBus.on(EVT.QUEUE_RESET, () => extractedDataCache.clear());
EventBus.on(EVT.QUEUE_STOP_ALL, () => extractedDataCache.clear());

// 🛡️ 배치 제어용 중복 리스너 방지 로컬 변수 가드
let batchIpcCleanup = null;
let isBatchControllerInitialized = false;

// 🛡️ 배치 폴링 setInterval ID 추적 (중복 초기화 시 이전 인터벌 정리)
let _batchPollingInterval = null;

/**
 * Close active single worker popup window
 */
export function closeActiveWorker() {
    if (activeWorkerRef && !activeWorkerRef.closed) {
        console.log('[WorkerController] 단일 워커 팝업 세션 수동 폐쇄');
        activeWorkerRef.close();
    }
    if (activeWorkerId) {
        activeWorkers.delete(activeWorkerId);
        processingSlots.delete(activeWorkerId);
        sessionRegistry.delete(activeWorkerId);
        removeWorkerOrigin(activeWorkerId, activeWorkerNonce);
        activeWorkerId = null;
    }
    activeWorkerNonce = null;
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
        const queueId = config.queueId || `${location.pathname.split('/')[2] || '0'}_${location.pathname.split('/')[3] || '0'}`;

        const cleanup = () => {
            if (cleanupIpc) { cleanupIpc(); cleanupIpc = null; }
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (handshakeTimeoutId) { clearTimeout(handshakeTimeoutId); handshakeTimeoutId = null; }
            if (livenessInterval) { clearInterval(livenessInterval); livenessInterval = null; }
        };

        const handleSuccess = async (payload, sourceWindow) => {
            cleanup();

            // Security: Invalidate session nonce after successful completion
            if (activeWorkerId) {
                removeWorkerOrigin(activeWorkerId, activeWorkerNonce);
                activeWorkerId = null;
            }
            activeWorkerNonce = null;

            // 즉각 ACK 응답 전송 (자식이 안전하게 종료하도록 피드백)
            if (sourceWindow && !sourceWindow.closed) {
                try {
                    sendToWorker(sourceWindow, 'IPC_ACK', { queueId });
                } catch (ackErr) {
                    console.warn('[WorkerController] ACK 전송 실패 (무시):', ackErr);
                }
            }

            // WAF Jitter 대기
            const localCfg = getConfig();
            const localMultiplier = SLEEP_MULTIPLIERS[localCfg.sleepMode] || SLEEP_MULTIPLIERS.cautious;
            const jitterDelay = (1500 + Math.random() * 1000) * localMultiplier;
            const delaySec = (jitterDelay / 1000).toFixed(1);
            console.log(`[WorkerController] WAF 지터 대기 (${delaySec}초)...`);
            EventBus.emit(EVT.LOG, {
                msg: `[단일] ⏳ [대기] 다음 화 이동 전 안전 슬립 중... (${delaySec}초)`,
                tag: 'Queue:Single',
                level: 'info'
            });
            await new Promise(r => setTimeout(r, jitterDelay));

            // 데이터와 함께 성공 상태 반환
            resolve({
                success: true,
                content: payload.content || null,
                images: payload.images || null
            });
        };

        // Register consolidated IPC Listener
        cleanupIpc = registerIpcListener(async (msg) => {
            const { type, payload, sourceEvent } = msg;
            const sourceWindow = sourceEvent?.source || activeWorkerRef;

            // 1. Handshake Ready Received ➡️ Inject Action Instructions
            if (type === 'WORKER_READY') {
                if (handshakeTimeoutId) {
                    console.log('[WorkerController] 🎉 단일 워커 핸드셰이킹 성공 (30초 세이프티 해제)');
                    clearTimeout(handshakeTimeoutId);
                    handshakeTimeoutId = null;
                }

                if (activeWorkerRef && !activeWorkerRef.closed) {
                    if (queueId) updateQueueItem(queueId, { lastActivity: Date.now() });
                    const localCfg = getConfig();
                    const localMultiplier = SLEEP_MULTIPLIERS[localCfg.sleepMode] || SLEEP_MULTIPLIERS.cautious;
                    const initialDelay = 3000 * localMultiplier;

                    console.log(`[WorkerController] 📢 READY 수신 ➡️ 안전 대기 기동 (${(initialDelay/1000).toFixed(1)}초)...`);
                    EventBus.emit(EVT.LOG, {
                        msg: `⏳ 새 에피소드 연결 성공 ➡️ 안전 대기 중... (${(initialDelay/1000).toFixed(1)}초)`,
                        tag: 'Queue:Single',
                        level: 'info'
                    });

                    await new Promise(r => setTimeout(r, initialDelay));

                    if (activeWorkerRef && !activeWorkerRef.closed) {
                        console.log(`[WorkerController] 📢 안전 대기 완료 ➡️ 지시 주입 (유형: ${targetType})`);
                        sendToWorker(activeWorkerRef, 'START_EXTRACTION', {
                            queueId: queueId,
                            targetType: targetType,
                            seriesTitle: config.seriesTitle || 'UnknownSeries',
                            rootFolder: config.rootFolder || config.seriesTitle || 'UnknownSeries',
                            episodeTitle: config.episodeTitle || 'UnknownEpisode',
                            episodeNum: config.episodeNum || '0000',
                            folderId: config.folderId || '',
                            destination: config.destination || 'local',
                            novelFormat: config.novelFormat || 'epub',
                            matchedRule: config.matchedRule || {},
                            protocolDomain: config.protocolDomain || window.location.origin,
                            scanSpeedMultiplier: config.scanSpeedMultiplier || 1.0,
                            speedMultiplier: localMultiplier, // 속도 배율 전달
                            localNameTemplate: config.localNameTemplate || "{number:4} - {title}",
                            sessionNonce: activeWorkerNonce // Security: session token for IPC validation
                        }, activeWorkerNonce);
                    }
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
                        resolve({ success: false });
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
                else if (stage === WORKER_STAGE.UPLOADING) stageText = '데이터 전송';
                else if (stage === WORKER_STAGE.COMPLETED) stageText = '완료';

                EventBus.emit(EVT.LOG, {
                    msg: `[${config.episodeTitle || '에피소드'}] -> ${stageText} (${Math.round(percent)}%)`,
                    tag: 'Downloader:Single',
                    level: 'info'
                });
            }

            // 3-1. Child Custom Log reporting ➡️ Forward to logger
            if (type === 'WORKER_LOG') {
                const { msg, level } = payload || {};
                EventBus.emit(EVT.LOG, {
                    msg: msg,
                    tag: 'Worker:Single',
                    level: level || 'info'
                });
            }

            // 4. Task completed successfully via standard postMessage
            if (type === 'TASK_COMPLETED' && payload?.queueId === queueId) {
                console.log('[WorkerController] TASK_COMPLETED 수신완료 (표준 채널)');
                await handleSuccess(payload, sourceWindow);
            }

            // 5. Task completed with GM Storage Fallback (크로스도메인 2중 폴백)
            if (type === 'TASK_COMPLETED_FALLBACK' && payload?.queueId === queueId) {
                console.log('[WorkerController] TASK_COMPLETED_FALLBACK 수신완료 (GM Storage 채널)');
                const key = `tokisync_fallback_${queueId}`;
                const rawPayload = GM_getValue(key);
                if (rawPayload) {
                    GM_deleteValue(key); // 즉각 파기
                    await handleSuccess(rawPayload, sourceWindow);
                } else {
                    console.error('[WorkerController] GM Storage 폴백 데이터를 읽지 못했습니다.');
                    cleanup();
                    resolve({ success: false });
                }
            }

            // 6. Task failed with error
            if (type === 'TASK_FAILED' && payload?.queueId === queueId) {
                cleanup();
                console.error(`[WorkerController] 자식 워커가 에러를 보고함: ${payload.errorMsg}`);
                resolve({ success: false, errorMsg: payload.errorMsg });
            }
        }, `single_attempt_${queueId}`);

        // Liveness Guard
        livenessInterval = setInterval(() => {
            if (activeWorkerRef && activeWorkerRef.closed) {
                console.warn('[WorkerController] ⚠️ 단일 워커 팝업 수동 종료 감지 (즉시 예외 복구)');
                cleanup();
                closeActiveWorker();
                resolve({ success: false });
            }
        }, 1000);

        // 30s Handshake Safety
        handshakeTimeoutId = setTimeout(() => {
            cleanup();
            console.error('[WorkerController] ⚠️ 30초 핸드셰이킹 타임아웃 (리다이렉션 차단 의심)');
            closeActiveWorker();
            resolve({ success: false });
        }, 30000);

        // General Timeout
        timeoutId = setTimeout(() => {
            cleanup();
            console.error(`[WorkerController] 수집 타임아웃 (${timeoutDuration / 1000}초)`);
            closeActiveWorker();
            resolve({ success: false });
        }, timeoutDuration);

        // Start clean single worker Popup window
        try {
            closeActiveWorker();
            console.log('[WorkerController] 신규 단일 워커 팝업 기동:', episodeUrl);
            activeWorkerRef = window.open(
                episodeUrl,
                'tokisync-novel-worker',
                'width=400,height=600,left=0,top=0,noopener=false,scrollbars=yes,resizable=yes'
            );
            if (!activeWorkerRef) {
                throw new Error('브라우저 팝업 차단이 감지되었습니다.');
            }
            // Security: Register worker origin and generate session nonce
            activeWorkerId = queueId;
            activeWorkers.set(activeWorkerId, activeWorkerRef);
            activeWorkerNonce = registerWorkerOrigin(activeWorkerId, 'null'); // about:blank popups have origin="null"
            console.log(`[WorkerController] 보안 세션 논스 생성 완료 (ID: ${activeWorkerId})`);
        } catch (err) {
            cleanup();
            console.error('[WorkerController] 워커 팝업 기동 실패:', err);
            closeActiveWorker();
            alert(`[TokiSync 팝업 차단 알림]\n\n브라우저 주소창 우측에서 [팝업 및 리다이렉트 항상 허용]으로 설정해 주셔야 합니다.\n(오류: ${err.message})`);
            resolve({ success: false });
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
            const result = await fetchMediaViaWorkerSingleAttempt(episodeUrl, targetType, config);
            if (result.success) {
                console.log(`[WorkerController] 🎉 수집 성공 (${attempt}/${MAX_RETRIES})`);
                return result; // 리턴된 데이터 세트 반환 ({ success: true, content, images })
            }
            console.warn(`[WorkerController] ⚠️ 수집 실패 (${attempt}/${MAX_RETRIES}) — 작업 불완성`);
        } catch (err) {
            console.error(`[WorkerController] ❌ 수집 예외 (${attempt}/${MAX_RETRIES}):`, err);
        }
    }

    console.error(`[WorkerController] 🛑 총 ${MAX_RETRIES}회 전부 실패 — URL: ${episodeUrl}`);
    return { success: false };
}

// =============================================================
// 공개 진입점 (Gateway) — downloader.js 전용
// =============================================================

/**
 * 소설 본문 수집 (Plan B: 자립형 팝업 ➡️ Plan C: API 복호화 폴백)
 */
export async function fetchNovelText(episodeUrl, config = {}) {
    console.log('[WorkerController] 소설 수집 개시 (Plan B — 자립형 팝업)');
    const result = await fetchMediaViaWorker(episodeUrl, 'novel', config);

    if (result.success && result.content) {
        return result.content; // 추출된 본문 텍스트 반환
    }

    // Plan C Fallback: Local API Decryption (if decryptApi configuration exists)
    if (config.decryptApi || config.endpoint) {
        console.warn('[WorkerController] Plan B 실패 ➡️ Plan C(API 복호화) 로컬 폴백 시도');
        const content = await fetchNovelTextViaApi(episodeUrl, config.decryptApi || config);
        if (content) {
            return content;
        }
    }

    return null;
}

/**
 * 만화/웹툰 이미지 수집 (Plan B: 자립형 팝업)
 */
export async function fetchComicImages(episodeUrl, config = {}) {
    console.log('[WorkerController] 만화 이미지 수집 개시 (Plan B — 자립형 팝업)');
    const result = await fetchMediaViaWorker(episodeUrl, 'comic', config);
    if (result.success && result.images) {
        return result.images; // 추출된 이미지 어레이 반환 [{ url, data: ArrayBuffer, ext, isMissing }, ...]
    }
    return null;
}

/**
 * 🚦 배치/드라이브 전용 자율 분산형 멀티 워커 제어 엔진 (v1.21.0)
 * 여러 개의 자식 팝업 창으로부터 오는 IPC 이벤트를 독립적으로 라우팅하여 멀티태스킹 수행
 */
export function initBatchWorkerController() {
    if (window.tokisync_batch_controller_initialized || isBatchControllerInitialized) {
        console.log('[WorkerController] 🚦 [배치 모드] 이미 초기화되어 중복 기동을 차단합니다.');
        return;
    }
    window.tokisync_batch_controller_initialized = true;
    isBatchControllerInitialized = true;

    console.log('[WorkerController] 🚦 [배치 모드] 백그라운드 영속성 IPC 라우터 활성화 완료');

    // 정기적인 자식 팝업 닫힘 실시간 감시 (Batch Liveness Guard) 및 60초 타임아웃 검사
    if (_batchPollingInterval) clearInterval(_batchPollingInterval);
    const batchClosedCounts = new Map();
    _batchPollingInterval = setInterval(() => {
        // [H8] 일시 정지(Pause) 상태인 동안에는 타임아웃 감시 및 회수를 잠시 유예합니다.
        if (getQueuePaused()) {
            return;
        }

        const queue = getQueue();
        const now = Date.now();

        // 1. 60초(업로드 중인 경우 5분) 이상 무반응인 워커 강제 타임아웃 회수
        queue.forEach(item => {
            // [v1.27.3] sessionRegistry.lastActivity를 우선 참조 (touchSessionActivity로 갱신되는 최신값)
            const sessionEntry = sessionRegistry.get(item.id);
            const sessionLastActive = sessionEntry?.lastActivity;
            const lastActive = sessionLastActive || item.lastActivity || item.startedAt;
            if (item.status === 'processing' && lastActive) {
                const isUploading = (item.stage === WORKER_STAGE.UPLOADING);
                const limit = isUploading ? 300000 : 60000;
                
                if (now - lastActive > limit) {
                    const limitSec = limit / 1000;
                    console.warn(`[WorkerController] ⚠️ [배치] ${limitSec}초 타임아웃 감지: ${item.id} (${item.episodeTitle}), Stage: ${item.stage}`);
                    const popupRef = activeWorkers.get(item.id);
                    try {
                        const actualRef = popupRef && (popupRef.ref || popupRef);
                        if (actualRef && !actualRef.closed) {
                            actualRef.close();
                        }
                    } catch (e) {}
                    console.log(`[WorkerController]  activeWorkers 삭제 (타임아웃): ${item.id} → size=${activeWorkers.size-1}`);
                    
                    // [v1.27.2] 상태 업데이트 먼저 → 세션 정리 → 스케줄러 순서로 레이스 컨디션 차단
                    const nextRetry = (item.retryCount || 0) + 1;
                    updateQueueItem(item.id, {
                        status: nextRetry >= 3 ? 'failed' : 'pending',
                        retryCount: nextRetry,
                        errorMsg: `에피소드 ${isUploading ? '업로드' : '수집'} 처리 시간이 ${limitSec}초를 초과하여 타임아웃되었습니다.`
                    });
                    
                    const timedOutToken = getSessionToken(item.id);
                    if (timedOutToken) {
                        removeWorkerOrigin(item.id, timedOutToken);
                    }
                    destroyWorkerSession(item.id, 'timeout');
                    
                    // [v1.27.2] 안전 대기 플래그 정리 — 타임아웃 시점
                    delete window[`tokisync_waiting_${item.id}`];

                    EventBus.emit(EVT.LOG, {
                        msg: `❌ [배치 타임아웃] [${item.episodeTitle}] ${isUploading ? '업로드' : '수집'} 시간 초과(${limitSec}초). 복구를 단행합니다.`,
                        tag: 'Queue',
                        level: 'error'
                    });
                    runSchedulerOnce();
                }
            }
        });

        // 2. 수동 종료 감시
        for (const [id, popupRef] of activeWorkers.entries()) {
            const actualRef = popupRef && (popupRef.ref || popupRef);
            if (actualRef && actualRef.closed) {
                const closedCount = (batchClosedCounts.get(id) || 0) + 1;
                batchClosedCounts.set(id, closedCount);

                if (closedCount >= 5) {
                    console.warn(`[WorkerController] ⚠️ [배치] 자식 팝업 수동 종료 확정: ${id} → activeWorkers.size=${activeWorkers.size}`);
                    batchClosedCounts.delete(id);
                    
                    const item = queue.find(i => i.id === id);
                    if (item && item.status === 'processing') {
                        if (item.stage === WORKER_STAGE.UPLOADING || item.stage === WORKER_STAGE.COMPLETED) {
                            console.log(`[WorkerController] 🛡️ 업로드/완료 단계 팝업 닫힘 무시: ${id}`);
                            return;
                        }

                        // [v1.27.2] 상태 업데이트 먼저 → 세션 정리 → 스케줄러 순서
                        const nextRetry = (item.retryCount || 0) + 1;
                        updateQueueItem(id, {
                            status: nextRetry >= 3 ? 'failed' : 'pending',
                            retryCount: nextRetry,
                            errorMsg: '자식 팝업 창이 비정상적으로 강제 종료되었습니다.'
                        });
                        
                        const manualToken = getSessionToken(id);
                        if (manualToken) {
                            removeWorkerOrigin(id, manualToken);
                        }
                        destroyWorkerSession(id, 'manual_close');
                        
                        // [v1.27.2] 안전 대기 플래그 정리
                        delete window[`tokisync_waiting_${id}`];
                        
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

    const handleBatchSuccess = async (matchedId, payload, sourceWindow) => {
        console.log(`[WorkerController] 🎉 [배치] 수집 완료 처리 (ID: ${matchedId})`);

        // 1. 큐에서 상세 정보 획득
        const queue = getQueue();
        const item = queue.find(i => i.id === matchedId);

        if (!item) {
            console.error(`[WorkerController] 대기열에서 매칭되는 아이템을 찾을 수 없습니다: ${matchedId}`);
            return;
        }

        const ackPayload = { queueId: matchedId };

        // 자식에게 즉시 수신 ACK 신호 전송 및 즉시 팝업 닫기 회수
        if (sourceWindow) {
            try {
                if (!sourceWindow.closed) {
                    sendToWorker(sourceWindow, 'IPC_ACK', ackPayload);
                    sourceWindow.close(); // 즉시 close 강제
                }
            } catch (ackErr) {
                console.warn('[WorkerController] [배치] 자식 팝업 close 또는 ACK 전송 실패:', ackErr);
            }
        }
        _activeProcessing.add(matchedId);
        const batchToken = getSessionToken(matchedId);
        if (batchToken) {
            removeWorkerOrigin(matchedId, batchToken);
        }
        destroyWorkerSession(matchedId, 'collection_complete');
        console.log(`[WorkerController] 🧹 세션 정리 (수집완료): ${matchedId} → processingSlots=${processingSlots.size}`);
        
        // [v1.27.2] 안전 대기 플래그 정리 — 완료 시점
        delete window[`tokisync_waiting_${matchedId}`];

        // [P0] 수집된 무거운 바이너리/본문 데이터는 영속 스토리지 대신 인메모리 캐시에 보관
        extractedDataCache.set(matchedId, {
            content: payload.content || null,
            images: payload.images || null
        });

        // 큐 스토리지에는 단순 상태 메타데이터만 기재하여 스토리지 락과 초과 크기 에러 방지
        updateQueueItem(matchedId, {
            stage: WORKER_STAGE.UPLOADING,
            progressPercent: 95
        });
        EventBus.emit(EVT.UPDATE_PROGRESS);

        EventBus.emit(EVT.LOG, {
            msg: `📦 [${item.episodeTitle}] 업로드 파일(CBZ/EPUB) 압축 조립 준비 중...`,
            tag: 'Downloader:Batch',
            level: 'info'
        });

        try {
            const { category, destination, novelFormat, episodeTitle, episodeNum, rootFolder, title, matchedRule, localNameTemplate } = item;
            const isNovel = (category === 'Novel' || category === 'novel');
            const siteName = matchedRule?.name || "TokiSync Parser";

            let blob;
            const extension = isNovel ? novelFormat : 'cbz';

            // 2. 미디어 타입별 조립(Build) 진행 (인메모리 캐시에서 우선 획득)
            const cachedMedia = extractedDataCache.get(matchedId) || {};
            const finalContent = cachedMedia.content || payload.content;
            const finalImages = cachedMedia.images || payload.images;

            if (isNovel) {
                if (!finalContent) {
                    throw new Error("수집된 소설 본문 데이터가 없습니다.");
                }
                const builder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder();
                builder.addChapter(episodeTitle, finalContent.trim());

                EventBus.emit(EVT.LOG, {
                    msg: `🔨 [${episodeTitle}] ${novelFormat.toUpperCase()} 압축 조립 중... (${(finalContent.length / 1024).toFixed(0)}KB)`,
                    level: 'info',
                    tag: 'Builder'
                });

                const innerZip = await builder.build({
                    series: title || rootFolder,
                    title: episodeTitle,
                    number: episodeNum,
                    writer: siteName
                });
                blob = await innerZip.generateAsync({ type: "blob" });
            } else {
                if (!finalImages || !Array.isArray(finalImages)) {
                    throw new Error("수집된 만화 이미지 데이터가 없습니다.");
                }
                const builder = new CbzBuilder();
                const resolvedImages = finalImages.map(img => {
                    const mimeType = img.ext?.includes('png') ? 'image/png' : (img.ext?.includes('webp') ? 'image/webp' : 'image/jpeg');
                    return {
                        url: img.url,
                        blob: img.data ? new Blob([img.data], { type: mimeType }) : new Blob([]),
                        ext: img.ext || '.jpg',
                        isMissing: !!img.isMissing
                    };
                });
                builder.addChapter(episodeTitle, resolvedImages);

                EventBus.emit(EVT.LOG, {
                    msg: `🔨 [${episodeTitle}] CBZ 압축 중... (이미지 ${resolvedImages.length}개)`,
                    level: 'info',
                    tag: 'Builder'
                });

                const innerZip = await builder.build({
                    series: title || rootFolder,
                    title: episodeTitle,
                    number: episodeNum,
                    writer: siteName
                });
                blob = await innerZip.generateAsync({ type: "blob" });
            }

            // 3. 파일 이름 및 폴더명 결정 (destination 기반 분기)
            let fullFilename = "";
            let targetFolderName = rootFolder;

            if (destination === 'drive_kavita') {
                const cleanSeries = rootFolder.replace(/^\[[^\]]+\]\s*/, '');
                targetFolderName = cleanSeries;

                // Kavita 표준 스캐너 100% 매칭 규격: {cleanSeries} - c{paddedNum} (3자리 패딩)
                const paddedNum = (episodeNum || '').toString().padStart(3, '0');
                fullFilename = `${cleanSeries} - c${paddedNum}`;
            } else if (destination === 'drive') {
                // drive (레거시): 기존 명명법 강제 적용
                const legacyPaddedNum = (episodeNum || '').toString().padStart(4, '0');
                fullFilename = `${rootFolder} ${legacyPaddedNum}화`;
            } else {
                // local / native: 사용자 설정 localNameTemplate 동적 파싱 적용
                const template = getConfig().localNameTemplate || "{number:4} - {title}";
                const cleanSeries = rootFolder.replace(/^\[[^\]]+\]\s*/, '');
                fullFilename = template
                    .replace(/\{number:(\d)\}/g, (_, p) => (episodeNum || '').toString().padStart(parseInt(p, 10), '0'))
                    .replace(/\{number\}/g, (episodeNum || '').toString().padStart(4, '0'))
                    .replace(/\{rawNumber\}/g, (episodeNum || '').toString())
                    .replace(/\{series\}/g, cleanSeries)
                    .replace(/\{title\}/g, episodeTitle || '');
            }

            console.log(`[WorkerController] [배치 저장] 파일 조립 완료 (정책: ${destination}). 전송 시작: ${fullFilename}.${extension}`);
            
            const isLocal = (destination === 'local' || destination === 'native');
            EventBus.emit(EVT.LOG, {
                msg: isLocal
                    ? `💾 [${episodeTitle}] 로컬 파일 저장 개시... (${(blob.size / 1024 / 1024).toFixed(1)} MB)`
                    : `🚀 [${episodeTitle}] 구글 드라이브 업로드 전송 시작... (${(blob.size / 1024 / 1024).toFixed(1)} MB)`,
                tag: 'Downloader:Batch',
                level: 'info'
            });

            // saveFile은 'local'/'native'/'drive' 3개 타입만 처리하므로 drive_kavita는 'drive'로 변환 전달
            const saveType = (destination === 'drive_kavita') ? 'drive' : destination;

            // [H8] 업로드 중 lastActivity keepalive — 30초마다 갱신하여 300초 타임아웃 오발사 방지
            const keepalive = setInterval(() => {
                updateQueueItem(matchedId, { lastActivity: Date.now() });
            }, 30000);
            try {
                await saveFile(blob, fullFilename, saveType, extension, {
                    folderId: item.folderId,
                    folderName: targetFolderName,
                    category: category,
                    destination: destination,
                    forceOverwrite: item.forceOverwrite || false
                });
            } finally {
                clearInterval(keepalive);
            }

            // 4. 업로드 완료 후 최종 성공 전이 및 캐시 삭제
            updateQueueItem(matchedId, {
                status: 'completed',
                progressPercent: 100,
                stage: WORKER_STAGE.COMPLETED
            });
            extractedDataCache.delete(matchedId); // 인메모리 캐시 클린업
            _activeProcessing.delete(matchedId);
            console.log(`[WorkerController] 🎉 [배치] 업로드 및 완료 처리 성공 (ID: ${matchedId})`);

        } catch (uploadErr) {
            _activeProcessing.delete(matchedId);
            console.error(`[WorkerController] ❌ [배치] 업로드 처리 중 예외 발생:`, uploadErr);
            
            // [v1.21.8] 사용자의 정지 클릭으로 이미 failed로 빠졌는지 확인
            const freshQueue = getQueue();
            const freshItem = freshQueue.find(i => i.id === matchedId);
            const isStopped = freshItem && freshItem.status === 'failed' && freshItem.errorMsg?.includes('중단');

            const nextRetry = (item.retryCount || 0) + 1;
            const finalStatus = (isStopped || nextRetry >= 3) ? 'failed' : 'pending';
            updateQueueItem(matchedId, {
                status: finalStatus,
                retryCount: nextRetry,
                errorMsg: isStopped ? '사용자에 의해 수집이 강제로 중단되었습니다.' : (uploadErr.message || '파일 빌드 및 업로드 실패')
            });
            extractedDataCache.delete(matchedId); // 실패 또는 재시도 전이 시 캐시 클린업


            EventBus.emit(EVT.LOG, {
                msg: `❌ [배치 업로드 실패] [${item.episodeTitle}] ${uploadErr.message || '오류 발생'} (시도: ${nextRetry}/3)`,
                tag: 'Queue',
                level: 'error'
            });
        }

        const popupRef = activeWorkers.get(matchedId);
        if (popupRef) {
            setTimeout(() => {
                try {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef && !actualRef.closed) {
                        console.log(`[WorkerController] 🛡️ [자가 종료 가드] 3초 초과 자식 팝업 강제 폐쇄: ${matchedId}`);
                        actualRef.close();
                    }
                } catch (e) {}
            }, 3000);
        }

        EventBus.emit(EVT.UPDATE_PROGRESS);

        // 드라이브 캐시 최종 갱신
        const currentQueue = getQueue();
        const hasActive = currentQueue.some(i => i.status === 'pending' || i.status === 'processing');
        if (!hasActive) {
            const completedItem = currentQueue.find(i => i.id === matchedId);
            if (completedItem && (completedItem.destination === 'drive' || completedItem.destination === 'drive_kavita')) {
                const cleanFolder = completedItem.rootFolder.replace(/^\[[^\]]+\]\s*/, '');
                const targetFolder = completedItem.destination === 'drive_kavita' ? cleanFolder : completedItem.rootFolder;
                console.log(`[WorkerController] ☁️ 전 대기열 수집 완료 -> 드라이브 캐시 갱신 시작: ${targetFolder}`);
                refreshCacheAfterUpload(
                    targetFolder,
                    completedItem.category,
                    completedItem.seriesMetadata || {}
                ).catch(e =>
                    console.warn(`[WorkerController] 캐시 갱신 실패: ${e.message}`)
                );
            }
        }

        // 다음 릴레이 스케줄 기동
        runSchedulerOnce();
    };

    if (batchIpcCleanup) {
        try {
            batchIpcCleanup();
        } catch (e) {
            console.warn('[WorkerController] 기존 배치 IPC 리스너 해제 실패:', e);
        }
        batchIpcCleanup = null;
    }

    batchIpcCleanup = registerIpcListener(async (msg) => {
        const { type, payload, sourceEvent } = msg;
        if (!sourceEvent || !sourceEvent.source) return;

        // 1. WORKER_READY: 자식 워커 핸드셰이킹 수신
        if (type === 'WORKER_READY') {
            const { targetUrl, sessionToken: childToken } = payload || {};
            let matchedId = null;

            // [v1.27.0] 1순위: 세션 토큰 매칭 (크로스 오리진 네비게이션 안전)
            if (childToken) {
                const tokenWorkerId = getWorkerIdByNonce(childToken);
                if (tokenWorkerId) {
                    const session = sessionRegistry.get(tokenWorkerId);
                    if (session) {
                        matchedId = tokenWorkerId;
                        console.log(`[WorkerController] 🔑 [배치] 세션 토큰 매칭 성공: ${matchedId}`);
                    }
                }
            }

            // 2순위: Window 참조 매칭 (기존 방식, 대부분 정상 동작)
            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) {
                        matchedId = id;
                        break;
                    }
                }
            }

            // 3순위: URL 매칭 (fallback, 세션 토큰 사전 등록 필요)
            if (!matchedId && targetUrl) {
                const queue = getQueue();
                const matchedItem = queue.find(item => 
                    (item.status === 'pending' || item.status === 'processing') && 
                    item.episodeUrl === targetUrl
                );
                if (matchedItem) {
                    // 세션 토큰이 없으면 생성 (pre-open 또는 스케줄러에서 미등록된 경우)
                    let token = getSessionToken(matchedItem.id);
                    if (!token) {
                        token = registerWorkerOrigin(matchedItem.id, 'null');
                        sessionRegistry.set(matchedItem.id, {
                            sessionToken: token,
                            popupRef: sourceEvent.source,
                            createdAt: Date.now(),
                            lastActivity: Date.now(),
                            queueItemRef: matchedItem
                        });
                        console.log(`[WorkerController] 🔐 [배치] URL 매칭으로 세션 토큰 신규 생성: ${matchedItem.id}`);
                    }
                    matchedId = matchedItem.id;
                    activeWorkers.set(matchedId, sourceEvent.source);
                    updateSessionPopupRef(matchedId, sourceEvent.source);
                    console.log(`[WorkerController] 🔄 [배치] activeWorkers 갱신 (URL 매칭): ${matchedId}`);
                }
            }

            if (matchedId) {
                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                
                if (item) {
                    // 🛡️ 안전 대기 중 동일 에피소드의 READY 중복 처리 방어 가드
                    if (window[`tokisync_waiting_${matchedId}`]) {
                        touchSessionActivity(matchedId);
                        console.log(`[WorkerController] [배치] ID: ${matchedId} 는 이미 안전 대기 중입니다. 중복 READY 유입 차단.`);
                        return;
                    }
                    window[`tokisync_waiting_${matchedId}`] = true;
                    updateQueueItem(matchedId, { status: 'processing', lastActivity: Date.now() });
                    touchSessionActivity(matchedId);

                    const config = getConfig();
                    const multiplier = SLEEP_MULTIPLIERS[config.sleepMode] || SLEEP_MULTIPLIERS.cautious;
                    const initialDelay = 3000 * multiplier;
                    
                    console.log(`[WorkerController] 📢 [배치] READY 수신 (ID: ${matchedId}) ➡️ 안전 대기 기동 (${(initialDelay/1000).toFixed(1)}초)...`);
                    EventBus.emit(EVT.LOG, {
                        msg: `⏳ 새 에피소드 연결 성공 ➡️ 안전 대기 중... (${(initialDelay/1000).toFixed(1)}초)`,
                        tag: 'Queue:Batch',
                        level: 'info'
                    });
                    
                    await new Promise(r => setTimeout(r, initialDelay));
                    
                    // [v1.27.1] 대기 완료 후 중단 여부 재체크
                    const freshQueue = getQueue();
                    const freshItem = freshQueue.find(i => i.id === matchedId);
                    if (!freshItem || freshItem.status !== 'processing' || getQueuePaused()) {
                        console.log(`[WorkerController] ⏹️ 첫 통신 대기 후 중단/일시정지 감지 -> 주입 취소 (ID: ${matchedId}, status=${freshItem?.status}, paused=${getQueuePaused()})`);
                        delete window[`tokisync_waiting_${matchedId}`];
                        return;
                    }

                    console.log(`[WorkerController] [배치] 안전 대기 완료 START_EXTRACTION 주입 (ID: ${matchedId})`);
                    
                    const sessionToken = getSessionToken(matchedId);
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
                        scanSpeedMultiplier: config.scanSpeed / 750,
                        speedMultiplier: multiplier,
                        localNameTemplate: config.localNameTemplate || "{number:4} - {title}",
                        sessionNonce: sessionToken
                    });
                    // [v1.27.3] sendToWorker에 nonce 미포함: 자식의 _activeNonces는 항상 비어있어
                    // 메시지가 Blocked 되기 때문. sessionNonce는 payload로만 전달되어
                    // 자식이 TASK_COMPLETED/TASK_FAILED의 child->parent nonce로 재사용.
                    
                    // [v1.27.2] 플래그는 START_EXTRACTION 후에도 유지 — 워커 완료/실패 시점에 정리
                }
            } else {
                console.warn('[WorkerController] [배치] WORKER_READY 수신했으나 매칭되는 활성 세션을 찾지 못했습니다.', targetUrl);
                console.warn(`[WorkerController] [배치] 디버그: activeWorkers=${activeWorkers.size}, processingSlots=${processingSlots.size}, sessionRegistry=${sessionRegistry.size}`);
            }
        }

        // 2. CAPTCHA_DETECTED: WAF/보안 방어막 대기 상태
        if (type === 'CAPTCHA_DETECTED') {
            const { queueId, sessionToken: captchaToken } = payload || {};
            let matchedId = queueId;

            if (captchaToken && !matchedId) {
                const tokenWorkerId = getWorkerIdByNonce(captchaToken);
                if (tokenWorkerId && sessionRegistry.has(tokenWorkerId)) {
                    matchedId = tokenWorkerId;
                }
            }

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.warn(`[WorkerController] ⚠️ [배치] WAF 캡차 차단막 감지 (ID: ${matchedId})`);
                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    EventBus.emit(EVT.LOG, {
                        msg: `[배치] ⚠️ [캡차 대기] [${item.episodeTitle}] 브라우저 창에서 보안 해제를 수행해 주세요.`,
                        tag: 'Downloader:Batch',
                        level: 'warn'
                    });
                }
            }
        }

        // 2-1. WORKER_LOG: 자식 워커 커스텀 실시간 로그 출력
        if (type === 'WORKER_LOG') {
            const { msg, level, queueId, sessionToken: logToken } = payload || {};
            EventBus.emit(EVT.LOG, {
                msg: msg,
                tag: 'Worker:Batch',
                level: level || 'info'
            });

            let matchedId = queueId;
            if (logToken && !matchedId) {
                const tokenWorkerId = getWorkerIdByNonce(logToken);
                if (tokenWorkerId && sessionRegistry.has(tokenWorkerId)) {
                    matchedId = tokenWorkerId;
                }
            }
            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }
            if (matchedId) {
                touchSessionActivity(matchedId);
                updateQueueItem(matchedId, { lastActivity: Date.now() });
            }
        }

        // 3. WORKER_PROGRESS: 자식 워커 실시간 진행률 UI 반영
        if (type === 'WORKER_PROGRESS') {
            const { percent, stage, queueId, sessionToken: progToken } = payload || {};
            let matchedId = queueId;

            // 세션 토큰으로 매칭 검증
            if (progToken && !matchedId) {
                const tokenWorkerId = getWorkerIdByNonce(progToken);
                if (tokenWorkerId && sessionRegistry.has(tokenWorkerId)) {
                    matchedId = tokenWorkerId;
                }
            }

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                touchSessionActivity(matchedId);
                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    updateQueueItem(matchedId, { progressPercent: percent, stage: stage, lastActivity: Date.now() });
                    
                    let stageText = '대기 중';
                    if (stage === WORKER_STAGE.DOM_READY) stageText = '페이지 로딩';
                    else if (stage === WORKER_STAGE.SCROLLING) stageText = '스크롤 스캔';
                    else if (stage === WORKER_STAGE.PARSING) stageText = '미디어 파싱';
                    else if (stage === WORKER_STAGE.DOWNLOADING) stageText = '다운로드';
                    else if (stage === WORKER_STAGE.UPLOADING) stageText = '데이터 전송';
                    else if (stage === WORKER_STAGE.COMPLETED) stageText = '완료';

                    EventBus.emit(EVT.LOG, {
                        msg: `[${item.episodeTitle}] -> ${stageText} (${Math.round(percent)}%)`,
                        tag: 'Downloader:Batch',
                        level: 'info'
                    });
                    EventBus.emit(EVT.UPDATE_PROGRESS);
                }
            }
        }

        // 4. TASK_COMPLETED: 표준 postMessage 방식 수집 완료
        if (type === 'TASK_COMPLETED') {
            const { queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                await handleBatchSuccess(matchedId, payload, sourceEvent.source);
            }
        }

        // 5. TASK_COMPLETED_FALLBACK: GM Storage 폴백 완료
        if (type === 'TASK_COMPLETED_FALLBACK') {
            const { queueId, sessionToken: fallbackToken } = payload || {};
            let matchedId = queueId;

            if (fallbackToken && !matchedId) {
                const tokenWorkerId = getWorkerIdByNonce(fallbackToken);
                if (tokenWorkerId && sessionRegistry.has(tokenWorkerId)) {
                    matchedId = tokenWorkerId;
                }
            }

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.log(`[WorkerController] [배치] TASK_COMPLETED_FALLBACK 수신완료 (ID: ${matchedId})`);
                const key = `tokisync_fallback_${matchedId}`;
                const rawPayload = GM_getValue(key);
                if (rawPayload) {
                    GM_deleteValue(key); // 삭제
                    await handleBatchSuccess(matchedId, rawPayload, sourceEvent.source);
                } else {
                    console.error('[WorkerController] [배치] 폴백 데이터 획득 실패');
                }
            }
        }

        // 6. TASK_FAILED: 예외 및 복구 불능 실패 보고
        if (type === 'TASK_FAILED') {
            const { errorMsg, queueId, sessionToken: failedToken } = payload || {};
            let matchedId = queueId;

            if (failedToken && !matchedId) {
                const tokenWorkerId = getWorkerIdByNonce(failedToken);
                if (tokenWorkerId && sessionRegistry.has(tokenWorkerId)) {
                    matchedId = tokenWorkerId;
                }
            }

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.error(`[WorkerController] ❌ [배치] 수집 실패 (ID: ${matchedId}): ${errorMsg}`);
                
                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                
                // [v1.27.2] 상태 업데이트 먼저 → 세션 정리 → 스케줄러 순서
                if (item) {
                    const isStopped = item.status === 'failed' && item.errorMsg?.includes('중단');
                    const nextRetry = (item.retryCount || 0) + 1;
                    updateQueueItem(matchedId, {
                        status: (isStopped || nextRetry >= 3) ? 'failed' : 'pending',
                        retryCount: nextRetry,
                        errorMsg: isStopped ? '사용자에 의해 수집이 강제로 중단되었습니다.' : (errorMsg || '자식 워커가 에러를 보고함')
                    });
                    EventBus.emit(EVT.UPDATE_PROGRESS);
                }
                
                const sessionToken = getSessionToken(matchedId);
                if (sessionToken) {
                    removeWorkerOrigin(matchedId, sessionToken);
                }
                destroyWorkerSession(matchedId, 'task_failed');
                console.log(`[WorkerController] 🧹 세션 정리 (수집패): ${matchedId} → processingSlots=${processingSlots.size}`);
                
                // [v1.27.2] 안전 대기 플래그 정리
                delete window[`tokisync_waiting_${matchedId}`];

                // 배치 최종 실패 마감 시 처리
                const currentQueue = getQueue();
                const hasActive = currentQueue.some(i => i.status === 'pending' || i.status === 'processing');
                if (!hasActive) {
                    const failedItem = currentQueue.find(i => i.id === matchedId);
                    if (failedItem && (failedItem.destination === 'drive' || failedItem.destination === 'drive_kavita')) {
                        const cleanFolder = failedItem.rootFolder.replace(/^\[[^\]]+\]\s*/, '');
                        const targetFolder = failedItem.destination === 'drive_kavita' ? cleanFolder : failedItem.rootFolder;
                        console.log(`[WorkerController] ☁️ 전 대기열 수집 종료(실패 포함) -> 드라이브 캐시 갱신 시작: ${targetFolder}`);
                        refreshCacheAfterUpload(
                            targetFolder,
                            failedItem.category,
                            failedItem.seriesMetadata || {}
                        ).catch(e =>
                            console.warn(`[WorkerController] 캐시 갱신 실패: ${e.message}`)
                        );
                    }
                }

                runSchedulerOnce();
            }
        }
    }, 'batch_controller');
}
