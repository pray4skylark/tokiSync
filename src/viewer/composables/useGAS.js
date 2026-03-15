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
  return `https://script.google.com/macros/s/${gasConfig.gasId}/exec`;
}

/**
 * Core API request function
 * @param {string} type - Request type (e.g. 'view_get_library')
 * @param {object} payload - Additional data
 * @returns {Promise<any>} Response body
 */
async function request(type, payload = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('API ID가 설정되지 않았습니다.');

  const bodyData = {
    ...payload,
    type: type,
    folderId: gasConfig.folderId,
    apiKey: gasConfig.apiKey,
    protocolVersion: 3,
  };

  try {
    // text/plain to avoid CORS preflight with GAS
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(bodyData),
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
    console.error(`[GAS] Request Failed (${type}):`, e);
    throw e;
  }
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
        if (step > 1) {
          // Background save index
          request('view_save_index', { seriesList: allSeries })
            .then((r) => console.log('📝 Index saved:', r))
            .catch((e) => console.warn('❌ Index save failed:', e));
        }
        break;
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
async function getChunk(fileId, offset, length) {
  return await request('view_get_chunk', { fileId, offset, length });
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

export function useGAS() {
  return {
    gasConfig,
    setConfig,
    isConfigured,
    request,
    getLibrary,
    getBooks,
    getChunk,
    getReadHistory,
    saveReadHistory,
  };
}
