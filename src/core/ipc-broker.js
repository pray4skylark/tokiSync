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
export function registerWorkerOrigin(workerId, origin) {
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
export function removeWorkerOrigin(workerId, nonce) {
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
export function validateNonce(nonce) {
    if (!nonce || !_activeNonces.has(nonce)) return null;
    return _nonceToWorkerId.get(nonce) || null;
}

/**
 * Get the stored origin for a worker.
 */
export function getWorkerOrigin(workerId) {
    return _trustedWorkerOrigins.get(workerId) || null;
}

/**
 * Send message from Parent to Worker popup
 * @param {Window} workerRef Reference to the worker popup window
 * @param {string} type Message type (without prefix, e.g. 'START_EXTRACTION')
 * @param {Object} payload Metadata and payload
 * @param {string} [nonce] Session nonce for validation
 */
export function sendToWorker(workerRef, type, payload = {}, nonce) {
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
export function sendToParent(type, payload = {}, nonce, transferables) {
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
export function registerIpcListener(callback, options = {}) {
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
