/**
 * tokiSync v1.21.0 - Persistent Multi-Queue Batch Core
 * 영속성 디스크 큐 코어 엔진
 */

const STORAGE_KEY = 'tokisync_download_queue';

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
 * @returns {Array} QueueItem 배열
 */
export const getQueue = () => {
  return getRawQueue();
};

/**
 * 에피소드 대기열 다중 추가
 * @param {Array} episodes { title, url, episodeNum } 구조의 배열
 * @param {string} novelTitle 작품명
 * @returns {number} 추가된 아이템 개수
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
        progressPercent: 0, // 🌟 실시간 다운로드 진행률 (0 ~ 100)
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
 * @param {string} id 아이템 고유 ID
 * @param {Object} updates 변경할 필드셋 ({ status, progressPercent, retryCount, errorMsg, ... })
 * @returns {boolean} 갱신 성공 여부
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
 * @param {string} id 아이템 고유 ID
 * @param {number} percent 0 ~ 100 사이의 진행 백분율
 * @returns {boolean} 갱신 성공 여부
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
