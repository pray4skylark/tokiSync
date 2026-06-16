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
export function sendToWorker(workerRef, type, payload = {}) {
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
export function sendToParent(type, payload = {}) {
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
export function registerIpcListener(callback, listenerId = 'default') {
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
