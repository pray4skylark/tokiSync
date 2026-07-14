/**
 * 🚀 useGAS - Google Apps Script API Client Composable
 * Handles all communication with the GAS backend.
 * Replaces legacy TokiApiClient class.
 */
import { reactive } from 'vue';

// --- Singleton Config ---
const gasConfig = reactive({
  gasId: '',
  folderId: '',
  apiKey: '',
});

let _configLoaded = false;

// --- Bridge Transport ---
let _bridgeFetch = null;

// --- Dedup (in-flight request tracking) ---
const _inFlight = new Map();

// --- Timeout & Retry ---
const REQUEST_TIMEOUT = 30000;
const MAX_RETRIES = 2;

/**
 * Load config from localStorage (fallback for standalone mode)
 */
function loadFromLocalStorage() {
  if (_configLoaded) return;
  _configLoaded = true;

  let gasId = localStorage.getItem('TOKI_GAS_ID') || '';
  const legacyUrl = localStorage.getItem('TOKI_API_URL') || '';

  // Auto-migration: legacy URL -> gasId
  if (!gasId && legacyUrl) {
    const match = legacyUrl.match(/\/s\/([^\/]+)\/exec/);
    if (match) {
      gasId = match[1];
      localStorage.setItem('TOKI_GAS_ID', gasId);
      console.log('✅ [useGAS] Auto-migrated legacy URL to gasId:', gasId);
    }
  }

  gasConfig.gasId = gasId;
  gasConfig.folderId = localStorage.getItem('TOKI_ROOT_ID') || '';
  gasConfig.apiKey = localStorage.getItem('TOKI_API_KEY') || '';

  if (gasConfig.gasId) {
    console.log('📦 GAS Config loaded from localStorage');
  }
}

/**
 * Set bridge fetch function (UserScript transport, preferred when available)
 */
function setBridgeFetch(fn) {
  _bridgeFetch = fn;
}

/**
 * Set config (called from Bridge on TOKI_CONFIG or from Settings UI)
 */
function setConfig(gasId, folderId, apiKey = '') {
  // If a full URL is passed, extract the ID
  let targetId = gasId;
  const match = gasId.match(/\/s\/([^\/]+)\/exec/);
  if (match) targetId = match[1];

  gasConfig.gasId = targetId;
  gasConfig.folderId = folderId;
  gasConfig.apiKey = apiKey;

  // Persist to localStorage
  localStorage.setItem('TOKI_GAS_ID', targetId);
  localStorage.setItem('TOKI_ROOT_ID', folderId);
  localStorage.setItem('TOKI_API_KEY', apiKey);

  console.log('✅ GAS Config set:', { gasId: targetId, folderId, apiKey: apiKey ? '***' : '(empty)' });
}

/**
 * Check if API is configured
 */
function isConfigured() {
  return !!(gasConfig.gasId && gasConfig.folderId);
}

/**
 * Get the full execution URL
 */
function getBaseUrl() {
  if (!gasConfig.gasId) return '';
  
  // Proxy routing removed due to HTTP 500 errors with Google's 302 redirects.
  // Google Apps Script natively supports CORS for POST requests with Content-Type: text/plain.
  return `https://script.google.com/macros/s/${gasConfig.gasId}/exec`;
}

// --- Helpers ---

function _isRetryable(error) {
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return false;
  if (error.message?.startsWith('HTTP Error: 5')) return true;
  if (error.name === 'TypeError') return true;
  return false;
}

function _delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function _composeSignal(timeoutMs, externalSignal) {
  if (!externalSignal) {
    try { return AbortSignal.timeout(timeoutMs); } catch (e) {
      const c = new AbortController();
      setTimeout(() => c.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
      return c.signal;
    }
  }
  if (externalSignal.aborted) {
    const c = new AbortController();
    c.abort(externalSignal.reason);
    return c.signal;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  externalSignal.addEventListener('abort', () => {
    clearTimeout(timeoutId);
    controller.abort(externalSignal.reason);
  }, { once: true });
  return controller.signal;
}

/**
 * Core API request function
 * @param {string} type - Request type (e.g. 'view_get_library')
 * @param {object} payload - Additional data
 * @param {AbortSignal|null} signal - External cancellation signal
 * @returns {Promise<any>} Response body
 */
async function request(type, payload = {}, signal = null) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('API ID가 설정되지 않았습니다.');

  const bodyData = {
    ...payload,
    type,
    folderId: gasConfig.folderId,
    apiKey: gasConfig.apiKey,
    protocolVersion: 3,
  };

  const bodyStr = JSON.stringify(bodyData);

  // Dedup: coalesce identical in-flight non-chunk requests
  if (type !== 'view_get_chunk') {
    const dedupKey = `${type}:${bodyStr}`;
    const existing = _inFlight.get(dedupKey);
    if (existing) {
      console.log(`[GAS] Dedup hit for ${type}`);
      return existing;
    }
    const promise = _executeRequest(type, baseUrl, bodyStr, signal);
    _inFlight.set(dedupKey, promise);
    promise.finally(() => {
      if (_inFlight.get(dedupKey) === promise) _inFlight.delete(dedupKey);
    });
    return promise;
  }

  return _executeRequest(type, baseUrl, bodyStr, signal);
}

async function _executeRequest(type, baseUrl, bodyStr, signal) {
  if (_bridgeFetch && type !== 'view_get_chunk') {
    return _bridgeRequest(type, baseUrl, bodyStr);
  }
  return _nativeRequest(type, baseUrl, bodyStr, signal);
}

async function _bridgeRequest(type, baseUrl, bodyStr) {
  const payload = await _bridgeFetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    data: bodyStr,
  });
  if (!payload) throw new Error('Bridge transport returned no data');

  let json;
  try {
    json = typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch (e) {
    throw new Error(`Bridge response parse failed: ${e.message}`);
  }
  if (json.status === 'error') {
    throw new Error(json.body || 'Unknown Server Error');
  }
  return json.body;
}

async function _nativeRequest(type, baseUrl, bodyStr, signal) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const fetchSignal = _composeSignal(REQUEST_TIMEOUT, signal);
    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: bodyStr,
        signal: fetchSignal,
      });
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      const json = await response.json();
      if (json.status === 'error') {
        throw new Error(json.body || 'Unknown Server Error');
      }
      return json.body;
    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError' || e.name === 'TimeoutError') throw e;
      if (attempt < MAX_RETRIES && _isRetryable(e)) {
        const delayMs = 1000 * (attempt + 1);
        console.warn(`[GAS] Retry ${attempt + 1}/${MAX_RETRIES} for ${type} in ${delayMs}ms: ${e.message}`);
        await _delay(delayMs);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

// --- Convenience API Methods ---

/**
 * Fetch library list (with pagination support)
 * @param {Object} options - { bypassCache, continuationToken }
 * @returns {Promise<Array>} Series list
 */
async function getLibrary(options = {}) {
  const allSeries = [];
  let continuationToken = options.continuationToken || null;
  let step = 1;

  while (true) {
    const payload = {};
    if (options.bypassCache) payload.bypassCache = true;
    if (continuationToken) payload.continuationToken = continuationToken;

    const response = await request('view_get_library', payload);

    if (Array.isArray(response)) {
      // Legacy / Simple Response
      allSeries.push(...response);
      break;
    } else if (response) {
      // Object Response (v3.3+)
      if (response.list && Array.isArray(response.list)) {
        allSeries.push(...response.list);
      }

      if (response.status === 'continue' && response.continuationToken) {
        continuationToken = response.continuationToken;
        step++;
        continue;
      } else {
        // Completed or unknown
        // 중복 제거 방어 코드 (백엔드 페이지네이션 버그로 쌓인 중복 데이터 정리)
        const uniqueSeries = [];
        const seenIds = new Set();
        for (const s of allSeries) {
          if (!seenIds.has(s.id)) {
            seenIds.add(s.id);
            uniqueSeries.push(s);
          }
        }

        if (step > 1) {
          // Background save index
          request('view_save_index', { seriesList: uniqueSeries })
            .then((r) => console.log('📝 Index saved:', r))
            .catch((e) => console.warn('❌ Index save failed:', e));
        }
        return uniqueSeries;
      }
    } else {
      console.warn('[GAS] Unknown API Response:', response);
      break;
    }
  }

  return allSeries;
}

/**
 * Fetch episode (book) list for a series
 * @param {string} seriesId - Series folder ID
 * @returns {Promise<Array>} Book list
 */
async function getBooks(seriesId, bypassCache = false) {
  return await request('view_get_books', { seriesId, bypassCache });
}

/**
 * Fetch a chunk of a file (for Client-side Unzip)
 * @param {string} fileId - File ID
 * @param {number} offset - Byte offset
 * @param {number} length - Chunk length
 * @returns {Promise<Object>} { data (base64), nextOffset, hasMore, totalSize }
 */
async function getChunk(fileId, offset, length, signal = null) {
  return await request('view_get_chunk', { fileId, offset, length }, signal);
}


// Initialize from localStorage on module load
loadFromLocalStorage();

/**
 * 읽기 이력 불러오기 (Drive)
 * @returns {Promise<Array>} 이력 배열
 */
async function getReadHistory() {
  return await request('view_history_get', {});
}

/**
 * 읽기 이력 저장 (Drive, 전체 덮어쓰기)
 * @param {Array} history - merge 완료된 이력 배열
 */
async function saveReadHistory(history) {
  return await request('view_history_save', { history });
}

/**
 * 메타데이터 업데이트 요청 (GAS)
 */
async function updateMetadata(seriesId, metadata) {
  return await request('view_update_metadata', { seriesId, metadata });
}

/**
 * 썸네일 직접 업로드 요청 (GAS)
 */
async function uploadThumbnail(seriesId, base64Data) {
  return await request('view_upload_thumbnail', { seriesId, base64Data });
}

export function useGAS() {
  return {
    gasConfig,
    setConfig,
    setBridgeFetch,
    isConfigured,
    request,
    getLibrary,
    getBooks,
    getChunk,
    getReadHistory,
    saveReadHistory,
    updateMetadata,
    uploadThumbnail,
  };
}
