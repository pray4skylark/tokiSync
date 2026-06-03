const _listeners = {};

export const EventBus = {
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
export const EVT = {
    LOG:            'log',            // { msg, level, tag } → LogBox에 출력
    NOTIFY_ERROR:   'notify:error',   // { msg } → alert() 대체
    NOTIFY_CONFIRM: 'notify:confirm', // { msg, onConfirm, onCancel } → confirm() 대체
    DOWNLOAD_DONE:  'download:done',  // 다운로드 배치 전체 완료
    UPDATE_PROGRESS: 'update:progress', // UI 진행 상황 강제 업데이트 신호
};
