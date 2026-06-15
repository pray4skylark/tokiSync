/**
 * tokiSync - Unified Worker Controller
 * Manages single popup lifecycle and IPC routing for sequential download mode.
 */

import { fetchNovelTextViaApi } from './novel-decryptor.js';
import { registerIpcListener, sendToWorker } from './ipc-broker.js';
import { updateQueueItem, WORKER_STAGE, activeWorkers, getQueue, runSchedulerOnce, getQueuePaused } from './queue.js';
import { EventBus, EVT } from './EventBus.js';
import { getConfig, SLEEP_MULTIPLIERS } from './config.js';
import { refreshCacheAfterUpload } from './gas.js';
import { EpubBuilder } from './epub.js';
import { CbzBuilder } from './cbz.js';
import { TxtBuilder } from './txt.js';
import { saveFile } from './utils.js';

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
        const queueId = config.queueId || `${location.pathname.split('/')[2] || '0'}_${location.pathname.split('/')[3] || '0'}`;

        const cleanup = () => {
            if (cleanupIpc) { cleanupIpc(); cleanupIpc = null; }
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (handshakeTimeoutId) { clearTimeout(handshakeTimeoutId); handshakeTimeoutId = null; }
            if (livenessInterval) { clearInterval(livenessInterval); livenessInterval = null; }
        };

        const handleSuccess = async (payload, sourceWindow) => {
            cleanup();

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
                msg: `⏳ [대기] 다음 화 이동 전 안전 슬립 중... (${delaySec}초)`,
                tag: 'Queue',
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
                    const localCfg = getConfig();
                    const localMultiplier = SLEEP_MULTIPLIERS[localCfg.sleepMode] || SLEEP_MULTIPLIERS.cautious;
                    const initialDelay = 3000 * localMultiplier;

                    console.log(`[WorkerController] 📢 READY 수신 ➡️ 안전 대기 기동 (${(initialDelay/1000).toFixed(1)}초)...`);
                    EventBus.emit(EVT.LOG, {
                        msg: `⏳ [대기] 새 에피소드 연결 성공 ➡️ 안전 대기 중... (${(initialDelay/1000).toFixed(1)}초)`,
                        tag: 'Queue',
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
                            localNameTemplate: config.localNameTemplate || "{number:4} - {title}"
                        });
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
                    msg: `[수집 진행] [${config.episodeTitle || '에피소드'}] -> ${stageText} (${Math.round(percent)}%)`,
                    tag: 'Downloader',
                    level: 'info'
                });
            }

            // 3-1. Child Custom Log reporting ➡️ Forward to logger
            if (type === 'WORKER_LOG') {
                const { msg, level } = payload || {};
                EventBus.emit(EVT.LOG, {
                    msg: `📢 [워커로그] ${msg}`,
                    tag: 'Worker',
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
        });

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

    const handleBatchSuccess = async (matchedId, payload, sourceWindow) => {
        console.log(`[WorkerController] 🎉 [배치] 수집 완료 처리 (ID: ${matchedId})`);

        // 1. 큐에서 상세 정보 획득 및 다음 대기 중인 에피소드 사전 조회 (간접 릴레이용)
        const queue = getQueue();
        const item = queue.find(i => i.id === matchedId);

        if (!item) {
            console.error(`[WorkerController] 대기열에서 매칭되는 아이템을 찾을 수 없습니다: ${matchedId}`);
            return;
        }

        const nextItem = queue.find(i => i.status === 'pending');
        const ackPayload = { queueId: matchedId };

        if (nextItem) {
            ackPayload.nextUrl = nextItem.episodeUrl;
            
            // 중복 스케줄 기동 방지를 위해 즉시 processing 상태로 선점 마킹
            updateQueueItem(nextItem.id, { status: 'processing' });
            
            // activeWorkers 맵의 키를 nextItem.id로 팝업 참조와 함께 갱신 이전
            if (sourceWindow) {
                activeWorkers.delete(matchedId);
                activeWorkers.set(nextItem.id, sourceWindow);
            }

            // [v1.21.8] 사용자의 슬립 설정 연동 및 대시보드 로그 출력
            const config = getConfig();
            const multiplier = SLEEP_MULTIPLIERS[config.sleepMode] || SLEEP_MULTIPLIERS.cautious;
            const sleepMs = Math.floor((1500 + Math.random() * 1000) * multiplier); // 기본 2초 가변 지터
            const sleepSeconds = sleepMs / 1000;
            
            EventBus.emit(EVT.LOG, {
                msg: `⏳ [대기] 다음 화 이동 전 안전 슬립 중... (${sleepSeconds.toFixed(1)}초)`,
                tag: 'Queue',
                level: 'info'
            });

            await new Promise(r => setTimeout(r, sleepMs));

            // 대기 완료 후 중단/일시정지 상태 재검증
            const freshQueue = getQueue();
            const freshItem = freshQueue.find(i => i.id === nextItem.id);
            if (!freshItem || freshItem.status !== 'processing' || getQueuePaused()) {
                console.log('[WorkerController] ⏹️ 슬립 대기 후 중단/일시정지 감지 -> 릴레이 중단 및 자식 팝업 폐쇄');
                EventBus.emit(EVT.LOG, {
                    msg: `⏹️ [중단] 슬립 대기 중 중단 감지 -> 다음 릴레이 취소`,
                    tag: 'Queue',
                    level: 'warn'
                });
                if (sourceWindow && !sourceWindow.closed) {
                    try {
                        sourceWindow.postMessage({ type: 'EMERGENCY_STOP', payload: { queueId: nextItem.id } }, '*');
                        sourceWindow.close();
                    } catch (e) {}
                }
                activeWorkers.delete(nextItem.id);
                return;
            }
        }

        // 자식에게 즉시 ACK 수락 신호 전송
        if (sourceWindow && !sourceWindow.closed) {
            try {
                sendToWorker(sourceWindow, 'IPC_ACK', ackPayload);
            } catch (ackErr) {
                console.warn('[WorkerController] [배치] ACK 전송 실패:', ackErr);
            }
        }

        // 수집된 바이너리/텍스트 데이터를 임시로 메모리에 업데이트하고 상태를 UPLOADING으로 표시
        updateQueueItem(matchedId, {
            stage: WORKER_STAGE.UPLOADING,
            progressPercent: 95,
            extractedContent: payload.content || null,
            extractedImages: payload.images || null
        });
        EventBus.emit(EVT.UPDATE_PROGRESS);

        try {
            const { category, destination, novelFormat, episodeTitle, episodeNum, rootFolder, title, matchedRule, localNameTemplate } = item;
            const isNovel = (category === 'Novel' || category === 'novel');
            const siteName = matchedRule?.name || "TokiSync Parser";

            let blob;
            const extension = isNovel ? novelFormat : 'cbz';

            // 2. 미디어 타입별 조립(Build) 진행
            if (isNovel) {
                if (!payload.content) {
                    throw new Error("수집된 소설 본문 데이터가 없습니다.");
                }
                const builder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder();
                builder.addChapter(episodeTitle, payload.content.trim());
                
                const innerZip = await builder.build({
                    series: title || rootFolder,
                    title: episodeTitle,
                    number: episodeNum,
                    writer: siteName
                });
                blob = await innerZip.generateAsync({ type: "blob" });
            } else {
                if (!payload.images || !Array.isArray(payload.images)) {
                    throw new Error("수집된 만화 이미지 데이터가 없습니다.");
                }
                const builder = new CbzBuilder();
                const resolvedImages = payload.images.map(img => {
                    const mimeType = img.ext?.includes('png') ? 'image/png' : (img.ext?.includes('webp') ? 'image/webp' : 'image/jpeg');
                    return {
                        url: img.url,
                        blob: img.data ? new Blob([img.data], { type: mimeType }) : new Blob([]),
                        ext: img.ext || '.jpg',
                        isMissing: !!img.isMissing
                    };
                });
                builder.addChapter(episodeTitle, resolvedImages);
                
                const innerZip = await builder.build({
                    series: title || rootFolder,
                    title: episodeTitle,
                    number: episodeNum,
                    writer: siteName
                });
                blob = await innerZip.generateAsync({ type: "blob" });
            }

            // 3. 파일 이름 결정: localNameTemplate 기반 (없으면 4자리 패딩 기본값)
            const template = localNameTemplate || '{number:4} - {title}';
            let fullFilename = template.replace(/\{number:(\d)\}/g, (_, p1) => {
                const padSize = parseInt(p1, 10);
                return padSize > 0
                    ? (episodeNum || '').toString().padStart(padSize, '0')
                    : (episodeNum || '').toString();
            });
            const legacyPaddedNum = (episodeNum || '').toString().padStart(4, '0');
            fullFilename = fullFilename
                .replace(/\{number\}/g, legacyPaddedNum)
                .replace(/\{rawNumber\}/g, (episodeNum || '').toString())
                .replace(/\{series\}/g, title || rootFolder || '')
                .replace(/\{title\}/g, episodeTitle || '');

            console.log(`[WorkerController] [배치 업로드] 파일 조립 완료. 구글 드라이브 전송 시작: ${fullFilename}.${extension}`);
            
            await saveFile(blob, fullFilename, destination, extension, {
                folderName: rootFolder,
                category: category
            });

            // 4. 업로드 완료 후 최종 성공 전이
            updateQueueItem(matchedId, {
                status: 'completed',
                progressPercent: 100,
                stage: WORKER_STAGE.COMPLETED
            });
            console.log(`[WorkerController] 🎉 [배치] 업로드 및 완료 처리 성공 (ID: ${matchedId})`);

        } catch (uploadErr) {
            console.error(`[WorkerController] ❌ [배치] 업로드 처리 중 예외 발생:`, uploadErr);
            
            // [v1.21.8] 사용자의 정지 클릭으로 이미 failed로 빠졌는지 확인
            const freshQueue = getQueue();
            const freshItem = freshQueue.find(i => i.id === matchedId);
            const isStopped = freshItem && freshItem.status === 'failed' && freshItem.errorMsg?.includes('중단');

            const nextRetry = (item.retryCount || 0) + 1;
            updateQueueItem(matchedId, {
                status: (isStopped || nextRetry >= 3) ? 'failed' : 'pending',
                retryCount: nextRetry,
                errorMsg: isStopped ? '사용자에 의해 수집이 강제로 중단되었습니다.' : (uploadErr.message || '파일 빌드 및 업로드 실패')
            });

            EventBus.emit(EVT.LOG, {
                msg: `❌ [배치 업로드 실패] [${item.episodeTitle}] ${uploadErr.message || '오류 발생'} (시도: ${nextRetry}/3)`,
                tag: 'Queue',
                level: 'error'
            });
        }

        const popupRef = activeWorkers.get(matchedId);
        if (popupRef) {
            const actualRef = popupRef.ref || popupRef;
            if (actualRef && !actualRef.closed) {
                const updatedQueue = getQueue();
                const pendingExists = updatedQueue.some(i => i.status === 'pending');
                if (!pendingExists) {
                    actualRef.close();
                    activeWorkers.delete(matchedId);
                }
            } else {
                activeWorkers.delete(matchedId);
            }
        }

        EventBus.emit(EVT.UPDATE_PROGRESS);

        // 드라이브 캐시 최종 갱신
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

        // 다음 릴레이 스케줄 기동
        runSchedulerOnce();
    };

    registerIpcListener(async (msg) => {
        const { type, payload, sourceEvent } = msg;
        if (!sourceEvent || !sourceEvent.source) return;

        // 1. WORKER_READY: 자식 워커 핸드셰이킹 수신
        if (type === 'WORKER_READY') {
            const { targetUrl } = payload || {};
            let matchedId = null;

            for (const [id, popupRef] of activeWorkers.entries()) {
                const actualRef = popupRef.ref || popupRef;
                if (actualRef === sourceEvent.source) {
                    matchedId = id;
                    break;
                }
            }

            if (!matchedId && targetUrl) {
                const queue = getQueue();
                const matchedItem = queue.find(item => 
                    (item.status === 'pending' || item.status === 'processing') && 
                    item.episodeUrl === targetUrl
                );
                if (matchedItem) {
                    matchedId = matchedItem.id;
                    activeWorkers.set(matchedId, sourceEvent.source);
                    console.log(`[WorkerController] ♻️ URL 매칭 성공 ➡️ Window 참조 복원 갱신 (ID: ${matchedId})`);
                }
            }

            if (matchedId) {
                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                
                if (item) {
                    const config = getConfig();
                    const multiplier = SLEEP_MULTIPLIERS[config.sleepMode] || SLEEP_MULTIPLIERS.cautious;
                    const initialDelay = 3000 * multiplier;
                    
                    console.log(`[WorkerController] 📢 [배치] READY 수신 (ID: ${matchedId}) ➡️ 안전 대기 기동 (${(initialDelay/1000).toFixed(1)}초)...`);
                    EventBus.emit(EVT.LOG, {
                        msg: `⏳ [대기] 새 에피소드 연결 성공 ➡️ 안전 대기 중... (${(initialDelay/1000).toFixed(1)}초)`,
                        tag: 'Queue',
                        level: 'info'
                    });
                    
                    await new Promise(r => setTimeout(r, initialDelay));
                    
                    // 대기 완료 후 중단 여부 재체크
                    const freshQueue = getQueue();
                    const freshItem = freshQueue.find(i => i.id === matchedId);
                    if (!freshItem || freshItem.status !== 'processing' || getQueuePaused()) {
                        console.log('[WorkerController] ⏹️ 첫 통신 대기 후 중단/일시정지 감지 -> 주입 취소');
                        return;
                    }

                    console.log(`[WorkerController] 📢 [배치] 안전 대기 완료 ➡️ START_EXTRACTION 주입 (ID: ${matchedId})`);
                    
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
                        speedMultiplier: multiplier, // 속도 배율 전달
                        localNameTemplate: config.localNameTemplate || "{number:4} - {title}"
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
                        msg: `⚠️ [캡차 대기] [${item.episodeTitle}] 브라우저 창에서 보안 해제를 수행해 주세요.`,
                        tag: 'Downloader',
                        level: 'warn'
                    });
                }
            }
        }

        // 2-1. WORKER_LOG: 자식 워커 커스텀 실시간 로그 출력
        if (type === 'WORKER_LOG') {
            const { msg, level } = payload || {};
            EventBus.emit(EVT.LOG, {
                msg: `📢 [워커로그] ${msg}`,
                tag: 'Worker',
                level: level || 'info'
            });
        }

        // 3. WORKER_PROGRESS: 자식 워커 실시간 진행률 UI 반영
        if (type === 'WORKER_PROGRESS') {
            const { percent, stage, queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
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
                    else if (stage === WORKER_STAGE.UPLOADING) stageText = '데이터 전송';
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
            const { queueId } = payload || {};
            let matchedId = queueId;

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
            const { errorMsg, queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of activeWorkers.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.error(`[WorkerController] ❌ [배치] 수집 실패 (ID: ${matchedId}): ${errorMsg}`);
                
                const popupRef = activeWorkers.get(matchedId);
                if (popupRef) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef && !actualRef.closed) {
                        const queue = getQueue();
                        const pendingExists = queue.some(i => i.status === 'pending');
                        if (!pendingExists) {
                            actualRef.close();
                            activeWorkers.delete(matchedId);
                        }
                    } else {
                        activeWorkers.delete(matchedId);
                    }
                }

                const queue = getQueue();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    // [v1.21.8] 사용자의 정지 클릭으로 이미 failed로 빠졌는지 확인
                    const isStopped = item.status === 'failed' && item.errorMsg?.includes('중단');
                    const nextRetry = (item.retryCount || 0) + 1;
                    updateQueueItem(matchedId, {
                        status: (isStopped || nextRetry >= 3) ? 'failed' : 'pending',
                        retryCount: nextRetry,
                        errorMsg: isStopped ? '사용자에 의해 수집이 강제로 중단되었습니다.' : (errorMsg || '자식 워커가 에러를 보고함')
                    });
                    EventBus.emit(EVT.UPDATE_PROGRESS);
                }

                // 배치 최종 실패 마감 시 처리
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

                runSchedulerOnce();
            }
        }
    });
}
