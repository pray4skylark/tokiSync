/**
 * 🌉 useBridge - Userscript Bridge Composable
 * Handles communication between Viewer (Web Page) and UserScript (extension context).
 * - Zero-Config: Receives TOKI_CONFIG from UserScript automatically.
 * - Proxy Fetch: Routes requests through UserScript's GM_xmlhttpRequest to bypass CORS.
 */
import { ref, onUnmounted } from 'vue';

// --- Singleton State ---
const isConnected = ref(false);
const pendingRequests = new Map();

let _messageHandler = null;
let _initialized = false;

/**
 * Generates a unique request ID
 */
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Handles incoming messages from UserScript
 */
function handleMessage(event) {
  const { type, payload, requestId, error } = event.data || {};

  // Bridge Response (Proxy Fetch)
  if (type === 'TOKI_BRIDGE_RESPONSE') {
    const resolver = pendingRequests.get(requestId);
    if (resolver) {
      if (error) {
        resolver.reject(new Error(error));
      } else {
        resolver.resolve(payload);
      }
      pendingRequests.delete(requestId);
    }
  }
}

/**
 * Initialize Bridge (singleton, only once)
 * @param {Function} onConfigReceived - Callback when TOKI_CONFIG is received: (url, folderId, apiKey) => void
 */
function initBridge(onConfigReceived) {
  if (_initialized) return;
  _initialized = true;

  // Check if opened by UserScript
  isConnected.value = !!(window.opener && !window.opener.closed);

  // Listen for messages
  _messageHandler = (event) => {
    const { type } = event.data || {};

    // Zero-Config Handshake
    if (type === 'TOKI_CONFIG') {
      const { url, folderId, apiKey } = event.data;
      if (url && folderId) {
        console.log('⚡️ Auto-Config Injected:', { url, folderId, apiKey: apiKey ? '***' : '(empty)' });
        if (onConfigReceived) onConfigReceived(url, folderId, apiKey || '');
      }
    }

    // Bridge Response
    handleMessage(event);
  };

  window.addEventListener('message', _messageHandler, false);
}

/**
 * Proxy fetch via UserScript (bypasses CORS)
 * @param {string} url - Target URL
 * @param {Object} options - Fetch options (method, headers, responseType, etc.)
 * @returns {Promise<any>} Response data or null if bridge is disconnected
 */
async function bridgeFetch(url, options = {}) {
  if (!isConnected.value || !window.opener || window.opener.closed) {
    return null; // Graceful fallback
  }

  const requestId = generateId();

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });

    // Send Request to UserScript
    window.opener.postMessage({
      type: 'TOKI_BRIDGE_REQUEST',
      requestId: requestId,
      url: url,
      options: options,
    }, '*');

    // Timeout safety (30s)
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.get(requestId).reject(new Error('Bridge Request Timeout'));
        pendingRequests.delete(requestId);
      }
    }, 30000);
  });
}

/**
 * Cleanup Bridge (call on app unmount if needed)
 */
function destroyBridge() {
  if (_messageHandler) {
    window.removeEventListener('message', _messageHandler, false);
    _messageHandler = null;
  }
  pendingRequests.clear();
  _initialized = false;
}

export function useBridge() {
  return {
    isConnected,
    initBridge,
    bridgeFetch,
    destroyBridge,
  };
}
