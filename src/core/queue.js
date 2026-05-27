/**
 * tokiSync v1.21.0 - Persistent Multi-Queue Batch Core
 * 영속성 디스크 큐 및 이벤트 기반 세마포어 스케줄러 엔진
 */

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

const STORAGE_KEY = 'tokisync_download_queue';
const MAX_CONCURRENCY = 2; // 최대 동시 다운로드 수

// 임시 팝업 창 참조 보관용 맵 (Liveness check 및 재활용 루프 대비)
export const activeWorkers = new Map();

// Tampermonkey 환경 및 Node.js/일반 브라우저 환경 간의 영속성 호환 래퍼
const getRawQueue = () => {
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

const saveRawQueue = (queue) => {
  try {
    if (typeof GM_setValue !== 'undefined') {
      GM_setValue(STORAGE_KEY, queue);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    }
  } catch (e) {
    console.error('[TokiSync Queue] Failed to save queue to storage:', e);
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
    const id = `${novelTitle}_${ep.episodeNum}`.replace(/\s+/g, '_');
    
    // 이미 존재하는지 중복성 검사
    const exists = queue.some(item => item.id === id);
    if (!exists) {
      queue.push({
        id,
        title: novelTitle,
        episodeTitle: ep.title,
        episodeUrl: ep.url,
        status: 'pending',
        progressPercent: 0,
        stage: WORKER_STAGE.INIT, // 🌟 실시간 세부 작업 단계 초기화
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
    queue[index] = {
      ...queue[index],
      ...updates,
      completedAt: updates.status === 'completed' ? Date.now() : queue[index].completedAt
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
 * 완료된(completed) 항목들 일괄 삭제
 */
export const removeCompletedItems = () => {
  const queue = getRawQueue();
  const filtered = queue.filter(item => item.status !== 'completed');
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
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;

  try {
    const queue = getRawQueue();
    
    // Liveness Check: 실제 열려있는 팝업 중 닫힌 팝업이 있는지 감지하여 failed 전이
    for (const [id, popupRef] of activeWorkers.entries()) {
      if (popupRef && popupRef.closed) {
        console.warn(`[Queue Scheduler] ⚠️ 자식 팝업 비정상 종료 감지: ${id}`);
        activeWorkers.delete(id);
        const item = queue.find(i => i.id === id);
        if (item && item.status === 'processing') {
          const nextRetry = item.retryCount + 1;
          updateQueueItem(id, { 
            status: nextRetry >= 3 ? 'failed' : 'pending', 
            retryCount: nextRetry,
            errorMsg: '자식 팝업 창이 비정상적으로 강제 종료되었습니다.' 
          });
        }
      }
    }

    // 1. 현재 processing(작업 중) 상태인 큐 아이템의 개수를 산출
    const currentProcessing = queue.filter(item => item.status === 'processing');

    // 2. 동시성 임계값(MAX_CONCURRENCY = 2) 도달 시 즉시 대기 차단
    if (currentProcessing.length >= MAX_CONCURRENCY) {
      isSchedulerRunning = false;
      return;
    }

    // 3. pending(대기 중) 상태인 첫 번째 에피소드 추출
    const nextItem = queue.find(item => item.status === 'pending');
    if (!nextItem) {
      isSchedulerRunning = false;
      return;
    }

    // 4. 인간 행동 모사를 위한 1.5초~3초 랜덤 지연 완충
    console.log(`[Queue Scheduler] 🛡️ 안전 지연 대기 시작 (Target: ${nextItem.episodeTitle})`);
    await sleepJitter(1500, 3000);

    // 5. 팝업 실행 및 상태 갱신
    console.log(`[Queue Scheduler] 🚀 팝업 기동: ${nextItem.episodeTitle} (${nextItem.episodeUrl})`);
    updateQueueItem(nextItem.id, { status: 'processing' });
    
    // 실제 팝업 기동 가교 함수 호출
    const popupRef = openEpisodePopup(nextItem.episodeUrl, nextItem.id);
    if (popupRef) {
      activeWorkers.set(nextItem.id, popupRef);
    } else {
      // 팝업 차단 등으로 창 생성 실패 시 즉시 failed 처리
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
const openEpisodePopup = (url, id) => {
  try {
    // Node.js 테스트 환경 등 윈도우 객체가 실존하지 않는 환경에서의 안전 예외처리
    if (typeof window === 'undefined' || typeof window.open === 'undefined') {
      // 가상 Mocking 반환
      return { closed: false };
    }
    
    // 봇 감지 회피 절충안 규격 (500x800, right-aligned)
    const width = 500;
    const height = 800;
    const left = window.screen.width - width - 50;
    const top = 100;
    
    const popupRef = window.open(
      url, 
      `tokisync_novel_worker_${id}`.replace(/[^a-zA-Z0-9_]/g, ''), 
      `width=${width},height=${height},left=${left},top=${top},noopener=false,scrollbars=yes,resizable=yes`
    );
    return popupRef;
  } catch (e) {
    console.error('[Queue Scheduler] Popup launch failed:', e);
    return null;
  }
};

/**
 * 이벤트 기반 백그라운드 세마포어 스케줄러 등록
 */
export const initQueueScheduler = () => {
  // 1. Tampermonkey 네이티브 비동기 스토리지 리스너 감시 활성화
  if (typeof GM_addValueChangeListener !== 'undefined') {
    GM_addValueChangeListener(STORAGE_KEY, (key, oldValue, newValue, remote) => {
      // 대기열 변동 이벤트가 오면 1회성 스케줄러 즉시 발동
      runSchedulerOnce();
    });
    console.log('[TokiSync Queue] 🚦 이벤트 기반(Event-Driven) 고성능 스케줄러가 활성화되었습니다.');
  } else {
    // Fallback: GM API가 없는 가상 유닛 테스트/샌드박스 환경에서는 2초 주기 폴링 작동
    setInterval(() => {
      runSchedulerOnce();
    }, 2000);
    console.warn('[TokiSync Queue] ⚠️ GM_addValueChangeListener 미지원 환경. 2초 폴링 스케줄러로 기동합니다.');
  }

  // 초기 기동 시에도 즉시 1회 검사
  runSchedulerOnce();
};
