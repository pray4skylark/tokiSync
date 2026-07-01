/**
 * tokiSync v1.21.0 - Persistent Multi-Queue Batch Core
 * 영속성 디스크 큐 및 이벤트 기반 세마포어 스케줄러 엔진
 */

import { EventBus, EVT } from './EventBus.js';

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
const MAX_CONCURRENCY = 2; // 최대 동시 다운로드 수

// 임시 팝업 창 참조 보관용 맵 (Liveness check 및 재활용 루프 대비)
export const activeWorkers = new Map();
const closedCounts = new Map(); // Track closed counts for liveness check independently to avoid polluting activeWorkers window references

// handleBatchSuccess 진행 중인 아이템 추적 (팝업은 닫혔지만 CBZ/업로드 진행 중)
export const _activeProcessing = new Set();

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
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    }
    EventBus.emit(EVT.UPDATE_PROGRESS);
  } catch (e) {
    console.error('[TokiSync Queue] Failed to save queue to storage:', e);
  }
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
    // 진행 중인 워커인 경우 팝업 즉시 강제 폐쇄 및 맵에서 삭제
    if (item.status === 'processing') {
      const popupRef = activeWorkers.get(id);
      try {
        if (popupRef && !popupRef.closed) {
          popupRef.close();
        }
      } catch (e) {
        console.warn(`[Queue] 개별 삭제 중 자식 팝업 close 실패: ${id}`, e);
      }
      activeWorkers.delete(id);
      closedCounts.delete(id);
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
  
  // 1. 모든 팝업 창 닫기 (EMERGENCY_STOP 전파 후 100ms 대기)
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
    if (typeof GM_setValue !== 'undefined') {
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
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;
  console.log(`[Queue Scheduler] 🔍 runSchedulerOnce 진입 (activeWorkers=${activeWorkers.size}, _activeProcessing=${_activeProcessing.size})`);

  try {
    const queue = getRawQueue();
    
    // Liveness Check: 실제 열려있는 팝업 중 닫힌 팝업이 있는지 감지하여 failed 전이
    for (const [id, popupRef] of activeWorkers.entries()) {
      if (popupRef && popupRef.closed) {
        // 일시적인 closed 레이스 컨디션 방지를 위한 유예 카운트 (연속 3회 감지 시 강제 폐쇄 확정)
        const closedCount = (closedCounts.get(id) || 0) + 1;
        closedCounts.set(id, closedCount);

        if (closedCount >= 3) {
          console.warn(`[Queue Scheduler] ⚠️ 자식 팝업 비정상 종료 확정 (연속 3회 감지): ${id}`);
          activeWorkers.delete(id);
          closedCounts.delete(id);
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
        // 정상 기동 확인 시 유예 카운터 즉시 리셋
        closedCounts.set(id, 0);
      }
    }

    // 1. 현재 수집 중인 활성 팝업(activeWorkers) 또는 진행 중인 작업(_activeProcessing) 제약
    if (activeWorkers.size >= 1 || _activeProcessing.size >= 1) {
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
      // 대기 중인 작업도 없고 현재 진행 중인 활성 작업도 없다면 안티 슬립 오디오를 정지시킵니다.
      if (currentProcessing.length === 0) {
        try {
          stopSilentAudio();
        } catch (e) {}
      }
      isSchedulerRunning = false;
      return;
    }

    // [v1.21.4] 안전 장치: 이미 activeWorkers가 점유하고 있는 아이템이라면 중복 기동 방지 스킵
    if (activeWorkers.has(nextItem.id)) {
      console.log(`[Queue Scheduler] 🛡️ 중복 기동 우회: activeWorkers에 이미 점유된 에피소드 스킵: ${nextItem.episodeTitle}`);
      isSchedulerRunning = false;
      return;
    }

    // 4. 인간 행동 모사를 위한 2.0초~4.0초 랜덤 지연 완충
    console.log(`[Queue Scheduler] 🛡️ 안전 지연 대기 시작 (Target: ${nextItem.episodeTitle})`);
    
    // 배치 수집 기동을 위해 안티 슬립 기동
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
    if (_activeProcessing.size >= 1 || activeWorkers.size >= 1) {
      console.log(`[Queue Scheduler] 🛡️ 활성 처리/팝업 감지로 기동 취소: ${nextItem.episodeTitle} (activeProcessing=${_activeProcessing.size}, activeWorkers=${activeWorkers.size})`);
      isSchedulerRunning = false;
      return;
    }

    // 6. 팝업 실행 및 상태 갱신
    console.log(`[Queue Scheduler] 🚀 1회성 신규 팝업 기동: ${nextItem.episodeTitle} (${nextItem.episodeUrl}), 현재 activeWorkers=${activeWorkers.size}, _activeProcessing=${_activeProcessing.size}`);
    updateQueueItem(nextItem.id, { status: 'processing', startedAt: Date.now() });
    
    const popupRef = openEpisodePopup(nextItem.episodeUrl, nextItem.id);
    if (popupRef) {
        activeWorkers.set(nextItem.id, popupRef);
        console.log(`[Queue Scheduler] ✅ 팝업 등록 완료: ${nextItem.episodeTitle} (activeWorkers=${activeWorkers.size})`);
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
    
    // 봇 감지 회피 절충안 규격 (400x600, right-aligned)
    const width = 400;
    const height = 600;
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
  // 1. Tampermonkey 네이티브 비동기 스토리지 리스너 감시 활성화
  if (typeof GM_addValueChangeListener !== 'undefined') {
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
