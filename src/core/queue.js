/**
 * tokiSync v1.28.0 - Persistent Multi-Queue Batch Core
 * 영속성 디스크 큐 및 이벤트 기반 세마포어 스케줄러 엔진
 * [v1.28.0] saveRawQueue 재시도 + localStorage 폴백 체인 추가
 */

import { EventBus, EVT } from './EventBus.js';
import { registerWorkerOrigin } from './ipc-broker.js';

let _storage = null;

export function setQueueStorage(backend) {
  _storage = backend;
}

export const WORKER_STAGE = {
  INIT: 'STAGE_INIT',             // 초기화 및 Handshake 대기 중
  DOM_READY: 'STAGE_DOM_READY',   // 콘텐츠 DOM 렌더링 및 안정화 대기 중
  SCROLLING: 'STAGE_SCROLLING',   // 지연 로딩 극복을 위한 강제 스크롤 중
  PARSING: 'STAGE_PARSING',       // 미디어 분석 및 복호화 처리 중
  DOWNLOADING: 'STAGE_DOWNLOADING',// XHR 이미지 다운로드 중
  UPLOADING: 'STAGE_UPLOADING',   // 구글 드라이브 Resumable 업로드 중
  COMPLETED: 'STAGE_COMPLETED',   // 전체 태스크 성공 완료
  FAILED: 'STAGE_FAILED'          // 예외 및 수집 실패
};

const STORAGE_KEY = 'TOKI_DOWNLOAD_QUEUE';
const MAX_CONCURRENCY = 2; // 최대 동시 다운로드 수 (현재 직렬 처리로 고정)

// [v1.28.0] 저장 재시도 설정 (무한 루프 방지 + 지수 백오프)
const SAVE_RETRY_MAX = 3;
const SAVE_RETRY_BASE_DELAY_MS = 100; // 100ms → 200ms → 400ms 지수 백오프

// 임시 팝업 창 참조 보관용 맵 (Liveness check 및 재활용 루프 대비)
export const activeWorkers = new Map();

// [v1.27.0] B+C 하이브리드: 처리 락 전담 Set (activeWorkers와 분리)
export const processingSlots = new Set();

// [v1.27.0] 세션 토큰 레지스트리: workerId -> {sessionToken, popupRef, createdAt, lastActivity}
export const sessionRegistry = new Map();

const closedCounts = new Map(); // Track closed counts for liveness check independently to avoid polluting activeWorkers window references

// handleBatchSuccess 진행 중인 아이템 추적 (팝업은 닫혔지만 CBZ/업로드 진행 중)
export const _activeProcessing = new Set();

// Tampermonkey 환경 및 Node.js/일반 브라우저 환경 간의 영속성 호환 래퍼
const getRawQueue = () => {
  if (_storage) return _storage.get(STORAGE_KEY, []);
  try {
    if (typeof GM_getValue !== 'undefined') {
      return GM_getValue(STORAGE_KEY, []);
    }
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(STORAGE_KEY);
      return val ? JSON.parse(val) : [];
    }
  } catch (e) {
    console.error('[TokiSync Queue] Failed to read queue from storage:', e);
  }
  return [];
};

/**
 * [v1.28.0] 단일 동기 저장 시도 — GM_setValue 1차, localStorage 2차 폴백
 * MV3 대응: GM_setValue가 Promise를 반환하면 .catch로 비동기 재시도 트리거
 * @param {Array} queue 저장할 큐 데이터
 * @returns {boolean} 동기 성공 여부 (MV3 Promise fire-and-forget은 항상 true)
 */
const trySaveOnce = (queue) => {
  if (_storage) return _storage.set(STORAGE_KEY, queue);
  if (typeof GM_setValue !== 'undefined') {
    try {
      const result = GM_setValue(STORAGE_KEY, queue);
      // MV3: Promise 반환 시 실패하면 비동기 재시도 스케줄링
      if (result && typeof result.catch === 'function') {
        result.catch(err => {
          console.warn('[TokiSync Queue] MV3 GM_setValue 비동기 실패:', err.message);
          scheduleRetry(queue, 1);
        });
      }
      return true;
    } catch (gmErr) {
      console.warn('[TokiSync Queue] GM_setValue 실패, localStorage 폴백 시도:', gmErr.message);
    }
  }
  // 2차: localStorage 폴백 (GM API 불안정 시 영속성 보존)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
      return true;
    } catch (lsErr) {
      console.error('[TokiSync Queue] localStorage 폴백도 실패:', lsErr.message);
    }
  }
  return false;
};

/**
 * [v1.28.0] 비동기 재시도 스케줄러 (메인 스레드 비차단)
 * setTimeout 기반 지수 백오프. 완전 실패 시 EventBus로 UI에 알림.
 * @param {Array} queue 저장할 큐 데이터
 * @param {number} attempt 현재 시도 횟수 (1-based)
 */
const scheduleRetry = (queue, attempt) => {
  if (attempt > SAVE_RETRY_MAX) {
    console.error(
      `[TokiSync Queue] ❌ 치명적: 큐 저장 완전 실패 (${SAVE_RETRY_MAX}회 재시도 모두 실패). 데이터 유실 위험!`
    );
    EventBus.emit(EVT.STORAGE_FATAL, {
      key: STORAGE_KEY,
      dataSize: JSON.stringify(queue).length,
      retriesExhausted: SAVE_RETRY_MAX
    });
    return;
  }

  const delayMs = SAVE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
  console.warn(`[TokiSync Queue] 저장 재시도 ${attempt}/${SAVE_RETRY_MAX} (${delayMs}ms 백오프)...`);

  setTimeout(() => {
    if (trySaveOnce(queue)) {
      EventBus.emit(EVT.UPDATE_PROGRESS);
      console.log(`[TokiSync Queue] ✅ 저장 재시도 성공 (${attempt}회차)`);
    } else {
      scheduleRetry(queue, attempt + 1);
    }
  }, delayMs);
};

/**
 * [v1.28.0] 영속성 큐 저장 — 동기 즉시 시도 + 비동기 재시도 폴백
 *
 * 설계 원칙:
 * - 동기 API 유지 (호출자 변경 불필요: worker-controller 11곳, downloader 4곳, MenuModal 6곳)
 * - GM_setValue 즉시 성공 → 동기 완료 (기존 동작 동일)
 * - GM_setValue 실패 → localStorage 동기 폴백 → 성공 시 즉시 반환
 * - 모두 실패 → setTimeout 기반 비동기 재시도 (메인 스레드 비차단)
 * - MV3 Promise reject → 비동기 재시도 자동 트리거
 * - 완전 실패 → EVT.STORAGE_FATAL 이벤트 발행 (UI 경고 표시 가능)
 *
 * @param {Array} queue 저장할 큐 데이터
 */
export const saveRawQueue = (queue) => {
  // 동기 즉시 시도 (MV2: 완료, MV3: Promise fire-and-forget)
  if (trySaveOnce(queue)) {
    EventBus.emit(EVT.UPDATE_PROGRESS);
    return;
  }
  // 동기 경로 실패 → 비동기 재시도 시작 (호출자는 즉시 리턴, 블로킹 없음)
  scheduleRetry(queue, 1);
};

// 32비트 FNV-1a 해시를 36진수 아스키 문자열로 변환하여 한글 유실 없는 고유 아스키 ID 보장
function tokiHash(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash).toString(36);
}

/**
 * 작품명과 회차번호 기반의 고유 FNV 해시 ID 생성 헬퍼
 */
export const getQueueItemId = (title, episodeNum) => {
  const hashPart = tokiHash(`${title}_${episodeNum}`);
  return `toki_${hashPart}`;
};

/**
 * [v1.27.2] 디버그 일관성 검증: processingSlots와 sessionRegistry 동기화 확인
 */
const assertConsistent = (context = '') => {
  if (processingSlots.size !== sessionRegistry.size) {
    console.warn(`[Queue] ⚠️ 상태 불일치 감지 (${context}): processingSlots=${processingSlots.size} != sessionRegistry=${sessionRegistry.size}`);
  }
};

/**
 * [v1.27.0] 워커 세션 생성: 팝업 열기 직후 호출
 * - processingSlots에 락 등록
 * - sessionRegistry에 메타데이터 저장
 * - activeWorkers에 window 참조 등록 (하위 호환)
 * @param {string} id Queue item ID
 * @param {Window|null} popupRef Window reference (null이면 pre-open 단계)
 * @param {string} sessionToken ipc-broker.registerWorkerOrigin에서 생성한 토큰
 */
export const createWorkerSession = (id, popupRef, sessionToken) => {
  // 큐 아이템 참조 캐시 (touchSessionActivity 최적화)
  const queue = getRawQueue();
  const item = queue.find(i => i.id === id);
  
  sessionRegistry.set(id, {
    sessionToken,
    popupRef: popupRef || null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    queueItemRef: item || null
  });
  
  processingSlots.add(id);
  
  if (popupRef) {
    activeWorkers.set(id, popupRef);
  }
  
  assertConsistent('createWorkerSession');
  console.log(`[Queue]  세션 생성: ${id} → token=${sessionToken.substring(0, 8)}... (activeWorkers=${activeWorkers.size}, processingSlots=${processingSlots.size})`);
};

/**
 * [v1.27.0] 워커 세션 삭제: 팝업 종료/완료/실패 시 호출
 * @param {string} id Queue item ID
 * @param {string} [reason] 삭제 사유 (로깅용)
 */
export const destroyWorkerSession = (id, reason = 'unknown') => {
  sessionRegistry.delete(id);
  processingSlots.delete(id);
  activeWorkers.delete(id);
  closedCounts.delete(id);
  
  assertConsistent('destroyWorkerSession');
  console.log(`[Queue] 🗑️ 세션 삭제: ${id} (reason=${reason}) → activeWorkers=${activeWorkers.size}, processingSlots=${processingSlots.size}`);
};

/**
 * [v1.27.0] 세션 토큰 조회
 */
export const getSessionToken = (id) => {
  const session = sessionRegistry.get(id);
  return session?.sessionToken || null;
};

/**
 * [v1.27.0] 세션 활성 시간 갱신
 * 큐 아이템의 lastActivity도 동기 갱신 (타임아웃 감시 기준값)
 */
export const touchSessionActivity = (id) => {
  const session = sessionRegistry.get(id);
  if (session) {
    session.lastActivity = Date.now();
  }
  // [v1.27.2] 큐 아이템의 lastActivity에 직접 갱신 (GM write 불필요)
  if (session?.queueItemRef) {
    session.queueItemRef.lastActivity = Date.now();
  } else {
    // 폴백: 큐에서 find하여 갱신
    const queue = getRawQueue();
    const item = queue.find(i => i.id === id);
    if (item) {
      item.lastActivity = Date.now();
      if (session) {
        session.queueItemRef = item; // 캐시: 다음 호출부터 find 없이 직접 갱신
      }
    }
  }
};

/**
 * [v1.27.0] 세션의 popupRef 갱신 (pre-open → 실제 연결 전이 시)
 */
export const updateSessionPopupRef = (id, popupRef) => {
  const session = sessionRegistry.get(id);
  if (session) {
    session.popupRef = popupRef;
  }
  if (popupRef) {
    activeWorkers.set(id, popupRef);
  }
};


/**
 * 대기열 전체 목록 조회
 */
export const getQueue = () => {
  return getRawQueue();
};

/**
 * 에피소드 대기열 다중 추가
 */
export const addEpisodesToQueue = (episodes, novelTitle) => {
  const queue = getRawQueue();
  let addedCount = 0;

  episodes.forEach(ep => {
    // FNV 해시를 적용하여 작품명 한글 유실을 차단하고 100% 안전한 고유 아스키 식별자 생성
    const hashPart = tokiHash(`${novelTitle}_${ep.episodeNum}`);
    const id = `toki_${hashPart}`;
    
    // 이미 존재하는지 중복성 검사
    const exists = queue.some(item => item.id === id);
    if (!exists) {
      queue.push({
        id,
        title: novelTitle,
        episodeTitle: ep.title,
        episodeUrl: ep.url,
        episodeNum: ep.episodeNum || '',
        folderId: ep.folderId || '',             // 구글 드라이브 스캔 위치 폴더 ID 보존
        category: ep.category || 'Manga',       // 파서 룰 카테고리 (워커 targetType 판별용)
        viewerCfg: ep.viewerCfg || {},           // 파서 룰 viewer 설정 (워커 이미지 셀렉터용)
        rootFolder: ep.rootFolder || '',
        destination: ep.destination || 'local',
        novelFormat: ep.novelFormat || 'epub',
        matchedRule: ep.matchedRule || {},
        protocolDomain: ep.protocolDomain || '',
        seriesMetadata: ep.seriesMetadata || {},
        forceOverwrite: ep.forceOverwrite || false,
        status: 'pending',
        progressPercent: 0,
        stage: WORKER_STAGE.INIT,
        retryCount: 0,
        addedAt: Date.now()
      });
      addedCount++;
    }
  });

  if (addedCount > 0) {
    saveRawQueue(queue);
  }
  return addedCount;
};

/**
 * 특정 큐 아이템 상태 및 정보 갱신
 */
export const updateQueueItem = (id, updates) => {
  const queue = getRawQueue();
  const index = queue.findIndex(item => item.id === id);

  if (index !== -1) {
    const currentItem = queue[index];
    const isAlreadyStopped = currentItem.status === 'failed' && currentItem.errorMsg?.includes('중단');
    if (isAlreadyStopped) {
      console.log(`[Queue] 🛡️ 강제 중단된 큐 아이템에 대한 비동기 업데이트 거부: ${currentItem.episodeTitle}`);
      return false;
    }

    const hasStateChange = updates.status && updates.status !== queue[index].status;
    const hasStageChange = updates.stage && updates.stage !== queue[index].stage;
    const hasProgressChange = updates.progressPercent !== undefined && updates.progressPercent !== queue[index].progressPercent;
    queue[index] = {
      ...queue[index],
      ...updates,
      completedAt: updates.status === 'completed' ? Date.now() : queue[index].completedAt,
      lastActivity: (hasStateChange || hasStageChange || hasProgressChange) ? Date.now() : (updates.lastActivity !== undefined ? updates.lastActivity : queue[index].lastActivity)
    };
    saveRawQueue(queue);
    return true;
  }
  return false;
};



/**
 * 특정 큐 아이템의 실시간 진행률 고속 갱신
 */
export const updateQueueItemProgress = (id, percent) => {
  const sanitizedPercent = Math.min(100, Math.max(0, Math.round(percent)));
  return updateQueueItem(id, { progressPercent: sanitizedPercent });
};

/**
 * 대기열 전체 초기화
 */
export const clearQueue = () => {
  saveRawQueue([]);
};

/**
 * 특정 큐 아이템을 대기열에서 개별 제거
 * 만약 진행 중인(processing) 아이템이라면 활성 자식 팝업을 강제 폐쇄 처리
 */
export const removeQueueItem = (id) => {
  const queue = getRawQueue();
  const index = queue.findIndex(item => item.id === id);
  if (index !== -1) {
    const item = queue[index];
    if (item.status === 'processing') {
      const popupRef = activeWorkers.get(id);
      try {
        if (popupRef && !popupRef.closed) {
          popupRef.close();
        }
      } catch (e) {
        console.warn(`[Queue] 개별 삭제 중 자식 팝업 close 실패: ${id}`, e);
      }
      destroyWorkerSession(id, 'item_removed');
    }
    
    const filtered = queue.filter(q => q.id !== id);
    saveRawQueue(filtered);
    return true;
  }
  return false;
};

/**
 * 완료(completed) 및 실패(failed) 항목들 일괄 삭제 (큐 청소)
 */
export const removeCompletedAndFailedItems = () => {
  const queue = getRawQueue();
  const filtered = queue.filter(item => item.status !== 'completed' && item.status !== 'failed');
  saveRawQueue(filtered);
};

/**
 * 현재 대기열의 상태별 카운트 통계 조회
 */
export const getQueueStats = () => {
  const queue = getRawQueue();
  const stats = {
    total: queue.length,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  };

  queue.forEach(item => {
    if (stats[item.status] !== undefined) {
      stats[item.status]++;
    }
  });

  return stats;
};

// =============================================================
// 🚦 [2단계] 백그라운드 세마포어 및 이벤트 기반 스케줄러 구현
// =============================================================

const PAUSED_KEY = 'TOKI_QUEUE_PAUSED';

/**
 * 전역 큐 일시 정지 상태 조회 (GM 스토리지 연동으로 멀티 탭 실시간 공유)
 */
export const getQueuePaused = () => {
  try {
    if (typeof GM_getValue !== 'undefined') {
      return GM_getValue(PAUSED_KEY, false);
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(PAUSED_KEY) === 'true';
    }
  } catch (e) {}
  return false;
};

/**
 * 전역 큐 일시 정지 상태 설정
 */
export const setQueuePaused = (paused) => {
  try {
    if (typeof GM_setValue !== 'undefined') {
      GM_setValue(PAUSED_KEY, paused);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PAUSED_KEY, String(paused));
    }

    // [H8] 일시 정지 해제(재개) 시, 현재 수집 중(processing)인 모든 워커의 lastActivity를 리셋하여 타임아웃 오작동 원천 차단
    if (!paused) {
      const queue = getRawQueue();
      let updated = false;
      queue.forEach(item => {
        if (item.status === 'processing') {
          item.lastActivity = Date.now();
          updated = true;
        }
      });
      if (updated) {
        saveRawQueue(queue);
      }
    }
  } catch (e) {}
};

/**
 * 모든 자식 팝업을 강제 폐쇄하고 큐를 중단 청소하는 완전 정지
 */
export const stopAllWorkers = (shouldClear = false) => {
  console.log(`[Queue] ⏹️ 모든 활성 자식 팝업 강제 폐쇄 및 수집 중단 집행... (초기화 여부: ${shouldClear})`);
  
  for (const [id, popupRef] of activeWorkers.entries()) {
    try {
      if (popupRef && !popupRef.closed) {
        const actualRef = popupRef.ref || popupRef;
        if (actualRef && typeof actualRef.postMessage === 'function') {
          actualRef.postMessage({ type: 'EMERGENCY_STOP', payload: { queueId: id } }, '*');
        }
        setTimeout(() => {
          try {
            if (!popupRef.closed) popupRef.close();
          } catch (e) {}
        }, 100);
      }
    } catch (e) {
      console.warn(`[Queue] 팝업 close 오류: ${id}`, e);
    }
  }
  activeWorkers.clear();
  closedCounts.clear();
  processingSlots.clear();
  sessionRegistry.clear();

  // 2. 큐 대기열 전체 청소 및 중단 마킹 (1회성 트랜잭션 병합으로 레이스 컨디션 제거)
  if (shouldClear) {
    saveRawQueue([]);
  } else {
    const queue = getRawQueue();
    const updatedQueue = queue.map(item => {
      if (item.status === 'pending' || item.status === 'processing') {
        return {
          ...item,
          status: 'failed',
          stage: WORKER_STAGE.FAILED,
          errorMsg: '사용자에 의해 수집이 강제로 중단되었습니다.'
        };
      }
      return item;
    });
    saveRawQueue(updatedQueue);
  }

  // 3. 일시 정지 해제 및 크로스 탭 정지 동기화 트리거
  setQueuePaused(false);
  try {
    if (_storage) _storage.set('tokisync_queue_stopped_trigger', Date.now());
    else if (typeof GM_setValue !== 'undefined') {
      GM_setValue('tokisync_queue_stopped_trigger', Date.now());
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tokisync_queue_stopped_trigger', String(Date.now()));
    }
  } catch (e) {}
};

let isSchedulerRunning = false;

// 인간 행동 모방 랜덤 지연시간(Jitter Delay) 유틸리티
const sleepJitter = (minMs, maxMs) => {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
};

/**
 * 1회성 스케줄링 기동 검사 (세마포어 알고리즘)
 */
export const runSchedulerOnce = async () => {
  if (getQueuePaused()) {
    isSchedulerRunning = false;
    return;
  }
  if (isSchedulerRunning) {
    console.log(`[Queue Scheduler] 🔄 runSchedulerOnce 중복진입 차단 (processingSlots=${processingSlots.size})`);
    return;
  }
  isSchedulerRunning = true; console.error('[DEBUG_RUN] scheduler started, queue:', JSON.stringify(getRawQueue().map(i=>({id:i.id.substring(0,12),s:i.status}))));
  console.log(`[Queue Scheduler] 🔍 runSchedulerOnce 진입 (processingSlots=${processingSlots.size}, _activeProcessing=${_activeProcessing.size}, queue_statuses=[${getRawQueue().map(i=>i.status).join(',')}])`);
  assertConsistent('runSchedulerOnce');

  try {
    const queue = getRawQueue();
    
    // Liveness Check: 실제 열려있는 팝업 중 닫힌 팝업이 있는지 감지하여 failed 전이
    for (const [id, popupRef] of activeWorkers.entries()) {
      if (popupRef && popupRef.closed) {
        const closedCount = (closedCounts.get(id) || 0) + 1;
        closedCounts.set(id, closedCount);

        if (closedCount >= 3) {
          console.warn(`[Queue Scheduler] ⚠️ 자식 팝업 비정상 종료 확정 (연속 3회 감지): ${id} → activeWorkers 크기=${activeWorkers.size}`);
          destroyWorkerSession(id, 'popup_closed_3x');
          const item = queue.find(i => i.id === id);
          if (item && item.status === 'processing') {
            const nextRetry = item.retryCount + 1;
            updateQueueItem(id, { 
              status: nextRetry >= 3 ? 'failed' : 'pending', 
              retryCount: nextRetry,
              errorMsg: '자식 팝업 창이 비정상적으로 강제 종료되었습니다.' 
            });
          }
        } else {
          console.log(`[Queue Scheduler] 🛡️ 자식 팝업 일시적 closed 감지 유예 중 (${closedCount}/3): ${id}`);
        }
      } else {
        closedCounts.set(id, 0);
      }
    }

    // 1. 현재 수집 중인 활성 팝업(processingSlots) 또는 진행 중인 작업(_activeProcessing) 제약
    if (processingSlots.size >= 1 || _activeProcessing.size >= 1) {
      isSchedulerRunning = false;
      return;
    }

    // 2. 전체 진행 중(수집 + 업로드)인 세션이 최대 허용 한계(3개) 이상이면 리소스 가드를 위해 차단
    const currentProcessing = queue.filter(item => item.status === 'processing');
    if (currentProcessing.length >= 3) {
      isSchedulerRunning = false;
      return;
    }

    // 3. pending(대기 중) 상태인 첫 번째 에피소드 추출
    const nextItem = queue.find(item => item.status === 'pending');
    if (!nextItem) {
      if (currentProcessing.length === 0) {
        try {
          stopSilentAudio();
        } catch (e) {}
      }
      isSchedulerRunning = false;
      return;
    }

    // [v1.21.4] 안전 장치: 이미 processingSlots이 점유하고 있는 아이템이라면 중복 기동 방지 스킵
    if (processingSlots.has(nextItem.id)) {
      console.log(`[Queue Scheduler] 🛡️ 중복 기동 우회: processingSlots에 이미 점유된 에피소드 스킵: ${nextItem.episodeTitle}`);
      isSchedulerRunning = false;
      return;
    }

    // 4. 인간 행동 모사를 위한 2.0초~4.0초 랜덤 지연 완충
    console.log(`[Queue Scheduler] 🛡️ 안전 지연 대기 시작 (Target: ${nextItem.episodeTitle})`);
    
    try {
      startSilentAudio();
    } catch (e) {}

    await sleepJitter(2000, 4000);

    // [v1.21.8] 대기 지터 완료 후 사용자의 정지/일시정지 클릭 및 상태 정합성 재검증
    const freshQueue = getRawQueue();
    const freshItem = freshQueue.find(item => item.id === nextItem.id);
    if (!freshItem || freshItem.status !== 'pending' || getQueuePaused()) {
      console.log(`[Queue Scheduler] ⏹️ 지터 대기 중 중단/일시정지 또는 상태 변경 감지 -> 기동 취소: ${nextItem.episodeTitle}`);
      isSchedulerRunning = false;
      return;
    }

    // 5. 최종 가드: 아직 처리 중인 작업이 있거나 활성 팝업이 있으면 기동 취소
    if (_activeProcessing.size >= 1 || processingSlots.size >= 1) {
      console.log(`[Queue Scheduler] 🛡️ 활성 처리/팝업 감지로 기동 취소: ${nextItem.episodeTitle} (activeProcessing=${_activeProcessing.size}, processingSlots=${processingSlots.size})`);
      isSchedulerRunning = false;
      return;
    }

    // [v1.27.2] 좀비 팝업 가드: 동일 ID의 팝업이 아직 살아있는지 확인
    const zombiePopup = activeWorkers.get(nextItem.id);
    if (zombiePopup) {
      const actualRef = zombiePopup.ref || zombiePopup;
      if (actualRef && !actualRef.closed) {
        console.warn(`[Queue Scheduler] ⚠️ 기존 팝업 생존 확인 → 중복 기동 차단: ${nextItem.id}`);
        isSchedulerRunning = false;
        return;
      }
      console.log(`[Queue Scheduler] 🧹 좀비 팝업 참조 정리 (closed): ${nextItem.id}`);
      activeWorkers.delete(nextItem.id);
    }

    // 6. 팝업 실행 및 상태 갱신
    console.log(`[Queue Scheduler] 🚀 1회성 신규 팝업 기동: ${nextItem.episodeTitle} (${nextItem.episodeUrl}), 현재 processingSlots=${processingSlots.size}, _activeProcessing=${_activeProcessing.size}`);
    
    // [v1.27.0] processingSlots 선점 → updateQueueItem → 팝업 생성 순서로 레이스 컨디션 차단
    console.log(`[Queue Scheduler] 🔒 processingSlots 선점: ${nextItem.episodeTitle} (ID: ${nextItem.id})`);
    processingSlots.add(nextItem.id);
    updateQueueItem(nextItem.id, { status: 'processing', startedAt: Date.now() });
    
    const sessionToken = registerWorkerOrigin(nextItem.id, 'null');
    const popupRef = openEpisodePopup(nextItem.episodeUrl, nextItem.id, sessionToken);
        if (popupRef) {
        activeWorkers.set(nextItem.id, popupRef);
        sessionRegistry.set(nextItem.id, {
          sessionToken,
          popupRef,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          queueItemRef: nextItem
        });
        console.log(`[Queue Scheduler] ✅ 팝업 등록 완료: ${nextItem.episodeTitle} (ID: ${nextItem.id}, token=${sessionToken.substring(0, 8)}..., activeWorkers.size=${activeWorkers.size})`);
    } else {
        console.log(`[Queue Scheduler] 🧹 activeWorkers 해제 (팝업 실패): ${nextItem.id}`);
        processingSlots.delete(nextItem.id);
        sessionRegistry.delete(nextItem.id);
        updateQueueItem(nextItem.id, { 
            status: 'failed', 
            errorMsg: '브라우저 팝업 차단막에 의해 창 생성에 실패했습니다.' 
        });
    }

  } catch (err) {
    console.error('[Queue Scheduler] Error in scheduling loop:', err);
  } finally {
    isSchedulerRunning = false;
  }
};

// 팝업 기동 가교 (window.open 래퍼)
const openEpisodePopup = (url, id, sessionToken = '') => {
  try {
    if (typeof window === 'undefined' || typeof window.open === 'undefined') {
      return { closed: false };
    }
    
    const tokenUrl = sessionToken
      ? url + (url.includes('?') ? '&' : '?') + 'ts_token=' + encodeURIComponent(sessionToken)
      : url;
    
    const width = 400;
    const height = 600;
    const left = window.screen.width - width - 50;
    const top = 100;
    
    const popupRef = window.open(
      tokenUrl, 
      `tokisync_novel_worker_${id}`.replace(/[^a-zA-Z0-9_]/g, ''), 
      `width=${width},height=${height},left=${left},top=${top},noopener=false,scrollbars=yes,resizable=yes`
    );
    return popupRef;
  } catch (e) {
    console.error('[Queue Scheduler] Popup launch failed:', e);
    return null;
  }
};

let isQueueSchedulerInitialized = false;

/**
 * 이벤트 기반 백그라운드 세마포어 스케줄러 등록
 */
export const initQueueScheduler = () => {
  if (isQueueSchedulerInitialized) {
    console.log('[Queue] 🚦 스케줄러가 이미 초기화되었습니다. 중복 기동을 차단합니다.');
    return;
  }
  isQueueSchedulerInitialized = true;
  if (_storage) {
    _storage.addChangeListener(STORAGE_KEY, (key, oldValue, newValue, remote) => {
      const pendingCount = (Array.isArray(newValue) ? newValue.filter(i => i.status === 'pending').length : 0);
      runSchedulerOnce();
      console.log(`[Queue Scheduler] 📡 Storage_setValue 트리거 → runSchedulerOnce 호출 (pending=${pendingCount}, remote=${remote})`);
    });
    console.log('[TokiSync Queue] 🚦 스토리지 백엔드 기반 스케줄러가 활성화되었습니다.');
    if (typeof GM_addValueChangeListener !== 'undefined') {
      GM_addValueChangeListener('tokisync_queue_stopped_trigger', (key, oldValue, newValue, remote) => {
        if (remote) {
          console.log('[Queue] ⏹️ 타 탭의 중단 신호 감지 -> 현재 탭의 자식 워커 강제 폐쇄 및 클린업');
          for (const [id, popupRef] of activeWorkers.entries()) {
            try {
              if (popupRef && !popupRef.closed) {
                const actualRef = popupRef.ref || popupRef;
                if (actualRef && typeof actualRef.postMessage === 'function') {
                  actualRef.postMessage({ type: 'EMERGENCY_STOP', payload: { queueId: id } }, '*');
                }
                popupRef.close();
              }
            } catch (e) {}
          }
          activeWorkers.clear();
          closedCounts.clear();
          processingSlots.clear();
          sessionRegistry.clear();
        }
      });
    }
  } else if (typeof GM_addValueChangeListener !== 'undefined') {
    GM_addValueChangeListener(STORAGE_KEY, (key, oldValue, newValue, remote) => {
      // 대기열 변동 이벤트가 오면 1회성 스케줄러 즉시 발동
      const pendingCount = (Array.isArray(newValue) ? newValue.filter(i => i.status === 'pending').length : 0);
      runSchedulerOnce();
      console.log(`[Queue Scheduler] 📡 GM_setValue 트리거 → runSchedulerOnce 호출 (pending=${pendingCount}, remote=${remote})`);
    });
    // [v1.21.8] 크로스 탭 정지 동기화 감지기 추가
    GM_addValueChangeListener('tokisync_queue_stopped_trigger', (key, oldValue, newValue, remote) => {
      if (remote) {
        console.log('[Queue] ⏹️ 타 탭의 중단 신호 감지 -> 현재 탭의 자식 워커 강제 폐쇄 및 클린업');
        for (const [id, popupRef] of activeWorkers.entries()) {
          try {
            if (popupRef && !popupRef.closed) {
              const actualRef = popupRef.ref || popupRef;
              if (actualRef && typeof actualRef.postMessage === 'function') {
                actualRef.postMessage({ type: 'EMERGENCY_STOP', payload: { queueId: id } }, '*');
              }
              popupRef.close();
            }
          } catch (e) {}
        }
        activeWorkers.clear();
        closedCounts.clear();
        processingSlots.clear();
        sessionRegistry.clear();
      }
    });
    console.log('[TokiSync Queue] 🚦 이벤트 기반(Event-Driven) 고성능 스케줄러가 활성화되었습니다.');
  } else {
    // Fallback: GM API가 없는 가상 유닛 테스트/샌드박스 환경에서는 2초 주기 폴링 작동
    setInterval(() => {
      runSchedulerOnce();
    }, 2000);
    // Fallback: LocalStorage를 사용하는 멀티 탭 정지 감시
    let lastStoppedTrigger = localStorage.getItem('tokisync_queue_stopped_trigger') || '0';
    setInterval(() => {
      const currentTrigger = localStorage.getItem('tokisync_queue_stopped_trigger') || '0';
      if (currentTrigger !== lastStoppedTrigger) {
        lastStoppedTrigger = currentTrigger;
        console.log('[Queue] ⏹️ 타 탭의 중단 신호 감지(Fallback) -> 현재 탭의 자식 워커 강제 폐쇄 및 클린업');
        for (const [id, popupRef] of activeWorkers.entries()) {
          try {
            if (popupRef && !popupRef.closed) {
              const actualRef = popupRef.ref || popupRef;
              if (actualRef && typeof actualRef.postMessage === 'function') {
                actualRef.postMessage({ type: 'EMERGENCY_STOP', payload: { queueId: id } }, '*');
              }
              popupRef.close();
            }
          } catch (e) {}
        }
        activeWorkers.clear();
        closedCounts.clear();
        processingSlots.clear();
        sessionRegistry.clear();
      }
    }, 1000);
    console.warn('[TokiSync Queue] ⚠️ GM_addValueChangeListener 미지원 환경. 2초 폴링 스케줄러로 기동합니다.');
  }

  // 초기 기동 시에도 즉시 1회 검사
  runSchedulerOnce();


  // [H1] Queue Write Monopoly: 외부 모듈(downloader.js 등)의 큐 상태 변경 요청을 전담 처리
  EventBus.on(EVT.QUEUE_ITEM_UPDATE, ({ id, updates }) => {
    updateQueueItem(id, updates);
  });
};
