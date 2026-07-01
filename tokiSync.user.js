// ==UserScript==
// @name         TokiSync (Link to Drive)
// @namespace    http://tampermonkey.net/
// @version      1.26.4
// @description  Toki series sites -> Google Drive syncing tool (Bundled)
// @author       pray4skylark
// @updateURL    https://pray4skylark.github.io/tokiSync/tokiSync.user.js
// @downloadURL  https://pray4skylark.github.io/tokiSync/tokiSync.user.js
// @match        *://*/*webtoon/*
// @match        *://*/*novel/*
// @match        *://*/*manhwa/*
// @match        *://*/*manga/*
// @match        *://*/*comic/*
// @match        *://*/*toon/*
// @include      *://*toki*/*
// @include      *://*toon*/*
// @match        https://script.google.com/*
// @match        https://*.github.io/tokiSync/*
// @match        https://pray4skylark.github.io/tokiSync/*
// @include      http://localhost:*/*
// @include      http://127.0.0.1:*/*
// @icon         https://github.com/user-attachments/assets/99f5bb36-4ef8-40cc-8ae5-e3bf1c7952ad
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      pray4skylark.github.io
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.js
// @run-at       document-start
// @noframes
// @license      MIT
// ==/UserScript==

/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 31:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   c: function() { return /* binding */ EVT; },
/* harmony export */   l: function() { return /* binding */ EventBus; }
/* harmony export */ });
const _listeners = {};

const EventBus = {
    emit(event, payload = {}) {
        (_listeners[event] || []).forEach(fn => {
            try { fn(payload); } catch (e) {
                console.error(`[EventBus] Listener error on "${event}":`, e);
            }
        });
    },
    on(event, fn) {
        if (!_listeners[event]) _listeners[event] = [];
        if (_listeners[event].length >= 20) {
            console.warn(`[EventBus] Warning: "${event}" has ${_listeners[event].length + 1} listeners — possible leak`);
        }
        if (_listeners[event].length >= 50) {
            console.error(`[EventBus] Rejecting listener: "${event}" has ${_listeners[event].length} listeners — hard cap reached`);
            return () => {}; // no-op unsubscribe
        }
        if (!_listeners[event].includes(fn)) {
            _listeners[event].push(fn);
        }
        // 등록 해제 함수를 반환하여 메모리 누수 방지
        return () => this.off(event, fn);
    },
    off(event, fn) {
        _listeners[event] = (_listeners[event] || []).filter(f => f !== fn);
    },
    async request(event, payload = {}, timeoutMs = 8000) {
        const requestId = Math.random().toString(36).substring(2, 11);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`[EventBus Timeout] ${timeoutMs / 1000}초 동안 응답이 없어 요청이 중단되었습니다. (Event: ${event})`));
            }, timeoutMs);

            const unsubscribe = this.on(`${event}:response:${requestId}`, (res) => {
                cleanup();
                if (res.ok) resolve(res.data);
                else reject(new Error(res.error || '알 수 없는 오류'));
            });

            function cleanup() {
                clearTimeout(timer);
                unsubscribe();
            }

            this.emit(event, { ...payload, _requestId: requestId });
        });
    },
    respond(event, requestId, responsePayload = { ok: true, data: {} }) {
        this.emit(`${event}:response:${requestId}`, responsePayload);
    }
};

// ── 표준 이벤트 상수 ─────────────────────────────────────────
// Service → UI 방향
const EVT = {
    LOG:            'log',            // { msg, level, tag } → LogBox에 출력
    NOTIFY_ERROR:   'notify:error',   // { msg } → alert() 대체
    UPDATE_PROGRESS: 'update:progress', // UI 진행 상황 강제 업데이트 신호
    OPEN_DASHBOARD: 'ui:open_dashboard',     // 대시보드 팝업 열기 요청
    CLOSE_DASHBOARD: 'ui:close_dashboard',   // 대시보드 팝업 닫기 요청
    TOGGLE_DASHBOARD: 'ui:toggle_dashboard', // 대시보드 팝업 토글 요청

    // ── Queue → Core 방향 ─────────────────────────────────
    QUEUE_TOGGLE_PAUSE: 'queue:toggle_pause', // 일시정지/재개
    QUEUE_STOP_ALL:     'queue:stop_all',    // 전체 중단
    QUEUE_CLEAR:        'queue:clear',      // 완료 항목 정리
    QUEUE_RESET:        'queue:reset',      // 대기열 전체 초기화
    QUEUE_REMOVE_ITEM:  'queue:remove_item', // 개별 항목 제거
    QUEUE_ITEM_UPDATE:  'queue:item_update', // 큐 아이템 상태 갱신 (Write Monopoly 준수)

    // ── FormEditor → Core/Parser 방향 ─────────────────────
    PARSE_VERIFY:       'parse:verify',     // 셀렉터 검증 요청
    PARSE_TEST:         'parse:test',       // 추출 테스트 요청
    RULE_CACHE_CLEAR:   'rule:cache_clear', // 파서 캐시 무효화
};


/***/ }),

/***/ 302:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   $8: function() { return /* binding */ initQueueScheduler; },
/* harmony export */   EB: function() { return /* binding */ setQueuePaused; },
/* harmony export */   G8: function() { return /* binding */ getQueueItemId; },
/* harmony export */   Gg: function() { return /* binding */ updateQueueItem; },
/* harmony export */   HO: function() { return /* binding */ stopAllWorkers; },
/* harmony export */   IS: function() { return /* binding */ getQueue; },
/* harmony export */   WB: function() { return /* binding */ WORKER_STAGE; },
/* harmony export */   d$: function() { return /* binding */ removeQueueItem; },
/* harmony export */   gi: function() { return /* binding */ runSchedulerOnce; },
/* harmony export */   id: function() { return /* binding */ addEpisodesToQueue; },
/* harmony export */   kZ: function() { return /* binding */ getQueuePaused; },
/* harmony export */   lg: function() { return /* binding */ clearQueue; },
/* harmony export */   mR: function() { return /* binding */ activeWorkers; },
/* harmony export */   xx: function() { return /* binding */ _activeProcessing; },
/* harmony export */   zX: function() { return /* binding */ getQueueStats; }
/* harmony export */ });
/* unused harmony exports updateQueueItemProgress, removeCompletedAndFailedItems */
/* harmony import */ var _EventBus_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(31);
/**
 * tokiSync v1.21.0 - Persistent Multi-Queue Batch Core
 * 영속성 디스크 큐 및 이벤트 기반 세마포어 스케줄러 엔진
 */



const WORKER_STAGE = {
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
const activeWorkers = new Map();
const closedCounts = new Map(); // Track closed counts for liveness check independently to avoid polluting activeWorkers window references

// handleBatchSuccess 진행 중인 아이템 추적 (팝업은 닫혔지만 CBZ/업로드 진행 중)
const _activeProcessing = new Set();

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
    _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.UPDATE_PROGRESS);
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
const getQueueItemId = (title, episodeNum) => {
  const hashPart = tokiHash(`${title}_${episodeNum}`);
  return `toki_${hashPart}`;
};


/**
 * 대기열 전체 목록 조회
 */
const getQueue = () => {
  return getRawQueue();
};

/**
 * 에피소드 대기열 다중 추가
 */
const addEpisodesToQueue = (episodes, novelTitle) => {
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
const updateQueueItem = (id, updates) => {
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
const updateQueueItemProgress = (id, percent) => {
  const sanitizedPercent = Math.min(100, Math.max(0, Math.round(percent)));
  return updateQueueItem(id, { progressPercent: sanitizedPercent });
};

/**
 * 대기열 전체 초기화
 */
const clearQueue = () => {
  saveRawQueue([]);
};

/**
 * 특정 큐 아이템을 대기열에서 개별 제거
 * 만약 진행 중인(processing) 아이템이라면 활성 자식 팝업을 강제 폐쇄 처리
 */
const removeQueueItem = (id) => {
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
const removeCompletedAndFailedItems = () => {
  const queue = getRawQueue();
  const filtered = queue.filter(item => item.status !== 'completed' && item.status !== 'failed');
  saveRawQueue(filtered);
};

/**
 * 현재 대기열의 상태별 카운트 통계 조회
 */
const getQueueStats = () => {
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
const getQueuePaused = () => {
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
const setQueuePaused = (paused) => {
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
const stopAllWorkers = (shouldClear = false) => {
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
const runSchedulerOnce = async () => {
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
const initQueueScheduler = () => {
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
  _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.on(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.QUEUE_ITEM_UPDATE, ({ id, updates }) => {
    updateQueueItem(id, updates);
  });
};


/***/ }),

/***/ 330:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   v: function() { return /* binding */ SubscriptionManager; }
/* harmony export */ });
/* harmony import */ var _RuleManager_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(543);
/* harmony import */ var _config_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(899);
/**
 * SubscriptionManager for TokiSync
 * Manages remote parser rule subscriptions stored in GM storage.
 * Subscribed rules are merged into TOKI_PARSER_RULES with _subscribed marker.
 */




const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24h

class SubscriptionManager {

    static getSubscriptions() {
        if (typeof GM_getValue === 'undefined') return [];
        const raw = GM_getValue(_config_js__WEBPACK_IMPORTED_MODULE_1__/* .CFG_RULE_SUBSCRIPTIONS */ .NY, '[]');
        try { return JSON.parse(raw) || []; } catch (e) { return []; }
    }

    static saveSubscriptions(subs) {
        if (typeof GM_setValue === 'undefined') return;
        GM_setValue(_config_js__WEBPACK_IMPORTED_MODULE_1__/* .CFG_RULE_SUBSCRIPTIONS */ .NY, JSON.stringify(subs, null, 2));
    }

    static addSubscription(url, name) {
        const subs = this.getSubscriptions();
        if (subs.some(s => s.url === url)) return { ok: false, reason: '이미 등록된 URL입니다' };
        subs.push({ url, name, enabled: true, lastFetched: null, etag: null, lastModified: null });
        this.saveSubscriptions(subs);
        return { ok: true };
    }

    static removeSubscription(url) {
        const subs = this.getSubscriptions().filter(s => s.url !== url);
        this.saveSubscriptions(subs);
        // Remove rules that came from this subscription
        const rules = _RuleManager_js__WEBPACK_IMPORTED_MODULE_0__/* .RuleManager */ .u.getParserRules();
        const filtered = rules.filter(r => r._subscribed !== url);
        _RuleManager_js__WEBPACK_IMPORTED_MODULE_0__/* .RuleManager */ .u.saveParserRules(filtered);
    }

    static async fetchSingle(sub) {
        const url = sub.url;
        return new Promise((resolve, reject) => {
            const headers = {};
            if (sub.etag) headers['If-None-Match'] = sub.etag;
            if (sub.lastModified) headers['If-Modified-Since'] = sub.lastModified;

            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers,
                timeout: 15000,
                onload: (res) => {
                    if (res.status === 304) {
                        resolve({ status: 'unchanged' });
                        return;
                    }
                    if (res.status < 200 || res.status >= 300) {
                        reject(new Error(`HTTP ${res.status}`));
                        return;
                    }
                    try {
                        const parsed = JSON.parse(res.responseText);
                        const rules = Array.isArray(parsed) ? parsed : (parsed.rules || []);
                        if (!Array.isArray(rules) || rules.length === 0) {
                            reject(new Error('유효한 규칙이 없습니다'));
                            return;
                        }
                        // Get response headers for caching
                        const etag = (res.responseHeaders.match(/etag:\s*([^\r\n]+)/i) || [])[1]?.trim() || null;
                        const lastModified = (res.responseHeaders.match(/last-modified:\s*([^\r\n]+)/i) || [])[1]?.trim() || null;

                        resolve({ status: 'updated', rules, etag, lastModified });
                    } catch (e) {
                        reject(new Error('JSON 파싱 실패'));
                    }
                },
                onerror: () => reject(new Error('네트워크 오류')),
                ontimeout: () => reject(new Error('타임아웃'))
            });
        });
    }

    static async checkAll() {
        const subs = this.getSubscriptions();
        const results = [];

        for (const sub of subs) {
            if (!sub.enabled) continue;

            // Skip if checked within 24h
            if (sub.lastFetched && (Date.now() - sub.lastFetched) < CHECK_INTERVAL) {
                results.push({ url: sub.url, status: 'skipped' });
                continue;
            }

            try {
                const result = await this.fetchSingle(sub);

                if (result.status === 'unchanged') {
                    sub.lastFetched = Date.now();
                    results.push({ url: sub.url, status: 'unchanged' });
                } else {
                    // Merge into TOKI_PARSER_RULES
                    this.mergeRules(result.rules, sub.url);
                    sub.lastFetched = Date.now();
                    sub.etag = result.etag || sub.etag;
                    sub.lastModified = result.lastModified || sub.lastModified;
                    results.push({ url: sub.url, status: 'updated', count: result.rules.length });
                }
            } catch (err) {
                sub.lastFetched = Date.now() - 86400000 + 300000; // 5min cooldown instead of 24h
                results.push({ url: sub.url, status: 'error', error: err.message });
            }
        }

        this.saveSubscriptions(subs);
        return results;
    }

    static mergeRules(remoteRules, sourceUrl) {
        const current = _RuleManager_js__WEBPACK_IMPORTED_MODULE_0__/* .RuleManager */ .u.getParserRules();
        const version = _RuleManager_js__WEBPACK_IMPORTED_MODULE_0__/* .RuleManager */ .u._version;
        let added = 0, updated = 0, skipped = 0;

        remoteRules.forEach(remote => {
            if (!remote.id) { skipped++; return; }
            // Ensure _version on incoming rules
            if (!remote._version) remote._version = version;
            remote._subscribed = sourceUrl;

            const idx = current.findIndex(r => r.id === remote.id);
            if (idx === -1) {
                current.push(remote);
                added++;
            } else {
                const existing = current[idx];
                if (existing._subscribed === sourceUrl || !existing._subscribed) {
                    current[idx] = remote;
                    updated++;
                } else {
                    skipped++;
                }
            }
        });

        _RuleManager_js__WEBPACK_IMPORTED_MODULE_0__/* .RuleManager */ .u.saveParserRules(current);
        return { added, updated, skipped };
    }

    static async checkOnce() {
        // Called on page load — runs silently in background
        try {
            const results = await this.checkAll();
            const updated = results.filter(r => r.status === 'updated');
            const errors = results.filter(r => r.status === 'error');
            if (updated.length > 0) {
                console.log(`[Subscription] ${updated.length}개 구독 업데이트 완료`);
            }
            if (errors.length > 0) {
                console.warn(`[Subscription] ${errors.length}개 구독 실패:`, errors.map(e => e.error));
            }
        } catch (e) {
            console.warn('[Subscription] 체크 중 오류:', e);
        }
    }
}


/***/ }),

/***/ 391:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   GA: function() { return /* binding */ fetchHistoryDirect; },
/* harmony export */   OS: function() { return /* binding */ checkSingleHistoryDirect; },
/* harmony export */   Py: function() { return /* binding */ getOAuthToken; },
/* harmony export */   aj: function() { return /* binding */ getOrCreateFolder; },
/* harmony export */   r9: function() { return /* binding */ uploadDirect; }
/* harmony export */ });
/* harmony import */ var _config_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(899);
/* harmony import */ var _EventBus_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(31);
/* harmony import */ var _logger_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(569);
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(924);
/**
 * Direct Drive Access Module
 * Bypasses GAS relay for high-speed uploads using GM_xmlhttpRequest
 */







let cachedToken = null;
let tokenExpiry = 0;

/**
 * Fetches OAuth token from GAS server
 * @returns {Promise<string>} Access token
 */
async function fetchToken() {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    
    console.log('[DirectUpload] Fetching token from GAS...');
    console.log('[DirectUpload] GAS URL:', config.gasUrl);
    
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: config.gasUrl,
            data: JSON.stringify({
                folderId: config.folderId,
                type: 'view_get_token',
                apiKey: config.apiKey,
                protocolVersion: 3
            }),
            headers: { 'Content-Type': 'text/plain' },
            timeout: 30000,
            onload: (response) => {
                console.log('[DirectUpload] Token response status:', response.status);
                console.log('[DirectUpload] Token response text:', response.responseText);
                
                try {
                    const result = JSON.parse(response.responseText);
                    console.log('[DirectUpload] Parsed result:', result);
                    
                    if (result.status === 'success') {
                        console.log('[DirectUpload] Token received successfully');
                        resolve(result.body.token);
                    } else {
                        console.error('[DirectUpload] Token fetch failed:', result.error);
                        console.error('[DirectUpload] Debug logs:', result.logs);
                        _logger_js__WEBPACK_IMPORTED_MODULE_2__.logger.error(`Token fetch failed: ${result.error}`, 'Network:Auth');
                        reject(new Error(result.error || 'Token fetch failed'));
                    }
                } catch (e) {
                    console.error('[DirectUpload] JSON parse error:', e);
                    console.error('[DirectUpload] Raw response:', response.responseText);
                    reject(new Error(`Token parse error: ${e.message}`));
                }
            },
            onerror: (error) => {
                console.error('[DirectUpload] Request error:', error);
                _logger_js__WEBPACK_IMPORTED_MODULE_2__.logger.error('Token request network error', 'Network:Auth');
                reject(new Error('Token request failed'));
            },
            ontimeout: () => {
                console.error('[DirectUpload] Token request timed out (30s)');
                _logger_js__WEBPACK_IMPORTED_MODULE_2__.logger.error('Token request timed out (30s)', 'Network:Auth');
                reject(new Error('[DirectUpload] 토큰 요청 타임아웃 (30초)'));
            }
        });
    });
}

/**
 * Gets OAuth token with caching (1 hour TTL)
 * @returns {Promise<string>} Access token
 */
async function getToken() {
    const now = Date.now();
    
    // Return cached token if still valid (with 5min safety margin)
    if (cachedToken && tokenExpiry > now + 300000) {
        console.log('[DirectUpload] Using cached token');
        return cachedToken;
    }
    
    console.log('[DirectUpload] Fetching new token...');
    cachedToken = await fetchToken();
    tokenExpiry = now + 3600000; // 1 hour
    
    return cachedToken;
}

/**
 * Finds or creates a series folder directly in the root. (Kavita 호환 플랫 구조)
 * 카테고리(Webtoon/Novel/Manga) 폴더는 더 이상 생성하지 않습니다.
 */
async function getOrCreateFolder(folderName, parentId, token, _category) {
    // Search by name or [ID] prefix in root
    const idMatch = folderName.match(/^\[([a-zA-Z0-9_\-]+)\]/);
    const idPrefix = idMatch ? idMatch[0] : null;
    
    let queryPart = "";
    if (idPrefix) {
        queryPart = `name contains '${idPrefix}'`;
    } else {
        queryPart = `name = '${folderName.replace(/'/g, "\\'")}'`; 
    }

    const fullQuery = `${queryPart} and '${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=${encodeURIComponent(fullQuery)}` +
        `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    
    const searchResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: searchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000,
            onload: (res) => {
                try { resolve(JSON.parse(res.responseText)); }
                catch (e) { reject(e); }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 폴더 검색 타임아웃'))
        });
    });
    
    if (searchResult.files && searchResult.files.length > 0) {
        const found = idPrefix
            ? searchResult.files.find(f => f.name.startsWith(idPrefix))
            : searchResult.files[0];
        if (found) {
            console.log(`[DirectUpload] Folder found: ${found.name} (ID: ${found.id})`);
            return found.id;
        }
    }
    
    // Create series folder in root
    console.log(`[DirectUpload] Creating series folder: ${folderName}`);
    const createResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            }),
            timeout: 30000,
            onload: (res) => {
                try { resolve(JSON.parse(res.responseText)); }
                catch (e) { reject(e); }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 폴더 생성 타임아웃'))
        });
    });
    
    return createResult.id;
}

/**
 * Finds or creates the centralized '_Thumbnails' folder
 */
async function getOrCreateThumbnailFolder(token, parentId) {
    const thumbName = '_Thumbnails';
    const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=name='${thumbName}' and '${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'` +
        `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    
    const result = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: searchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000,
            onload: (res) => resolve(JSON.parse(res.responseText)),
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 썸네일 폴더 검색 타임아웃 (30초)'))
        });
    });

    if (result.files && result.files.length > 0) {
        return result.files[0].id; // Found
    }

    // Create
    console.log(`[DirectUpload] Creating folder: ${thumbName}`);
    const createResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                name: thumbName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            }),
            timeout: 30000,
            onload: (res) => resolve(JSON.parse(res.responseText)),
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 썸네일 폴더 생성 타임아웃 (30초)'))
        });
    });
    return createResult.id;
}

/**
 * Sends data in chunks to a Google Drive Resumable Upload session
 */
async function sendResumableChunks(uploadUrl, blob, token, fileName) {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB (Minimum for Drive is 256KB, 5MB is standard)
    const totalSize = blob.size;
    let start = 0;

    while (start < totalSize) {
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunk = blob.slice(start, end);
        const contentRange = `bytes ${start}-${end - 1}/${totalSize}`;
        
        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'PUT',
                url: uploadUrl,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Range': contentRange,
                    'Content-Type': blob.type || 'application/octet-stream'
                },
                data: chunk,
                binary: true,
                timeout: 300000, // 5 minutes per chunk
                onload: (res) => {
                    if (res.status === 308) {
                        // Resume Incomplete (Standard Response for chunks)
                        resolve();
                    } else if (res.status >= 200 && res.status < 300) {
                        // Done (Final chunk)
                        resolve();
                    } else {
                        reject(new Error(`Chunk upload failed: ${res.status} ${res.responseText}`));
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error(`Chunk upload timed out: ${contentRange}`))
            });
        });
        
        start = end;
        const progress = Math.min(100, Math.floor((start / totalSize) * 100));
        console.log(`[DirectUpload] ${fileName} -> ${progress}% (${start}/${totalSize})`);
        _EventBus_js__WEBPACK_IMPORTED_MODULE_1__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_1__/* .EVT */ .c.LOG, {
            msg: `☁️ [${fileName}] Drive 업로드 중... ${progress}% (${Math.floor(start / 1024 / 1024)}MB / ${Math.floor(totalSize / 1024 / 1024)}MB)`,
            level: 'info',
            tag: 'Upload'
        });
    }
}

/**
 * Uploads file directly to Google Drive using Resumable Upload (5MB Chunks)
 */
async function uploadDirect(blob, folderName, fileName, metadata = {}) {
    try {
        console.log(`[DirectUpload] Preparing: ${fileName} (${blob.size} bytes)`);
        
        const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
        const token = await getToken();
        
        // 1. Get Series Folder ID
        let seriesFolderId = metadata.folderId;
        if (!seriesFolderId) {
            let parentFolderId = config.folderId;
            const isDriveOrKavita = (metadata.destination === 'drive' || metadata.destination === 'drive_kavita');
            if (isDriveOrKavita) {
                const categoryFolder = metadata.category || 'Webtoon';
                parentFolderId = await getOrCreateFolder(categoryFolder, config.folderId, token);
            }
            seriesFolderId = await getOrCreateFolder(folderName, parentFolderId, token);
        }
        
        let targetFolderId = seriesFolderId;
        let finalFileName = fileName;

        // 2. [v1.4.0] Centralized Thumbnail Logic
        if (fileName === 'cover.jpg' || fileName === 'Cover.jpg') {
            const idMatch = folderName.match(/^\[(\d+)\]/);
            if (idMatch) {
                const seriesId = idMatch[1];
                finalFileName = `${seriesId}.jpg`;
                targetFolderId = await getOrCreateThumbnailFolder(token, config.folderId);
            }
        }

        // 3. Search for existing file to decide POST (New) or PATCH (Update)
        let existingFileId = null;
        try {
            const q = `name='${finalFileName.replace(/'/g, "\\'")}' and '${targetFolderId}' in parents and trashed=false`;
            const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
                `q=${encodeURIComponent(q)}` +
                `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
            
            const searchRes = await new Promise((res, rej) => {
                GM_xmlhttpRequest({
                    method: 'GET', url: searchUrl,
                    headers: { 'Authorization': `Bearer ${token}` },
                    timeout: 30000,
                    onload: (r) => res(JSON.parse(r.responseText)),
                    onerror: rej
                });
            });
            
            if (searchRes.files && searchRes.files.length > 0) {
                existingFileId = searchRes.files[0].id;
                console.log(`[DirectUpload] Existing file found: ${existingFileId} (Mode: UPDATE)`);
            }
        } catch (searchErr) {
            console.warn('[DirectUpload] Existing file check failed:', searchErr);
        }

        // 4. Initialize Resumable Session
        let uploadUrl = "";
        const sessionMetadata = {
            name: finalFileName,
            parents: existingFileId ? undefined : [targetFolderId]
        };

        const sessionUrl = existingFileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=resumable&supportsAllDrives=true`
            : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true`;

        uploadUrl = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: existingFileId ? 'PATCH' : 'POST',
                url: sessionUrl,
                anonymous: true, // Bypass CORS Origin header to ensure Location header is visible
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': blob.type || 'application/octet-stream',
                    'X-Upload-Content-Length': blob.size.toString()
                },
                data: JSON.stringify(sessionMetadata),
                timeout: 30000,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        const locationMatch = res.responseHeaders.match(/location:\s*([^\r\n]+)/i);
                        const uploadIdMatch = res.responseHeaders.match(/x-guploader-uploadid:\s*([^\r\n]+)/i);
                        
                        if (locationMatch && locationMatch[1]) {
                            resolve(locationMatch[1].trim());
                        } else if (uploadIdMatch && uploadIdMatch[1]) {
                            // Fallback: Manually build URI if Location is stripped by CORS
                            const sessionUri = new URL(sessionUrl);
                            sessionUri.searchParams.set('upload_id', uploadIdMatch[1].trim());
                            resolve(sessionUri.toString());
                        } else {
                            console.error('[DirectUpload] Response Headers:', res.responseHeaders);
                            console.error('[DirectUpload] Response Body:', res.responseText);
                            reject(new Error(`Failed to extract session URL. Headers: ${res.responseHeaders}`));
                        }
                    } else {
                        reject(new Error(`Session init failed with status: ${res.status}`));
                    }
                },
                onerror: reject
            });
        });

        // 5. Send chunks
        await sendResumableChunks(uploadUrl, blob, token, finalFileName);
        console.log(`[DirectUpload] ✅ Upload successful: ${finalFileName}`);
        return;

    } catch (error) {
        console.error(`[DirectUpload] Error:`, error);
        _logger_js__WEBPACK_IMPORTED_MODULE_2__.logger.error(`[DirectUpload] ${error.message}`, 'Network:Upload');
        throw error;
    }
}

// Export helper for main.js migration
const getOAuthToken = getToken;

/**
 * [v1.7.4] Direct History Fetch with Size Heuristic
 * Bypasses GAS relay and directly queries the Google Drive API for the series folder.
 * Automatically filters out corrupted/incomplete files using the `(Max + Min) / 2 * 0.5` heuristic.
 * 
 * @param {string} seriesTitle 
 * @param {string} category 
 * @returns {Promise<{success: boolean, folderId: string|null, data: string[]}>} Object with valid episode IDs
 */
async function fetchHistoryDirect(seriesTitle, category = 'Webtoon') {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!config.folderId) return { success: false, folderId: null, data: [] };

    let currentSeriesFolderId = null;

    try {
        console.log(`[DirectHistory] Fetching history for: ${seriesTitle} (${category})`);
        const token = await getToken();
        
        const isDriveOrKavita = (config.policy === 'drive' || config.policy === 'drive_kavita');
        let parentFolderId = config.folderId;
        if (isDriveOrKavita) {
            parentFolderId = await getOrCreateFolder(category, config.folderId, token);
        }

        // Find the Series Folder ID
        currentSeriesFolderId = await getOrCreateFolder(seriesTitle, parentFolderId, token);
        
        if (!currentSeriesFolderId) {
            console.log(`[DirectHistory] Series folder not found or created.`);
            return { success: true, folderId: null, data: [] };
        }

        const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
            `q='${currentSeriesFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'` +
            `&fields=files(id,name,size)` +
            `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
            
        const result = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: searchUrl,
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 30000,
                onload: (res) => {
                    try { resolve(JSON.parse(res.responseText)); } 
                    catch (e) { reject(e); }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('[DirectHistory] Timeout'))
            });
        });

        if (!result.files || result.files.length === 0) {
            console.log(`[DirectHistory] No files found in folder.`);
            return { success: true, folderId: currentSeriesFolderId, data: [] };
        }

        const fileInfos = [];
        let maxSize = 0;
        let minSize = Infinity;

        result.files.forEach(file => {
            const episodeNum = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__/* .extractEpisodeNum */ .Px)(file.name);

            if (!episodeNum) return;
            
            const sizeBytes = parseInt(file.size || "0", 10); 
            
            if (sizeBytes > 0) {
                if (sizeBytes > maxSize) maxSize = sizeBytes;
                if (sizeBytes < minSize) minSize = sizeBytes;
            }

            fileInfos.push({
                num: episodeNum,
                name: file.name,
                size: sizeBytes
            });
        });

        if (fileInfos.length === 0) return { success: true, folderId: currentSeriesFolderId, data: [] };

        let threshold = 0;
        if (maxSize > 0 && fileInfos.length > 1) {
            const ratio = (config.smartSkipRatio !== undefined ? config.smartSkipRatio : 50) / 100;
            threshold = maxSize * ratio;
            _logger_js__WEBPACK_IMPORTED_MODULE_2__.logger.log(`[SmartSkip] 용량 분석 완료 - Max: ${(maxSize/1024/1024).toFixed(1)}MB, 통과 기준: ${config.smartSkipRatio || 50}% (${(threshold/1024/1024).toFixed(1)}MB 이상)`);
        }

        const validEpisodes = [];
        const ignoredEpisodes = [];

        fileInfos.forEach(info => {
            if (info.size >= threshold) {
                validEpisodes.push(info.num);
            } else {
                ignoredEpisodes.push(info.name);
            }
        });

        if (ignoredEpisodes.length > 0) {
            _logger_js__WEBPACK_IMPORTED_MODULE_2__.logger.warn(`[SmartSkip] ⚠️ 용량 미달(손상 의심)로 무시된 파일 ${ignoredEpisodes.length}개 (재다운로드 됨): \n - ${ignoredEpisodes.slice(0, 3).join('\n - ')}${ignoredEpisodes.length > 3 ? '\n - ...' : ''}`);
        }

        console.log(`[DirectHistory] Final valid episodes: ${validEpisodes.length}`);
        return { 
            success: true, 
            folderId: currentSeriesFolderId, 
            data: [...new Set(validEpisodes)].sort((a,b) => parseInt(a) - parseInt(b))
        };

    } catch (err) {
        console.error(`[DirectHistory] Failed:`, err);
        _logger_js__WEBPACK_IMPORTED_MODULE_2__.logger.warn(`기록 전체 조회 실패(플래그 활성화됨): ${err.message}`, 'Network:History');
        return { success: false, folderId: currentSeriesFolderId, data: [] };
    }
}

/**
 * [v1.7.4] Targeted Single Episode Check
 * Used as a fallback when fetchHistoryDirect fails (e.g. timeout on huge folders).
 * 
 * @param {string} folderId 
 * @param {string} episodeNumStr 
 * @returns {Promise<boolean>} True if the episode file already exists
 */
async function checkSingleHistoryDirect(folderId, episodeNumStr) {
    if (!folderId) return false;
    
    try {
        const token = await getToken();
        // Since we don't know the full exact title, we query for the number.
        // Google Drive API tokenizes queries, so querying for the number works.
        const query = `name contains '${episodeNumStr}'`;
        
        const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
            `q=${encodeURIComponent(query)} and '${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'` +
            `&fields=files(id,size,name)` +
            `&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`; // Safe margin if multiple files contain the number
            
        const result = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: searchUrl,
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 5000,
                onload: (res) => {
                    try { resolve(JSON.parse(res.responseText)); } 
                    catch (e) { reject(e); }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Timeout'))
            });
        });

        if (result.files && result.files.length > 0) {
            // Strict filter clientside: 다양한 파일명 규칙에서 추출한 번호가 매칭되는지 확인
            const file = result.files.find(f => {
                const episodeNum = (0,_utils_js__WEBPACK_IMPORTED_MODULE_3__/* .extractEpisodeNum */ .Px)(f.name);

                return episodeNum && parseInt(episodeNum, 10) === parseInt(episodeNumStr, 10);
            });
            if (file && parseInt(file.size || "0", 10) > 1000) { // arbitrary small size check (1KB)
                return true;
            }
        }
    } catch (e) {
        console.warn(`[SingleCheck] Error checking ${episodeNumStr}:`, e);
    }
    return false;
}



/***/ }),

/***/ 409:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   I: function() { return /* binding */ TxtBuilder; }
/* harmony export */ });
/* harmony import */ var _EventBus_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(31);
/**
 * 소설 본문의 HTML 태그를 제거하고 가독성 좋게 줄바꿈을 문단 단위로 정제하는 함수
 */
function cleanNovelParagraphs(html) {
    if (!html) return "";

    // 1. HTML 태그를 줄바꿈 및 공백으로 치환
    let text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<(?:\/?(?:br|p|div|span|a|b|strong|i|em|u|font|img|style|script)(?:\s+[^>]*)?)>/gi, ''); // 나머지 HTML 태그 완전 제거

    // 2. HTML 엔티티 치환
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');

    // 3. 각 줄의 좌우 공백 트리밍 및 유령 문자 정리
    text = text
        .split('\n')
        .map(line => line.trim())
        .join('\n');

    // 4. 3개 이상 과도한 연속 줄바꿈을 2개(\n\n, 빈 줄 1개)로 제한
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
}



class TxtBuilder {
    constructor() {
        this.content = "";
    }

    addChapter(title, textContent) {
        this.content += `\n\n=== ${title} ===\n\n`;
        this.content += cleanNovelParagraphs(textContent);
    }

    async build(metadata = {}) {
        try {
            // Return an object that duck-types JSZip's generateAsync
            return {
                generateAsync: async () => {
                    // Prepend metadata title at the top if available
                    let finalContent = this.content;
                    if (metadata.title) {
                        finalContent = `[ ${metadata.title} ]\n` + finalContent;
                    }
                    return new Blob([finalContent], { type: 'text/plain;charset=utf-8' });
                }
            };
        } catch (e) {
            _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.LOG, { msg: `TXT 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, level: 'critical', tag: 'Builder:TXT' });
            throw e;
        }
    }
}


/***/ }),

/***/ 416:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   $: function() { return /* binding */ CbzBuilder; }
/* harmony export */ });

class CbzBuilder {
    constructor() {
        this.chapters = [];
    }

    addChapter(title, images) {
        // images: array of { blob, ext }
        this.chapters.push({ title, images });
    }

    async build(metadata = {}) {
        try {
            const zip = new JSZip();
            
            // Kavita Compatibility: Images at root, no subfolders
            // Note: As per new strategy, we only build one chapter per CBZ.
            this.chapters.forEach((chapter) => {
                chapter.images.forEach((img, idx) => {
                    if (img && img.blob) {
                        const filename = img.isMissing 
                            ? `[PAGE_MISSING]_image_${String(idx).padStart(4, '0')}${img.ext}`
                            : `image_${String(idx).padStart(4, '0')}${img.ext}`;
                        zip.file(filename, img.blob);
                    }
                });
            });

            const comicInfo = this.generateComicInfo(metadata);
            zip.file("ComicInfo.xml", comicInfo);

            return zip;
        } catch (e) {
            const { logger } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 569));
            logger.critical(`CBZ 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, 'Builder:CBZ');
            throw e;
        }
    }

    generateComicInfo(metadata) {
        const series = metadata.series || "Unknown Series";
        const title = metadata.title || "";
        const number = metadata.number || "";
        const writer = metadata.writer || "";
        const pageCount = this.chapters.reduce((acc, chap) => acc + chap.images.length, 0);

        return `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Series>${this.escapeXml(series)}</Series>
  <Number>${number}</Number>
  <Title>${this.escapeXml(title)}</Title>
  <Writer>${this.escapeXml(writer)}</Writer>
  <LanguageISO>ko</LanguageISO>
  <PageCount>${pageCount}</PageCount>
  <Manga>YesAndRightToLeft</Manga>
</ComicInfo>`;
    }

    escapeXml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe).replace(/[<>&"']/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '"': return '&quot;';
                case "'": return '&apos;';
                default: return c;
            }
        });
    }
}


/***/ }),

/***/ 443:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  GenericParser: function() { return /* binding */ GenericParser; }
});

;// ./src/core/parsers/BaseParser.js
/**
 * BaseParser (Abstract)
 * Provides common logic and defines interface for site-specific parsers.
 */
class BaseParser {
    constructor(protocolDomain) {
        this.protocolDomain = protocolDomain;
    }

    /**
     * Common: Dummy image detection
     */
    isDummyUrl(url) {
        if (!url) return true;
        if (url.startsWith('data:image')) return true;
        const lower = url.toLowerCase();

        // 알려진 더미 파일명 패턴
        const dummyFilenames = [
            'blank.gif', 'loading.gif', 'loading-image.gif',
            'pixel.gif', 'spacer.gif', 'transparent.gif',
            '1x1.gif', 'dot.gif',
        ];
        if (dummyFilenames.some(p => lower.includes(p))) return true;

        // 경로 기반 패턴: /img/loading*, /img/placeholder*
        if (/\/img\/loading/.test(lower)) return true;
        if (/\/img\/placeholder/.test(lower)) return true;

        return false;
    }

    /**
     * Common: Ensure URL is absolute
     */
    getAbsoluteUrl(url) {
        if (!url) return "";
        if (url.startsWith('http')) return url;
        if (url.startsWith('//')) return `https:${url}`;
        if (url.startsWith('/')) return `${this.protocolDomain}${url}`;
        return url;
    }

    /**
     * Helper: Wait for a selector to appear in the DOM
     */
    async waitForSelector(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }, timeout);
        });
    }

    /**
     * Interface: Extract list elements (li or similar)
     * @returns {HTMLElement[]}
     */
    getListItems() {
        throw new Error('getListItems() must be implemented');
    }

    /**
     * Interface: Parse single list item into normalized object
     * @param {HTMLElement} element 
     * @returns {Object} { num, title, src, element }
     */
    parseListItem(element) {
        throw new Error('parseListItem() must be implemented');
    }

    /**
     * Interface: Extract novel content from iframe
     */
    getNovelContent(iframeDocument) {
        throw new Error('getNovelContent() must be implemented');
    }

    /**
     * Interface: Extract image list for webtoon/manga
     */
    getImageList(iframeDocument) {
        throw new Error('getImageList() must be implemented');
    }

    /**
     * Interface: Extract thumbnail URL
     */
    getThumbnailUrl() {
        throw new Error('getThumbnailUrl() must be implemented');
    }

    /**
     * Interface: Extract series title
     */
    getSeriesTitle() {
        throw new Error('getSeriesTitle() must be implemented');
    }

    /**
     * Interface: Extract series metadata
     */
    getSeriesMetadata() {
        throw new Error('getSeriesMetadata() must be implemented');
    }
    /**
     * Common: Generate unified folder name / series title
     * @param {string} seriesId - Unique ID from URL
     * @param {string} firstTitle - Title of first episode in list
     * @param {string} lastTitle - Title of last episode in list
     * @param {function} getCommonPrefixFn - Callback to calculate prefix
     * @returns {string} "[ID] Title"
     */
    getFormattedTitle(seriesId, firstTitle, lastTitle, getCommonPrefixFn) {
        let seriesTitle = this.getSeriesTitle();
        let formatted = "";

        if (seriesTitle) {
            formatted = `[${seriesId}] ${seriesTitle}`;
        } else {
            // Fallback Logic
            let listPrefixTitle = "";
            if (firstTitle && lastTitle && getCommonPrefixFn) {
                listPrefixTitle = getCommonPrefixFn(firstTitle, lastTitle);
            }

            if (listPrefixTitle && listPrefixTitle.length > 2) {
                formatted = `[${seriesId}] ${listPrefixTitle}`;
            } else if (firstTitle) {
                // Single item or distinct titles: fallback to regex or full title
                const cleanTitle = firstTitle.replace(/\s+\d+화$/, '').trim();
                formatted = `[${seriesId}] ${cleanTitle || firstTitle}`;
            } else {
                formatted = `[${seriesId}] Unknown Series`;
            }
        }

        // Final cleanup for filesystem compatibility
        return formatted.replace(/[<>:"/\\|?*]/g, '').trim();
    }
}

;// ./src/core/parsers/GenericParser.js


/**
 * GenericParser
 * A dynamic parser that uses JSON rules to extract data from the DOM.
 */
class GenericParser extends BaseParser {
    /**
     * @param {string} protocolDomain 
     * @param {Object} rule - The matched JSON rule object
     * @param {Document} doc - Document context (defaults to global document)
     */
    constructor(protocolDomain, rule, doc = document) {
        super(protocolDomain);
        this.rule = rule;
        this._doc = doc;
    }

    /**
     * Helper to extract value from DOM based on rule config (String selector or { selector, attr })
     * @private
     */
    _extractValue(root, config) {
        if (!config || !root) return null;
        
        const selector = typeof config === 'string' ? config : config.selector;
        const attr = typeof config === 'object' ? config.attr : null;
        const regexStr = typeof config === 'object' ? config.regex : null;

        const el = selector
            ? (root.matches?.(selector) ? root : root.querySelector(selector))
            : root;
        if (!el) return null;

        let val = null;
        if (attr) {
            val = el.getAttribute(attr)?.trim() || null;
        } else {
            val = el.innerText?.trim() || el.textContent?.trim() || null;
        }

        if (val && regexStr) {
            try {
                const regex = new RegExp(regexStr, 'i');
                const match = val.match(regex);
                if (match) {
                    val = match[1] || match[0];
                } else {
                    val = null;
                }
            } catch (e) {
                console.warn(`[GenericParser] Invalid regex pattern: ${regexStr}`, e);
            }
        }

        return val;
    }

    /**
     * [v1.8.1] 동적 레이지 키 탐지 (Toki 등 보안 우회용)
     * @private
     */
    _detectDynamicKey(doc, config) {
        if (!config || !config.regex) return null;
        
        try {
            // 1. 스크립트 태그 우선 스캔 (성능 및 정확도 최적화)
            const scripts = doc.querySelectorAll('script');
            const regex = new RegExp(config.regex, 'i');
            
            for (const script of scripts) {
                const match = (script.textContent || "").match(regex);
                if (match) {
                    const key = match[1] || match[0];
                    console.log(`[GenericParser] 스크립트 내 동적 키 탐지 성공: ${key}`);
                    return key;
                }
            }
            
            // 2. 전체 HTML 스캔 (폴백)
            const html = doc.documentElement.innerHTML || "";
            const match = html.match(regex);
            if (match) {
                const key = match[1] || match[0];
                console.log(`[GenericParser] HTML 내 동적 키 탐지 성공: ${key}`);
                return key;
            }
        } catch (e) {
            console.warn('[GenericParser] 동적 키 탐지 중 오류 발생:', e);
        }
        return null;
    }

    /**
     * Extracts the Series ID based on JSON rule, with a robust fallback.
     */
    getSeriesId() {
        const ext = this.rule.idExtraction;
        if (ext) {
            if (ext.source === 'url' && ext.regex) {
                try {
                    const regex = new RegExp(ext.regex, 'i');
                    const match = this._doc.URL.match(regex);
                    if (match) return match[1] || match[0];
                } catch(e) {
                    console.warn('[GenericParser] Invalid idExtraction regex', e);
                }
            } else if (ext.source === 'query' && ext.param) {
                const win = this._doc.defaultView || window;
                const params = new URLSearchParams(win.location.search);
                const val = params.get(ext.param);
                if (val) return val;
            } else if (ext.source === 'dom' && ext.selector) {
                const el = this._doc.querySelector(ext.selector);
                if (el) {
                    return ext.attr ? el.getAttribute(ext.attr) : el.innerText?.trim();
                }
            }
        }
        
        // Fallback: Dynamic Category-Aware Extraction
        const category = (this.rule.category || 'webtoon').toLowerCase();
        const categorySynonyms = {
            manga: ['manga', 'manhwa', 'comic', 'toon'],
            webtoon: ['webtoon', 'toon', 'comic', 'manga', 'manhwa'],
            novel: ['novel', 'book']
        };
        const targetWords = categorySynonyms[category] || [category];
        const dynamicPattern = new RegExp(`\\/(${targetWords.join('|')})\\/([a-zA-Z0-9_\\-]+)`, 'i');
        const idMatch = this._doc.URL.match(dynamicPattern);
        let seriesId = idMatch ? idMatch[2] : null;
        if (!seriesId) {
            const win = this._doc.defaultView || window;
            const params = new URLSearchParams(win.location.search);
            seriesId = params.get('id') || params.get('no') || params.get('comic_id') || params.get('toon');
        }
        return seriesId || "0000";
    }

    async getListItems() {
        const listCfg = this.rule.list || {};
        
        // [v1.25.1] 스마트 컨테이너 검출: 동일한 셀렉터의 컨테이너가 여러 개 있을 때
        // 실제 회차 아이템(listCfg.item)을 하나 이상 가지고 있는 첫 번째 유효 컨테이너를 탐색합니다.
        let container = null;
        const containers = Array.from(this._doc.querySelectorAll(listCfg.container));
        if (containers.length > 0) {
            container = containers.find(c => c.querySelectorAll(listCfg.item).length > 0) || containers[0];
        }
        
        // [v1.8.1] 동적 로딩(Next.js 등) 대응: 컨테이너가 나타날 때까지 대기
        if (!container) {
            console.log(`[GenericParser] 컨테이너(${listCfg.container}) 대기 중...`);
            container = await this.waitForSelector(listCfg.container, 5000);
        }

        if (!container) {
            console.warn(`[GenericParser] Container not found: ${listCfg.container}`);
            return [];
        }

        const items = Array.from(container.querySelectorAll(listCfg.item));
        // Reverse if it's a typical episode list where latest is on top but we need chronological for some logic?
        // Actually, TokiParser reverses. Let's check if we should always reverse.
        // For now, return as is.
        return items;
    }

    parseListItem(el) {
        const listCfg = this.rule.list || {};
        let numRaw = "0";
        const numCfg = listCfg.num;
        if (Array.isArray(numCfg)) {
            for (const cfg of numCfg) {
                const val = this._extractValue(el, cfg);
                if (val) {
                    numRaw = val;
                    break;
                }
            }
        } else {
            numRaw = this._extractValue(el, numCfg) || "0";
        }
        const subRaw = this._extractValue(el, listCfg.sub) || "";
        const title = this._extractValue(el, listCfg.title) || "Unknown";
        const src = this._extractValue(el, listCfg.link) || "";

        // Extract numbers only for zero padding, if possible
        let num = numRaw;
        const match = numRaw.match(/(\d+)/);
        if (match) {
            num = match[1];
        }

        if (subRaw) {
            num = `${num}_${subRaw}`;
        }

        return {
            num: num,
            title: title,
            src: this.getAbsoluteUrl(src),
            element: el
        };
    }

    getNovelContent(iframeDocument) {
        const viewerCfg = this.rule.viewer || {};
        const selector = viewerCfg.novelContent || 'body';
        const el = iframeDocument.querySelector(selector);
        return el ? el.innerText : "";
    }

    getImageList(iframeDocument) {
        const viewerCfg = this.rule.viewer || {};

        // [v1.8.1] 동적 키 탐지 수행
        let dynamicLazyAttr = null;
        if (viewerCfg.keyDiscovery) {
            const key = this._detectDynamicKey(iframeDocument, viewerCfg.keyDiscovery);
            if (key) {
                dynamicLazyAttr = (viewerCfg.keyDiscovery.prefix || 'data-') + key;
            }
        }

        // 1. 헤드리스(Headless) 정규식 추출 지원 (Next.js 페이로드 등 DOM 미렌더링 대응)
        if (viewerCfg.imageRegex) {
            const html = iframeDocument.documentElement.innerHTML || iframeDocument.body.innerHTML;
            const regex = new RegExp(viewerCfg.imageRegex, 'g');
            const urls = [];
            let match;
            
            while ((match = regex.exec(html)) !== null) {
                // 캡처 그룹이 있으면 그것을, 없으면 전체 매치(match[0])를 사용
                let url = match[1] || match[0];
                url = url.replace(/\\/g, ''); // 불필요한 이스케이프 백슬래시(\) 제거
                
                if (!this.isDummyUrl(url)) {
                    urls.push(this.getAbsoluteUrl(url));
                }
            }
            
            // 중복 제거 후 리턴 (정규식 특성상 중복 캡처 가능성 높음)
            const uniqueUrls = Array.from(new Set(urls));
            if (uniqueUrls.length > 0) {
                console.log(`[GenericParser] Regex 기반 이미지 추출 성공: ${uniqueUrls.length}개 발견`);
                return uniqueUrls.map(url => ({ url, isDummy: false }));
            } else {
                console.warn(`[GenericParser] Regex 설정이 있으나 매칭되는 이미지를 찾지 못했습니다.`);
            }
        }

        // 2. DOM 기반 추출 (기본)
        let container = iframeDocument;
        if (viewerCfg.imageContainer) {
            container = iframeDocument.querySelector(viewerCfg.imageContainer);
            if (!container) {
                console.warn(`[GenericParser] 지정된 imageContainer(${viewerCfg.imageContainer})를 DOM에서 찾지 못했습니다.`);
                return [];
            }
        }

        // [v1.9.5] 광고 및 불필요 요소 제거 (exclude / remove)
        const excludeRule = viewerCfg.exclude || viewerCfg.remove;
        if (excludeRule) {
            const excludeSelectors = Array.isArray(excludeRule) ? excludeRule : [excludeRule];
            for (const selector of excludeSelectors) {
                try {
                    const targets = container.querySelectorAll(selector);
                    targets.forEach(el => el.remove());
                } catch (e) {
                    console.warn(`[GenericParser] 요소 제거 실패 (셀렉터: ${selector}):`, e);
                }
            }
        }

        const imgs = Array.from(container.querySelectorAll(viewerCfg.imageItem || 'img'));

        return imgs.map(img => {
            let foundUrl = null;
            // [v1.8.1] 동적 키가 발견되면 최우선 순위로 설정하여 탐지 성공률 극대화
            const lazyAttrs = [
                ...(dynamicLazyAttr ? [dynamicLazyAttr] : []),
                ...(viewerCfg.lazyAttrOptions || ['data-src', 'data-lazy', 'src'])
            ];

            for (const attr of lazyAttrs) {
                const val = img.getAttribute(attr);
                if (val) {
                    const absoluteUrl = this.getAbsoluteUrl(val);
                    if (absoluteUrl && !this.isDummyUrl(absoluteUrl)) {
                        foundUrl = absoluteUrl;
                        break;
                    }
                }
            }

            const finalUrl = foundUrl || this.getAbsoluteUrl(img.src) || "";
            return {
                url: finalUrl,
                isDummy: this.isDummyUrl(finalUrl)
            };
        });
    }

    getThumbnailUrl() {
        const meta = this.rule.meta || {};
        const thumb = this._extractValue(this._doc, meta.thumb);
        return thumb ? this.getAbsoluteUrl(thumb) : null;
    }

    getSeriesTitle() {
        const meta = this.rule.meta || {};
        return this._extractValue(this._doc, meta.title);
    }

    getSeriesMetadata() {
        const meta = this.rule.meta || {};
        const vendorSlug = (this.rule.name || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        return {
            author: this._extractValue(this._doc, meta.author) || "",
            status: this._extractValue(this._doc, meta.status) || "연재중",
            summary: this._extractValue(this._doc, meta.summary) || "",
            vendor: vendorSlug,
            vendorId: this.rule.id || vendorSlug
        };
    }

    getViewerMetadata(viewerDocument) {
        const viewerCfg = this.rule.viewer || {};
        
        let seriesTitle = this._extractValue(viewerDocument, viewerCfg.seriesTitle) || "UnknownSeries";
        let episodeTitle = this._extractValue(viewerDocument, viewerCfg.episodeTitle) || "UnknownEpisode";
        let episodeNum = this._extractValue(viewerDocument, viewerCfg.episodeNum) || "0000";

        // Clean up episodeNum
        const match = episodeNum.match(/(\d+)/);
        if (match) {
            episodeNum = match[1];
        }

        return {
            seriesTitle,
            episodeTitle,
            episodeNum
        };
    }
}


/***/ }),

/***/ 488:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   B0: function() { return /* binding */ getBooksByCacheId; },
/* harmony export */   Jb: function() { return /* binding */ getMergeIndexFragment; },
/* harmony export */   Ny: function() { return /* binding */ fetchHistory; },
/* harmony export */   fA: function() { return /* binding */ initUpdateUploadViaGASRelay; },
/* harmony export */   jz: function() { return /* binding */ refreshCacheAfterUpload; },
/* harmony export */   yv: function() { return /* binding */ uploadToGAS; }
/* harmony export */ });
/* harmony import */ var _config_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(899);
/* harmony import */ var _network_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(391);
/* harmony import */ var _EventBus_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(31);
/* harmony import */ var _logger_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(569);
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(924);






function gasRequest(payload, options = {}) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!config.gasUrl || !config.folderId) {
        if (options.rejectOnConfigError) {
            return Promise.reject(new Error("GAS 설정이 누락되었습니다."));
        }
        return Promise.resolve(options.defaultValue);
    }
    const timeout = options.timeout || 30000;
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: config.gasUrl,
            data: JSON.stringify({
                folderId: config.folderId,
                apiKey: config.apiKey,
                protocolVersion: 3,
                ...payload
            }),
            headers: { 'Content-Type': 'text/plain' },
            timeout: timeout,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        resolve(options.onSuccess ? options.onSuccess(json) : json.body);
                    } else {
                        if (options.onError) options.onError(json.body);
                        if (options.rejectOnError) reject(new Error(json.body || "GAS Request Failed"));
                        else resolve(options.defaultValue);
                    }
                } catch (e) {
                    if (options.onParseError) options.onParseError(res.responseText, e);
                    if (options.rejectOnError) reject(new Error("GAS 응답 오류"));
                    else resolve(options.defaultValue);
                }
            },
            onerror: (err) => {
                if (options.onNetworkError) options.onNetworkError(err);
                if (options.rejectOnError) reject(new Error("네트워크 오류"));
                else resolve(options.defaultValue);
            },
            ontimeout: () => {
                if (options.onTimeout) options.onTimeout();
                if (options.rejectOnError) reject(new Error("타임아웃"));
                else resolve(options.defaultValue);
            }
        });
    });
}

/**
 * Uploads a Blob to Google Drive via Direct Access (primary) or GAS Relay (fallback)
 * @param {Blob} blob File content
 * @param {string} folderName Target folder name (e.g. "[123] Title")
 * @param {string} fileName Target file name (e.g. "[123] Title.zip")
 */
async function uploadToGAS(blob, folderName, fileName, options = {}) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) throw new Error("GAS 설정이 누락되었습니다. 메뉴에서 설정을 완료해주세요.");
    
    // Try Direct Upload first
    try {
        console.log('[Upload] Attempting Direct Drive API upload...');
        await (0,_network_js__WEBPACK_IMPORTED_MODULE_1__/* .uploadDirect */ .r9)(blob, folderName, fileName, options);
        console.log('[Upload] ✅ Direct upload succeeded');
        return; // Success!
    } catch (directError) {
        console.warn('[Upload] ⚠️  Direct upload failed, falling back to GAS relay:', directError.message);
        _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn('Direct 업로드 실패 → GAS 릴레이 폴백: ' + directError.message + ' (' + fileName + ')', 'GAS:Upload');
    }
    
    // Fallback to GAS Relay
    console.log('[Upload] Using GAS relay fallback...');
    await uploadViaGASRelay(blob, folderName, fileName, options);
}

/**
 * 업로드 완료 후 GAS의 _toki_cache.json을 갱신합니다 (비동기, fire-and-forget)
 * 에피소드 c30치 다운로드 완료 후 한 번만 호출하세요.
 */
async function refreshCacheAfterUpload(folderName, category = 'Unknown', metadata = {}) {
    console.log(`[Cache] 업로드 완료 → Drive 캐시 갱신 요청 (${folderName})`);
    return gasRequest({
        type: 'view_update_cache',
        folderName,
        category,
        metadata
    }, {
        timeout: 30000,
        defaultValue: undefined,
        onSuccess: (json) => {
            console.log('[Cache] 갱신 요청 완료. 병합 파편 생성됨:', json.body);
        },
        onParseError: () => {
            console.log('[Cache] 갱신 완료 응답 수신 (상세없음)');
        },
        onNetworkError: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`캐시 갱신 네트워크 오류 (${folderName}) — 다음 실행 시 자동 복구됨`, 'GAS:Cache');
        },
        onTimeout: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`캐시 갱신 타임아웃 30초 (${folderName}) — 스킬폭 포함 가능`, 'GAS:Cache');
        }
    });
}

/**
 * Legacy GAS Relay Upload (Fallback)
 * @param {Blob} blob File content
 * @param {string} folderName Target folder name
 * @param {string} fileName Target file name
 */
async function uploadViaGASRelay(blob, folderName, fileName, options = {}) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) throw new Error("GAS 설정이 누락되었습니다. 메뉴에서 설정을 완료해주세요.");
    
    // Constants
    const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB
    const CLIENT_VERSION = "1.2.2";
    const totalSize = blob.size;
    let uploadUrl = "";

    console.log(`[GAS] 업로드 초기화 중... (${fileName})`);
    
    // Determine Category
    // Default to Webtoon if not provided
    const category = options.category || (fileName.endsWith('.epub') ? 'Novel' : 'Webtoon');

    // 1. Init Session
    await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST", 
            url: config.gasUrl,
            data: JSON.stringify({ 
                folderId: config.folderId, 
                type: "init", 
                protocolVersion: 3, 
                clientVersion: CLIENT_VERSION, 
                folderName: folderName, 
                fileName: fileName,
                category: category,
                apiKey: config.apiKey
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 30000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') { 
                        uploadUrl = (typeof json.body === 'object') ? json.body.uploadUrl : json.body;
                        resolve(); 
                    } else {
                        _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`GAS 릴레이 세션 초기화 실패: ${json.body || 'Init failed'} (${fileName})`, 'GAS:Relay');
                        reject(new Error(json.body || "Init failed"));
                    }
                } catch (e) { 
                    _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`GAS 서버 응답 파싱 실패 (Init): ${res.responseText?.substring(0, 80)}`, 'GAS:Relay');
                    reject(new Error("GAS 응답 오류(Init): " + res.responseText)); 
                }
            },
            onerror: (e) => {
                _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`GAS 릴레이 네트워크 오류 (Init) — ${fileName}`, 'GAS:Relay');
                reject(new Error("네트워크 오류(Init)"));
            },
            ontimeout: () => {
                _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`GAS 릴레이 세션 초기화 타임아웃 (30초) — ${fileName}`, 'GAS:Relay');
                reject(new Error("[GAS] 업로드 초기화 타임아웃 (30초)"));
            }
        });
    });

    console.log(`[GAS] 세션 생성 완료. 업로드 시작...`);

    // 2. Chunk Upload Loop
    let start = 0;
    const buffer = await blob.arrayBuffer();
    
    while (start < totalSize) {
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunkBuffer = buffer.slice(start, end);
        const chunkBase64 = (0,_utils_js__WEBPACK_IMPORTED_MODULE_4__/* .arrayBufferToBase64 */ .Yi)(chunkBuffer);
        const percentage = Math.floor((end / totalSize) * 100);
        
        console.log(`[GAS] 전송 중... ${percentage}% (${start} ~ ${end} / ${totalSize})`);
        _EventBus_js__WEBPACK_IMPORTED_MODULE_2__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_2__/* .EVT */ .c.LOG, {
            msg: `☁️ GAS 릴레이 업로드 중... ${percentage}%`,
            level: 'info',
            tag: 'Upload'
        });

        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", 
                url: config.gasUrl,
                data: JSON.stringify({ 
                    folderId: config.folderId, 
                    type: "upload", 
                    protocolVersion: 3,
                    clientVersion: CLIENT_VERSION, 
                    uploadUrl: uploadUrl, 
                    chunkData: chunkBase64, 
                    start: start, end: end, total: totalSize,
                    apiKey: config.apiKey
                }),
                headers: { "Content-Type": "text/plain" },
                timeout: 300000,
                onload: (res) => {
                    try { 
                        const json = JSON.parse(res.responseText); 
                        if (json.status === 'success') resolve(); 
                        else {
                            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`GAS 청크 업로드 실패: ${json.body || 'Upload failed'} (${start}~${end})`, 'GAS:Relay');
                            reject(new Error(json.body || "Upload failed")); 
                        }
                    } catch (e) { 
                        _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`GAS 청크 응답 파싱 실패 (${start}~${end})`, 'GAS:Relay');
                        reject(new Error("GAS 응답 오류(Upload): " + res.responseText)); 
                    }
                },
                onerror: (e) => {
                    _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`GAS 청크 네트워크 오류 (${start}~${end} / ${totalSize})`, 'GAS:Relay');
                    reject(new Error("네트워크 오류(Upload)"));
                },
                ontimeout: () => {
                    _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`GAS 청크 타임아웃 5분 (${start}~${end} / ${totalSize})`, 'GAS:Relay');
                    reject(new Error(`[GAS] 청크 업로드 타임아웃 (5분): ${start}~${end}`));
                }
            });
        });
        
        start = end;
    }

    console.log(`[GAS] 업로드 완료!`);
}

async function fetchHistory(seriesTitle, category = 'Webtoon') {
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) return [];
    console.log(`[GAS] 다운로드 기록 조회 중... (${seriesTitle})`);
    return gasRequest({
        type: "check_history",
        folderName: seriesTitle,
        category: category
    }, {
        timeout: 30000,
        defaultValue: [],
        onSuccess: (json) => Array.isArray(json.body) ? json.body : [],
        onError: (errBody) => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`다운로드 기록 조회 실패: ${errBody}`, 'GAS:History');
        },
        onParseError: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`다운로드 기록 응답 파싱 실패`, 'GAS:History');
        },
        onNetworkError: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`다운로드 기록 조회 네트워크 오류`, 'GAS:History');
        },
        onTimeout: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`다운로드 기록 조회 타임아웃 (30초)`, 'GAS:History');
        }
    });
}

async function getBooksByCacheId(cacheFileId) {
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) return [];
    console.log(`[GAS] 캐시 파일 직행 조회 중... (${cacheFileId})`);
    return gasRequest({
        type: "view_get_books_by_cache",
        cacheFileId: cacheFileId
    }, {
        timeout: 10000,
        defaultValue: [],
        onSuccess: (json) => Array.isArray(json.body) ? json.body : [],
        onError: (errBody) => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`Fast Path 캐시 직행 조회 실패: ${errBody}`, 'GAS:FastPath');
        },
        onParseError: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`Fast Path 캐시 응답 파싱 실패`, 'GAS:FastPath');
        },
        onNetworkError: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`Fast Path 캐시 네트워크 오류`, 'GAS:FastPath');
        },
        onTimeout: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`Fast Path 캐시 조회 타임아웃 (10초)`, 'GAS:FastPath');
        }
    });
}

async function initUpdateUploadViaGASRelay(fileId, fileName) {
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) throw new Error("GAS 설정이 누락되었습니다.");
    console.log(`[GAS] 빠른 덮어쓰기(PUT) 세션 초기화 중... (${fileName} -> ${fileId})`);
    return gasRequest({
        type: "init_update",
        fileId: fileId,
        fileName: fileName
    }, {
        timeout: 30000,
        rejectOnConfigError: true,
        rejectOnError: true,
        onSuccess: (json) => (typeof json.body === 'object') ? json.body.uploadUrl : json.body,
        onError: (errBody) => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`Fast Path PUT 세션 초기화 실패: ${errBody} (${fileName})`, 'GAS:FastPath');
        },
        onParseError: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`Fast Path PUT 레스폰스 파싱 실패 (${fileName})`, 'GAS:FastPath');
        },
        onNetworkError: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`Fast Path PUT 네트워크 오류 (${fileName})`, 'GAS:FastPath');
        },
        onTimeout: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.critical(`Fast Path PUT 타임아웃 30초 (${fileName})`, 'GAS:FastPath');
        }
    });
}

async function getMergeIndexFragment(sourceId) {
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) return { found: false, data: null };
    console.log(`[GAS] 병합 인덱스 파편 조회 중... (Source ID: ${sourceId})`);
    return gasRequest({
        type: "view_get_merge_index",
        sourceId: sourceId
    }, {
        timeout: 10000,
        defaultValue: { found: false, data: null },
        onError: (errBody) => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`MergeIndex 파편 조회 실패: ${errBody} (ID: ${sourceId})`, 'GAS:FastPath');
        },
        onParseError: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`MergeIndex 파편 응답 파싱 실패`, 'GAS:FastPath');
        },
        onNetworkError: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`MergeIndex 파편 조회 네트워크 오류`, 'GAS:FastPath');
        },
        onTimeout: () => {
            _logger_js__WEBPACK_IMPORTED_MODULE_3__.logger.warn(`MergeIndex 파편 조회 타임아웃 (10초)`, 'GAS:FastPath');
        }
    });
}



/***/ }),

/***/ 523:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   s: function() { return /* binding */ EpubBuilder; }
/* harmony export */ });
function escapeXml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

class EpubBuilder {
    constructor() {
        this.chapters = [];
    }

    addChapter(title, textContent) {
        // Simple text to HTML conversion
        // Splits by newlines and wraps in <p>
        const htmlContent = textContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => `<p>${escapeXml(line)}</p>`)
            .join('\n');
            
        this.chapters.push({ title: escapeXml(title), content: htmlContent });
    }

    async build(metadata = {}) {
        try {
            const zip = new JSZip();
            const title = escapeXml(metadata.title || "Unknown Title");
            const author = escapeXml(metadata.author || "Unknown Author");
            const uid = "urn:uuid:" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());

            // 1. mimetype (must be first, uncompressed)
            zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

            // 2. container.xml
            zip.folder("META-INF").file("container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`);

            // 3. OEBPS Folder
            const oebps = zip.folder("OEBPS");

            // styles.css
            oebps.file("styles.css", `body { font-family: sans-serif; } p { text-indent: 1em; margin-bottom: 0.5em; }`);

            // Chapters
            this.chapters.forEach((chapter, index) => {
                const filename = `chapter_${index + 1}.xhtml`;
                const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>${chapter.title}</title>
<link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
<h2>${chapter.title}</h2>
${chapter.content}
</body>
</html>`;
                oebps.file(filename, xhtml);
            });

            // content.opf
            let manifest = `<item id="style" href="styles.css" media-type="text/css"/>\n`;
            let spine = ``;
            let tocNav = `<navMap>\n`;

            this.chapters.forEach((c, i) => {
                const id = `chap${i + 1}`;
                const href = `chapter_${i + 1}.xhtml`;
                manifest += `<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>\n`;
                spine += `<itemref idref="${id}"/>\n`;
                tocNav += `<navPoint id="${id}" playOrder="${i+1}"><navLabel><text>${c.title}</text></navLabel><content src="${href}"/></navPoint>\n`;
            });
            // Add NCX to manifest
            manifest += `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`;

            const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:title>${title}</dc:title>
        <dc:creator opf:role="aut">${author}</dc:creator>
        <dc:language>ko</dc:language>
        <dc:identifier id="BookId">${uid}</dc:identifier>
    </metadata>
    <manifest>
        ${manifest}
    </manifest>
    <spine toc="ncx">
        ${spine}
    </spine>
</package>`;

            oebps.file("content.opf", opf);

            // toc.ncx
            const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
    <meta name="dtb:uid" content="${uid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${title}</text></docTitle>
${tocNav}
</navMap>
</ncx>`;

            oebps.file("toc.ncx", ncx);

            // Return the ZIP object (which IS the EPUB)
            return zip; 
        } catch (e) {
            const { logger } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 569));
            logger.critical(`EPUB 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, 'Builder:EPUB');
            throw e;
        }
    }
}


/***/ }),

/***/ 543:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   u: function() { return /* binding */ RuleManager; }
/* harmony export */ });
/* harmony import */ var _config_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(899);


/**
 * RuleManager
 * Manages parsing rules from built-in templates and user definitions.
 */
class RuleManager {
    // Built-in sample rules as fallback/templates (Offline Seeding)
    static get _version() {
        return  true ? "1.26.4" : 0;
    }

    static #builtInRules = [
        {
            id: "toki_common",
            name: "토끼 계열 (뉴토끼/마나토끼) 통합 규칙",
            _version: this._version,
            urlPattern: ".*(newtoki|manatoki|comic|booktoki).*",
            category: "Webtoon",
            meta: {
                title: "meta[name=\"subject\"]",
                author: ".view-content",
                thumb: {
                    selector: "img[itemprop=\"image\"]",
                    attr: "src"
                }
            },
            list: {
                container: ".list-body",
                item: "li",
                num: "span.no",
                title: "a",
                link: {
                    selector: "a",
                    attr: "href"
                }
            },
            viewer: {
                fetchMethod: "iframe",
                imageRegex: "https?:\\\\/\\\\/[a-zA-Z0-9_\\\\.\\\\/-]+\\\\.(?:jpg|png|webp|gif)",
                imageContainer: "div.view-padding, div.viewer",
                imageItem: "img",
                lazyAttrOptions: [
                    "data-src",
                    "data-lazy",
                    "src"
                ]
            }
        }
    ];

    /**
     * Get all merged rules: Custom > Built-in
     * @returns {Promise<Array>}
     */
    static async getRules() {
        // [v1.25.1] 레거시 커스텀 규칙(TOKI_CUSTOM_RULES) 자동 마이그레이션 감지
        if (typeof GM_getValue !== 'undefined' && typeof GM_deleteValue !== 'undefined') {
            const legacyRulesStr = GM_getValue('TOKI_CUSTOM_RULES');
            if (legacyRulesStr) {
                try {
                    const legacyRules = JSON.parse(legacyRulesStr);
                    if (Array.isArray(legacyRules) && legacyRules.length > 0) {
                        console.log("[RuleManager] 🚚 레거시 커스텀 규칙(TOKI_CUSTOM_RULES) 감지 -> TOKI_PARSER_RULES로 마이그레이션을 수행합니다.");
                        let currentRules = this.getParserRules();
                        
                        // 중복되지 않은 아이템들만 병합
                        legacyRules.forEach(legacyRule => {
                            if (!currentRules.some(r => r.id === legacyRule.id)) {
                                currentRules.push(legacyRule);
                            }
                        });
                        
                        this.saveParserRules(currentRules);
                        console.log("[RuleManager] ✅ 커스텀 규칙 병합 완료.");
                    }
                } catch (e) {
                    console.error("[RuleManager] ❌ 레거시 규칙 파싱 실패:", e);
                } finally {
                    // 중복 실행 방지를 위한 안전 소거
                    GM_deleteValue('TOKI_CUSTOM_RULES');
                }
            }
        }

        let parserRules = this.getParserRules();

        // 최초 구동 시 (파서 규칙이 완전히 비어있는 경우) 내장 샘플 규칙을 자동으로 스토리지에 주입(Seed)
        if (parserRules.length === 0) {
            console.log("[RuleManager] 🚀 초기 구동 감지 -> 정적 기본 샘플 규칙을 TOKI_PARSER_RULES에 이식(Seed)합니다.");
            parserRules = [...this.#builtInRules];
            this.saveParserRules(parserRules);
        }

        return parserRules;
    }

    /**
     * Get only custom/parser rules from GM storage
     */
    static getParserRules() {
        if (typeof GM_getValue === 'undefined') return [];
        const str = GM_getValue(_config_js__WEBPACK_IMPORTED_MODULE_0__/* .CFG_PARSER_RULES */ .Pd, '[]');
        try {
            return JSON.parse(str) || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Save parser rules to GM storage
     */
    static saveParserRules(rules) {
        if (typeof GM_setValue === 'undefined') return;
        const version = this._version;
        rules.forEach(rule => { if (rule && typeof rule === 'object' && !rule._version) rule._version = version; });
        GM_setValue(_config_js__WEBPACK_IMPORTED_MODULE_0__/* .CFG_PARSER_RULES */ .Pd, JSON.stringify(rules, null, 2));
    }

    /**
     * Add a new rule
     */
    static addRule(rule) {
        const rules = this.getParserRules();
        if (rules.find(r => r.id === rule.id)) return false;
        rules.push(rule);
        this.saveParserRules(rules);
        return true;
    }

    /**
     * Update an existing rule
     */
    static updateRule(id, updatedRule) {
        const rules = this.getParserRules();
        const idx = rules.findIndex(r => r.id === id);
        if (idx === -1) return false;
        rules[idx] = updatedRule;
        this.saveParserRules(rules);
        return true;
    }

    /**
     * Delete a rule
     */
    static deleteRule(id) {
        const rules = this.getParserRules();
        const filtered = rules.filter(r => r.id !== id);
        this.saveParserRules(filtered);
        return true;
    }

    /**
     * Bulk import rules
     */
    static bulkImport(newRules, mode = 'merge') {
        const current = this.getParserRules();
        const version = this._version;
        let imported = 0, updated = 0, skipped = 0;

        newRules.forEach(rule => {
            if (!rule.id) { skipped++; return; }
            if (!rule._version) rule._version = version;
            const idx = current.findIndex(r => r.id === rule.id);
            if (idx === -1) {
                current.push(rule);
                imported++;
            } else if (mode === 'overwrite') {
                current[idx] = rule;
                updated++;
            } else {
                skipped++;
            }
        });

        this.saveParserRules(current);
        return { imported, updated, skipped };
    }

    /**
     * Find a matching rule for the current URL
     * @param {string} url 
     * @returns {Promise<Object|null>}
     */
    static async matchRule(url) {
        const rules = await this.getRules();
        for (const rule of rules) {
            if (!rule.urlPattern) continue;
            try {
                const regex = new RegExp(rule.urlPattern, 'i');
                if (regex.test(url)) {
                    console.log(`[RuleManager] Matched rule: ${rule.name || rule.id}`);
                    return rule;
                }
            } catch (e) {
                console.warn(`[RuleManager] Invalid regex pattern: ${rule.urlPattern}`, e);
            }
        }
        return null;
    }
}


/***/ }),

/***/ 569:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   logger: function() { return /* binding */ logger; }
/* harmony export */ });
/* harmony import */ var _EventBus_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(31);
/**
 * logger.js for TokiSync
 * Abstract logging module that routes all logs through EventBus.
 * Eliminates direct dependencies on the LogBox UI class.
 */



const logger = {
    init() {
        // No-op for abstract logger compatibility
    },

    log(msg, tag = '') {
        _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.LOG, { msg, level: 'info', tag });
        console.log(`[info][${tag}] ${msg}`);
    },

    info(msg, tag = '') {
        this.log(msg, tag);
    },

    success(msg, tag = '') {
        _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.LOG, { msg, level: 'success', tag });
        console.log(`[success][${tag}] ${msg}`);
    },

    warn(msg, tag = '') {
        _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.LOG, { msg, level: 'warn', tag });
        console.warn(`[warn][${tag}] ${msg}`);
    },

    error(msg, tag = '') {
        _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.LOG, { msg, level: 'error', tag });
        console.error(`[error][${tag}] ${msg}`);
    },

    critical(msg, tag = '') {
        _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.LOG, { msg, level: 'critical', tag });
        console.error(`[critical][${tag}] ${msg}`);
    },

    show() {
        _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.OPEN_DASHBOARD);
    },

    toggle() {
        _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.TOGGLE_DASHBOARD);
    },

    openDashboard(defaultTab = '') {
        _EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_0__/* .EVT */ .c.OPEN_DASHBOARD, { defaultTab });
    }
};


/***/ }),

/***/ 572:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   UT: function() { return /* binding */ fetchNovelText; },
/* harmony export */   gq: function() { return /* binding */ fetchComicImages; },
/* harmony export */   hh: function() { return /* binding */ initBatchWorkerController; },
/* harmony export */   hr: function() { return /* binding */ closeActiveWorker; }
/* harmony export */ });
/* harmony import */ var _novel_decryptor_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(602);
/* harmony import */ var _ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(941);
/* harmony import */ var _queue_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(302);
/* harmony import */ var _EventBus_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(31);
/* harmony import */ var _config_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(899);
/* harmony import */ var _gas_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(488);
/* harmony import */ var _epub_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(523);
/* harmony import */ var _cbz_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(416);
/* harmony import */ var _txt_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(409);
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(924);
/**
 * tokiSync - Unified Worker Controller
 * Manages single popup lifecycle and IPC routing for sequential download mode.
 */












// Reference for the single worker popup (used in sequential mode)
let activeWorkerRef = null;

// Security: Current session nonce for single worker mode
let activeWorkerNonce = null;
let activeWorkerId = null;

// 🧠 인메모리 수집 콘텐츠 데이터 캐시 (GM Storage 512KB 용량 초과 및 ArrayBuffer 직렬화 실패 원천 차단)
const extractedDataCache = new Map();

// 대기열 전체 삭제 또는 중단 시 인메모리 캐시 강제 비우기
_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.on(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.QUEUE_RESET, () => extractedDataCache.clear());
_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.on(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.QUEUE_STOP_ALL, () => extractedDataCache.clear());

// 🛡️ 배치 제어용 중복 리스너 방지 로컬 변수 가드
let batchIpcCleanup = null;
let isBatchControllerInitialized = false;

// 🛡️ 배치 폴링 setInterval ID 추적 (중복 초기화 시 이전 인터벌 정리)
let _batchPollingInterval = null;

// Security: Batch worker nonce tracking (queueId -> nonce)
const batchWorkerNonces = new Map();

/**
 * Close active single worker popup window
 */
function closeActiveWorker() {
    if (activeWorkerRef && !activeWorkerRef.closed) {
        console.log('[WorkerController] 단일 워커 팝업 세션 수동 폐쇄');
        activeWorkerRef.close();
    }
    // Security: Clean up nonce and origin registration
    if (activeWorkerId) {
        _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(activeWorkerId);
        (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .removeWorkerOrigin */ .Re)(activeWorkerId, activeWorkerNonce);
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
                (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .removeWorkerOrigin */ .Re)(activeWorkerId, activeWorkerNonce);
                activeWorkerId = null;
            }
            activeWorkerNonce = null;

            // 즉각 ACK 응답 전송 (자식이 안전하게 종료하도록 피드백)
            if (sourceWindow && !sourceWindow.closed) {
                try {
                    (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .sendToWorker */ .eu)(sourceWindow, 'IPC_ACK', { queueId });
                } catch (ackErr) {
                    console.warn('[WorkerController] ACK 전송 실패 (무시):', ackErr);
                }
            }

            // WAF Jitter 대기
            const localCfg = (0,_config_js__WEBPACK_IMPORTED_MODULE_4__/* .getConfig */ .zj)();
            const localMultiplier = _config_js__WEBPACK_IMPORTED_MODULE_4__/* .SLEEP_MULTIPLIERS */ .dx[localCfg.sleepMode] || _config_js__WEBPACK_IMPORTED_MODULE_4__/* .SLEEP_MULTIPLIERS */ .dx.cautious;
            const jitterDelay = (1500 + Math.random() * 1000) * localMultiplier;
            const delaySec = (jitterDelay / 1000).toFixed(1);
            console.log(`[WorkerController] WAF 지터 대기 (${delaySec}초)...`);
            _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
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
        cleanupIpc = (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .registerIpcListener */ .Q_)(async (msg) => {
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
                    if (queueId) (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(queueId, { lastActivity: Date.now() });
                    const localCfg = (0,_config_js__WEBPACK_IMPORTED_MODULE_4__/* .getConfig */ .zj)();
                    const localMultiplier = _config_js__WEBPACK_IMPORTED_MODULE_4__/* .SLEEP_MULTIPLIERS */ .dx[localCfg.sleepMode] || _config_js__WEBPACK_IMPORTED_MODULE_4__/* .SLEEP_MULTIPLIERS */ .dx.cautious;
                    const initialDelay = 3000 * localMultiplier;

                    console.log(`[WorkerController] 📢 READY 수신 ➡️ 안전 대기 기동 (${(initialDelay/1000).toFixed(1)}초)...`);
                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                        msg: `⏳ 새 에피소드 연결 성공 ➡️ 안전 대기 중... (${(initialDelay/1000).toFixed(1)}초)`,
                        tag: 'Queue:Single',
                        level: 'info'
                    });

                    await new Promise(r => setTimeout(r, initialDelay));

                    if (activeWorkerRef && !activeWorkerRef.closed) {
                        console.log(`[WorkerController] 📢 안전 대기 완료 ➡️ 지시 주입 (유형: ${targetType})`);
                        (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .sendToWorker */ .eu)(activeWorkerRef, 'START_EXTRACTION', {
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
                if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.DOM_READY) stageText = '페이지 로딩';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.SCROLLING) stageText = '스크롤 스캔';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.PARSING) stageText = '미디어 파싱';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.DOWNLOADING) stageText = '다운로드';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.UPLOADING) stageText = '데이터 전송';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.COMPLETED) stageText = '완료';

                _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                    msg: `[${config.episodeTitle || '에피소드'}] -> ${stageText} (${Math.round(percent)}%)`,
                    tag: 'Downloader:Single',
                    level: 'info'
                });
            }

            // 3-1. Child Custom Log reporting ➡️ Forward to logger
            if (type === 'WORKER_LOG') {
                const { msg, level } = payload || {};
                _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
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
            _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.set(activeWorkerId, activeWorkerRef);
            activeWorkerNonce = (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .registerWorkerOrigin */ .S6)(activeWorkerId, 'null'); // about:blank popups have origin="null"
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
async function fetchNovelText(episodeUrl, config = {}) {
    console.log('[WorkerController] 소설 수집 개시 (Plan B — 자립형 팝업)');
    const result = await fetchMediaViaWorker(episodeUrl, 'novel', config);

    if (result.success && result.content) {
        return result.content; // 추출된 본문 텍스트 반환
    }

    // Plan C Fallback: Local API Decryption (if decryptApi configuration exists)
    if (config.decryptApi || config.endpoint) {
        console.warn('[WorkerController] Plan B 실패 ➡️ Plan C(API 복호화) 로컬 폴백 시도');
        const content = await (0,_novel_decryptor_js__WEBPACK_IMPORTED_MODULE_0__/* .fetchNovelTextViaApi */ .i)(episodeUrl, config.decryptApi || config);
        if (content) {
            return content;
        }
    }

    return null;
}

/**
 * 만화/웹툰 이미지 수집 (Plan B: 자립형 팝업)
 */
async function fetchComicImages(episodeUrl, config = {}) {
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
function initBatchWorkerController() {
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
        if ((0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueuePaused */ .kZ)()) {
            return;
        }

        const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
        const now = Date.now();

        // 1. 60초(업로드 중인 경우 5분) 이상 무반응인 워커 강제 타임아웃 회수
        queue.forEach(item => {
            const lastActive = item.lastActivity || item.startedAt;
            if (item.status === 'processing' && lastActive) {
                const isUploading = (item.stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.UPLOADING);
                const limit = isUploading ? 300000 : 60000;
                
                if (now - lastActive > limit) {
                    const limitSec = limit / 1000;
                    console.warn(`[WorkerController] ⚠️ [배치] ${limitSec}초 타임아웃 감지: ${item.id} (${item.episodeTitle}), Stage: ${item.stage}`);
                    const popupRef = _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.get(item.id);
                    try {
                        const actualRef = popupRef && (popupRef.ref || popupRef);
                        if (actualRef && !actualRef.closed) {
                            actualRef.close();
                        }
                    } catch (e) {}
                    _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(item.id);
                    batchClosedCounts.delete(item.id);
                    // Security: Invalidate timed-out worker nonce
                    const timedOutNonce = batchWorkerNonces.get(item.id);
                    if (timedOutNonce) {
                        (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .removeWorkerOrigin */ .Re)(item.id, timedOutNonce);
                        batchWorkerNonces.delete(item.id);
                    }

                    const nextRetry = (item.retryCount || 0) + 1;
                    (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(item.id, {
                        status: nextRetry >= 3 ? 'failed' : 'pending',
                        retryCount: nextRetry,
                        errorMsg: `에피소드 ${isUploading ? '업로드' : '수집'} 처리 시간이 ${limitSec}초를 초과하여 타임아웃되었습니다.`
                    });

                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                        msg: `❌ [배치 타임아웃] [${item.episodeTitle}] ${isUploading ? '업로드' : '수집'} 시간 초과(${limitSec}초). 복구를 단행합니다.`,
                        tag: 'Queue',
                        level: 'error'
                    });
                    (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .runSchedulerOnce */ .gi)();
                }
            }
        });

        // 2. 수동 종료 감시
        for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
            const actualRef = popupRef && (popupRef.ref || popupRef);
            if (actualRef && actualRef.closed) {
                const closedCount = (batchClosedCounts.get(id) || 0) + 1;
                batchClosedCounts.set(id, closedCount);

                if (closedCount >= 5) {
                    console.warn(`[WorkerController] ⚠️ [배치] 자식 팝업 수동 종료 확정: ${id}`);
                    _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(id);
                    batchClosedCounts.delete(id);
                    // Security: Invalidate manually closed worker nonce
                    const manualNonce = batchWorkerNonces.get(id);
                    if (manualNonce) {
                        (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .removeWorkerOrigin */ .Re)(id, manualNonce);
                        batchWorkerNonces.delete(id);
                    }

                    const item = queue.find(i => i.id === id);
                    if (item && item.status === 'processing') {
                        // [H8] 업로드 중(95%~)이거나 이미 완료된 회차는 팝업 닫힘을 정상 종료로 취급하여 복구 차단
                        if (item.stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.UPLOADING || item.stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.COMPLETED) {
                            _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(id);
                            batchClosedCounts.delete(id);
                            return;
                        }

                        const nextRetry = (item.retryCount || 0) + 1;
                        (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(id, {
                            status: nextRetry >= 3 ? 'failed' : 'pending',
                            retryCount: nextRetry,
                            errorMsg: '자식 팝업 창이 비정상적으로 강제 종료되었습니다.'
                        });
                        _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                            msg: `❌ [배치 수동종료] [${item.episodeTitle}] 자식 팝업이 종료되어 복구를 단행합니다.`,
                            tag: 'Queue',
                            level: 'error'
                        });
                        (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .runSchedulerOnce */ .gi)();
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
        const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
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
                    (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .sendToWorker */ .eu)(sourceWindow, 'IPC_ACK', ackPayload);
                    sourceWindow.close(); // 즉시 close 강제
                }
            } catch (ackErr) {
                console.warn('[WorkerController] [배치] 자식 팝업 close 또는 ACK 전송 실패:', ackErr);
            }
        }
        _queue_js__WEBPACK_IMPORTED_MODULE_2__/* ._activeProcessing */ .xx.add(matchedId);
        _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(matchedId);
        batchClosedCounts.delete(matchedId);
        // Security: Invalidate batch worker nonce
        const batchNonce = batchWorkerNonces.get(matchedId);
        if (batchNonce) {
            (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .removeWorkerOrigin */ .Re)(matchedId, batchNonce);
            batchWorkerNonces.delete(matchedId);
        }

        // [P0] 수집된 무거운 바이너리/본문 데이터는 영속 스토리지 대신 인메모리 캐시에 보관
        extractedDataCache.set(matchedId, {
            content: payload.content || null,
            images: payload.images || null
        });

        // 큐 스토리지에는 단순 상태 메타데이터만 기재하여 스토리지 락과 초과 크기 에러 방지
        (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, {
            stage: _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.UPLOADING,
            progressPercent: 95
        });
        _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.UPDATE_PROGRESS);

        _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
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
                const builder = novelFormat === 'txt' ? new _txt_js__WEBPACK_IMPORTED_MODULE_8__/* .TxtBuilder */ .I() : new _epub_js__WEBPACK_IMPORTED_MODULE_6__/* .EpubBuilder */ .s();
                builder.addChapter(episodeTitle, finalContent.trim());

                _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
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
                const builder = new _cbz_js__WEBPACK_IMPORTED_MODULE_7__/* .CbzBuilder */ .$();
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

                _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
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
                const template = (0,_config_js__WEBPACK_IMPORTED_MODULE_4__/* .getConfig */ .zj)().localNameTemplate || "{number:4} - {title}";
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
            _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
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
                (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, { lastActivity: Date.now() });
            }, 30000);
            try {
                await (0,_utils_js__WEBPACK_IMPORTED_MODULE_9__/* .saveFile */ .OJ)(blob, fullFilename, saveType, extension, {
                    folderId: item.folderId,
                    folderName: targetFolderName,
                    category: category,
                    destination: destination
                });
            } finally {
                clearInterval(keepalive);
            }

            // 4. 업로드 완료 후 최종 성공 전이 및 캐시 삭제
            (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, {
                status: 'completed',
                progressPercent: 100,
                stage: _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.COMPLETED
            });
            extractedDataCache.delete(matchedId); // 인메모리 캐시 클린업
            _queue_js__WEBPACK_IMPORTED_MODULE_2__/* ._activeProcessing */ .xx.delete(matchedId);
            console.log(`[WorkerController] 🎉 [배치] 업로드 및 완료 처리 성공 (ID: ${matchedId})`);

        } catch (uploadErr) {
            _queue_js__WEBPACK_IMPORTED_MODULE_2__/* ._activeProcessing */ .xx.delete(matchedId);
            console.error(`[WorkerController] ❌ [배치] 업로드 처리 중 예외 발생:`, uploadErr);
            
            // [v1.21.8] 사용자의 정지 클릭으로 이미 failed로 빠졌는지 확인
            const freshQueue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
            const freshItem = freshQueue.find(i => i.id === matchedId);
            const isStopped = freshItem && freshItem.status === 'failed' && freshItem.errorMsg?.includes('중단');

            const nextRetry = (item.retryCount || 0) + 1;
            const finalStatus = (isStopped || nextRetry >= 3) ? 'failed' : 'pending';
            (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, {
                status: finalStatus,
                retryCount: nextRetry,
                errorMsg: isStopped ? '사용자에 의해 수집이 강제로 중단되었습니다.' : (uploadErr.message || '파일 빌드 및 업로드 실패')
            });
            extractedDataCache.delete(matchedId); // 실패 또는 재시도 전이 시 캐시 클린업


            _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                msg: `❌ [배치 업로드 실패] [${item.episodeTitle}] ${uploadErr.message || '오류 발생'} (시도: ${nextRetry}/3)`,
                tag: 'Queue',
                level: 'error'
            });
        }

        const popupRef = _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.get(matchedId);
        if (popupRef) {
            // [자가 종료 가드] 자식이 스스로 닫히는 것을 기다리되, 3초 후에도 열려있다면 부모가 직접 닫고 activeWorkers에서 제거
            setTimeout(() => {
                try {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef && !actualRef.closed) {
                        console.log(`[WorkerController] 🛡️ [자가 종료 가드] 3초 초과 자식 팝업 강제 폐쇄: ${matchedId}`);
                        actualRef.close();
                    }
                } catch (e) {}
                _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(matchedId);
            }, 3000);
        }

        _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.UPDATE_PROGRESS);

        // 드라이브 캐시 최종 갱신
        const currentQueue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
        const hasActive = currentQueue.some(i => i.status === 'pending' || i.status === 'processing');
        if (!hasActive) {
            const completedItem = currentQueue.find(i => i.id === matchedId);
            if (completedItem && (completedItem.destination === 'drive' || completedItem.destination === 'drive_kavita')) {
                const cleanFolder = completedItem.rootFolder.replace(/^\[[^\]]+\]\s*/, '');
                const targetFolder = completedItem.destination === 'drive_kavita' ? cleanFolder : completedItem.rootFolder;
                console.log(`[WorkerController] ☁️ 전 대기열 수집 완료 -> 드라이브 캐시 갱신 시작: ${targetFolder}`);
                (0,_gas_js__WEBPACK_IMPORTED_MODULE_5__/* .refreshCacheAfterUpload */ .jz)(
                    targetFolder,
                    completedItem.category,
                    completedItem.seriesMetadata || {}
                ).catch(e =>
                    console.warn(`[WorkerController] 캐시 갱신 실패: ${e.message}`)
                );
            }
        }

        // 다음 릴레이 스케줄 기동
        (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .runSchedulerOnce */ .gi)();
    };

    if (batchIpcCleanup) {
        try {
            batchIpcCleanup();
        } catch (e) {
            console.warn('[WorkerController] 기존 배치 IPC 리스너 해제 실패:', e);
        }
        batchIpcCleanup = null;
    }

    batchIpcCleanup = (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .registerIpcListener */ .Q_)(async (msg) => {
        const { type, payload, sourceEvent } = msg;
        if (!sourceEvent || !sourceEvent.source) return;

        // 1. WORKER_READY: 자식 워커 핸드셰이킹 수신
        if (type === 'WORKER_READY') {
            const { targetUrl } = payload || {};
            let matchedId = null;

            for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                const actualRef = popupRef.ref || popupRef;
                if (actualRef === sourceEvent.source) {
                    matchedId = id;
                    break;
                }
            }

            if (!matchedId && targetUrl) {
                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const matchedItem = queue.find(item => 
                    (item.status === 'pending' || item.status === 'processing') && 
                    item.episodeUrl === targetUrl
                );
                if (matchedItem && batchWorkerNonces.has(matchedItem.id)) {
                    matchedId = matchedItem.id;
                    _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.set(matchedId, sourceEvent.source);
                    // Security: Register worker origin and generate session nonce for batch
                    const batchNonce = (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .registerWorkerOrigin */ .S6)(matchedId, 'null');
                    batchWorkerNonces.set(matchedId, batchNonce);
                    console.log(`[WorkerController] ♻️ URL 매칭 성공 ➡️ Window 참조 복원 갱신 (ID: ${matchedId}), 보안 논스 생성`);
                }
            }

            if (matchedId) {
                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const item = queue.find(i => i.id === matchedId);
                
                if (item) {
                    // 🛡️ 안전 대기 중 동일 에피소드의 READY 중복 처리 방어 가드
                    if (window[`tokisync_waiting_${matchedId}`]) {
                        console.log(`[WorkerController] [배치] ID: ${matchedId} 는 이미 안전 대기 중입니다. 중복 READY 유입 차단.`);
                        return;
                    }
                    window[`tokisync_waiting_${matchedId}`] = true;
                    (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, { lastActivity: Date.now() });

                    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_4__/* .getConfig */ .zj)();
                    const multiplier = _config_js__WEBPACK_IMPORTED_MODULE_4__/* .SLEEP_MULTIPLIERS */ .dx[config.sleepMode] || _config_js__WEBPACK_IMPORTED_MODULE_4__/* .SLEEP_MULTIPLIERS */ .dx.cautious;
                    const initialDelay = 3000 * multiplier;
                    
                    console.log(`[WorkerController] 📢 [배치] READY 수신 (ID: ${matchedId}) ➡️ 안전 대기 기동 (${(initialDelay/1000).toFixed(1)}초)...`);
                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                        msg: `⏳ 새 에피소드 연결 성공 ➡️ 안전 대기 중... (${(initialDelay/1000).toFixed(1)}초)`,
                        tag: 'Queue:Batch',
                        level: 'info'
                    });
                    
                    try {
                        await new Promise(r => setTimeout(r, initialDelay));
                    } finally {
                        delete window[`tokisync_waiting_${matchedId}`];
                    }
                    
                    // 대기 완료 후 중단 여부 재체크
                    const freshQueue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                    const freshItem = freshQueue.find(i => i.id === matchedId);
                    if (!freshItem || freshItem.status !== 'processing' || (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueuePaused */ .kZ)()) {
                        console.log('[WorkerController] ⏹️ 첫 통신 대기 후 중단/일시정지 감지 -> 주입 취소');
                        return;
                    }

                    console.log(`[WorkerController] 📢 [배치] 안전 대기 완료 ➡️ START_EXTRACTION 주입 (ID: ${matchedId})`);
                    
                    const batchNonce = batchWorkerNonces.get(matchedId);
                    (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .sendToWorker */ .eu)(sourceEvent.source, 'START_EXTRACTION', {
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
                        localNameTemplate: config.localNameTemplate || "{number:4} - {title}",
                        sessionNonce: batchNonce // Security: session token for IPC validation
                    }, batchNonce);
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
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.warn(`[WorkerController] ⚠️ [배치] WAF 캡차 차단막 감지 (ID: ${matchedId})`);
                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                        msg: `[배치] ⚠️ [캡차 대기] [${item.episodeTitle}] 브라우저 창에서 보안 해제를 수행해 주세요.`,
                        tag: 'Downloader:Batch',
                        level: 'warn'
                    });
                }
            }
        }

        // 2-1. WORKER_LOG: 자식 워커 커스텀 실시간 로그 출력
        if (type === 'WORKER_LOG') {
            const { msg, level, queueId } = payload || {};
            _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                msg: msg,
                tag: 'Worker:Batch',
                level: level || 'info'
            });

            // [H8] Liveness Jitter 방어: 로그 수신 시 수집 시간(lastActivity)을 갱신하여 60초 배치 타임아웃 오작동 차단
            let matchedId = queueId;
            if (!matchedId) {
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }
            if (matchedId) {
                (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, { lastActivity: Date.now() });
            }
        }

        // 3. WORKER_PROGRESS: 자식 워커 실시간 진행률 UI 반영
        if (type === 'WORKER_PROGRESS') {
            const { percent, stage, queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    // 진행률 업데이트 시에도 lastActivity를 현재 시간으로 강제 명시하여 타임아웃을 유예
                    (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, { progressPercent: percent, stage: stage, lastActivity: Date.now() });
                    
                    let stageText = '대기 중';
                    if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.DOM_READY) stageText = '페이지 로딩';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.SCROLLING) stageText = '스크롤 스캔';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.PARSING) stageText = '미디어 파싱';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.DOWNLOADING) stageText = '다운로드';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.UPLOADING) stageText = '데이터 전송';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.COMPLETED) stageText = '완료';

                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                        msg: `[${item.episodeTitle}] -> ${stageText} (${Math.round(percent)}%)`,
                        tag: 'Downloader:Batch',
                        level: 'info'
                    });
                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.UPDATE_PROGRESS);
                }
            }
        }

        // 4. TASK_COMPLETED: 표준 postMessage 방식 수집 완료
        if (type === 'TASK_COMPLETED') {
            const { queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
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
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
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
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                    const actualRef = popupRef.ref || popupRef;
                    if (actualRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.error(`[WorkerController] ❌ [배치] 수집 실패 (ID: ${matchedId}): ${errorMsg}`);
                
                const popupRef = _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.get(matchedId);
                if (popupRef) {
                    const actualRef = popupRef.ref || popupRef;
                    try {
                        if (actualRef && !actualRef.closed) {
                            actualRef.close();
                        }
                    } catch (e) {}
                    _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(matchedId);
                    // Security: Invalidate failed worker nonce
                    const failedNonce = batchWorkerNonces.get(matchedId);
                    if (failedNonce) {
                        (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .removeWorkerOrigin */ .Re)(matchedId, failedNonce);
                        batchWorkerNonces.delete(matchedId);
                    }
                }

                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    // [v1.21.8] 사용자의 정지 클릭으로 이미 failed로 빠졌는지 확인
                    const isStopped = item.status === 'failed' && item.errorMsg?.includes('중단');
                    const nextRetry = (item.retryCount || 0) + 1;
                    (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, {
                        status: (isStopped || nextRetry >= 3) ? 'failed' : 'pending',
                        retryCount: nextRetry,
                        errorMsg: isStopped ? '사용자에 의해 수집이 강제로 중단되었습니다.' : (errorMsg || '자식 워커가 에러를 보고함')
                    });
                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.UPDATE_PROGRESS);
                }

                // 배치 최종 실패 마감 시 처리
                const currentQueue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const hasActive = currentQueue.some(i => i.status === 'pending' || i.status === 'processing');
                if (!hasActive) {
                    const failedItem = currentQueue.find(i => i.id === matchedId);
                    if (failedItem && (failedItem.destination === 'drive' || failedItem.destination === 'drive_kavita')) {
                        const cleanFolder = failedItem.rootFolder.replace(/^\[[^\]]+\]\s*/, '');
                        const targetFolder = failedItem.destination === 'drive_kavita' ? cleanFolder : failedItem.rootFolder;
                        console.log(`[WorkerController] ☁️ 전 대기열 수집 종료(실패 포함) -> 드라이브 캐시 갱신 시작: ${targetFolder}`);
                        (0,_gas_js__WEBPACK_IMPORTED_MODULE_5__/* .refreshCacheAfterUpload */ .jz)(
                            targetFolder,
                            failedItem.category,
                            failedItem.seriesMetadata || {}
                        ).catch(e =>
                            console.warn(`[WorkerController] 캐시 갱신 실패: ${e.message}`)
                        );
                    }
                }

                (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .runSchedulerOnce */ .gi)();
            }
        }
    }, 'batch_controller');
}


/***/ }),

/***/ 602:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   i: function() { return /* binding */ fetchNovelTextViaApi; }
/* harmony export */ });
/**
 * tokiSync - Novel API Decryptor (Plan C Engine)
 *
 * JWT 토큰 디코딩 + 동적 Nonce 추출 + XOR 복호화 기반 API 직접 수집.
 * 팝업 IPC(Plan B)가 실패한 경우의 긴급 폴백 전용 모듈.
 *
 * 팝업 워커 IPC(Plan B)는 worker-controller.js 참조.
 */

// =============================================================
// 🛠️ 암호학 유틸리티 (내부 전용)
// =============================================================

function b64urlDecode(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - str.length % 4);
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function b64urlEncode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return b64urlEncode(new Uint8Array(sig));
}

function xorDecrypt(payloadB64, token) {
    const payload = b64urlDecode(payloadB64);
    const xorKey = token.split('.')[0];
    const key = new TextEncoder().encode(xorKey);
    const result = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) {
        result[i] = payload[i] ^ key[i % key.length];
    }
    return new TextDecoder('utf-8').decode(result);
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

async function resetNvCookie(cookieName) {
    console.log(`[Decryptor] ${cookieName} 쿠키 리셋 중...`);
    document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    await fetch('/api/nv-issue', { method: 'POST', credentials: 'same-origin' });
    console.log(`[Decryptor] ${cookieName} 쿠키 재발급 완료`);
}

function getIdsFromUrl(url) {
    const match = url.match(/\/novel\/(\d+)\/(\d+)/);
    if (!match) return null;
    return { novelId: match[1], episodeId: match[2] };
}

function getValidNonce(token) {
    try {
        const base64UrlPayload = token.split('.')[0];
        const base64Payload = base64UrlPayload.replace(/-/g, '+').replace(/_/g, '/');
        const binStr = atob(base64Payload);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
            bytes[i] = binStr.charCodeAt(i);
        }
        const tokenData = JSON.parse(new TextDecoder('utf-8').decode(bytes));

        if (tokenData && tokenData.nonce) {
            console.log('[Decryptor] 신형 토큰 — 내장 Nonce 추출:', tokenData.nonce);
            return tokenData.nonce;
        }
    } catch (e) {
        console.warn('[Decryptor] 토큰 디코딩 오류 — 랜덤 Nonce 생성:', e);
    }
    return b64urlEncode(crypto.getRandomValues(new Uint8Array(24)));
}

// 이스케이프 대응 토큰 정규식
const RE_TOKEN = /\\?"token\\?":\\?"(eyJ[A-Za-z0-9_-]+[A-Za-z0-9_=.-]*)\\?"/;

// =============================================================
// 🏛️ Plan C Engine: API 직접 복호화
// =============================================================

/**
 * JWT + HMAC Proof 기반 소설 API 직접 복호화 수집.
 * Plan B(팝업 IPC) 실패 시 긴급 폴백으로만 사용.
 * @param {string} episodeUrl
 * @param {Object} config - { endpoint, cookieName, clientHeader }
 * @param {boolean} _isRetry
 */
async function fetchNovelTextViaApi(episodeUrl, config = {}, _isRetry = false) {
    const endpoint = config.endpoint || '/api/novel-content';
    const cookieName = config.cookieName || 'nv';
    const clientHeader = config.clientHeader || 'shadow-v2';

    try {
        const ids = getIdsFromUrl(episodeUrl);
        if (!ids) return null;

        // 1. 페이지에서 Fresh Token 추출
        const html = await fetch(episodeUrl, { credentials: 'same-origin' }).then(r => r.text());
        const tokenMatch = html.match(RE_TOKEN);
        if (!tokenMatch) {
            console.warn('[Decryptor] 토큰 추출 실패 — API 호출 중단');
            return null;
        }
        const token = tokenMatch[1];

        // 2. 세션 쿠키 확인 및 발급
        let cookie = getCookie(cookieName);
        if (!cookie) {
            console.log('[Decryptor] 쿠키 없음 — nv-issue 시도');
            await fetch('/api/nv-issue', { method: 'POST', credentials: 'same-origin' });
            cookie = getCookie(cookieName);
        }
        if (!cookie) return null;

        // 3. Proof 생성 (동적 Nonce 연동)
        const nonce = getValidNonce(token);
        const proof = await hmacSign(cookie, `${token}.${nonce}.${navigator.userAgent}`);

        // 4. API 호출
        const resp = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'content-type': 'application/json',
                'x-novel-client': clientHeader
            },
            body: JSON.stringify({ novelId: ids.novelId, episodeId: ids.episodeId, token, nonce, proof })
        });

        // 5. 실패 시 쿠키 리셋 후 1회 재시도
        if (!resp.ok) {
            if (!_isRetry) {
                console.warn(`[Decryptor] API 실패 (${resp.status}) — 세션 차단 의심, 쿠키 리셋 후 재시도`);
                await resetNvCookie(cookieName);
                return fetchNovelTextViaApi(episodeUrl, config, true);
            }
            console.error(`[Decryptor] 재시도 후에도 실패 (${resp.status})`);
            return null;
        }

        const data = await resp.json();
        if (!data.ok || !data.payload) return null;

        // 6. XOR 복호화 및 URI 디코딩 정제
        let resultString = xorDecrypt(data.payload, token);
        if (!resultString) return null;

        if (resultString.startsWith('%')) {
            resultString = decodeURIComponent(resultString);
        }

        return resultString;

    } catch (e) {
        console.error('[Decryptor] 복호화 예외 발생:', e);
        return null;
    }
}


/***/ }),

/***/ 605:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  ej: function() { return /* reexport */ LogBox; },
  fo: function() { return /* reexport */ MenuModal; },
  ze: function() { return /* reexport */ Notifier; },
  c9: function() { return /* binding */ showProgressModal; }
});

// UNUSED EXPORTS: FormRuleEditor

// EXTERNAL MODULE: ./src/core/config.js
var core_config = __webpack_require__(899);
// EXTERNAL MODULE: ./src/core/EventBus.js
var EventBus = __webpack_require__(31);
// EXTERNAL MODULE: ./src/core/queue.js
var core_queue = __webpack_require__(302);
// EXTERNAL MODULE: ./src/core/parsers/RuleManager.js
var RuleManager = __webpack_require__(543);
;// ./src/core/ui/DomInspector.js
/**
 * DomInspector Module for TokiSync (Prototype v2)
 * Chrome DevTools-style DOM tree visualizer.
 * Click an element in the tree → highlights on real page + generates CSS selector.
 * No z-index / overlay issues — works entirely in a dedicated panel.
 */

class DomInspector {
    constructor() {
        this.root = document.body;
        this.treeData = null;
        this.nodeMap = [];
        this.filterText = '';
        this.onApply = null;
        this.lastSelector = '';
        this.maxDepth = 12;
        this.selectedNode = null;
    }

    /**
     * Walk the DOM and build a simplified tree.
     */
    simplify(element, depth = 0) {
        if (depth > this.maxDepth) return null;

        if (element.nodeType === Node.TEXT_NODE) {
            const text = element.textContent.replace(/\s+/g, ' ').trim();
            if (!text || text.length < 2) return null;
            return { type: 'text', value: text };
        }

        if (element.nodeType !== Node.ELEMENT_NODE) return null;

        const tag = element.tagName.toLowerCase();
        const skip = ['script','style','link','meta','noscript','iframe','svg','path','br','hr','wbr'];
        if (skip.includes(tag)) return null;

        const rect = element.getBoundingClientRect();
        const noLayout = rect.width === 0 && rect.height === 0 && tag !== 'img' && tag !== 'input' && tag !== 'br';
        if (noLayout) return null;

        const node = {
            type: 'element',
            tag,
            id: element.id || null,
            classes: [],
            attrs: {},
            text: null,
            hidden: false,
            children: [],
            elementRef: element,
            matched: false
        };

        for (const c of element.classList) {
            if (!c.startsWith('toki-') && !c.startsWith('sc-')) {
                node.classes.push(c);
            }
        }

        const style = window.getComputedStyle(element);
        node.hidden = style.display === 'none' || style.visibility === 'hidden';

        const important = ['href','src','data-num','data-src','data-lazy','data-original','alt','title','value','type','name','data-id'];
        for (const a of important) {
            const v = element.getAttribute(a);
            if (v) node.attrs[a] = v.length > 80 ? v.substring(0, 80) + '…' : v;
        }

        const directText = element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE;
        const noChildren = element.children.length === 0;
        if (directText || noChildren) {
            const t = element.textContent.replace(/\s+/g, ' ').trim();
            if (t) node.text = t.length > 80 ? t.substring(0, 80) + '…' : t;
        }

        for (const child of element.childNodes) {
            const s = this.simplify(child, depth + 1);
            if (s) node.children.push(s);
        }

        if (node.children.length === 1 && node.children[0].type === 'text' && !node.text) {
            node.text = node.children[0].value;
            node.children = [];
        }

        return node;
    }

    build() {
        this.nodeMap = [];
        this.treeData = this.simplify(this.root);
    }

    /**
     * Render the tree as DevTools-style HTML.
     */
    renderTree(node, depth = 0) {
        if (!node) return '';
        if (node.type === 'text') return '';

        const idx = this.nodeMap.length;
        this.nodeMap.push(node);
        node._idx = idx;

        const hasChildren = node.children.some(c => c.type === 'element');
        const expandByDefault = depth < 3;
        const arrow = hasChildren ? (expandByDefault ? '▼' : '▶') : '  ';

        const tagHtml = `<span class="di-tag">${node.tag}</span>`;
        const idHtml = node.id ? `<span class="di-id">#${node.id}</span>` : '';
        const clsHtml = node.classes.length > 0
            ? node.classes.map(c => `<span class="di-class">.${c}</span>`).join('')
            : '';
        const attrHtml = Object.entries(node.attrs).map(([k, v]) =>
            ` <span class="di-attr">${k}</span>="${v}"`
        ).join('');
        const textHtml = node.text
            ? ` <span class="di-text">"${node.text}"</span>`
            : '';
        const hiddenAttr = node.hidden ? ' di-dimmed' : '';

        let html = `<div class="di-line${hiddenAttr}" data-idx="${idx}" style="padding-left:${depth * 20}px">
            <span class="di-arrow">${arrow}</span>
            ${tagHtml}${idHtml}${clsHtml}${attrHtml}${textHtml}
        </div>`;

        if (hasChildren && expandByDefault) {
            const childrenHtml = node.children
                .filter(c => c.type === 'element')
                .map(c => this.renderTree(c, depth + 1))
                .join('');
            html += `<div class="di-children" data-parent="${idx}">${childrenHtml}</div>`;
        } else if (hasChildren) {
            const childrenHtml = node.children
                .filter(c => c.type === 'element')
                .map(c => this.renderTree(c, depth + 1))
                .join('');
            html += `<div class="di-children di-collapsed" data-parent="${idx}">${childrenHtml}</div>`;
        }

        return html;
    }

    filterNodes(node, text) {
        if (!node || node.type === 'text') return false;
        const lower = text.toLowerCase();
        let match = node.tag.includes(lower) ||
            node.classes.some(c => c.includes(lower)) ||
            (node.text && node.text.toLowerCase().includes(lower)) ||
            Object.values(node.attrs).some(v => v.toLowerCase().includes(lower));
        for (const child of node.children) {
            if (this.filterNodes(child, text)) match = true;
        }
        node.matched = match;
        return match;
    }

    renderTreeFiltered(node, depth = 0) {
        if (!node || node.type === 'text') return '';
        if (!node.matched) {
            for (const child of node.children) {
                if (child.type === 'element' && child.matched) {
                    return this.renderTreeFiltered(child, depth);
                }
            }
            return '';
        }

        const idx = this.nodeMap.length;
        this.nodeMap.push(node);
        node._idx = idx;

        const hasVisibleChildren = node.children.some(c => c.type === 'element' && c.matched);
        const arrow = hasVisibleChildren ? '▼' : '  ';

        const tagHtml = `<span class="di-tag">${node.tag}</span>`;
        const idHtml = node.id ? `<span class="di-id">#${node.id}</span>` : '';
        const clsHtml = node.classes.length > 0
            ? node.classes.map(c => `<span class="di-class">.${c}</span>`).join('')
            : '';
        const attrHtml = Object.entries(node.attrs).map(([k, v]) =>
            ` <span class="di-attr">${k}</span>="${v}"`
        ).join('');
        const textHtml = node.text
            ? ` <span class="di-text">"${node.text}"</span>`
            : '';
        const hiddenAttr = node.hidden ? ' di-dimmed' : '';
        const matchedAttr = node.matched ? ' di-highlight' : '';

        let html = `<div class="di-line${hiddenAttr}${matchedAttr}" data-idx="${idx}" style="padding-left:${depth * 20}px">
            <span class="di-arrow">${arrow}</span>
            ${tagHtml}${idHtml}${clsHtml}${attrHtml}${textHtml}
        </div>`;

        const childrenHtml = node.children
            .filter(c => c.type === 'element' && c.matched)
            .map(c => this.renderTreeFiltered(c, depth + 1))
            .join('');

        if (childrenHtml) {
            html += `<div class="di-children" data-parent="${idx}">${childrenHtml}</div>`;
        }

        return html;
    }

    /**
     * Generate a robust CSS selector from a node.
     */
    toSelector(node) {
        if (!node || node.type !== 'element') return '';

        if (node.id) {
            const s = `#${node.id}`;
            if (document.querySelectorAll(s).length === 1) return s;
        }

        if (node.classes.length > 0) {
            const s = `${node.tag}.${node.classes.join('.')}`;
            if (document.querySelectorAll(s).length === 1) return s;
        }

        const path = [];
        let el = node.elementRef;
        while (el && el !== document.body && el !== document.documentElement) {
            const tag = el.tagName.toLowerCase();
            const id = el.id;
            const classes = Array.from(el.classList).filter(c => !c.startsWith('toki-') && !c.startsWith('sc-'));

            let seg = tag;
            if (id) { path.unshift(`#${id}`); break; }
            if (classes.length > 0) seg += `.${classes.join('.')}`;

            const parent = el.parentElement;
            if (parent) {
                const sameTag = Array.from(parent.children).filter(c => c.tagName === el.tagName);
                if (sameTag.length > 1) {
                    const nth = sameTag.indexOf(el) + 1;
                    seg += `:nth-child(${nth})`;
                }
            }

            path.unshift(seg);
            el = el.parentElement;
        }

        let sel = path.join(' > ');
        if (node.classes.length > 0) {
            const s = `${node.tag}.${node.classes.join('.')}`;
            if (document.querySelectorAll(s).length === 1) return s;
        }

        return sel;
    }

    /**
     * Show inspector panel.
     */
    show(container, onApply) {
        this.onApply = onApply;
        this.build();
        this._render(container);
    }

    _render(container) {
        this.nodeMap = [];
        const treeHtml = this.renderTree(this.treeData);

        container.innerHTML = `
            <div class="di-panel">
                <div class="di-toolbar">
                    <div class="di-title">🧬 DOM 검사기</div>
                    <div class="di-toolbar-right">
                        <span class="di-count">${this.nodeMap.length} elements</span>
                        <button class="di-refresh" title="DOM 새로고침">↻</button>
                    </div>
                </div>
                <div class="di-filter-bar">
                    <input type="text" class="di-filter" placeholder="🔍 태그 / 클래스 / 텍스트 검색..." />
                </div>
                <div class="di-tree-wrap">
                    <div class="di-tree">${treeHtml}</div>
                </div>
                <div class="di-detail" id="di-detail">
                    <div class="di-detail-header">📋 요소 정보</div>
                    <div class="di-detail-body" id="di-detail-body">
                        <span class="di-detail-placeholder">트리에서 요소를 클릭하세요</span>
                    </div>
                </div>
            </div>
        `;

        this._bindEvents(container);
    }

    _bindEvents(container) {
        const tree = container.querySelector('.di-tree');
        const filter = container.querySelector('.di-filter');
        const refresh = container.querySelector('.di-refresh');
        const detailBody = container.querySelector('#di-detail-body');

        // Arrow click → toggle expand/collapse only
        tree.addEventListener('click', (e) => {
            const arrow = e.target.closest('.di-arrow');
            if (!arrow) return;
            const line = arrow.closest('.di-line');
            if (!line) return;
            const parent = line.dataset.idx;
            const children = tree.querySelector(`.di-children[data-parent="${parent}"]`);
            if (!children) return;
            const isOpen = !children.classList.contains('di-collapsed');
            children.classList.toggle('di-collapsed');
            arrow.textContent = isOpen ? '▶' : '▼';
        });

        // Line click (not on arrow) → select element
        tree.addEventListener('click', (e) => {
            if (e.target.closest('.di-arrow')) return;
            const line = e.target.closest('.di-line');
            if (!line) return;

            const idx = parseInt(line.dataset.idx);
            const node = this.nodeMap[idx];
            if (!node) return;

            this.selectedNode = node;

            tree.querySelectorAll('.di-line').forEach(l => l.classList.remove('di-selected'));
            line.classList.add('di-selected');

            this._highlightOnPage(node, detailBody);
        });

        // Filter
        let filterTimer;
        filter.oninput = () => {
            clearTimeout(filterTimer);
            filterTimer = setTimeout(() => {
                this._applyFilter(filter.value, tree);
            }, 200);
        };

        // Refresh
        refresh.onclick = () => {
            this._render(container);
        };
    }

    _highlightOnPage(node, detailBody) {
        const el = node.elementRef;
        const selector = this.toSelector(node);
        this.lastSelector = selector;

        // Scroll + glow on page
        try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.outline = '3px solid #6a5acd';
            el.style.outlineOffset = '2px';
            el.style.transition = 'outline 0.2s';
            setTimeout(() => { el.style.outline = ''; }, 2500);
        } catch (e) {}

        // Build detail panel
        const tagStr = node.tag;
        const idStr = node.id ? `#${node.id}` : '-';
        const clsStr = node.classes.length > 0 ? node.classes.join(' ') : '-';
        const textStr = node.text ? node.text.substring(0, 100) : '-';
        const selectorStr = selector;

        // Encode selector safely for the code element
        const encodedSelector = selectorStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        detailBody.innerHTML = `
            <div class="di-detail-grid">
                <div class="di-detail-label">태그</div>
                <div class="di-detail-val"><span class="di-tag">${tagStr}</span></div>
                <div class="di-detail-label">ID</div>
                <div class="di-detail-val"><span class="di-id">${idStr}</span></div>
                <div class="di-detail-label">클래스</div>
                <div class="di-detail-val"><span class="di-class">${clsStr}</span></div>
                <div class="di-detail-label">텍스트</div>
                <div class="di-detail-val di-detail-text">${textStr}</div>
            </div>
            <div class="di-detail-selector">
                <div class="di-detail-label">생성된 셀렉터</div>
                <div class="di-selector-row">
                    <code class="di-selector-code">${encodedSelector}</code>
                    <div class="di-selector-actions">
                        <button class="di-btn-copy">📋</button>
                        <button class="di-btn-apply" title="현재 입력 필드에 셀렉터 적용">📝 적용</button>
                    </div>
                </div>
            </div>
        `;

        // Copy button — closure over selectorStr
        const copyBtn = detailBody.querySelector('.di-btn-copy');
        if (copyBtn) {
            copyBtn.onclick = () => {
                this._copyToClipboard(selectorStr);
                copyBtn.textContent = '✅';
                setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
            };
        }

        // Apply button → triggers parent callback
        const applyBtn = detailBody.querySelector('.di-btn-apply');
        if (applyBtn) {
            applyBtn.onclick = () => {
                if (this.onApply && selector) {
                    this.onApply(selector);
                    applyBtn.textContent = '✅ 적용됨';
                    setTimeout(() => { applyBtn.textContent = '📝 적용'; }, 1500);
                }
            };
        }
    }

    _applyFilter(text, tree) {
        this.filterText = text;
        this.nodeMap = [];

        if (!text.trim()) {
            this.build();
            tree.innerHTML = this.renderTree(this.treeData);
            return;
        }

        this.filterNodes(this.treeData, text);
        tree.innerHTML = this.renderTreeFiltered(this.treeData);
    }

    _copyToClipboard(text) {
        // 1. GM_setClipboard (Tampermonkey native)
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text);
                return;
            }
            if (typeof GM !== 'undefined' && GM.setClipboard) {
                GM.setClipboard(text);
                return;
            }
        } catch (e) {}

        // 2. Modern clipboard API (secure context)
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
                return;
            }
        } catch (e) {}

        // 3. Legacy fallback (textarea + execCommand)
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch (e) {
            console.warn('[DomInspector] 클립보드 복사 실패:', e);
        }
    }

}

// EXTERNAL MODULE: ./src/core/parsers/SubscriptionManager.js
var SubscriptionManager = __webpack_require__(330);
;// ./src/core/ui/FormRuleEditor.js
/**
 * FormRuleEditor Module for TokiSync
 * Specialist UI for managing parsing rules with a sleek Form-Tree Hybrid interface.
 */






class FormRuleEditor {
    constructor() {
        this.rules = RuleManager/* RuleManager */.u.getParserRules() || [];
        this.overlay = null;
        this.currentRuleIndex = 0;
        this.isDropperActive = false;
        this.targetDropperInputId = null;
        this.inspectorMode = false;
        this.domInspector = null;
        this.subMode = false;
        this.activeInputId = null;
        
        // Ensure at least one rule exists
        if (this.rules.length === 0) {
            this.rules.push(this.createNewRuleDraft());
        }
    }

    createNewRuleDraft() {
        return {
            id: 'new_site_rule',
            name: '신규 사이트 규칙',
            urlPattern: '.*example\\\\.com/.*',
            category: 'Webtoon',
            meta: {
                title: 'h1.title',
                author: 'span.author',
                thumb: { selector: 'div.thumb > img', attr: 'src' }
            },
            list: {
                container: 'ul.list',
                item: 'li.item',
                num: 'span.no',
                title: 'a.link',
                link: { selector: 'a.link', attr: 'href' }
            },
            viewer: {
                fetchMethod: 'iframe',
                imageRegex: 'https?:\\\\/\\\\/[a-zA-Z0-9_\\\\.\\\\/-]+\\\\.(?:jpg|png|webp|gif)',
                imageContainer: 'div.viewer',
                imageItem: 'img',
                lazyAttrOptions: ['data-src', 'src'],
                exclude: ''
            }
        };
    }

    show(popupDoc = document) {
        const doc = popupDoc;
        if (doc.getElementById('toki-form-editor-overlay')) return;

        this.overlay = doc.createElement('div');
        this.overlay.id = 'toki-form-editor-overlay';
        this.overlay.className = 'toki-modal-overlay';
        this.overlay.style.zIndex = '10001';
        
        this.render();
        doc.body.appendChild(this.overlay);
        this.bindEvents(doc);
        this.loadRuleIntoForm();
    }

    render() {
        const scriptVer =  true ? "1.26.4" : 0;
        this.overlay.innerHTML = `
            <div class="toki-modal toki-form-editor-modal">
                <div class="toki-modal-header">
                    <div class="toki-modal-title">📝 간편 규칙 편집기 (Form Editor) <span class="toki-text-xs">v${scriptVer}</span></div>
                    <div class="toki-flex-row-8">
                        <button class="toki-btn-rule" id="form-btn-export">📤 내보내기</button>
                        <button class="toki-btn-rule" id="form-btn-import">📥 가져오기</button>
                        <button class="toki-btn-rule toki-btn-inspector" id="form-btn-inspector">🧬 DOM Inspector</button>
                        <button class="toki-btn-rule toki-btn-sub" id="form-btn-sub">📡 구독 관리</button>
                        <button class="toki-modal-close" id="form-close-btn">&times;</button>
                    </div>
                </div>
                <div class="toki-form-editor-container">
                    <!-- Left Column: Input Form -->
                    <div class="toki-form-editor-left">
                        <!-- 1. 기본 정보 카드 -->
                        <div class="toki-form-card">
                            <div class="toki-form-card-title">
                                <span>🌐 기본 사이트 정보</span>
                                <select id="form-rule-selector" class="toki-select toki-btn-sm" style="width: auto; padding: 4px 24px 4px 10px; margin: 0;">
                                    ${this.rules.map((r, i) => `<option value="${i}">${r.name} (${r.id})</option>`).join('')}
                                    <option value="new">+ 신규 규칙 추가</option>
                                </select>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">규칙 ID</span>
                                    <input type="text" id="rule-id" class="toki-input-compact" placeholder="예: blacktoon_webtoon">
                                </div>
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">규칙 이름</span>
                                    <input type="text" id="rule-name" class="toki-input-compact" placeholder="예: 블랙툰 웹툰 규칙">
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">URL 패턴 (정규식)</span>
                                    <input type="text" id="rule-urlPattern" class="toki-input-compact" placeholder="예: .*/webtoon/.*">
                                </div>
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">카테고리</span>
                                    <select id="rule-category" class="toki-select" style="padding: 10px 14px; font-size:13px; height:38px;">
                                        <option value="Webtoon">Webtoon (웹툰)</option>
                                        <option value="Manga">Manga (만화)</option>
                                        <option value="Novel">Novel (소설)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- 2. 작품 정보(Meta) 카드 -->
                        <div class="toki-form-card">
                            <div class="toki-form-card-title">📖 작품 정보 추출 (Meta)</div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">제목 셀렉터</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-meta-title" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-meta-title" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-meta-title" class="toki-input-compact toki-flex-1" placeholder="예: h1.hero-v2-title">
                                        <span class="toki-badge-match zero" id="match-rule-meta-title">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-meta-title" style="display: none;"></div>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">작가 셀렉터</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-meta-author" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-meta-author" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-meta-author" class="toki-input-compact toki-flex-1" placeholder="예: div.hero-v2-author">
                                        <span class="toki-badge-match zero" id="match-rule-meta-author">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-meta-author" style="display: none;"></div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">썸네일 이미지 셀렉터</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-meta-thumb-selector" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-meta-thumb-selector" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-meta-thumb-selector" class="toki-input-compact toki-flex-1" placeholder="예: div.hero-v2-thumb img">
                                        <span class="toki-badge-match zero" id="match-rule-meta-thumb-selector">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-meta-thumb-selector" style="display: none;"></div>
                                </div>
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">썸네일 추출 속성</span>
                                    <input type="text" id="rule-meta-thumb-attr" class="toki-input-compact" placeholder="기본값: src (비워두면 src)">
                                </div>
                            </div>
                        </div>

                        <!-- 3. 회차 목록(List) 카드 -->
                        <div class="toki-form-card">
                            <div class="toki-form-card-title">📜 회차 목록 추출 (List)</div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">목록 부모 컨테이너</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-list-container" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-list-container" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-container" class="toki-input-compact toki-flex-1" placeholder="예: ul.ep-list-v2">
                                        <span class="toki-badge-match zero" id="match-rule-list-container">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-list-container" style="display: none;"></div>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 아이템 (개별 행)</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-list-item" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-list-item" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-item" class="toki-input-compact toki-flex-1" placeholder="예: li.ep-row-v2">
                                        <span class="toki-badge-match zero" id="match-rule-list-item">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-list-item" style="display: none;"></div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 번호 셀렉터 (num)</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-list-num" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-list-num" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-num" class="toki-input-compact toki-flex-1" placeholder='예: span.no 또는 [{"attr":"data-num"}, "span.ne-num"]'>
                                        <span class="toki-badge-match zero" id="match-rule-list-num">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-list-num" style="display: none;"></div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 링크 셀렉터</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-list-link-selector" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-list-link-selector" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-link-selector" class="toki-input-compact toki-flex-1" placeholder="예: a.ep-row-v2-link">
                                        <span class="toki-badge-match zero" id="match-rule-list-link-selector">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-list-link-selector" style="display: none;"></div>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 제목 셀렉터</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-list-title" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-list-title" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-title" class="toki-input-compact toki-flex-1" placeholder="예: .ep-row-v2-title strong">
                                        <span class="toki-badge-match zero" id="match-rule-list-title">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-list-title" style="display: none;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. 본문/뷰어(Viewer) 카드 -->
                        <div class="toki-form-card">
                            <div class="toki-form-card-title">🖼️ 본문/이미지 추출 (Viewer)</div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">수집 방식 (fetchMethod)</span>
                                    <select id="rule-viewer-fetchMethod" class="toki-select" style="padding: 10px 14px; font-size:13px; height:38px;">
                                        <option value="iframe">iframe (정적/동적 DOM 수집)</option>
                                        <option value="api">api (소설 및 암호화 API)</option>
                                        <option value="direct">direct (단일 다이렉트 패치)</option>
                                    </select>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">뷰어 본문/이미지 부모 컨테이너</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-viewer-imageContainer" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-viewer-imageContainer" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-viewer-imageContainer" class="toki-input-compact toki-flex-1" placeholder="예: div.vw-imgs, article.viewer">
                                        <span class="toki-badge-match zero" id="match-rule-viewer-imageContainer">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-viewer-imageContainer" style="display: none;"></div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">뷰어 이미지/문단 태그</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-viewer-imageItem" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-viewer-imageItem" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-viewer-imageItem" class="toki-input-compact toki-flex-1" placeholder="예: img 또는 p">
                                        <span class="toki-badge-match zero" id="match-rule-viewer-imageItem">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-viewer-imageItem" style="display: none;"></div>
                                </div>
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">레이지로드 속성 후보 (반점 구분)</span>
                                    <input type="text" id="rule-viewer-lazyAttrOptions" class="toki-input-compact" placeholder="예: data-src, data-lazy, src">
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row" style="grid-column: span 1;">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">제외 셀렉터 (exclude) (반점 구분)</span>
                                        <div class="toki-flex-row-8">
                                            <span class="toki-form-dropper-btn" data-target="rule-viewer-exclude" title="화면에서 스포이드로 선택">🎯</span>
                                            <span class="toki-form-verify-btn" data-target="rule-viewer-exclude" title="실제 파서로 검증">🔍</span>
                                        </div>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-viewer-exclude" class="toki-input-compact toki-flex-1" placeholder="예: .ad-banner, #sponsored-bottom">
                                        <span class="toki-badge-match zero" id="match-rule-viewer-exclude">0</span>
                                    </div>
                                    <div class="toki-form-verify-result" id="verify-rule-viewer-exclude" style="display: none;"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: JSON Preview & Sandbox -->
                    <div class="toki-form-editor-right">
                        <div class="toki-flex-between">
                            <span class="toki-form-row-label" style="font-weight: 800;">⚙️ 실시간 완성 JSON 규칙</span>
                            <span id="form-json-status" class="toki-badge-match ok">✓ Valid</span>
                        </div>
                        <textarea class="toki-tree-json-preview toki-flex-1" id="form-json-editor" spellcheck="false" style="font-size: 11px; line-height:1.4;"></textarea>
                        
                        <div class="toki-form-card" style="margin: 0; padding: 12px; background: rgba(0,0,0,0.02);">
                            <div class="toki-form-row-label" style="font-weight: 800; color: var(--toki-primary);">🧪 로컬 셀렉터 가상 테스트</div>
                            <div class="toki-flex-row-8">
                                <input type="text" id="form-test-url" class="toki-input-compact toki-flex-1" style="height:32px; font-size:12px; padding: 4px 10px;" value="${window.location.href}">
                                <button class="toki-btn-rule toki-text-success" id="form-btn-test" style="height:32px; padding:0 12px;">테스트</button>
                            </div>
                            <div id="form-test-result" class="toki-text-xs" style="margin-top: 4px; color: var(--toki-text-muted);">
                                현재 페이지 또는 지정한 URL 주소의 DOM 파싱 검증을 원클릭으로 가상 작동해보세요.
                            </div>
                        </div>
                        
                        <button class="toki-btn-action toki-btn-lavender" id="form-btn-save" style="height: 48px; border-radius:14px; box-shadow: 0 4px 12px rgba(106, 90, 205, 0.2);">
                            저장 및 즉시 스케줄러 적용
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    loadRuleIntoForm() {
        const rule = this.rules[this.currentRuleIndex];
        if (!rule) return;

        // Base
        this.setValue('rule-id', rule.id || '');
        this.setValue('rule-name', rule.name || '');
        this.setValue('rule-urlPattern', rule.urlPattern || '');
        this.setValue('rule-category', rule.category || 'Webtoon');

        // Meta
        this.setValue('rule-meta-title', typeof rule.meta?.title === 'string' ? rule.meta.title : rule.meta?.title?.selector || '');
        this.setValue('rule-meta-author', typeof rule.meta?.author === 'string' ? rule.meta.author : rule.meta?.author?.selector || '');
        this.setValue('rule-meta-thumb-selector', rule.meta?.thumb?.selector || (typeof rule.meta?.thumb === 'string' ? rule.meta.thumb : ''));
        this.setValue('rule-meta-thumb-attr', rule.meta?.thumb?.attr || '');

        // List
        this.setValue('rule-list-container', rule.list?.container || '');
        this.setValue('rule-list-item', rule.list?.item || '');
        const numVal = rule.list?.num || '';
        this.setValue('rule-list-num', typeof numVal === 'object' ? JSON.stringify(numVal) : numVal);
        this.setValue('rule-list-link-selector', rule.list?.link?.selector || (typeof rule.list?.link === 'string' ? rule.list.link : ''));
        this.setValue('rule-list-title', rule.list?.title || '');

        // Viewer
        this.setValue('rule-viewer-fetchMethod', rule.viewer?.fetchMethod || 'iframe');
        this.setValue('rule-viewer-imageContainer', rule.viewer?.imageContainer || '');
        this.setValue('rule-viewer-imageItem', rule.viewer?.imageItem || '');
        this.setValue('rule-viewer-lazyAttrOptions', Array.isArray(rule.viewer?.lazyAttrOptions) ? rule.viewer.lazyAttrOptions.join(', ') : '');
        
        const excludeRule = rule.viewer?.exclude || rule.viewer?.remove || '';
        const excludeStr = Array.isArray(excludeRule) ? excludeRule.join(', ') : excludeRule;
        this.setValue('rule-viewer-exclude', excludeStr);

        this.updateJsonPreview();
        this.runRealtimeDomMatchCount();
        this._initFocusTracking();
    }

    /**
     * Track which form input is currently focused, for Inspector Apply.
     */
    _initFocusTracking() {
        const inputIds = [
            'rule-id','rule-name','rule-urlPattern','rule-category',
            'rule-meta-title','rule-meta-author','rule-meta-thumb-selector','rule-meta-thumb-attr',
            'rule-list-container','rule-list-item','rule-list-num','rule-list-link-selector','rule-list-title',
            'rule-viewer-fetchMethod','rule-viewer-imageContainer','rule-viewer-imageItem',
            'rule-viewer-lazyAttrOptions','rule-viewer-exclude'
        ];
        inputIds.forEach(id => {
            const el = this.overlay.querySelector('#' + id);
            if (el) {
                el.onfocus = () => { this.activeInputId = id; };
            }
        });
    }

    setValue(id, val) {
        const el = this.overlay.querySelector('#' + id);
        if (el) el.value = val;
    }

    getValue(id) {
        const el = this.overlay.querySelector('#' + id);
        return el ? el.value.trim() : '';
    }

    updateJsonPreview() {
        const rule = this.rules[this.currentRuleIndex];
        if (!rule) return;

        // Sync form values into rule object
        rule.id = this.getValue('rule-id');
        rule.name = this.getValue('rule-name');
        rule.urlPattern = this.getValue('rule-urlPattern');
        rule.category = this.getValue('rule-category');

        rule.meta = {
            title: this.getValue('rule-meta-title'),
            author: this.getValue('rule-meta-author'),
            thumb: {
                selector: this.getValue('rule-meta-thumb-selector'),
                attr: this.getValue('rule-meta-thumb-attr') || 'src'
            }
        };

        const numRaw = this.getValue('rule-list-num');
        let numParsed = numRaw;
        if (numRaw.startsWith('{') || numRaw.startsWith('[')) {
            try {
                numParsed = JSON.parse(numRaw);
            } catch (e) {
                numParsed = numRaw;
            }
        }

        rule.list = {
            container: this.getValue('rule-list-container'),
            item: this.getValue('rule-list-item'),
            num: numParsed || 'span.no',
            title: this.getValue('rule-list-title'),
            link: {
                selector: this.getValue('rule-list-link-selector'),
                attr: 'href'
            }
        };

        const lazyStr = this.getValue('rule-viewer-lazyAttrOptions');
        const excludeStr = this.getValue('rule-viewer-exclude');
        const excludeArray = excludeStr ? excludeStr.split(',').map(s => s.trim()).filter(s => s) : [];

        rule.viewer = {
            fetchMethod: this.getValue('rule-viewer-fetchMethod'),
            imageRegex: rule.viewer?.imageRegex || 'https?:\\\\/\\\\/[a-zA-Z0-9_\\\\.\\\\/-]+\\\\.(?:jpg|png|webp|gif)',
            imageContainer: this.getValue('rule-viewer-imageContainer'),
            imageItem: this.getValue('rule-viewer-imageItem'),
            lazyAttrOptions: lazyStr ? lazyStr.split(',').map(s => s.trim()) : []
        };

        if (excludeArray.length > 0) {
            rule.viewer.exclude = excludeArray;
            if (rule.viewer.remove) delete rule.viewer.remove;
        } else {
            if (rule.viewer.exclude) delete rule.viewer.exclude;
            if (rule.viewer.remove) delete rule.viewer.remove;
        }

        const editor = this.overlay.querySelector('#form-json-editor');
        if (editor) {
            editor.value = JSON.stringify(rule, null, 2);
        }
    }

    runRealtimeDomMatchCount() {
        const selectors = [
            'rule-meta-title',
            'rule-meta-author',
            'rule-meta-thumb-selector',
            'rule-list-container',
            'rule-list-item',
            'rule-list-num',
            'rule-list-link-selector',
            'rule-list-title',
            'rule-viewer-imageContainer',
            'rule-viewer-imageItem',
            'rule-viewer-exclude'
        ];

        selectors.forEach(id => {
            const selector = this.getValue(id);
            const badge = this.overlay.querySelector('#match-' + id);
            if (!badge) return;

            if (!selector) {
                badge.textContent = '0';
                badge.className = 'toki-badge-match zero';
                return;
            }

            let querySelectorStr = selector;
            if (id === 'rule-list-num' && (selector.startsWith('{') || selector.startsWith('['))) {
                try {
                    const parsed = JSON.parse(selector);
                    const extractSelector = (cfg) => typeof cfg === 'string' ? cfg : cfg.selector;
                    if (Array.isArray(parsed)) {
                        for (const cfg of parsed) {
                            const sel = extractSelector(cfg);
                            if (sel) { querySelectorStr = sel; break; }
                        }
                        if (querySelectorStr === selector) {
                            querySelectorStr = this.getValue('rule-list-item') || '';
                        }
                    } else {
                        querySelectorStr = extractSelector(parsed) || '';
                    }
                    if (!querySelectorStr) {
                        querySelectorStr = this.getValue('rule-list-item') || '';
                    }
                } catch(e) {
                    querySelectorStr = '';
                }
            }

            try {
                const count = querySelectorStr ? document.querySelectorAll(querySelectorStr).length : 0;
                badge.textContent = count;
                if (count > 0) {
                    badge.className = 'toki-badge-match ok';
                } else {
                    badge.className = 'toki-badge-match zero';
                }
            } catch (e) {
                badge.textContent = 'Err';
                badge.className = 'toki-badge-match error';
            }
        });
    }

    /**
     * Run the test button logic — delegates via EventBus.
     */
    async _runTest(overlay) {
        const res = overlay.querySelector('#form-test-result');
        if (!res) return;
        res.textContent = '⏳ 파싱 테스트 작동 중...';

        try {
            const data = await EventBus/* EventBus */.l.request(EventBus/* EVT */.c.PARSE_TEST, {
                url: overlay.querySelector('#form-test-url').value,
                rule: this.rules[this.currentRuleIndex],
                category: this.rules[this.currentRuleIndex]?.category || 'Webtoon'
            }, 30000);
            if (res) res.innerHTML = data.html;
        } catch (err) {
            if (res) res.innerHTML = `<div class="toki-text-danger">❌ 실패: ${err.message}</div>`;
        }
    }

    /**
     * Save rules and notify system (extracted for reuse).
     */
    _saveRules() {
        this.updateJsonPreview();
        RuleManager/* RuleManager */.u.saveParserRules(this.rules);
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.RULE_CACHE_CLEAR);
        const status = this.overlay.querySelector('#form-json-status');
        if (status) {
            status.textContent = '💾 저장됨!';
            status.className = 'toki-badge-match ok';
            setTimeout(() => { status.textContent = '✓ Valid'; }, 1500);
        }
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.LOG, {
            msg: '[FormEditor] 새로운 파싱 규칙이 디스크 큐 세마포어에 즉시 영속 반영되었습니다.',
            level: 'success'
        });
    }

    /**
     * 🧬 Toggle between JSON editor and DOM Inspector in the right panel.
     */
    toggleInspector() {
        this.inspectorMode = !this.inspectorMode;
        const rightPanel = this.overlay.querySelector('.toki-form-editor-right');
        const btn = this.overlay.querySelector('#form-btn-inspector');
        if (!rightPanel) return;

        if (this.inspectorMode) {
            btn.textContent = '📄 JSON 에디터';
            btn.classList.add('active');
            rightPanel.innerHTML = '<div id="toki-inspector-mount" class="toki-inspector-mount"></div>';
            const mount = rightPanel.querySelector('#toki-inspector-mount');
            if (!this.domInspector) this.domInspector = new DomInspector();
            this.domInspector.show(mount, (selector) => {
                this.applyFromInspector(selector);
            });
        } else {
            btn.textContent = '🧬 DOM Inspector';
            btn.classList.remove('active');
            this._restoreRightPanel();
        }
    }

    /**
     * Apply selector from Inspector into the currently focused input field.
     */
    applyFromInspector(selector) {
        if (!selector) return;
        const targetId = this.activeInputId || 'rule-meta-title';
        this.setValue(targetId, selector);
        this.updateJsonPreview();
        this.runRealtimeDomMatchCount();
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.LOG, {
            msg: `[Inspector] 셀렉터 적용: ${targetId} = "${selector}"`,
            level: 'success',
            tag: 'Inspector'
        });
    }

    /**
     * 📡 Toggle subscription management panel.
     */
    async toggleSub() {
        this.subMode = !this.subMode;
        const rightPanel = this.overlay.querySelector('.toki-form-editor-right');
        const btn = this.overlay.querySelector('#form-btn-sub');
        if (!rightPanel) return;

        if (this.subMode) {
            // Exit inspector if open
            if (this.inspectorMode) {
                this.inspectorMode = false;
                const inspBtn = this.overlay.querySelector('#form-btn-inspector');
                inspBtn.textContent = '🧬 DOM Inspector';
                inspBtn.classList.remove('active');
            }
            btn.textContent = '📄 JSON 에디터';
            btn.classList.add('active');
            await this._renderSubPanel(rightPanel);
        } else {
            btn.textContent = '📡 구독 관리';
            btn.classList.remove('active');
            this._restoreRightPanel();
        }
    }

    async _renderSubPanel(container) {
        const subs = SubscriptionManager/* SubscriptionManager */.v.getSubscriptions();

        container.innerHTML = `
            <div class="sub-panel">
                <div class="sub-header">📡 구독 관리</div>
                <div class="sub-add-area">
                    <input type="text" class="sub-url-input" id="sub-url" placeholder="https://example.com/rules.json" />
                    <input type="text" class="sub-name-input" id="sub-name" placeholder="구독 이름" />
                    <button class="sub-btn-add" id="sub-btn-add">➕ 추가</button>
                </div>
                <div class="sub-list" id="sub-list">
                    ${this._renderSubList(subs)}
                </div>
                <div class="sub-actions">
                    <button class="sub-btn-refresh" id="sub-btn-refresh">🔄 전체 업데이트 확인</button>
                    <span class="sub-status" id="sub-status"></span>
                </div>
            </div>
        `;

        this._bindSubEvents(container);
    }

    _renderSubList(subs) {
        if (subs.length === 0) {
            return `<div class="sub-empty">등록된 구독이 없습니다.<br>URL을 입력하고 추가 버튼을 눌러 구독을 등록하세요.</div>`;
        }
        return subs.map((sub, i) => {
            const timeStr = sub.lastFetched
                ? new Date(sub.lastFetched).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '아직';
            const statusClass = sub.lastFetched ? 'sub-item-ok' : 'sub-item-pending';
            return `<div class="sub-item ${statusClass}">
                <div class="sub-item-info">
                    <div class="sub-item-name">${this._esc(sub.name)}</div>
                    <div class="sub-item-url">${this._esc(sub.url)}</div>
                    <div class="sub-item-meta">마지막 확인: ${timeStr}</div>
                </div>
                <div class="sub-item-actions">
                    <button class="sub-btn-refresh-sm" data-url="${this._esc(sub.url)}">🔄</button>
                    <button class="sub-btn-remove" data-url="${this._esc(sub.url)}">🗑️</button>
                </div>
            </div>`;
        }).join('');
    }

    _bindSubEvents(container) {
        // Add subscription
        container.querySelector('#sub-btn-add').onclick = async () => {
            const url = container.querySelector('#sub-url').value.trim();
            const name = container.querySelector('#sub-name').value.trim() || url;
            if (!url) return;

            const status = container.querySelector('#sub-status');
            status.textContent = '⏳ 가져오는 중...';

            const sub = { url, name, enabled: true, lastFetched: null, etag: null, lastModified: null };
            try {
                const result = await SubscriptionManager/* SubscriptionManager */.v.fetchSingle(sub);
                if (result.status === 'updated') {
                    const addResult = SubscriptionManager/* SubscriptionManager */.v.addSubscription(url, name);
                    if (!addResult.ok) {
                        status.textContent = addResult.reason;
                        return;
                    }
                    SubscriptionManager/* SubscriptionManager */.v.mergeRules(result.rules, url);
                    status.textContent = `✅ ${result.rules.length}개 규칙 가져옴`;
                }
            } catch (e) {
                status.textContent = `❌ 실패: ${e.message}`;
                return;
            }

            // Refresh list
            const list = container.querySelector('#sub-list');
            list.innerHTML = this._renderSubList(SubscriptionManager/* SubscriptionManager */.v.getSubscriptions());
            this._bindSubEvents(container);
            container.querySelector('#sub-url').value = '';
            container.querySelector('#sub-name').value = '';
        };

        // Refresh all
        container.querySelector('#sub-btn-refresh').onclick = async () => {
            const status = container.querySelector('#sub-status');
            status.textContent = '⏳ 업데이트 확인 중...';
            const results = await SubscriptionManager/* SubscriptionManager */.v.checkAll();
            const updated = results.filter(r => r.status === 'updated');
            const errors = results.filter(r => r.status === 'error');
            if (updated.length > 0) status.textContent = `✅ ${updated.length}개 업데이트됨`;
            else if (errors.length > 0) status.textContent = `⚠️ ${errors.length}개 실패`;
            else status.textContent = '✓ 최신 상태';
            const list = container.querySelector('#sub-list');
            list.innerHTML = this._renderSubList(SubscriptionManager/* SubscriptionManager */.v.getSubscriptions());
            this._bindSubEvents(container);
        };

        // Individual refresh
        container.querySelectorAll('.sub-btn-refresh-sm').forEach(btn => {
            btn.onclick = async () => {
                const url = btn.dataset.url;
                const subs = SubscriptionManager/* SubscriptionManager */.v.getSubscriptions();
                const sub = subs.find(s => s.url === url);
                if (!sub) return;
                const status = container.querySelector('#sub-status');
                status.textContent = '⏳ 업데이트 확인...';
                try {
                    const result = await SubscriptionManager/* SubscriptionManager */.v.fetchSingle(sub);
                    if (result.status === 'updated') {
                        SubscriptionManager/* SubscriptionManager */.v.mergeRules(result.rules, url);
                        sub.lastFetched = Date.now();
                        sub.etag = result.etag || sub.etag;
                        sub.lastModified = result.lastModified || sub.lastModified;
                        SubscriptionManager/* SubscriptionManager */.v.saveSubscriptions(subs);
                        status.textContent = `✅ ${result.rules.length}개 업데이트`;
                    } else {
                        status.textContent = '✓ 변경 없음';
                    }
                } catch (e) {
                    status.textContent = `❌ ${e.message}`;
                }
                const list = container.querySelector('#sub-list');
                list.innerHTML = this._renderSubList(SubscriptionManager/* SubscriptionManager */.v.getSubscriptions());
                this._bindSubEvents(container);
            };
        });

        // Remove
        container.querySelectorAll('.sub-btn-remove').forEach(btn => {
            btn.onclick = () => {
                const url = btn.dataset.url;
                SubscriptionManager/* SubscriptionManager */.v.removeSubscription(url);
                const list = container.querySelector('#sub-list');
                list.innerHTML = this._renderSubList(SubscriptionManager/* SubscriptionManager */.v.getSubscriptions());
                this._bindSubEvents(container);
                const status = container.querySelector('#sub-status');
                status.textContent = '🗑️ 구독 제거됨 (규칙도 함께 삭제)';
            };
        });
    }

    _esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    /**
     * Restore the original right panel content (JSON preview + test bench).
     */
    _restoreRightPanel() {
        const rightPanel = this.overlay.querySelector('.toki-form-editor-right');
        if (!rightPanel) return;
        rightPanel.innerHTML = `
            <div class="toki-flex-between">
                <span class="toki-form-row-label" style="font-weight: 800;">⚙️ 실시간 완성 JSON 규칙</span>
                <span id="form-json-status" class="toki-badge-match ok">✓ Valid</span>
            </div>
            <textarea class="toki-tree-json-preview toki-flex-1" id="form-json-editor" spellcheck="false" style="font-size: 11px; line-height:1.4;"></textarea>
            
            <div class="toki-form-card" style="margin: 0; padding: 12px; background: rgba(0,0,0,0.02);">
                <div class="toki-form-row-label" style="font-weight: 800; color: var(--toki-primary);">🧪 로컬 셀렉터 가상 테스트</div>
                <div class="toki-flex-row-8">
                    <input type="text" id="form-test-url" class="toki-input-compact toki-flex-1" style="height:32px; font-size:12px; padding: 4px 10px;" value="${window.location.href}">
                    <button class="toki-btn-rule toki-text-success" id="form-btn-test" style="height:32px; padding:0 12px;">테스트</button>
                </div>
                <div id="form-test-result" class="toki-text-xs" style="margin-top: 4px; color: var(--toki-text-muted);">
                    현재 페이지 또는 지정한 URL 주소의 DOM 파싱 검증을 원클릭으로 가상 작동해보세요.
                </div>
            </div>
            
            <button class="toki-btn-action toki-btn-lavender" id="form-btn-save" style="height: 48px; border-radius:14px; box-shadow: 0 4px 12px rgba(106, 90, 205, 0.2);">
                저장 및 즉시 스케줄러 적용
            </button>
        `;
        this.updateJsonPreview();
        this._rebindRightPanel();
    }

    /**
     * Re-bind events on the restored right panel (JSON editor, test, save).
     */
    _rebindRightPanel() {
        const overlay = this.overlay;

        // JSON editor
        const jsonEditor = overlay.querySelector('#form-json-editor');
        if (jsonEditor) {
            jsonEditor.value = JSON.stringify(this.rules[this.currentRuleIndex], null, 2);
            jsonEditor.oninput = () => {
                const status = overlay.querySelector('#form-json-status');
                try {
                    const parsed = JSON.parse(jsonEditor.value);
                    status.textContent = '✓ Valid';
                    status.className = 'toki-badge-match ok';
                    this.rules[this.currentRuleIndex] = parsed;
                    this.loadFormFromData(parsed);
                } catch (e) {
                    status.textContent = '⚠️ Invalid';
                    status.className = 'toki-badge-match error';
                }
            };
        }

        // Test button
        const testBtn = overlay.querySelector('#form-btn-test');
        if (testBtn) {
            testBtn.onclick = () => {
                this._runTest(overlay);
            };
        }

        // Save button
        const saveBtn = overlay.querySelector('#form-btn-save');
        if (saveBtn) {
            saveBtn.onclick = () => this._saveRules();
        }
    }

    bindEvents(popupDoc = document) {
        const doc = popupDoc;
        
        // Close
        this.overlay.querySelector('#form-close-btn').onclick = () => this.overlay.remove();

        // 🧬 DOM Inspector 토글
        this.overlay.querySelector('#form-btn-inspector').onclick = () => {
            this.toggleInspector();
        };

        // 📡 구독 관리 토글
        this.overlay.querySelector('#form-btn-sub').onclick = () => {
            this.toggleSub();
        };

        // 룰 셀렉터 체인지
        const selector = this.overlay.querySelector('#form-rule-selector');
        selector.onchange = () => {
            if (selector.value === 'new') {
                const newRule = this.createNewRuleDraft();
                newRule.id = 'custom_rule_' + Date.now();
                newRule.name = '새로운 규칙 ' + (this.rules.length + 1);
                this.rules.push(newRule);
                this.currentRuleIndex = this.rules.length - 1;
                
                // Re-render select options
                selector.innerHTML = `
                    ${this.rules.map((r, i) => `<option value="${i}">${r.name} (${r.id})</option>`).join('')}
                    <option value="new">+ 신규 규칙 추가</option>
                `;
                selector.value = this.currentRuleIndex;
            } else {
                this.currentRuleIndex = parseInt(selector.value);
            }
            this.loadRuleIntoForm();
        };

        // Form inputs -> JSON Preview & Match Count
        const inputs = this.overlay.querySelectorAll('.toki-input-compact, .toki-select');
        inputs.forEach(el => {
            el.oninput = () => {
                this.updateJsonPreview();
                this.runRealtimeDomMatchCount();
            };
        });

        // JSON Preview -> Form (Reverse binding)
        const jsonEditor = this.overlay.querySelector('#form-json-editor');
        jsonEditor.oninput = () => {
            const status = this.overlay.querySelector('#form-json-status');
            try {
                const parsed = JSON.parse(jsonEditor.value);
                status.textContent = '✓ Valid';
                status.className = 'toki-badge-match ok';
                this.rules[this.currentRuleIndex] = parsed;
                // Re-populate without recursive oninput loop
                this.loadFormFromData(parsed);
            } catch (e) {
                status.textContent = '⚠️ Invalid';
                status.className = 'toki-badge-match error';
            }
        };

        // Dropper Buttons
        const droppers = this.overlay.querySelectorAll('.toki-form-dropper-btn');
        droppers.forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.getAttribute('data-target');
                this.activateDropper(targetId);
            };
        });

        // 🔍 검증(Verify) 버튼 이벤트 바인딩 — delegates via EventBus
        const verifyBtns = this.overlay.querySelectorAll('.toki-form-verify-btn');
        verifyBtns.forEach(btn => {
            btn.onclick = async () => {
                const targetId = btn.getAttribute('data-target');
                const resultEl = this.overlay.querySelector('#verify-' + targetId);
                if (!resultEl) return;

                resultEl.style.display = 'block';
                resultEl.className = 'toki-form-verify-result';
                resultEl.textContent = '⏳ 파싱 검증 중...';

                this.updateJsonPreview();
                try {
                    const data = await EventBus/* EventBus */.l.request(EventBus/* EVT */.c.PARSE_VERIFY, {
                        targetId,
                        rule: this.rules[this.currentRuleIndex],
                        domain: window.location.origin
                    }, 15000);
                    
                    resultEl.classList.add('success');
                    resultEl.textContent = data.msg;
                } catch (err) {
                    resultEl.classList.add('error');
                    resultEl.textContent = err.message;
                }
            };
        });

        // Test button
        this.overlay.querySelector('#form-btn-test').onclick = () => this._runTest(this.overlay);

        // Save Button
        this.overlay.querySelector('#form-btn-save').onclick = () => this._saveRules();

        // Export & Import
        this.overlay.querySelector('#form-btn-export').onclick = () => {
            const blob = new Blob([JSON.stringify(this.rules, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tokisync_custom_rules_${Date.now()}.json`;
            a.click();
        };

        this.overlay.querySelector('#form-btn-import').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const parsed = JSON.parse(evt.target.result);
                        const list = Array.isArray(parsed) ? parsed : (parsed.rules || [parsed]);
                        this.rules = list;
                        RuleManager/* RuleManager */.u.saveParserRules(this.rules);
                        this.currentRuleIndex = 0;
                        
                        // Reset select box options
                        const selector = this.overlay.querySelector('#form-rule-selector');
                        selector.innerHTML = `
                            ${this.rules.map((r, i) => `<option value="${i}">${r.name} (${r.id})</option>`).join('')}
                            <option value="new">+ 신규 규칙 추가</option>
                        `;
                        selector.value = 0;
                        this.loadRuleIntoForm();
                    } catch (err) {
                        alert('잘못된 규칙 JSON 파일입니다: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };
    }

    loadFormFromData(rule) {
        this.setValue('rule-id', rule.id || '');
        this.setValue('rule-name', rule.name || '');
        this.setValue('rule-urlPattern', rule.urlPattern || '');
        this.setValue('rule-category', rule.category || 'Webtoon');

        this.setValue('rule-meta-title', typeof rule.meta?.title === 'string' ? rule.meta.title : rule.meta?.title?.selector || '');
        this.setValue('rule-meta-author', typeof rule.meta?.author === 'string' ? rule.meta.author : rule.meta?.author?.selector || '');
        this.setValue('rule-meta-thumb-selector', rule.meta?.thumb?.selector || '');
        this.setValue('rule-meta-thumb-attr', rule.meta?.thumb?.attr || '');

        this.setValue('rule-list-container', rule.list?.container || '');
        this.setValue('rule-list-item', rule.list?.item || '');
        this.setValue('rule-list-link-selector', rule.list?.link?.selector || '');
        this.setValue('rule-list-title', rule.list?.title || '');

        this.setValue('rule-viewer-fetchMethod', rule.viewer?.fetchMethod || 'iframe');
        this.setValue('rule-viewer-imageContainer', rule.viewer?.imageContainer || '');
        this.setValue('rule-viewer-imageItem', rule.viewer?.imageItem || '');
        this.setValue('rule-viewer-lazyAttrOptions', Array.isArray(rule.viewer?.lazyAttrOptions) ? rule.viewer.lazyAttrOptions.join(', ') : '');
        
        const excludeRule = rule.viewer?.exclude || rule.viewer?.remove || '';
        const excludeStr = Array.isArray(excludeRule) ? excludeRule.join(', ') : excludeRule;
        this.setValue('rule-viewer-exclude', excludeStr);

        this.runRealtimeDomMatchCount();
    }

    activateDropper(targetInputId) {
        if (this.isDropperActive) return;

        this.isDropperActive = true;
        this.targetDropperInputId = targetInputId;

        // Hide form editor and main logbox completely (physical display none to bypass CSS animation forwards)
        const formOverlay = document.getElementById('toki-form-editor-overlay');
        const logBox = document.getElementById('toki-logbox');
        
        if (formOverlay) {
            formOverlay.style.display = 'none';
            formOverlay.style.pointerEvents = 'none';
        }
        if (logBox) {
            logBox.style.display = 'none';
        }

        const style = document.createElement('style');
        style.id = 'toki-dropper-style';
        style.innerHTML = `
            .toki-dropper-hover {
                outline: 3px dashed #7c3aed !important;
                outline-offset: 2px !important;
                background-color: rgba(124, 58, 237, 0.15) !important;
                cursor: crosshair !important;
                transition: outline 0.1s ease !important;
            }
        `;
        document.head.appendChild(style);

        const onMouseOver = (e) => {
            e.stopPropagation();
            if (e.target.closest('#toki-form-editor-overlay') || e.target.closest('#toki-logbox')) return;
            e.target.classList.add('toki-dropper-hover');
        };

        const onMouseOut = (e) => {
            e.stopPropagation();
            e.target.classList.remove('toki-dropper-hover');
        };

        const onClick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const element = e.target;
            element.classList.remove('toki-dropper-hover');

            const selector = this.getUniqueSelector(element);
            this.setValue(this.targetDropperInputId, selector);

            // Clean up
            document.removeEventListener('mouseover', onMouseOver, true);
            document.removeEventListener('mouseout', onMouseOut, true);
            document.removeEventListener('click', onClick, true);
            
            const styleNode = document.getElementById('toki-dropper-style');
            if (styleNode) styleNode.remove();

            // Restore form editor and logbox visibility to their default stylesheet/class states
            const restoredFormOverlay = document.getElementById('toki-form-editor-overlay');
            const restoredLogBox = document.getElementById('toki-logbox');
            
            if (restoredFormOverlay) {
                restoredFormOverlay.style.display = '';
                restoredFormOverlay.style.pointerEvents = 'auto';
            }
            if (restoredLogBox) {
                restoredLogBox.style.display = '';
            }
            this.isDropperActive = false;

            this.updateJsonPreview();
            this.runRealtimeDomMatchCount();
            
            EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.LOG, {
                msg: `[Dropper] 자동 CSS 셀렉터 감지 완료: ${selector}`,
                level: 'success',
                tag: 'Dropper'
            });
        };

        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('click', onClick, true);
    }

    getUniqueSelector(el) {
        if (!(el instanceof Element)) return '';
        const path = [];
        let current = el;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
            let selector = current.nodeName.toLowerCase();
            
            if (current.id) {
                selector += '#' + current.id;
                path.unshift(selector);
                break; // IDs are unique enough
            } else {
                let className = '';
                if (current.className) {
                    // Extract classes ignoring toki specific classes
                    const classes = current.className.split(/\\s+/).filter(c => c && !c.startsWith('toki-'));
                    if (classes.length > 0) {
                        className = '.' + classes.join('.');
                    }
                }
                selector += className;
                
                // If not unique among siblings, add nth-of-type
                let sibling = current;
                let nth = 1;
                while (sibling = sibling.previousElementSibling) {
                    if (sibling.nodeName.toLowerCase() === current.nodeName.toLowerCase()) nth++;
                }
                if (nth > 1) {
                    // Avoid nth-of-type for generic structural wrappers unless required
                    if (!className && (selector === 'div' || selector === 'li')) {
                        selector += `:nth-of-type(${nth})`;
                    }
                }
            }
            path.unshift(selector);
            current = current.parentNode;
        }

        // Refine path to make it shorter and cleaner
        let finalPath = path.join(' > ');
        // If too long, try to simplify
        if (path.length > 3) {
            const lastThree = path.slice(-3);
            finalPath = lastThree.join(' > ');
            // If still unique in document, use it
            if (document.querySelectorAll(finalPath).length === 1) {
                return finalPath;
            }
            // Otherwise try query with class of last item
            const lastItem = path[path.length - 1];
            if (lastItem.includes('.') && document.querySelectorAll(lastItem).length === 1) {
                return lastItem;
            }
        }
        return finalPath;
    }
}

;// ./src/core/ui/MenuModal.js
/**
 * MenuModal Module for TokiSync
 * Handles the main dashboard HTML and user interaction events.
 */





class MenuModal {
    static instance = null;

    constructor(handlers = {}) {
        if (MenuModal.instance) return MenuModal.instance;
        this.handlers = handlers;
        this.init();
        MenuModal.instance = this;
    }

    init() {
        // [임시] 대시보드 팝업 분리형으로, 대상 DOM 내 FAB 자동생성은 차단합니다.
    }

    getHTML() {
        return `
        <div id="toki-dashboard-popup">
            <div id="toki-dashboard-header">
                <span id="toki-dashboard-title">⚡ TokiSync 통합 대시보드</span>
                <div id="toki-dashboard-header-controls">
                    <button class="toki-btn-ghost" id="toki-btn-show-progress" title="수집 진행 상황 및 대기열">📊 진행 상황</button>
                    <button class="toki-btn-ghost" id="toki-btn-show-logs" title="실시간 수집 로그 모니터">📋 로그</button>
                    <button class="toki-btn-ghost" id="toki-btn-viewer-link" title="Open Viewer">🌐 Viewer</button>
                    <button class="toki-btn-ghost" id="toki-btn-menu-close" title="Close">❌ 닫기</button>
                </div>
            </div>
            
            <div class="toki-tabs">
                <button class="toki-tab-btn active" data-tab="download">📥 다운로드</button>
                <button class="toki-tab-btn" data-tab="settings">⚙️ 설정</button>
                <button class="toki-tab-btn" data-tab="history">📊 기록</button>
                <button class="toki-tab-btn" data-tab="tools">🛠️ 도구</button>
            </div>
            
            <div class="toki-modal-body">
                <!-- 1. Download Tab -->
                <div class="toki-tab-content active" id="toki-tab-download">
                    <div id="toki-download-actions">
                        <div class="toki-control-group">
                            <label class="toki-label">에피소드 범위 지정</label>
                            <input type="text" id="toki-range-input" class="toki-input" placeholder="예: 1,2,4-10,15 (비우면 전체)">
                            <div class="toki-text-xs toki-mt-8 toki-ml-4">쉼표(,)로 개별 번호, 하이픈(-)으로 연속 범위 지정</div>
                        </div>
                        <div class="toki-control-group toki-mb-24">
                            <label class="toki-checkbox-wrapper">
                                <input type="checkbox" id="toki-chk-force-overwrite" class="toki-checkbox-input">
                                <span class="toki-checkbox"></span>
                                <span class="toki-checkbox-label">⚠️ 강제 재다운로드 (파일 덮어쓰기)</span>
                            </label>
                        </div>
                        <div class="toki-btn-group-row">
                            <button class="toki-btn-action toki-flex-1-4" id="toki-btn-down-range">
                                <span>선택 다운로드</span>
                            </button>
                            <button class="toki-btn-action toki-btn-secondary" id="toki-btn-down-all">
                                <span>전체 다운로드</span>
                            </button>
                        </div>
                    </div>
                    
                    <div id="toki-inline-progress" style="display: none; padding: 12px; background: rgba(0,0,0,0.04); border-radius: 8px; margin-top: 12px; border: 1px solid rgba(0,0,0,0.06);">
                        <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px; display: flex; justify-content: space-between;" id="toki-inline-header">
                            <span id="toki-inline-text">수집 준비 중...</span>
                            <span id="toki-inline-percent" style="color: var(--toki-primary, #6366f1);">0%</span>
                        </div>
                        <div class="toki-progress-bar-container" style="background: rgba(0,0,0,0.08); border-radius: 4px; height: 8px; overflow: hidden; margin-bottom: 12px; position: relative;">
                            <div id="toki-inline-bar" class="toki-progress-overall-bar-fill" style="width: 0%; height: 100%; background: var(--toki-primary, #6366f1); transition: width 0.3s ease;"></div>
                        </div>
                        <div class="toki-btn-group-row" style="gap: 8px;">
                            <button class="toki-btn-action toki-btn-secondary toki-flex-1" id="toki-inline-pause" style="height: 36px; padding: 0;">
                                <span>⏸️ 일시 정지</span>
                            </button>
                            <button class="toki-btn-action toki-btn-danger toki-flex-1" id="toki-inline-stop" style="background: #ef4444; color: white; height: 36px; padding: 0; border: none;">
                                <span>⏹️ 수집 중단</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 2. Settings Tab -->
                <div class="toki-tab-content" id="toki-tab-settings">
                    <div class="toki-section-title toki-mt-0">Download Policies</div>
                    <div class="toki-control-group">
                        <label class="toki-label">저장 정책</label>
                        <select id="toki-sel-policy" class="toki-select">
                            <option value="individual">개별 파일 (Individual)</option>
                            <option value="zipOfCbzs">챕터 묶음 (ZIP of CBZs)</option>
                            <option value="native">자동 분류 (Native)</option>
                            <option value="drive">드라이브 업로드 (GoogleDrive 레거시)</option>
                            <option value="drive_kavita">드라이브 업로드 (Kavita 호환)</option>
                        </select>
                    </div>

                    <div id="toki-native-helper" class="toki-hidden toki-helper-box-blue">
                        <div class="toki-text-sm toki-text-primary toki-mb-10 toki-helper-desc">
                            ⚠️ Native 모드는 브라우저 설정 변경이 필요합니다.
                        </div>
                        <button class="toki-btn-action toki-btn-secondary toki-btn-sm" id="toki-btn-test-native">
                            📂 기능 동작 테스트 실행
                        </button>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">로컬 파일명 템플릿</label>
                        <input type="text" id="toki-sel-nametemplate" class="toki-input" placeholder="{number:4} - {title}" style="height: 36px; padding: 8px 14px; border-radius: 12px; font-size: 13px; width: 100%;">
                        <div class="toki-hint" style="font-size: 11px; color: #888; margin-top: 6px;">
                            로컬 저장 시 파일명 포맷입니다.<br>
                            치환자: <b>{number:X}</b>=X자리패딩(0~9), <b>{number}</b>=4자리패딩, <b>{rawNumber}</b>=원본번호, <b>{series}</b>=작품명, <b>{title}</b>=회차제목<br>
                            ※ 구글 드라이브(kavita 호환) 업로드 시에도 적용됩니다 (레거시 모드는 제외).
                        </div>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">다운로드 속도</label>
                        <select id="toki-sel-speed" class="toki-select">
                            <option value="cautious">신중 (3-6초)</option>
                            <option value="thorough">철저 (5-9초)</option>
                            <option value="slow">느림 (7-14초)</option>
                            <option value="very_slow">매우 느림 (10-20초)</option>
                        </select>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">이미지 스캔 속도
                            <span id="toki-scan-speed-val" style="font-weight: bold; color: var(--toki-primary, #6366f1);">1000ms</span>
                        </label>
                        <input type="range" id="toki-sel-scanspeed" min="100" max="5000" step="100" value="1000" class="toki-range" style="width: 100%;">
                        <div class="toki-hint" style="font-size: 11px; color: #888; margin-top: 4px;">
                            100ms(빠름/불안정) ─ 1000ms(기본/권장) ─ 3000ms(안정) ─ 5000ms(확실)
                        </div>
                    </div>

                    <div class="toki-section-title">Format & Rules</div>
                    <div class="toki-form-grid">
                        <div class="toki-control-group">
                            <label class="toki-label">소설 포맷</label>
                            <select id="toki-sel-novel-format" class="toki-select">
                                <option value="epub">EPUB</option>
                                <option value="txt">TXT</option>
                            </select>
                        </div>
                        <div class="toki-control-group">
                            <label class="toki-label">소설 패키징</label>
                            <select id="toki-sel-novel-mode" class="toki-select">
                                <option value="perChapter">개별 회차</option>
                                <option value="singleVolume">범위 합본</option>
                            </select>
                        </div>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">Smart Skip 민감도</label>
                        <select id="toki-sel-smartskip" class="toki-select">
                            <option value="90">90% (매우 민감)</option>
                            <option value="80">80% (민감)</option>
                            <option value="70">70% (보통)</option>
                            <option value="50">50% (기본)</option>
                        </select>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">로그 상세 수준</label>
                        <select id="toki-sel-loglevel" class="toki-select">
                            <option value="normal">디버그 (전체 로그)</option>
                            <option value="info">정보 (기본 정보)</option>
                            <option value="warn">경고 (경고 및 에러)</option>
                            <option value="error">오류 (오류만)</option>
                        </select>
                    </div>

                    <div class="toki-section-title">Cloud & Storage</div>
                    <div class="toki-control-group">
                        <label class="toki-label">GAS Script ID</label>
                        <input type="text" id="toki-sel-gas-id" class="toki-input" placeholder="AKfycb...">
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">Google Drive Folder ID</label>
                        <input type="text" id="toki-sel-folder-id" class="toki-input" placeholder="Folder ID">
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">API Key (보안)</label>
                        <input type="password" id="toki-sel-apikey" class="toki-input" placeholder="API Key">
                    </div>

                    <div class="toki-control-group toki-mt-24 toki-mb-24">
                        <button class="toki-btn-action toki-btn-gradient-green" id="toki-btn-save-settings" style="height: 48px;">
                            <span>💾 설정 저장하기</span>
                        </button>
                    </div>
                </div>

                <!-- 3. History Tab -->
                <div class="toki-tab-content" id="toki-tab-history">
                    <div class="toki-info-card">
                        <div class="toki-info-row">
                            <span class="toki-info-label">동기화 상태</span>
                            <span class="toki-info-val"><span class="toki-status-dot toki-status-online"></span>연결됨</span>
                        </div>
                        <div class="toki-info-row">
                            <span class="toki-info-label">마지막 동기화</span>
                            <span class="toki-info-val" id="toki-txt-last-sync">-</span>
                        </div>
                    </div>
                    <div class="toki-control-group">
                        <button class="toki-btn-action toki-btn-sync" id="toki-btn-sync-now">
                            <span>🔄 지금 즉시 동기화</span>
                        </button>
                    </div>
                    <p class="toki-text-xs toki-text-center toki-line-16">
                        구글 드라이브와의 연결을 확인하고 동기화 이력을 체크합니다.
                    </p>
                </div>

                <!-- 4. Tools Tab -->
                <div class="toki-tab-content" id="toki-tab-tools">
                    <div class="toki-control-group">
                        <label class="toki-label">파일 관리</label>
                        <div class="toki-btn-group-stack">
                            <button class="toki-btn-action toki-btn-secondary" id="toki-btn-migration">
                                📂 Kavita 구조 최적화
                            </button>
                            <button class="toki-btn-action toki-btn-secondary" id="toki-btn-thumb-optim">
                                🔄 썸네일 통합 및 캐시 최적화
                            </button>
                        </div>
                    </div>
                    <hr class="toki-divider">
                    <div class="toki-control-group">
                        <label class="toki-label">시스템 도구</label>
                        <div class="toki-btn-group-stack">
                            <button class="toki-btn-action toki-btn-secondary" id="toki-btn-test-extract">
                                🧪 현재 페이지 이미지/소설 추출 테스트
                            </button>
                            <button class="toki-btn-action toki-btn-lavender" id="toki-btn-form-editor">
                                📝 간편 규칙 편집기 (Form Editor)
                            </button>
                            <button class="toki-btn-action toki-btn-danger" id="toki-btn-hard-reset-queue">
                                🚨 대기열 긴급 강제 초기화
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 📊 수집 진행 상황 및 대기열 모달 -->
        <div id="toki-modal-progress" class="toki-dashboard-modal-overlay" style="display: none;">
            <div class="toki-dashboard-modal">
                <div class="toki-dashboard-modal-header">
                    <span class="toki-dashboard-modal-title">📊 수집 진행 상황 & 대기열</span>
                    <button class="toki-dashboard-modal-close" id="toki-btn-modal-progress-close" title="닫기">&times;</button>
                </div>
                <div class="toki-dashboard-modal-content">
                    <div id="toki-logbox-progress" style="display: block;">
                        <div id="toki-progress-header">
                            <span id="toki-progress-overall-text">진행률: 0% (0 / 0)</span>
                            <div id="toki-progress-overall-controls">
                                <span id="toki-btn-queue-expand" title="대기열 크게 보기" class="toki-cursor-pointer toki-progress-btn">↕️</span>
                                <span id="toki-btn-queue-reset" title="대기열 전체 비우기 (작업 중단)" class="toki-cursor-pointer toki-progress-btn">🗑️</span>
                                <span id="toki-btn-queue-pause" title="일시 정지" class="toki-cursor-pointer toki-progress-btn">⏸️</span>
                                <span id="toki-btn-queue-stop" title="수집 중단" class="toki-cursor-pointer toki-progress-btn">⏹️</span>
                            </div>
                        </div>
                        <div class="toki-progress-bar-container">
                            <div id="toki-progress-overall-bar" class="toki-progress-overall-bar-fill"></div>
                        </div>
                        <div id="toki-progress-workers-list">
                            <!-- 활성 팝업(Worker) 동적 렌더링 -->
                        </div>
                        <div id="toki-progress-queue-section" style="display: none;">
                            <div id="toki-queue-section-header">
                                <span>📋 수집 대기열 목록</span>
                            </div>
                            <div id="toki-progress-queue-list">
                                <!-- 대기열 목록 동적 렌더링 -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 📋 실시간 로그 모달 -->
        <div id="toki-modal-logs" class="toki-dashboard-modal-overlay" style="display: none;">
            <div class="toki-dashboard-modal">
                <div class="toki-dashboard-modal-header">
                    <span class="toki-dashboard-modal-title">📋 실시간 수집 로그 모니터</span>
                    <button class="toki-dashboard-modal-close" id="toki-btn-modal-logs-close" title="닫기">&times;</button>
                </div>
                <div class="toki-dashboard-modal-content">
                    <div id="toki-dashboard-log-section" style="display: flex;">
                        <div class="toki-log-tabs">
                            <button class="toki-log-tab-btn active" data-logtab="service">📋 서비스 로그</button>
                            <button class="toki-log-tab-btn" data-logtab="debug">🛠️ 디버그 콘솔</button>
                            <div class="toki-log-tabs-right">
                                <button id="toki-btn-log-clear" title="Clear Logs">🚫 비우기</button>
                            </div>
                        </div>
                        <ul id="toki-logbox-content" class="toki-log-panel active"></ul>
                        <div id="toki-debug-console" class="toki-log-panel">
                            <div id="toki-debug-console-header">
                                <button id="toki-btn-console-toggle" class="toki-console-toggle-btn on">■ 수집 중단</button>
                                <span class="toki-console-status">TokiSync 디버그 로그 수집 중</span>
                            </div>
                            <ul id="toki-debug-console-content"></ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    bindEventsToPopup(popupWindow) {
        const doc = popupWindow.document;

        // 1. Tab Switching Logic
        const tabBtns = doc.querySelectorAll('.toki-tab-btn');
        const tabContents = doc.querySelectorAll('.toki-tab-content');

        tabBtns.forEach(btn => {
            btn.onclick = () => {
                const target = btn.getAttribute('data-tab');
                tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                tabContents.forEach(c => {
                    c.classList.toggle('active', c.id === `toki-tab-${target}`);
                });
            };
        });

        // 2. Control Buttons
        const closeBtn = doc.getElementById('toki-btn-menu-close');
        if (closeBtn) {
            closeBtn.onclick = () => popupWindow.close();
        }

        const viewerLink = doc.getElementById('toki-btn-viewer-link');
        if (viewerLink) {
            viewerLink.onclick = () => {
                if (this.handlers.openViewer) this.handlers.openViewer();
            };
        }

        // 3. Download Tab Events
        const downAllBtn = doc.getElementById('toki-btn-down-all');
        if (downAllBtn) {
            downAllBtn.onclick = () => {
                const force = doc.getElementById('toki-chk-force-overwrite').checked;
                if (this.handlers.downloadAll) this.handlers.downloadAll(force);
            };
        }

        const downRangeBtn = doc.getElementById('toki-btn-down-range');
        if (downRangeBtn) {
            downRangeBtn.onclick = () => {
                const spec = doc.getElementById('toki-range-input').value.trim();
                const force = doc.getElementById('toki-chk-force-overwrite').checked;
                if (this.handlers.downloadRange) {
                    this.handlers.downloadRange(spec || undefined, force);
                }
            };
        }

        const inlinePause = doc.getElementById('toki-inline-pause');
        if (inlinePause) {
            inlinePause.onclick = () => {
                const p = (0,core_queue/* getQueuePaused */.kZ)();
                (0,core_queue/* setQueuePaused */.EB)(!p);
                EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.UPDATE_PROGRESS);
                if (p) (0,core_queue/* runSchedulerOnce */.gi)();
            };
        }

        const inlineStop = doc.getElementById('toki-inline-stop');
        if (inlineStop) {
            inlineStop.onclick = () => {
                if (popupWindow.confirm('⚠️ 모든 배치 작업을 중단하시겠습니까?')) {
                    (0,core_queue/* stopAllWorkers */.HO)(false);
                    EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.UPDATE_PROGRESS);
                }
            };
        }

        const testExtractBtn = doc.getElementById('toki-btn-test-extract');
        if (testExtractBtn) {
            testExtractBtn.onclick = () => {
                if (this.handlers.testExtraction) this.handlers.testExtraction();
            };
        }

        // 4. Settings Tab Events
        const selGasId = doc.getElementById('toki-sel-gas-id');
        const selFolderId = doc.getElementById('toki-sel-folder-id');
        const selApiKey = doc.getElementById('toki-sel-apikey');
        const selPolicy = doc.getElementById('toki-sel-policy');
        const selNameTemplate = doc.getElementById('toki-sel-nametemplate');

        const selSpeed = doc.getElementById('toki-sel-speed');
        const selScanSpeed = doc.getElementById('toki-sel-scanspeed');
        const selNovelFormat = doc.getElementById('toki-sel-novel-format');
        const selNovelTerm = doc.getElementById('toki-sel-novel-mode');
        const selSmartSkip = doc.getElementById('toki-sel-smartskip');
        const selLogLevel = doc.getElementById('toki-sel-loglevel');

        if (this.handlers.getConfig) {
            const cfg = this.handlers.getConfig();
            if (selGasId) selGasId.value = cfg.gasId || '';
            if (selFolderId) selFolderId.value = cfg.folderId || '';
            if (selApiKey) selApiKey.value = cfg.apiKey || '';
            if (selPolicy) {
                selPolicy.value = cfg.policy || 'individual';
                this.updateNativeHelper(doc, selPolicy.value);
            }
            if (selNameTemplate) selNameTemplate.value = cfg.localNameTemplate || '';
            if (selSpeed) selSpeed.value = cfg.sleepMode || 'cautious';
            if (selScanSpeed) {
                selScanSpeed.value = cfg.scanSpeed !== undefined ? String(cfg.scanSpeed) : '1000';
                const valSpan = doc.getElementById('toki-scan-speed-val');
                if (valSpan) valSpan.innerText = `${selScanSpeed.value}ms`;
                
                selScanSpeed.oninput = (e) => {
                    if (valSpan) valSpan.innerText = `${e.target.value}ms`;
                };
            }
            if (selNovelFormat) selNovelFormat.value = cfg.novelFormat || 'epub';
            if (selNovelTerm) selNovelTerm.value = cfg.novelMode || 'perChapter';
            if (selSmartSkip) selSmartSkip.value = cfg.smartSkipRatio !== undefined ? String(cfg.smartSkipRatio) : '50';
            if (selLogLevel) selLogLevel.value = cfg.logLevel || 'info';
        }

        if (selPolicy) {
            selPolicy.onchange = () => {
                if (this.handlers.setConfig) this.handlers.setConfig('TOKI_DOWNLOAD_POLICY', selPolicy.value);
                this.updateNativeHelper(doc, selPolicy.value);
            };
            this.updateNativeHelper(doc, selPolicy.value);
        }

        const testNativeBtn = doc.getElementById('toki-btn-test-native');
        if (testNativeBtn) {
            testNativeBtn.onclick = async () => {
                if (this.handlers.testNativeDownload) {
                    testNativeBtn.disabled = true;
                    testNativeBtn.textContent = '⏳ 테스트 중...';
                    const success = await this.handlers.testNativeDownload();
                    if (success) {
                        testNativeBtn.textContent = '✅ 테스트 성공 (폴더 확인)';
                        testNativeBtn.style.color = '#67c23a';
                    } else {
                        testNativeBtn.textContent = '❌ 테스트 실패 (설정 확인)';
                        testNativeBtn.style.color = '#f56c6c';
                    }
                    setTimeout(() => {
                        testNativeBtn.disabled = false;
                        testNativeBtn.textContent = '📂 자동 분류 기능 테스트';
                        testNativeBtn.style.color = '';
                    }, 3000);
                }
            };
        }

        // 9. Queue List Item & Modal Controls Event Delegation (우주 무결 안전 장치)
        const progressModalOverlay = doc.getElementById('toki-modal-progress');
        if (progressModalOverlay) {
            progressModalOverlay.addEventListener('click', (e) => {
                // 9-1. 개별 삭제 ❌
                const deleteBtn = e.target.closest('.toki-queue-item-delete');
                if (deleteBtn) {
                    const itemId = deleteBtn.getAttribute('data-id');
                    if (popupWindow.confirm('선택한 에피소드를 대기열에서 제거하시겠습니까?')) {
                        (0,core_queue/* removeQueueItem */.d$)(itemId);
                        (0,core_queue/* runSchedulerOnce */.gi)();
                        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.UPDATE_PROGRESS);
                    }
                    return;
                }

                // 9-2. 대기열 전체 비우기 (초기화) 🗑️
                const resetBtn = e.target.closest('#toki-btn-queue-reset');
                if (resetBtn) {
                    if (popupWindow.confirm('🗑️ 대기열의 모든 에피소드를 즉시 완전히 삭제하시겠습니까?\n(진행 중인 작업도 모두 강제 중단됩니다)')) {
                        (0,core_queue/* stopAllWorkers */.HO)(true);
                        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.UPDATE_PROGRESS);
                    }
                    return;
                }

                // 9-4. 일시 정지 ⏸️
                const pauseBtn = e.target.closest('#toki-btn-queue-pause');
                if (pauseBtn) {
                    const p = (0,core_queue/* getQueuePaused */.kZ)();
                    (0,core_queue/* setQueuePaused */.EB)(!p);
                    EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.UPDATE_PROGRESS);
                    if (p) (0,core_queue/* runSchedulerOnce */.gi)();
                    return;
                }

                // 9-5. 수집 중단 ⏹️
                const stopBtn = e.target.closest('#toki-btn-queue-stop');
                if (stopBtn) {
                    if (popupWindow.confirm('⚠️ 모든 배치 작업을 중단하시겠습니까?')) {
                        (0,core_queue/* stopAllWorkers */.HO)(false);
                        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.UPDATE_PROGRESS);
                    }
                    return;
                }

                // 9-6. 크게 보기 ↕️
                const expandBtn = e.target.closest('#toki-btn-queue-expand');
                if (expandBtn) {
                    const isMaximized = progressModalOverlay.classList.toggle('toki-queue-maximized');
                    expandBtn.textContent = isMaximized ? '🔽' : '↕️';
                    expandBtn.title = isMaximized ? '대기열 원래대로 보기' : '대기열 크게 보기';
                    return;
                }
            });
        }

        // 5. History Tab Events
        const syncBtn = doc.getElementById('toki-btn-sync-now');
        if (syncBtn) {
            syncBtn.onclick = async () => {
                if (this.handlers.syncHistory) {
                    syncBtn.disabled = true;
                    syncBtn.innerHTML = '<span>⏳ 동기화 중...</span>';
                    await this.handlers.syncHistory();
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = '<span>🔄 지금 즉시 동기화</span>';
                    
                    const timeEl = doc.getElementById('toki-txt-last-sync');
                    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
                }
            };
        }

        // 6. Tools Tab Events
        const migrationBtn = doc.getElementById('toki-btn-migration');
        if (migrationBtn) {
            migrationBtn.onclick = () => {
                if (this.handlers.migrateKavita) this.handlers.migrateKavita();
            };
        }

        const thumbBtn = doc.getElementById('toki-btn-thumb-optim');
        if (thumbBtn) {
            thumbBtn.onclick = () => {
                if (this.handlers.migrateThumbnails) this.handlers.migrateThumbnails();
            };
        }

        const formEditorBtn = doc.getElementById('toki-btn-form-editor');
        if (formEditorBtn) {
            formEditorBtn.onclick = () => {
                const editor = new FormRuleEditor();
                editor.show(doc);
            };
        }

        // 7. Dashboard Modal Toggle Events
        const showProgressBtn = doc.getElementById('toki-btn-show-progress');
        const progressModal = doc.getElementById('toki-modal-progress');
        const closeProgressBtn = doc.getElementById('toki-btn-modal-progress-close');
        
        if (showProgressBtn && progressModal) {
            showProgressBtn.onclick = () => {
                progressModal.style.display = 'flex';
            };
        }
        if (closeProgressBtn && progressModal) {
            closeProgressBtn.onclick = () => {
                progressModal.style.display = 'none';
            };
        }
        if (progressModal) {
            progressModal.onclick = (e) => {
                if (e.target === progressModal) {
                    progressModal.style.display = 'none';
                }
            };
        }

        const showLogsBtn = doc.getElementById('toki-btn-show-logs');
        const logsModal = doc.getElementById('toki-modal-logs');
        const closeLogsBtn = doc.getElementById('toki-btn-modal-logs-close');

        if (showLogsBtn && logsModal) {
            showLogsBtn.onclick = () => {
                logsModal.style.display = 'flex';
            };
        }
        if (closeLogsBtn && logsModal) {
            closeLogsBtn.onclick = () => {
                logsModal.style.display = 'none';
            };
        }
        if (logsModal) {
            logsModal.onclick = (e) => {
                if (e.target === logsModal) {
                    logsModal.style.display = 'none';
                }
            };
        }

        // 8. Settings Save Handler (통합 대시보드 전용 저장 연동)
        const saveSettingsBtn = doc.getElementById('toki-btn-save-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.onclick = () => {
                const newGasId = selGasId ? selGasId.value.trim() : '';
                const newFolder = selFolderId ? selFolderId.value.trim() : '';
                const newApiKey = selApiKey ? selApiKey.value.trim() : '';
                const newPolicy = selPolicy ? selPolicy.value : 'individual';
                const newNameTemplate = selNameTemplate ? selNameTemplate.value.trim() || "{number:4} - {title}" : "{number:4} - {title}";
                const newSleepMode = selSpeed ? selSpeed.value : 'agile';
                const newScanSpeed = selScanSpeed ? selScanSpeed.value : '1000';
                const newNovelFormat = selNovelFormat ? selNovelFormat.value : 'epub';
                const newNovelMode = selNovelTerm ? selNovelTerm.value : 'perChapter';
                const newSmartSkip = selSmartSkip ? selSmartSkip.value : '50';
                const newLogLevel = selLogLevel ? selLogLevel.value : 'info';
                // URL 입력 시 ID 추출 로직 병합
                let finalGasId = newGasId;
                const urlMatch = newGasId.match(/\/s\/([^\/]+)\/exec/);
                if (urlMatch) finalGasId = urlMatch[1];

                if (this.handlers.setConfig) {
                    this.handlers.setConfig('TOKI_GAS_ID', finalGasId);
                    this.handlers.setConfig('TOKI_FOLDER_ID', newFolder);
                    this.handlers.setConfig('TOKI_API_KEY', newApiKey);
                    this.handlers.setConfig('TOKI_DOWNLOAD_POLICY', newPolicy);
                    this.handlers.setConfig('TOKI_LOCAL_NAME_TEMPLATE', newNameTemplate);
                    this.handlers.setConfig('TOKI_SLEEP_MODE', newSleepMode);
                    this.handlers.setConfig('TOKI_SCAN_SPEED', newScanSpeed);
                    this.handlers.setConfig('TOKI_NOVEL_FORMAT', newNovelFormat);
                    this.handlers.setConfig('TOKI_NOVEL_MODE', newNovelMode);
                    this.handlers.setConfig('TOKI_SMART_SKIP_RATIO', newSmartSkip);
                    this.handlers.setConfig('TOKI_LOG_LEVEL', newLogLevel);
                }

                popupWindow.alert('설정이 저장되었습니다.');
            };
        }

        const hardResetBtn = doc.getElementById('toki-btn-hard-reset-queue');
        if (hardResetBtn) {
            hardResetBtn.onclick = () => {
                if (popupWindow.confirm('🚨 긴급 복원 경고 🚨\n\n대기열을 완전히 강제 초기화하고 돌고 있는 모든 팝업 워커 창을 강제 종료하시겠습니까? (이 작업은 되돌릴 수 없습니다)')) {
                    try {
                        (0,core_queue/* stopAllWorkers */.HO)(true);
                        popupWindow.alert('대기열이 성공적으로 강제 초기화되었습니다.');
                        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.UPDATE_PROGRESS);
                    } catch (e) {
                        popupWindow.alert('초기화 실패: ' + e.message);
                    }
                }
            };
        }

    }

    show() {
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.OPEN_DASHBOARD);
    }

    close() {
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.CLOSE_DASHBOARD);
    }

    toggle() {
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.TOGGLE_DASHBOARD);
    }

    updateNativeHelper(doc, policy) {
        const helper = doc.getElementById('toki-native-helper');
        if (helper) {
            if (policy === 'native') {
                helper.classList.remove('toki-hidden');
            } else {
                helper.classList.add('toki-hidden');
            }
        }
    }

    static getInstance() {
        if (!MenuModal.instance) {
            new MenuModal();
        }
        return MenuModal.instance;
    }
}

;// ./src/core/ui/ui.css
var ui_namespaceObject = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');\n\n:root {\n    --toki-primary: #2563eb;\n    --toki-primary-dark: #1d4ed8;\n    --toki-accent: #facc15;\n    --toki-bg: rgba(248, 250, 252, 0.9);\n    --toki-text: #1e293b;\n    --toki-text-muted: #64748b;\n    --toki-border: rgba(255, 255, 255, 0.6);\n    --toki-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);\n    --toki-font: 'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;\n}\n\n/* LogBox Styles */\n#toki-logbox {\n    position: fixed;\n    bottom: 100px;\n    right: 30px;\n    width: 480px;\n    height: auto;\n    min-height: 250px;\n    max-height: 500px;\n    background: var(--toki-bg);\n    color: var(--toki-text);\n    font-family: 'Cascadia Code', Consolas, monospace;\n    font-size: 12px;\n    border: 1px solid var(--toki-border);\n    border-radius: 16px;\n    z-index: 9999;\n    display: none;\n    flex-direction: column;\n    box-shadow: var(--toki-shadow);\n    backdrop-filter: blur(20px);\n    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n}\n\n#toki-logbox-header {\n    padding: 12px 16px;\n    background: rgba(255, 255, 255, 0.4);\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    border-top-left-radius: 16px;\n    border-top-right-radius: 16px;\n    cursor: move;\n}\n\n#toki-logbox-title {\n    font-weight: 700;\n    font-size: 13px;\n    letter-spacing: -0.01em;\n}\n\n#toki-logbox-controls span {\n    cursor: pointer;\n    margin-left: 12px;\n    color: var(--toki-text-muted);\n    font-size: 14px;\n    transition: transform 0.2s, color 0.2s;\n    display: inline-block;\n}\n\n#toki-logbox-controls span:hover {\n    color: var(--toki-primary);\n    transform: scale(1.15);\n}\n\n#toki-logbox-content {\n    flex: 1;\n    overflow-y: auto;\n    padding: 12px;\n    margin: 0;\n    list-style: none;\n}\n\n#toki-logbox-content li {\n    margin-bottom: 4px;\n    word-break: break-all;\n    padding: 4px 8px;\n    border-radius: 6px;\n    line-height: 1.4;\n    color: #f1f5f9; /* 밝은 회백색 지정으로 가독성 극대화 */\n}\n\n#toki-logbox-content li.critical {\n    color: #be123c;\n    font-weight: 700;\n    background: rgba(225, 29, 72, 0.1);\n    border-left: 3px solid #e11d48;\n}\n\n#toki-logbox-content li.error { color: #e11d48; }\n#toki-logbox-content li.warn { color: #d97706; }\n#toki-logbox-content li.success { color: #059669; font-weight: 600; }\n#toki-logbox-content li.info { color: #38bdf8; font-weight: 500; }\n\n/* Modal Styles */\n.toki-modal-overlay {\n    position: fixed;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n    background: rgba(15, 23, 42, 0.2);\n    backdrop-filter: blur(12px);\n    z-index: 9999;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    opacity: 0;\n    animation: tokiFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;\n}\n\n.toki-modal {\n    width: 520px;\n    max-width: 95%;\n    background: var(--toki-bg);\n    border: 1px solid var(--toki-border);\n    border-radius: 28px;\n    box-shadow: var(--toki-shadow);\n    overflow: hidden;\n    display: flex;\n    flex-direction: column;\n    transform: translateY(30px) scale(0.95);\n    animation: tokiSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;\n    backdrop-filter: blur(30px);\n    color: var(--toki-text);\n    font-family: var(--toki-font);\n}\n\n.toki-modal-header {\n    padding: 24px 32px;\n    background: rgba(255, 255, 255, 0.4);\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n.toki-modal-title {\n    font-size: 24px;\n    font-weight: 800;\n    color: #0f172a;\n    display: flex;\n    align-items: center;\n    gap: 12px;\n    letter-spacing: -0.03em;\n}\n\n.toki-modal-close {\n    background: rgba(0, 0, 0, 0.05);\n    border: none;\n    color: var(--toki-text-muted);\n    width: 36px;\n    height: 36px;\n    border-radius: 50%;\n    cursor: pointer;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n    font-size: 20px;\n}\n\n.toki-modal-close:hover {\n    background: #ef4444;\n    color: #fff;\n    transform: rotate(90deg);\n}\n\n.toki-btn-ghost {\n    background: rgba(0, 0, 0, 0.05);\n    border: none;\n    color: var(--toki-text-muted);\n    padding: 6px 14px;\n    border-radius: 12px;\n    cursor: pointer;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    transition: all 0.2s;\n    font-size: 13px;\n    font-weight: 600;\n    gap: 6px;\n}\n\n.toki-btn-ghost:hover {\n    background: rgba(0, 0, 0, 0.08);\n    color: var(--toki-text);\n}\n\n/* Tabs */\n.toki-tabs {\n    display: flex;\n    background: rgba(255, 255, 255, 0.3);\n    padding: 8px;\n    gap: 6px;\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n}\n\n.toki-tab-btn {\n    flex: 1;\n    padding: 12px;\n    background: none;\n    border: none;\n    color: var(--toki-text-muted);\n    font-size: 14px;\n    font-weight: 700;\n    cursor: pointer;\n    transition: all 0.3s;\n    border-radius: 14px;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    gap: 8px;\n}\n\n.toki-tab-btn:hover {\n    color: var(--toki-text);\n    background: rgba(255, 255, 255, 0.6);\n}\n\n.toki-tab-btn.active {\n    background: #fff;\n    color: var(--toki-primary);\n    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);\n}\n\n.toki-tab-content {\n    display: none;\n    padding: 32px;\n    animation: tokiTabFadeIn 0.4s ease-out;\n}\n\n.toki-tab-content.active { display: block; }\n\n/* Components */\n.toki-section-title {\n    font-size: 11px;\n    font-weight: 800;\n    color: var(--toki-primary);\n    text-transform: uppercase;\n    letter-spacing: 0.1em;\n    margin: 24px 0 12px 4px;\n    opacity: 0.8;\n}\n\n.toki-control-group {\n    margin-bottom: 20px;\n    position: relative;\n}\n\n.toki-label {\n    display: block;\n    font-size: 13px;\n    font-weight: 700;\n    color: var(--toki-text-muted);\n    margin-bottom: 8px;\n    margin-left: 4px;\n}\n\n.toki-input, .toki-select, .toki-textarea {\n    box-sizing: border-box;\n    width: 100%;\n    padding: 14px 18px;\n    background: rgba(255, 255, 255, 0.8);\n    border: 1px solid rgba(0, 0, 0, 0.08);\n    border-radius: 16px;\n    color: var(--toki-text) !important;\n    font-size: 15px;\n    font-weight: 600;\n    appearance: none;\n    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);\n    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);\n}\n\n.toki-input:hover, .toki-select:hover, .toki-textarea:hover {\n    border-color: var(--toki-primary);\n    background-color: #fff;\n    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);\n}\n\n.toki-input:focus, .toki-select:focus, .toki-textarea:focus {\n    outline: none;\n    border-color: var(--toki-primary);\n    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);\n    background-color: #fff;\n}\n\n.toki-textarea {\n    resize: vertical;\n    line-height: 1.5;\n}\n\n.toki-select {\n    cursor: pointer;\n    background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\");\n    background-repeat: no-repeat;\n    background-position: right 16px center;\n    background-size: 16px;\n}\n\n.toki-btn-action {\n    width: 100%;\n    height: 56px;\n    background: var(--toki-primary);\n    color: #fff !important;\n    border: none;\n    border-radius: 18px;\n    font-size: 16px;\n    font-weight: 700;\n    cursor: pointer;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 12px;\n    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n    box-shadow: 0 8px 15px rgba(37, 99, 235, 0.2);\n}\n\n.toki-btn-action:hover {\n    transform: translateY(-3px);\n    box-shadow: 0 12px 20px rgba(37, 99, 235, 0.35);\n    filter: brightness(1.05);\n}\n\n.toki-btn-secondary {\n    background: rgba(255, 255, 255, 0.8);\n    color: #475569 !important;\n    border: 1px solid rgba(0, 0, 0, 0.05);\n    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);\n}\n\n.toki-btn-secondary:hover {\n    background: #fff;\n    color: var(--toki-text) !important;\n}\n\n.toki-btn-danger {\n    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;\n    color: #ffffff !important;\n    border: none !important;\n    box-shadow: 0 4px 10px rgba(239, 68, 68, 0.2) !important;\n}\n\n.toki-btn-danger:hover {\n    background: linear-gradient(135deg, #f87171 0%, #ef4444 100%) !important;\n    box-shadow: 0 6px 15px rgba(239, 68, 68, 0.35) !important;\n}\n\n/* Status & Indicators */\n.toki-status-dot {\n    width: 8px;\n    height: 8px;\n    border-radius: 50%;\n    display: inline-block;\n    margin-right: 6px;\n}\n\n.toki-status-online {\n    background: #10b981;\n    box-shadow: 0 0 8px #10b981;\n}\n\n.toki-downloaded {\n    background: rgba(16, 185, 129, 0.08) !important;\n    border-left: 4px solid #10b981 !important;\n    opacity: 0.75;\n    transition: all 0.3s ease;\n}\n\n.toki-downloaded:hover {\n    opacity: 1;\n    background: rgba(16, 185, 129, 0.15) !important;\n}\n\n/* FAB */\n.toki-fab {\n    position: fixed;\n    bottom: 30px;\n    right: 30px;\n    width: 64px;\n    height: 64px;\n    background: linear-gradient(135deg, #2563eb, #0ea5e9);\n    border-radius: 20px;\n    box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4);\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    cursor: pointer;\n    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n    z-index: 9998;\n}\n\n.toki-fab:hover {\n    transform: translateY(-5px) rotate(5deg);\n    box-shadow: 0 20px 25px -5px rgba(37, 99, 235, 0.5);\n}\n\n.toki-fab svg {\n    width: 28px;\n    height: 28px;\n    fill: #fff;\n}\n\n\n\n.toki-btn-rule {\n    background: transparent;\n    border: 1px solid #ddd;\n    padding: 6px 12px;\n    border-radius: 8px;\n    font-size: 12px;\n    cursor: pointer;\n    transition: all 0.2s;\n}\n\n.toki-btn-rule:hover {\n    background: #f8fafc;\n    border-color: #94a3b8;\n}\n\n/* Animations */\n@keyframes tokiFadeIn {\n    from { opacity: 0; }\n    to { opacity: 1; }\n}\n\n@keyframes tokiTabFadeIn {\n    from { opacity: 0; transform: translateX(10px); }\n    to { opacity: 1; transform: translateX(0); }\n}\n\n@keyframes tokiSlideUp {\n    from { opacity: 0; transform: translateY(30px) scale(0.95); }\n    to { opacity: 1; transform: translateY(0) scale(1); }\n}\n\n/* --- Structural Layouts for Inline Replacement --- */\n\n/* Horizontal Button Row (e.g., Download buttons) */\n.toki-btn-group-row {\n    display: flex;\n    gap: 12px;\n    align-items: center;\n}\n.toki-btn-group-row .toki-btn-action {\n    height: 52px;\n    flex: 1;\n}\n.toki-btn-group-row .toki-flex-1-4 {\n    flex: 1.4;\n}\n\n/* Vertical Button Stack (e.g., Tool buttons) */\n.toki-btn-group-stack {\n    display: flex;\n    flex-direction: column;\n    gap: 8px;\n}\n.toki-btn-group-stack .toki-btn-action {\n    height: 44px;\n    justify-content: flex-start;\n    padding-left: 20px;\n}\n\n/* 1-Column Form Grid */\n.toki-form-grid {\n    display: grid;\n    grid-template-columns: 1fr;\n    gap: 14px;\n}\n\n/* Utility Shortcuts */\n.toki-flex-between { display: flex; justify-content: space-between; align-items: center; }\n.toki-divider { border: 0; border-top: 1px solid rgba(0,0,0,0.05); margin: 24px 0; }\n.toki-mt-0 { margin-top: 0 !important; }\n.toki-mt-8 { margin-top: 8px !important; }\n.toki-mt-32 { margin-top: 32px !important; }\n.toki-ml-4 { margin-left: 4px !important; }\n.toki-mb-5 { margin-bottom: 5px !important; }\n.toki-mb-10 { margin-bottom: 10px !important; }\n.toki-mb-24 { margin-bottom: 24px !important; }\n.toki-flex-1 { flex: 1; }\n.toki-flex-row { display: flex; gap: 4px; align-items: center; }\n.toki-flex-row-8 { display: flex; gap: 8px; align-items: center; }\n.toki-flex-row-10 { display: flex; gap: 10px; align-items: center; }\n\n/* Text Utilities */\n.toki-text-xs { font-size: 11px; color: #94a3b8; }\n.toki-text-sm { font-size: 12px; }\n.toki-text-base { font-size: 14px; }\n.toki-text-lg { font-size: 20px; font-weight: 700; }\n.toki-text-success { color: #4ade80 !important; }\n.toki-text-danger { color: #ff5555 !important; }\n.toki-text-primary { color: var(--toki-primary) !important; }\n.toki-text-center { text-align: center; }\n.toki-line-16 { line-height: 1.6; }\n\n/* Specialized Components */\n.toki-modal-main { padding: 32px; width: 520px; max-height: 85vh; overflow-y: auto; }\n.toki-btn-gradient-green { \n    background: linear-gradient(135deg, #10b981, #059669) !important; \n    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2) !important;\n}\n\n.toki-btn-lavender { background: #6a5acd !important; font-weight: bold !important; }\n.toki-btn-slate { background: rgba(0,0,0,0.02) !important; border-style: dashed !important; border-radius: 20px !important; }\n.toki-hidden { display: none !important; }\n\n/* Helper Boxes */\n.toki-helper-box-blue {\n    margin: -10px 0 20px 0; padding: 14px; \n    background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.1); \n    border-radius: 18px;\n}\n\n/* Captcha Overlay */\n.toki-captcha-overlay {\n    position: fixed; top: 0; left: 0; width: 100%; height: 100%;\n    background: rgba(0,0,0,0.8); z-index: 10001;\n    display: flex; flex-direction: column; align-items: center; justify-content: center;\n    color: white; font-family: var(--toki-font);\n}\n.toki-captcha-frame {\n    width: 80%; height: 60%; background: white; \n    border-radius: 20px; overflow: hidden; \n    margin-bottom: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);\n}\n\n/* Component: Helper Description Text */\n.toki-helper-desc { line-height: 1.5; font-weight: 500; }\n\n/* Component: Small Button (e.g., Test Native) */\n.toki-btn-sm { height: 36px !important; font-size: 12px !important; border-radius: 12px !important; }\n\n/* Component: Sync Button (height 48px) */\n.toki-btn-sync { height: 48px !important; }\n\n/* Component: Modal Header without border */\n.toki-modal-header-borderless { border: none !important; }\n\n/* Component: Code Textarea */\n.toki-textarea-code { min-height: 120px; font-family: monospace; }\n\n/* Visibility Toggles */\n.toki-visible-flex { display: flex !important; }\n.toki-visible-block { display: block !important; }\n.toki-hidden { display: none !important; }\n\n/* Status Badges & Indicators */\n.toki-badge {\n    margin-left: 5px;\n    font-size: 12px;\n    vertical-align: middle;\n}\n\n.toki-downloaded {\n    opacity: 0.6;\n    background-color: rgba(74, 222, 128, 0.05) !important;\n    transition: opacity 0.3s ease;\n}\n.toki-downloaded:hover {\n    opacity: 1;\n}\n\n/* Iframe Elements */\n.toki-downloader-iframe {\n    width: 100%;\n    height: 600px;\n    opacity: 0.1;\n    pointer-events: none;\n    border: none;\n    margin-top: 40px;\n}\n\n.toki-captcha-iframe {\n    width: 100%;\n    height: 100%;\n    border: none;\n}\n\n/* Info Card & History Styles */\n.toki-info-card {\n    background: rgba(255, 255, 255, 0.4);\n    border: 1px solid rgba(0, 0, 0, 0.05);\n    border-radius: 12px;\n    padding: 12px 16px;\n    margin-bottom: 20px;\n}\n\n.toki-info-row {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    padding: 6px 0;\n}\n\n.toki-info-row:not(:last-child) {\n    border-bottom: 1px dashed rgba(0, 0, 0, 0.05);\n}\n\n.toki-info-label {\n    font-size: 13px;\n    color: var(--toki-text-muted);\n    font-weight: 500;\n}\n\n.toki-info-val {\n    font-size: 13px;\n    color: var(--toki-text);\n    font-weight: 700;\n    display: flex;\n    align-items: center;\n    gap: 6px;\n}\n\n/* --- Multi-Queue Progress Monitor Panel (v1.21.0) --- */\n#toki-logbox-progress {\n    padding: 14px 18px;\n    background: rgba(255, 255, 255, 0.25);\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n    backdrop-filter: blur(10px);\n    display: flex;\n    flex-direction: column;\n    gap: 8px;\n}\n\n#toki-progress-header {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n#toki-progress-overall-text {\n    font-size: 12px;\n    font-weight: 800;\n    color: var(--toki-primary);\n    letter-spacing: -0.02em;\n    background: linear-gradient(135deg, #4f46e5, #06b6d4);\n    -webkit-background-clip: text;\n    -webkit-text-fill-color: transparent;\n}\n\n}\n\n#toki-progress-overall-controls {\n    display: flex;\n    gap: 8px;\n    align-items: center;\n}\n\n.toki-progress-btn {\n    font-size: 13px;\n    cursor: pointer;\n    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), filter 0.2s ease, opacity 0.2s ease;\n    user-select: none;\n    opacity: 0.85;\n}\n\n.toki-progress-btn:hover {\n    transform: scale(1.25);\n    opacity: 1;\n    filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.6));\n}\n\n#toki-btn-queue-stop:hover {\n    filter: drop-shadow(0 0 6px #ef4444);\n}\n\n.toki-progress-bar-paused {\n    background: linear-gradient(90deg, #9ca3af 0%, #6b7280 50%, #4b5563 100%) !important;\n    box-shadow: 0 1px 3px rgba(107, 114, 128, 0.4) !important;\n    animation: tokiPulsePaused 2s infinite ease-in-out;\n}\n\n@keyframes tokiPulsePaused {\n    0%, 100% { opacity: 1; }\n    50% { opacity: 0.65; }\n}\n\n.toki-empty-queue-msg {\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    justify-content: center;\n    padding: 24px 16px;\n    background: rgba(255, 255, 255, 0.04);\n    border: 1px dashed rgba(0, 0, 0, 0.08);\n    border-radius: 12px;\n    text-align: center;\n    gap: 6px;\n    margin: 8px 0;\n    backdrop-filter: blur(5px);\n}\n\n.toki-empty-queue-msg span {\n    font-size: 13px;\n    font-weight: 700;\n    color: var(--toki-primary, #6366f1);\n    opacity: 0.85;\n}\n\n.toki-empty-queue-msg p {\n    font-size: 11px;\n    color: #4b5563;\n    opacity: 0.75;\n    margin: 0;\n    line-height: 1.4;\n}\n\n.toki-progress-bar-container {\n    width: 100%;\n    height: 8px;\n    background: rgba(0, 0, 0, 0.06);\n    border-radius: 999px;\n    overflow: hidden;\n    position: relative;\n    border: 1px solid rgba(255, 255, 255, 0.5);\n    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);\n}\n\n.toki-progress-bar-fill {\n    height: 100%;\n    width: 0%;\n    background: linear-gradient(90deg, #6366f1 0%, #3b82f6 50%, #06b6d4 100%);\n    border-radius: 999px;\n    transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);\n    box-shadow: 0 1px 3px rgba(99, 102, 241, 0.4);\n}\n\n#toki-progress-workers-list {\n    display: flex;\n    flex-direction: column;\n    gap: 8px;\n    margin-top: 6px;\n    max-height: 160px;\n    overflow-y: auto;\n    padding-right: 4px;\n}\n\n/* Custom Scrollbar for Workers List */\n#toki-progress-workers-list::-webkit-scrollbar {\n    width: 4px;\n}\n#toki-progress-workers-list::-webkit-scrollbar-track {\n    background: transparent;\n}\n#toki-progress-workers-list::-webkit-scrollbar-thumb {\n    background: rgba(0, 0, 0, 0.1);\n    border-radius: 999px;\n}\n\n.toki-worker-progress-item {\n    background: rgba(255, 255, 255, 0.35);\n    border: 1px solid rgba(255, 255, 255, 0.5);\n    border-radius: 10px;\n    padding: 8px 12px;\n    display: flex;\n    flex-direction: column;\n    gap: 6px;\n    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);\n    transition: all 0.2s ease;\n}\n\n.toki-worker-progress-item:hover {\n    background: rgba(255, 255, 255, 0.55);\n    border-color: rgba(37, 99, 235, 0.15);\n    transform: translateY(-1px);\n    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.04);\n}\n\n.toki-worker-stage {\n    font-size: 11px;\n    font-weight: 700;\n    color: var(--toki-text-muted);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n.toki-worker-bar-container {\n    width: 100%;\n    height: 5px;\n    background: rgba(0, 0, 0, 0.04);\n    border-radius: 999px;\n    overflow: hidden;\n}\n\n.toki-worker-bar-fill {\n    height: 100%;\n    background: linear-gradient(90deg, #10b981 0%, #34d399 100%);\n    border-radius: 999px;\n    transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n/* --- 📋 Realtime Queue List & Badges (v1.21.0) --- */\n#toki-progress-queue-section {\n    margin-top: 10px;\n    border-top: 1px solid rgba(0, 0, 0, 0.06);\n    padding-top: 8px;\n    display: flex;\n    flex-direction: column;\n    gap: 6px;\n}\n\n#toki-queue-section-header {\n    font-size: 11px;\n    font-weight: 700;\n    color: var(--toki-text-muted);\n    opacity: 0.85;\n}\n\n#toki-progress-queue-list {\n    display: flex;\n    flex-direction: column;\n    gap: 4px;\n    max-height: 120px;\n    overflow-y: auto;\n    padding-right: 2px;\n}\n\n#toki-progress-queue-list::-webkit-scrollbar {\n    width: 4px;\n}\n#toki-progress-queue-list::-webkit-scrollbar-track {\n    background: transparent;\n}\n#toki-progress-queue-list::-webkit-scrollbar-thumb {\n    background: rgba(0, 0, 0, 0.08);\n    border-radius: 999px;\n}\n\n.toki-queue-list-item {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    padding: 5px 8px;\n    background: rgba(255, 255, 255, 0.25);\n    border: 1px solid rgba(255, 255, 255, 0.4);\n    border-radius: 6px;\n    font-size: 11px;\n    transition: all 0.2s ease;\n}\n\n.toki-queue-list-item:hover {\n    background: rgba(255, 255, 255, 0.45);\n    transform: translateX(1px);\n}\n\n.toki-queue-item-meta {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    flex: 1;\n    min-width: 0;\n}\n\n.toki-queue-item-title {\n    color: var(--toki-text);\n    font-weight: 500;\n    white-space: nowrap;\n    overflow: hidden;\n    text-overflow: ellipsis;\n}\n\n.toki-queue-item-delete {\n    font-size: 10px;\n    cursor: pointer;\n    opacity: 0.6;\n    transition: all 0.15s ease;\n    padding: 2px;\n}\n\n.toki-queue-item-delete:hover {\n    opacity: 1;\n    transform: scale(1.2);\n}\n\n/* 세련된 HSL 상태 배지 */\n.toki-badge {\n    padding: 2px 6px;\n    border-radius: 4px;\n    font-size: 9px;\n    font-weight: 700;\n    white-space: nowrap;\n    text-transform: uppercase;\n}\n\n/* 대기 (🟡 HSL Tailored Yellow) */\n.toki-badge-pending {\n    background: hsl(45, 93%, 94%);\n    color: hsl(45, 90%, 35%);\n    border: 1px solid hsl(45, 93%, 85%);\n}\n\n/* 진행 (🟢 HSL Tailored Emerald) */\n.toki-badge-processing {\n    background: hsl(150, 84%, 93%);\n    color: hsl(150, 84%, 25%);\n    border: 1px solid hsl(150, 84%, 82%);\n}\n\n/* 완료 (🔵 HSL Tailored Sapphire) */\n.toki-badge-completed {\n    background: hsl(220, 95%, 94%);\n    color: hsl(220, 90%, 40%);\n    border: 1px solid hsl(220, 95%, 86%);\n}\n\n/* 실패 (🔴 HSL Tailored Ruby) */\n.toki-badge-failed {\n    background: hsl(0, 93%, 94%);\n    color: hsl(0, 90%, 45%);\n    border: 1px solid hsl(0, 93%, 86%);\n}\n\n/* --- FormRuleEditor: Hybrid Two-Track Parser GUI (v1.21.0) --- */\n.toki-form-editor-modal {\n    width: min(95vw, 1200px) !important;\n    max-height: min(85vh, 700px) !important;\n    border-radius: 24px !important;\n}\n\n.toki-form-editor-container {\n    display: flex !important;\n    flex-direction: row !important;\n    flex-wrap: nowrap !important;\n    flex: 1;\n    overflow: auto !important;\n    gap: 20px;\n    padding: 20px;\n    background: rgba(255, 255, 255, 0.15);\n}\n\n.toki-form-editor-left {\n    flex: 1.2 !important;\n    min-width: 550px !important;\n    overflow-y: auto;\n    display: flex;\n    flex-direction: column;\n    gap: 16px;\n    padding-right: 8px;\n}\n\n.toki-form-editor-left::-webkit-scrollbar {\n    width: 6px;\n}\n.toki-form-editor-left::-webkit-scrollbar-track {\n    background: transparent;\n}\n.toki-form-editor-left::-webkit-scrollbar-thumb {\n    background: rgba(0, 0, 0, 0.08);\n    border-radius: 999px;\n}\n\n.toki-form-editor-right {\n    flex: 1 !important;\n    min-width: 450px !important;\n    display: flex;\n    flex-direction: column;\n    gap: 16px;\n    background: rgba(255, 255, 255, 0.4);\n    padding: 20px;\n    border-radius: 18px;\n    border: 1px solid rgba(255, 255, 255, 0.5);\n    overflow: hidden;\n}\n\n.toki-form-card {\n    background: rgba(255, 255, 255, 0.45);\n    border: 1px solid rgba(0, 0, 0, 0.04);\n    border-radius: 16px;\n    padding: 16px 20px;\n    display: flex;\n    flex-direction: column;\n    gap: 12px;\n    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.01);\n    transition: all 0.2s ease;\n}\n\n.toki-form-card:hover {\n    background: rgba(255, 255, 255, 0.65);\n    border-color: rgba(37, 99, 235, 0.1);\n    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.02);\n}\n\n.toki-form-card-title {\n    font-size: 13px;\n    font-weight: 800;\n    color: var(--toki-primary);\n    text-transform: uppercase;\n    letter-spacing: 0.02em;\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    border-bottom: 1px solid rgba(0, 0, 0, 0.03);\n    padding-bottom: 8px;\n}\n\n.toki-form-row {\n    display: flex;\n    flex-direction: column;\n    gap: 6px;\n}\n\n.toki-form-row-header {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n.toki-form-row-label {\n    font-size: 12px;\n    font-weight: 700;\n    color: var(--toki-text-muted);\n}\n\n.toki-input-compact {\n    width: 100%;\n    box-sizing: border-box;\n    min-width: 0;\n    padding: 10px 14px;\n    background: rgba(255, 255, 255, 0.7);\n    border: 1px solid rgba(0, 0, 0, 0.06);\n    border-radius: 10px;\n    font-size: 13px;\n    font-family: inherit;\n    transition: all 0.2s ease;\n}\n\n.toki-input-compact:focus {\n    outline: none;\n    border-color: var(--toki-primary);\n    background: #fff;\n    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);\n}\n\n.toki-badge-match {\n    font-size: 10px;\n    font-weight: 800;\n    padding: 2px 6px;\n    border-radius: 6px;\n    transition: all 0.2s ease;\n}\n\n.toki-badge-match.ok {\n    background: rgba(16, 185, 129, 0.1);\n    color: #10b981;\n}\n\n.toki-badge-match.zero {\n    background: rgba(245, 158, 11, 0.1);\n    color: #f59e0b;\n}\n\n.toki-badge-match.error {\n    background: rgba(239, 68, 68, 0.1);\n    color: #ef4444;\n}\n\n.toki-form-dropper-btn {\n    cursor: pointer;\n    font-size: 14px;\n    transition: transform 0.2s;\n    user-select: none;\n}\n.toki-form-dropper-btn:hover {\n    transform: scale(1.2);\n}\n\n.toki-form-verify-btn {\n    cursor: pointer;\n    font-size: 14px;\n    transition: transform 0.2s;\n    user-select: none;\n}\n.toki-form-verify-btn:hover {\n    transform: scale(1.2);\n}\n\n.toki-form-verify-result {\n    font-size: 11px;\n    font-weight: 600;\n    margin-top: 4px;\n    padding: 6px 10px;\n    border-radius: 8px;\n    line-height: 1.4;\n    word-break: break-all;\n}\n.toki-form-verify-result.success {\n    background: rgba(16, 185, 129, 0.08);\n    color: #10b981;\n    border: 1px solid rgba(16, 185, 129, 0.15);\n}\n.toki-form-verify-result.error {\n    background: rgba(239, 68, 68, 0.08);\n    color: #ef4444;\n    border: 1px solid rgba(239, 68, 68, 0.15);\n}\n\n/* --- 📱 Compact Responsive LogBox for Popups & Small Screens (v1.21.0 추가) --- */\n@media (max-width: 500px) {\n    #toki-logbox {\n        width: 100% !important;\n        height: 100% !important;\n        max-height: 100% !important;\n        bottom: 0 !important;\n        right: 0 !important;\n        left: 0 !important;\n        top: 0 !important;\n        border-radius: 0 !important;\n        border: none !important;\n        box-shadow: none !important;\n    }\n    /* 팝업에서는 전체 화면을 채우므로 드래그 헤더 무효화 및 모바일 친화형 축소 */\n    #toki-logbox-header {\n        cursor: default !important;\n        padding: 8px 12px !important;\n        border-top-left-radius: 0 !important;\n        border-top-right-radius: 0 !important;\n    }\n    #toki-logbox-content {\n        padding: 8px !important;\n        display: block !important; /* 팝업 상세로그 강제 개방 */\n        height: calc(100% - 35px) !important; /* 헤더를 제외한 영역 100% 점유 */\n        max-height: calc(100% - 35px) !important;\n    }\n    /* 팝업 내 불필요한 컨트롤 및 큐 진행률 카드 영역 강제 은닉 (사용자 피드백 반영) */\n    #toki-btn-audio, #toki-btn-report, #toki-logbox-progress {\n        display: none !important;\n    }\n}\n\n\n\n\n/* --- Dashboard Popup Specific Layout --- */\n#toki-dashboard-popup {\n    display: flex;\n    flex-direction: column;\n    width: 100vw;\n    height: 100vh;\n    margin: 0;\n    background: var(--toki-bg);\n    border: none;\n    border-radius: 0;\n    box-shadow: none;\n    overflow: hidden;\n}\n\n#toki-dashboard-header {\n    padding: 24px 32px;\n    background: rgba(255, 255, 255, 0.4);\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n#toki-dashboard-title {\n    font-size: 24px;\n    font-weight: 800;\n    color: #0f172a;\n    display: flex;\n    align-items: center;\n    gap: 12px;\n    letter-spacing: -0.03em;\n}\n\n#toki-dashboard-header-controls {\n    display: flex;\n    gap: 12px;\n    align-items: center;\n}\n\n#toki-dashboard-log-section {\n    padding: 16px 20px;\n    background: rgba(0, 0, 0, 0.05);\n    border-radius: 12px;\n    margin: 0 20px 20px 20px;\n    display: flex;\n    flex-direction: column;\n    height: 250px; /* 실시간 로그창 영역 높이 명시 */\n    overflow: hidden;\n}\n\n#toki-dashboard-log-section #toki-logbox-content {\n    flex: 1;\n    overflow-y: auto; /* 내부 스크롤 강제 */\n    padding: 12px;\n    margin: 0;\n    list-style: none;\n    background: rgba(0, 0, 0, 0.2); /* 로그 시인성 제고를 위한 세련된 다크 패널 */\n    border-radius: 8px;\n    border: 1px solid rgba(255, 255, 255, 0.03);\n}\n\n#toki-log-header {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    font-weight: 700;\n    margin-bottom: 12px;\n    color: var(--toki-text-muted);\n}\n\n/* --- 대시보드 커스텀 모달 레이아웃 (v1.21.6 추가) --- */\n.toki-dashboard-modal-overlay {\n    position: fixed;\n    top: 0;\n    left: 0;\n    width: 100vw;\n    height: 100vh;\n    background: rgba(15, 23, 42, 0.75);\n    backdrop-filter: blur(8px);\n    z-index: 10005;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    animation: tokiFadeIn 0.25s ease-out;\n}\n\n.toki-dashboard-modal {\n    width: 90%;\n    max-width: 680px;\n    background: var(--toki-bg, #1a1a2e);\n    border: 1px solid rgba(255, 255, 255, 0.08);\n    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);\n    border-radius: 24px;\n    display: flex;\n    flex-direction: column;\n    overflow: hidden;\n    animation: tokiSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);\n    color: #e0e0e0;\n}\n\n.toki-dashboard-modal-header {\n    padding: 18px 24px;\n    border-bottom: 1px solid rgba(255, 255, 255, 0.05);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    background: rgba(255, 255, 255, 0.02);\n}\n\n.toki-dashboard-modal-title {\n    font-size: 15px;\n    font-weight: 800;\n    color: var(--toki-primary, #6366f1);\n}\n\n.toki-dashboard-modal-close {\n    background: transparent;\n    border: none;\n    font-size: 24px;\n    font-weight: 700;\n    color: #94a3b8;\n    cursor: pointer;\n    line-height: 1;\n    transition: all 0.2s ease;\n}\n\n.toki-dashboard-modal-close:hover {\n    color: #ef4444;\n    transform: scale(1.1);\n}\n\n.toki-dashboard-modal-content {\n    padding: 20px;\n    overflow-y: auto;\n    max-height: 75vh;\n}\n\n/* 진행상황 모달 내 레이아웃 오버라이드 */\n#toki-modal-progress #toki-logbox-progress {\n    background: transparent !important;\n    border: none !important;\n    padding: 0 !important;\n    backdrop-filter: none !important;\n}\n#toki-modal-progress #toki-progress-queue-list {\n    max-height: 220px;\n}\n\n/* 로그 모달 내 레이아웃 오버라이드 */\n#toki-modal-logs #toki-dashboard-log-section {\n    margin: 0 !important;\n    padding: 0 !important;\n    background: transparent !important;\n    height: 400px !important;\n}\n#toki-modal-logs .toki-log-panel {\n    height: 330px !important;\n    max-height: 330px !important;\n    overflow-y: auto;\n}\n\n/* 대기열 모달 최대화 시의 너비 및 리스트 세로 높이 확장 */\n.toki-dashboard-modal-overlay.toki-queue-maximized .toki-dashboard-modal {\n    max-width: 850px !important;\n}\n.toki-dashboard-modal-overlay.toki-queue-maximized #toki-progress-queue-list {\n    max-height: 480px !important;\n    height: 480px !important;\n}\n\n/* 탭 본문 영역 세로 스크롤 활성화 (v1.21.8) */\n.toki-modal-body {\n    flex: 1;\n    overflow-y: auto !important;\n    max-height: calc(100vh - 120px);\n    padding-bottom: 40px;\n}\n\n/* Custom Scrollbar for Modal Body */\n.toki-modal-body::-webkit-scrollbar {\n    width: 6px;\n}\n.toki-modal-body::-webkit-scrollbar-track {\n    background: transparent;\n}\n.toki-modal-body::-webkit-scrollbar-thumb {\n    background: rgba(0, 0, 0, 0.12);\n    border-radius: 999px;\n}\n.toki-modal-body::-webkit-scrollbar-thumb:hover {\n    background: rgba(0, 0, 0, 0.25);\n}\n\n/* --- 🧬 DOM Inspector Panel (v2 — DevTools Style) --- */\n.toki-inspector-mount {\n    flex: 1;\n    display: flex;\n    flex-direction: column;\n    overflow: hidden;\n    min-height: 0;\n    border-radius: 12px;\n}\n\n.di-panel {\n    flex: 1;\n    display: flex;\n    flex-direction: column;\n    background: #1e1e2e;\n    overflow: hidden;\n    font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;\n    font-size: 12px;\n    line-height: 1.6;\n    color: #cdd6f4;\n}\n\n/* ── Toolbar ── */\n.di-toolbar {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    padding: 7px 14px;\n    background: #181825;\n    border-bottom: 1px solid #313244;\n    flex-shrink: 0;\n}\n\n.di-title {\n    font-weight: 700;\n    font-size: 12px;\n    color: #cba6f7;\n    letter-spacing: -0.01em;\n}\n\n.di-toolbar-right {\n    display: flex;\n    align-items: center;\n    gap: 10px;\n}\n\n.di-count {\n    font-size: 10px;\n    color: #585b70;\n}\n\n.di-refresh {\n    background: #313244;\n    border: none;\n    border-radius: 5px;\n    color: #6c7086;\n    cursor: pointer;\n    padding: 1px 7px;\n    font-size: 14px;\n    line-height: 1.5;\n    transition: all 0.15s;\n}\n\n.di-refresh:hover {\n    background: #45475a;\n    color: #cdd6f4;\n}\n\n/* ── Filter ── */\n.di-filter-bar {\n    padding: 5px 14px;\n    background: #181825;\n    border-bottom: 1px solid #313244;\n    flex-shrink: 0;\n}\n\n.di-filter {\n    width: 100%;\n    box-sizing: border-box;\n    background: #313244;\n    border: 1px solid #45475a;\n    border-radius: 5px;\n    padding: 4px 9px;\n    font-size: 11px;\n    color: #cdd6f4;\n    font-family: inherit;\n    outline: none;\n}\n\n.di-filter::placeholder { color: #585b70; }\n.di-filter:focus { border-color: #cba6f7; }\n\n/* ── Tree area ── */\n.di-tree-wrap {\n    flex: 1;\n    overflow-y: auto;\n    overflow-x: auto;\n    min-height: 0;\n    background: #1e1e2e;\n}\n\n.di-tree-wrap::-webkit-scrollbar { width: 4px; height: 4px; }\n.di-tree-wrap::-webkit-scrollbar-track { background: transparent; }\n.di-tree-wrap::-webkit-scrollbar-thumb { background: #45475a; border-radius: 999px; }\n\n.di-tree {\n    padding: 2px 0;\n}\n\n/* ── Tree lines ── */\n.di-line {\n    padding: 0 14px 0 0;\n    cursor: pointer;\n    white-space: nowrap;\n    font-size: 11px;\n    line-height: 22px;\n    user-select: none;\n    border-left: 2px solid transparent;\n}\n\n.di-line:hover {\n    background: rgba(203, 166, 247, 0.06);\n}\n\n.di-line.di-selected {\n    background: rgba(203, 166, 247, 0.12);\n    border-left-color: #cba6f7;\n}\n\n.di-line.di-dimmed { opacity: 0.35; }\n\n.di-arrow {\n    display: inline-block;\n    width: 13px;\n    text-align: center;\n    color: #6c7086;\n    font-size: 8px;\n    cursor: pointer;\n    flex-shrink: 0;\n    user-select: none;\n    margin-right: 1px;\n}\n\n.di-arrow:hover { color: #cdd6f4; }\n\n/* Children */\n.di-children { display: block; }\n.di-children.di-collapsed { display: none; }\n\n/* ── Syntax colors ── */\n.di-tag    { color: #89b4fa; }\n.di-id     { color: #f9e2af; }\n.di-class  { color: #a6e3a1; }\n.di-attr   { color: #fab387; }\n.di-text   { color: #cba6f7; }\n\n/* ── Detail panel ── */\n.di-detail {\n    flex-shrink: 0;\n    border-top: 1px solid #313244;\n    background: #181825;\n    max-height: 220px;\n    overflow-y: auto;\n}\n\n.di-detail-header {\n    padding: 6px 14px;\n    font-size: 10px;\n    font-weight: 700;\n    color: #585b70;\n    text-transform: uppercase;\n    letter-spacing: 0.04em;\n    background: rgba(255,255,255,0.02);\n    border-bottom: 1px solid #313244;\n    position: sticky;\n    top: 0;\n}\n\n.di-detail-body {\n    padding: 8px 14px 10px;\n}\n\n.di-detail-placeholder {\n    color: #585b70;\n    font-size: 11px;\n    font-style: italic;\n}\n\n.di-detail-grid {\n    display: grid;\n    grid-template-columns: 52px 1fr;\n    gap: 2px 8px;\n    font-size: 11px;\n}\n\n.di-detail-label {\n    color: #585b70;\n    font-weight: 600;\n    text-align: right;\n    line-height: 20px;\n}\n\n.di-detail-val {\n    color: #cdd6f4;\n    word-break: break-all;\n    line-height: 20px;\n}\n\n.di-detail-text {\n    max-height: 38px;\n    overflow: hidden;\n    text-overflow: ellipsis;\n}\n\n.di-detail-selector {\n    margin-top: 8px;\n    padding-top: 6px;\n    border-top: 1px solid #313244;\n}\n\n.di-selector-row {\n    display: flex;\n    gap: 5px;\n    align-items: center;\n    margin-top: 4px;\n}\n\n.di-selector-actions {\n    display: flex;\n    gap: 4px;\n    flex-shrink: 0;\n}\n\n.di-selector-code {\n    flex: 1;\n    min-width: 0;\n    background: #11111b;\n    border: 1px solid #313244;\n    border-radius: 5px;\n    padding: 5px 9px;\n    font-size: 11px;\n    color: #f5c2e7;\n    overflow-x: auto;\n    white-space: nowrap;\n}\n\n.di-btn-copy,\n.di-btn-apply {\n    border: none;\n    border-radius: 5px;\n    padding: 5px 10px;\n    font-size: 12px;\n    cursor: pointer;\n    transition: all 0.12s;\n    flex-shrink: 0;\n    font-family: inherit;\n    font-weight: 600;\n}\n\n.di-btn-copy {\n    background: #313244;\n    color: #a6adc8;\n}\n\n.di-btn-copy:hover {\n    background: #45475a;\n    color: #cdd6f4;\n}\n\n.di-btn-apply {\n    background: #cba6f7;\n    color: #1e1e2e;\n}\n\n.di-btn-apply:hover {\n    background: #b4befe;\n    transform: translateY(-1px);\n}\n\n/* ── Inspector toggle button active state ── */\n.toki-btn-inspector.active {\n    background: #cba6f7 !important;\n    color: #1e1e2e !important;\n    border-color: #cba6f7 !important;\n    font-weight: 700 !important;\n}\n\n/* ── 구독 관리 패널 ── */\n.toki-btn-sub.active {\n    background: #f59e0b !important;\n    color: #1e293b !important;\n    border-color: #f59e0b !important;\n    font-weight: 700 !important;\n}\n\n.sub-panel {\n    flex: 1;\n    display: flex;\n    flex-direction: column;\n    gap: 12px;\n    overflow: hidden;\n    min-height: 0;\n}\n\n.sub-header {\n    font-size: 13px;\n    font-weight: 800;\n    color: #f59e0b;\n    padding-bottom: 8px;\n    border-bottom: 1px solid rgba(0,0,0,0.05);\n}\n\n.sub-add-area {\n    display: flex;\n    gap: 6px;\n    flex-wrap: wrap;\n}\n\n.sub-url-input {\n    flex: 3;\n    min-width: 200px;\n    box-sizing: border-box;\n    padding: 8px 12px;\n    background: rgba(255,255,255,0.7);\n    border: 1px solid rgba(0,0,0,0.06);\n    border-radius: 8px;\n    font-size: 12px;\n    font-family: inherit;\n}\n\n.sub-name-input {\n    flex: 1;\n    min-width: 100px;\n    box-sizing: border-box;\n    padding: 8px 12px;\n    background: rgba(255,255,255,0.7);\n    border: 1px solid rgba(0,0,0,0.06);\n    border-radius: 8px;\n    font-size: 12px;\n    font-family: inherit;\n}\n\n.sub-url-input:focus, .sub-name-input:focus {\n    outline: none;\n    border-color: #f59e0b;\n    background: #fff;\n}\n\n.sub-btn-add {\n    padding: 8px 14px;\n    background: #f59e0b;\n    color: #fff;\n    border: none;\n    border-radius: 8px;\n    font-size: 12px;\n    font-weight: 700;\n    cursor: pointer;\n    transition: all 0.15s;\n}\n\n.sub-btn-add:hover {\n    background: #d97706;\n    transform: translateY(-1px);\n}\n\n.sub-list {\n    flex: 1;\n    overflow-y: auto;\n    display: flex;\n    flex-direction: column;\n    gap: 8px;\n    min-height: 0;\n}\n\n.sub-list::-webkit-scrollbar { width: 5px; }\n.sub-list::-webkit-scrollbar-track { background: transparent; }\n.sub-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 999px; }\n\n.sub-empty {\n    padding: 24px 16px;\n    text-align: center;\n    color: #94a3b8;\n    font-size: 12px;\n    line-height: 1.6;\n    background: rgba(255,255,255,0.3);\n    border-radius: 12px;\n    border: 1px dashed rgba(0,0,0,0.06);\n}\n\n.sub-item {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    gap: 8px;\n    padding: 10px 12px;\n    background: rgba(255,255,255,0.4);\n    border: 1px solid rgba(0,0,0,0.04);\n    border-radius: 10px;\n    transition: all 0.15s;\n}\n\n.sub-item:hover {\n    background: rgba(255,255,255,0.6);\n}\n\n.sub-item-ok { border-left: 3px solid #10b981; }\n.sub-item-pending { border-left: 3px solid #f59e0b; }\n\n.sub-item-info {\n    flex: 1;\n    min-width: 0;\n}\n\n.sub-item-name {\n    font-size: 12px;\n    font-weight: 700;\n    color: #1e293b;\n}\n\n.sub-item-url {\n    font-size: 10px;\n    color: #64748b;\n    word-break: break-all;\n    margin-top: 2px;\n}\n\n.sub-item-meta {\n    font-size: 10px;\n    color: #94a3b8;\n    margin-top: 2px;\n}\n\n.sub-item-actions {\n    display: flex;\n    gap: 4px;\n    flex-shrink: 0;\n}\n\n.sub-btn-refresh-sm, .sub-btn-remove {\n    border: none;\n    border-radius: 6px;\n    padding: 4px 8px;\n    font-size: 13px;\n    cursor: pointer;\n    transition: all 0.15s;\n    background: rgba(0,0,0,0.03);\n}\n\n.sub-btn-refresh-sm:hover { background: #e2e8f0; }\n.sub-btn-remove:hover { background: #fee2e2; }\n\n.sub-actions {\n    display: flex;\n    gap: 8px;\n    align-items: center;\n    padding-top: 4px;\n}\n\n.sub-btn-refresh {\n    padding: 8px 16px;\n    background: #6366f1;\n    color: #fff;\n    border: none;\n    border-radius: 8px;\n    font-size: 12px;\n    font-weight: 700;\n    cursor: pointer;\n    transition: all 0.15s;\n}\n\n.sub-btn-refresh:hover {\n    background: #4f46e5;\n    transform: translateY(-1px);\n}\n\n.sub-status {\n    font-size: 11px;\n    color: #64748b;\n    flex: 1;\n    text-align: right;\n}\n\n/* ── Log Tab Bar ── */\n.toki-log-tabs {\n    display: flex;\n    align-items: center;\n    gap: 4px;\n    margin-bottom: 8px;\n    flex-shrink: 0;\n}\n\n.toki-log-tab-btn {\n    background: rgba(255, 255, 255, 0.04);\n    border: 1px solid transparent;\n    padding: 4px 12px;\n    border-radius: 6px;\n    cursor: pointer;\n    font-size: 11px;\n    font-weight: 600;\n    color: #94a3b8;\n    transition: all 0.15s;\n    font-family: inherit;\n}\n\n.toki-log-tab-btn:hover {\n    background: rgba(255, 255, 255, 0.1);\n    color: #e0e0e0;\n}\n\n.toki-log-tab-btn.active {\n    background: rgba(99, 102, 241, 0.15);\n    border-color: rgba(99, 102, 241, 0.3);\n    color: #a5b4fc;\n}\n\n.toki-log-tabs-right {\n    margin-left: auto;\n}\n\n.toki-log-tabs-right button {\n    background: none;\n    border: none;\n    cursor: pointer;\n    font-size: 12px;\n    color: #e6a23c;\n    padding: 4px 8px;\n    border-radius: 4px;\n    font-family: inherit;\n    transition: color 0.15s;\n}\n\n.toki-log-tabs-right button:hover {\n    color: #f59e0b;\n}\n\n/* ── Log Panels ── */\n.toki-log-panel {\n    display: none !important;\n    flex-direction: column;\n    flex: 1;\n    overflow: hidden;\n}\n\n.toki-log-panel.active {\n    display: flex !important;\n}\n\n/* ── Debug Console ── */\n#toki-debug-console-header {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    margin-bottom: 6px;\n    flex-shrink: 0;\n}\n\n.toki-console-toggle-btn {\n    background: rgba(255, 255, 255, 0.06);\n    border: 1px solid rgba(255, 255, 255, 0.1);\n    padding: 3px 10px;\n    border-radius: 4px;\n    cursor: pointer;\n    font-size: 11px;\n    color: #94a3b8;\n    font-family: inherit;\n    font-weight: 600;\n    transition: all 0.15s;\n}\n\n.toki-console-toggle-btn:hover {\n    background: rgba(255, 255, 255, 0.12);\n}\n\n.toki-console-toggle-btn.on {\n    color: #4ade80;\n    border-color: rgba(74, 222, 128, 0.3);\n}\n\n.toki-console-status {\n    font-size: 10px;\n    color: #64748b;\n}\n\n#toki-debug-console-content {\n    flex: 1;\n    overflow-y: auto;\n    padding: 8px;\n    margin: 0;\n    list-style: none;\n    background: rgba(0, 0, 0, 0.2);\n    border-radius: 8px;\n    border: 1px solid rgba(255, 255, 255, 0.03);\n    min-height: 280px;\n    font-family: 'Cascadia Code', Consolas, monospace;\n    font-size: 11px;\n}\n\n#toki-debug-console-content::-webkit-scrollbar {\n    width: 4px;\n}\n#toki-debug-console-content::-webkit-scrollbar-track {\n    background: transparent;\n}\n#toki-debug-console-content::-webkit-scrollbar-thumb {\n    background: rgba(255, 255, 255, 0.08);\n    border-radius: 999px;\n}\n\n#toki-debug-console-content li {\n    margin-bottom: 2px;\n    padding: 2px 6px;\n    border-radius: 3px;\n    word-break: break-all;\n    line-height: 1.5;\n}\n\n#toki-debug-console-content li.log,\n#toki-debug-console-content li.info {\n    color: #e0e0e0;\n}\n\n#toki-debug-console-content li.warn {\n    color: #f9e2af;\n}\n\n#toki-debug-console-content li.error,\n#toki-debug-console-content li.critical {\n    color: #f38ba8;\n}\n\n#toki-debug-console-content li.success {\n    color: #a6e3a1;\n}\n";
;// ./src/core/ui/LogBox.js
/**
 * LogBox Module for TokiSync
 * Handles logging overlay, anti-sleep, and progress UI synchronization.
 */








class LogBox {
    static instance = null;

    constructor() {
        if (LogBox.instance) return LogBox.instance;
        this.logs = [];
        this.MAX_LOGS = 500;
        this.popupWindow = null;
        this.isEventRegistered = false;
        this.syncIntervalId = null;
        this._consoleInterceptor = null;
        this.init();
        LogBox.instance = this;
    }

    init() {
        // -- Register Tampermonkey User Menu Commands --
        if (typeof GM_registerMenuCommand !== 'undefined') {
            try {
                GM_registerMenuCommand("⚡ TokiSync 통합 대시보드 열기", () => {
                    this.openDashboard();
                });
            } catch (e) {
                console.warn('[UI] 템퍼몽키 메뉴 등록 실패:', e.message);
            }
        }

        // ── EventBus 구독 등록 ───────────────────────────────
        if (!this.isEventRegistered) {
            this.isEventRegistered = true;
            EventBus/* EventBus */.l.on(EventBus/* EVT */.c.NOTIFY_ERROR, ({ msg }) => {
                if (this.popupWindow && !this.popupWindow.closed) {
                    this.popupWindow.alert(msg);
                } else {
                    alert(msg);
                }
            });

            EventBus/* EventBus */.l.on(EventBus/* EVT */.c.LOG, ({ msg, tag, level }) => {
                if (level === 'error') {
                    this.error(msg, tag);
                } else if (level === 'warn') {
                    this.warn(msg, tag);
                } else if (level === 'success') {
                    this.success(msg, tag);
                } else if (level === 'info') {
                    this.info(msg, tag);
                } else {
                    this.log(msg, 'normal', tag);
                }
            });

            EventBus/* EventBus */.l.on(EventBus/* EVT */.c.UPDATE_PROGRESS, () => {
                this.updateProgressUI();
            });

            // ── 신규 대시보드 상태 제어 이벤트 구독 ───────────────────
            EventBus/* EventBus */.l.on(EventBus/* EVT */.c.OPEN_DASHBOARD, (payload) => {
                this.openDashboard(payload ? payload.defaultTab : undefined);
            });

            EventBus/* EventBus */.l.on(EventBus/* EVT */.c.CLOSE_DASHBOARD, () => {
                this.hide();
            });

            EventBus/* EventBus */.l.on(EventBus/* EVT */.c.TOGGLE_DASHBOARD, () => {
                this.toggle();
            });
        }
        // ─────────────────────────────────────────────────────
    }

    openDashboard(defaultTab = '') {
        // Node.js 테스트 환경 등 윈도우 객체가 완전하지 않은 환경에서의 안전 차단
        if (typeof window === 'undefined' || typeof window.open !== 'function') {
            return;
        }

        if (this.popupWindow && !this.popupWindow.closed) {
            if (typeof this.popupWindow.focus === 'function') {
                this.popupWindow.focus();
            }
            if (defaultTab) {
                this.switchTab(defaultTab);
            }
            this.startProgressSync();
            return;
        }

        console.log('[TokiSync UI] 🛡️ 가상 팝업 대시보드 기동 (DOM 오염 차단)');
        
        const width = 1200;
        const height = 850;
        const screenWidth = window.screen ? window.screen.width : 1920;
        const screenHeight = window.screen ? window.screen.height : 1080;
        const left = (screenWidth - width) / 2;
        const top = (screenHeight - height) / 2;
        
        try {
            this.popupWindow = window.open(
                "", 
                "TokiSync_Dashboard", 
                `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
            );
        } catch (e) {
            console.warn('[TokiSync UI] Dashboard window.open 실패:', e.message);
            return;
        }

        if (!this.popupWindow || !this.popupWindow.document) {
            if (typeof alert === 'function') {
                alert("⚠️ 팝업창을 띄우지 못했습니다. 브라우저의 팝업 차단 설정을 해제해 주세요!");
            } else {
                console.warn("⚠️ 팝업창을 띄우지 못했습니다. (alert 미지원 환경)");
            }
            return;
        }

        const doc = this.popupWindow.document;
        doc.title = "⚡ TokiSync Dashboard";

        // Inject Stylesheet
        const style = doc.createElement('style');
        style.innerHTML = ui_namespaceObject;
        doc.head.appendChild(style);

        // Body reset — 대시보드 독립 페이지 레이아웃 고정
        const bodyReset = doc.createElement('style');
        bodyReset.innerHTML = `
            *, *::before, *::after { box-sizing: border-box; }
            html, body {
                margin: 0; padding: 0;
                width: 100vw; height: 100vh;
                background: #1a1a2e;
                color: #e0e0e0;
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 14px;
                overflow: hidden;
            }
            #toki-dashboard-popup {
                padding: 0;
                height: 100vh;
            }
        `;
        doc.head.appendChild(bodyReset);

        // Anti-Sleep — 팝업 window에서 AudioContext 자동 기동 (대상 사이트 DOM 오염 없음)
        const antiSleepScript = doc.createElement('script');
        antiSleepScript.textContent = `
            (function() {
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const dest = ctx.createMediaStreamDestination();
                    const gain = ctx.createGain();
                    const osc = ctx.createOscillator();
                    osc.frequency.value = 1;
                    osc.type = 'sine';
                    gain.gain.value = 0.001;
                    osc.connect(gain);
                    gain.connect(dest);
                    osc.start();
                    const audio = document.createElement('audio');
                    audio.srcObject = dest.stream;
                    audio.play().catch(() => {});
                    console.log('[Anti-Sleep] 대시보드 팝업에서 절전 방지 기동');
                } catch(e) {
                    console.warn('[Anti-Sleep] 팝업 기동 실패:', e.message);
                }
            })();
        `;
        doc.body.appendChild(antiSleepScript);

        // Inject Body Structure
        const menuHTML = MenuModal.getInstance() ? MenuModal.getInstance().getHTML() : '';
        doc.body.innerHTML = menuHTML;

        // Bind UI Events
        if (MenuModal.getInstance()) {
            MenuModal.getInstance().bindEventsToPopup(this.popupWindow);
        }

        // Bind Dashboard Specific Events
        const clearLogsBtn = doc.getElementById('toki-btn-log-clear');
        if (clearLogsBtn) {
            clearLogsBtn.onclick = () => this.clear();
        }

        // Tab Switch Binding
        const logTabBtns = doc.querySelectorAll('.toki-log-tab-btn');
        logTabBtns.forEach(btn => {
            btn.onclick = () => {
                const target = btn.getAttribute('data-logtab');
                logTabBtns.forEach(b => b.classList.toggle('active', b === btn));
                doc.querySelectorAll('.toki-log-panel').forEach(p => {
                    const isTarget = (target === 'debug' && p.id === 'toki-debug-console')
                        || (target === 'service' && p.id === 'toki-logbox-content');
                    p.classList.toggle('active', isTarget);
                });
            };
        });

        // Toggle Button Binding
        const toggleBtn = doc.getElementById('toki-btn-console-toggle');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                const active = toggleBtn.classList.toggle('on');
                toggleBtn.textContent = active ? '■ 수집 중단' : '▶ 수집 재개';
                if (this._consoleInterceptor) {
                    this._consoleInterceptor.setActive(active);
                }
                const statusEl = doc.querySelector('.toki-console-status');
                if (statusEl) {
                    statusEl.textContent = active ? 'TokiSync 디버그 로그 수집 중' : '수집 중단됨';
                }
            };
        }

        // Flush Cached Logs
        const flushContainer = (id, logArray) => {
            const el = doc.getElementById(id);
            if (!el) return;
            el.innerHTML = '';
            logArray.forEach(l => {
                const li = doc.createElement('li');
                li.textContent = `[${l.time}] ${l.context ? `[${l.context}] ` : ''}${l.msg}`;
                const t = l.type;
                if (l.context === 'Console') {
                    li.className = (t === 'error' || t === 'critical') ? 'error'
                        : t === 'warn' ? 'warn' : t === 'success' ? 'success' : 'log';
                } else {
                    if (t === 'error' || t === 'critical') li.className = 'error';
                    else if (t === 'success') li.className = 'success';
                }
                el.appendChild(li);
            });
            el.scrollTop = el.scrollHeight;
        };
        flushContainer('toki-logbox-content', this.logs.filter(l => l.context !== 'Console'));
        flushContainer('toki-debug-console-content', this.logs.filter(l => l.context === 'Console'));

        this.updateProgressUI();
        if (defaultTab) {
            this.switchTab(defaultTab);
        }

        // 팝업 창이 닫힐 때 타이머 해제 바인딩
        try {
            this.popupWindow.addEventListener('beforeunload', () => {
                this.stopProgressSync();
            });
        } catch (e) {
            console.warn('[TokiSync UI] beforeunload 이벤트 리스너 등록 실패:', e.message);
        }

        this.startProgressSync();
    }

    updateProgressUI() {
        if (!this.popupWindow || this.popupWindow.closed || !this.popupWindow.document) return;

        const doc = this.popupWindow.document;
        const progressContainer = doc.getElementById('toki-logbox-progress');
        if (!progressContainer) return;

        const queue = (0,core_queue/* getQueue */.IS)();
        const listEl = doc.getElementById('toki-progress-workers-list');
        const queueListEl = doc.getElementById('toki-progress-queue-list');
        const queueSection = doc.getElementById('toki-progress-queue-section');

        if (queue.length === 0) {
            const textEl = doc.getElementById('toki-progress-overall-text');
            const barEl = doc.getElementById('toki-progress-overall-bar');
            
            if (textEl) textEl.textContent = `진행률: 0% (0 / 0)`;
            if (barEl) barEl.style.width = `0%`;
            
            if (listEl) {
                listEl.innerHTML = `
                    <div class="toki-empty-queue-msg">
                        <span>💡 수집 대기열이 비어 있습니다.</span>
                        <p>작품 목록에서 다운로드할 화를 체크하고 다운로드 정책에 따라 다운로드를 클릭해 주세요.</p>
                    </div>
                `;
            }
            if (queueSection) queueSection.style.display = 'none';
            return;
        }

        progressContainer.style.display = 'block';
        if (queueSection) queueSection.style.display = 'block';

        const stats = (0,core_queue/* getQueueStats */.zX)();
        const overallPercent = stats.total > 0 ? Math.round(((stats.completed + stats.failed) / stats.total) * 100) : 0;

        // 전체 진행도 갱신
        const textEl = doc.getElementById('toki-progress-overall-text');
        const barEl = doc.getElementById('toki-progress-overall-bar');
        const pauseBtn = doc.getElementById('toki-btn-queue-pause');
        const isPaused = (0,core_queue/* getQueuePaused */.kZ)();
        
        if (textEl) {
            const pauseText = isPaused ? ' ⏸️ [일시 정지됨]' : '';
            textEl.textContent = `진행률: ${overallPercent}% (${stats.completed + stats.failed} / ${stats.total})${pauseText}`;
        }
        
        if (barEl) {
            barEl.style.width = `${overallPercent}%`;
            if (isPaused) {
                barEl.classList.add('toki-progress-bar-paused');
            } else {
                barEl.classList.remove('toki-progress-bar-paused');
            }
        }

        if (pauseBtn) {
            pauseBtn.textContent = isPaused ? '▶️ 재개' : '⏸️ 일시 정지';
            pauseBtn.title = isPaused ? '재개하기 (Resume)' : '일시 정지 (Pause)';
        }

        // 개별 활성 팝업(Worker) 진행 상황 렌더링
        if (listEl) {
            const activeWorkers = queue.filter(item => item.status === 'processing');
            listEl.innerHTML = activeWorkers.map(item => {
                let stageName = '다운로드 중';
                if (item.stage === 'STAGE_INIT') stageName = '초기화';
                else if (item.stage === 'STAGE_DOM_READY') stageName = '대기';
                else if (item.stage === 'STAGE_SCROLLING') stageName = '스크롤';
                else if (item.stage === 'STAGE_PARSING') stageName = '파싱';
                else if (item.stage === 'STAGE_DOWNLOADING') stageName = '다운로드';
                else if (item.stage === 'STAGE_UPLOADING') stageName = '업로드';

                return `
                    <div class="toki-worker-progress-item">
                        <div class="toki-worker-info">
                            <span class="toki-worker-title">${item.episodeTitle}</span>
                            <span class="toki-worker-stage">${stageName} (${item.progressPercent}%)</span>
                        </div>
                        <div class="toki-worker-bar-bg">
                            <div class="toki-worker-bar-fill" style="width: ${item.progressPercent}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 대기열 목록 렌더링
        if (queueListEl) {
            queueListEl.innerHTML = queue.map(item => {
                let badgeClass = 'toki-badge-pending';
                let statusText = '대기';
                if (item.status === 'processing') {
                    badgeClass = 'toki-badge-processing';
                    statusText = '진행';
                } else if (item.status === 'completed') {
                    badgeClass = 'toki-badge-completed';
                    statusText = '완료';
                } else if (item.status === 'failed') {
                    badgeClass = 'toki-badge-failed';
                    statusText = '실패';
                }

                let stageText = '';
                if (item.status === 'processing') {
                    if (item.stage === 'STAGE_INIT') stageText = '초기화';
                    else if (item.stage === 'STAGE_DOM_READY') stageText = '로딩중';
                    else if (item.stage === 'STAGE_SCROLLING') stageText = '스크롤';
                    else if (item.stage === 'STAGE_PARSING') stageText = '파싱중';
                    else if (item.stage === 'STAGE_DOWNLOADING') stageText = '받는중';
                    else if (item.stage === 'STAGE_UPLOADING') stageText = '업로드';
                    stageText = ` [${stageText}]`;
                }

                const errorTitle = item.errorMsg ? ` title="${item.errorMsg}" style="cursor: help;"` : '';

                return `
                    <div class="toki-queue-list-item" data-id="${item.id}">
                        <div class="toki-queue-item-meta">
                            <span class="toki-badge ${badgeClass}"${errorTitle}>${statusText}${stageText}</span>
                            <span class="toki-queue-item-title" title="${item.episodeTitle}">${item.episodeTitle}</span>
                        </div>
                        <span class="toki-queue-item-delete" title="수집 대기열에서 제거" data-id="${item.id}">❌</span>
                    </div>
                `;
            }).join('');
        }

        // [v1.21.9] 다운로드 탭 인라인 진행 상태 업데이트 및 버튼 가시성 제어
        const dlActions = doc.getElementById('toki-download-actions');
        const inlineProgress = doc.getElementById('toki-inline-progress');
        
        if (dlActions && inlineProgress) {
            const hasActiveTasks = queue.some(item => item.status === 'processing' || item.status === 'pending');
            if (hasActiveTasks) {
                dlActions.style.display = 'none';
                inlineProgress.style.display = 'block';
                
                const inlineText = doc.getElementById('toki-inline-text');
                const inlinePercent = doc.getElementById('toki-inline-percent');
                const inlineBar = doc.getElementById('toki-inline-bar');
                const inlinePause = doc.getElementById('toki-inline-pause');
                
                if (inlineText) {
                    const pauseText = isPaused ? ' ⏸️ [일시 정지됨]' : '';
                    inlineText.textContent = `진행률: ${overallPercent}% (${stats.completed + stats.failed} / ${stats.total})${pauseText}`;
                }
                if (inlinePercent) {
                    inlinePercent.textContent = `${overallPercent}%`;
                }
                if (inlineBar) {
                    inlineBar.style.width = `${overallPercent}%`;
                    if (isPaused) {
                        inlineBar.classList.add('toki-progress-bar-paused');
                    } else {
                        inlineBar.classList.remove('toki-progress-bar-paused');
                    }
                }
                if (inlinePause) {
                    inlinePause.innerHTML = isPaused ? '<span>▶️ 재개</span>' : '<span>⏸️ 일시 정지</span>';
                }
            } else {
                dlActions.style.display = 'block';
                inlineProgress.style.display = 'none';
            }
        }
    }

    static getInstance() {
        if (!LogBox.instance) {
            new LogBox();
        }
        return LogBox.instance;
    }

    log(msg, type = 'normal', context = '') {
        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        const config = (0,core_config/* getConfig */.zj)();

        // 디버그성 컨텍스트(태그) 목록 정의
        const debugContexts = ['Worker:Batch', 'DOM:Scroll', 'DOM:Stall', 'DOM:Ready', 'FastPath', 'GAS:Cache', 'Queue'];
        const isDebugMode = config.logLevel === 'debug' || config.logLevel === 'normal';

        // 디버그성 컨텍스트이나 디버그 모드가 아닌 경우 접두사(prefix)에서 숨김 처리
        const shouldShowContext = isDebugMode || !debugContexts.includes(context);

        // 템플릿 문법을 사용한 로그 문자열 조립
        const logTemplate = config.logTemplate || '[{time}] {prefix}{msg}';
        const displayPrefix = (context && shouldShowContext) ? `[${context}] ` : '';

        const fullMsg = logTemplate
            .replace('{time}', time)
            .replace('{prefix}', displayPrefix)
            .replace('{msg}', msg);
        
        // 1. 내부 메모리 및 브라우저 콘솔에는 모든 상세 정보가 포함된 원본 로그 누적 출력
        const consolePrefix = context ? `[${context}] ` : '';
        this.logs.push({ time, type, context, msg: typeof msg === 'string' ? msg : JSON.stringify(msg) });
        if (this.logs.length > this.MAX_LOGS) this.logs.shift();

        if (type === 'error' || type === 'critical') {
            console.error(`[TokiSync] ${consolePrefix}${msg}`);
        } else if (type === 'warn') {
            console.warn(`[TokiSync] ${consolePrefix}${msg}`);
        } else {
            console.log(`[TokiSync] ${consolePrefix}${msg}`);
        }

        // 2. 설정된 로그 수준에 따라 로그 필터링 적용
        const LEVEL_PRIORITY = {
            'normal': 1,
            'debug': 1,
            'info': 2,
            'success': 2,
            'warn': 3,
            'error': 4,
            'critical': 4
        };
        const currentLogLevel = (0,core_config/* getConfig */.zj)().logLevel || 'info';
        const currentPriority = LEVEL_PRIORITY[currentLogLevel] || 2;
        const msgPriority = LEVEL_PRIORITY[type] || 1;

        if (msgPriority < currentPriority) {
            return;
        }

        // 팝업이 활성화되어 있으면 실시간 렌더링
        if (this.popupWindow && !this.popupWindow.closed && this.popupWindow.document) {
            const doc = this.popupWindow.document;
            const isConsole = (context === 'Console');
            const containerId = isConsole ? 'toki-debug-console-content' : 'toki-logbox-content';
            const logContentEl = doc.getElementById(containerId);
            if (logContentEl) {
                const li = doc.createElement('li');
                li.textContent = fullMsg;
                
                if (isConsole) {
                    const baseType = (type === 'info' || type === 'normal') ? 'log' : type;
                    li.className = baseType === 'error' || baseType === 'critical' ? 'error'
                        : baseType === 'warn' ? 'warn'
                        : baseType === 'success' ? 'success' : 'log';
                } else {
                    if (type === 'error' || type === 'critical') li.className = 'error';
                    else if (type === 'success') li.className = 'success';
                    else if (type === 'warn') li.className = 'warn';
                    else if (type === 'info') li.className = 'info';
                }
                
                logContentEl.appendChild(li);
                
                setTimeout(() => {
                    logContentEl.scrollTop = logContentEl.scrollHeight;
                }, 10);
            }
        }
    }

    info(msg, context = '') {
        this.log(msg, 'info', context);
    }

    critical(msg, context = '') {
        this.openDashboard();
        this.log(msg, 'critical', context);
    }

    error(msg, context = '') {
        this.openDashboard();
        this.log(msg, 'error', context);
    }

    warn(msg, context = '') {
        this.log(msg, 'warn', context);
    }

    success(msg, context = '') {
        this.log(msg, 'success', context);
    }

    clear() {
        if (this.popupWindow && !this.popupWindow.closed) {
            const doc = this.popupWindow.document;
            const activeTab = doc.querySelector('.toki-log-tab-btn.active');
            const tabName = activeTab ? activeTab.getAttribute('data-logtab') : 'service';
            if (tabName === 'service') {
                const el = doc.getElementById('toki-logbox-content');
                if (el) el.innerHTML = '';
                this.logs = this.logs.filter(l => l.context === 'Console');
            } else {
                const el = doc.getElementById('toki-debug-console-content');
                if (el) el.innerHTML = '';
                this.logs = this.logs.filter(l => l.context !== 'Console');
            }
        } else {
            this.logs = [];
        }
    }

    show() {
        this.openDashboard();
    }

    hide() {
        if (this.popupWindow && !this.popupWindow.closed) {
            this.popupWindow.close();
        }
        this.popupWindow = null;
        this.stopProgressSync();
    }

    toggle() {
        if (this.popupWindow && !this.popupWindow.closed) {
            this.hide();
        } else {
            this.show();
        }
    }

    switchTab(tabName) {
        if (!this.popupWindow || this.popupWindow.closed) return;
        const doc = this.popupWindow.document;
        const tabBtn = doc.querySelector(`.toki-tab-btn[data-tab="${tabName}"]`);
        if (tabBtn) {
            tabBtn.click();
        }
    }

    startProgressSync() {
        if (this.syncIntervalId) return;
        this.syncIntervalId = setInterval(() => {
            if (this.popupWindow && !this.popupWindow.closed) {
                this.updateProgressUI();
            } else {
                this.stopProgressSync();
            }
        }, 1000);
    }

    stopProgressSync() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
    }
}

;// ./src/core/ui/Notifier.js
/**
 * Notifier Module for TokiSync
 * Handles OS-level notifications using Tampermonkey GM_notification API
 */

class Notifier {
    static notify(title, text, onclick = null) {
        if (typeof GM_notification === 'function') {
            GM_notification({
                title: title,
                text: text,
                timeout: 5000,
                onclick: onclick
            });
        } else {
            console.log(`[Notification] ${title}: ${text}`);
        }
    }
}

;// ./src/core/ui/index.js
/**
 * UI Modules Entry Point for TokiSync
 * Re-exports all UI components and defines UI helpers.
 */








/**
 * 대기열 진행 모달을 강제로 노출시키는 팝업 헬퍼 함수
 */
function showProgressModal() {
    const logBox = LogBox.getInstance();
    logBox.openDashboard();
    
    if (logBox.popupWindow) {
        const doc = logBox.popupWindow.document;
        const progressModal = doc.getElementById('toki-modal-progress');
        if (progressModal) {
            progressModal.style.display = 'flex';
        }
    }
}


/***/ }),

/***/ 899:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Jb: function() { return /* binding */ isConfigValid; },
/* harmony export */   NY: function() { return /* binding */ CFG_RULE_SUBSCRIPTIONS; },
/* harmony export */   Nk: function() { return /* binding */ setConfig; },
/* harmony export */   Pd: function() { return /* binding */ CFG_PARSER_RULES; },
/* harmony export */   dx: function() { return /* binding */ SLEEP_MULTIPLIERS; },
/* harmony export */   zj: function() { return /* binding */ getConfig; }
/* harmony export */ });
/* unused harmony exports CFG_URL_KEY, CFG_ID_KEY, CFG_FOLDER_ID, CFG_POLICY_KEY, CFG_API_KEY, CFG_SLEEP_MODE, CFG_SMART_SKIP_RATIO, CFG_NOVEL_MODE, CFG_NOVEL_FORMAT, CFG_SCAN_SPEED, CFG_LOCAL_NAME_TEMPLATE, CFG_LOG_LEVEL */
const SLEEP_MULTIPLIERS = {
    cautious: 1.0,   // 신중 (1.0배율)
    thorough: 1.5,   // 철저 (1.5배율)
    slow: 2.2,       // 느림 (2.2배율)
    very_slow: 3.0   // 매우 느림 (3.0배율)
};

const CFG_URL_KEY = "TOKI_GAS_URL"; // legacy
const CFG_ID_KEY = "TOKI_GAS_ID";
const CFG_FOLDER_ID = "TOKI_FOLDER_ID";
const CFG_POLICY_KEY = "TOKI_DOWNLOAD_POLICY";
const CFG_API_KEY = "TOKI_API_KEY";
const CFG_SLEEP_MODE = "TOKI_SLEEP_MODE";
const CFG_SMART_SKIP_RATIO = "TOKI_SMART_SKIP_RATIO";
const CFG_NOVEL_MODE = "TOKI_NOVEL_MODE";
const CFG_NOVEL_FORMAT = "TOKI_NOVEL_FORMAT";
const CFG_PARSER_RULES = "TOKI_PARSER_RULES";
const CFG_SCAN_SPEED = "TOKI_SCAN_SPEED";
const CFG_LOCAL_NAME_TEMPLATE = "TOKI_LOCAL_NAME_TEMPLATE";
const CFG_LOG_LEVEL = "TOKI_LOG_LEVEL";
const CFG_RULE_SUBSCRIPTIONS = "TOKI_RULE_SUBSCRIPTIONS";

const BACKUP_KEY = "tokisync_config_backup";

function backupToLocalStorage(configObj) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(BACKUP_KEY, JSON.stringify(configObj));
        }
    } catch (e) {
        console.warn("[Config] LocalStorage 백업 저장 실패:", e);
    }
}

function restoreFromLocalStorage() {
    try {
        if (typeof localStorage !== 'undefined') {
            const backupStr = localStorage.getItem(BACKUP_KEY);
            if (backupStr) {
                const backup = JSON.parse(backupStr);
                if (backup && (backup.gasId || backup.folderId)) {
                    console.log("[Config] 🛡️ LocalStorage 백업 감지 -> GM_setValue로 복원을 수행합니다.");
                    if (backup.gasId && typeof GM_setValue !== 'undefined') GM_setValue(CFG_ID_KEY, backup.gasId);
                    if (backup.folderId && typeof GM_setValue !== 'undefined') GM_setValue(CFG_FOLDER_ID, backup.folderId);
                    if (backup.policy && typeof GM_setValue !== 'undefined') GM_setValue(CFG_POLICY_KEY, backup.policy);
                    if (backup.apiKey && typeof GM_setValue !== 'undefined') GM_setValue(CFG_API_KEY, backup.apiKey);
                    if (backup.sleepMode && typeof GM_setValue !== 'undefined') GM_setValue(CFG_SLEEP_MODE, backup.sleepMode);
                    if (backup.smartSkipRatio && typeof GM_setValue !== 'undefined') GM_setValue(CFG_SMART_SKIP_RATIO, backup.smartSkipRatio.toString());
                    if (backup.novelMode && typeof GM_setValue !== 'undefined') GM_setValue(CFG_NOVEL_MODE, backup.novelMode);
                    if (backup.novelFormat && typeof GM_setValue !== 'undefined') GM_setValue(CFG_NOVEL_FORMAT, backup.novelFormat);
                    if (backup.scanSpeed && typeof GM_setValue !== 'undefined') GM_setValue(CFG_SCAN_SPEED, backup.scanSpeed.toString());
                    if (backup.localNameTemplate && typeof GM_setValue !== 'undefined') GM_setValue(CFG_LOCAL_NAME_TEMPLATE, backup.localNameTemplate);
                    if (backup.logLevel && typeof GM_setValue !== 'undefined') GM_setValue(CFG_LOG_LEVEL, backup.logLevel);
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn("[Config] LocalStorage 백업 복원 실패:", e);
    }
    return false;
}

/**
 * Get current configuration
 * @returns {{gasId: string, gasUrl: string, folderId: string, policy: string, apiKey: string, sleepMode: string, smartSkipRatio: number, logLevel: string}}
 */
function getConfig() {
    const _gmGet = (key, def) => typeof GM_getValue !== 'undefined' ? GM_getValue(key, def) : def;
    let gasId = _gmGet(CFG_ID_KEY, "");
    let folderId = _gmGet(CFG_FOLDER_ID, "");

    // 2중 백업 복구 엔진 기동 (GM_getValue 정보 부재 시 로컬 스토리지 데이터셋 수복)
    if (!gasId && !folderId) {
        const restored = restoreFromLocalStorage();
        if (restored) {
            gasId = _gmGet(CFG_ID_KEY, "");
            folderId = _gmGet(CFG_FOLDER_ID, "");
        }
    }

    let gasUrl = _gmGet(CFG_URL_KEY, "");

    // Auto-migration: gasUrl -> gasId
    if (!gasId && gasUrl) {
        const match = gasUrl.match(/\/s\/([^\/]+)\/exec/);
        if (match) {
            gasId = match[1];
            if (typeof GM_setValue !== 'undefined') GM_setValue(CFG_ID_KEY, gasId);
            console.log("✅ [Config] Auto-migrated GAS URL to ID:", gasId);
        }
    }

    const finalGasId = gasId;
    // URL fallback for legacy or reconstructed from ID
    const finalGasUrl = finalGasId 
        ? `https://script.google.com/macros/s/${finalGasId}/exec` 
        : gasUrl;

    const configObj = {
        gasId: finalGasId,
        gasUrl: finalGasUrl,
        folderId: _gmGet(CFG_FOLDER_ID, ""),
        policy: _gmGet(CFG_POLICY_KEY, "folderInCbz"),
        apiKey: _gmGet(CFG_API_KEY, ""),
        sleepMode: _gmGet(CFG_SLEEP_MODE, "cautious"), // default: cautious
        smartSkipRatio: parseInt(_gmGet(CFG_SMART_SKIP_RATIO, "50"), 10), // default 50% of Max
        novelMode: _gmGet(CFG_NOVEL_MODE, "perChapter"), // default: chapter-by-chapter
        novelFormat: _gmGet(CFG_NOVEL_FORMAT, "epub"), // default: EPUB
        scanSpeed: (() => {
            let val = parseFloat(_gmGet(CFG_SCAN_SPEED, "1000"));
            if (isNaN(val)) val = 1000;
            // 하위 호환성: 기존의 배속 배율 값(예: 0.5 ~ 5.0)이 저장되어 있는 경우 밀리세컨드 단위로 자동 변환
            if (val <= 10) {
                val = val * 1000; // 1.0배속 -> 1000ms, 3.0배속 -> 3000ms 등
            }
            return Math.round(val);
        })(),
        localNameTemplate: _gmGet(CFG_LOCAL_NAME_TEMPLATE, "{number:4} - {title}"),
        logLevel: _gmGet(CFG_LOG_LEVEL, "info")
    };
    backupToLocalStorage(configObj);
    return configObj;
}

/**
 * Set configuration value
 * @param {string} key 
 * @param {string} value 
 */
function setConfig(key, value) {
    if (typeof GM_setValue !== 'undefined') GM_setValue(key, value);
    try {
        const configObj = getConfig();
        backupToLocalStorage(configObj);
    } catch (e) {
        console.warn(`[Config] Backup to localStorage failed: ${e.message}`);
    }
}


/**
 * Check if configuration is valid
 * @returns {boolean}
 */
function isConfigValid() {
    const config = getConfig();
    return (config.gasId || config.gasUrl) && config.folderId;
}

/***/ }),

/***/ 924:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Kt: function() { return /* binding */ fetchBlobWithXHR; },
/* harmony export */   OJ: function() { return /* binding */ saveFile; },
/* harmony export */   Px: function() { return /* binding */ extractEpisodeNum; },
/* harmony export */   UF: function() { return /* binding */ waitForContent; },
/* harmony export */   Vs: function() { return /* binding */ scrollToLoad; },
/* harmony export */   Yi: function() { return /* binding */ arrayBufferToBase64; },
/* harmony export */   _L: function() { return /* binding */ blobToArrayBuffer; },
/* harmony export */   iL: function() { return /* binding */ getCommonPrefix; },
/* harmony export */   yy: function() { return /* binding */ sleep; }
/* harmony export */ });
/* unused harmony exports waitIframeLoad, pauseForCaptcha, getImageDimensions */
/* harmony import */ var _gas_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(488);
/* harmony import */ var _ui_index_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(605);



function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk_size = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk_size) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size));
    }
    return window.btoa(binary);
}

function extractEpisodeNum(filename) {
    if (!filename) return null;
    const kavitaMatch = filename.match(/[- ]c(h)?(\d+)/i);
    const legacyMatch = filename.match(/(\d+)화/);
    const startNumMatch = filename.match(/^(\d+)/);

    if (kavitaMatch) return kavitaMatch[2];
    if (legacyMatch) return legacyMatch[1];
    if (startNumMatch) return startNumMatch[1];
    return null;
}

async function blobToArrayBuffer(blob) {
    if (blob.arrayBuffer) {
        return await blob.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

function sleep(ms, randomRange) {
    if (randomRange) {
        ms = Math.floor(Math.random() * randomRange) + ms;
    }
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    });
}

function getCommonPrefix(str1, str2) {
    if (!str1 || !str2) return '';
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
        i++;
    }
    let prefix = str1.substring(0, i);
    
    // Remove trailing numbers (which belong to the episode number sequence)
    // By doing this BEFORE trim(), we protect series titles that end in numbers
    // followed by a space (e.g. "Mob Psycho 100 1" -> prefix "Mob Psycho 100 1" -> "Mob Psycho 100 ")
    prefix = prefix.replace(/\d+$/, '');
    prefix = prefix.replace(/[\s\-_]+$/, '');
    
    return prefix.trim();
}

async function waitIframeLoad(iframe, url, viewerCfg = {}) {
    return new Promise((resolve) => {
        const handler = async () => {
            iframe.removeEventListener('load', handler);
            
            // [Fix] 시나리오 1/4: 고정 sleep(500) 대신 실제 콘텐츠 DOM 폴링
            // load 이벤트 후에도 JS lazy-render 페이지는 DOM이 비어있을 수 있음
            // 이미지(.view-padding div img) 또는 소설 텍스트(#novel_content) 중 하나가
            // 나타날 때까지 최대 8초 폴링 (200ms 간격 × 40회)
            await waitForContent(iframe, 8000, viewerCfg);
            
            // Captcha Detection
            let isCaptcha = false;
            let isCloudflare = false;
            
            try {
                const iframeDoc = iframe.contentWindow.document;
                console.log('[Captcha Debug] iframe URL:', iframe.contentWindow.location.href);
                console.log('[Captcha Debug] iframe title:', iframeDoc.title);
                
                // Check for various captcha types
                const hcaptcha = iframeDoc.querySelector('iframe[src*="hcaptcha"]');
                const recaptcha = iframeDoc.querySelector('.g-recaptcha');
                
                // Gnuboard captcha (corrected selectors based on actual HTML)
                const kcaptchaFieldset = iframeDoc.querySelector('fieldset#captcha, fieldset.captcha');
                const kcaptchaImg = iframeDoc.querySelector('img.captcha_img, img[src*="kcaptcha_image.php"]');
                const kcaptchaForm = iframeDoc.querySelector('form[action*="captcha_check.php"]');
                const kcaptcha = kcaptchaFieldset || kcaptchaImg || kcaptchaForm;
                
                console.log('[Captcha Debug] hCaptcha:', !!hcaptcha);
                console.log('[Captcha Debug] reCaptcha:', !!recaptcha);
                console.log('[Captcha Debug] Gnuboard kCaptcha:', !!kcaptcha);
                if (kcaptcha) {
                    console.log('[Captcha Debug] - fieldset:', !!kcaptchaFieldset);
                    console.log('[Captcha Debug] - img:', !!kcaptchaImg);
                    console.log('[Captcha Debug] - form:', !!kcaptchaForm);
                }
                
                isCaptcha = !!(hcaptcha || recaptcha || kcaptcha);
                
                // Cloudflare detection
                const titleCheck = iframeDoc.title.includes('Just a moment');
                const cfElement = iframeDoc.getElementById('cf-challenge-running');
                const cfWrapper = iframeDoc.querySelector('.cf-browser-verification');
                
                console.log('[Captcha Debug] Cloudflare title check:', titleCheck);
                console.log('[Captcha Debug] cf-challenge-running:', !!cfElement);
                console.log('[Captcha Debug] cf-browser-verification:', !!cfWrapper);
                
                isCloudflare = titleCheck || !!cfElement || !!cfWrapper;
                
            } catch (e) {
                console.warn('[Captcha Debug] CORS Error or Access Denied:', e.message);
                // If CORS blocks us, check from outside
                try {
                    const iframeUrl = iframe.contentWindow.location.href;
                    if (iframeUrl.includes('challenge') || iframeUrl.includes('captcha')) {
                        console.warn('[Captcha Debug] URL contains captcha keyword!');
                        isCaptcha = true;
                    }
                } catch (corsError) {
                    console.warn('[Captcha Debug] Cannot access iframe URL due to CORS');
                }
            }
            
            if (isCaptcha || isCloudflare) {
                console.warn('[Captcha] 감지됨! 사용자 조치 필요');
                const logger = LogBox.getInstance();
                logger.error('[Captcha] 캡차가 감지되었습니다. 해결 후 "재개" 버튼을 눌러주세요.');
                await pauseForCaptcha(url);
                logger.log('[Captcha] 해결 확인됨! 원본 주소로 다운로드 프레임 재개 중...', 'System');
                
                // 기존 다운로드용 iframe은 그대로 두고, 
                // 원본 주소(url)를 다시 로드하여 처음부터 캡차 검사 단계를 정상적으로 통과하도록 재귀호출
                await waitIframeLoad(iframe, url, viewerCfg);
                resolve();
            } else {
                console.log('[Captcha Debug] No captcha detected');
                resolve();
            }
        };
        iframe.addEventListener('load', handler);
        iframe.src = url;
    });
}

/**
 * 창(Window) 내부에 실제 콘텐츠가 로드될 때까지 폴링 대기
 * 웹툰: .view-padding div img / 소설: #novel_content
 * @param {Window} targetWindow 대기할 대상 창 (현재 창 또는 iframe.contentWindow)
 * @param {number} maxWaitMs 최대 대기 시간 (ms), 기본 8000
 * @param {object} viewerCfg 동적 파서 뷰어 설정
 * @returns {Document|null} 성공 시 Document 객체 반환, 실패/시간초과 시 null
 */
async function waitForContent(targetWindow, maxWaitMs = 8000, viewerCfg = {}) {
    const POLL_INTERVAL = 200;
    const maxAttempts = Math.ceil(maxWaitMs / POLL_INTERVAL);
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            if (!targetWindow) return null;
            const targetDoc = targetWindow.document;
            const title = targetDoc.title; // CORS 확인용 강제 접근
            
            let imgSelector = '.view-padding div img';
            if (viewerCfg.imageContainer) {
                const itemSel = viewerCfg.imageItem || 'img';
                imgSelector = viewerCfg.imageContainer.split(',').map(c => `${c.trim()} ${itemSel}`).join(', ');
            }
            const novelSelector = viewerCfg.novelContent || '#novel_content';
            
            // [개선] 룰의 exclude/remove 셀렉터를 활용한 정밀한 유효 이미지 판정
            const allImgs = Array.from(targetDoc.querySelectorAll(imgSelector));
            const excludeRule = viewerCfg.exclude || viewerCfg.remove;
            const excludeSelectors = excludeRule 
                ? (Array.isArray(excludeRule) ? excludeRule : [excludeRule]) 
                : [];

            const validImages = allImgs.filter(img => {
                const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original') || '';
                if (!src || src.startsWith('data:image')) return false;
                const lower = src.toLowerCase();
                if (lower.includes('blank.gif') || lower.includes('loading.gif') || lower.includes('loading-image.gif')) return false;
                if (excludeSelectors.some(sel => img.matches(sel) || img.closest(sel))) return false;
                return true;
            });

            const hasImages = validImages.length >= 3;
            const novelEl = targetDoc.querySelector(novelSelector);
            const hasNovel = novelEl && novelEl.innerText.trim().length > 50;
            
            if (hasImages || hasNovel) {
                const type = hasImages ? 'Webtoon' : 'Novel';
                _ui_index_js__WEBPACK_IMPORTED_MODULE_1__/* .LogBox */ .ej.getInstance().log(`[DOM Poll] ${type} 콘텐츠 감지 (유효 이미지: ${validImages.length}개, ${(i + 1) * POLL_INTERVAL}ms)`, 'DOM:Poll');
                return targetDoc;
            }
        } catch (e) {
            if (e.name === 'SecurityError' || e.message.includes('Blocked a frame')) {
                throw e;
            }
        }
        await sleep(POLL_INTERVAL);
    }
    console.warn(`[DOM Poll] ${maxWaitMs}ms 내 콘텐츠 미감지 — 갈무리 시도`);
    _ui_index_js__WEBPACK_IMPORTED_MODULE_1__/* .LogBox */ .ej.getInstance().warn(`DOM 폴링 타임아웃 ${maxWaitMs}ms — 콘텐츠 미감지, 멈춰서 물 평가`, 'DOM:Poll');
}

async function scrollToLoad(iframeDoc, stallTimeoutMs = 20000, viewerCfg = {}, multiplier = 1.0) {
    const win = iframeDoc.defaultView || iframeDoc.parentWindow;
    if (!win) return;

    const isHidden = document.visibilityState === 'hidden';
    const behavior = isHidden ? 'auto' : 'smooth';
    
    // [개선] 자식 워커 환경인 경우, 부모 창에 postMessage로 로그를 중계하는 가상 로거 프록시를 적용
    let logger = null;
    const isWorker = typeof window !== 'undefined' && window.opener && window.opener !== window;
    
    if (isWorker) {
        logger = {
            log: (msg, context = '') => {
                const prefix = context ? `[${context}] ` : '';
                try {
                    if (window.opener && !window.opener.closed) {
                        window.opener.postMessage({
                            type: 'TOKI_WORKER_LOG',
                            payload: { msg: `${prefix}${msg}`, level: 'info' },
                            timestamp: Date.now()
                        }, '*');
                    }
                } catch (e) {
                    console.log(`[ScrollEngine] ${prefix}${msg}`);
                }
            },
            warn: (msg, context = '') => {
                const prefix = context ? `[${context}] ` : '';
                try {
                    if (window.opener && !window.opener.closed) {
                        window.opener.postMessage({
                            type: 'TOKI_WORKER_LOG',
                            payload: { msg: `${prefix}${msg}`, level: 'warn' },
                            timestamp: Date.now()
                        }, '*');
                    }
                } catch (e) {
                    console.warn(`[ScrollEngine] ${prefix}${msg}`);
                }
            },
            error: (msg, context = '') => {
                const prefix = context ? `[${context}] ` : '';
                try {
                    if (window.opener && !window.opener.closed) {
                        window.opener.postMessage({
                            type: 'TOKI_WORKER_LOG',
                            payload: { msg: `${prefix}${msg}`, level: 'error' },
                            timestamp: Date.now()
                        }, '*');
                    }
                } catch (e) {
                    console.error(`[ScrollEngine] ${prefix}${msg}`);
                }
            }
        };
    } else {
        logger = _ui_index_js__WEBPACK_IMPORTED_MODULE_1__/* .LogBox */ .ej.getInstance();
    }

    logger.log('⏳ [ScrollEngine] 동적 가상화(div ➔ img) 둔갑 대기 스크롤 모드를 작동합니다.', 'DOM:Scroll');

    // 1. 부모 이미지 컨테이너 탐지
    let container = null;
    if (viewerCfg.imageContainer) {
        const containers = viewerCfg.imageContainer.split(',');
        for (const sel of containers) {
            const el = iframeDoc.querySelector(sel.trim());
            if (el) {
                container = el;
                break;
            }
        }
    }

    // 폴백용 이미지 셀렉터 정의 (부모 컨테이너가 없거나 감지 실패 시를 대비)
    let fallbackSelectors = '.view-padding div img, .viewer-main img, #v_content img, .img-tag';
    if (viewerCfg.imageContainer) {
        const itemSel = viewerCfg.imageItem || 'img';
        fallbackSelectors = viewerCfg.imageContainer.split(',').map(c => `${c.trim()} ${itemSel}`).join(', ');
    }

    // ── [케이스 1: 부모 컨테이너가 존재하고 내부 자식 노드들이 확인되는 경우 (가상화 뷰어 직격)] ──
    if (container && container.children && container.children.length > 0) {
        const pageElements = Array.from(container.children);
        logger.log(`🎯 [ScrollEngine] 컨테이너 내 직계 자식 노드 ${pageElements.length}개 발견. 둔갑 추적을 기동합니다.`, 'DOM:Scroll');

        for (let idx = 0; idx < pageElements.length; idx++) {
            const displayIdx = idx + 1;
            
            // 해당 순번의 노드를 부드럽게 화면 중앙에 고정 (Intersection Observer 트리거)
            const initialEl = container.children[idx];
            if (initialEl) {
                initialEl.scrollIntoView({ behavior, block: 'center' });
                if (isHidden) win.dispatchEvent(new Event('scroll'));
            }

            // 둔갑 및 이미지 실시간 완착 대기 루프 (최대 4초 * 배율)
            const SINGLE_PAGE_TIMEOUT = Math.round(4000 * multiplier);
            const POLL_INTERVAL = 200;
            let elapsed = 0;

            while (elapsed < SINGLE_PAGE_TIMEOUT) {
                // 매 주기마다 해당 인덱스의 최신 DOM 노드를 재조회 (div에서 img로 치환되는 동적 상황 대응)
                const currentEl = container.children[idx];
                if (!currentEl) break;

                // 해당 자리가 진짜 img 태그로 바뀌었거나, 자식으로 img 요소를 채웠는지 실시간 판별
                let targetImg = null;
                if (currentEl.tagName === 'IMG') {
                    targetImg = currentEl;
                } else {
                    targetImg = currentEl.querySelector('img');
                }

                // [개선] 1초(1000ms * multiplier) 동안 이미지 엘리먼트 자체가 생성되지 않으면 가상화 이미지 노드가 아닌 것으로 판정 (광고/댓글 등 건너뛰기)
                if (!targetImg && elapsed >= Math.round(1000 * multiplier)) {
                    logger.warn(`⚠️ [Scroll] 페이지 [${displayIdx} / ${pageElements.length}] 이미지 태그 미발견 (무관한 노드로 판단하여 대기 건너뜀)`, 'DOM:Scroll');
                    break;
                }

                // 둔갑 성공 확인 시, 해당 진짜 이미지의 바이너리 로드 완료(complete && naturalWidth > 0)까지 대기
                if (targetImg) {
                    const isLoaded = targetImg.complete && targetImg.naturalWidth > 0;
                    if (isLoaded) {
                        break;
                    }
                }

                logger.log(`⏳ [Scroll] 페이지 [${displayIdx} / ${pageElements.length}] 이미지 둔갑 대기 중... (${elapsed}ms)`, 'DOM:Scroll');
                await sleep(POLL_INTERVAL);
                elapsed += POLL_INTERVAL;
            }

            if (elapsed >= SINGLE_PAGE_TIMEOUT) {
                logger.warn(`⚠️ [Scroll] 페이지 [${displayIdx} / ${pageElements.length}] 둔갑 대기 시간 초과! (다음으로 전진)`, 'DOM:Stall');
            } else {
                logger.log(`✅ [Scroll] 페이지 [${displayIdx} / ${pageElements.length}] 이미지 완착 성공!`, 'DOM:Scroll');
            }

            await sleep(Math.round(100 * multiplier)); // 지연 로딩 방어용 완충 딜레이
        }
    } 
    // ── [케이스 2: 부모 컨테이너가 없거나 자식이 없는 경우 (구형/일반 뷰어 안전 폴백)] ──
    else {
        logger.warn('⚠️ [ScrollEngine] 자식 둔갑 추적 대상 없음. 기존 이미지 탐색 폴백 모드를 가동합니다.', 'DOM:Scroll');
        
        const allImages = Array.from(iframeDoc.querySelectorAll(fallbackSelectors));
        const excludeRule = viewerCfg.exclude || viewerCfg.remove;
        const excludeSelectors = excludeRule 
            ? (Array.isArray(excludeRule) ? excludeRule : [excludeRule]) 
            : [];

        const isDummySrc = (src) => {
            if (!src || src.trim() === '') return true;
            if (src.startsWith('data:image')) return true;
            const lower = src.toLowerCase();
            const dummyFilenames = ['blank.gif', 'loading.gif', 'loading-image.gif', 'pixel.gif', 'spacer.gif', 'transparent.gif', '1x1.gif', 'dot.gif'];
            return dummyFilenames.some(p => lower.includes(p));
        };

        const validImages = allImages.filter(img => {
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original') || '';
            if (isDummySrc(src)) return false;
            if (excludeSelectors.some(sel => img.matches(sel) || img.closest(sel))) return false;
            return true;
        });

        if (validImages.length === 0) {
            logger.warn('⚠️ [ScrollEngine] 유효한 폴백 이미지를 찾지 못했습니다. 물리적 하향 스크롤을 감행합니다.', 'DOM:Scroll');
            win.scrollTo({ top: iframeDoc.documentElement.scrollHeight, behavior });
            if (isHidden) win.dispatchEvent(new Event('scroll'));
            await sleep(1500);
            return;
        }

        logger.log(`🎯 [ScrollEngine] 폴백 이미지 ${validImages.length}개 발견. 순차 로드 스캔 개시.`, 'DOM:Scroll');

        for (let idx = 0; idx < validImages.length; idx++) {
            const img = validImages[idx];
            const displayIdx = idx + 1;

            img.scrollIntoView({ behavior, block: 'center' });
            if (isHidden) win.dispatchEvent(new Event('scroll'));

            const SINGLE_IMAGE_TIMEOUT = Math.round(4000 * multiplier);
            const POLL_INTERVAL = 200;
            let elapsed = 0;

            while (elapsed < SINGLE_IMAGE_TIMEOUT) {
                if (img.complete && img.naturalWidth > 0) break;
                logger.log(`⏳ [Scroll] 폴백 이미지 [${displayIdx} / ${validImages.length}] 로딩 대기 중... (${elapsed}ms)`, 'DOM:Scroll');
                await sleep(POLL_INTERVAL);
                elapsed += POLL_INTERVAL;
            }
            await sleep(Math.round(100 * multiplier));
        }
    }

    // 공통 마무리: 최하단으로 최종 스크롤 꽂아넣기
    win.scrollTo({ top: iframeDoc.documentElement.scrollHeight, behavior });
    if (isHidden) win.dispatchEvent(new Event('scroll'));
    logger.log('🎉 [ScrollEngine] 모든 지연 이미지 수집 및 둔갑 대기 프로세스가 대성공으로 완료되었습니다!', 'DOM:Scroll');
    await sleep(500);
}

// Pause execution until user resolves captcha
function pauseForCaptcha(targetUrl) {
    return new Promise((resumeCallback) => {
        const logger = LogBox.instance;
        
        // 1. 대시보드 팝업 열기 및 캡차 배너 표시
        if (logger) {
            logger.openDashboard();
            logger.log(`[Captcha] ⚠️ 캡차 감지! 현재 탭에서 캡차를 해결한 후 자동으로 재개됩니다.`, 'error');
        }

        // 대시보드 팝업에 캡차 배너 주입
        const showCaptchaBanner = () => {
            if (!logger) return;
            const doc = logger.popupWindow?.document;
            if (!doc) return;
            const existing = doc.getElementById('toki-captcha-banner');
            if (existing) return;
            const banner = doc.createElement('div');
            banner.id = 'toki-captcha-banner';
            banner.style.cssText = `
                position: sticky; top: 0; z-index: 9999;
                background: #c0392b; color: #fff;
                padding: 12px 16px; font-size: 14px; font-weight: bold;
                display: flex; justify-content: space-between; align-items: center;
            `;
            banner.innerHTML = `
                <span>⚠️ 캡차 감지 — 원본 탭에서 캡차를 해결해 주세요</span>
                <button id="toki-captcha-manual-resume" style="background:#fff;color:#c0392b;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ 수동 재개</button>
            `;
            doc.body.prepend(banner);
            doc.getElementById('toki-captcha-manual-resume').onclick = () => {
                clearInterval(checkInterval);
                banner.remove();
                resumeCallback();
            };
        };

        setTimeout(showCaptchaBanner, 300);

        // 2. 현재 탭 포커스 (사용자 안내)
        window.focus();

        // 3. 백그라운드 폴링 — 대상 페이지 document를 직접 감시
        const checkInterval = setInterval(() => {
            try {
                const captchaFieldset = document.querySelector('fieldset#captcha, fieldset.captcha');
                const captchaImg = document.querySelector('img.captcha_img, img[src*="kcaptcha_image.php"]');
                const captchaForm = document.querySelector('form[action*="captcha_check.php"]');
                const hcaptcha = document.querySelector('iframe[src*="hcaptcha"]');
                const recaptcha = document.querySelector('.g-recaptcha');
                const cloudflare = document.querySelector('.cf-browser-verification');
                const hasCaptcha = !!(captchaFieldset || captchaImg || captchaForm || hcaptcha || recaptcha || cloudflare);

                if (!hasCaptcha) {
                    clearInterval(checkInterval);
                    if (logger) {
                        const doc = logger.popupWindow?.document;
                        doc?.getElementById('toki-captcha-banner')?.remove();
                        logger.log('[Captcha] ✅ 해결 감지! 수집을 재개합니다.', 'success');
                    }
                    resumeCallback();
                }
            } catch(e) {
                // 페이지 전환 등 — 해결된 것으로 간주
                clearInterval(checkInterval);
                if (logger) {
                    const doc = logger.popupWindow?.document;
                    doc?.getElementById('toki-captcha-banner')?.remove();
                }
                resumeCallback();
            }
        }, 1000);
    });
}


// data: JSZip object OR Blob OR Promise<Blob>
async function saveFile(data, filename, type = 'local', extension = 'zip', metadata = {}) {
    const fullFileName = `${filename}.${extension}`;
    
    let content;
    if (data.generateAsync) {
        // [v1.7.3] Native 다운로드 시 확장자 변조 방지를 위해 MIME 타입 명시
        const mimeMap = {
            cbz: 'application/octet-stream', // content-sniffing 방지를 위해 범용 바이너리 타입 사용
            epub: 'application/epub+zip',
            zip: 'application/zip'
        };
        content = await data.generateAsync({ 
            type: "blob",
            mimeType: mimeMap[extension] || 'application/zip'
        });
    } else {
        content = await data; // Unbox promise or use blob directly
    }

    if (type === 'local') {
        console.log(`[Local] 다운로드 중... (${fullFileName})`);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = fullFileName;
        link.click();
        const url = link.href;
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        link.remove();
        console.log(`[Local] 완료`);
    } else if (type === 'native') {
        // [v1.6.0] GM_download with subfolder support
        const folderName = metadata.folderName || "TokiSync";
        // Final Path: "TokiSync/SeriesTitle/Filename.zip"
        const finalPath = `TokiSync/${folderName}/${fullFileName}`.replace(/[<>:"|?*]/g, '_'); // Sanitization for safety

        console.log(`[Native] 자동 분류 다운로드 시도... (${finalPath})`);
        const logger = _ui_index_js__WEBPACK_IMPORTED_MODULE_1__/* .LogBox */ .ej.getInstance();

        return new Promise((resolve, reject) => {
            if (typeof GM_download !== 'function') {
                const err = "GM_download 권한이 없거나 지원되지 않는 환경입니다.";
                logger.error(`[Native] 실패: ${err}`);
                reject(new Error(err));
                return;
            }

            GM_download({
                url: URL.createObjectURL(content),
                name: finalPath,
                saveAs: false, // Use browser setting or automatic
                onload: () => {
                   logger.success(`[Native] 자동 저장 완료: ${fullFileName}`);
                   resolve(true);
                },
                onerror: (err) => {
                    const errMsg = err ? (err.error || err.reason || "알 수 없는 오류") : "알 수 없는 오류";
                    if (err && err.error === 'not_whitelisted') {
                        logger.critical(`[Native 방어] 다운로드 차단됨: 지원하지 않는 확장자입니다.\n👉 템퍼몽키 [설정] -> [고급] -> [Whitelisted File Extensions]에 '${extension}' 확장자(cbz/epub)를 추가해주세요.`);
                    } else {
                        logger.error(`[Native] 다운로드 실패: ${errMsg}`);
                    }
                    console.error("[Native Error]", err);
                    reject(new Error(errMsg));
                }
            });
        });
    } else if (type === 'drive') {
        const logger = _ui_index_js__WEBPACK_IMPORTED_MODULE_1__/* .LogBox */ .ej.getInstance();
        logger.log(`[Drive] 구글 드라이브 업로드 준비 중... (${fullFileName})`);
        
        try {
            // Call separate GAS module
            // metadata.folderName: Series Title (if provided), otherwise fallback to filename
            const targetFolder = metadata.folderName || filename;
            await (0,_gas_js__WEBPACK_IMPORTED_MODULE_0__/* .uploadToGAS */ .yv)(content, targetFolder, fullFileName, metadata);
            
            logger.success(`[Drive] 업로드 완료: ${fullFileName}`);
            // alert(`구글 드라이브 업로드 완료!\n${fullFileName}`); // Removed to prevent spam
        } catch (e) {
            console.error(e);
            logger.error(`[Drive] 업로드 실패: ${e.message}`);
            throw e;
        }
    }
}

/**
 * Blob으로부터 이미지의 가로/세로 크기를 추출 (비동기)
 * @param {Blob} blob 
 * @returns {Promise<{width: number, height: number}>}
 */
async function getImageDimensions(blob) {
    try {
        const bitmap = await createImageBitmap(blob);
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close(); // 메모리 해제
        return dimensions;
    } catch (e) {
        console.warn('[Utils] Image dimensions extraction failed:', e);
        return { width: 0, height: 0 };
    }
}

/**
 * [v1.8.4] GM_xmlhttpRequest 기반의 안전한 Blob Fetcher
 * 브라우저 fetch()로 인해 발생하는 CORS 및 Referer 차단을 우회합니다.
 * @param {string} url 
 * @param {string} [referer]
 * @returns {Promise<Blob>}
 */
async function fetchBlobWithXHR(url, referer) {
    // 35초 절대 강제 타임아웃 프로미스 정의 (CORS/샌드박스 먹통 상황 방어용 극약 처방)
    let timeoutTimer = null;
    const forceTimeoutPromise = new Promise((_, reject) => {
        timeoutTimer = setTimeout(() => {
            reject(new Error(`절대 타임아웃 한계(35초) 초과로 다운로드를 강제 건너뛰었습니다.`));
        }, 35000);
    });

    const downloadPromise = (async () => {
        // 1. GM_xmlhttpRequest API 유효성 검사 및 표준 fetch 1차 폴백 우회
        if (typeof GM_xmlhttpRequest === 'undefined') {
            console.warn('[TokiSync Utils] GM_xmlhttpRequest가 팝업 환경에서 유효하지 않습니다. 표준 fetch API로 즉시 대체합니다:', url);
            try {
                const resp = await fetch(url, {
                    mode: 'cors',
                    credentials: 'include'
                });
                if (!resp.ok) throw new Error(`HTTP status ${resp.status}`);
                return await resp.blob();
            } catch (fetchErr) {
                throw new Error(`Standard Fetch 실패 (CORS 또는 네트워크 장애): ${fetchErr.message} -> ${url}`);
            }
        }

        return new Promise((resolve, reject) => {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        "Referer": referer || window.location.href,
                        "User-Agent": navigator.userAgent
                    },
                    responseType: 'blob',
                    timeout: 25000, // 25초 네트워크 타임아웃으로 조정
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve(res.response);
                        } else {
                            reject(new Error(`HTTP ${res.status}: ${url}`));
                        }
                    },
                    onerror: (err) => {
                        console.warn('[TokiSync Utils] GM_xmlhttpRequest 오류 감지. fetch 폴백을 발동합니다:', url);
                        fetch(url, { mode: 'cors', credentials: 'include' })
                            .then(r => {
                                if (!r.ok) throw new Error(`HTTP status ${r.status}`);
                                return r.blob();
                            })
                            .then(resolve)
                            .catch(e => reject(new Error(`GM_xmlhttpRequest 에러 및 fetch 폴백 실패: ${e.message}`)));
                    },
                    ontimeout: () => {
                        console.warn('[TokiSync Utils] GM_xmlhttpRequest 25초 타임아웃. fetch 폴백 시도:', url);
                        fetch(url, { mode: 'cors', credentials: 'include' })
                            .then(r => {
                                if (!r.ok) throw new Error(`HTTP status ${r.status}`);
                                return r.blob();
                            })
                            .then(resolve)
                            .catch(reject);
                    }
                });
            } catch (e) {
                console.error('[TokiSync Utils] GM_xmlhttpRequest 호출 중 예외 발생, 일반 fetch로 긴급 우회:', e);
                fetch(url, { mode: 'cors', credentials: 'include' })
                    .then(r => {
                        if (!r.ok) throw new Error(`HTTP status ${r.status}`);
                        return r.blob();
                    })
                    .then(resolve)
                    .catch(reject);
            }
        });
    })();

    try {
        const result = await Promise.race([downloadPromise, forceTimeoutPromise]);
        return result;
    } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
    }
}


/***/ }),

/***/ 929:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   extractEpisodeData: function() { return /* binding */ extractEpisodeData; }
/* harmony export */ });
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(924);
/* harmony import */ var _logger_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(569);
/* harmony import */ var _worker_controller_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(572);




/**
 * 뷰어 페이지(또는 팝업 워커) 내에서 직접 데이터를 추출하는 범용 모듈
 * 
 * @param {Document} targetDoc 대상 문서 객체 (현재 창의 document 또는 iframe 내부 document)
 * @param {Object} parser 선택된 사이트의 GenericParser 인스턴스
 * @param {Object} siteInfo 사이트 메타데이터 (category 등)
 * @param {boolean} isStaticDoc XHR로 가져온 정적 HTML인지 여부
 * @param {string} episodeUrl 에피소드 URL (API 복호화 폴백용)
 * @returns {Promise<Object>} 추출 결과 { urls: string[], content: string, title: string, episodeTitle: string }
 */
async function extractEpisodeData(targetDoc, parser, siteInfo, isStaticDoc = false, episodeUrl = null) {
    const isNovel = (siteInfo.category === 'Novel' || siteInfo.category === 'novel');
    const viewerCfg = parser.rule.viewer || {};

    let extractedData = {
        urls: [],
        content: "",
        seriesTitle: "",
        episodeTitle: "",
        episodeNum: ""
    };

    // 1. 소설 텍스트 추출 로직
    if (isNovel) {
        extractedData.content = parser.getNovelContent(targetDoc);

        // [전략 B] DOM 추출 실패 + API 복호화 설정이 있는 경우 폴백 시도
        if (!extractedData.content && viewerCfg.decryptApi && episodeUrl) {
            _logger_js__WEBPACK_IMPORTED_MODULE_1__.logger.log('[Extractor] DOM 추출 실패 - API 복호화 폴백 시도...', 'Extractor');
            extractedData.content = await (0,_worker_controller_js__WEBPACK_IMPORTED_MODULE_2__/* .fetchNovelText */ .UT)(episodeUrl, viewerCfg.decryptApi);
            if (extractedData.content) {
                _logger_js__WEBPACK_IMPORTED_MODULE_1__.logger.log('✅ API 복호화 폴백 성공', 'Extractor');
            }
        }
    } 
    // 2. 웹툰 이미지 추출 로직
    else {
        // 초기 파싱 (정규식/DOM)
        const initialUrls = parser.getImageList(targetDoc);

        // 물리 스크롤 대기 (정적 문서는 스킵)
        if (!isStaticDoc && targetDoc.defaultView) {
            await (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__/* .scrollToLoad */ .Vs)(targetDoc, 20000, viewerCfg);
        } else {
            console.log('[Extractor] 정적 문서이거나 Window 객체가 없어 스크롤을 건너뜁니다.');
        }

        // 스크롤 후 최종 파싱
        let finalUrls = isStaticDoc ? initialUrls : parser.getImageList(targetDoc);

        // Dummy(Placeholder) 우회 병합
        const mergedUrls = finalUrls.map((final, idx) => {
            const initial = initialUrls[idx];
            if (final.isDummy && initial && !initial.isDummy) {
                console.log(`[Extractor] Placeholder 우회: ${final.url.split('/').pop()} -> ${initial.url.split('/').pop()}`);
                return initial.url;
            }
            return final.url;
        }).filter(url => url !== "");

        _logger_js__WEBPACK_IMPORTED_MODULE_1__.logger.log(`[Extractor] 이미지 ${mergedUrls.length}개 감지`, 'Extractor');

        // 이미지 감지 0개 시 1.5초 대기 후 재시도
        if (mergedUrls.length === 0 && !isStaticDoc) {
            _logger_js__WEBPACK_IMPORTED_MODULE_1__.logger.warn('[Extractor] 이미지 0개 — 1.5초 후 재파싱 시도', 'Extractor');
            await (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__/* .sleep */ .yy)(1500);
            const retryUrls = parser.getImageList(targetDoc);
            if (retryUrls.length > 0) mergedUrls.push(...retryUrls.map(u => u.url).filter(u => u !== ""));
            _logger_js__WEBPACK_IMPORTED_MODULE_1__.logger.log(`[Extractor] 재파싱 결과: ${mergedUrls.length}개`, 'Extractor');
        }

        extractedData.urls = mergedUrls;
    }

    // 3. 메타데이터 (작품명, 에피소드 제목) 자체 추출 시도
    // 뷰어 페이지에서 직접 단건 실행하거나 팝업 워커일 경우를 대비함
    try {
        if (parser.getViewerMetadata) {
            const metadata = parser.getViewerMetadata(targetDoc);
            extractedData.seriesTitle = metadata.seriesTitle;
            extractedData.episodeTitle = metadata.episodeTitle;
            extractedData.episodeNum = metadata.episodeNum;
        }
    } catch (e) {
        console.warn("[Extractor] 뷰어 메타데이터 추출 실패:", e);
    }

    return extractedData;
}


/***/ }),

/***/ 941:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Ac: function() { return /* binding */ sendToParent; },
/* harmony export */   Q_: function() { return /* binding */ registerIpcListener; },
/* harmony export */   Re: function() { return /* binding */ removeWorkerOrigin; },
/* harmony export */   S6: function() { return /* binding */ registerWorkerOrigin; },
/* harmony export */   eu: function() { return /* binding */ sendToWorker; }
/* harmony export */ });
/* unused harmony exports validateNonce, getWorkerOrigin */
/**
 * tokiSync - Unified IPC Broker
 * Handles clean postMessage communication between Parent (Controller) and Child (Worker).
 *
 * Security: Nonce-based session tokens + origin validation (C4 + H12 fixes).
 * Tampermonkey popups use about:blank (origin="null"), so origin checks alone
 * are insufficient. Every message must carry a valid session nonce.
 */

const MSG_PREFIX = 'TOKI_';

// --- Security: Trusted worker origins and nonce registry ---
const _trustedWorkerOrigins = new Map(); // workerId -> origin
const _activeNonces = new Set();         // Set of valid session nonces
const _nonceToWorkerId = new Map();      // nonce -> workerId (for reverse lookup)

/**
 * Generate a cryptographically random nonce (32 bytes, hex-encoded = 64 chars)
 */
function generateNonce() {
    const bytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        // Fallback for older environments (should not happen in modern browsers)
        for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Register a worker's origin and create a session nonce.
 * Call this when opening a worker popup.
 * @param {string} workerId Unique identifier for the worker session
 * @param {string} origin The origin of the worker window (may be "null" for about:blank)
 * @returns {string} The generated session nonce
 */
function registerWorkerOrigin(workerId, origin) {
    _trustedWorkerOrigins.set(workerId, origin);
    const nonce = generateNonce();
    _activeNonces.add(nonce);
    _nonceToWorkerId.set(nonce, workerId);
    console.log(`[IPC:Broker] Worker origin registered: ${workerId} (origin=${origin})`);
    return nonce;
}

/**
 * Remove a worker's origin and invalidate its session nonce.
 * Call this when closing or cleaning up a worker popup.
 * @param {string} workerId
 * @param {string} [nonce] Optional: specific nonce to invalidate
 */
function removeWorkerOrigin(workerId, nonce) {
    _trustedWorkerOrigins.delete(workerId);
    if (nonce) {
        _activeNonces.delete(nonce);
        _nonceToWorkerId.delete(nonce);
    } else {
        // Invalidate all nonces belonging to this worker
        for (const [n, wid] of _nonceToWorkerId.entries()) {
            if (wid === workerId) {
                _activeNonces.delete(n);
                _nonceToWorkerId.delete(n);
            }
        }
    }
    console.log(`[IPC:Broker] Worker origin removed: ${workerId}`);
}

/**
 * Validate a nonce. Returns the associated workerId if valid, null otherwise.
 */
function validateNonce(nonce) {
    if (!nonce || !_activeNonces.has(nonce)) return null;
    return _nonceToWorkerId.get(nonce) || null;
}

/**
 * Get the stored origin for a worker.
 */
function getWorkerOrigin(workerId) {
    return _trustedWorkerOrigins.get(workerId) || null;
}

/**
 * Send message from Parent to Worker popup
 * @param {Window} workerRef Reference to the worker popup window
 * @param {string} type Message type (without prefix, e.g. 'START_EXTRACTION')
 * @param {Object} payload Metadata and payload
 * @param {string} [nonce] Session nonce for validation
 */
function sendToWorker(workerRef, type, payload = {}, nonce) {
    if (!workerRef || workerRef.closed) {
        console.warn(`[IPC:Broker] Cannot send to worker: Popup window is closed or invalid.`);
        return false;
    }
    const message = {
        type: type.startsWith(MSG_PREFIX) ? type : `${MSG_PREFIX}${type}`,
        payload: payload,
        timestamp: Date.now()
    };
    if (nonce) {
        message.nonce = nonce;
    }
    try {
        // H12 fix: Use specific origin when available, fallback to '*' for about:blank popups
        // Tampermonkey popups have origin="null", so we must use '*' but nonce validates authenticity
        workerRef.postMessage(message, '*');
        return true;
    } catch (err) {
        console.error(`[IPC:Broker] postMessage to worker failed:`, err);
        return false;
    }
}

/**
 * Send message from Child Worker to Parent window
 * @param {string} type Message type (without prefix, e.g. 'WORKER_READY')
 * @param {Object} payload Metadata and payload
 * @param {string} [nonce] Session nonce for validation
 */
function sendToParent(type, payload = {}, nonce, transferables) {
    if (!window.opener || window.opener.closed) {
        console.warn(`[IPC:Broker] Cannot send to parent: Opener window is closed or unavailable.`);
        return false;
    }
    const message = {
        type: type.startsWith(MSG_PREFIX) ? type : `${MSG_PREFIX}${type}`,
        payload: payload,
        timestamp: Date.now()
    };
    if (nonce) {
        message.nonce = nonce;
    }
    try {
        // H12 fix: Use opener's origin when accessible, fallback to '*' for cross-origin
        let targetOrigin = '*';
        try {
            targetOrigin = window.opener.location.origin || '*';
        } catch (e) {
            // Cross-origin access to location.origin is blocked; use '*'
            // Nonce validation on the receiving end provides security
        }
        window.opener.postMessage(message, targetOrigin, transferables);
        return true;
    } catch (err) {
        console.error(`[IPC:Broker] postMessage to parent failed:`, err);
        return false;
    }
}

/**
 * Register postMessage Listener with validation
 * @param {Function} callback Handler function (eventData) => {}
 * @param {Object} [options] Optional security configuration
 * @param {boolean} [options.requireNonce=false] Whether to require nonce validation
 * @param {string} [options.listenerId='default'] Listener identifier
 * @returns {Function} Cleanup function to remove event listener
 */
function registerIpcListener(callback, options = {}) {
    // Support legacy signature: registerIpcListener(callback, listenerId)
    let listenerId = 'default';
    let requireNonce = false;
    if (typeof options === 'string') {
        listenerId = options;
    } else if (typeof options === 'object') {
        listenerId = options.listenerId || 'default';
        requireNonce = options.requireNonce || false;
    }

    const targetWindow = typeof window !== 'undefined' ? (window.top || window) : null;

    if (targetWindow) {
        if (!targetWindow.__tokisync_ipc_listeners) {
            targetWindow.__tokisync_ipc_listeners = {};
        }

        if (targetWindow.__tokisync_ipc_listeners[listenerId]) {
            console.log(`[IPC:Broker] 기존 등록된 중복 리스너 해제 수행 (ID: ${listenerId})`);
            try {
                targetWindow.removeEventListener('message', targetWindow.__tokisync_ipc_listeners[listenerId]);
            } catch (e) {
                console.warn(`[IPC:Broker] 리스너 해제 실패 (ID: ${listenerId}):`, e);
            }
            delete targetWindow.__tokisync_ipc_listeners[listenerId];
        }
    }

    const handler = (event) => {
        if (!event.data || typeof event.data !== 'object') return;

        const { type, payload, timestamp, nonce } = event.data;
        if (!type || !type.startsWith(MSG_PREFIX)) return;

        // C4 fix: Origin validation — reject messages from non-null origins that aren't trusted
        if (event.origin !== 'null' && event.origin !== '' && event.origin !== window.location.origin) {
            // For parent window: only accept from same origin or about:blank popups (origin="null")
            console.warn(`[IPC:Broker] Blocked message from untrusted origin: ${event.origin}`);
            return;
        }

        // C4 fix: Nonce validation (when required or when nonce is present)
        if (nonce) {
            const workerId = validateNonce(nonce);
            if (!workerId) {
                console.warn(`[IPC:Broker] Blocked message with invalid/expired nonce`);
                return;
            }
        } else if (requireNonce) {
            console.warn(`[IPC:Broker] Blocked message without required nonce`);
            return;
        }

        // Strip prefix for uniform routing inside callback
        const normalizedType = type.substring(MSG_PREFIX.length);

        callback({
            type: normalizedType,
            payload: payload || {},
            timestamp: timestamp,
            nonce: nonce,
            sourceEvent: event
        });
    };

    if (targetWindow) {
        targetWindow.addEventListener('message', handler);
        targetWindow.__tokisync_ipc_listeners[listenerId] = handler;
        console.log(`[IPC:Broker] 신규 IPC 리스너 등록 완료 (ID: ${listenerId})`);
    } else {
        if (typeof window !== 'undefined') {
            window.addEventListener('message', handler);
        }
    }

    return () => {
        if (targetWindow) {
            if (targetWindow.__tokisync_ipc_listeners[listenerId] === handler) {
                targetWindow.removeEventListener('message', handler);
                delete targetWindow.__tokisync_ipc_listeners[listenerId];
                console.log(`[IPC:Broker] IPC 리스너 명시적 해제 완료 (ID: ${listenerId})`);
            }
        } else {
            if (typeof window !== 'undefined') {
                window.removeEventListener('message', handler);
            }
        }
    };
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	!function() {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = function(exports, definition) {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	!function() {
/******/ 		__webpack_require__.o = function(obj, prop) { return Object.prototype.hasOwnProperty.call(obj, prop); }
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	!function() {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = function(exports) {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	}();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};

// EXTERNAL MODULE: ./src/core/utils.js
var utils = __webpack_require__(924);
// EXTERNAL MODULE: ./src/core/extractor.js
var extractor = __webpack_require__(929);
// EXTERNAL MODULE: ./src/core/parsers/GenericParser.js + 1 modules
var GenericParser = __webpack_require__(443);
// EXTERNAL MODULE: ./src/core/parsers/RuleManager.js
var RuleManager = __webpack_require__(543);
;// ./src/core/detector.js


/**
 * detectSite
 * Detects the current site and returns site info.
 * Now supports both dynamic rules and legacy hardcoded patterns.
 * @returns {Promise<Object|null>}
 */
async function detectSite() {
    const url = window.location.href;
    const domain = window.location.hostname;
    const protocolDomain = `${window.location.protocol}//${domain}`;

    // Dynamic Rule Matching
    const matchedRule = await RuleManager/* RuleManager */.u.matchRule(url);
    if (matchedRule) {
        return { 
            site: 'generic', 
            protocolDomain, 
            matchedRule,
            category: matchedRule.category || 'Webtoon'
        };
    }

    return null;
}

;// ./src/core/parsers/ParserFactory.js



/**
 * ParserFactory
 * Creates and provides the appropriate parser for the current site.
 */
class ParserFactory {
    static #instance = null;

    /**
     * Get the appropriate parser for the current site (Singleton)
     * @returns {Promise<BaseParser|null>}
     */
    static async getParser() {
        if (this.#instance) return this.#instance;

        const siteInfo = await detectSite();
        if (!siteInfo) {
            console.error('[ParserFactory] Failed to detect site');
            console.error('TokiSync 파서 에러: 매칭되는 파싱 룰이 없습니다. 사이트 업데이트 또는 수동 룰 추가가 필요합니다.');
            return null;
        }

        const { site, protocolDomain, matchedRule } = siteInfo;

        // Dynamic Generic Parser
        if (site === 'generic' && matchedRule) {
            this.#instance = new GenericParser.GenericParser(protocolDomain, matchedRule);
            return this.#instance;
        }

        return null;
    }

    /**
     * Clear the cached parser instance to force reload rules.
     */
    static clearCache() {
        this.#instance = null;
        console.log('[ParserFactory] Parser cache cleared.');
    }
}

// EXTERNAL MODULE: ./src/core/epub.js
var epub = __webpack_require__(523);
// EXTERNAL MODULE: ./src/core/cbz.js
var cbz = __webpack_require__(416);
// EXTERNAL MODULE: ./src/core/txt.js
var txt = __webpack_require__(409);
// EXTERNAL MODULE: ./src/core/ui/index.js + 6 modules
var ui = __webpack_require__(605);
// EXTERNAL MODULE: ./src/core/logger.js
var logger = __webpack_require__(569);
// EXTERNAL MODULE: ./src/core/config.js
var core_config = __webpack_require__(899);
// EXTERNAL MODULE: ./src/core/EventBus.js
var EventBus = __webpack_require__(31);
;// ./src/core/anti_sleep.js
/**
 * Anti-Sleep Module
 * Prevents browser tab throttling by playing silent audio
 */

let audioContext = null;
let audioEl = null;
let oscillator = null;

function core_startSilentAudio() {
    if (audioContext && audioContext.state === 'running') {
        console.log('[Anti-Sleep] Already running');
        return;
    }
    
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const dest = audioContext.createMediaStreamDestination();
        const gain = audioContext.createGain();
        
        oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 1; // 1Hz (Inaudible)
        oscillator.type = 'sine';
        gain.gain.value = 0.001; // Near silence
        
        oscillator.connect(gain);
        gain.connect(dest);
        oscillator.start();
        
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.classList.add('toki-hidden');
            document.body.appendChild(audioEl);
        }
        
        audioEl.srcObject = dest.stream;
        audioEl.play()
            .then(() => console.log('🔊 [Anti-Sleep] Audio started successfully'))
            .catch(e => {
                console.warn('🚫 [Anti-Sleep] Autoplay blocked:', e);
                throw e; // Re-throw to let caller handle
            });
            
    } catch (e) {
        console.error('[Anti-Sleep] Failed to start:', e);
        throw e;
    }
}

function core_stopSilentAudio() {
    try {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }
        
        if (audioEl) {
            audioEl.pause();
            audioEl.srcObject = null;
        }
        
        if (audioContext) {
            const ctx = audioContext;
            audioContext = null;
            ctx.close().then(() => {
                console.log('🔇 [Anti-Sleep] Audio stopped');
            }).catch(e => {
                console.warn('[Anti-Sleep] close error:', e);
            });
        }
    } catch (e) {
        console.error('[Anti-Sleep] Failed to stop:', e);
    }
}

function isAudioRunning() {
    return audioContext && audioContext.state === 'running';
}

// EXTERNAL MODULE: ./src/core/gas.js
var gas = __webpack_require__(488);
// EXTERNAL MODULE: ./src/core/network.js
var network = __webpack_require__(391);
// EXTERNAL MODULE: ./src/core/worker-controller.js
var worker_controller = __webpack_require__(572);
// EXTERNAL MODULE: ./src/core/queue.js
var core_queue = __webpack_require__(302);
;// ./src/core/downloader.js

















async function shouldSkipEpisode({
    numStr,
    destination,
    isSingleVolume,
    uploadedHistorySet,
    historyCheckTimeoutFlag,
    historyFolderId,
    logOnSkip = false,
    episodeTitle = ''
}) {
    if (isSingleVolume) return false;
    if (destination !== 'drive' && destination !== 'drive_kavita') return false;

    const numPlain = parseInt(numStr).toString();
    if (uploadedHistorySet.size > 0 && (uploadedHistorySet.has(numStr) || uploadedHistorySet.has(numPlain))) {
        if (logOnSkip) {
            logger.logger.log(`⏭️ 건너뜀 (이미 업로드됨): ${episodeTitle}`);
        }
        return true;
    }
    
    if (historyCheckTimeoutFlag && historyFolderId) {
        if (logOnSkip) {
            logger.logger.log(`🔍 [페일세이프] 타임아웃 2차 단일 로컬/원격 검사 중: ${episodeTitle}`);
        }
        const isUploaded = await (0,network/* checkSingleHistoryDirect */.OS)(historyFolderId, numStr);
        if (isUploaded) {
            if (logOnSkip) {
                logger.logger.log(`⏭️ [페일세이프 재검사] 건너뜀 (이미 업로드됨): ${episodeTitle}`);
            }
            return true;
        }
    }
    
    return false;
}

async function processItem(item, builder, siteInfo, iframe, parser, seriesTitle = "", targetDoc = null, rootFolder = "", destination = "local") {
    const { category } = siteInfo;
    const isNovel = (category === 'Novel' || category === 'novel');
    const viewerCfg = parser.rule.viewer || {};

    const config = (0,core_config/* getConfig */.zj)();
    const multiplier = core_config/* SLEEP_MULTIPLIERS */.dx[config.sleepMode] || core_config/* SLEEP_MULTIPLIERS */.dx.cautious;

    const id = (0,core_queue/* getQueueItemId */.G8)(seriesTitle, item.num ? item.num.toString() : '');
    
    // [H1] Queue Write Monopoly: 상태 변경은 EventBus를 통해 queue.js로 위임
    // [H2] activeWorkers 등록으로 스케줄러 중복 기동 방지 가드 활성화
    EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.QUEUE_ITEM_UPDATE, { id, updates: { status: 'processing', stage: core_queue/* WORKER_STAGE */.WB.INIT } });
    core_queue/* activeWorkers */.mR.set(id, { type: 'single-volume' });

    const finalRootFolder = rootFolder || seriesTitle || 'UnknownSeries';

    const currentNovelMode = config.novelMode;
    const isSingleVolume = isNovel && currentNovelMode === 'singleVolume';
    const buildingPolicy = config.buildingPolicy || 'individual';

    try {
        if (isNovel) {
            logger.logger.log(`[소설] 추출 중: ${item.title}`, 'Downloader');

            const result = await (0,worker_controller/* fetchNovelText */.UT)(item.src, {
                decryptApi: viewerCfg.decryptApi || null,
                viewerCfg: viewerCfg,
                seriesTitle: seriesTitle,
                rootFolder: finalRootFolder,
                queueId: id,
                episodeTitle: item.title,
                episodeNum: item.num,
                folderId: item.folderId || config.folderId || '',
                destination: destination,
                novelFormat: config.novelFormat || 'epub',
                matchedRule: parser.rule,
                protocolDomain: parser.protocolDomain,
                scanSpeedMultiplier: config.scanSpeed / 750,
                localNameTemplate: config.localNameTemplate,
                localEpisodePadding: config.localEpisodePadding
            });

            if (typeof result === 'string') {
                builder.addChapter(item.title, result.trim());
                logger.logger.log(`✅ [부모 컨트롤러] 소설 추출 성공 (조립 적재 완료): ${item.title}`, 'Downloader');
                
                // [H1] 단일 합본용 큐 아이템 상태 갱신 — EventBus 경유
                EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.QUEUE_ITEM_UPDATE, { id, updates: { status: 'completed', progressPercent: 100, stage: core_queue/* WORKER_STAGE */.WB.COMPLETED } });
                EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.UPDATE_PROGRESS);
                
                await (0,utils/* sleep */.yy)(1500 * multiplier, 1000 * multiplier);
                return false; // 부모 측에서 일괄 빌드 및 최종 저장을 하도록 false 반환
            } else {
                throw new Error(`추출 실패 (소설 본문 응답 없음)`);
            }
        } 
        else {
            logger.logger.log(`[만화] 추출 중: ${item.title}`, 'Downloader');

            const images = await (0,worker_controller/* fetchComicImages */.gq)(item.src, {
                viewerCfg: viewerCfg,
                seriesTitle: seriesTitle,
                rootFolder: finalRootFolder,
                queueId: id,
                episodeTitle: item.title,
                episodeNum: item.num,
                folderId: item.folderId || config.folderId || '',
                destination: destination,
                matchedRule: parser.rule,
                protocolDomain: parser.protocolDomain,
                scanSpeedMultiplier: config.scanSpeed / 750,
                localNameTemplate: config.localNameTemplate,
                localEpisodePadding: config.localEpisodePadding
            });

            if (Array.isArray(images)) {
                // resolvedImages: [{ url, data: ArrayBuffer, ext, isMissing }, ...]
                const resolvedImages = images.map(img => {
                    const mimeType = img.ext?.includes('png') ? 'image/png' : (img.ext?.includes('webp') ? 'image/webp' : 'image/jpeg');
                    return {
                        url: img.url,
                        blob: img.data ? new Blob([img.data], { type: mimeType }) : new Blob([]),
                        ext: img.ext || '.jpg',
                        isMissing: !!img.isMissing
                    };
                });

                builder.addChapter(item.title, resolvedImages);
                logger.logger.log(`✅ [부모 컨트롤러] 만화 이미지 추출 성공 (조립 적재 완료): ${item.title}`, 'Downloader');
                
                // [H1] 단일 합본용 큐 아이템 상태 갱신 — EventBus 경유
                EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.QUEUE_ITEM_UPDATE, { id, updates: { status: 'completed', progressPercent: 100, stage: core_queue/* WORKER_STAGE */.WB.COMPLETED } });
                EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.UPDATE_PROGRESS);

                await (0,utils/* sleep */.yy)(1500 * multiplier, 1000 * multiplier);
                return false; // 부모 측에서 일괄 저장하므로 false 반환
            } else {
                throw new Error(`추출 실패 (만화 팝업 수집 실패)`);
            }
        }
    } finally {
        // [H2] activeWorkers 정리 — 단일/배치 무관하게 항상 실행
        core_queue/* activeWorkers */.mR.delete(id);
        
        // 단일 합본 및 배치 모드가 아닐 때만 즉시 큐 청소 (UI 지속 노출 보장)
        if (!isSingleVolume && buildingPolicy !== 'zipOfCbzs') {
            (0,core_queue/* removeQueueItem */.d$)(id);
        }
    }
}


/**
 * "1,2,4-10,15" 형식 문자열을 에피소드 번호 Set으로 변환
 * @param {string} spec - 범위 문자열. 빈 값이면 null 반환 (전체 의미)
 * @returns {Set<number>|null}
 */
function parseRangeSpec(spec) {
    if (!spec || !spec.trim()) return null; // 빈 입력 = 전체
    const nums = new Set();
    const parts = spec.split(',');
    for (const part of parts) {
        const trimmed = part.trim();
        const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const from = parseInt(rangeMatch[1]);
            const to   = parseInt(rangeMatch[2]);
            for (let n = Math.min(from, to); n <= Math.max(from, to); n++) nums.add(n);
        } else if (/^\d+$/.test(trimmed)) {
            nums.add(parseInt(trimmed));
        }
    }
    return nums.size > 0 ? nums : null;
}

async function tokiDownload(rangeSpec, policy = 'zipOfCbzs', forceOverwrite = false) {
    const config = (0,core_config/* getConfig */.zj)();
    let isAsyncDelegate = false;
    
    // --- 🚨 대기열 프리체크 스마트 필터 및 UI 위임 ---
    const currentQueue = (0,core_queue/* getQueue */.IS)();
    if (currentQueue.length > 0) {
        const hasFailed = currentQueue.some(item => item.status === 'failed');
        const hasPendingOrProcessing = currentQueue.some(item => item.status === 'pending' || item.status === 'processing');

        if (hasFailed || hasPendingOrProcessing) {
            const confirmNew = confirm(
                "⚠️ 대기열에 완료되지 않았거나 실패한 수집 항목이 남아있습니다.\n\n" +
                "[확인] 기존 대기열 초기화 후 새로 다운로드 시작\n" +
                "[취소] 다운로드 요청 취소 및 대기열 수동 관리 창 열기"
            );
            
            if (confirmNew) {
                console.log('[TokiSync] 사용자의 승인으로 기존 대기열을 초기화합니다.');
                (0,core_queue/* stopAllWorkers */.HO)();
                (0,core_queue/* clearQueue */.lg)();
            } else {
                console.log('[TokiSync] 다운로드 요청을 취소하고 대기열 관리 창을 엽니다.');
                (0,ui/* showProgressModal */.c9)();
                return;
            }
        } else {
            // 온전히 완료된 큐만 있다면 묻지 않고 자동 초기화
            console.log('[TokiSync] 이전 수집이 정상 완료되었으므로 대기열을 자동 초기화합니다.');
            (0,core_queue/* clearQueue */.lg)();
        }
    }
    // ------------------------------------------------

    logger.logger.init();
    logger.logger.show();
    logger.logger.info(`다운로드 시작 (정책: ${policy}, 강제 덮어쓰기: ${forceOverwrite})...`);

    // Auto-start Anti-Sleep mode
    try {
        core_startSilentAudio();
        logger.logger.success('[Anti-Sleep] 백그라운드 모드 자동 활성화');
    } catch (e) {
        logger.logger.log('[Anti-Sleep] 자동 시작 실패 (사용자 상호작용 필요)', 'error');
    }

    const failedEpisodes = [];  // [v1.8.1] 완전 실패 리스트
    const partialFailures = []; // [v1.8.1] 부분 실패 리스트 (이미지 일부 누락)
    const siteInfo = await detectSite();
    if (!siteInfo) {
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.NOTIFY_ERROR, { msg: "지원하지 않는 사이트이거나 다운로드 페이지가 아닙니다." });
        core_stopSilentAudio();
        return;
    }

    const parser = await ParserFactory.getParser();
    if (!parser) {
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.NOTIFY_ERROR, { msg: "파서를 초기화할 수 없습니다." });
        core_stopSilentAudio();
        return;
    }

    const { category, matchedRule } = siteInfo;
    const siteName = matchedRule?.name || "TokiSync Parser";
    logger.logger.info(`적용 중인 파서 규칙: [${siteName}] (${matchedRule?.id || 'unknown'})`);
    const isNovel = (category === 'Novel' || category === 'novel');

    try {
        // Prepare Strategy Variables
        let mainBuilder = null;
        let masterZip = null;
        let extension = 'zip';
        let destination = 'local'; // 기본 저장 대상
        let buildingPolicy = 'individual'; // 기본 빌딩 정책
        
        // [v1.6.0] 4대 정책 라우팅
        if (policy === 'individual') {
            buildingPolicy = 'individual';
            destination = 'local';
        } else if (policy === 'zipOfCbzs') {
            buildingPolicy = 'zipOfCbzs';
            destination = 'local';
        } else if (policy === 'native') {
            buildingPolicy = 'individual'; // 빌딩은 개별 CBZ 단위로 동일
            destination = 'native';        // 저장 대상만 GM_download로 변경
        } else if (policy === 'drive' || policy === 'drive_kavita') {
            buildingPolicy = 'individual'; // 빌딩은 개별 CBZ 단위
            destination = policy;          // 저장 대상은 Google Drive (kavita 여부 유지)
        // 하위 호환: 구버전 정책 명칭 지원
        } else if (policy === 'gasUpload') {
            buildingPolicy = 'individual';
            destination = 'drive';
            logger.logger.log('⚠️ gasUpload 정책은 drive로 대체되었습니다.', 'warn');
        } else if (policy === 'folderInCbz') {
            buildingPolicy = 'zipOfCbzs';
            destination = 'local';
            logger.logger.log('⚠️ folderInCbz 정책이 폐기되어 zipOfCbzs(배치)로 전환되었습니다.', 'warn');
        }

        // [v1.8.2] Graceful Fallback for missing Drive configuration
        if ((destination === 'drive' || destination === 'drive_kavita') && !(0,core_config/* isConfigValid */.Jb)()) {
            EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.NOTIFY_ERROR, { msg: '구글 드라이브 설정(Folder ID 등)이 누락되었습니다. 임시로 개별 로컬 다운로드 정책으로 전환합니다.' });
            logger.logger.warn('⚠️ 구글 드라이브 설정 누락 감지. 정책을 개별 로컬 다운로드로 자동 전환합니다.', 'System');
            buildingPolicy = 'individual';
            destination = 'local';
        }

        const configNovelFormat = (0,core_config/* getConfig */.zj)().novelFormat || 'epub';
        const EXTENSION_MAP = {
            'Novel': configNovelFormat,
            'novel': configNovelFormat,
            'Webtoon': 'cbz',
            'webtoon': 'cbz',
            'Manga': 'cbz',
            'manga': 'cbz'
        };

        if (buildingPolicy === 'zipOfCbzs') {
            masterZip = new JSZip(); // Master Container for current batch
            extension = EXTENSION_MAP[category] ?? 'cbz';
        } else {
            // Individual / native / drive
            extension = EXTENSION_MAP[category] ?? 'cbz';
        }

        // Get List
        let list = await parser.getListItems();

        // [v1.9.1] 정렬 로직 통합: 범위 필터 여부와 상관없이 항상 오름차순(1화~N화)으로 정렬
        const rangeSet = parseRangeSpec(rangeSpec);
        const mappedList = list.map(li => {
            const item = parser.parseListItem(li.element || li);
            return { li, num: parseInt(item.num) || 0 }; // 숫자가 아니면 0으로 처리하여 상단 배치
        });

        if (rangeSet) {
            list = mappedList.filter(item => rangeSet.has(item.num))
                             .sort((a, b) => a.num - b.num)
                             .map(item => item.li);
            logger.logger.log(`범위 필터 적용 및 오름차순 정렬 완료: ${rangeSpec} → ${list.length}개 항목`);
        } else {
            list = mappedList.sort((a, b) => a.num - b.num)
                             .map(item => item.li);
            logger.logger.log(`전체 항목 오름차순 정렬 완료: ${list.length}개 항목`);
        }
        
        // Log episode range
        if (list.length > 0) {
            const first = parser.parseListItem(list[list.length - 1]); // usually reversed order
            const last = parser.parseListItem(list[0]);
            logger.logger.info(`총 ${list.length}개 항목 처리 예정. (${first.title} ~ ${last.title})`, 'Downloader');
        } else {
            logger.logger.log(`총 0개 항목 처리 예정.`, 'Downloader');
        }

        if (list.length === 0) {
            logger.logger.warn('에피소드 목록이 0개입니다. 사이트 구조가 달라졌거나 올바른 목록 페이지인지 확인하세요.', 'Downloader');
            alert("다운로드할 항목이 없습니다.");
            return;
        }

        // Folder Name (Title) & Common Title Extraction
        const first = parser.parseListItem(list[0]);
        const last = parser.parseListItem(list[list.length - 1]);
        
        // [v1.9.4] Extract Series ID via Parser rules with robust fallback
        const seriesId = parser.getSeriesId();

        // Determine Root Folder Name & Series Title
        const rootFolder = parser.getFormattedTitle(seriesId, first.title, last.title, utils/* getCommonPrefix */.iL);
        const seriesTitle = rootFolder.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '');
        const listPrefixTitle = (list.length > 1) ? (0,utils/* getCommonPrefix */.iL)(first.title, last.title) : "";

        // [v1.24.0] 수집 시점의 각 챕터별 원본 상세 제목 매핑 객체 구축
        const episodeTitles = {};
        list.forEach(item => {
            try {
                const ep = parser.parseListItem(item);
                if (ep && ep.num) {
                    const numKey = parseInt(ep.num).toString();
                    episodeTitles[numKey] = ep.title || "";
                }
            } catch (e) {
                logger.logger.warn(`[Downloader] Episode title parse failed: ${e.message}`, 'Downloader');
            }
        });

        // [v1.7.0] Collect detailed metadata for Phase 3 Persistence
        const seriesMetadata = {
            ...parser.getSeriesMetadata(),
            id: seriesId,
            sourceId: seriesId,
            vendorId: parser.rule?.id || parser.getSeriesMetadata().vendorId || (matchedRule?.name || "").toLowerCase().replace(/[^a-z0-9]/g, ''),
            title: seriesTitle || rootFolder,
            originalSeriesTitle: parser.getSeriesTitle() || "",
            episodeTitles: episodeTitles, // [추가] 클라이언트 획득 에피소드 제목 목록
            thumbnail: parser.getThumbnailUrl() || "",
            vendor: parser.getSeriesMetadata().vendor || (matchedRule?.name || "").toLowerCase().replace(/[^a-z0-9]/g, '')
        };

        // [Fix] Append Range [Start-End] for Local Merged Files (folderInCbz / zipOfCbzs)
        // GAS Upload uses individual files so no range needed in folder name
        // [v1.6.0 Update] Batch range is handled during saving, not in rootFolder variable

        // [v1.4.0] Upload Series Thumbnail (if uploading to Drive)
        let historyFolderId = null;
        if (destination === 'drive' || destination === 'drive_kavita') {
            try {
                const thumbnailUrl = parser.getThumbnailUrl();
                if (thumbnailUrl) {
                    logger.logger.log('📷 시리즈 썸네일 업로드 중...');
                    const thumbBlob = await (0,utils/* fetchBlobWithXHR */.Kt)(thumbnailUrl, document.URL);
                    
                    // Upload as 'cover.jpg' - network.js will auto-redirect to _Thumbnails/{ID}.jpg
                    // saveFile(data, filename, type, extension, metadata)
                    // → fullFileName = "cover.jpg"
                    const cleanSeries = seriesTitle.replace(/^\[[^\]]+\]\s*/, '');
                    const targetFolder = destination === 'drive_kavita' ? cleanSeries : rootFolder;
                    await (0,utils/* saveFile */.OJ)(thumbBlob, 'cover', 'drive', 'jpg', { 
                        category,
                        folderName: targetFolder,
                        destination: destination,
                        folderId: historyFolderId || undefined
                    });
                    logger.logger.success('✅ 썸네일 업로드 완료');
                } else {
                    logger.logger.log('⚠️  썸네일을 찾을 수 없습니다 (건너뜀)', 'warn');
                }
            } catch (thumbError) {
                logger.logger.warn(`썸네일 업로드 실패 (계속 진행): ${thumbError.message}`, 'Downloader');
            }
        }

        // [v1.5.0 Smart Skip] Pre-load history for Drive uploads to skip already-uploaded episodes
        let uploadedHistorySet = new Set();
        // [v1.6.0 Fast Path] Pre-load episode cache
        let episodeCacheMap = new Map(); // key: "0001 - Title", value: "fileId"

        let historyCheckTimeoutFlag = false;

        if (destination === 'drive' || destination === 'drive_kavita') {
            try {
                if (forceOverwrite) {
                    logger.logger.log('⚠️ 강제 재다운로드 옵션 활성화: 기존 업로드 기록 무시 (전체 덮어쓰기)');
                } else {
                    logger.logger.log('☁️ 드라이브 업로드 기록 및 용량 확인 중 (Smart Skip)...');
                    const cleanFolder = rootFolder.replace(/^\[[^\]]+\]\s*/, '');
                    const targetFolder = destination === 'drive_kavita' ? cleanFolder : rootFolder;
                    const histResult = await (0,network/* fetchHistoryDirect */.GA)(targetFolder, category);
                    
                    if (histResult.success) {
                        historyFolderId = histResult.folderId;
                        // Normalize: accept padded ("0001") and plain ("1") forms
                        histResult.data.forEach(id => {
                            const plain = parseInt(id).toString();
                            uploadedHistorySet.add(id.toString());   // e.g. "0001"
                            uploadedHistorySet.add(plain);           // e.g. "1"
                        });
                        if (uploadedHistorySet.size > 0) {
                            logger.logger.log(`⏭️ 조건 만족(기존 정상 업로드) 에피소드 ${histResult.data.length}개 감지 — 건너뜁니다.`);
                        }
                    } else {
                        historyCheckTimeoutFlag = true;
                        historyFolderId = histResult.folderId;
                        logger.logger.log(`⚠️ 업로드 기록 조회 지연/타임아웃 감지. 개별 스킵(페일세이프) 모드로 전환합니다.`, 'warn');
                    }
                }
            } catch (histErr) {
                // Non-fatal: if history check fails unexpectedly
                logger.logger.log(`⚠️ 업로드 기록 조회 실패: ${histErr.message}`, 'warn');
            }

            // [v1.6.0] Phase B-2: Load Master Index -> Cache File ID -> Episode List
            try {
                logger.logger.log('⚡ 고속 업로드(Fast Path) 캐시 조회 중...');
                const config = (0,core_config/* getConfig */.zj)();
                
                // 1. Fetch Complete Master Index
                const indexResponse = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "POST", url: config.gasUrl,
                        data: JSON.stringify({ type: "get_library", folderId: config.folderId, apiKey: config.apiKey, protocolVersion: 3 }),
                        headers: { "Content-Type": "text/plain" },
                        onload: (r) => {
                            try { resolve(JSON.parse(r.responseText)); } 
                            catch(e) { reject(e); }
                        },
                        onerror: reject
                    });
                });

                if (indexResponse.status === 'success') {
                    // 2. Find Current Series in Index by ID or Title
                    // [Fix] Handle both indexResponse.body (cached) and indexResponse.list (rebuild) structures
                    const seriesList = indexResponse.body || indexResponse.list || [];
                    
                    // Match by sourceId or title
                    const matchedSeries = seriesList.find(s => 
                        (s.sourceId && s.sourceId === seriesId) || 
                        (s.name && s.name.includes(seriesTitle))
                    );

                    let targetCacheFileId = matchedSeries ? matchedSeries.cacheFileId : null;
                    
                    if (targetCacheFileId) {
                        logger.logger.log(`[Fast Path] 마스터 카탈로그에서 신규 캐시 파일 발견: ${targetCacheFileId}`);
                    } else {
                        // [v1.6.1] 2nd Attempt: Fetch Merge Index Fragment directly (Fallback for newly uploaded series)
                        logger.logger.log(`[Fast Path] 마스터 카탈로그에 캐시 부재. _MergeIndex 대기열 파편을 탐색합니다...`);
                        const fragRes = await (0,gas/* getMergeIndexFragment */.Jb)(seriesId);
                        if (fragRes.found && fragRes.data && fragRes.data.cacheFileId) {
                            targetCacheFileId = fragRes.data.cacheFileId;
                            logger.logger.log(`[Fast Path] 큐에서 비동기 병합 파편 발견 성공! (ID: ${targetCacheFileId})`);
                        }
                    }

                    if (targetCacheFileId) {
                        // 3. Directly load episode cache using the cacheFileId
                        const cachedEpisodes = await (0,gas/* getBooksByCacheId */.B0)(targetCacheFileId);
                        
                        if (cachedEpisodes && cachedEpisodes.length > 0) {
                             cachedEpisodes.forEach(ep => {
                                 // Map "name" (e.g. "0001 - Title.cbz") to its Drive File ID
                                 // We strip the extension to match our `fullFilename` variable later
                                 const nameWithoutExt = ep.name.replace(/\.[^/.]+$/, "");
                                 episodeCacheMap.set(nameWithoutExt, ep.id);
                             });
                             logger.logger.success(`[Fast Path] 맵핑 테이블 완성: ${episodeCacheMap.size}개 에피소드 캐시 로드 성공!`);
                        }
                    } else {
                        logger.logger.log('[Fast Path] 신규 작품이거나 캐시 파편이 아직 없습니다 (일반 업로드 분기로 진행)');
                    }
                }
            } catch (cacheErr) {
                logger.logger.log(`⚠️ 고속 업로드 캐시 로드 실패 (일반 분기로 진행방향 전환): ${cacheErr.message}`, 'warn');
            }
        }

        // [v1.21.2] 공통 범용 큐 선등록 래퍼 (Universal Queue Pre-Registration)
        // 어떤 다운로드 정책이 들어와도 루프 시작 전 전체 수집 대상 에피소드 목록을 큐에 선등록
        const currentNovelMode = (0,core_config/* getConfig */.zj)().novelMode;
        const currentIsSingleVolume = isNovel && currentNovelMode === 'singleVolume';
        
        const pendingEpisodes = [];
        for (let i = 0; i < list.length; i++) {
            const item = parser.parseListItem(list[i].element || list[i]);
            const numStr = item.num ? item.num.toString() : '';
            const numPlain = parseInt(numStr).toString();
            
            // 구글 드라이브 스킵 필터 (드라이브 전용)
            const isSkip = await shouldSkipEpisode({
                numStr,
                destination,
                isSingleVolume: currentIsSingleVolume,
                uploadedHistorySet,
                historyCheckTimeoutFlag,
                historyFolderId
            });
            if (isSkip) continue;
            
            pendingEpisodes.push({
                title: item.title,
                url: item.src || item.url || (list[i].element || list[i]).href || location.href,
                episodeNum: numStr,
                category: category,
                viewerCfg: parser.rule.viewer || {},
                rootFolder: rootFolder,
                destination: destination,
                novelFormat: configNovelFormat,
                matchedRule: parser.rule,
                protocolDomain: parser.protocolDomain || window.location.origin,
                seriesMetadata: seriesMetadata
            });
        }

        if (pendingEpisodes.length === 0) {
            if ((destination === 'drive' || destination === 'drive_kavita') && !currentIsSingleVolume) {
                logger.logger.success('✅ 모든 에피소드가 이미 드라이브에 존재하여 수집을 조기 완료합니다.', 'Queue');
                core_stopSilentAudio();
                return;
            }
        } else {
            // [v1.21.4] 구글 드라이브 업로드 모드 시, 큐 등록 전 작품 폴더를 선제 생성/확정하여 큐 전파 (경쟁적 중복 폴더 생성 차단)
            let activeFolderId = historyFolderId;
            if ((destination === 'drive' || destination === 'drive_kavita') && !activeFolderId) {
                const cleanSeries = seriesTitle.replace(/^\[[^\]]+\]\s*/, '');
                const targetFolder = destination === 'drive_kavita' ? cleanSeries : rootFolder;
                logger.logger.log(`📁 [Drive] 신규 작품 폴더 선제 생성 중: ${targetFolder}`);
                try {
                    const token = await (0,network/* getOAuthToken */.Py)();
                    let parentFolderId = (0,core_config/* getConfig */.zj)().folderId;
                    if (destination === 'drive' || destination === 'drive_kavita') {
                        const categoryFolder = category || 'Webtoon';
                        parentFolderId = await (0,network/* getOrCreateFolder */.aj)(categoryFolder, (0,core_config/* getConfig */.zj)().folderId, token);
                    }
                    activeFolderId = await (0,network/* getOrCreateFolder */.aj)(targetFolder, parentFolderId, token);
                    logger.logger.success(`📁 [Drive] 신규 작품 폴더 선제 생성 완료 -> ID: ${activeFolderId}`);
                } catch (folderErr) {
                    logger.logger.error(`❌ [Drive] 폴더 선제 생성 중 에러 발생: ${folderErr.message}`);
                }
            }

            // 모든 pendingEpisodes에 확정된 폴더 ID 주입
            const mappedEpisodes = pendingEpisodes.map(ep => ({
                ...ep,
                folderId: activeFolderId || ''
            }));

            const injected = (0,core_queue/* addEpisodesToQueue */.id)(mappedEpisodes, seriesTitle);
            logger.logger.log(`🗂️ [공통 큐] 수집 대상 ${injected}개 에피소드를 대기열에 선등록 완료.`, 'Queue');
        }

        // [v1.26.4] 소설 합본 모드를 제외한 모든 다운로드 정책을 신뢰성 높은 배치 큐 파이프라인으로 대통합
        if (!currentIsSingleVolume) {
            logger.logger.log(`🚦 [멀티큐] 차세대 자율형 멀티큐 배치 수집기(v1.21.0) 가동 준비...`, 'Queue');

            // 팝업 차단 회피용 동기적 자식 창 사전 오픈 (Pre-open)
            const MAX_CONCURRENCY = 1;
            const openCount = Math.min(MAX_CONCURRENCY, pendingEpisodes.length);
            logger.logger.log(`🛡️ 팝업 차단 필터 우회를 위한 자식 창 ${openCount}개 선제 확보(Pre-open) 중...`, 'Queue');

            const width = 400;
            const height = 600;
            const leftBase = window.screen.width - width - 50;
            const topBase = 100;

            const freshlyOpened = [];
            for (let i = 0; i < openCount; i++) {
                const ep = pendingEpisodes[i];
                const id = (0,core_queue/* getQueueItemId */.G8)(seriesTitle, ep.episodeNum);
                const left = leftBase - (i * 50);
                const top = topBase + (i * 50);
                const workerName = `tokisync_novel_worker_${id}`.replace(/[^a-zA-Z0-9_]/g, '');

                logger.logger.log(`🚀 [Pre-open #${i + 1}] 자식 팝업 창 생성: ${ep.title}`);
                const popupRef = window.open(
                    ep.url,
                    workerName,
                    `width=${width},height=${height},left=${left},top=${top},noopener=false,scrollbars=yes,resizable=yes`
                );

                if (popupRef) {
                    core_queue/* activeWorkers */.mR.set(id, popupRef);
                    (0,core_queue/* updateQueueItem */.Gg)(id, { status: 'processing', stage: core_queue/* WORKER_STAGE */.WB.INIT });
                    freshlyOpened.push(id);
                } else {
                    logger.logger.error(`❌ [Pre-open #${i + 1}] 브라우저 차단으로 자식 창 확보에 실패하였습니다.`, 'Queue');
                }
            }

            if (freshlyOpened.length > 0) {
                logger.logger.success(`🚦 멀티큐 스케줄러 기동 완료. 릴레이 루프 활성화.`, 'Queue');
                (0,worker_controller/* initBatchWorkerController */.hh)();
                (0,core_queue/* initQueueScheduler */.$8)();
                isAsyncDelegate = true;
            } else {
                logger.logger.error(`❌ 선제 확보된 자식 창이 없어 큐 수집을 중지합니다.`, 'Queue');
                core_stopSilentAudio();
            }

            return; // 큐 엔진에 스케줄 위임 후 early exit
        }

        // Create IFrame
        // 목록 페이지 최하단에 배치 + opacity 0.1
        // IntersectionObserver가 정상 동작하며, 브라우저가 일반 문서 흐름으로 렌더링
        const iframe = document.createElement('iframe');
        iframe.classList.add('toki-visible-block', 'toki-downloader-iframe');
        document.body.appendChild(iframe);

        // [v1.7.1] Novel Single Volume Mode Init
        const configParams = (0,core_config/* getConfig */.zj)();
        const novelMode = configParams.novelMode;
        const novelFormat = configParams.novelFormat || 'epub';
        const isSingleVolume = isNovel && novelMode === 'singleVolume';
        let masterNovelBuilder = null;
        if (isSingleVolume) {
            masterNovelBuilder = novelFormat === 'txt' ? new txt/* TxtBuilder */.I() : new epub/* EpubBuilder */.s();
            logger.logger.log(`📙 소설 단행본 합본 모드 활성화 (${novelFormat.toUpperCase()}) (마지막에 한 번에 저장됩니다)`);
        }

        // --- Processing Loop ---
        for (let i = 0; i < list.length; i++) {
            const item = parser.parseListItem(list[i].element || list[i]); 
            console.clear();
            logger.logger.info(`[${i + 1}/${list.length}] 처리 중: ${item.title}`);

            // [v1.5.0 Smart Skip] Skip already-uploaded episodes (Drive policy only)
            // [v1.7.1] Bypass skipping in Single Volume mode (we need all chapters)
            const numStr = item.num ? item.num.toString() : '';
            const isSkip = await shouldSkipEpisode({
                numStr,
                destination,
                isSingleVolume,
                uploadedHistorySet,
                historyCheckTimeoutFlag,
                historyFolderId,
                logOnSkip: true,
                episodeTitle: item.title
            });
            if (isSkip) continue;

            // Decision based on Policy
            let currentBuilder = null;

            // [v1.6.0] Strategy: Always use a FRESH builder per item for Kavita compatibility
            // [v1.7.1] Except for Novel Single Volume Mode
            if (isSingleVolume) {
                currentBuilder = masterNovelBuilder;
            } else {
                if (isNovel) currentBuilder = novelFormat === 'txt' ? new txt/* TxtBuilder */.I() : new epub/* EpubBuilder */.s();
                else currentBuilder = new cbz/* CbzBuilder */.$();
            }

            // Process Item
            let selfContained = false;
            try {
                selfContained = await processItem(item, currentBuilder, siteInfo, iframe, parser, seriesTitle, null, rootFolder, destination);
                
                // [v1.8.1] 부분 실패 체크 (이미지 누락 여부) - 자립형 워커가 아닌 로컬 빌더 구동 시에만 처리
                if (!selfContained && currentBuilder && currentBuilder.chapters) {
                    const latestChapter = currentBuilder.chapters[currentBuilder.chapters.length - 1];
                    if (latestChapter && Array.isArray(latestChapter.images)) {
                        const missingCount = latestChapter.images.filter(img => img.isMissing).length;
                        if (missingCount > 0) {
                            console.warn(`[Downloader] 부분 실패 감지: ${item.title} (이미지 ${missingCount}개 누락)`);
                            partialFailures.push({
                                num: item.num,
                                title: item.title,
                                missingCount: missingCount
                            });
                        }
                    }
                }

                if (!selfContained && isSingleVolume) {
                    const currentSize = currentBuilder.chapters ? currentBuilder.chapters.length : (currentBuilder.content ? currentBuilder.content.split('===').length - 1 : 0);
                    logger.logger.log(`📥 챕터 추가 완료: ${item.title} (현재 ${currentSize}개)`, 'Downloader');
                }
            } catch (err) {
                console.error(err);
                const errorMsg = err.message || "알 수 없는 오류";
                logger.logger.error(`항목 처리 실패 (${item.title}): ${errorMsg}`, 'Downloader');
                
                // [v1.8.1] 실패 내역 저장
                failedEpisodes.push({
                    num: item.num,
                    title: item.title,
                    error: errorMsg
                });
                continue; // Skip faulty item but continue loop
            }

            // 만약 자식 워커가 업로드/저장까지 자체 종결했다면, 부모 창의 개별 파일 빌딩/저장 흐름을 완전히 건너뛴다.
            if (selfContained) {
                continue;
            }

            // Post-Process for Non-Default Policies
            if (buildingPolicy !== 'folderInCbz' && !isSingleVolume) {
                // Build the individual chapter file
             
                // Clean Filename Logic
                // [v1.4.0 Update] Standardized format: "0001 - SeriesTitle 1화" (Keep Full Title)
                // Reason: Better identification when moving files out of folder
                
                let chapterTitle = item.title;
                
                // [v1.4.0] Title Normalization
                // If list title text differs from official metadata title, replace it.
                // Ex: List="Hot Manga 19", Meta="Cool Manga" -> "Cool Manga 19"
                // Condition: We have both titles, they differ, and item starts with list prefix
                if (seriesTitle && listPrefixTitle && seriesTitle !== listPrefixTitle && listPrefixTitle.length > 2) {
                     if (chapterTitle.startsWith(listPrefixTitle)) {
                         chapterTitle = chapterTitle.replace(listPrefixTitle, seriesTitle).trim();
                     }
                }
                
                // Only clean (remove series title) if uploading to Drive
                // [Deprecated] User requested to keep series title
                /*
                if (destination === 'drive' && seriesTitle && chapterTitle.startsWith(seriesTitle)) {
                    chapterTitle = chapterTitle.replace(seriesTitle, '').trim();
                }
                */

                // Final Filename: Dynamic based on Template or Drive fallback
                let fullFilename;
                if (destination !== 'drive') {
                    const template = config.localNameTemplate || "{number:4} - {title}";
                    const cleanSeries = (seriesTitle || rootFolder || '').replace(/^\[[^\]]+\]\s*/, '');
                    
                    // 1. Dynamic padding {number:X} support
                    fullFilename = template.replace(/\{number:(\d)\}/g, (match, p1) => {
                        const padSize = parseInt(p1, 10);
                        return padSize > 0 
                            ? (item.num || '').toString().padStart(padSize, '0') 
                            : (item.num || '').toString();
                    });

                    // 2. Legacy {number} & {rawNumber} fallback
                    const legacyPaddedNum = (item.num || '').toString().padStart(4, '0');
                    fullFilename = fullFilename
                        .replace(/\{number\}/g, legacyPaddedNum)
                        .replace(/\{rawNumber\}/g, (item.num || '').toString())
                        .replace(/\{series\}/g, cleanSeries)
                        .replace(/\{title\}/g, chapterTitle || '');
                } else {
                    // drive (레거시): 기존 명명법인 `[ID] 작품명 0001화` 강제 적용
                    const paddedNum = (item.num || '').toString().padStart(4, '0');
                    fullFilename = `${rootFolder} ${paddedNum}화`;
                }

                // [v1.6.0] Kavita Metadata Insertion
                const innerZip = await currentBuilder.build({ 
                    series: seriesTitle || rootFolder,
                    title: chapterTitle,
                    number: item.num,
                    writer: siteName
                });
                const blob = await innerZip.generateAsync({ type: "blob" });

                if (buildingPolicy === 'zipOfCbzs') {
                    console.log(`[MasterZip] 추가 중: ${fullFilename}.${extension}`);
                    masterZip.file(`${fullFilename}.${extension}`, blob);
                    
                    // [v1.8.2] Batching Logic
                    // Novel: Infinite batch. Webtoon: 10 per batch to prevent OOM (하향 조정)
                    const processedCount = i + 1;
                    const isLastItem = (i === list.length - 1);
                    const BATCH_SIZE = isNovel ? Infinity : 10;

                    if ((BATCH_SIZE !== Infinity && processedCount % BATCH_SIZE === 0) || isLastItem) {
                        const batchNum = Math.ceil(processedCount / BATCH_SIZE);
                        const batchFilename = `${rootFolder}_Part${batchNum}`;
                        
                        logger.logger.info(`📦 배치 저장 중... (${batchFilename})`);
                        await (0,utils/* saveFile */.OJ)(masterZip, batchFilename, 'local', 'zip', { category });
                        
                        // Clear masterZip for next batch to save memory and GC
                        masterZip = null;
                        masterZip = new JSZip();
                    }
                } else if (buildingPolicy === 'individual') {
                    // [v1.6.0] Phase B-3: Fast Path Smart Branching
                    let success = false;
                    const cachedFileId = episodeCacheMap.get(fullFilename);

                    if ((destination === 'drive' || destination === 'drive_kavita') && cachedFileId) {
                        try {
                            logger.logger.log(`⚡ [Fast Path] 캐시 히트! 무탐색 덮어쓰기 (PUT) 진행 -> ID: ${cachedFileId}`);
                            
                            // 1. Init Update Session
                            // Notice: We do NOT use direct upload here because direct upload deletes existing files.
                            // We MUST use GAS Relay to trigger the specific PATCH/PUT resumable session.
                            const updateUrl = await (0,gas/* initUpdateUploadViaGASRelay */.fA)(cachedFileId, `${fullFilename}.${extension}`);
                            
                            // 2. Transmit chunks (re-use standard GM_xmlHttpRequest logic from gas.js)
                            // We can build a quick uploader here or expose a method. Since gas.js encapsulates it tightly,
                            // we inline the chunk upload for the Fast Path for maximum control:
                            const CHUNK_SIZE = 20 * 1024 * 1024;
                            const totalSize = blob.size;
                            let start = 0;
                            const buffer = await blob.arrayBuffer();
                            
                            while (start < totalSize) {
                                const end = Math.min(start + CHUNK_SIZE, totalSize);
                                const chunkBuffer = buffer.slice(start, end);
                                const chunkBase64 = (0,utils/* arrayBufferToBase64 */.Yi)(chunkBuffer);

                                await new Promise((res, rej) => {
                                    GM_xmlhttpRequest({
                                        method: "POST", url: (0,core_config/* getConfig */.zj)().gasUrl,
                                            data: JSON.stringify({ 
                                                type: "upload", uploadUrl: updateUrl, chunkData: chunkBase64, 
                                                folderId: (0,core_config/* getConfig */.zj)().folderId,
                                                protocolVersion: 3,
                                                start: start, end: end, total: totalSize, apiKey: (0,core_config/* getConfig */.zj)().apiKey
                                            }),
                                        headers: { "Content-Type": "text/plain" },
                                        timeout: 300000,
                                        onload: (resp) => {
                                            try { 
                                                const json = JSON.parse(resp.responseText); 
                                                if (json.status === 'success') res(); else rej(new Error("Fail")); 
                                            } catch (e) { rej(e); }
                                        },
                                        onerror: rej
                                    });
                                });
                                start = end;
                            }
                            
                            logger.logger.success(`⚡ [Fast Path] ${fullFilename} 업데이트(PUT) 완료!`, 'FastPath');
                            success = true;
                        } catch (fastPathErr) {
                            const errMsg = fastPathErr.message || "";
                            logger.logger.log(`⚠️ Fast Path 업로드 중 에러 발생 (${errMsg}), Fallback 시작...`, 'warn', 'FastPath');
                            
                            // [v1.7.3] 자가 회복 로직: 휴지통 또는 파일 부재 시 캐시 삭제
                            const lowerMsg = errMsg.toLowerCase();
                            if (lowerMsg.includes('trash') || lowerMsg.includes('not found')) {
                                logger.logger.warn(`🗑️ [Fast Path] 휴지통/부재 감지 → 캐시에서 해당 항목 삭제 및 일반 업로드 전환: ${fullFilename}`);
                                episodeCacheMap.delete(fullFilename);
                            }
                            
                            success = false; // Fallback
                        }
                    }

                    if (!success) {
                        // Fallback (or local save)
                        logger.logger.log(`[Upload] 일반 업로드(Create/POST) 진행...`);
                        await (0,utils/* saveFile */.OJ)(blob, fullFilename, destination, extension, {
                            folderName: rootFolder,
                            category: category
                        });
                    }
                }
            }
            
            // [v1.4.0] Add completion badge to list item (real-time feedback)
            if (item.element && !item.element.querySelector('.toki-badge')) {
                const badge = document.createElement('span');
                badge.className = 'toki-badge';
                badge.innerText = '✅';
                // Styles moved to .toki-badge in ui.css
                
                // Target: .wr-subject > a (link element)
                const linkEl = item.element.querySelector('.wr-subject > a');
                if (linkEl) {
                    linkEl.prepend(badge);
                } else {
                    // Fallback
                    const titleEl = item.element.querySelector('.wr-subject, .item-subject, .title');
                    if (titleEl) {
                        titleEl.prepend(badge);
                    } else {
                        item.element.appendChild(badge);
                    }
                }
                
                // Visual feedback (v1.9.5 consistent styling)
                item.element.classList.add('toki-downloaded');
            }
            
            // GC 가드: 사용 완료된 개별 챕터 빌더의 메모리 즉시 해제
            currentBuilder = null;
        }


        // [v1.7.1] Finalize Single Volume EPUB/TXT
        if (isSingleVolume && masterNovelBuilder) {
            const hasContent = masterNovelBuilder.chapters ? masterNovelBuilder.chapters.length > 0 : masterNovelBuilder.content.length > 0;
            if (hasContent) {
                try {
                    // [v1.7.1 Update] Use Chapter Range for Filename instead of "(합본)"
                    // [v1.7.1 Update] Use Chapter Range for Filename instead of "(합본)" - Safe Parsing
                    const startRaw = last.num;
                    const endRaw = first.num;
                    const startNum = parseInt(startRaw);
                    const endNum = parseInt(endRaw);

                    let rangeLabel = "";
                    if (isNaN(startNum) || isNaN(endNum)) {
                        // Fallback to original labels if either is not numeric (e.g., "공지")
                        rangeLabel = (startRaw === endRaw) ? `${startRaw}` : `${startRaw}-${endRaw}`;
                    } else {
                        rangeLabel = (startNum === endNum) ? `${startNum}화` : `${Math.min(startNum, endNum)}-${Math.max(startNum, endNum)}화`;
                    }
                    const finalFilename = `${seriesTitle || rootFolder} (${rangeLabel})`;
                    
                    logger.logger.info(`📚 단행본 조립 및 저장 중... (${finalFilename})`);
                    
                    const finalZip = await masterNovelBuilder.build({
                        series: seriesTitle || rootFolder,
                        title: seriesTitle || rootFolder,
                        writer: siteName
                    });
                    const finalBlob = await finalZip.generateAsync({ type: "blob" });
                    
                    await (0,utils/* saveFile */.OJ)(finalBlob, finalFilename, destination, extension, {
                        folderName: rootFolder,
                        category: category
                    });
                    
                    logger.logger.success(`✅ 단행본 합본 저장 완료: ${finalFilename}`);
                } catch (epubErr) {
                    logger.logger.error(`단행본 빌드 실패: ${epubErr.message}`);
                }
            } else {
                logger.logger.warn('⚠️ 유효한 챕터가 없어 단행본 빌드를 취소합니다.', 'Downloader');
            }
        }

        // Cleanup
        iframe.remove();

        // [v1.5.5] 배치 완료 후 Drive 캐시 단일 갱신 (에피소드마다 호출하지 않음)
        if (destination === 'drive' || destination === 'drive_kavita') {
            const cleanFolder = rootFolder.replace(/^\[[^\]]+\]\s*/, '');
            const targetFolder = destination === 'drive_kavita' ? cleanFolder : rootFolder;
            (0,gas/* refreshCacheAfterUpload */.jz)(targetFolder, category, seriesMetadata).catch(e =>
                logger.logger.warn(`캐시 갱신 호출 중 실패 (무시): ${e.message}`, 'GAS:Cache')
            );
        }

        logger.logger.success(`✅ 모든 작업 완료!`);
        ui/* Notifier */.ze.notify('TokiSync', `다운로드 완료! (${list.length - failedEpisodes.length}개 성공, ${failedEpisodes.length}개 실패)`);

        // [v1.8.1] 고도화된 실패 리포트 생성 및 저장 (MCP 검토 반영)
        await generateDownloadReport(seriesTitle || rootFolder, seriesId, list.length, failedEpisodes, partialFailures);

    } catch (error) {
        console.error(error);
        logger.logger.error(`전체 다운로드 루틴 오류 발생: ${error.message}`, 'System');
        alert(`다운로드 중 오류 발생:\n${error.message}`);
    } finally {
        if (!isAsyncDelegate) {
            // Auto-stop Anti-Sleep mode
            core_stopSilentAudio();
            logger.logger.log('[Anti-Sleep] 백그라운드 모드 자동 종료');
        } else {
            console.log('[Anti-Sleep] 비동기 멀티큐 배치 위임으로 안티 슬립 상태를 지속 유지합니다.');
        }
        
        // [Cleanup 팝업 세션] 다운로드 종료 후 액티브 팝업 폐쇄
        try {
            (0,worker_controller/* closeActiveWorker */.hr)();
        } catch (popupErr) {
            console.warn('[Downloader] 팝업 클린업 실패:', popupErr);
        }

        // Cleanup
        const iframe = document.querySelector('iframe');
        if (iframe) iframe.remove();
    }
}



/**
 * [v1.8.1] 다운로드 실패 리포트 생성 및 다운로드 (MCP 검토 의견 반영)
 * @private
 */
async function generateDownloadReport(seriesTitle, seriesId, listCount, failedEpisodes, partialFailures) {
    if (failedEpisodes.length === 0 && partialFailures.length === 0) return;

    logger.logger.warn(`⚠️ 다운로드 중 일부 오류가 발견되었습니다. 리포트를 생성합니다.`, 'System');

    const timestamp = new Date().toLocaleString();
    const lines = [
        `[TokiSync 다운로드 리포트]`,
        `작품명: ${seriesTitle}`,
        `일시: ${timestamp}`,
        `--------------------------------------------------`,
        `■ 요약 (Summary)`,
        `- 총 시도: ${listCount}개`,
        `- 성공: ${listCount - failedEpisodes.length}개`,
        `- 완전 실패: ${failedEpisodes.length}개 (파일이 생성되지 않음)`,
        `- 부분 실패: ${partialFailures.length}개 (파일은 생성되었으나 일부 데이터 누락)`,
        `--------------------------------------------------`,
    ];

    if (failedEpisodes.length > 0) {
        lines.push(``, `■ 완전 실패 목록 (Critical Failures)`, `(원인 분석 후 해당 회차만 재시도해 보세요)`);
        failedEpisodes.forEach(fail => {
            lines.push(`- [${fail.num}] ${fail.title} : ${fail.error}`);
        });
    }

    if (partialFailures.length > 0) {
        lines.push(``, `■ 부분 실패 목록 (Warnings/Partial Success)`, `(다운로드는 완료되었으나 일부 페이지가 누락된 항목입니다)`);
        partialFailures.forEach(fail => {
            lines.push(`- [${fail.num}] ${fail.title} : 이미지 ${fail.missingCount}개 누락`);
        });
    }

    lines.push(``, `--------------------------------------------------`, `위 리포트를 참고하여 누락된 회차를 확인하시기 바랍니다.`);

    const reportContent = lines.join('\n');
    const reportBlob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const cleanSeriesTitle = (seriesTitle || "Unknown").replace(/[<>:"/\\|?*]/g, '').trim();
    const reportFilename = `${cleanSeriesTitle}_다운로드_실패_리포트`;

    try {
        await (0,utils/* saveFile */.OJ)(reportBlob, reportFilename, 'local', 'txt');
        logger.logger.success(`✅ 실패 리포트 다운로드 완료: ${reportFilename}.txt`);
    } catch (e) {
        console.error('[Downloader] 리포트 저장 실패:', e);
    }
}

// EXTERNAL MODULE: ./src/core/parsers/SubscriptionManager.js
var SubscriptionManager = __webpack_require__(330);
;// ./src/core/main.js

 















async function main() {
    console.log("🚀 TokiDownloader Loaded (New Core v1.26.4)");

    // -- 0. Bootstrap UI Instances --
    const _logbox = ui/* LogBox */.ej.getInstance();

    // ── Console Log Interceptor ──
    const _origConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };
    let _forwarding = false;
    let _consoleActive = true;

    const CONSOLE_WHITELIST = [
        '[TokiSync', '[WorkerController', '[DirectUpload', '[DirectHistory',
        '[GAS]', '[Upload]', '[Local]', '[Native]',
        '[Builder]', '[Cache]', '[Captcha]', '[ScrollEngine',
        '[Bridge]', '[Debug ', '[Notification]'
    ];

    function _fmtArg(a) {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch (_) { return String(a); }
        }
        return String(a);
    }

    function _makeHandler(level) {
        return function (...args) {
            _origConsole[level].apply(console, args);
            if (_forwarding || !_consoleActive) return;
            const msg = args.map(_fmtArg).join(' ');
            if (!CONSOLE_WHITELIST.some(p => msg.startsWith(p))) return;
            if (/^\[(info|warn|error|success|critical|debug)\]/.test(msg)) return;
            _forwarding = true;
            try {
                EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.LOG, {
                    msg,
                    level: level === 'log' ? 'info' : level,
                    tag: 'Console'
                });
            } finally {
                _forwarding = false;
            }
        };
    }

    console.log = _makeHandler('log');
    console.warn = _makeHandler('warn');
    console.error = _makeHandler('error');

    _logbox._consoleInterceptor = {
        setActive: (a) => { _consoleActive = a; },
        getActive: () => _consoleActive
    };

    // -- Helper Functions for Menu Actions --

    // -- Helper Functions for Menu Actions --

    const openViewer = () => {
         const config = (0,core_config/* getConfig */.zj)();
         const viewerUrl = "https://pray4skylark.github.io/tokiSync/";
         const win = window.open(viewerUrl, "_blank");
         
         if(win) {
             let attempts = 0;
             const interval = setInterval(() => {
                 attempts++;
                 win.postMessage({ type: 'TOKI_CONFIG', config: config }, '*');
                 if(attempts > 10) clearInterval(interval);
             }, 500);
         } else {
             alert("팝업 차단을 해제해주세요.");
         }
    };

    const runThumbnailMigration = async () => {
        if(!confirm("이 작업은 기존 다운로드된 작품들의 썸네일을 새로운 최적화 폴더(_Thumbnails)로 이동시킵니다.\n실행하시겠습니까? (서버 부하가 발생할 수 있습니다)")) return;
        
        const config = (0,core_config/* getConfig */.zj)();
        const win = window.open("", "MigrationLog", "width=600,height=800");
        win.document.write("<h3>🚀 v1.4.0 Migration Started...</h3><pre id='log'></pre>");
        
        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: config.gasUrl,
                data: JSON.stringify({
                    type: 'view_migrate_thumbnails',
                    folderId: config.folderId,
                    apiKey: config.apiKey,
                    protocolVersion: 3
                }),
                onload: (res) => {
                    try {
                        const result = JSON.parse(res.responseText);
                        if(result.status === 'success') {
                            const logs = result.body.join('\n');
                            win.document.getElementById('log').innerText = logs;
                            alert("✅ 마이그레이션이 완료되었습니다!");
                        } else {
                            win.document.getElementById('log').innerText = "Failed: " + result.body;
                            alert("❌ 오류 발생: " + result.body);
                        }
                    } catch (e) {
                        win.document.getElementById('log').innerText = res.responseText;
                        alert("❌ GAS 서버 오류");
                    }
                },
                onerror: (err) => {
                     win.document.getElementById('log').innerText = "Network Error";
                     alert("❌ 네트워크 오류");
                }
            });
        } catch(e) {
            alert("오류: " + e.message);
        }
    };

    const runKavitaMigration = async () => {
        if (!confirm('구글 드라이브 내 모든 작품의 파일명과 폴더 구조를 Kavita 표준 규격으로 최적화하시겠습니까?\n(이 작업은 전체 라이브러리를 스캔하므로 다소 시간이 소요될 수 있습니다.)')) return;
        
        try {
            logger.logger.show();
            logger.logger.log('Kavita 구조 최적화 작업 요청 중...');
            
            const config = (0,core_config/* getConfig */.zj)();
            
            if (!config.gasUrl) {
                alert('GAS URL이 설정되지 않았습니다.');
                return;
            }

            GM_xmlhttpRequest({
                method: "POST",
                url: config.gasUrl,
                data: JSON.stringify({
                    type: 'view_migrate_kavita',
                    folderId: config.folderId,
                    executeRename: true,
                    apiKey: config.apiKey,
                    protocolVersion: 3
                }),
                headers: {
                    "Content-Type": "application/json"
                },
                onload: (res) => {
                    try {
                        const result = JSON.parse(res.responseText);
                        if (result.status === 'success') {
                            const logs = Array.isArray(result.body) ? result.body.join('\n') : result.body;
                            logger.logger.success(`작업 완료!\n로그:\n${logs}`);
                            alert(`Kavita 구조 최적화 작업이 완료되었습니다.`);
                        } else {
                            logger.logger.error(`작업 실패: ${result.body}`);
                            alert(`실패: ${result.body}`);
                        }
                    } catch (parseErr) {
                        logger.logger.error(`응답 파싱 실패: ${parseErr.message}`);
                    }
                },
                onerror: (err) => {
                    logger.logger.error(`네트워크 오류: ${err.statusText}`);
                    alert('네트워크 오류 발생');
                }
            });
        } catch (e) {
            alert('오류 발생: ' + e.message);
            console.error(e);
        }
    };

    // -- 1. GM Menus (Must be registered early to prevent deadlocks) --
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('⚙️ 설정 (Settings)', () => logger.logger.openDashboard('settings'));
        GM_registerMenuCommand('🌐 Viewer 열기', openViewer);
    }

    // -- 2. Pre-detection & Core States --
    const siteInfo = await detectSite();
    if(!siteInfo) {
        console.warn('[TokiSync] 사이트 매칭 실패. 탬퍼몽키 메뉴를 통해 설정을 확인하세요.');
        return; 
    }

    // -- History Sync (Async) & Cross-Tab Auto Refresh --
    let lastSyncTime = Date.now();
    let isSyncing = false;

    const syncHistory = async () => {
        if (isSyncing) return;
        
        const config = (0,core_config/* getConfig */.zj)();
        if (config.policy !== 'drive') {
            return; // 드라이브 저장 정책이 아닐 경우 이력 동기화 무시 (로컬 스탠드얼론 최적화)
        }

        isSyncing = true;
        try {
            const parser = await ParserFactory.getParser();
            if (!parser) return;
            const list = await parser.getListItems();
            console.log(`[TokiSync] Found ${list.length} list items`);
            if (list.length === 0) {
                console.warn('[TokiSync] No list items found, skipping history sync');
                return;
            }

            const first = parser.parseListItem(list[0]);
            const last = parser.parseListItem(list[list.length - 1]);

            const seriesId = parser.getSeriesId();

            // Determine Root Folder Name (Unified with Downloader)
            const rootFolder = parser.getFormattedTitle(seriesId, first.title, last.title, utils/* getCommonPrefix */.iL);

            const category = siteInfo.category || 'Webtoon';

            if (!(0,core_config/* isConfigValid */.Jb)()) {
                console.log('[TokiSync] GAS 설정을 찾을 수 없어 이력 동기화를 건너뜁니다.');
                return;
            }

            console.log(`[TokiSync] Fetching history for: ${rootFolder} (${category})`);
            
            // [v1.9.1] Use fetchHistoryDirect for faster & more reliable sync
            const result = await (0,network/* fetchHistoryDirect */.GA)(rootFolder, category);
            
            if (result.success) {
                console.log(`[TokiSync] Received ${result.data.length} history items via Direct API`);
                if (result.data.length > 0) {
                    await markDownloadedItems(result.data);
                } else {
                    console.log('[TokiSync] No history items found in Drive');
                }
            } else {
                // Fallback to Legacy GAS if Direct fails
                console.warn('[TokiSync] Direct history fetch failed, trying legacy GAS relay...');
                const legacyHistory = await (0,gas/* fetchHistory */.Ny)(rootFolder, category);
                if (legacyHistory && legacyHistory.length > 0) {
                    await markDownloadedItems(legacyHistory);
                }
            }
        } catch (e) {
            console.warn('[TokiSync] History check failed:', e);
        } finally {
            isSyncing = false;
            lastSyncTime = Date.now();
        }
    };

    // -- 1. Initialize MenuModal --
    new ui/* MenuModal */.fo({
        onDownload: () => {}, // Not used directly, specific methods below
        downloadAll: (forceOverwrite) => {
            const config = (0,core_config/* getConfig */.zj)();
            tokiDownload(undefined, config.policy, forceOverwrite);
        },
        downloadRange: (spec, forceOverwrite) => {
            const config = (0,core_config/* getConfig */.zj)();
            tokiDownload(spec, config.policy, forceOverwrite);
        },
        openViewer: openViewer,
        toggleLog: () => logger.logger.toggle(),
        getConfig: core_config/* getConfig */.zj,
        setConfig: core_config/* setConfig */.Nk,
        getEpisodeRange: async () => {
            const parser = await ParserFactory.getParser();
            if (!parser) return { min: 1, max: 100 };
            
            const list = await parser.getListItems();
            if (list.length > 0) {
                const first = parser.parseListItem(list[0]);
                const last = parser.parseListItem(list[list.length - 1]);
                const min = Math.min(parseInt(first.num), parseInt(last.num));
                const max = Math.max(parseInt(first.num), parseInt(last.num));
                return { min, max };
            }
            return { min: 1, max: 100 };
        },
        migrateKavita: runKavitaMigration,
        migrateThumbnails: runThumbnailMigration,
        syncHistory: syncHistory,
        testNativeDownload: async () => {
            try {
                const testBlob = new Blob(["TokiSync Native Mode Test File"], { type: "text/plain" });
                await (0,utils/* saveFile */.OJ)(testBlob, "test", "native", "txt", { folderName: "_Test" });
                return true;
            } catch (e) {
                console.error("[Native Test Failed]", e);
                return false;
            }
        },
        testExtraction: async () => {
            try {
                logger.logger.show();
                logger.logger.log('🧪 추출 테스트 시작...', 'Debug');
                
                const parser = await ParserFactory.getParser();
                if (!parser) {
                    logger.logger.error('❌ 파서를 찾을 수 없습니다.', 'Debug');
                    return;
                }

                const siteInfo = await detectSite();
                // 현재 페이지(document)를 대상으로 추출 테스트
                const result = await (0,extractor.extractEpisodeData)(document, parser, siteInfo, false);
                
                console.log('[Debug Result]', result);
                
                if (result.urls && result.urls.length > 0) {
                    logger.logger.success(`✅ 이미지 추출 성공: ${result.urls.length}개`, 'Debug');
                } else if (result.content) {
                    logger.logger.success(`✅ 소설 추출 성공: ${result.content.length}자`, 'Debug');
                } else {
                    logger.logger.warn('⚠️ 추출된 데이터가 없습니다. (뷰어 페이지가 아닐 수 있음)', 'Debug');
                }
                
                if (result.seriesTitle && result.seriesTitle !== "UnknownSeries") {
                    logger.logger.log(`📚 작품명: ${result.seriesTitle}`, 'Debug');
                    logger.logger.log(`🔖 에피소드: ${result.episodeTitle} (${result.episodeNum})`, 'Debug');
                }

            } catch (e) {
                logger.logger.error(`❌ 테스트 실패: ${e.message}`, 'Debug');
                console.error(e);
            }
        },
        downloadCurrent: async () => {
            try {
                logger.logger.show();
                logger.logger.log('🚀 현재 에피소드 다운로드 시작...', 'System');
                
                const siteInfo = await detectSite();
                const parser = await ParserFactory.getParser();
                if (!parser) throw new Error('파서를 찾을 수 없습니다.');

                // 1. 메타데이터 추출 (제목 등 확인용)
                const metadata = await (0,extractor.extractEpisodeData)(document, parser, siteInfo, false);
                const title = metadata.episodeTitle || "Current_Episode";
                const seriesTitle = metadata.seriesTitle || "Unknown_Series";

                // 2. 빌더 생성 (카테고리에 따라)
                const isNovel = (siteInfo.category === 'Novel' || siteInfo.category === 'novel');
                let builder;
                let extension = 'cbz';
                if (isNovel) {
                    const novelFormat = (0,core_config/* getConfig */.zj)().novelFormat || 'epub';
                    builder = novelFormat === 'txt' ? new txt/* TxtBuilder */.I() : new epub/* EpubBuilder */.s(seriesTitle, { author: "TokiSync" });
                    extension = novelFormat;
                } else {
                    builder = new cbz/* CbzBuilder */.$(title);
                }

                // 3. 임시 아이템 객체 생성 (processItem 호환용)
                const tempItem = {
                    title: title,
                    src: document.URL,   // processItem에서 item.src 참조 (API 복호화 포함)
                    url: document.URL,   // 하위 호환성 유지
                    num: metadata.episodeNum || "0000"
                };

                const config = (0,core_config/* getConfig */.zj)();
                const destination = (config.policy === 'native') ? 'native' : (config.policy === 'drive' ? 'drive' : 'local');

                // 4. 단건 다운로드 실행 (현재 페이지의 document를 직접 전달)
                await processItem(tempItem, builder, siteInfo, null, parser, seriesTitle, document, "", destination);

                // 5. 파일 생성 및 저장
                logger.logger.log('💾 파일 생성 및 저장 중...', 'System');
                
                const zip = await builder.build({
                    series: seriesTitle,
                    title: title,
                    number: tempItem.num
                });
                
                const blob = await zip.generateAsync({ type: "blob" });
                const filename = `${tempItem.num} - ${title}`;

                await (0,utils/* saveFile */.OJ)(blob, filename, 'local', extension, { category: siteInfo.category });
                logger.logger.success('✅ 다운로드 완료!', 'System');

            } catch (e) {
                logger.logger.error(`❌ 다운로드 실패: ${e.message}`, 'System');
                console.error(e);
            }
        }
    });



    // -- 3. Bridge Listener --
    window.addEventListener("message", async (event) => {
        if (event.data.type === 'TOKI_BRIDGE_REQUEST') {
            const { requestId, url, options } = event.data;
            const sourceWindow = event.source;
            const origin = event.origin;

            if (!origin.includes("github.io") && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
                console.warn("[Bridge] Blocked request from unknown origin:", origin);
                return;
            }

            console.log(`[Bridge] Proxying request: ${url}`);

            try {
                GM_xmlhttpRequest({
                    method: options.method || 'GET',
                    url: url,
                    headers: options.headers,
                    data: options.data,
                    responseType: options.responseType || undefined,
                    onload: async (res) => {
                        let payload = null;
                        if (res.response instanceof Blob) {
                            payload = await (0,utils/* blobToArrayBuffer */._L)(res.response);
                        } else {
                            payload = res.responseText;
                        }

                        // [v1.7.0] Cross-tab 상태 갱신 인지: Viewer가 GAS에 뭔가 썼을 경우 (업로드 / 이력 갱신)
                        if (options.data && typeof options.data === 'string') {
                            if (options.data.includes('"type":"upload"') || options.data.includes('"type":"view_update_cache"')) {
                                if (typeof payload === 'string' && payload.includes('"status":"success"')) {
                                    if (typeof GM_setValue !== 'undefined') GM_setValue("TOKI_HISTORY_DIRTY", Date.now());
                                }
                            }
                        }

                        sourceWindow.postMessage({
                            type: 'TOKI_BRIDGE_RESPONSE',
                            requestId: requestId,
                            payload: payload,
                            contentType: res.responseHeaders.match(/content-type:\s*(.*)/i)?.[1]
                        }, origin, [payload instanceof ArrayBuffer ? payload : undefined].filter(Boolean));
                    },
                    onerror: (err) => {
                        sourceWindow.postMessage({
                            type: 'TOKI_BRIDGE_RESPONSE',
                            requestId: requestId,
                            error: 'Network Error'
                        }, origin);
                    }
                });
            } catch (e) {
                console.error("[Bridge] Error:", e);
                sourceWindow.postMessage({
                    type: 'TOKI_BRIDGE_RESPONSE',
                    requestId: requestId,
                    error: e.message
                }, origin);
            }
        }
    });

    // Initial load
    console.log('[TokiSync] Starting history sync...');
    syncHistory();

    // Background subscription check (silent)
    SubscriptionManager/* SubscriptionManager */.v.checkOnce();

    // Cross-tab sync listener
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            if (typeof GM_getValue !== 'undefined') {
                const dirtyTime = GM_getValue("TOKI_HISTORY_DIRTY", 0);
                if (dirtyTime > lastSyncTime) {
                    console.log(`[TokiSync] 다른 탭에서 이력 갱신 감지! 백그라운드 새로고침 수행...`);
                    syncHistory();
                }
            }
        }
    });
}

// EXTERNAL MODULE: ./src/core/ipc-broker.js
var ipc_broker = __webpack_require__(941);
// EXTERNAL MODULE: ./src/core/novel-decryptor.js
var novel_decryptor = __webpack_require__(602);
;// ./src/core/worker-extractor.js
/**
 * tokiSync - Self-contained Worker Extractor
 * Executes extraction and forwards raw content back to the parent controller.
 */








// 🛡️ 자립형 워커 엔진 중복 실행 방지 가드용 변수
let isWorkerExtractorInitialized = false;
let workerIpcCleanup = null;

// Define localized stage reporting helper
function reportProgress(queueId, percent, stage) {
    // Send lightweight progress update to parent UI
    (0,ipc_broker/* sendToParent */.Ac)('WORKER_PROGRESS', {
        queueId,
        percent: Math.min(100, Math.max(0, Math.round(percent))),
        stage
    });
}

/**
 * Main execution of the Self-contained Worker
 */
function initWorkerExtractor() {
    if (window.tokisync_worker_extractor_initialized || isWorkerExtractorInitialized) {
        console.log("[TokiSync:Worker] 📢 이미 워커 엔진이 기동되어 중복 실행을 차단합니다.");
        return;
    }
    window.tokisync_worker_extractor_initialized = true;
    isWorkerExtractorInitialized = true;

    console.log("🚀 [TokiSync:Worker] 자립형 워커 엔진 시동 완료 (수집 전담 모드)");

    // Establish Handshake Heartbeat every second until parent injects instructions
    let handshakeInterval = setInterval(() => {
        console.log("[TokiSync:Worker] 📢 READY 핸드셰이킹 하트비트 전송 중...");
        (0,ipc_broker/* sendToParent */.Ac)('WORKER_READY', {
            targetUrl: window.location.href,
            timestamp: Date.now()
        });
    }, 1000);

    let isExtracting = false;

    // Register listener for commands from parent
    if (workerIpcCleanup) {
        try {
            workerIpcCleanup();
        } catch (e) {
            console.warn('[TokiSync:Worker] 기존 워커 IPC 리스너 해제 실패:', e);
        }
        workerIpcCleanup = null;
    }

    const cleanupIpc = () => {
        if (workerIpcCleanup) {
            workerIpcCleanup();
            workerIpcCleanup = null;
        }
    };

    workerIpcCleanup = (0,ipc_broker/* registerIpcListener */.Q_)(async (msg) => {
        if (msg.type === 'EMERGENCY_STOP') {
            console.warn('[TokiSync:Worker] ⏹️ 긴급 정지 명령 수신 (EMERGENCY_STOP)');
            cleanupIpc();
            core_stopSilentAudio();
            window.close();
            return;
        }

        if (msg.type === 'START_EXTRACTION') {
            const { queueId } = msg.payload;

            // 안티 슬립 오디오 기동 (백그라운드 스로틀링 회피)
            try {
                core_startSilentAudio();
            } catch (e) {
                console.warn('[TokiSync:Worker] 안티 슬립 기동 실패 (무시 가능):', e.message);
            }

            // CF Challenge Check
            const isCloudflare = document.title.includes('Just a moment') ||
                                 document.getElementById('cf-challenge-running') ||
                                 document.querySelector('.cf-browser-verification') ||
                                 document.getElementById('challenge-running');
            
            if (isCloudflare) {
                console.warn("⚠️ [TokiSync:Worker] 클라우드플레어 보안 챌린지 감지 - 대기 모드 진입");
                (0,ipc_broker/* sendToParent */.Ac)('CAPTCHA_DETECTED', { queueId });
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
                scanSpeedMultiplier = 1.0,
                speedMultiplier = 1.0,
                sessionNonce
            } = msg.payload;

            console.log(`🚀 [TokiSync:Worker] 동작 지시문 수신 (ID: ${queueId}, 유형: ${targetType})`);
            reportProgress(queueId, 10, core_queue/* WORKER_STAGE */.WB.DOM_READY);

            // Reconstruct parser instance using injected matchedRule
            const parser = new GenericParser.GenericParser(protocolDomain || window.location.origin, matchedRule);
            const viewerCfg = parser.rule.viewer || {};

            // 생명주기 제어 변수 및 헬퍼 선제 선언 (try-catch 양쪽 스코프 공유)
            let ackTimeout = null;
            let stateListenerId = null;
            let fallbackInterval = null;
            let ackCleanup = null;

            const closeSelf = () => {
                if (ackTimeout) clearTimeout(ackTimeout);
                if (fallbackInterval) clearInterval(fallbackInterval);
                if (stateListenerId && typeof GM_removeValueChangeListener !== 'undefined') {
                    try {
                        GM_removeValueChangeListener(stateListenerId);
                    } catch (e) {}
                }
                if (ackCleanup) {
                    try { ackCleanup(); } catch (e) {}
                }
                cleanupIpc();
                core_stopSilentAudio();
                console.log(`[TokiSync:Worker] 🏁 자체 파기(window.close)를 집행합니다.`);
                window.close();
            };

            try {
                let content = "";
                let resolvedImages = [];

                // --- 1. SOSEL EXTRACTION ---
                if (targetType === 'novel') {
                    reportProgress(queueId, 20, core_queue/* WORKER_STAGE */.WB.DOM_READY);

                    // [v1.21.9] 소설 가상 스크롤 시뮬레이션 작동 (인간 행동 분석 우회)
                    console.log("[TokiSync:Worker] 소설 가상 스크롤 시뮬레이션 작동...");
                    (0,ipc_broker/* sendToParent */.Ac)('WORKER_LOG', { msg: `소설 가상 스크롤 시뮬레이션 시작...`, level: 'info' });
                    reportProgress(queueId, 30, core_queue/* WORKER_STAGE */.WB.SCROLLING);

                    const findScrollContainer = () => {
                        const candidates = [
                            document.querySelector('.viewer-container'),
                            document.querySelector('.episode-body'),
                            document.querySelector('main'),
                            document.body,
                            document.documentElement
                        ];
                        return candidates.find(el => el && el.scrollHeight > el.clientHeight) || document.documentElement;
                    };

                    const container = findScrollContainer();
                    console.log(`[TokiSync:Worker] 감지된 스크롤 컨테이너:`, container.tagName, container.className);
                    (0,ipc_broker/* sendToParent */.Ac)('WORKER_LOG', { msg: `스크롤 컨테이너 감지: <${container.tagName.toLowerCase()}> (전체 높이: ${container.scrollHeight}px)`, level: 'info' });

                    const totalHeight = container.scrollHeight || 3000;
                    const scrollSteps = 5;
                    const behavior = 'smooth';

                    for (let step = 1; step <= scrollSteps; step++) {
                        // 중단 여부 체크 (스토리지에서 큐 상태 확인)
                        const queue = (0,core_queue/* getQueue */.IS)();
                        const currentItem = queue.find(q => q.id === queueId);
                        if (!currentItem || currentItem.status === 'failed') {
                            console.warn('[TokiSync:Worker] ⏹️ 소설 가상 스크롤 중 대기열 중단 감지 -> 즉시 정지');
                            cleanupIpc();
                            core_stopSilentAudio();
                            window.close();
                            return;
                        }

                        const targetY = (totalHeight / scrollSteps) * step;
                        
                        // 1. 강제 스크롤 대입 및 scrollTo 병행
                        if (container === document.documentElement || container === document.body) {
                            window.scrollTo({ top: targetY });
                            document.documentElement.scrollTop = targetY;
                            document.body.scrollTop = targetY;
                        } else {
                            container.scrollTo({ top: targetY });
                            container.scrollTop = targetY;
                        }

                        // 2. 키보드 이벤트 시뮬레이션 디스패치 (PageDown, ArrowDown)
                        const simulateKey = (target, keyStr, code) => {
                            try {
                                target.dispatchEvent(new KeyboardEvent('keydown', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                                target.dispatchEvent(new KeyboardEvent('keypress', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                                target.dispatchEvent(new KeyboardEvent('keyup', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                            } catch (e) {}
                        };
                        simulateKey(container, 'PageDown', 34);
                        simulateKey(container, 'ArrowDown', 40);
                        simulateKey(window, 'PageDown', 34);
                        simulateKey(window, 'ArrowDown', 40);

                        container.dispatchEvent(new Event('scroll'));
                        window.dispatchEvent(new Event('scroll'));

                        (0,ipc_broker/* sendToParent */.Ac)('WORKER_LOG', { msg: `가상 스크롤 진행 중: ${Math.round((step / scrollSteps) * 100)}%`, level: 'info' });
                        await (0,utils/* sleep */.yy)(800 * speedMultiplier);
                    }

                    // 최종 스크롤 아래로 고정
                    if (container === document.documentElement || container === document.body) {
                        window.scrollTo({ top: totalHeight });
                        document.documentElement.scrollTop = totalHeight;
                        document.body.scrollTop = totalHeight;
                    } else {
                        container.scrollTo({ top: totalHeight });
                        container.scrollTop = totalHeight;
                    }
                    
                    // 최종 키보드 이벤트 디스패치
                    const finalSimulateKey = (target, keyStr, code) => {
                        try {
                            target.dispatchEvent(new KeyboardEvent('keydown', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                            target.dispatchEvent(new KeyboardEvent('keyup', { key: keyStr, keyCode: code, which: code, bubbles: true, cancelable: true }));
                        } catch (e) {}
                    };
                    finalSimulateKey(container, 'PageDown', 34);
                    finalSimulateKey(window, 'PageDown', 34);

                    container.dispatchEvent(new Event('scroll'));
                    window.dispatchEvent(new Event('scroll'));
                    await (0,utils/* sleep */.yy)(300 * speedMultiplier);

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
                            reportProgress(queueId, 50, core_queue/* WORKER_STAGE */.WB.PARSING);
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
                        await (0,utils/* sleep */.yy)(200 * speedMultiplier);
                    }

                    // Fallback to Plan C: Decryption API
                    if ((!content || content.trim().length < 100) && viewerCfg.decryptApi) {
                        console.warn("[TokiSync:Worker] Shadow DOM 추출 실패 - Plan C API 복호화 폴백 구동");
                        content = await (0,novel_decryptor/* fetchNovelTextViaApi */.i)(window.location.href, viewerCfg.decryptApi);
                    }

                    if (!content || content.trim().length < 100) {
                        throw new Error("소설 본문 추출에 실패했습니다. (Shadow DOM/API 복호화 무반응)");
                    }

                    reportProgress(queueId, 85, core_queue/* WORKER_STAGE */.WB.PARSING);
                } 
                // --- 2. MANHWA EXTRACTION ---
                else {
                    console.log("[TokiSync:Worker] 웹툰 콘텐츠 DOM 렌더링 대기 중...");
                    reportProgress(queueId, 20, core_queue/* WORKER_STAGE */.WB.DOM_READY);

                    // Wait for comic content inside DOM
                    const contentDoc = await (0,utils/* waitForContent */.UF)(window, Math.round(10000 * scanSpeedMultiplier), viewerCfg);
                    if (!contentDoc) {
                        console.warn("[TokiSync:Worker] 10초 내 콘텐츠 렌더링 미감지. 갈무리 강행.");
                    }

                    // 1.5s DOM Stabilization delay
                    reportProgress(queueId, 30, core_queue/* WORKER_STAGE */.WB.DOM_READY);
                    await (0,utils/* sleep */.yy)(1500);

                    console.log("[TokiSync:Worker] 스크롤 로드 및 이미지 다운로드 활성화");
                    reportProgress(queueId, 40, core_queue/* WORKER_STAGE */.WB.SCROLLING);

                    // Physical scroll down
                    await (0,utils/* scrollToLoad */.Vs)(document, 25000, viewerCfg, scanSpeedMultiplier);

                    // Downloader helper with concurrency 5
                    const runImageDownloads = async (imageUrls) => {
                        const downloaded = [];
                        const CONCURRENCY_LIMIT = 5;
                        let processedCount = 0;

                        reportProgress(queueId, 0, core_queue/* WORKER_STAGE */.WB.DOWNLOADING);

                        for (let i = 0; i < imageUrls.length; i += CONCURRENCY_LIMIT) {
                            // [v1.21.8] 다운로드 루프 중 중단 여부 체크 (스토리지에서 큐 상태 확인)
                            const queue = (0,core_queue/* getQueue */.IS)();
                            const currentItem = queue.find(q => q.id === queueId);
                            if (!currentItem || currentItem.status === 'failed') {
                                console.warn('[TokiSync:Worker] ⏹️ 이미지 다운로드 중 대기열 중단 감지 -> 즉시 정지');
                                cleanupIpc();
                                core_stopSilentAudio();
                                window.close();
                                return [];
                            }

                            const chunk = imageUrls.slice(i, i + CONCURRENCY_LIMIT);
                            const chunkPromises = chunk.map(async (url, index) => {
                                const globalIndex = i + index;
                                try {
                                    const imgBlob = await (0,utils/* fetchBlobWithXHR */.Kt)(url, window.location.href);
                                    const arrayBuffer = await (0,utils/* blobToArrayBuffer */._L)(imgBlob);
                                    processedCount++;

                                    const percent = (processedCount / imageUrls.length) * 100;
                                    reportProgress(queueId, percent, core_queue/* WORKER_STAGE */.WB.DOWNLOADING);

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
                                    reportProgress(queueId, percent, core_queue/* WORKER_STAGE */.WB.DOWNLOADING);

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
                        reportProgress(queueId, 35, core_queue/* WORKER_STAGE */.WB.SCROLLING);
                        await (0,utils/* sleep */.yy)(2000);
                        
                        await (0,utils/* scrollToLoad */.Vs)(document, 15000, viewerCfg, scanSpeedMultiplier);
                        
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
                    reportProgress(queueId, 85, core_queue/* WORKER_STAGE */.WB.PARSING);

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
                reportProgress(queueId, 95, core_queue/* WORKER_STAGE */.WB.UPLOADING);

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
                        (0,ipc_broker/* sendToParent */.Ac)('TASK_COMPLETED', payload, sessionNonce, transferables);
                        console.log(`[TokiSync:Worker] postMessage 송신 완료. 부모의 ACK를 기다립니다.`);
                    } catch (ipcErr) {
                        console.warn(`[TokiSync:Worker] ⚠️ postMessage 실패 (샌드박스 차단 의심) -> GM_setValue 2차 폴백 구동:`, ipcErr);
                        
                        await new Promise((resolve) => {
                            GM_setValue(`tokisync_fallback_${queueId}`, payload);
                            // 전송 알림
                            (0,ipc_broker/* sendToParent */.Ac)('TASK_COMPLETED_FALLBACK', { queueId });
                            resolve();
                        });
                    }
                };

                // 부모의 ACK 응답을 받기 위한 이벤트 리스너 등록
                const checkStateAndClose = (queueData) => {
                    try {
                        const items = Array.isArray(queueData) ? queueData : [];
                        const myItem = items.find(i => i.id === queueId);
                        if (myItem && (myItem.status === 'completed' || myItem.status === 'failed')) {
                            console.log(`[TokiSync:Worker] 🎯 중앙 스토리지에서 상태 감지 완료: ${myItem.status}`);
                            closeSelf();
                        }
                    } catch (e) {
                        console.error('[TokiSync:Worker] 상태 감지 분석 오류:', e);
                    }
                };

                ackCleanup = (0,ipc_broker/* registerIpcListener */.Q_)(async (ackMsg) => {
                    if (ackMsg.type === 'IPC_ACK' && ackMsg.payload?.queueId === queueId) {
                        console.log(`[TokiSync:Worker] 🎉 부모의 ACK 수신 완료! 중앙 스토리지 완료/실패 대기 개시...`);
                        if (ackTimeout) clearTimeout(ackTimeout);
                        ackCleanup();

                        // 즉시 1회 검사
                        checkStateAndClose((0,core_queue/* getQueue */.IS)());

                        // 1. GM Storage 리스너 등록
                        if (typeof GM_addValueChangeListener !== 'undefined') {
                            stateListenerId = GM_addValueChangeListener('TOKI_DOWNLOAD_QUEUE', (key, oldValue, newValue, remote) => {
                                try {
                                    const parsed = typeof newValue === 'string' ? JSON.parse(newValue) : newValue;
                                    checkStateAndClose(parsed);
                                } catch (e) {
                                    checkStateAndClose(newValue);
                                }
                            });
                        }

                        // 2. 일반 환경 Fallback 폴링 가동
                        fallbackInterval = setInterval(() => {
                            checkStateAndClose((0,core_queue/* getQueue */.IS)());
                        }, 500);
                    }
                }, `worker_ack_${queueId}`);

                // ACK 대기 타임아웃 (15초간 부모 무반응 시 강제 종료)
                ackTimeout = setTimeout(() => {
                    console.warn(`[TokiSync:Worker] ⚠️ 부모 ACK 대기 타임아웃 (15초). 세션을 강제 종료합니다.`);
                    ackCleanup();
                    closeSelf();
                }, 15000);

                await sendData();

                } catch (err) {
                    console.error(`[TokiSync:Worker] ❌ 에피소드 수집 중 치명적 오류 발생:`, err);
                    // Notify parent that task failed
                    (0,ipc_broker/* sendToParent */.Ac)('TASK_FAILED', { queueId, errorMsg: err.message });
                    closeSelf();
                }
            }
        }, 'worker_extractor');
    }

;// ./src/core/listeners.js
/**
 * EventBus Listeners for TokiSync
 * Handles cross-layer events (UI → Core/Parser) that were previously direct imports.
 * This module is auto-loaded at startup via index.js.
 */




// ── Parser Verify (FormRuleEditor 🔍 button) ──
EventBus/* EventBus */.l.on(EventBus/* EVT */.c.PARSE_VERIFY, async ({ _requestId, targetId, rule, domain }) => {
    try {
        const { GenericParser } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 443));
        const parser = new GenericParser(domain, rule);
        let msg = '';

        if (targetId === 'rule-meta-title') {
            const val = parser.getSeriesTitle();
            if (val) msg = `✓ 추출 성공: "${val}"`;
            else throw new Error('타이틀을 추출하지 못했습니다. 셀렉터가 틀렸거나 페이지에 없습니다.');
        }
        else if (targetId === 'rule-meta-author') {
            const val = parser.getSeriesMetadata().author;
            if (val) msg = `✓ 추출 성공: "${val}"`;
            else throw new Error('작가를 추출하지 못했습니다.');
        }
        else if (targetId === 'rule-meta-thumb-selector') {
            const val = parser.getThumbnailUrl();
            if (val) msg = `✓ 추출 성공: ${val}`;
            else throw new Error('썸네일 이미지 URL을 추출하지 못했습니다.');
        }
        else if (targetId === 'rule-list-container' || targetId === 'rule-list-item') {
            const items = await parser.getListItems();
            if (items && items.length > 0) msg = `✓ 검증 성공: 총 ${items.length}개의 회차 아이템 감지됨.`;
            else throw new Error('회차 아이템을 전혀 찾지 못했습니다. 목록 컨테이너나 아이템 셀렉터를 다시 확인하세요.');
        }
        else if (targetId === 'rule-list-num') {
            const items = await parser.getListItems();
            if (!items || items.length === 0) throw new Error('회차 목록(container/item)을 먼저 찾을 수 있어야 세부 필드를 검증할 수 있습니다.');
            const firstItem = parser.parseListItem(items[0].element || items[0]);
            if (firstItem.num !== undefined && firstItem.num !== null) msg = `✓ 첫 항목 회차 번호 파싱 성공: "${firstItem.num}"`;
            else throw new Error('회차 번호(num) 추출 실패.');
        }
        else if (targetId === 'rule-list-link-selector' || targetId === 'rule-list-title') {
            const items = await parser.getListItems();
            if (!items || items.length === 0) throw new Error('회차 목록(container/item)을 먼저 찾을 수 있어야 세부 필드를 검증할 수 있습니다.');
            const firstItem = parser.parseListItem(items[0].element || items[0]);
            if (targetId === 'rule-list-link-selector') {
                if (firstItem.src) msg = `✓ 첫 항목 링크: ${firstItem.src}`;
                else throw new Error('회차 링크(href) 추출 실패.');
            } else {
                if (firstItem.title) msg = `✓ 첫 항목 제목: "${firstItem.title}"`;
                else throw new Error('회차 제목(innerText) 추출 실패.');
            }
        }
        else if (targetId === 'rule-viewer-imageContainer' || targetId === 'rule-viewer-imageItem') {
            const isNovel = (rule.category === 'Novel' || rule.category === 'novel');
            if (isNovel) {
                const content = parser.getNovelContent(document);
                if (content && content.trim().length > 0) msg = `✓ 본문 텍스트 검증 성공: (총 ${content.trim().length}자 추출됨) -> "${content.trim().substring(0, 50)}..."`;
                else throw new Error('소설 본문 텍스트를 추출하지 못했습니다.');
            } else {
                const imgs = parser.getImageList(document);
                if (imgs && imgs.length > 0) msg = `✓ 뷰어 이미지 검증 성공: 총 ${imgs.length}개 이미지 감지됨 (첫 이미지: ${imgs[0].url || 'src없음'})`;
                else throw new Error('뷰어 내에서 이미지를 검출하지 못했습니다.');
            }
        }
        else if (targetId === 'rule-viewer-exclude') {
            if (!rule.viewer?.exclude) msg = 'ℹ 제외 셀렉터가 비어 있습니다.';
            else {
                const targets = document.querySelectorAll(rule.viewer.exclude);
                msg = `✓ 검증 완료: 총 ${targets.length}개의 제외 대상 요소를 매칭했습니다.`;
            }
        }

        EventBus/* EventBus */.l.respond(EventBus/* EVT */.c.PARSE_VERIFY, _requestId, { ok: true, data: { msg } });
    } catch (err) {
        EventBus/* EventBus */.l.respond(EventBus/* EVT */.c.PARSE_VERIFY, _requestId, { ok: false, error: err.message });
    }
});

// ── Parser Test (FormRuleEditor 🧪 button) ──
EventBus/* EventBus */.l.on(EventBus/* EVT */.c.PARSE_TEST, async ({ _requestId, url, rule, category }) => {
    try {
        const [{ GenericParser }, { extractEpisodeData }] = await Promise.all([
            Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 443)),
            Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 929))
        ]);
        const domain = new URL(url).origin;
        const parser = new GenericParser(domain, rule);
        const result = await extractEpisodeData(document, parser, { site: 'test', category: category || 'Webtoon' }, false);

        const html = `
            <div class="toki-text-success" style="font-weight:800;">성공! (Virtual Match)</div>
            <div>• 제목: <strong>${result.title || '미추출'}</strong></div>
            <div>• 총 에피소드 수: <strong>${result.urls?.length || (result.content ? '1 (Text)' : '0')}개</strong></div>
        `;
        EventBus/* EventBus */.l.respond(EventBus/* EVT */.c.PARSE_TEST, _requestId, { ok: true, data: { html } });
    } catch (e) {
        EventBus/* EventBus */.l.respond(EventBus/* EVT */.c.PARSE_TEST, _requestId, { ok: false, error: e.message });
    }
});

// ── Parser Cache Clear ──
EventBus/* EventBus */.l.on(EventBus/* EVT */.c.RULE_CACHE_CLEAR, () => {
    ParserFactory.clearCache();
});

;// ./src/core/index.js




(async function () {
    'use strict';

    // 🛡️ Iframe 내부 실행 방지 가드 (중복 실행 및 중복 로그 출력 차단)
    if (window.self !== window.top) {
        return;
    }

    // ── 🔒 [초고도 스텔스 섀도 DOM 개방 및 클로킹 엔진] ────────────────
    try {
        const originalAttachShadow = Element.prototype.attachShadow;
        const originalToString = Function.prototype.toString;
        const originalCreateElement = Document.prototype.createElement;

        if (originalAttachShadow) {
            // A. 초스텔스 개방 가로채기 함수 정의
            const customAttachShadow = function attachShadow(init) {
                if (init && init.mode === 'closed') {
                    init.mode = 'open';
                    console.log('[TokiSync] 🔒 닫힌 Shadow DOM -> Open 모드로 은밀 개방 완료');
                }
                return originalAttachShadow.apply(this, arguments);
            };

            // B. 네이티브 프로토타입 체인 완벽 일치 (hasOwnProperty('toString') 방어)
            Object.setPrototypeOf(customAttachShadow, Function.prototype);
            
            // C. 글로벌 toString() 킹핀 클로킹 (자기 자신 및 가로채기 함수 위장)
            const patchedToString = function toString() {
                if (this === customAttachShadow) {
                    return 'function attachShadow() { [native code] }';
                }
                if (this === patchedToString) {
                    return 'function toString() { [native code] }';
                }
                return originalToString.apply(this, arguments);
            };
            
            Object.setPrototypeOf(patchedToString, Function.prototype);
            Function.prototype.toString = patchedToString;

            // D. 네이티브 디스크립터 완벽 동기화
            Object.defineProperty(Element.prototype, 'attachShadow', {
                value: customAttachShadow,
                writable: true,
                enumerable: true,
                configurable: true
            });

            // E. Iframe 우회 차단 감지 격파 (동적 생성 iframe 프로토타입 오염)
            Document.prototype.createElement = function (tagName) {
                const element = originalCreateElement.apply(this, arguments);
                if (tagName && tagName.toLowerCase() === 'iframe') {
                    // iframe이 생성되어 DOM에 부착되는 시점을 추적하여 동기화 주입
                    const observer = new MutationObserver(() => {
                        try {
                            if (element.contentWindow && element.contentWindow.Element) {
                                const iframeAttach = element.contentWindow.Element.prototype.attachShadow;
                                if (iframeAttach && iframeAttach !== customAttachShadow) {
                                    Object.defineProperty(element.contentWindow.Element.prototype, 'attachShadow', {
                                        value: customAttachShadow,
                                        writable: true,
                                        enumerable: true,
                                        configurable: true
                                    });
                                }
                            }
                        } catch (err) {}
                        observer.disconnect();
                    });
                    observer.observe(document.documentElement, { childList: true, subtree: true });
                }
                return element;
            };
            
            Object.setPrototypeOf(Document.prototype.createElement, Function.prototype);
        }
    } catch (e) {
        console.warn('[TokiSync] 초스텔스 섀도 DOM 엔진 로드 실패:', e.message);
    }
    // ───────────────────────────────────────────────────────────────

    // 1. 모든 console.log 덮어쓰기 제거
    // 2. window.tokiQueue, downloadTokiLogs 등 모든 전역 노출 차단
    // 3. window.fetch, sendBeacon, XHR Proxy 가로채기 전면 비활성화 (스텔스 유지)
    // 4. window.name 및 sessionStorage 워커 각인 흔적 배제

    // window.opener가 존재할 경우 워커로 판별하여 Extractor 기동 (스텔스 모드)
    if (window.opener) {
        const startWorker = () => {
            try {
                initWorkerExtractor();
            } catch (e) {
                console.error('[TokiSync:Worker] Worker 초기화 실패:', e);
            }
        };
        if (document.readyState === 'complete') {
            startWorker();
        } else {
            window.addEventListener('load', startWorker);
        }
        return; // 부모 창의 메인 수집 로직 실행 차단 (Early Exit)
    }

    console.log('[TokiSync] 🛡️ 스텔스(Stealth) 순수 무취 실행 모드가 활성화되었습니다.');

    const startMain = async () => {
        setTimeout(async () => {
            try {
                // 핵심 수집 기능만 순수하게 기동
                await main();
            } catch (e) {
                console.error('[TokiSync] Main execution error:', e);
            }
        }, 500); // SPA 사이트 Hydration 대비 버퍼 500ms
    };

    if (document.readyState === 'complete') {
        startMain();
    } else {
        window.addEventListener('load', startMain);
    }
})();
/******/ })()
;