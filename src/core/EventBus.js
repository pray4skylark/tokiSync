const _listeners = {};

export const EventBus = {
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
export const EVT = {
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
