// ==UserScript==
// @name         TokiSync (Link to Drive)
// @namespace    http://tampermonkey.net/
// @version      1.22.0
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
        (_listeners[event] || []).forEach(fn => fn(payload));
    },
    on(event, fn) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(fn);
        // 등록 해제 함수를 반환하여 메모리 누수 방지
        return () => this.off(event, fn);
    },
    off(event, fn) {
        _listeners[event] = (_listeners[event] || []).filter(f => f !== fn);
    }
};

// ── 표준 이벤트 상수 ─────────────────────────────────────────
// Service → UI 방향
const EVT = {
    LOG:            'log',            // { msg, level, tag } → LogBox에 출력
    NOTIFY_ERROR:   'notify:error',   // { msg } → alert() 대체
    NOTIFY_CONFIRM: 'notify:confirm', // { msg, onConfirm, onCancel } → confirm() 대체
    DOWNLOAD_DONE:  'download:done',  // 다운로드 배치 전체 완료
    UPDATE_PROGRESS: 'update:progress', // UI 진행 상황 강제 업데이트 신호
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
/* harmony export */   US: function() { return /* binding */ removeCompletedAndFailedItems; },
/* harmony export */   WB: function() { return /* binding */ WORKER_STAGE; },
/* harmony export */   d$: function() { return /* binding */ removeQueueItem; },
/* harmony export */   gi: function() { return /* binding */ runSchedulerOnce; },
/* harmony export */   id: function() { return /* binding */ addEpisodesToQueue; },
/* harmony export */   kZ: function() { return /* binding */ getQueuePaused; },
/* harmony export */   lg: function() { return /* binding */ clearQueue; },
/* harmony export */   mR: function() { return /* binding */ activeWorkers; },
/* harmony export */   zX: function() { return /* binding */ getQueueStats; }
/* harmony export */ });
/* unused harmony exports transitionQueueItemsForRelay, updateQueueItemProgress, removeCompletedItems */
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(989);
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

const STORAGE_KEY = 'tokisync_download_queue';
const MAX_CONCURRENCY = 2; // 최대 동시 다운로드 수

// 임시 팝업 창 참조 보관용 맵 (Liveness check 및 재활용 루프 대비)
const activeWorkers = new Map();
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
      _ui_js__WEBPACK_IMPORTED_MODULE_0__.LogBox.getInstance().updateProgressUI();
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
const transitionQueueItemsForRelay = (completedId, nextId) => {
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
 * 완료된(completed) 항목들 일괄 삭제
 */
const removeCompletedItems = () => {
  const queue = getRawQueue();
  const filtered = queue.filter(item => item.status !== 'completed');
  saveRawQueue(filtered);
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

const PAUSED_KEY = 'tokisync_queue_paused';

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
const stopAllWorkers = () => {
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
const runSchedulerOnce = async () => {
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
            // [우회 극대화] window.open 대신 window 객체 참조를 직접 제어하여 100% 확실하게 기존 팝업창을 재사용합니다.
            console.log(`[Queue Scheduler] location.replace로 팝업 리다이렉션 시도: ${nextItem.episodeUrl}`);
            try {
                recycledPopup.location.replace(nextItem.episodeUrl);
            } catch (replaceErr) {
                console.warn('[Queue Scheduler] location.replace 제한 감지 -> location.href 폴백 시도:', replaceErr);
                recycledPopup.location.href = nextItem.episodeUrl;
            }
            
            // 통신용 window.name 갱신 시도 (크로스 도메인 보안 경계 등으로 예외 시 대비하여 안전 조치)
            try {
                recycledPopup.name = newWindowName;
            } catch (nameErr) {
                console.warn('[Queue Scheduler] recycledPopup.name 설정 실패 (무시 가능):', nameErr);
            }
            
            activeWorkers.set(nextItem.id, recycledPopup);
        } catch (err) {
            console.error('[Queue Scheduler] 팝업 릴레이 강제 실패:', err);
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
const initQueueScheduler = () => {
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
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(989);
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
                        _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().error(`Token fetch failed: ${result.error}`, 'Network:Auth');
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
                _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().error('Token request network error', 'Network:Auth');
                reject(new Error('Token request failed'));
            },
            ontimeout: () => {
                console.error('[DirectUpload] Token request timed out (30s)');
                _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().error('Token request timed out (30s)', 'Network:Auth');
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
 * Finds or creates a folder in Google Drive with category support
 * Mirrors GAS server's getOrCreateSeriesFolder logic:
 * 1. Check root for legacy folders
 * 2. Get/Create category folder (Webtoon/Novel/Manga)
 * 3. Get/Create series folder in category
 * 
 * @param {string} folderName - Series folder name (e.g. "[123] Title")
 * @param {string} parentId - Parent folder ID (root)
 * @param {string} token - OAuth token
 * @param {string} category - Category name ("Webtoon", "Novel", or "Manga")
 * @returns {Promise<string>} Series folder ID
 */
async function getOrCreateFolder(folderName, parentId, token, category = 'Webtoon') {
    // 1. Check for legacy folder in root (migration compatibility)
    const legacySearchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=name='${encodeURIComponent(folderName)}' and '${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'` +
        `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    
    const legacyResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: legacySearchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000,
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 레거시 폴더 검색 타임아웃 (30초)'))
        });
    });
    
    if (legacyResult.files && legacyResult.files.length > 0) {
        console.log(`[DirectUpload] ♻️ Found legacy folder in root: ${folderName}`);
        return legacyResult.files[0].id;
    }
    
    // 2. Get or create category folder
    const categoryName = category || 'Webtoon';
    const categorySearchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=name='${categoryName}' and '${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'` +
        `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    
    const categoryResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: categorySearchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000,
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 카테고리 폴더 검색 타임아웃 (30초)'))
        });
    });
    
    let categoryFolderId;
    if (categoryResult.files && categoryResult.files.length > 0) {
        categoryFolderId = categoryResult.files[0].id;
        console.log(`[DirectUpload] 📂 Category folder found: ${categoryName}`);
    } else {
        // Create category folder
        console.log(`[DirectUpload] 📂 Creating category folder: ${categoryName}`);
        const createCategoryResult = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    name: categoryName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [parentId]
                }),
                timeout: 30000,
                onload: (res) => {
                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('[DirectUpload] 카테고리 폴더 생성 타임아웃 (30초)'))
            });
        });
        categoryFolderId = createCategoryResult.id;
    }
    
    // 3. Get or create series folder in category
    // [v1.4.0 Fix] Search by ID prefix "[12345]" instead of full name to handle title changes
    // [v1.9.4 Fix] Support alphanumeric IDs and fallback to exact match if ID is "0000" to prevent collision
    const idMatch = folderName.match(/^\[([a-zA-Z0-9_\-]+)\]/);
    const idPrefix = idMatch ? idMatch[0] : null;
    const rawId = idMatch ? idMatch[1] : null;
    
    let queryPart = "";
    if (idPrefix && rawId !== "0000") {
        // Search for folders containing "[12345]"
        queryPart = `name contains '${idPrefix}'`;
    } else {
        // Fallback: Exact match for 0000 or invalid ID
        queryPart = `name = '${folderName.replace(/'/g, "\\'")}'`; 
    }

    const seriesSearchUrl = `https://www.googleapis.com/drive/v3/files?` +
        `q=${queryPart} and '${categoryFolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'` +
        `&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    
    const seriesResult = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: seriesSearchUrl,
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000,
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 시리즈 폴더 검색 타임아웃 (30초)'))
        });
    });
    
    // Filter results to ensure it starts with the ID (double check)
    let foundFolder = null;
    if (seriesResult.files && seriesResult.files.length > 0) {
        if (idPrefix && rawId !== "0000") {
            // Find the first folder that STARTS with the ID
            foundFolder = seriesResult.files.find(f => f.name.startsWith(idPrefix));
        } else {
            foundFolder = seriesResult.files[0];
        }
    }

    if (foundFolder) {
        console.log(`[DirectUpload] Folder found: ${foundFolder.name} (ID: ${foundFolder.id})`);
        return foundFolder.id;
    }
    
    // Create series folder
    console.log(`[DirectUpload] Creating series folder: ${folderName} in ${categoryName}`);
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
                parents: [categoryFolderId]
            }),
            timeout: 30000,
            onload: (res) => {
                try {
                    resolve(JSON.parse(res.responseText));
                } catch (e) {
                    reject(e);
                }
            },
            onerror: reject,
            ontimeout: () => reject(new Error('[DirectUpload] 시리즈 폴더 생성 타임아웃 (30초)'))
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
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();

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
        const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();
        
        // Determine category
        const category = metadata.category || (fileName.endsWith('.epub') ? 'Novel' : 'Webtoon');
        
        // 1. Get Series Folder ID (큐에 선제 저장된 폴더 ID가 있다면 그대로 사용하고, 없으면 생성)
        const seriesFolderId = metadata.folderId || await getOrCreateFolder(folderName, config.folderId, token, category);
        
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
            const searchUrl = `https://www.googleapis.com/drive/v3/files?` +
                `q=name='${finalFileName}' and '${targetFolderId}' in parents and trashed=false` +
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
        _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().error(`[DirectUpload] ${error.message}`, 'Network:Upload');
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
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!config.folderId) return { success: false, folderId: null, data: [] };

    let currentSeriesFolderId = null;

    try {
        console.log(`[DirectHistory] Fetching history for: ${seriesTitle} (${category})`);
        const token = await getToken();
        
        // Find the Series Folder ID
        currentSeriesFolderId = await getOrCreateFolder(seriesTitle, config.folderId, token, category);
        
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
            const match = file.name.match(/^(\d+)/);
            if (!match) return; 
            
            const episodeNum = match[1];
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
            logger.log(`[SmartSkip] 용량 분석 완료 - Max: ${(maxSize/1024/1024).toFixed(1)}MB, 통과 기준: ${config.smartSkipRatio || 50}% (${(threshold/1024/1024).toFixed(1)}MB 이상)`);
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
            logger.warn(`[SmartSkip] ⚠️ 용량 미달(손상 의심)로 무시된 파일 ${ignoredEpisodes.length}개 (재다운로드 됨): \n - ${ignoredEpisodes.slice(0, 3).join('\n - ')}${ignoredEpisodes.length > 3 ? '\n - ...' : ''}`);
        }

        console.log(`[DirectHistory] Final valid episodes: ${validEpisodes.length}`);
        return { 
            success: true, 
            folderId: currentSeriesFolderId, 
            data: [...new Set(validEpisodes)].sort((a,b) => parseInt(a) - parseInt(b))
        };

    } catch (err) {
        console.error(`[DirectHistory] Failed:`, err);
        logger.warn(`기록 전체 조회 실패(플래그 활성화됨): ${err.message}`, 'Network:History');
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
            // Strict filter clientside: filename must start with the exact episode number.
            // Because 'name contains 1' might also match '10', '11' or other text.
            const file = result.files.find(f => {
                const match = f.name.match(/^(\d+)/);
                return match && parseInt(match[1], 10) === parseInt(episodeNumStr, 10);
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

/***/ 419:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   T: function() { return /* binding */ detectSite; }
/* harmony export */ });
/* harmony import */ var _parsers_RuleManager_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(543);


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
    const matchedRule = await _parsers_RuleManager_js__WEBPACK_IMPORTED_MODULE_0__/* .RuleManager */ .u.matchRule(url);
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


/***/ }),

/***/ 443:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  b: function() { return /* binding */ GenericParser; }
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
     */
    constructor(protocolDomain, rule) {
        super(protocolDomain);
        this.rule = rule;
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

        const el = root.querySelector(selector);
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
                    const match = document.URL.match(regex);
                    if (match) return match[1] || match[0];
                } catch(e) {
                    console.warn('[GenericParser] Invalid idExtraction regex', e);
                }
            } else if (ext.source === 'query' && ext.param) {
                const params = new URLSearchParams(window.location.search);
                const val = params.get(ext.param);
                if (val) return val;
            } else if (ext.source === 'dom' && ext.selector) {
                const el = document.querySelector(ext.selector);
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
        const idMatch = document.URL.match(dynamicPattern);
        let seriesId = idMatch ? idMatch[2] : null;
        if (!seriesId) {
            const params = new URLSearchParams(window.location.search);
            seriesId = params.get('id') || params.get('no') || params.get('comic_id') || params.get('toon');
        }
        return seriesId || "0000";
    }

    async getListItems() {
        const listCfg = this.rule.list || {};
        let container = document.querySelector(listCfg.container);
        
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
        const numRaw = this._extractValue(el, listCfg.num) || "0";
        const subRaw = this._extractValue(el, listCfg.sub) || "";
        const title = this._extractValue(el, listCfg.title) || "Unknown";
        const src = this._extractValue(el, listCfg.link) || "";

        // Extract numbers only for zero padding, if possible
        let num = numRaw;
        const match = numRaw.match(/(\d+)/);
        if (match) {
            num = match[1].padStart(4, '0');
        } else {
            num = numRaw.padStart(4, '0');
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
        const thumb = this._extractValue(document, meta.thumb);
        return thumb ? this.getAbsoluteUrl(thumb) : null;
    }

    getSeriesTitle() {
        const meta = this.rule.meta || {};
        return this._extractValue(document, meta.title);
    }

    getSeriesMetadata() {
        const meta = this.rule.meta || {};
        return {
            author: this._extractValue(document, meta.author) || "",
            status: this._extractValue(document, meta.status) || "연재중",
            summary: this._extractValue(document, meta.summary) || ""
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
            episodeNum = match[1].padStart(4, '0');
        } else {
            episodeNum = episodeNum.padStart(4, '0');
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
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(989);




function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk_size = 0x8000; // 32KB
    for (let i = 0; i < bytes.length; i += chunk_size) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size));
    }
    return window.btoa(binary);
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
        _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().warn('Direct 업로드 실패 → GAS 릴레이 폴백: ' + directError.message + ' (' + fileName + ')', 'GAS:Upload');
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
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!config.gasUrl || !config.folderId) return;
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();
    console.log(`[Cache] 업로드 완료 → Drive 캐시 갱신 요청 (${folderName})`);
    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: config.gasUrl,
            data: JSON.stringify({
                type: 'view_update_cache',
                folderId: config.folderId,
                folderName,
                category,
                metadata, // [v1.7.0] Pass full metadata
                apiKey: config.apiKey,
                protocolVersion: 3,
            }),
            headers: { 'Content-Type': 'text/plain' },
            timeout: 30000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    console.log('[Cache] 갱신 요청 완료. 병합 파편 생성됨:', json.body);
                } catch (e) {
                    console.log('[Cache] 갱신 완료 응답 수신 (상세없음)');
                }
                resolve();
            },
            onerror: () => {
                logger.warn(`캐시 갱신 네트워크 오류 (${folderName}) — 다음 실행 시 자동 복구됨`, 'GAS:Cache');
                resolve();
            },
            ontimeout: () => {
                logger.warn(`캐시 갱신 타임아웃 30초 (${folderName}) — 스킬폭 포함 가능`, 'GAS:Cache');
                resolve();
            },
        });
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
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();
    
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
                        logger.critical(`GAS 릴레이 세션 초기화 실패: ${json.body || 'Init failed'} (${fileName})`, 'GAS:Relay');
                        reject(new Error(json.body || "Init failed"));
                    }
                } catch (e) { 
                    logger.critical(`GAS 서버 응답 파싱 실패 (Init): ${res.responseText?.substring(0, 80)}`, 'GAS:Relay');
                    reject(new Error("GAS 응답 오류(Init): " + res.responseText)); 
                }
            },
            onerror: (e) => {
                logger.critical(`GAS 릴레이 네트워크 오류 (Init) — ${fileName}`, 'GAS:Relay');
                reject(new Error("네트워크 오류(Init)"));
            },
            ontimeout: () => {
                logger.critical(`GAS 릴레이 세션 초기화 타임아웃 (30초) — ${fileName}`, 'GAS:Relay');
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
        const chunkBase64 = arrayBufferToBase64(chunkBuffer);
        const percentage = Math.floor((end / totalSize) * 100);
        
        console.log(`[GAS] 전송 중... ${percentage}% (${start} ~ ${end} / ${totalSize})`);

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
                            logger.critical(`GAS 청크 업로드 실패: ${json.body || 'Upload failed'} (${start}~${end})`, 'GAS:Relay');
                            reject(new Error(json.body || "Upload failed")); 
                        }
                    } catch (e) { 
                        logger.critical(`GAS 청크 응답 파싱 실패 (${start}~${end})`, 'GAS:Relay');
                        reject(new Error("GAS 응답 오류(Upload): " + res.responseText)); 
                    }
                },
                onerror: (e) => {
                    logger.critical(`GAS 청크 네트워크 오류 (${start}~${end} / ${totalSize})`, 'GAS:Relay');
                    reject(new Error("네트워크 오류(Upload)"));
                },
                ontimeout: () => {
                    logger.critical(`GAS 청크 타임아웃 5분 (${start}~${end} / ${totalSize})`, 'GAS:Relay');
                    reject(new Error(`[GAS] 청크 업로드 타임아웃 (5분): ${start}~${end}`));
                }
            });
        });
        
        start = end;
    }

    console.log(`[GAS] 업로드 완료!`);
}

/**
 * Fetch download history from GAS
 * @param {string} seriesTitle
 * @param {string} category 
 * @returns {Promise<string[]>} List of completed episode IDs
 */
async function fetchHistory(seriesTitle, category = 'Webtoon') {
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) return [];
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();

    console.log(`[GAS] 다운로드 기록 조회 중... (${seriesTitle})`);

    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: config.gasUrl,
            data: JSON.stringify({
                type: "check_history",
                folderId: config.folderId,
                folderName: seriesTitle,
                category: category,
                apiKey: config.apiKey,
                protocolVersion: 3
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 30000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        resolve(Array.isArray(json.body) ? json.body : []);
                    } else {
                        logger.warn(`다운로드 기록 조회 실패: ${json.body}`, 'GAS:History');
                        resolve([]);
                    }
                } catch (e) {
                    logger.warn(`다운로드 기록 응답 파싱 실패`, 'GAS:History');
                    resolve([]);
                }
            },
            onerror: () => {
                logger.warn(`다운로드 기록 조회 네트워크 오류`, 'GAS:History');
                resolve([]);
            },
            ontimeout: () => {
                logger.warn(`다운로드 기록 조회 타임아웃 (30초)`, 'GAS:History');
                resolve([]);
            }
        });
    });
}

/**
 * [v1.6.0] Fetch cached episode list directly using cacheFileId
 * @param {string} cacheFileId 
 * @returns {Promise<Array>} List of cached episodes
 */
async function getBooksByCacheId(cacheFileId) {
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) return [];
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();

    console.log(`[GAS] 캐시 파일 직행 조회 중... (${cacheFileId})`);

    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: config.gasUrl,
            data: JSON.stringify({
                type: "view_get_books_by_cache",
                folderId: config.folderId,
                cacheFileId: cacheFileId,
                apiKey: config.apiKey,
                protocolVersion: 3
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 10000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        resolve(Array.isArray(json.body) ? json.body : []);
                    } else {
                        logger.warn(`Fast Path 캐시 직행 조회 실패: ${json.body}`, 'GAS:FastPath');
                        resolve([]);
                    }
                } catch (e) {
                    logger.warn(`Fast Path 캐시 응답 파싱 실패`, 'GAS:FastPath');
                    resolve([]);
                }
            },
            onerror: () => {
                logger.warn(`Fast Path 캐시 네트워크 오류`, 'GAS:FastPath');
                resolve([]);
            },
            ontimeout: () => {
                logger.warn(`Fast Path 캐시 조회 타임아웃 (10초)`, 'GAS:FastPath');
                resolve([]);
            }
        });
    });
}

/**
 * [v1.6.0] Initialize an update upload session via GAS using fileId (Fast Path)
 * @param {string} fileId 
 * @param {string} fileName 
 */
async function initUpdateUploadViaGASRelay(fileId, fileName) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!(0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .isConfigValid */ .Jb)()) throw new Error("GAS 설정이 누락되었습니다.");

    console.log(`[GAS] 빠른 덮어쓰기(PUT) 세션 초기화 중... (${fileName} -> ${fileId})`);

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST", 
            url: config.gasUrl,
            data: JSON.stringify({ 
                type: "init_update", 
                folderId: config.folderId,
                fileId: fileId,
                fileName: fileName,
                apiKey: config.apiKey,
                protocolVersion: 3
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 30000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') { 
                        resolve((typeof json.body === 'object') ? json.body.uploadUrl : json.body);
                    } else {
                        _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().critical(`Fast Path PUT 세션 초기화 실패: ${json.body || 'Init Update failed'} (${fileName})`, 'GAS:FastPath');
                        reject(new Error(json.body || "Init Update failed"));
                    }
                } catch (e) { 
                    _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().critical(`Fast Path PUT 레스폰스 파싱 실패 (${fileName})`, 'GAS:FastPath');
                    reject(new Error("GAS 응답 오류(Init Update): " + res.responseText)); 
                }
            },
            onerror: (e) => {
                _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().critical(`Fast Path PUT 네트워크 오류 (${fileName})`, 'GAS:FastPath');
                reject(new Error("네트워크 오류(Init Update)"));
            },
            ontimeout: () => {
                _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance().critical(`Fast Path PUT 타임아웃 30초 (${fileName})`, 'GAS:FastPath');
                reject(new Error("[GAS] 덧쓰기 세션 초기화 타임아웃 (30초)"));
            }
        });
    });
}

/**
 * [v1.6.1] Fetch Series-specific Merge Index Fragment
 * Retrieves the temporary cacheFileId generated after recent uploads without needing a full master_index rebuild.
 * @param {string} sourceId The `12345` ID of the series
 * @returns {Promise<Object>} { found: boolean, data: { cacheFileId: string, ... } }
 */
async function getMergeIndexFragment(sourceId) {
    const config = (0,_config_js__WEBPACK_IMPORTED_MODULE_0__/* .getConfig */ .zj)();
    if (!config.gasUrl || !config.folderId) return { found: false, data: null };
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_2__.LogBox.getInstance();

    console.log(`[GAS] 병합 인덱스 파편 조회 중... (Source ID: ${sourceId})`);

    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: config.gasUrl,
            data: JSON.stringify({
                type: "view_get_merge_index",
                folderId: config.folderId,
                sourceId: sourceId,
                apiKey: config.apiKey,
                protocolVersion: 3
            }),
            headers: { "Content-Type": "text/plain" },
            timeout: 10000,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        resolve(json.body);
                    } else {
                        logger.warn(`MergeIndex 파편 조회 실패: ${json.body} (ID: ${sourceId})`, 'GAS:FastPath');
                        resolve({ found: false, data: null });
                    }
                } catch (e) {
                    logger.warn(`MergeIndex 파편 응답 파싱 실패`, 'GAS:FastPath');
                    resolve({ found: false, data: null });
                }
            },
            onerror: () => {
                logger.warn(`MergeIndex 파편 조회 네트워크 오류`, 'GAS:FastPath');
                resolve({ found: false, data: null });
            },
            ontimeout: () => {
                logger.warn(`MergeIndex 파편 조회 타임아웃 (10초)`, 'GAS:FastPath');
                resolve({ found: false, data: null });
            }
        });
    });
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
 * Manages parsing rules from built-in templates and user custom definitions.
 */
class RuleManager {
    // Built-in rules as fallback/templates
    static #builtInRules = [];

    /**
     * Get all merged rules: Custom > Built-in
     * @returns {Promise<Array>}
     */
    static async getRules() {
        let rules = [...this.#builtInRules];

        // 1. GM storage에서 Custom Rules(유일한 룰 저장소) 불러오기
        let customRules = [];
        let hasCustom = false;
        
        if (typeof GM_getValue !== 'undefined') {
            const customStr = GM_getValue(_config_js__WEBPACK_IMPORTED_MODULE_0__/* .CFG_CUSTOM_RULES */ .PT, "");
            if (customStr && customStr.trim() !== "" && customStr !== "[]") {
                try {
                    customRules = JSON.parse(customStr);
                    hasCustom = true;
                } catch (e) {
                    console.error('[RuleManager] Failed to parse custom rules:', e);
                }
            }
        }

        // 2. 만약 Custom Rules가 아예 없거나 빈 배열인 경우 (최초 구동 시) 원격에서 Seed 규칙 다운로드 및 이식
        if (!hasCustom || customRules.length === 0) {
            console.log("[RuleManager] 🚀 초기 구동 감지 -> 원격 기본 룰 파일로부터 Seed 규칙을 다운로드합니다.");
            const configUrl = typeof GM_getValue !== 'undefined' ? GM_getValue(_config_js__WEBPACK_IMPORTED_MODULE_0__/* .CFG_REMOTE_RULE_URL */ .rn, "") : "";
            const targetUrl = configUrl.trim() || "https://pray4skylark.github.io/tokiSync/rules.json";

            try {
                const fetched = await this.fetchRemoteRules(targetUrl);
                if (fetched && Array.isArray(fetched) && fetched.length > 0) {
                    customRules = fetched;
                    this.saveCustomRules(customRules);
                    console.log(`[RuleManager] ✅ 원격 기본 룰(${customRules.length}개)을 TOKI_CUSTOM_RULES에 초기 이식(Seed) 완료했습니다.`);
                }
            } catch (err) {
                console.error("[RuleManager] 원격 기본 룰 가져오기 실패:", err);
            }
        }

        // 3. 커스텀 룰을 병합하여 최종 반환 (Custom > Built-in 순)
        if (customRules.length > 0) {
            rules = [...customRules, ...rules];
        }

        return rules;
    }

    /**
     * Get only custom rules
     */
    static getCustomRules() {
        if (typeof GM_getValue === 'undefined') return [];
        const str = GM_getValue(_config_js__WEBPACK_IMPORTED_MODULE_0__/* .CFG_CUSTOM_RULES */ .PT, '[]');
        try {
            return JSON.parse(str) || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Save custom rules
     */
    static saveCustomRules(rules) {
        if (typeof GM_setValue === 'undefined') return;
        GM_setValue(_config_js__WEBPACK_IMPORTED_MODULE_0__/* .CFG_CUSTOM_RULES */ .PT, JSON.stringify(rules, null, 2));
    }

    /**
     * Add a new rule
     */
    static addRule(rule) {
        const rules = this.getCustomRules();
        if (rules.find(r => r.id === rule.id)) return false;
        rules.push(rule);
        this.saveCustomRules(rules);
        return true;
    }

    /**
     * Update an existing rule
     */
    static updateRule(id, updatedRule) {
        const rules = this.getCustomRules();
        const idx = rules.findIndex(r => r.id === id);
        if (idx === -1) return false;
        rules[idx] = updatedRule;
        this.saveCustomRules(rules);
        return true;
    }

    /**
     * Delete a rule
     */
    static deleteRule(id) {
        const rules = this.getCustomRules();
        const filtered = rules.filter(r => r.id !== id);
        this.saveCustomRules(filtered);
        return true;
    }

    /**
     * Bulk import rules
     */
    static bulkImport(newRules, mode = 'merge') {
        const current = this.getCustomRules();
        let imported = 0, updated = 0, skipped = 0;

        newRules.forEach(rule => {
            if (!rule.id) { skipped++; return; }
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

        this.saveCustomRules(current);
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

    /**
     * Fetch rules from remote URL
     */
    static async fetchRemoteRules(url) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest === 'undefined') {
                resolve(null);
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        let rules = data.rules || data;
                        if (Array.isArray(rules)) {
                            resolve(rules);
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        console.error('[RuleManager] Parse remote rules failed:', e);
                        resolve(null);
                    }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }
}


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
/**
 * tokiSync - Unified Worker Controller
 * Manages single popup lifecycle and IPC routing for sequential download mode.
 */








// Reference for the single worker popup (used in sequential mode)
let activeWorkerRef = null;

/**
 * Close active single worker popup window
 */
function closeActiveWorker() {
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
        cleanupIpc = (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .registerIpcListener */ .Q_)(async (msg) => {
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
                    (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .sendToWorker */ .eu)(activeWorkerRef, 'START_EXTRACTION', {
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
                if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.DOM_READY) stageText = '페이지 로딩';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.SCROLLING) stageText = '스크롤 스캔';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.PARSING) stageText = '미디어 파싱';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.DOWNLOADING) stageText = '다운로드';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.UPLOADING) stageText = '드라이브 저장';
                else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.COMPLETED) stageText = '완료';

                _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
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
async function fetchNovelText(episodeUrl, config = {}) {
    console.log('[WorkerController] 소설 수집 개시 (Plan B — 자립형 팝업)');
    const success = await fetchMediaViaWorker(episodeUrl, 'novel', config);

    if (success) return true; // Success (Worker already saved it!)

    // Plan C Fallback: Local API Decryption (if decryptApi configuration exists)
    if (config.decryptApi || config.endpoint) {
        console.warn('[WorkerController] Plan B 실패 ➡️ Plan C(API 복호화) 로컬 폴백 시도');
        const content = await (0,_novel_decryptor_js__WEBPACK_IMPORTED_MODULE_0__/* .fetchNovelTextViaApi */ .i)(episodeUrl, config.decryptApi || config);
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
async function fetchComicImages(episodeUrl, config = {}) {
    console.log('[WorkerController] 만화 이미지 수집 개시 (Plan B — 자립형 팝업)');
    return await fetchMediaViaWorker(episodeUrl, 'comic', config);
}

/**
 * 🚦 배치/드라이브 전용 자율 분산형 멀티 워커 제어 엔진 (v1.21.0)
 * 여러 개의 자식 팝업 창으로부터 오는 IPC 이벤트를 독립적으로 라우팅하여 멀티태스킹 수행
 */
function initBatchWorkerController() {
    if (window.tokisync_batch_controller_initialized) return;
    window.tokisync_batch_controller_initialized = true;

    console.log('[WorkerController] 🚦 [배치 모드] 백그라운드 영속성 IPC 라우터 활성화 완료');

    // 정기적인 자식 팝업 닫힘 실시간 감시 (Batch Liveness Guard)
    const batchClosedCounts = new Map();
    setInterval(() => {
        const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
        for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
            const actualRef = popupRef && (popupRef.ref || popupRef);
            if (actualRef && actualRef.closed) {
                const closedCount = (batchClosedCounts.get(id) || 0) + 1;
                batchClosedCounts.set(id, closedCount);

                if (closedCount >= 5) {
                    console.warn(`[WorkerController] ⚠️ [배치] 자식 팝업 수동 종료 확정: ${id}`);
                    _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(id);
                    batchClosedCounts.delete(id);

                    const item = queue.find(i => i.id === id);
                    if (item && item.status === 'processing') {
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

    (0,_ipc_broker_js__WEBPACK_IMPORTED_MODULE_1__/* .registerIpcListener */ .Q_)(async (msg) => {
        const { type, payload, sourceEvent } = msg;
        if (!sourceEvent || !sourceEvent.source) return;

        // 1. WORKER_READY: 자식 워커 핸드셰이킹 수신
        if (type === 'WORKER_READY') {
            const { targetUrl } = payload || {};
            let matchedId = null;

            // 1차: activeWorkers의 window 참조 비교
            for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                if (popupRef === sourceEvent.source) {
                    matchedId = id;
                    break;
                }
            }

            // 2차: URL 기반 매칭 폴백 (리다이렉션으로 주소가 완전히 틀어졌을 때 복구)
            if (!matchedId && targetUrl) {
                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const matchedItem = queue.find(item => 
                    (item.status === 'pending' || item.status === 'processing') && 
                    item.episodeUrl === targetUrl
                );
                if (matchedItem) {
                    matchedId = matchedItem.id;
                    // 최신 Window 참조로 activeWorkers 즉시 복원 갱신
                    _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.set(matchedId, sourceEvent.source);
                    console.log(`[WorkerController] ♻️ URL 매칭 성공 ➡️ Window 참조 복원 갱신 (ID: ${matchedId})`);
                }
            }

            if (matchedId) {
                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const item = queue.find(i => i.id === matchedId);
                
                if (item) {
                    console.log(`[WorkerController] 📢 [배치] READY 수신 (ID: ${matchedId}) ➡️ START_EXTRACTION 주입`);
                    
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
                        scanSpeedMultiplier: (0,_config_js__WEBPACK_IMPORTED_MODULE_4__/* .getConfig */ .zj)().scanSpeed / 750,
                        localNameTemplate: (0,_config_js__WEBPACK_IMPORTED_MODULE_4__/* .getConfig */ .zj)().localNameTemplate || "{number} - {title}",
                        localEpisodePadding: (0,_config_js__WEBPACK_IMPORTED_MODULE_4__/* .getConfig */ .zj)().localEpisodePadding || "4"
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
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                    if (popupRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.warn(`[WorkerController] ⚠️ [배치] WAF 캡차 차단막 감지 (ID: ${matchedId})`);
                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
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
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                    if (popupRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, { progressPercent: percent, stage: stage });
                    
                    let stageText = '대기 중';
                    if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.DOM_READY) stageText = '페이지 로딩';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.SCROLLING) stageText = '스크롤 스캔';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.PARSING) stageText = '미디어 파싱';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.DOWNLOADING) stageText = '다운로드';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.UPLOADING) stageText = '드라이브 저장';
                    else if (stage === _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.COMPLETED) stageText = '완료';

                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.LOG, {
                        msg: `[수집 진행] [${item.episodeTitle}] -> ${stageText} (${Math.round(percent)}%)`,
                        tag: 'Downloader',
                        level: 'info'
                    });
                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.UPDATE_PROGRESS);
                }
            }
        }

        // 4. TASK_COMPLETED: 자식 워커 수집 및 드라이브 저장 정상 완료
        if (type === 'TASK_COMPLETED') {
            const { queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                    if (popupRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.log(`[WorkerController] 🎉 [배치] 수집 완료 (ID: ${matchedId})`);
                
                const popupRef = _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.get(matchedId);
                if (popupRef && !popupRef.closed) {
                    // [최종 패치] 대기열에 pending 상태의 작업이 남아 있으면 창을 닫지 않고 릴레이용 보존!
                    const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                    const pendingExists = queue.some(i => i.status === 'pending');
                    if (!pendingExists) {
                        popupRef.close();
                        _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(matchedId);
                    }
                } else {
                    _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(matchedId);
                }
                
                (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, { status: 'completed', progressPercent: 100, stage: _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .WORKER_STAGE */ .WB.COMPLETED });
                _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.UPDATE_PROGRESS);

                // [배치 최종 갱신] 전 대기열 수집 완료 시 원격 드라이브 캐시 최종 갱신 수행
                const currentQueue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const hasActive = currentQueue.some(i => i.status === 'pending' || i.status === 'processing');
                if (!hasActive) {
                    const completedItem = currentQueue.find(i => i.id === matchedId);
                    if (completedItem && completedItem.destination === 'drive') {
                        console.log(`[WorkerController] ☁️ 전 대기열 수집 완료 -> 드라이브 캐시 갱신 시작: ${completedItem.rootFolder}`);
                        (0,_gas_js__WEBPACK_IMPORTED_MODULE_5__/* .refreshCacheAfterUpload */ .jz)(
                            completedItem.rootFolder,
                            completedItem.category,
                            completedItem.seriesMetadata || {}
                        ).catch(e =>
                            console.warn(`[WorkerController] 캐시 갱신 실패: ${e.message}`)
                        );
                    }
                }

                // 다음 대기 항목 릴레이 스케줄링
                (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .runSchedulerOnce */ .gi)();
            }
        }

        // 5. TASK_FAILED: 예외 및 복구 불능 실패 보고
        if (type === 'TASK_FAILED') {
            const { errorMsg, queueId } = payload || {};
            let matchedId = queueId;

            if (!matchedId) {
                for (const [id, popupRef] of _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.entries()) {
                    if (popupRef === sourceEvent.source) { matchedId = id; break; }
                }
            }

            if (matchedId) {
                console.error(`[WorkerController] ❌ [배치] 수집 실패 (ID: ${matchedId}): ${errorMsg}`);
                
                const popupRef = _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.get(matchedId);
                if (popupRef && !popupRef.closed) {
                    // [최종 패치] 대기열에 남은 작업이 없으면 닫고, 있으면 릴레이용으로 킵!
                    const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                    const pendingExists = queue.some(i => i.status === 'pending');
                    if (!pendingExists) {
                        popupRef.close();
                        _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(matchedId);
                    }
                } else {
                    _queue_js__WEBPACK_IMPORTED_MODULE_2__/* .activeWorkers */ .mR.delete(matchedId);
                }

                const queue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const item = queue.find(i => i.id === matchedId);
                if (item) {
                    const nextRetry = (item.retryCount || 0) + 1;
                    (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .updateQueueItem */ .Gg)(matchedId, {
                        status: nextRetry >= 3 ? 'failed' : 'pending',
                        retryCount: nextRetry,
                        errorMsg: errorMsg || '자식 워커가 에러를 보고함'
                    });
                    _EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EventBus */ .l.emit(_EventBus_js__WEBPACK_IMPORTED_MODULE_3__/* .EVT */ .c.UPDATE_PROGRESS);
                }

                // [배치 최종 갱신] 실패 상황이더라도 전 대기열 수집이 완전히 종료되면 캐시 갱신 수행
                const currentQueue = (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .getQueue */ .IS)();
                const hasActive = currentQueue.some(i => i.status === 'pending' || i.status === 'processing');
                if (!hasActive) {
                    const failedItem = currentQueue.find(i => i.id === matchedId);
                    if (failedItem && failedItem.destination === 'drive') {
                        console.log(`[WorkerController] ☁️ 전 대기열 수집 종료(실패 포함) -> 드라이브 캐시 갱신 시작: ${failedItem.rootFolder}`);
                        (0,_gas_js__WEBPACK_IMPORTED_MODULE_5__/* .refreshCacheAfterUpload */ .jz)(
                            failedItem.rootFolder,
                            failedItem.category,
                            failedItem.seriesMetadata || {}
                        ).catch(e =>
                            console.warn(`[WorkerController] 캐시 갱신 실패: ${e.message}`)
                        );
                    }
                }

                // 다음 대기 항목 릴레이 스케줄링
                (0,_queue_js__WEBPACK_IMPORTED_MODULE_2__/* .runSchedulerOnce */ .gi)();
            }
        }
    });
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

/***/ 899:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Jb: function() { return /* binding */ isConfigValid; },
/* harmony export */   Nk: function() { return /* binding */ setConfig; },
/* harmony export */   PT: function() { return /* binding */ CFG_CUSTOM_RULES; },
/* harmony export */   rn: function() { return /* binding */ CFG_REMOTE_RULE_URL; },
/* harmony export */   zj: function() { return /* binding */ getConfig; }
/* harmony export */ });
/* unused harmony exports CFG_URL_KEY, CFG_ID_KEY, CFG_FOLDER_ID, CFG_POLICY_KEY, CFG_API_KEY, CFG_SLEEP_MODE, CFG_SMART_SKIP_RATIO, CFG_NOVEL_MODE, CFG_NOVEL_FORMAT, CFG_SCAN_SPEED, CFG_LOCAL_NAME_TEMPLATE, CFG_LOCAL_EPISODE_PADDING */
const CFG_URL_KEY = "TOKI_GAS_URL"; // legacy
const CFG_ID_KEY = "TOKI_GAS_ID";
const CFG_FOLDER_ID = "TOKI_FOLDER_ID";
const CFG_POLICY_KEY = "TOKI_DOWNLOAD_POLICY";
const CFG_API_KEY = "TOKI_API_KEY";
const CFG_SLEEP_MODE = "TOKI_SLEEP_MODE";
const CFG_SMART_SKIP_RATIO = "TOKI_SMART_SKIP_RATIO";
const CFG_NOVEL_MODE = "TOKI_NOVEL_MODE";
const CFG_NOVEL_FORMAT = "TOKI_NOVEL_FORMAT";
const CFG_REMOTE_RULE_URL = "TOKI_REMOTE_RULE_URL";
const CFG_CUSTOM_RULES = "TOKI_CUSTOM_RULES";
const CFG_SCAN_SPEED = "TOKI_SCAN_SPEED";
const CFG_LOCAL_NAME_TEMPLATE = "TOKI_LOCAL_NAME_TEMPLATE";
const CFG_LOCAL_EPISODE_PADDING = "TOKI_LOCAL_EPISODE_PADDING";

/**
 * Get current configuration
 * @returns {{gasId: string, gasUrl: string, folderId: string, policy: string, apiKey: string, sleepMode: string, smartSkipRatio: number}}
 */
function getConfig() {
    let gasId = GM_getValue(CFG_ID_KEY, "");
    let gasUrl = GM_getValue(CFG_URL_KEY, "");

    // Auto-migration: gasUrl -> gasId
    if (!gasId && gasUrl) {
        const match = gasUrl.match(/\/s\/([^\/]+)\/exec/);
        if (match) {
            gasId = match[1];
            GM_setValue(CFG_ID_KEY, gasId);
            console.log("✅ [Config] Auto-migrated GAS URL to ID:", gasId);
        }
    }

    const finalGasId = gasId;
    // URL fallback for legacy or reconstructed from ID
    const finalGasUrl = finalGasId 
        ? `https://script.google.com/macros/s/${finalGasId}/exec` 
        : gasUrl;

    let remoteRuleUrl = GM_getValue(CFG_REMOTE_RULE_URL, "");
    if (!remoteRuleUrl || remoteRuleUrl.trim() === "") {
        remoteRuleUrl = "https://pray4skylark.github.io/tokiSync/rules.json";
    }

    return {
        gasId: finalGasId,
        gasUrl: finalGasUrl,
        folderId: GM_getValue(CFG_FOLDER_ID, ""),
        policy: GM_getValue(CFG_POLICY_KEY, "folderInCbz"),
        apiKey: GM_getValue(CFG_API_KEY, ""),
        sleepMode: GM_getValue(CFG_SLEEP_MODE, "agile"), // default: agile
        smartSkipRatio: parseInt(GM_getValue(CFG_SMART_SKIP_RATIO, "50"), 10), // default 50% of Max
        novelMode: GM_getValue(CFG_NOVEL_MODE, "perChapter"), // default: chapter-by-chapter
        novelFormat: GM_getValue(CFG_NOVEL_FORMAT, "epub"), // default: EPUB
        remoteRuleUrl: remoteRuleUrl,
        customRules: GM_getValue(CFG_CUSTOM_RULES, "[]"),
        scanSpeed: (() => {
            let val = parseFloat(GM_getValue(CFG_SCAN_SPEED, "1000"));
            if (isNaN(val)) val = 1000;
            // 하위 호환성: 기존의 배속 배율 값(예: 0.5 ~ 5.0)이 저장되어 있는 경우 밀리세컨드 단위로 자동 변환
            if (val <= 10) {
                val = val * 1000; // 1.0배속 -> 1000ms, 3.0배속 -> 3000ms 등
            }
            return Math.round(val);
        })(),
        localNameTemplate: GM_getValue(CFG_LOCAL_NAME_TEMPLATE, "{number} - {title}"),
        localEpisodePadding: GM_getValue(CFG_LOCAL_EPISODE_PADDING, "4")
    };
}

/**
 * Set configuration value
 * @param {string} key 
 * @param {string} value 
 */
function setConfig(key, value) {
    GM_setValue(key, value);
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
/* harmony export */   UF: function() { return /* binding */ waitForContent; },
/* harmony export */   Vs: function() { return /* binding */ scrollToLoad; },
/* harmony export */   _L: function() { return /* binding */ blobToArrayBuffer; },
/* harmony export */   iL: function() { return /* binding */ getCommonPrefix; },
/* harmony export */   yy: function() { return /* binding */ sleep; }
/* harmony export */ });
/* unused harmony exports waitIframeLoad, pauseForCaptcha, getImageDimensions */
/* harmony import */ var _gas_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(488);
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(989);



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
                _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().log(`[DOM Poll] ${type} 콘텐츠 감지 (유효 이미지: ${validImages.length}개, ${(i + 1) * POLL_INTERVAL}ms)`, 'DOM:Poll');
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
    _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance().warn(`DOM 폴링 타임아웃 ${maxWaitMs}ms — 콘텐츠 미감지, 멈춰서 물 평가`, 'DOM:Poll');
}

async function scrollToLoad(iframeDoc, stallTimeoutMs = 20000, viewerCfg = {}, multiplier = 1.0) {
    const win = iframeDoc.defaultView || iframeDoc.parentWindow;
    if (!win) return;

    const isHidden = document.visibilityState === 'hidden';
    const behavior = isHidden ? 'auto' : 'smooth';
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();

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
        URL.revokeObjectURL(link.href);
        link.remove();
        console.log(`[Local] 완료`);
    } else if (type === 'native') {
        // [v1.6.0] GM_download with subfolder support
        const folderName = metadata.folderName || "TokiSync";
        // Final Path: "TokiSync/SeriesTitle/Filename.zip"
        const finalPath = `TokiSync/${folderName}/${fullFileName}`.replace(/[<>:"|?*]/g, '_'); // Sanitization for safety

        console.log(`[Native] 자동 분류 다운로드 시도... (${finalPath})`);
        const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();

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
        const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();
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
            // Optional: Notify on error only if it's critical, but for individual files, log is better.
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

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   d: function() { return /* binding */ extractEpisodeData; }
/* harmony export */ });
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(924);
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(989);
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
    const logger = _ui_js__WEBPACK_IMPORTED_MODULE_1__.LogBox.getInstance();
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
            logger.log('[Extractor] DOM 추출 실패 - API 복호화 폴백 시도...', 'Extractor');
            extractedData.content = await (0,_worker_controller_js__WEBPACK_IMPORTED_MODULE_2__/* .fetchNovelText */ .UT)(episodeUrl, viewerCfg.decryptApi);
            if (extractedData.content) {
                logger.log('✅ API 복호화 폴백 성공', 'Extractor');
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

        logger.log(`[Extractor] 이미지 ${mergedUrls.length}개 감지`, 'Extractor');

        // 이미지 감지 0개 시 1.5초 대기 후 재시도
        if (mergedUrls.length === 0 && !isStaticDoc) {
            logger.warn('[Extractor] 이미지 0개 — 1.5초 후 재파싱 시도', 'Extractor');
            await (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__/* .sleep */ .yy)(1500);
            const retryUrls = parser.getImageList(targetDoc);
            if (retryUrls.length > 0) mergedUrls.push(...retryUrls.map(u => u.url).filter(u => u !== ""));
            logger.log(`[Extractor] 재파싱 결과: ${mergedUrls.length}개`, 'Extractor');
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
/* harmony export */   eu: function() { return /* binding */ sendToWorker; }
/* harmony export */ });
/**
 * tokiSync - Unified IPC Broker
 * Handles clean postMessage communication between Parent (Controller) and Child (Worker).
 */

const MSG_PREFIX = 'TOKI_';

/**
 * Send message from Parent to Worker popup
 * @param {Window} workerRef Reference to the worker popup window
 * @param {string} type Message type (without prefix, e.g. 'START_EXTRACTION')
 * @param {Object} payload Metadata and payload
 */
function sendToWorker(workerRef, type, payload = {}) {
    if (!workerRef || workerRef.closed) {
        console.warn(`[IPC:Broker] Cannot send to worker: Popup window is closed or invalid.`);
        return false;
    }
    const message = {
        type: type.startsWith(MSG_PREFIX) ? type : `${MSG_PREFIX}${type}`,
        payload: payload,
        timestamp: Date.now()
    };
    try {
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
 */
function sendToParent(type, payload = {}) {
    if (!window.opener || window.opener.closed) {
        console.warn(`[IPC:Broker] Cannot send to parent: Opener window is closed or unavailable.`);
        return false;
    }
    const message = {
        type: type.startsWith(MSG_PREFIX) ? type : `${MSG_PREFIX}${type}`,
        payload: payload,
        timestamp: Date.now()
    };
    try {
        window.opener.postMessage(message, '*');
        return true;
    } catch (err) {
        console.error(`[IPC:Broker] postMessage to parent failed:`, err);
        return false;
    }
}

/**
 * Register postMessage Listener with validation
 * @param {Function} callback Handler function (eventData) => {}
 * @returns {Function} Cleanup function to remove event listener
 */
function registerIpcListener(callback) {
    const handler = (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        
        const { type, payload, timestamp } = event.data;
        if (!type || !type.startsWith(MSG_PREFIX)) return;

        // Strip prefix for uniform routing inside callback
        const normalizedType = type.substring(MSG_PREFIX.length);
        
        callback({
            type: normalizedType,
            payload: payload || {},
            timestamp: timestamp,
            sourceEvent: event
        });
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
}


/***/ }),

/***/ 969:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   O: function() { return /* binding */ ParserFactory; }
/* harmony export */ });
/* harmony import */ var _GenericParser_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(443);
/* harmony import */ var _detector_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(419);



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

        const siteInfo = await (0,_detector_js__WEBPACK_IMPORTED_MODULE_1__/* .detectSite */ .T)();
        if (!siteInfo) {
            console.error('[ParserFactory] Failed to detect site');
            alert("TokiSync 파서 에러: 매칭되는 파싱 룰이 없습니다.\n\n해당 사이트를 지원하려면 설정에서 커스텀 파싱 룰(JSON)을 등록해야 합니다.\n(자세한 방법은 Github의 rules.sample.json을 참조하세요)");
            return null;
        }

        const { site, protocolDomain, matchedRule } = siteInfo;

        // Dynamic Generic Parser
        if (site === 'generic' && matchedRule) {
            this.#instance = new _GenericParser_js__WEBPACK_IMPORTED_MODULE_0__/* .GenericParser */ .b(protocolDomain, matchedRule);
            return this.#instance;
        }

        return null;
    }
}


/***/ }),

/***/ 989:
/***/ (function(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  LogBox: function() { return /* binding */ LogBox; },
  fo: function() { return /* binding */ MenuModal; },
  ze: function() { return /* binding */ Notifier; },
  hV: function() { return /* binding */ markDownloadedItems; }
});

// UNUSED EXPORTS: FormRuleEditor, TreeRuleEditor

// EXTERNAL MODULE: ./src/core/EventBus.js
var EventBus = __webpack_require__(31);
// EXTERNAL MODULE: ./src/core/parsers/ParserFactory.js
var ParserFactory = __webpack_require__(969);
// EXTERNAL MODULE: ./src/core/parsers/RuleManager.js
var RuleManager = __webpack_require__(543);
// EXTERNAL MODULE: ./src/core/parsers/GenericParser.js + 1 modules
var GenericParser = __webpack_require__(443);
// EXTERNAL MODULE: ./src/core/extractor.js
var extractor = __webpack_require__(929);
;// ./src/core/ui.css
var ui_namespaceObject = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');\n\n:root {\n    --toki-primary: #2563eb;\n    --toki-primary-dark: #1d4ed8;\n    --toki-accent: #facc15;\n    --toki-bg: rgba(248, 250, 252, 0.9);\n    --toki-text: #1e293b;\n    --toki-text-muted: #64748b;\n    --toki-border: rgba(255, 255, 255, 0.6);\n    --toki-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);\n    --toki-font: 'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;\n}\n\n/* LogBox Styles */\n#toki-logbox {\n    position: fixed;\n    bottom: 100px;\n    right: 30px;\n    width: 480px;\n    height: auto;\n    min-height: 250px;\n    max-height: 500px;\n    background: var(--toki-bg);\n    color: var(--toki-text);\n    font-family: 'Cascadia Code', Consolas, monospace;\n    font-size: 12px;\n    border: 1px solid var(--toki-border);\n    border-radius: 16px;\n    z-index: 9999;\n    display: none;\n    flex-direction: column;\n    box-shadow: var(--toki-shadow);\n    backdrop-filter: blur(20px);\n    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n}\n\n#toki-logbox-header {\n    padding: 12px 16px;\n    background: rgba(255, 255, 255, 0.4);\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    border-top-left-radius: 16px;\n    border-top-right-radius: 16px;\n    cursor: move;\n}\n\n#toki-logbox-title {\n    font-weight: 700;\n    font-size: 13px;\n    letter-spacing: -0.01em;\n}\n\n#toki-logbox-controls span {\n    cursor: pointer;\n    margin-left: 12px;\n    color: var(--toki-text-muted);\n    font-size: 14px;\n    transition: transform 0.2s, color 0.2s;\n    display: inline-block;\n}\n\n#toki-logbox-controls span:hover {\n    color: var(--toki-primary);\n    transform: scale(1.15);\n}\n\n#toki-logbox-content {\n    flex: 1;\n    overflow-y: auto;\n    padding: 12px;\n    margin: 0;\n    list-style: none;\n}\n\n#toki-logbox-content li {\n    margin-bottom: 4px;\n    word-break: break-all;\n    padding: 4px 8px;\n    border-radius: 6px;\n    line-height: 1.4;\n    color: #f1f5f9; /* 밝은 회백색 지정으로 가독성 극대화 */\n}\n\n#toki-logbox-content li.critical {\n    color: #be123c;\n    font-weight: 700;\n    background: rgba(225, 29, 72, 0.1);\n    border-left: 3px solid #e11d48;\n}\n\n#toki-logbox-content li.error { color: #e11d48; }\n#toki-logbox-content li.warn { color: #d97706; }\n#toki-logbox-content li.success { color: #059669; font-weight: 600; }\n#toki-logbox-content li.info { color: #38bdf8; font-weight: 500; }\n\n/* Modal Styles */\n.toki-modal-overlay {\n    position: fixed;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n    background: rgba(15, 23, 42, 0.2);\n    backdrop-filter: blur(12px);\n    z-index: 9999;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    opacity: 0;\n    animation: tokiFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;\n}\n\n.toki-modal {\n    width: 520px;\n    max-width: 95%;\n    background: var(--toki-bg);\n    border: 1px solid var(--toki-border);\n    border-radius: 28px;\n    box-shadow: var(--toki-shadow);\n    overflow: hidden;\n    display: flex;\n    flex-direction: column;\n    transform: translateY(30px) scale(0.95);\n    animation: tokiSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;\n    backdrop-filter: blur(30px);\n    color: var(--toki-text);\n    font-family: var(--toki-font);\n}\n\n.toki-modal-header {\n    padding: 24px 32px;\n    background: rgba(255, 255, 255, 0.4);\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n.toki-modal-title {\n    font-size: 24px;\n    font-weight: 800;\n    color: #0f172a;\n    display: flex;\n    align-items: center;\n    gap: 12px;\n    letter-spacing: -0.03em;\n}\n\n.toki-modal-close {\n    background: rgba(0, 0, 0, 0.05);\n    border: none;\n    color: var(--toki-text-muted);\n    width: 36px;\n    height: 36px;\n    border-radius: 50%;\n    cursor: pointer;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n    font-size: 20px;\n}\n\n.toki-modal-close:hover {\n    background: #ef4444;\n    color: #fff;\n    transform: rotate(90deg);\n}\n\n.toki-btn-ghost {\n    background: rgba(0, 0, 0, 0.05);\n    border: none;\n    color: var(--toki-text-muted);\n    padding: 6px 14px;\n    border-radius: 12px;\n    cursor: pointer;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    transition: all 0.2s;\n    font-size: 13px;\n    font-weight: 600;\n    gap: 6px;\n}\n\n.toki-btn-ghost:hover {\n    background: rgba(0, 0, 0, 0.08);\n    color: var(--toki-text);\n}\n\n/* Tabs */\n.toki-tabs {\n    display: flex;\n    background: rgba(255, 255, 255, 0.3);\n    padding: 8px;\n    gap: 6px;\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n}\n\n.toki-tab-btn {\n    flex: 1;\n    padding: 12px;\n    background: none;\n    border: none;\n    color: var(--toki-text-muted);\n    font-size: 14px;\n    font-weight: 700;\n    cursor: pointer;\n    transition: all 0.3s;\n    border-radius: 14px;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    gap: 8px;\n}\n\n.toki-tab-btn:hover {\n    color: var(--toki-text);\n    background: rgba(255, 255, 255, 0.6);\n}\n\n.toki-tab-btn.active {\n    background: #fff;\n    color: var(--toki-primary);\n    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);\n}\n\n.toki-tab-content {\n    display: none;\n    padding: 32px;\n    animation: tokiTabFadeIn 0.4s ease-out;\n}\n\n.toki-tab-content.active { display: block; }\n\n/* Components */\n.toki-section-title {\n    font-size: 11px;\n    font-weight: 800;\n    color: var(--toki-primary);\n    text-transform: uppercase;\n    letter-spacing: 0.1em;\n    margin: 24px 0 12px 4px;\n    opacity: 0.8;\n}\n\n.toki-control-group {\n    margin-bottom: 20px;\n    position: relative;\n}\n\n.toki-label {\n    display: block;\n    font-size: 13px;\n    font-weight: 700;\n    color: var(--toki-text-muted);\n    margin-bottom: 8px;\n    margin-left: 4px;\n}\n\n.toki-input, .toki-select, .toki-textarea {\n    width: 100%;\n    padding: 14px 18px;\n    background: rgba(255, 255, 255, 0.8);\n    border: 1px solid rgba(0, 0, 0, 0.08);\n    border-radius: 16px;\n    color: var(--toki-text) !important;\n    font-size: 15px;\n    font-weight: 600;\n    appearance: none;\n    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);\n    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);\n}\n\n.toki-input:hover, .toki-select:hover, .toki-textarea:hover {\n    border-color: var(--toki-primary);\n    background-color: #fff;\n    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);\n}\n\n.toki-input:focus, .toki-select:focus, .toki-textarea:focus {\n    outline: none;\n    border-color: var(--toki-primary);\n    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);\n    background-color: #fff;\n}\n\n.toki-textarea {\n    resize: vertical;\n    line-height: 1.5;\n}\n\n.toki-select {\n    cursor: pointer;\n    background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\");\n    background-repeat: no-repeat;\n    background-position: right 16px center;\n    background-size: 16px;\n}\n\n.toki-btn-action {\n    width: 100%;\n    height: 56px;\n    background: var(--toki-primary);\n    color: #fff !important;\n    border: none;\n    border-radius: 18px;\n    font-size: 16px;\n    font-weight: 700;\n    cursor: pointer;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 12px;\n    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n    box-shadow: 0 8px 15px rgba(37, 99, 235, 0.2);\n}\n\n.toki-btn-action:hover {\n    transform: translateY(-3px);\n    box-shadow: 0 12px 20px rgba(37, 99, 235, 0.35);\n    filter: brightness(1.05);\n}\n\n.toki-btn-secondary {\n    background: rgba(255, 255, 255, 0.8);\n    color: #475569 !important;\n    border: 1px solid rgba(0, 0, 0, 0.05);\n    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);\n}\n\n.toki-btn-secondary:hover {\n    background: #fff;\n    color: var(--toki-text) !important;\n}\n\n/* Status & Indicators */\n.toki-status-dot {\n    width: 8px;\n    height: 8px;\n    border-radius: 50%;\n    display: inline-block;\n    margin-right: 6px;\n}\n\n.toki-status-online {\n    background: #10b981;\n    box-shadow: 0 0 8px #10b981;\n}\n\n.toki-downloaded {\n    background: rgba(16, 185, 129, 0.08) !important;\n    border-left: 4px solid #10b981 !important;\n    opacity: 0.75;\n    transition: all 0.3s ease;\n}\n\n.toki-downloaded:hover {\n    opacity: 1;\n    background: rgba(16, 185, 129, 0.15) !important;\n}\n\n/* FAB */\n.toki-fab {\n    position: fixed;\n    bottom: 30px;\n    right: 30px;\n    width: 64px;\n    height: 64px;\n    background: linear-gradient(135deg, #2563eb, #0ea5e9);\n    border-radius: 20px;\n    box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4);\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    cursor: pointer;\n    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n    z-index: 9998;\n}\n\n.toki-fab:hover {\n    transform: translateY(-5px) rotate(5deg);\n    box-shadow: 0 20px 25px -5px rgba(37, 99, 235, 0.5);\n}\n\n.toki-fab svg {\n    width: 28px;\n    height: 28px;\n    fill: #fff;\n}\n\n/* Tree Editor */\n.toki-tree-modal {\n    width: 1100px !important;\n    height: 85vh !important;\n}\n\n.toki-tree-container {\n    display: flex;\n    flex: 1;\n    overflow: hidden;\n    gap: 24px;\n    padding: 24px;\n    background: rgba(255, 255, 255, 0.2);\n}\n\n.toki-tree-view {\n    flex: 1.5;\n    overflow-y: auto;\n    background: rgba(255, 255, 255, 0.5);\n    border-radius: 16px;\n    padding: 20px;\n    border: 1px solid rgba(0, 0, 0, 0.05);\n    font-family: monospace;\n    font-size: 13px;\n}\n\n.toki-tree-node {\n    margin-left: 20px;\n    position: relative;\n    border-left: 1px dashed rgba(0, 0, 0, 0.1);\n    padding-left: 12px;\n}\n\n.toki-tree-item {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    padding: 6px 10px;\n    border-radius: 8px;\n    transition: all 0.2s;\n}\n\n.toki-tree-item:hover {\n    background: rgba(37, 99, 235, 0.05);\n}\n\n.toki-tree-key {\n    color: #2563eb;\n    font-weight: 700;\n    cursor: pointer;\n    min-width: 90px;\n}\n\n.toki-tree-val {\n    color: #1e293b;\n    background: transparent;\n    border: none;\n    border-bottom: 1px solid transparent;\n    width: 100%;\n}\n\n.toki-tree-val:focus {\n    border-bottom-color: #2563eb;\n    outline: none;\n    background: rgba(37, 99, 235, 0.05);\n}\n\n.toki-tree-toggle {\n    cursor: pointer;\n    user-select: none;\n    width: 18px;\n    text-align: center;\n    color: #94a3b8;\n    font-weight: 700;\n}\n\n.toki-tree-toggle:hover {\n    color: var(--toki-primary);\n}\n\n.toki-tree-right-panel {\n    flex: 1;\n    display: flex;\n    flex-direction: column;\n    gap: 20px;\n    background: rgba(255, 255, 255, 0.4);\n    padding: 20px;\n    border-radius: 16px;\n}\n\n.toki-tree-json-preview {\n    flex: 1;\n    background: #0f172a;\n    color: #e2e8f0;\n    padding: 20px;\n    border-radius: 16px;\n    font-size: 12px;\n    font-family: monospace;\n    border: 1px solid rgba(255, 255, 255, 0.1);\n    resize: none;\n}\n\n.toki-btn-rule {\n    background: transparent;\n    border: 1px solid #ddd;\n    padding: 6px 12px;\n    border-radius: 8px;\n    font-size: 12px;\n    cursor: pointer;\n    transition: all 0.2s;\n}\n\n.toki-btn-rule:hover {\n    background: #f8fafc;\n    border-color: #94a3b8;\n}\n\n/* Animations */\n@keyframes tokiFadeIn {\n    from { opacity: 0; }\n    to { opacity: 1; }\n}\n\n@keyframes tokiTabFadeIn {\n    from { opacity: 0; transform: translateX(10px); }\n    to { opacity: 1; transform: translateX(0); }\n}\n\n@keyframes tokiSlideUp {\n    from { opacity: 0; transform: translateY(30px) scale(0.95); }\n    to { opacity: 1; transform: translateY(0) scale(1); }\n}\n\n/* --- Structural Layouts for Inline Replacement --- */\n\n/* Horizontal Button Row (e.g., Download buttons) */\n.toki-btn-group-row {\n    display: flex;\n    gap: 12px;\n    align-items: center;\n}\n.toki-btn-group-row .toki-btn-action {\n    height: 52px;\n    flex: 1;\n}\n.toki-btn-group-row .toki-flex-1-4 {\n    flex: 1.4;\n}\n\n/* Vertical Button Stack (e.g., Tool buttons) */\n.toki-btn-group-stack {\n    display: flex;\n    flex-direction: column;\n    gap: 8px;\n}\n.toki-btn-group-stack .toki-btn-action {\n    height: 44px;\n    justify-content: flex-start;\n    padding-left: 20px;\n}\n\n/* 2-Column Form Grid */\n.toki-form-grid {\n    display: grid;\n    grid-template-columns: 1fr 1fr;\n    gap: 16px;\n}\n\n/* Utility Shortcuts */\n.toki-flex-between { display: flex; justify-content: space-between; align-items: center; }\n.toki-divider { border: 0; border-top: 1px solid rgba(0,0,0,0.05); margin: 24px 0; }\n.toki-mt-0 { margin-top: 0 !important; }\n.toki-mt-8 { margin-top: 8px !important; }\n.toki-mt-32 { margin-top: 32px !important; }\n.toki-ml-4 { margin-left: 4px !important; }\n.toki-mb-5 { margin-bottom: 5px !important; }\n.toki-mb-10 { margin-bottom: 10px !important; }\n.toki-mb-24 { margin-bottom: 24px !important; }\n.toki-flex-1 { flex: 1; }\n.toki-flex-row { display: flex; gap: 4px; align-items: center; }\n.toki-flex-row-8 { display: flex; gap: 8px; align-items: center; }\n.toki-flex-row-10 { display: flex; gap: 10px; align-items: center; }\n\n/* Text Utilities */\n.toki-text-xs { font-size: 11px; color: #94a3b8; }\n.toki-text-sm { font-size: 12px; }\n.toki-text-base { font-size: 14px; }\n.toki-text-lg { font-size: 20px; font-weight: 700; }\n.toki-text-success { color: #4ade80 !important; }\n.toki-text-danger { color: #ff5555 !important; }\n.toki-text-primary { color: var(--toki-primary) !important; }\n.toki-text-center { text-align: center; }\n.toki-line-16 { line-height: 1.6; }\n\n/* Specialized Components */\n.toki-modal-main { padding: 32px; width: 520px; max-height: 85vh; overflow-y: auto; }\n.toki-btn-gradient-green { \n    background: linear-gradient(135deg, #10b981, #059669) !important; \n    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2) !important;\n}\n.toki-btn-indigo { background: #6366f1 !important; }\n.toki-btn-lavender { background: #6a5acd !important; font-weight: bold !important; }\n.toki-btn-slate { background: rgba(0,0,0,0.02) !important; border-style: dashed !important; border-radius: 20px !important; }\n.toki-hidden { display: none !important; }\n\n/* Helper Boxes */\n.toki-helper-box-blue {\n    margin: -10px 0 20px 0; padding: 14px; \n    background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.1); \n    border-radius: 18px;\n}\n\n/* Captcha Overlay */\n.toki-captcha-overlay {\n    position: fixed; top: 0; left: 0; width: 100%; height: 100%;\n    background: rgba(0,0,0,0.8); z-index: 10001;\n    display: flex; flex-direction: column; align-items: center; justify-content: center;\n    color: white; font-family: var(--toki-font);\n}\n.toki-captcha-frame {\n    width: 80%; height: 60%; background: white; \n    border-radius: 20px; overflow: hidden; \n    margin-bottom: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);\n}\n\n/* Component: Helper Description Text */\n.toki-helper-desc { line-height: 1.5; font-weight: 500; }\n\n/* Component: Small Button (e.g., Test Native) */\n.toki-btn-sm { height: 36px !important; font-size: 12px !important; border-radius: 12px !important; }\n\n/* Component: Sync Button (height 48px) */\n.toki-btn-sync { height: 48px !important; }\n\n/* Component: Modal Header without border */\n.toki-modal-header-borderless { border: none !important; }\n\n/* Component: Code Textarea */\n.toki-textarea-code { min-height: 120px; font-family: monospace; }\n\n/* Visibility Toggles */\n.toki-visible-flex { display: flex !important; }\n.toki-visible-block { display: block !important; }\n.toki-hidden { display: none !important; }\n\n/* Status Badges & Indicators */\n.toki-badge {\n    margin-left: 5px;\n    font-size: 12px;\n    vertical-align: middle;\n}\n\n.toki-downloaded {\n    opacity: 0.6;\n    background-color: rgba(74, 222, 128, 0.05) !important;\n    transition: opacity 0.3s ease;\n}\n.toki-downloaded:hover {\n    opacity: 1;\n}\n\n.toki-tree-modal {\n    z-index: 10002 !important;\n}\n\n/* Iframe Elements */\n.toki-downloader-iframe {\n    width: 100%;\n    height: 600px;\n    opacity: 0.1;\n    pointer-events: none;\n    border: none;\n    margin-top: 40px;\n}\n\n.toki-captcha-iframe {\n    width: 100%;\n    height: 100%;\n    border: none;\n}\n\n/* Info Card & History Styles */\n.toki-info-card {\n    background: rgba(255, 255, 255, 0.4);\n    border: 1px solid rgba(0, 0, 0, 0.05);\n    border-radius: 12px;\n    padding: 12px 16px;\n    margin-bottom: 20px;\n}\n\n.toki-info-row {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    padding: 6px 0;\n}\n\n.toki-info-row:not(:last-child) {\n    border-bottom: 1px dashed rgba(0, 0, 0, 0.05);\n}\n\n.toki-info-label {\n    font-size: 13px;\n    color: var(--toki-text-muted);\n    font-weight: 500;\n}\n\n.toki-info-val {\n    font-size: 13px;\n    color: var(--toki-text);\n    font-weight: 700;\n    display: flex;\n    align-items: center;\n    gap: 6px;\n}\n\n/* --- Multi-Queue Progress Monitor Panel (v1.21.0) --- */\n#toki-logbox-progress {\n    padding: 14px 18px;\n    background: rgba(255, 255, 255, 0.25);\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n    backdrop-filter: blur(10px);\n    display: flex;\n    flex-direction: column;\n    gap: 8px;\n}\n\n#toki-progress-header {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n#toki-progress-overall-text {\n    font-size: 12px;\n    font-weight: 800;\n    color: var(--toki-primary);\n    letter-spacing: -0.02em;\n    background: linear-gradient(135deg, #4f46e5, #06b6d4);\n    -webkit-background-clip: text;\n    -webkit-text-fill-color: transparent;\n}\n\n}\n\n#toki-progress-overall-controls {\n    display: flex;\n    gap: 8px;\n    align-items: center;\n}\n\n.toki-progress-btn {\n    font-size: 13px;\n    cursor: pointer;\n    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), filter 0.2s ease, opacity 0.2s ease;\n    user-select: none;\n    opacity: 0.85;\n}\n\n.toki-progress-btn:hover {\n    transform: scale(1.25);\n    opacity: 1;\n    filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.6));\n}\n\n#toki-btn-queue-stop:hover {\n    filter: drop-shadow(0 0 6px #ef4444);\n}\n\n.toki-progress-bar-paused {\n    background: linear-gradient(90deg, #9ca3af 0%, #6b7280 50%, #4b5563 100%) !important;\n    box-shadow: 0 1px 3px rgba(107, 114, 128, 0.4) !important;\n    animation: tokiPulsePaused 2s infinite ease-in-out;\n}\n\n@keyframes tokiPulsePaused {\n    0%, 100% { opacity: 1; }\n    50% { opacity: 0.65; }\n}\n\n.toki-empty-queue-msg {\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    justify-content: center;\n    padding: 24px 16px;\n    background: rgba(255, 255, 255, 0.04);\n    border: 1px dashed rgba(0, 0, 0, 0.08);\n    border-radius: 12px;\n    text-align: center;\n    gap: 6px;\n    margin: 8px 0;\n    backdrop-filter: blur(5px);\n}\n\n.toki-empty-queue-msg span {\n    font-size: 13px;\n    font-weight: 700;\n    color: var(--toki-primary, #6366f1);\n    opacity: 0.85;\n}\n\n.toki-empty-queue-msg p {\n    font-size: 11px;\n    color: #4b5563;\n    opacity: 0.75;\n    margin: 0;\n    line-height: 1.4;\n}\n\n.toki-progress-bar-container {\n    width: 100%;\n    height: 8px;\n    background: rgba(0, 0, 0, 0.06);\n    border-radius: 999px;\n    overflow: hidden;\n    position: relative;\n    border: 1px solid rgba(255, 255, 255, 0.5);\n    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);\n}\n\n.toki-progress-bar-fill {\n    height: 100%;\n    width: 0%;\n    background: linear-gradient(90deg, #6366f1 0%, #3b82f6 50%, #06b6d4 100%);\n    border-radius: 999px;\n    transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);\n    box-shadow: 0 1px 3px rgba(99, 102, 241, 0.4);\n}\n\n#toki-progress-workers-list {\n    display: flex;\n    flex-direction: column;\n    gap: 8px;\n    margin-top: 6px;\n    max-height: 160px;\n    overflow-y: auto;\n    padding-right: 4px;\n}\n\n/* Custom Scrollbar for Workers List */\n#toki-progress-workers-list::-webkit-scrollbar {\n    width: 4px;\n}\n#toki-progress-workers-list::-webkit-scrollbar-track {\n    background: transparent;\n}\n#toki-progress-workers-list::-webkit-scrollbar-thumb {\n    background: rgba(0, 0, 0, 0.1);\n    border-radius: 999px;\n}\n\n.toki-worker-progress-item {\n    background: rgba(255, 255, 255, 0.35);\n    border: 1px solid rgba(255, 255, 255, 0.5);\n    border-radius: 10px;\n    padding: 8px 12px;\n    display: flex;\n    flex-direction: column;\n    gap: 6px;\n    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);\n    transition: all 0.2s ease;\n}\n\n.toki-worker-progress-item:hover {\n    background: rgba(255, 255, 255, 0.55);\n    border-color: rgba(37, 99, 235, 0.15);\n    transform: translateY(-1px);\n    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.04);\n}\n\n.toki-worker-stage {\n    font-size: 11px;\n    font-weight: 700;\n    color: var(--toki-text-muted);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n.toki-worker-bar-container {\n    width: 100%;\n    height: 5px;\n    background: rgba(0, 0, 0, 0.04);\n    border-radius: 999px;\n    overflow: hidden;\n}\n\n.toki-worker-bar-fill {\n    height: 100%;\n    background: linear-gradient(90deg, #10b981 0%, #34d399 100%);\n    border-radius: 999px;\n    transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n/* --- 📋 Realtime Queue List & Badges (v1.21.0) --- */\n#toki-progress-queue-section {\n    margin-top: 10px;\n    border-top: 1px solid rgba(0, 0, 0, 0.06);\n    padding-top: 8px;\n    display: flex;\n    flex-direction: column;\n    gap: 6px;\n}\n\n#toki-queue-section-header {\n    font-size: 11px;\n    font-weight: 700;\n    color: var(--toki-text-muted);\n    opacity: 0.85;\n}\n\n#toki-progress-queue-list {\n    display: flex;\n    flex-direction: column;\n    gap: 4px;\n    max-height: 120px;\n    overflow-y: auto;\n    padding-right: 2px;\n}\n\n#toki-progress-queue-list::-webkit-scrollbar {\n    width: 4px;\n}\n#toki-progress-queue-list::-webkit-scrollbar-track {\n    background: transparent;\n}\n#toki-progress-queue-list::-webkit-scrollbar-thumb {\n    background: rgba(0, 0, 0, 0.08);\n    border-radius: 999px;\n}\n\n.toki-queue-list-item {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    padding: 5px 8px;\n    background: rgba(255, 255, 255, 0.25);\n    border: 1px solid rgba(255, 255, 255, 0.4);\n    border-radius: 6px;\n    font-size: 11px;\n    transition: all 0.2s ease;\n}\n\n.toki-queue-list-item:hover {\n    background: rgba(255, 255, 255, 0.45);\n    transform: translateX(1px);\n}\n\n.toki-queue-item-meta {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    flex: 1;\n    min-width: 0;\n}\n\n.toki-queue-item-title {\n    color: var(--toki-text);\n    font-weight: 500;\n    white-space: nowrap;\n    overflow: hidden;\n    text-overflow: ellipsis;\n}\n\n.toki-queue-item-delete {\n    font-size: 10px;\n    cursor: pointer;\n    opacity: 0.6;\n    transition: all 0.15s ease;\n    padding: 2px;\n}\n\n.toki-queue-item-delete:hover {\n    opacity: 1;\n    transform: scale(1.2);\n}\n\n/* 세련된 HSL 상태 배지 */\n.toki-badge {\n    padding: 2px 6px;\n    border-radius: 4px;\n    font-size: 9px;\n    font-weight: 700;\n    white-space: nowrap;\n    text-transform: uppercase;\n}\n\n/* 대기 (🟡 HSL Tailored Yellow) */\n.toki-badge-pending {\n    background: hsl(45, 93%, 94%);\n    color: hsl(45, 90%, 35%);\n    border: 1px solid hsl(45, 93%, 85%);\n}\n\n/* 진행 (🟢 HSL Tailored Emerald) */\n.toki-badge-processing {\n    background: hsl(150, 84%, 93%);\n    color: hsl(150, 84%, 25%);\n    border: 1px solid hsl(150, 84%, 82%);\n}\n\n/* 완료 (🔵 HSL Tailored Sapphire) */\n.toki-badge-completed {\n    background: hsl(220, 95%, 94%);\n    color: hsl(220, 90%, 40%);\n    border: 1px solid hsl(220, 95%, 86%);\n}\n\n/* 실패 (🔴 HSL Tailored Ruby) */\n.toki-badge-failed {\n    background: hsl(0, 93%, 94%);\n    color: hsl(0, 90%, 45%);\n    border: 1px solid hsl(0, 93%, 86%);\n}\n\n/* --- FormRuleEditor: Hybrid Two-Track Parser GUI (v1.21.0) --- */\n.toki-form-editor-modal {\n    width: 1200px !important;\n    height: 90vh !important;\n    max-height: 90vh !important;\n    border-radius: 24px !important;\n}\n\n.toki-form-editor-container {\n    display: flex;\n    flex: 1;\n    overflow: hidden;\n    gap: 20px;\n    padding: 20px;\n    background: rgba(255, 255, 255, 0.15);\n}\n\n.toki-form-editor-left {\n    flex: 1.2;\n    overflow-y: auto;\n    display: flex;\n    flex-direction: column;\n    gap: 16px;\n    padding-right: 8px;\n}\n\n.toki-form-editor-left::-webkit-scrollbar {\n    width: 6px;\n}\n.toki-form-editor-left::-webkit-scrollbar-track {\n    background: transparent;\n}\n.toki-form-editor-left::-webkit-scrollbar-thumb {\n    background: rgba(0, 0, 0, 0.08);\n    border-radius: 999px;\n}\n\n.toki-form-editor-right {\n    flex: 1;\n    display: flex;\n    flex-direction: column;\n    gap: 16px;\n    background: rgba(255, 255, 255, 0.4);\n    padding: 20px;\n    border-radius: 18px;\n    border: 1px solid rgba(255, 255, 255, 0.5);\n    overflow: hidden;\n}\n\n.toki-form-card {\n    background: rgba(255, 255, 255, 0.45);\n    border: 1px solid rgba(0, 0, 0, 0.04);\n    border-radius: 16px;\n    padding: 16px 20px;\n    display: flex;\n    flex-direction: column;\n    gap: 12px;\n    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.01);\n    transition: all 0.2s ease;\n}\n\n.toki-form-card:hover {\n    background: rgba(255, 255, 255, 0.65);\n    border-color: rgba(37, 99, 235, 0.1);\n    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.02);\n}\n\n.toki-form-card-title {\n    font-size: 13px;\n    font-weight: 800;\n    color: var(--toki-primary);\n    text-transform: uppercase;\n    letter-spacing: 0.02em;\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    border-bottom: 1px solid rgba(0, 0, 0, 0.03);\n    padding-bottom: 8px;\n}\n\n.toki-form-row {\n    display: flex;\n    flex-direction: column;\n    gap: 6px;\n}\n\n.toki-form-row-header {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n.toki-form-row-label {\n    font-size: 12px;\n    font-weight: 700;\n    color: var(--toki-text-muted);\n}\n\n.toki-input-compact {\n    padding: 10px 14px;\n    background: rgba(255, 255, 255, 0.7);\n    border: 1px solid rgba(0, 0, 0, 0.06);\n    border-radius: 10px;\n    font-size: 13px;\n    font-family: inherit;\n    transition: all 0.2s ease;\n}\n\n.toki-input-compact:focus {\n    outline: none;\n    border-color: var(--toki-primary);\n    background: #fff;\n    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);\n}\n\n.toki-badge-match {\n    font-size: 10px;\n    font-weight: 800;\n    padding: 2px 6px;\n    border-radius: 6px;\n    transition: all 0.2s ease;\n}\n\n.toki-badge-match.ok {\n    background: rgba(16, 185, 129, 0.1);\n    color: #10b981;\n}\n\n.toki-badge-match.zero {\n    background: rgba(245, 158, 11, 0.1);\n    color: #f59e0b;\n}\n\n.toki-badge-match.error {\n    background: rgba(239, 68, 68, 0.1);\n    color: #ef4444;\n}\n\n.toki-form-dropper-btn {\n    cursor: pointer;\n    font-size: 14px;\n    transition: transform 0.2s;\n    user-select: none;\n}\n.toki-form-dropper-btn:hover {\n    transform: scale(1.2);\n}\n\n/* --- 📱 Compact Responsive LogBox for Popups & Small Screens (v1.21.0 추가) --- */\n@media (max-width: 500px) {\n    #toki-logbox {\n        width: 100% !important;\n        height: 100% !important;\n        max-height: 100% !important;\n        bottom: 0 !important;\n        right: 0 !important;\n        left: 0 !important;\n        top: 0 !important;\n        border-radius: 0 !important;\n        border: none !important;\n        box-shadow: none !important;\n    }\n    /* 팝업에서는 전체 화면을 채우므로 드래그 헤더 무효화 및 모바일 친화형 축소 */\n    #toki-logbox-header {\n        cursor: default !important;\n        padding: 8px 12px !important;\n        border-top-left-radius: 0 !important;\n        border-top-right-radius: 0 !important;\n    }\n    #toki-logbox-content {\n        padding: 8px !important;\n        display: block !important; /* 팝업 상세로그 강제 개방 */\n        height: calc(100% - 35px) !important; /* 헤더를 제외한 영역 100% 점유 */\n        max-height: calc(100% - 35px) !important;\n    }\n    /* 팝업 내 불필요한 컨트롤 및 큐 진행률 카드 영역 강제 은닉 (사용자 피드백 반영) */\n    #toki-btn-audio, #toki-btn-report, #toki-logbox-progress {\n        display: none !important;\n    }\n}\n\n\n\n\n/* --- Dashboard Popup Specific Layout --- */\n#toki-dashboard-popup {\n    display: flex;\n    flex-direction: column;\n    width: 100vw;\n    height: 100vh;\n    margin: 0;\n    background: var(--toki-bg);\n    border: none;\n    border-radius: 0;\n    box-shadow: none;\n    overflow: hidden;\n}\n\n#toki-dashboard-header {\n    padding: 24px 32px;\n    background: rgba(255, 255, 255, 0.4);\n    border-bottom: 1px solid rgba(0, 0, 0, 0.05);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n}\n\n#toki-dashboard-title {\n    font-size: 24px;\n    font-weight: 800;\n    color: #0f172a;\n    display: flex;\n    align-items: center;\n    gap: 12px;\n    letter-spacing: -0.03em;\n}\n\n#toki-dashboard-header-controls {\n    display: flex;\n    gap: 12px;\n    align-items: center;\n}\n\n#toki-dashboard-log-section {\n    padding: 16px 20px;\n    background: rgba(0, 0, 0, 0.05);\n    border-radius: 12px;\n    margin: 0 20px 20px 20px;\n    display: flex;\n    flex-direction: column;\n    height: 250px; /* 실시간 로그창 영역 높이 명시 */\n    overflow: hidden;\n}\n\n#toki-dashboard-log-section #toki-logbox-content {\n    flex: 1;\n    overflow-y: auto; /* 내부 스크롤 강제 */\n    padding: 12px;\n    margin: 0;\n    list-style: none;\n    background: rgba(0, 0, 0, 0.2); /* 로그 시인성 제고를 위한 세련된 다크 패널 */\n    border-radius: 8px;\n    border: 1px solid rgba(255, 255, 255, 0.03);\n}\n\n#toki-log-header {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    font-weight: 700;\n    margin-bottom: 12px;\n    color: var(--toki-text-muted);\n}\n\n/* --- 대시보드 커스텀 모달 레이아웃 (v1.21.6 추가) --- */\n.toki-dashboard-modal-overlay {\n    position: fixed;\n    top: 0;\n    left: 0;\n    width: 100vw;\n    height: 100vh;\n    background: rgba(15, 23, 42, 0.75);\n    backdrop-filter: blur(8px);\n    z-index: 10005;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    animation: tokiFadeIn 0.25s ease-out;\n}\n\n.toki-dashboard-modal {\n    width: 90%;\n    max-width: 680px;\n    background: var(--toki-bg, #1a1a2e);\n    border: 1px solid rgba(255, 255, 255, 0.08);\n    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);\n    border-radius: 24px;\n    display: flex;\n    flex-direction: column;\n    overflow: hidden;\n    animation: tokiSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);\n    color: #e0e0e0;\n}\n\n.toki-dashboard-modal-header {\n    padding: 18px 24px;\n    border-bottom: 1px solid rgba(255, 255, 255, 0.05);\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    background: rgba(255, 255, 255, 0.02);\n}\n\n.toki-dashboard-modal-title {\n    font-size: 15px;\n    font-weight: 800;\n    color: var(--toki-primary, #6366f1);\n}\n\n.toki-dashboard-modal-close {\n    background: transparent;\n    border: none;\n    font-size: 24px;\n    font-weight: 700;\n    color: #94a3b8;\n    cursor: pointer;\n    line-height: 1;\n    transition: all 0.2s ease;\n}\n\n.toki-dashboard-modal-close:hover {\n    color: #ef4444;\n    transform: scale(1.1);\n}\n\n.toki-dashboard-modal-content {\n    padding: 20px;\n    overflow-y: auto;\n    max-height: 75vh;\n}\n\n/* 진행상황 모달 내 레이아웃 오버라이드 */\n#toki-modal-progress #toki-logbox-progress {\n    background: transparent !important;\n    border: none !important;\n    padding: 0 !important;\n    backdrop-filter: none !important;\n}\n#toki-modal-progress #toki-progress-queue-list {\n    max-height: 220px;\n}\n\n/* 로그 모달 내 레이아웃 오버라이드 */\n#toki-modal-logs #toki-dashboard-log-section {\n    margin: 0 !important;\n    padding: 0 !important;\n    background: transparent !important;\n    height: 400px !important;\n}\n#toki-modal-logs #toki-logbox-content {\n    height: 350px !important;\n    max-height: 350px !important;\n}\n\n/* 대기열 모달 최대화 시의 너비 및 리스트 세로 높이 확장 */\n.toki-dashboard-modal-overlay.toki-queue-maximized .toki-dashboard-modal {\n    max-width: 850px !important;\n}\n.toki-dashboard-modal-overlay.toki-queue-maximized #toki-progress-queue-list {\n    max-height: 480px !important;\n    height: 480px !important;\n}\n\n/* 탭 본문 영역 세로 스크롤 활성화 (v1.21.8) */\n.toki-modal-body {\n    flex: 1;\n    overflow-y: auto !important;\n    max-height: calc(100vh - 120px);\n    padding-bottom: 40px;\n}\n\n/* Custom Scrollbar for Modal Body */\n.toki-modal-body::-webkit-scrollbar {\n    width: 6px;\n}\n.toki-modal-body::-webkit-scrollbar-track {\n    background: transparent;\n}\n.toki-modal-body::-webkit-scrollbar-thumb {\n    background: rgba(0, 0, 0, 0.12);\n    border-radius: 999px;\n}\n.toki-modal-body::-webkit-scrollbar-thumb:hover {\n    background: rgba(0, 0, 0, 0.25);\n}\n";
// EXTERNAL MODULE: ./src/core/queue.js
var core_queue = __webpack_require__(302);
;// ./src/core/ui.js
/**
 * UI Module for TokiSync
 * Handles Logging Overlay and OS Notifications
 */











class LogBox {
    static instance = null;

    constructor() {
        if (LogBox.instance) return LogBox.instance;
        this.logs = [];
        this.MAX_LOGS = 500;
        this.popupWindow = null;
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
            } else {
                this.log(msg, 'normal', tag);
            }
        });

        EventBus/* EventBus */.l.on(EventBus/* EVT */.c.UPDATE_PROGRESS, () => {
            this.updateProgressUI();
        });
        // ─────────────────────────────────────────────────────

        // 📊 [멀티큐] 팝업이 켜져 있을 때 주기적인 1초 동기화
        setInterval(() => {
            this.updateProgressUI();
        }, 1000);
    }

    openDashboard(defaultTab = '') {
        if (this.popupWindow && !this.popupWindow.closed) {
            this.popupWindow.focus();
            if (defaultTab) {
                this.switchTab(defaultTab);
            }
            return;
        }

        console.log('[TokiSync UI] 🛡️ 가상 팝업 대시보드 기동 (DOM 오염 차단)');
        
        const width = 750;
        const height = 850;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;
        
        this.popupWindow = window.open(
            "", 
            "TokiSync_Dashboard", 
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        if (!this.popupWindow) {
            alert("⚠️ 팝업창을 띄우지 못했습니다. 브라우저의 팝업 차단 설정을 해제해 주세요!");
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

        // Flush Cached Logs
        const logContentEl = doc.getElementById('toki-logbox-content');
        if (logContentEl) {
            logContentEl.innerHTML = '';
            this.logs.forEach(l => {
                const li = doc.createElement('li');
                li.textContent = `[${l.time}] ${l.context ? `[${l.context}] ` : ''}${l.msg}`;
                if (l.type === 'error' || l.type === 'critical') li.className = 'error';
                if (l.type === 'success') li.className = 'success';
                logContentEl.appendChild(li);
            });
            logContentEl.scrollTop = logContentEl.scrollHeight;
        }

        this.updateProgressUI();
        if (defaultTab) {
            this.switchTab(defaultTab);
        }
    }

    updateProgressUI() {
        if (!this.popupWindow || this.popupWindow.closed) return;

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
    }

    static getInstance() {
        if (!LogBox.instance) {
            new LogBox();
        }
        return LogBox.instance;
    }

    log(msg, type = 'normal', context = '') {
        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        const prefix = context ? `[${context}] ` : '';
        const fullMsg = `[${time}] ${prefix}${msg}`;
        
        // 1. 내부 메모리 및 브라우저 콘솔에는 모든 로그 누적 출력
        this.logs.push({ time, type, context, msg: typeof msg === 'string' ? msg : JSON.stringify(msg) });
        if (this.logs.length > this.MAX_LOGS) this.logs.shift();

        if (type === 'error' || type === 'critical') {
            console.error(`[TokiSync] ${prefix}${msg}`);
        } else if (type === 'warn') {
            console.warn(`[TokiSync] ${prefix}${msg}`);
        } else {
            console.log(`[TokiSync] ${prefix}${msg}`);
        }

        // 2. 사소한 자잘한 일반 로그는 대시보드 화면에 뿌리지 않음 (핵심 요약 필터링)
        if (type === 'normal') {
            return;
        }

        // 팝업이 활성화되어 있으면 실시간 렌더링
        if (this.popupWindow && !this.popupWindow.closed) {
            const doc = this.popupWindow.document;
            const logContentEl = doc.getElementById('toki-logbox-content');
            if (logContentEl) {
                const li = doc.createElement('li');
                li.textContent = fullMsg;
                
                // 클래스 매핑
                if (type === 'error' || type === 'critical') li.className = 'error';
                else if (type === 'success') li.className = 'success';
                else if (type === 'warn') li.className = 'warn';
                else if (type === 'info') li.className = 'info';
                
                logContentEl.appendChild(li);
                
                // 스크롤 미동작 방지 (안정적인 DOM 렌더링 후 스크롤 조율을 위해 미세 지연)
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
        this.logs = [];
        if (this.popupWindow && !this.popupWindow.closed) {
            const doc = this.popupWindow.document;
            const logContentEl = doc.getElementById('toki-logbox-content');
            if (logContentEl) logContentEl.innerHTML = '';
        }
    }

    show() {
        this.openDashboard();
    }

    hide() {
        if (this.popupWindow && !this.popupWindow.closed) {
            this.popupWindow.close();
        }
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
}

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
                    <div class="toki-control-group">
                        <label class="toki-label">빠른 작업</label>
                        <button class="toki-btn-action toki-btn-gradient-green" id="toki-btn-down-current">
                            <span>🚀 현재 회차 즉시 다운로드</span>
                        </button>
                    </div>
                    <hr class="toki-divider">
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
                            <span>전체</span>
                        </button>
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
                            <option value="drive">드라이브 업로드 (GoogleDrive)</option>
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
                        <input type="text" id="toki-sel-nametemplate" class="toki-input" placeholder="{number} - {title}">
                        <div class="toki-hint" style="font-size: 11px; color: #888; margin-top: 4px;">
                            로컬 저장 시 파일명 포맷입니다. 
                            (치환자: <b>{number}</b>=패딩번호, <b>{rawNumber}</b>=원본번호, <b>{series}</b>=작품명, <b>{title}</b>=회차제목)<br>
                            ※ 구글 드라이브 업로드 시에는 기존 포맷으로 고정됩니다.
                        </div>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">로컬 화수 패딩 자릿수</label>
                        <select id="toki-sel-localpadding" class="toki-select">
                            <option value="0">패딩 없음 (1, 2, 10)</option>
                            <option value="2">2자리 패딩 (01, 02, 10)</option>
                            <option value="3">3자리 패딩 (001, 002, 010)</option>
                            <option value="4">4자리 패딩 (0001, 0002, 0010)</option>
                        </select>
                    </div>

                    <div class="toki-control-group">
                        <label class="toki-label">다운로드 속도</label>
                        <select id="toki-sel-speed" class="toki-select">
                            <option value="agile">빠름 (1-3초)</option>
                            <option value="cautious">신중 (2-5초)</option>
                            <option value="thorough">철저 (3-8초)</option>
                            <option value="slow">느림 (5-15초)</option>
                            <option value="very_slow">매우 느림 (10-30초)</option>
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
                                📂 기존 파일명 표준화 (Migration)
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
                            <button class="toki-btn-action toki-btn-indigo" id="toki-btn-tree-editor">
                                🧩 파싱 규칙 편집기 (Tree Editor)
                            </button>
                            <button class="toki-btn-action toki-btn-lavender" id="toki-btn-form-editor">
                                📝 간편 규칙 편집기 (Form Editor)
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
                                <span id="toki-btn-queue-clear" title="완료/실패 큐 정리" class="toki-cursor-pointer toki-progress-btn">🧹</span>
                                <span id="toki-btn-queue-reset" title="대기열 전체 삭제 (초기화)" class="toki-cursor-pointer toki-progress-btn">🗑️</span>
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
                        <div id="toki-log-header">
                            <span>📋 실시간 수집 로그 모니터</span>
                            <span id="toki-btn-log-clear" title="Clear Logs" class="toki-cursor-pointer" style="font-size: 12px; color: var(--toki-color-warning, #e6a23c); cursor: pointer;">🚫 비우기</span>
                        </div>
                        <ul id="toki-logbox-content"></ul>
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

        const downCurrentBtn = doc.getElementById('toki-btn-down-current');
        if (downCurrentBtn) {
            downCurrentBtn.onclick = () => {
                if (this.handlers.downloadCurrent) this.handlers.downloadCurrent();
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
        const selLocalPadding = doc.getElementById('toki-sel-localpadding');
        const selSpeed = doc.getElementById('toki-sel-speed');
        const selScanSpeed = doc.getElementById('toki-sel-scanspeed');
        const selNovelFormat = doc.getElementById('toki-sel-novel-format');
        const selNovelTerm = doc.getElementById('toki-sel-novel-mode');
        const selSmartSkip = doc.getElementById('toki-sel-smartskip');

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
            if (selLocalPadding) selLocalPadding.value = cfg.localEpisodePadding !== undefined ? String(cfg.localEpisodePadding) : '4';
            if (selSpeed) selSpeed.value = cfg.sleepMode || 'agile';
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
                        LogBox.getInstance().updateProgressUI();
                        (0,core_queue/* runSchedulerOnce */.gi)();
                    }
                    return;
                }

                // 9-2. 대기열 전체 삭제 (초기화) 🗑️
                const resetBtn = e.target.closest('#toki-btn-queue-reset');
                if (resetBtn) {
                    if (popupWindow.confirm('🗑️ 대기열의 모든 에피소드를 즉시 완전히 삭제하시겠습니까?\n(진행 중인 작업도 모두 강제 중단됩니다)')) {
                        (0,core_queue/* stopAllWorkers */.HO)();
                        (0,core_queue/* clearQueue */.lg)();
                        LogBox.getInstance().updateProgressUI();
                    }
                    return;
                }

                // 9-3. 완료/실패 정리 🧹
                const clearBtn = e.target.closest('#toki-btn-queue-clear');
                if (clearBtn) {
                    if (popupWindow.confirm('🧹 완료/실패 항목을 정리하시겠습니까?')) {
                        (0,core_queue/* removeCompletedAndFailedItems */.US)();
                        LogBox.getInstance().updateProgressUI();
                        (0,core_queue/* runSchedulerOnce */.gi)();
                    }
                    return;
                }

                // 9-4. 일시 정지 ⏸️
                const pauseBtn = e.target.closest('#toki-btn-queue-pause');
                if (pauseBtn) {
                    const isPaused = (0,core_queue/* getQueuePaused */.kZ)();
                    (0,core_queue/* setQueuePaused */.EB)(!isPaused);
                    LogBox.getInstance().updateProgressUI();
                    if (isPaused) {
                        (0,core_queue/* runSchedulerOnce */.gi)();
                    }
                    return;
                }

                // 9-5. 수집 중단 ⏹️
                const stopBtn = e.target.closest('#toki-btn-queue-stop');
                if (stopBtn) {
                    if (popupWindow.confirm('⚠️ 모든 배치 작업을 중단하시겠습니까?')) {
                        (0,core_queue/* stopAllWorkers */.HO)();
                        LogBox.getInstance().updateProgressUI();
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
                if (this.handlers.migrateFilenames) this.handlers.migrateFilenames();
            };
        }

        const thumbBtn = doc.getElementById('toki-btn-thumb-optim');
        if (thumbBtn) {
            thumbBtn.onclick = () => {
                if (this.handlers.migrateThumbnails) this.handlers.migrateThumbnails();
            };
        }

        const treeEditorBtn = doc.getElementById('toki-btn-tree-editor');
        if (treeEditorBtn) {
            treeEditorBtn.onclick = () => {
                const editor = new TreeRuleEditor();
                editor.show(doc);
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
                const newNameTemplate = selNameTemplate ? selNameTemplate.value.trim() || "{number} - {title}" : "{number} - {title}";
                const newLocalPadding = selLocalPadding ? selLocalPadding.value : '4';
                const newSleepMode = selSpeed ? selSpeed.value : 'agile';
                const newScanSpeed = selScanSpeed ? selScanSpeed.value : '1000';
                const newNovelFormat = selNovelFormat ? selNovelFormat.value : 'epub';
                const newNovelMode = selNovelTerm ? selNovelTerm.value : 'perChapter';
                const newSmartSkip = selSmartSkip ? selSmartSkip.value : '50';
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
                    this.handlers.setConfig('TOKI_LOCAL_EPISODE_PADDING', newLocalPadding);
                    this.handlers.setConfig('TOKI_SLEEP_MODE', newSleepMode);
                    this.handlers.setConfig('TOKI_SCAN_SPEED', newScanSpeed);
                    this.handlers.setConfig('TOKI_NOVEL_FORMAT', newNovelFormat);
                    this.handlers.setConfig('TOKI_NOVEL_MODE', newNovelMode);
                    this.handlers.setConfig('TOKI_SMART_SKIP_RATIO', newSmartSkip);
                }

                popupWindow.alert('설정이 저장되었습니다.');
            };
        }

    }

    show() {
        LogBox.getInstance().openDashboard();
    }

    close() {
        LogBox.getInstance().hide();
    }

    toggle() {
        LogBox.getInstance().toggle();
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

/**
 * Mark downloaded items in the list (UI Sync)
 * @param {string[]} historyList Array of episode IDs (e.g. ["0001", "0002"])
 */
async function markDownloadedItems(historyList) {
    // [v1.21.7] 현 시점에서 필요하지 않은 회차 목록 완료 체크 표시(마킹) 렌더링 기능을 전면 제외하여 리소스 최적화
    return;

    // Use Set for fast lookup
    // removed by dead control flow
 // Ensure string comparison

    // removed by dead control flow

    // removed by dead control flow


    // removed by dead control flow

    // removed by dead control flow


    // removed by dead control flow


    
    // removed by dead control flow

}

/**
 * TreeRuleEditor (v1.9.0)
 * Specialist UI for managing parsing rules with a tree-style interface.
 */
class TreeRuleEditor {
    constructor() {
        this.rules = RuleManager/* RuleManager */.u.getCustomRules();
        this.overlay = null;
        this.hints = {
            'id': '사이트 고유 ID (영문/숫자)',
            'name': '표시용 이름',
            'urlPattern': '적용할 URL 정규표현식',
            'category': 'Webtoon / Manga / Novel',
            'meta': '작품 정보를 추출하는 규칙 그룹',
            'selector': 'CSS 셀렉터 (예: .title, #info)',
            'attr': '추출할 속성 (비워두면 텍스트)',
            'regex': '데이터 정제용 정규식 그룹',
            'list': '회차 목록을 추출하는 규칙 그룹',
            'container': '목록 전체를 감싸는 부모 요소',
            'item': '각 회차 줄 요소 (li 등)',
            'viewer': '본문 내용을 추출하는 규칙 그룹',
            'images': '웹툰 이미지 또는 소설 본문 요소',
            'exclude': '제외할 요소의 CSS 셀렉터 (반점 구분 또는 배열)'
        };
    }

    show(popupDoc = document) {
        const doc = popupDoc;
        this.overlay = doc.createElement('div');
        this.overlay.className = 'toki-modal-overlay';
        // z-index handled by .toki-tree-modal in ui.css
        
        this.overlay.innerHTML = `
            <div class="toki-modal toki-tree-modal">
                <div class="toki-modal-header">
                    <div class="toki-modal-title">🧩 파싱 규칙 관리자 (Tree Editor)</div>
                    <div class="toki-flex-row-8">
                        <button class="toki-btn-rule" id="tree-btn-export">📤 내보내기</button>
                        <button class="toki-btn-rule" id="tree-btn-import">📥 가져오기</button>
                        <button class="toki-modal-close" id="tree-close-btn">&times;</button>
                    </div>
                </div>
                <div class="toki-tree-container">
                    <div class="toki-tree-view" id="tree-root"></div>
                    
                    <div class="toki-tree-right-panel">
                        <div class="toki-flex-between toki-text-xs">
                            <span>📄 JSON 미리보기</span>
                            <span id="tree-json-status" class="toki-text-success">✓ Valid</span>
                        </div>
                        <textarea class="toki-tree-json-preview" id="tree-json-editor" spellcheck="false"></textarea>
                        
                        <div class="toki-test-bench toki-mt-0">
                            <div class="toki-label toki-mb-5">🧪 즉시 테스트</div>
                            <div class="toki-flex-row-8">
                                <input type="text" id="tree-test-url" class="toki-input-compact toki-flex-1" placeholder="주소 입력" value="${window.location.href}">
                                <button class="toki-btn-rule toki-text-success" id="tree-btn-test">실행</button>
                            </div>
                            <div id="tree-test-result" class="toki-test-result">규칙 수정 후 바로 테스트해보세요.</div>
                        </div>
                        
                        <div class="toki-flex-row-10">
                            <button class="toki-btn-action toki-btn-lavender" id="tree-btn-save">저장 및 적용</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        doc.body.appendChild(this.overlay);
        this.render(doc);
        this.bindEvents(doc);
    }

    render(popupDoc = document) {
        const doc = popupDoc;
        const root = this.overlay.querySelector('#tree-root');
        root.innerHTML = '';
        
        const mainNode = doc.createElement('div');
        mainNode.innerHTML = `<div class="toki-tree-item"><span class="toki-tree-key">Rules [Array]</span><button class="toki-tree-btn-small" id="tree-add-rule">➕ 룰 추가</button></div>`;
        root.appendChild(mainNode);

        const listNode = doc.createElement('div');
        listNode.className = 'toki-tree-node';
        this.rules.forEach((rule, idx) => {
            listNode.appendChild(this.renderNode(rule, `[${idx}]`, rule.name || rule.id || `Rule ${idx + 1}`));
        });
        root.appendChild(listNode);

        this.updateJsonPreview();
    }

    renderNode(data, path, label = '', doc = document) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'toki-tree-node-wrapper';

        const item = doc.createElement('div');
        item.className = 'toki-tree-item';
        
        const isObject = data !== null && typeof data === 'object';
        const toggle = doc.createElement('span');
        toggle.className = 'toki-tree-toggle';
        toggle.textContent = isObject ? '▼' : '•';
        
        const keySpan = doc.createElement('span');
        keySpan.className = 'toki-tree-key';
        keySpan.textContent = label || path.split('.').pop();
        if (this.hints[keySpan.textContent]) {
            keySpan.title = this.hints[keySpan.textContent];
        }

        item.appendChild(toggle);
        item.appendChild(keySpan);

        if (!isObject) {
            const input = doc.createElement('input');
            input.className = 'toki-tree-val';
            input.value = data;
            input.dataset.path = path;
            input.oninput = (e) => this.updateValue(path, e.target.value);
            item.appendChild(input);
        } else {
            const actions = doc.createElement('div');
            actions.className = 'toki-tree-actions';
            
            const btnDel = doc.createElement('button');
            btnDel.className = 'toki-tree-btn-small';
            btnDel.textContent = '🗑️';
            btnDel.onclick = () => this.removeNode(path);
            actions.appendChild(btnDel);
            
            item.appendChild(actions);
        }

        wrapper.appendChild(item);

        if (isObject) {
            const children = doc.createElement('div');
            children.className = 'toki-tree-node';
            Object.keys(data).forEach(key => {
                children.appendChild(this.renderNode(data[key], `${path}.${key}`, key, doc));
            });
            wrapper.appendChild(children);

            toggle.onclick = () => {
                children.classList.toggle('toki-hidden');
                toggle.textContent = isHidden ? '▼' : '▶';
            };
        }

        return wrapper;
    }

    updateValue(path, val) {
        const parts = path.split('.');
        let current = this.rules;
        
        for (let i = 0; i < parts.length; i++) {
            let p = parts[i];
            if (p.startsWith('[') && p.endsWith(']')) {
                p = parseInt(p.substring(1, p.length - 1));
            }
            
            if (i === parts.length - 1) {
                current[p] = val;
            } else {
                current = current[p];
            }
        }
        this.updateJsonPreview();
    }

    removeNode(path) {
        if (!confirm(`노드(${path})를 삭제하시겠습니까?`)) return;
        
        const parts = path.split('.');
        if (parts.length === 1) { // Root rule
            const idx = parseInt(parts[0].substring(1, parts[0].length - 1));
            this.rules.splice(idx, 1);
        } else {
            let current = this.rules;
            for (let i = 0; i < parts.length - 1; i++) {
                let p = parts[i];
                if (p.startsWith('[') && p.endsWith(']')) p = parseInt(p.substring(1, p.length - 1));
                current = current[p];
            }
            const last = parts[parts.length - 1];
            delete current[last];
        }
        this.render();
    }

    updateJsonPreview() {
        const editor = this.overlay.querySelector('#tree-json-editor');
        editor.value = JSON.stringify(this.rules, null, 2);
    }

    bindEvents(popupDoc = document) {
        const overlay = this.overlay;
        
        overlay.querySelector('#tree-close-btn').onclick = () => overlay.remove();
        
        overlay.querySelector('#tree-add-rule').onclick = () => {
            this.rules.push({
                id: 'new_site_' + Date.now(),
                name: '새 사이트',
                urlPattern: '',
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
            });
            this.render();
        };

        overlay.querySelector('#tree-json-editor').oninput = (e) => {
            const status = overlay.querySelector('#tree-json-status');
            try {
                const parsed = JSON.parse(e.target.value);
                if (Array.isArray(parsed)) {
                    this.rules = parsed;
                    status.textContent = '✓ Valid';
                    status.classList.add('toki-text-success');
                    status.classList.remove('toki-text-danger');
                    if (this.renderTimer) clearTimeout(this.renderTimer);
                    this.renderTimer = setTimeout(() => this.render(), 1000);
                }
            } catch (err) {
                status.textContent = '⚠ Invalid JSON';
                status.classList.add('toki-text-danger');
                status.classList.remove('toki-text-success');
            }
        };

        overlay.querySelector('#tree-btn-save').onclick = () => {
            RuleManager/* RuleManager */.u.saveCustomRules(this.rules);
            alert('파싱 규칙이 성공적으로 저장되었습니다.');
            overlay.remove();
        };

        overlay.querySelector('#tree-btn-export').onclick = () => {
            const blob = new Blob([JSON.stringify(this.rules, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tokisync_rules_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        overlay.querySelector('#tree-btn-import').onclick = () => {
            const selectOverlay = document.createElement('div');
            selectOverlay.className = 'toki-modal-overlay';
            selectOverlay.style.zIndex = '20002'; // Above Tree Editor
            selectOverlay.onclick = (e) => { if(e.target === selectOverlay) selectOverlay.remove(); };
            
            selectOverlay.innerHTML = `
                <div class="toki-modal toki-compact-modal" style="max-width: 400px; padding: 24px;">
                    <div class="toki-modal-header" style="margin-bottom: 20px;">
                        <div class="toki-modal-title" style="font-size: 16px;">📥 규칙 가져오기 방식 선택</div>
                        <button class="toki-modal-close" id="import-select-close" title="닫기">&times;</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
                        <button class="toki-btn-action toki-btn-lavender" id="import-choose-file">
                            📂 로컬 JSON 파일 선택
                        </button>
                        <button class="toki-btn-action toki-btn-secondary" id="import-choose-url">
                            🌐 원격 URL 주소 입력
                        </button>
                    </div>
                    <div id="import-url-input-container" class="toki-hidden" style="margin-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 16px;">
                        <div class="toki-control-group" style="margin-bottom: 16px;">
                            <label class="toki-label">원격 규칙 URL 주소</label>
                            <input type="text" id="import-url-input" class="toki-input" placeholder="https://..." value="https://pray4skylark.github.io/tokiSync/rules.json">
                        </div>
                        <button class="toki-btn-action" id="import-btn-fetch" style="width: 100%;">
                            <span>가져오기 실행</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(selectOverlay);

            selectOverlay.querySelector('#import-select-close').onclick = () => selectOverlay.remove();

            const handleRulesImport = (rules) => {
                const rulesArr = Array.isArray(rules) ? rules : (rules.rules || []);
                if (!Array.isArray(rulesArr) || rulesArr.length === 0) {
                    alert('가져올 규칙이 유효하지 않거나 비어 있습니다.');
                    return;
                }
                const mode = confirm('기존 규칙과 합치시겠습니까? (취소 시 전체 덮어쓰기)') ? 'merge' : 'overwrite';
                if (mode === 'overwrite') {
                    this.rules = rulesArr;
                } else {
                    RuleManager/* RuleManager */.u.bulkImport(rulesArr, 'merge');
                    this.rules = RuleManager/* RuleManager */.u.getCustomRules();
                }
                this.render();
                selectOverlay.remove();
            };

            // File selection
            selectOverlay.querySelector('#import-choose-file').onclick = () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        try {
                            const imported = JSON.parse(ev.target.result);
                            handleRulesImport(imported);
                        } catch (err) {
                            alert('JSON 파싱 오류: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            };

            // URL input toggle
            selectOverlay.querySelector('#import-choose-url').onclick = () => {
                const container = selectOverlay.querySelector('#import-url-input-container');
                container.classList.remove('toki-hidden');
            };

            // Fetch remote URL
            selectOverlay.querySelector('#import-btn-fetch').onclick = async () => {
                const url = selectOverlay.querySelector('#import-url-input').value.trim();
                if (!url) {
                    alert('URL을 입력해주세요.');
                    return;
                }
                const fetchBtn = selectOverlay.querySelector('#import-btn-fetch');
                fetchBtn.disabled = true;
                fetchBtn.innerHTML = '<span>⏳ 가져오는 중...</span>';
                
                try {
                    const fetched = await RuleManager/* RuleManager */.u.fetchRemoteRules(url);
                    if (fetched) {
                        handleRulesImport(fetched);
                    } else {
                        alert('원격 규칙을 가져오는데 실패했습니다. URL 주소 및 네트워크 상태를 확인하세요.');
                    }
                } catch (err) {
                    alert('오류 발생: ' + err.message);
                } finally {
                    fetchBtn.disabled = false;
                    fetchBtn.innerHTML = '<span>가져오기 실행</span>';
                }
            };
        };

        overlay.querySelector('#tree-btn-test').onclick = async () => {
            const res = overlay.querySelector('#tree-test-result');
            res.textContent = '⏳ 파싱 테스트 중...';
            try {
                const url = overlay.querySelector('#tree-test-url').value;
                const domain = new URL(url).origin;
                const rule = this.rules.find(r => new RegExp(r.urlPattern, 'i').test(url));
                if (!rule) throw new Error('해당 URL에 맞는 규칙이 트리 내에 없습니다.');

                const parser = new GenericParser/* GenericParser */.b(domain, rule);
                const result = await (0,extractor/* extractEpisodeData */.d)(document, parser, { site: 'test', category: rule.category }, false);
                
                res.innerHTML = `
                    <div class="toki-text-success">성공!</div>
                    <div>• 제목: ${result.title || 'N/A'}</div>
                    <div>• 항목 수: ${result.urls?.length || (result.content ? '1 (Text)' : '0')}</div>
                `;
            } catch (e) {
                res.textContent = '❌ 실패: ' + e.message;
            }
        };
    }
}

/**
 * FormRuleEditor (v1.21.0)
 * Specialist UI for managing parsing rules with a sleek Form-Tree Hybrid Two-Track interface.
 */
class FormRuleEditor {
    constructor() {
        this.rules = RuleManager/* RuleManager */.u.getCustomRules() || [];
        this.overlay = null;
        this.currentRuleIndex = 0;
        this.isDropperActive = false;
        this.targetDropperInputId = null;
        
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
        this.overlay.innerHTML = `
            <div class="toki-modal toki-form-editor-modal">
                <div class="toki-modal-header">
                    <div class="toki-modal-title">📝 간편 규칙 편집기 (Form Editor) <span class="toki-text-xs">v1.21.0</span></div>
                    <div class="toki-flex-row-8">
                        <button class="toki-btn-rule" id="form-btn-export">📤 내보내기</button>
                        <button class="toki-btn-rule" id="form-btn-import">📥 가져오기</button>
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
                                        <span class="toki-form-dropper-btn" data-target="rule-meta-title" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-meta-title" class="toki-input-compact toki-flex-1" placeholder="예: h1.hero-v2-title">
                                        <span class="toki-badge-match zero" id="match-rule-meta-title">0</span>
                                    </div>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">작가 셀렉터</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-meta-author" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-meta-author" class="toki-input-compact toki-flex-1" placeholder="예: div.hero-v2-author">
                                        <span class="toki-badge-match zero" id="match-rule-meta-author">0</span>
                                    </div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">썸네일 이미지 셀렉터</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-meta-thumb-selector" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-meta-thumb-selector" class="toki-input-compact toki-flex-1" placeholder="예: div.hero-v2-thumb img">
                                        <span class="toki-badge-match zero" id="match-rule-meta-thumb-selector">0</span>
                                    </div>
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
                                        <span class="toki-form-dropper-btn" data-target="rule-list-container" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-container" class="toki-input-compact toki-flex-1" placeholder="예: ul.ep-list-v2">
                                        <span class="toki-badge-match zero" id="match-rule-list-container">0</span>
                                    </div>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 아이템 (개별 행)</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-list-item" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-item" class="toki-input-compact toki-flex-1" placeholder="예: li.ep-row-v2">
                                        <span class="toki-badge-match zero" id="match-rule-list-item">0</span>
                                    </div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 링크 셀렉터</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-list-link-selector" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-link-selector" class="toki-input-compact toki-flex-1" placeholder="예: a.ep-row-v2-link">
                                        <span class="toki-badge-match zero" id="match-rule-list-link-selector">0</span>
                                    </div>
                                </div>
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">회차 제목 셀렉터</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-list-title" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-list-title" class="toki-input-compact toki-flex-1" placeholder="예: .ep-row-v2-title strong">
                                        <span class="toki-badge-match zero" id="match-rule-list-title">0</span>
                                    </div>
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
                                        <span class="toki-form-dropper-btn" data-target="rule-viewer-imageContainer" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-viewer-imageContainer" class="toki-input-compact toki-flex-1" placeholder="예: div.vw-imgs, article.viewer">
                                        <span class="toki-badge-match zero" id="match-rule-viewer-imageContainer">0</span>
                                    </div>
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">뷰어 이미지/문단 태그</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-viewer-imageItem" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-viewer-imageItem" class="toki-input-compact toki-flex-1" placeholder="예: img 또는 p">
                                        <span class="toki-badge-match zero" id="match-rule-viewer-imageItem">0</span>
                                    </div>
                                </div>
                                <div class="toki-form-row">
                                    <span class="toki-form-row-label">레이지로드 속성 후보 (반점 구분)</span>
                                    <input type="text" id="rule-viewer-lazyAttrOptions" class="toki-input-compact" placeholder="예: data-src, data-lazy, src">
                                </div>
                            </div>
                            <div class="toki-form-grid">
                                <div class="toki-form-row" style="grid-column: span 2;">
                                    <div class="toki-form-row-header">
                                        <span class="toki-form-row-label">제외 셀렉터 (exclude) (반점 구분)</span>
                                        <span class="toki-form-dropper-btn" data-target="rule-viewer-exclude" title="화면에서 스포이드로 선택">🎯</span>
                                    </div>
                                    <div class="toki-flex-row-8">
                                        <input type="text" id="rule-viewer-exclude" class="toki-input-compact toki-flex-1" placeholder="예: .ad-banner, #sponsored-bottom">
                                        <span class="toki-badge-match zero" id="match-rule-viewer-exclude">0</span>
                                    </div>
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

        rule.list = {
            container: this.getValue('rule-list-container'),
            item: this.getValue('rule-list-item'),
            num: 'span.no', // Default baseline fallback
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

            try {
                const count = document.querySelectorAll(selector).length;
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

    bindEvents(popupDoc = document) {
        const doc = popupDoc;
        
        // Close
        this.overlay.querySelector('#form-close-btn').onclick = () => this.overlay.remove();

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

        // Test button
        this.overlay.querySelector('#form-btn-test').onclick = async () => {
            const res = this.overlay.querySelector('#form-test-result');
            res.textContent = '⏳ 파싱 테스트 작동 중...';
            try {
                const url = this.overlay.querySelector('#form-test-url').value;
                const domain = new URL(url).origin;
                const rule = this.rules[this.currentRuleIndex];

                const parser = new GenericParser/* GenericParser */.b(domain, rule);
                const result = await (0,extractor/* extractEpisodeData */.d)(document, parser, { site: 'test', category: rule.category }, false);

                res.innerHTML = `
                    <div class="toki-text-success" style="font-weight:800;">성공! (Virtual Match)</div>
                    <div>• 제목: <strong>${result.title || '미추출'}</strong></div>
                    <div>• 총 에피소드 수: <strong>${result.urls?.length || (result.content ? '1 (Text)' : '0')}개</strong></div>
                `;
            } catch (e) {
                res.innerHTML = `<div class="toki-text-danger">❌ 실패: ${e.message}</div>`;
            }
        };

        // Save Button
        this.overlay.querySelector('#form-btn-save').onclick = () => {
            this.updateJsonPreview();
            RuleManager/* RuleManager */.u.saveCustomRules(this.rules);
            const status = this.overlay.querySelector('#form-json-status');
            status.textContent = '💾 저장됨!';
            status.className = 'toki-badge-match ok';
            setTimeout(() => {
                status.textContent = '✓ Valid';
            }, 1500);
            
            // Notify LogBox of parser reload
            new LogBox().log('[FormEditor] 새로운 파싱 규칙이 디스크 큐 세마포어에 즉시 영속 반영되었습니다.', 'success');
        };

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
                        RuleManager/* RuleManager */.u.saveCustomRules(this.rules);
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
            
            new LogBox().log(`[Dropper] 자동 CSS 셀렉터 감지 완료: ${selector}`, 'success');
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
/************************************************************************/
var __webpack_exports__ = {};

// EXTERNAL MODULE: ./src/core/utils.js
var utils = __webpack_require__(924);
// EXTERNAL MODULE: ./src/core/extractor.js
var extractor = __webpack_require__(929);
// EXTERNAL MODULE: ./src/core/parsers/ParserFactory.js
var ParserFactory = __webpack_require__(969);
// EXTERNAL MODULE: ./src/core/detector.js
var detector = __webpack_require__(419);
;// ./src/core/epub.js
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
            .map(line => `<p>${line}</p>`)
            .join('\n');
            
        this.chapters.push({ title, content: htmlContent });
    }

    async build(metadata = {}) {
        try {
            const zip = new JSZip();
            const title = metadata.title || "Unknown Title";
            const author = metadata.author || "Unknown Author";
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
            const { LogBox } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 989));
            LogBox.getInstance().critical(`EPUB 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, 'Builder:EPUB');
            throw e;
        }
    }
}

;// ./src/core/cbz.js

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
            const { LogBox } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 989));
            LogBox.getInstance().critical(`CBZ 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, 'Builder:CBZ');
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
        return unsafe.replace(/[<>&"']/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '"': return '&quot;';
                case "'": return '&apos;';
            }
        });
    }
}

;// ./src/core/txt.js
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
        .replace(/<[^>]+>/g, ''); // 나머지 HTML 태그 완전 제거

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
            const { LogBox } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 989));
            LogBox.getInstance().critical(`TXT 빌드 실패: ${e.message} (${metadata.title || 'unknown'})`, 'Builder:TXT');
            throw e;
        }
    }
}

// EXTERNAL MODULE: ./src/core/ui.js + 1 modules
var ui = __webpack_require__(989);
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

function startSilentAudio() {
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

function stopSilentAudio() {
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
            audioContext.close().then(() => {
                audioContext = null;
                console.log('🔇 [Anti-Sleep] Audio stopped');
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
var queue = __webpack_require__(302);
;// ./src/core/downloader.js
















// Sleep Policy Presets
const SLEEP_POLICIES = {
    agile: { min: 1000, max: 3000 },      // 빠름 (1-3초)
    cautious: { min: 2000, max: 5000 },   // 신중 (2-5초)
    thorough: { min: 3000, max: 8000 },   // 철저 (3-8초)
    slow: { min: 5000, max: 15000 },      // 느림 (5-15초)
    very_slow: { min: 10000, max: 30000 } // 매우 느림 (10-30초)
};

async function processItem(item, builder, siteInfo, iframe, parser, seriesTitle = "", targetDoc = null, rootFolder = "", destination = "local") {
    const { category } = siteInfo;
    const isNovel = (category === 'Novel' || category === 'novel');
    const viewerCfg = parser.rule.viewer || {};

    const logger = ui.LogBox.getInstance();
    const config = (0,core_config/* getConfig */.zj)();
    let policy = SLEEP_POLICIES[config.sleepMode] || SLEEP_POLICIES.agile;

    const id = (0,queue/* getQueueItemId */.G8)(seriesTitle, item.num ? item.num.toString() : '');
    
    // 상태를 'processing'으로 올려 즉시 실시간 수집 연동 시작 (단일/로컬 워커 진행률 연동용)
    (0,queue/* updateQueueItem */.Gg)(id, { status: 'processing', stage: queue/* WORKER_STAGE */.WB.INIT });

    const finalRootFolder = rootFolder || seriesTitle || 'UnknownSeries';

    try {
        if (isNovel) {
            logger.log(`[소설] 추출 중: ${item.title}`, 'Downloader');

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

            if (result === true) {
                logger.log(`... [자립형 워커] 소설 수집 및 드라이브/로컬 저장 성공: ${item.title}`, 'Downloader');
                await (0,utils/* sleep */.yy)(policy.min, policy.max);
                return true; // Self-contained completed
            } else if (typeof result === 'string') {
                // Plan C Fallback (API Decryption) - runs locally in parent
                builder.addChapter(item.title, result);
                logger.log(`... [Plan C API 폴백] 추출 성공: ${item.title}`, 'Downloader');
                await (0,utils/* sleep */.yy)(policy.min, policy.max);
                return false; // Requires parent to save
            } else {
                throw new Error(`추출 실패 (소설 본문 응답 없음)`);
            }
        } 
        else {
            logger.log(`[만화] 추출 중: ${item.title}`, 'Downloader');

            const success = await (0,worker_controller/* fetchComicImages */.gq)(item.src, {
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

            if (success) {
                logger.log(`✅ [자립형 워커] 만화 수집 및 드라이브/로컬 저장 성공: ${item.title}`, 'Downloader');
                await (0,utils/* sleep */.yy)(policy.min, policy.max);
                return true; // Self-contained completed
            } else {
                throw new Error(`추출 실패 (만화 팝업 수집 실패)`);
            }
        }
    } finally {
        // 단일/로컬 워커 수집 완료/실패 후 대기열 임시 아이템 클린업
        (0,queue/* removeQueueItem */.d$)(id);
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
    const logger = ui.LogBox.getInstance();
    logger.init();
    logger.show();
    logger.info(`다운로드 시작 (정책: ${policy}, 강제 덮어쓰기: ${forceOverwrite})...`);

    // Auto-start Anti-Sleep mode
    try {
        startSilentAudio();
        logger.success('[Anti-Sleep] 백그라운드 모드 자동 활성화');
    } catch (e) {
        logger.log('[Anti-Sleep] 자동 시작 실패 (사용자 상호작용 필요)', 'error');
    }

    const failedEpisodes = [];  // [v1.8.1] 완전 실패 리스트
    const partialFailures = []; // [v1.8.1] 부분 실패 리스트 (이미지 일부 누락)
    const siteInfo = await (0,detector/* detectSite */.T)();
    if (!siteInfo) {
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.NOTIFY_ERROR, { msg: "지원하지 않는 사이트이거나 다운로드 페이지가 아닙니다." });
        stopSilentAudio();
        return;
    }

    const parser = await ParserFactory/* ParserFactory */.O.getParser();
    if (!parser) {
        EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.NOTIFY_ERROR, { msg: "파서를 초기화할 수 없습니다." });
        stopSilentAudio();
        return;
    }

    const { category, matchedRule } = siteInfo;
    const siteName = matchedRule?.name || "TokiSync Parser";
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
        } else if (policy === 'drive') {
            buildingPolicy = 'individual'; // 빌딩은 개별 CBZ 단위
            destination = 'drive';         // 저장 대상은 Google Drive
        // 하위 호환: 구버전 정책 명칭 지원
        } else if (policy === 'gasUpload') {
            buildingPolicy = 'individual';
            destination = 'drive';
            logger.log('⚠️ gasUpload 정책은 drive로 대체되었습니다.', 'warn');
        } else if (policy === 'folderInCbz') {
            buildingPolicy = 'zipOfCbzs';
            destination = 'local';
            logger.log('⚠️ folderInCbz 정책이 폐기되어 zipOfCbzs(배치)로 전환되었습니다.', 'warn');
        }

        // [v1.8.2] Graceful Fallback for missing Drive configuration
        if (destination === 'drive' && !(0,core_config/* isConfigValid */.Jb)()) {
            EventBus/* EventBus */.l.emit(EventBus/* EVT */.c.NOTIFY_ERROR, { msg: '구글 드라이브 설정(Folder ID 등)이 누락되었습니다. 임시로 개별 로컬 다운로드 정책으로 전환합니다.' });
            logger.warn('⚠️ 구글 드라이브 설정 누락 감지. 정책을 개별 로컬 다운로드로 자동 전환합니다.', 'System');
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
            logger.log(`범위 필터 적용 및 오름차순 정렬 완료: ${rangeSpec} → ${list.length}개 항목`);
        } else {
            list = mappedList.sort((a, b) => a.num - b.num)
                             .map(item => item.li);
            logger.log(`전체 항목 오름차순 정렬 완료: ${list.length}개 항목`);
        }
        
        // Log episode range
        if (list.length > 0) {
            const first = parser.parseListItem(list[list.length - 1]); // usually reversed order
            const last = parser.parseListItem(list[0]);
            logger.info(`총 ${list.length}개 항목 처리 예정. (${first.title} ~ ${last.title})`, 'Downloader');
        } else {
            logger.log(`총 0개 항목 처리 예정.`, 'Downloader');
        }

        if (list.length === 0) {
            logger.warn('에피소드 목록이 0개입니다. 사이트 구조가 달라졌거나 올바른 목록 페이지인지 확인하세요.', 'Downloader');
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
        // Extract raw title from rootFolder (e.g., "[1234] Title" -> "Title")
        const seriesTitle = rootFolder.replace(/^\[[0-9]+\]\s*/, '');
        const listPrefixTitle = (list.length > 1) ? (0,utils/* getCommonPrefix */.iL)(first.title, last.title) : "";

        // [v1.7.0] Collect detailed metadata for Phase 3 Persistence
        const seriesMetadata = {
            ...parser.getSeriesMetadata(),
            title: seriesTitle || rootFolder,
            thumbnail: parser.getThumbnailUrl() || ""
        };

        // [Fix] Append Range [Start-End] for Local Merged Files (folderInCbz / zipOfCbzs)
        // GAS Upload uses individual files so no range needed in folder name
        // [v1.6.0 Update] Batch range is handled during saving, not in rootFolder variable
        if (buildingPolicy === 'zipOfCbzs') {
            const startNum = parseInt(first.num);
            const endNum = parseInt(last.num);
            // We'll append batch info later
        }

        // [v1.4.0] Upload Series Thumbnail (if uploading to Drive)
        if (destination === 'drive') {
            try {
                const thumbnailUrl = parser.getThumbnailUrl();
                if (thumbnailUrl) {
                    logger.log('📷 시리즈 썸네일 업로드 중...');
                    const thumbBlob = await (0,utils/* fetchBlobWithXHR */.Kt)(thumbnailUrl, document.URL);
                    
                    // Upload as 'cover.jpg' - network.js will auto-redirect to _Thumbnails/{ID}.jpg
                    // saveFile(data, filename, type, extension, metadata)
                    // → fullFileName = "cover.jpg"
                    await (0,utils/* saveFile */.OJ)(thumbBlob, 'cover', 'drive', 'jpg', { 
                        category,
                        folderName: rootFolder  // Target folder for upload
                    });
                    logger.success('✅ 썸네일 업로드 완료');
                } else {
                    logger.log('⚠️  썸네일을 찾을 수 없습니다 (건너뜀)', 'warn');
                }
            } catch (thumbError) {
                logger.warn(`썸네일 업로드 실패 (계속 진행): ${thumbError.message}`, 'Downloader');
            }
        }

        // [v1.5.0 Smart Skip] Pre-load history for Drive uploads to skip already-uploaded episodes
        let uploadedHistorySet = new Set();
        // [v1.6.0 Fast Path] Pre-load episode cache
        let episodeCacheMap = new Map(); // key: "0001 - Title", value: "fileId"

        let historyCheckTimeoutFlag = false;
        let historyFolderId = null;

        if (destination === 'drive') {
            try {
                if (forceOverwrite) {
                    logger.log('⚠️ 강제 재다운로드 옵션 활성화: 기존 업로드 기록 무시 (전체 덮어쓰기)');
                } else {
                    logger.log('☁️ 드라이브 업로드 기록 및 용량 확인 중 (Smart Skip)...');
                    const histResult = await (0,network/* fetchHistoryDirect */.GA)(rootFolder, category);
                    
                    if (histResult.success) {
                        historyFolderId = histResult.folderId;
                        // Normalize: accept padded ("0001") and plain ("1") forms
                        histResult.data.forEach(id => {
                            const plain = parseInt(id).toString();
                            uploadedHistorySet.add(id.toString());   // e.g. "0001"
                            uploadedHistorySet.add(plain);           // e.g. "1"
                        });
                        if (uploadedHistorySet.size > 0) {
                            logger.log(`⏭️ 조건 만족(기존 정상 업로드) 에피소드 ${histResult.data.length}개 감지 — 건너뜁니다.`);
                        }
                    } else {
                        historyCheckTimeoutFlag = true;
                        historyFolderId = histResult.folderId;
                        logger.log(`⚠️ 업로드 기록 조회 지연/타임아웃 감지. 개별 스킵(페일세이프) 모드로 전환합니다.`, 'warn');
                    }
                }
            } catch (histErr) {
                // Non-fatal: if history check fails unexpectedly
                logger.log(`⚠️ 업로드 기록 조회 실패: ${histErr.message}`, 'warn');
            }

            // [v1.6.0] Phase B-2: Load Master Index -> Cache File ID -> Episode List
            try {
                logger.log('⚡ 고속 업로드(Fast Path) 캐시 조회 중...');
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
                        logger.log(`[Fast Path] 마스터 카탈로그에서 신규 캐시 파일 발견: ${targetCacheFileId}`);
                    } else {
                        // [v1.6.1] 2nd Attempt: Fetch Merge Index Fragment directly (Fallback for newly uploaded series)
                        logger.log(`[Fast Path] 마스터 카탈로그에 캐시 부재. _MergeIndex 대기열 파편을 탐색합니다...`);
                        const fragRes = await (0,gas/* getMergeIndexFragment */.Jb)(seriesId);
                        if (fragRes.found && fragRes.data && fragRes.data.cacheFileId) {
                            targetCacheFileId = fragRes.data.cacheFileId;
                            logger.log(`[Fast Path] 큐에서 비동기 병합 파편 발견 성공! (ID: ${targetCacheFileId})`);
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
                             logger.success(`[Fast Path] 맵핑 테이블 완성: ${episodeCacheMap.size}개 에피소드 캐시 로드 성공!`);
                        }
                    } else {
                        logger.log('[Fast Path] 신규 작품이거나 캐시 파편이 아직 없습니다 (일반 업로드 분기로 진행)');
                    }
                }
            } catch (cacheErr) {
                logger.log(`⚠️ 고속 업로드 캐시 로드 실패 (일반 분기로 진행방향 전환): ${cacheErr.message}`, 'warn');
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
            if (destination === 'drive' && !currentIsSingleVolume) {
                if (uploadedHistorySet.size > 0 && (uploadedHistorySet.has(numStr) || uploadedHistorySet.has(numPlain))) {
                    continue;
                }
                
                if (historyCheckTimeoutFlag && historyFolderId) {
                    const isUploaded = await (0,network/* checkSingleHistoryDirect */.OS)(historyFolderId, numStr);
                    if (isUploaded) continue;
                }
            }
            
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
            if (destination === 'drive' && !currentIsSingleVolume) {
                logger.success('✅ 모든 에피소드가 이미 드라이브에 존재하여 수집을 조기 완료합니다.', 'Queue');
                stopSilentAudio();
                return;
            }
        } else {
            // [v1.21.4] 구글 드라이브 업로드 모드 시, 큐 등록 전 작품 폴더를 선제 생성/확정하여 큐 전파 (경쟁적 중복 폴더 생성 차단)
            let activeFolderId = historyFolderId;
            if (destination === 'drive' && !activeFolderId) {
                logger.log(`📁 [Drive] 신규 작품 폴더 선제 생성 중: ${seriesTitle}`);
                try {
                    const token = await (0,network/* getOAuthToken */.Py)();
                    activeFolderId = await (0,network/* getOrCreateFolder */.aj)(seriesTitle, (0,core_config/* getConfig */.zj)().folderId, token, category);
                    logger.success(`📁 [Drive] 신규 작품 폴더 선제 생성 완료 -> ID: ${activeFolderId}`);
                } catch (folderErr) {
                    logger.error(`❌ [Drive] 폴더 선제 생성 중 에러 발생: ${folderErr.message}`);
                }
            }

            // 모든 pendingEpisodes에 확정된 폴더 ID 주입
            const mappedEpisodes = pendingEpisodes.map(ep => ({
                ...ep,
                folderId: activeFolderId || ''
            }));

            const injected = (0,queue/* addEpisodesToQueue */.id)(mappedEpisodes, seriesTitle);
            logger.log(`🗂️ [공통 큐] 수집 대상 ${injected}개 에피소드를 대기열에 선등록 완료.`, 'Queue');
        }

        // [v1.21.0] 차세대 자율형 멀티큐 배치 수집기 기동 가교 (구글 드라이브 업로드 전용 비동기 스케줄러 라우팅)
        if (destination === 'drive' && !currentIsSingleVolume) {
            logger.log(`🚦 [멀티큐] 차세대 자율형 멀티큐 배치 수집기(v1.21.0) 가동 준비...`, 'Queue');

            // 팝업 차단 회피용 동기적 자식 창 사전 오픈 (Pre-open)
            const MAX_CONCURRENCY = 2;
            const openCount = Math.min(MAX_CONCURRENCY, pendingEpisodes.length);
            logger.log(`🛡️ 팝업 차단 필터 우회를 위한 자식 창 ${openCount}개 선제 확보(Pre-open) 중...`, 'Queue');

            const width = 400;
            const height = 600;
            const leftBase = window.screen.width - width - 50;
            const topBase = 100;

            const freshlyOpened = [];
            for (let i = 0; i < openCount; i++) {
                const ep = pendingEpisodes[i];
                const id = (0,queue/* getQueueItemId */.G8)(seriesTitle, ep.episodeNum);
                const left = leftBase - (i * 50);
                const top = topBase + (i * 50);
                const workerName = `tokisync_novel_worker_${id}`.replace(/[^a-zA-Z0-9_]/g, '');

                logger.log(`🚀 [Pre-open #${i + 1}] 자식 팝업 창 생성: ${ep.title}`);
                const popupRef = window.open(
                    ep.url,
                    workerName,
                    `width=${width},height=${height},left=${left},top=${top},noopener=false,scrollbars=yes,resizable=yes`
                );

                if (popupRef) {
                    queue/* activeWorkers */.mR.set(id, popupRef);
                    (0,queue/* updateQueueItem */.Gg)(id, { status: 'processing', stage: queue/* WORKER_STAGE */.WB.INIT });
                    freshlyOpened.push(id);
                } else {
                    logger.error(`❌ [Pre-open #${i + 1}] 브라우저 차단으로 자식 창 확보에 실패하였습니다.`, 'Queue');
                }
            }

            if (freshlyOpened.length > 0) {
                logger.success(`🚦 멀티큐 스케줄러 기동 완료. 릴레이 루프 활성화.`, 'Queue');
                (0,worker_controller/* initBatchWorkerController */.hh)();
                (0,queue/* initQueueScheduler */.$8)();
            } else {
                logger.error(`❌ 선제 확보된 자식 창이 없어 큐 수집을 중지합니다.`, 'Queue');
                stopSilentAudio();
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
            masterNovelBuilder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder();
            logger.log(`📙 소설 단행본 합본 모드 활성화 (${novelFormat.toUpperCase()}) (마지막에 한 번에 저장됩니다)`);
        }

        // --- Processing Loop ---
        for (let i = 0; i < list.length; i++) {
            const item = parser.parseListItem(list[i].element || list[i]); 
            console.clear();
            logger.info(`[${i + 1}/${list.length}] 처리 중: ${item.title}`);

            // [v1.5.0 Smart Skip] Skip already-uploaded episodes (Drive policy only)
            // [v1.7.1] Bypass skipping in Single Volume mode (we need all chapters)
            if (!isSingleVolume && destination === 'drive') {
                const numStr = item.num ? item.num.toString() : '';
                const numPlain = parseInt(numStr).toString();
                if (uploadedHistorySet.size > 0 && (uploadedHistorySet.has(numStr) || uploadedHistorySet.has(numPlain))) {
                    logger.log(`⏭️ 건너뜀 (이미 업로드됨): ${item.title}`);
                    continue;
                }
                
                // [v1.7.4] 페일세이프: 타임아웃 발생 시 개별 단위 핀셋 조회 수행
                if (historyCheckTimeoutFlag && historyFolderId) {
                    logger.log(`🔍 [페일세이프] 타임아웃 2차 단일 로컬/원격 검사 중: ${item.title}`);
                    const isUploaded = await (0,network/* checkSingleHistoryDirect */.OS)(historyFolderId, numStr);
                    if (isUploaded) {
                        logger.log(`⏭️ [페일세이프 재검사] 건너뜀 (이미 업로드됨): ${item.title}`);
                        continue;
                    }
                }
            }

            // Decision based on Policy
            let currentBuilder = null;

            // [v1.6.0] Strategy: Always use a FRESH builder per item for Kavita compatibility
            // [v1.7.1] Except for Novel Single Volume Mode
            if (isSingleVolume) {
                currentBuilder = masterNovelBuilder;
            } else {
                if (isNovel) currentBuilder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder();
                else currentBuilder = new CbzBuilder();
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
                    logger.log(`📥 챕터 추가 완료: ${item.title} (현재 ${currentSize}개)`, 'Downloader');
                }
            } catch (err) {
                console.error(err);
                const errorMsg = err.message || "알 수 없는 오류";
                logger.error(`항목 처리 실패 (${item.title}): ${errorMsg}`, 'Downloader');
                
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
                    const paddingVal = parseInt(config.localEpisodePadding, 10);
                    const paddedNum = paddingVal > 0 
                        ? (item.num || '').toString().padStart(paddingVal, '0') 
                        : (item.num || '').toString();

                    const template = config.localNameTemplate || "{number} - {title}";
                    fullFilename = template
                        .replace(/{number}/g, paddedNum)
                        .replace(/{rawNumber}/g, (item.num || '').toString())
                        .replace(/{series}/g, seriesTitle || rootFolder || '')
                        .replace(/{title}/g, chapterTitle || '');
                } else {
                    const paddedNum = (item.num || '').toString().padStart(4, '0');
                    fullFilename = `${paddedNum} - ${chapterTitle}`;
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
                    // Novel: Infinite batch. Webtoon: 20 per batch to prevent OOM
                    const processedCount = i + 1;
                    const isLastItem = (i === list.length - 1);
                    const BATCH_SIZE = isNovel ? Infinity : 20;

                    if ((BATCH_SIZE !== Infinity && processedCount % BATCH_SIZE === 0) || isLastItem) {
                        const batchNum = Math.ceil(processedCount / BATCH_SIZE);
                        const batchFilename = `${rootFolder}_Part${batchNum}`;
                        
                        logger.info(`📦 배치 저장 중... (${batchFilename})`);
                        await (0,utils/* saveFile */.OJ)(masterZip, batchFilename, 'local', 'zip', { category });
                        
                        // Clear masterZip for next batch to save memory
                        masterZip = new JSZip();
                    }
                } else if (buildingPolicy === 'individual') {
                    // [v1.6.0] Phase B-3: Fast Path Smart Branching
                    let success = false;
                    const cachedFileId = episodeCacheMap.get(fullFilename);

                    if (destination === 'drive' && cachedFileId) {
                        try {
                            logger.log(`⚡ [Fast Path] 캐시 히트! 무탐색 덮어쓰기 (PUT) 진행 -> ID: ${cachedFileId}`);
                            
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
                                const bytes = new Uint8Array(chunkBuffer);
                                
                                // High-speed Base64 encode
                                let binary = "";
                                const chunk_size = 0x8000; // 32KB
                                for (let j = 0; j < bytes.length; j += chunk_size) {
                                    binary += String.fromCharCode.apply(null, bytes.subarray(j, j + chunk_size));
                                }
                                const chunkBase64 = window.btoa(binary);

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
                            
                            logger.success(`⚡ [Fast Path] ${fullFilename} 업데이트(PUT) 완료!`, 'FastPath');
                            success = true;
                        } catch (fastPathErr) {
                            const errMsg = fastPathErr.message || "";
                            logger.log(`⚠️ Fast Path 업로드 중 에러 발생 (${errMsg}), Fallback 시작...`, 'warn', 'FastPath');
                            
                            // [v1.7.3] 자가 회복 로직: 휴지통 또는 파일 부재 시 캐시 삭제
                            const lowerMsg = errMsg.toLowerCase();
                            if (lowerMsg.includes('trash') || lowerMsg.includes('not found')) {
                                logger.warn(`🗑️ [Fast Path] 휴지통/부재 감지 → 캐시에서 해당 항목 삭제 및 일반 업로드 전환: ${fullFilename}`);
                                episodeCacheMap.delete(fullFilename);
                            }
                            
                            success = false; // Fallback
                        }
                    }

                    if (!success) {
                        // Fallback (or local save)
                        logger.log(`[Upload] 일반 업로드(Create/POST) 진행...`);
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
                    
                    logger.info(`📚 단행본 조립 및 저장 중... (${finalFilename})`);
                    
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
                    
                    logger.success(`✅ 단행본 합본 저장 완료: ${finalFilename}`);
                } catch (epubErr) {
                    logger.error(`단행본 빌드 실패: ${epubErr.message}`);
                }
            } else {
                logger.warn('⚠️ 유효한 챕터가 없어 단행본 빌드를 취소합니다.', 'Downloader');
            }
        }

        // Cleanup
        iframe.remove();

        // Finalize Build (Batching logic already handles zipOfCbzs during loop)
        if (buildingPolicy === 'folderInCbz') {
            // Deprecated path, handled by zipOfCbzs transition
        }

        // [v1.5.5] 배치 완료 후 Drive 캐시 단일 갱신 (에피소드마다 호출하지 않음)
        if (destination === 'drive') {
            (0,gas/* refreshCacheAfterUpload */.jz)(rootFolder, category, seriesMetadata).catch(e =>
                logger.warn(`캐시 갱신 호출 중 실패 (무시): ${e.message}`, 'GAS:Cache')
            );
        }

        logger.success(`✅ 모든 작업 완료!`);
        ui/* Notifier */.ze.notify('TokiSync', `다운로드 완료! (${list.length - failedEpisodes.length}개 성공, ${failedEpisodes.length}개 실패)`);

        // [v1.8.1] 고도화된 실패 리포트 생성 및 저장 (MCP 검토 반영)
        await generateDownloadReport(seriesTitle || rootFolder, seriesId, list.length, failedEpisodes, partialFailures);

    } catch (error) {
        console.error(error);
        logger.error(`전체 다운로드 루틴 오류 발생: ${error.message}`, 'System');
        alert(`다운로드 중 오류 발생:\n${error.message}`);
    } finally {
        // Auto-stop Anti-Sleep mode
        stopSilentAudio();
        logger.log('[Anti-Sleep] 백그라운드 모드 자동 종료');
        
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
    const logger = ui.LogBox.getInstance();
    if (failedEpisodes.length === 0 && partialFailures.length === 0) return;

    logger.warn(`⚠️ 다운로드 중 일부 오류가 발견되었습니다. 리포트를 생성합니다.`, 'System');

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
        logger.success(`✅ 실패 리포트 다운로드 완료: ${reportFilename}.txt`);
    } catch (e) {
        console.error('[Downloader] 리포트 저장 실패:', e);
    }
}

;// ./src/core/main.js

 












async function main() {
    console.log("🚀 TokiDownloader Loaded (New Core v1.20.5)");
    
    const logger = ui.LogBox.getInstance();

    // -- 0. Core Logic starts after helper function definitions --

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

    const runFilenameMigration = async () => {
        if (!confirm('현재 작품의 파일명을 표준화하시겠습니까?\n(예: "0001 - 1화.cbz" -> "0001 - 제목 1화.cbz")')) return;
        
        const parserInfo = await ParserFactory/* ParserFactory */.O.getParser();
        if (!parserInfo) {
            alert('현재 사이트를 지원하는 파서를 찾을 수 없습니다.');
            return;
        }
        
        const seriesId = parserInfo.parser.getSeriesId();

        if (!seriesId || seriesId === "0000") {
            alert('시리즈 ID를 찾을 수 없습니다.');
            return;
        }

        try {
            logger.show();
            logger.log('이름 변경 작업 요청 중...');
            
            const token = await (0,network/* getOAuthToken */.Py)(); // FIXME: OAuth or API Key? Config uses API Key usually.
            const config = (0,core_config/* getConfig */.zj)();
            
            if (!config.gasUrl) {
                alert('GAS URL이 설정되지 않았습니다.');
                return;
            }

            GM_xmlhttpRequest({
                method: "POST",
                url: config.gasUrl,
                data: JSON.stringify({
                    type: 'view_migrate_filenames',
                    seriesId: seriesId,
                    folderId: config.folderId,
                    apiKey: config.apiKey,
                    protocolVersion: 3
                }),
                headers: {
                    // "Authorization": `Bearer ${token}`, // If using OAuth
                    "Content-Type": "application/json"
                },
                onload: (res) => {
                    try {
                        const result = JSON.parse(res.responseText);
                        if (result.status === 'success') {
                            const logs = Array.isArray(result.body) ? result.body.join('\n') : result.body;
                            logger.success(`작업 완료!\n로그:\n${logs}`);
                            alert(`작업이 완료되었습니다.`);
                        } else {
                            logger.error(`작업 실패: ${result.body}`);
                            alert(`실패: ${result.body}`);
                        }
                    } catch (parseErr) {
                        logger.error(`응답 파싱 실패: ${parseErr.message}`);
                    }
                },
                onerror: (err) => {
                    logger.error(`네트워크 오류: ${err.statusText}`);
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
        GM_registerMenuCommand('⚙️ 설정 (Settings)', () => logger.openDashboard('settings'));
        GM_registerMenuCommand('🌐 Viewer 열기', openViewer);
    }

    // -- 2. Pre-detection & Core States --
    const siteInfo = await (0,detector/* detectSite */.T)();
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
            const parser = await ParserFactory/* ParserFactory */.O.getParser();
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
                    await (0,ui/* markDownloadedItems */.hV)(result.data);
                } else {
                    console.log('[TokiSync] No history items found in Drive');
                }
            } else {
                // Fallback to Legacy GAS if Direct fails
                console.warn('[TokiSync] Direct history fetch failed, trying legacy GAS relay...');
                const legacyHistory = await (0,gas/* fetchHistory */.Ny)(rootFolder, category);
                if (legacyHistory && legacyHistory.length > 0) {
                    await (0,ui/* markDownloadedItems */.hV)(legacyHistory);
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
        toggleLog: () => logger.toggle(),
        getConfig: core_config/* getConfig */.zj,
        setConfig: core_config/* setConfig */.Nk,
        getEpisodeRange: async () => {
            const parser = await ParserFactory/* ParserFactory */.O.getParser();
            if (!parser) return { min: 1, max: 100 };
            
            const list = parser.getListItems();
            if (list.length > 0) {
                const first = parser.parseListItem(list[0]);
                const last = parser.parseListItem(list[list.length - 1]);
                const min = Math.min(parseInt(first.num), parseInt(last.num));
                const max = Math.max(parseInt(first.num), parseInt(last.num));
                return { min, max };
            }
            return { min: 1, max: 100 };
        },
        migrateFilenames: runFilenameMigration,
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
                const logger = ui.LogBox.getInstance();
                logger.show();
                logger.log('🧪 추출 테스트 시작...', 'Debug');
                
                const parser = await ParserFactory/* ParserFactory */.O.getParser();
                if (!parser) {
                    logger.error('❌ 파서를 찾을 수 없습니다.', 'Debug');
                    return;
                }

                const siteInfo = await (0,detector/* detectSite */.T)();
                // 현재 페이지(document)를 대상으로 추출 테스트
                const result = await (0,extractor/* extractEpisodeData */.d)(document, parser, siteInfo, false);
                
                console.log('[Debug Result]', result);
                
                if (result.urls && result.urls.length > 0) {
                    logger.success(`✅ 이미지 추출 성공: ${result.urls.length}개`, 'Debug');
                } else if (result.content) {
                    logger.success(`✅ 소설 추출 성공: ${result.content.length}자`, 'Debug');
                } else {
                    logger.warn('⚠️ 추출된 데이터가 없습니다. (뷰어 페이지가 아닐 수 있음)', 'Debug');
                }
                
                if (result.seriesTitle && result.seriesTitle !== "UnknownSeries") {
                    logger.log(`📚 작품명: ${result.seriesTitle}`, 'Debug');
                    logger.log(`🔖 에피소드: ${result.episodeTitle} (${result.episodeNum})`, 'Debug');
                }

            } catch (e) {
                ui.LogBox.getInstance().error(`❌ 테스트 실패: ${e.message}`, 'Debug');
                console.error(e);
            }
        },
        downloadCurrent: async () => {
            const logger = ui.LogBox.getInstance();
            try {
                logger.show();
                logger.log('🚀 현재 에피소드 다운로드 시작...', 'System');
                
                const siteInfo = await (0,detector/* detectSite */.T)();
                const parser = await ParserFactory/* ParserFactory */.O.getParser();
                if (!parser) throw new Error('파서를 찾을 수 없습니다.');

                // 1. 메타데이터 추출 (제목 등 확인용)
                const metadata = await (0,extractor/* extractEpisodeData */.d)(document, parser, siteInfo, false);
                const title = metadata.episodeTitle || "Current_Episode";
                const seriesTitle = metadata.seriesTitle || "Unknown_Series";

                // 2. 빌더 생성 (카테고리에 따라)
                const isNovel = (siteInfo.category === 'Novel' || siteInfo.category === 'novel');
                let builder;
                let extension = 'cbz';
                if (isNovel) {
                    const novelFormat = (0,core_config/* getConfig */.zj)().novelFormat || 'epub';
                    builder = novelFormat === 'txt' ? new TxtBuilder() : new EpubBuilder(seriesTitle, { author: "TokiSync" });
                    extension = novelFormat;
                } else {
                    builder = new CbzBuilder(title);
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
                logger.log('💾 파일 생성 및 저장 중...', 'System');
                
                const zip = await builder.build({
                    series: seriesTitle,
                    title: title,
                    number: tempItem.num
                });
                
                const blob = await zip.generateAsync({ type: "blob" });
                const filename = `${tempItem.num} - ${title}`;

                await (0,utils/* saveFile */.OJ)(blob, filename, 'local', extension, { category: siteInfo.category });
                logger.success('✅ 다운로드 완료!', 'System');

            } catch (e) {
                logger.error(`❌ 다운로드 실패: ${e.message}`, 'System');
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
// EXTERNAL MODULE: ./src/core/parsers/GenericParser.js + 1 modules
var GenericParser = __webpack_require__(443);
// EXTERNAL MODULE: ./src/core/novel-decryptor.js
var novel_decryptor = __webpack_require__(602);
;// ./src/core/worker-extractor.js
/**
 * tokiSync - Self-contained Worker Extractor
 * Executes extraction, packaging, and direct Drive uploading inside the child popup.
 */










// Define localized stage reporting helper
function reportProgress(queueId, percent, stage) {
    (0,queue/* updateQueueItem */.Gg)(queueId, {
        progressPercent: Math.min(100, Math.max(0, Math.round(percent))),
        stage: stage
    });
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
    console.log("🚀 [TokiSync:Worker] 자립형 워커 엔진 시동 완료");

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
    const cleanupIpc = (0,ipc_broker/* registerIpcListener */.Q_)(async (msg) => {
        if (msg.type === 'START_EXTRACTION') {
            const { queueId } = msg.payload;

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
            reportProgress(queueId, 10, queue/* WORKER_STAGE */.WB.DOM_READY);

            // Reconstruct parser instance using injected matchedRule
            const parser = new GenericParser/* GenericParser */.b(protocolDomain || window.location.origin, matchedRule);
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
                    reportProgress(queueId, 20, queue/* WORKER_STAGE */.WB.DOM_READY);
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
                            reportProgress(queueId, 50, queue/* WORKER_STAGE */.WB.PARSING);
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
                        await (0,utils/* sleep */.yy)(500);
                    }

                    // Fallback to Plan C: Decryption API
                    if ((!content || content.trim().length < 100) && viewerCfg.decryptApi) {
                        console.warn("[TokiSync:Worker] Shadow DOM 추출 실패 - Plan C API 복호화 폴백 구동");
                        content = await (0,novel_decryptor/* fetchNovelTextViaApi */.i)(window.location.href, viewerCfg.decryptApi);
                    }

                    if (!content || content.trim().length < 100) {
                        throw new Error("소설 본문 추출에 실패했습니다. (Shadow DOM/API 복호화 무반응)");
                    }

                    reportProgress(queueId, 70, queue/* WORKER_STAGE */.WB.PARSING);
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
                    reportProgress(queueId, 20, queue/* WORKER_STAGE */.WB.DOM_READY);

                    // Wait for comic content inside DOM
                    const contentDoc = await (0,utils/* waitForContent */.UF)(window, Math.round(10000 * scanSpeedMultiplier), viewerCfg);
                    if (!contentDoc) {
                        console.warn("[TokiSync:Worker] 10초 내 콘텐츠 렌더링 미감지. 갈무리 강행.");
                    }

                    // 1.5s DOM Stabilization delay
                    reportProgress(queueId, 30, queue/* WORKER_STAGE */.WB.DOM_READY);
                    await (0,utils/* sleep */.yy)(1500);

                    console.log("[TokiSync:Worker] 스크롤 로드 및 이미지 다운로드 활성화");
                    reportProgress(queueId, 40, queue/* WORKER_STAGE */.WB.SCROLLING);

                    // Physical scroll down
                    await (0,utils/* scrollToLoad */.Vs)(document, 25000, viewerCfg, scanSpeedMultiplier);

                    // Downloader helper with concurrency 5
                    const runImageDownloads = async (imageUrls) => {
                        const downloaded = [];
                        const CONCURRENCY_LIMIT = 5;
                        let processedCount = 0;

                        reportProgress(queueId, 0, queue/* WORKER_STAGE */.WB.DOWNLOADING);

                        for (let i = 0; i < imageUrls.length; i += CONCURRENCY_LIMIT) {
                            const chunk = imageUrls.slice(i, i + CONCURRENCY_LIMIT);
                            const chunkPromises = chunk.map(async (url, index) => {
                                const globalIndex = i + index;
                                try {
                                    const imgBlob = await (0,utils/* fetchBlobWithXHR */.Kt)(url, window.location.href);
                                    const arrayBuffer = await (0,utils/* blobToArrayBuffer */._L)(imgBlob);
                                    processedCount++;

                                    const percent = (processedCount / imageUrls.length) * 100;
                                    reportProgress(queueId, percent, queue/* WORKER_STAGE */.WB.DOWNLOADING);

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
                                    reportProgress(queueId, percent, queue/* WORKER_STAGE */.WB.DOWNLOADING);

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
                        reportProgress(queueId, 35, queue/* WORKER_STAGE */.WB.SCROLLING);
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

                    console.log(`🎯 [TokiSync:Worker] 이미지 조립 및 CBZ 빌딩 개시`);
                    reportProgress(queueId, 85, queue/* WORKER_STAGE */.WB.PARSING);

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
                reportProgress(queueId, 90, queue/* WORKER_STAGE */.WB.UPLOADING);

                await (0,utils/* saveFile */.OJ)(blob, fullFilename, destination || 'drive', extension, {
                    folderName: rootFolder || seriesTitle,
                    category: targetType,
                    folderId: folderId || ''
                });

                console.log(`[TokiSync:Worker] 🎉 에피소드 수집 & 저장 완착 완료! (${fullFilename})`);
                
                // Update final queue status inside Dexie/GM storage
                (0,queue/* updateQueueItem */.Gg)(queueId, { 
                    status: 'completed', 
                    stage: queue/* WORKER_STAGE */.WB.COMPLETED, 
                    progressPercent: 100 
                });
                
                reportProgress(queueId, 100, queue/* WORKER_STAGE */.WB.COMPLETED);
                
                // Notify parent that task succeeded
                (0,ipc_broker/* sendToParent */.Ac)('TASK_COMPLETED', { queueId });
                cleanupIpc();

            } catch (err) {
                console.error(`[TokiSync:Worker] ❌ 에피소드 수집 중 치명적 오류 발생:`, err);
                
                (0,queue/* updateQueueItem */.Gg)(queueId, { 
                    status: 'failed', 
                    stage: queue/* WORKER_STAGE */.WB.FAILED, 
                    errorMsg: err.message 
                });
                
                reportProgress(queueId, 0, queue/* WORKER_STAGE */.WB.FAILED);
                
                // Notify parent that task failed
                (0,ipc_broker/* sendToParent */.Ac)('TASK_FAILED', { queueId, errorMsg: err.message });
                cleanupIpc();
            }
        }
    });
}

;// ./src/core/index.js



(async function () {
    'use strict';

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