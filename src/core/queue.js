/**
 * tokiSync v1.21.0 - Persistent Multi-Queue Batch Core
 * 영속성 디스크 큐 및 이벤트 기반 세마포어 스케줄러 엔진
 */

import { LogBox } from './ui.js';

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
const closedCounts = new Map(); // Track closed counts for liveness check independently to avoid polluting activeWorkers window references

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
    try {
      LogBox.getInstance().updateProgressUI();
    } catch (uiErr) {}
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
 * 팝업 재사용(Relay) 시 디스크 I/O 갭으로 인한 세마포어 중복 기동을 차단하기 위한 원자적 전이 함수
 */
export const transitionQueueItemsForRelay = (completedId, nextId) => {
  const queue = getRawQueue();
  let changed = false;

  const compIndex = queue.findIndex(item => item.id === completedId);
  if (compIndex !== -1) {
    queue[compIndex] = {
      ...queue[compIndex],
      status: 'completed',
      stage: WORKER_STAGE.COMPLETED,
      progressPercent: 100,
      completedAt: Date.now()
    };
    changed = true;
  }

  const nextIndex = queue.findIndex(item => item.id === nextId);
  if (nextIndex !== -1) {
    queue[nextIndex] = {
      ...queue[nextIndex],
      status: 'processing',
      stage: WORKER_STAGE.INIT,
      progressPercent: 0
    };
    changed = true;
  }

  if (changed) {
    saveRawQueue(queue);
  }
  return changed;
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

const PAUSED_KEY = 'tokisync_queue_paused';

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
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PAUSED_KEY, String(paused));
    }
  } catch (e) {}
};

/**
 * 모든 자식 팝업을 강제 폐쇄하고 큐를 중단 청소하는 완전 정지
 */
export const stopAllWorkers = () => {
  console.log('[Queue] ⏹️ 모든 활성 자식 팝업 강제 폐쇄 및 수집 중단 집행...');
  
  // 1. 모든 팝업 창 즉시 닫기
  for (const [id, popupRef] of activeWorkers.entries()) {
    try {
      if (popupRef && !popupRef.closed) {
        popupRef.close();
      }
    } catch (e) {
      console.warn(`[Queue] 팝업 close 오류: ${id}`, e);
    }
  }
  activeWorkers.clear();
  closedCounts.clear();

  // 2. 큐 대기열 전체 청소 및 중단 마킹
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

  // 3. 일시 정지 해제
  setQueuePaused(false);
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

    // [v1.21.4] 안전 장치: 이미 activeWorkers가 점유하고 있는 아이템이라면 중복 기동 방지 스킵
    if (activeWorkers.has(nextItem.id)) {
      console.log(`[Queue Scheduler] 🛡️ 중복 기동 우회: activeWorkers에 이미 점유된 에피소드 스킵: ${nextItem.episodeTitle}`);
      isSchedulerRunning = false;
      return;
    }

    // 4. 인간 행동 모사를 위한 1.5초~3초 랜덤 지연 완충
    console.log(`[Queue Scheduler] 🛡️ 안전 지연 대기 시작 (Target: ${nextItem.episodeTitle})`);
    await sleepJitter(1500, 3000);

    // 5. 팝업 실행 및 상태 갱신
    console.log(`[Queue Scheduler] 🚀 팝업 릴레이 기동: ${nextItem.episodeTitle} (${nextItem.episodeUrl})`);
    updateQueueItem(nextItem.id, { status: 'processing' });
    
    // 유효한 기존 팝업 채널 재사용 탐색
    let recycledPopup = null;
    let targetSlotId = null;

    // 2개의 슬롯 중 비어있거나 완료된 팝업 슬롯을 탐색하여 재사용
    for (const [id, popupRef] of activeWorkers.entries()) {
        const item = queue.find(i => i.id === id);
        if (popupRef && !popupRef.closed && (!item || item.status === 'completed' || item.status === 'failed')) {
            recycledPopup = popupRef;
            targetSlotId = id;
            break;
        }
    }

    if (recycledPopup) {
        const targetWindowName = `tokisync_novel_worker_${targetSlotId}`.replace(/[^a-zA-Z0-9_]/g, '');
        const newWindowName = `tokisync_novel_worker_${nextItem.id}`.replace(/[^a-zA-Z0-9_]/g, '');

        console.log(`[Queue Scheduler] ♻️ 기존 자식 팝업 슬롯 재사용 (이름: ${targetWindowName} -> 신규: ${newWindowName})`);
        // activeWorkers 정리 및 교체
        activeWorkers.delete(targetSlotId);
        activeWorkers.set(nextItem.id, recycledPopup);

        try {
            // [CORS 우회 우주 표준 기법] 기존 window.name을 타겟으로 window.open을 호출하면
            // 새 창을 띄우지 않고 동일 팝업창 내에서 URL 리다이렉션이 성공하며, 팝업 차단막도 우회합니다!
            const width = 400;
            const height = 600;
            const left = window.screen.width - width - 50;
            const top = 100;
            
            const updatedPopup = window.open(
                nextItem.episodeUrl,
                targetWindowName,
                `width=${width},height=${height},left=${left},top=${top},noopener=false,scrollbars=yes,resizable=yes`
            );
            
            if (updatedPopup) {
                // 통신 식별자 갱신
                updatedPopup.name = newWindowName;
                activeWorkers.set(nextItem.id, updatedPopup);
            }
        } catch (err) {
            console.error('[Queue Scheduler] 릴레이 window.open 우회 실패, 일반 리다이렉션 시도:', err);
            try {
                recycledPopup.location.href = nextItem.episodeUrl;
                recycledPopup.name = newWindowName;
                activeWorkers.set(nextItem.id, recycledPopup);
            } catch (hrefErr) {
                console.error('[Queue Scheduler] 팝업 릴레이 강제 실패:', hrefErr);
            }
        }
    } else {
        // 가용 팝업이 없을 때만 물리적 open 수행 (최초 진입 시 2회만 동작)
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
