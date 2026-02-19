/**
 * 🚀 useGAS - Google Apps Script API Client Composable
 * Handles all communication with the GAS backend.
 * Replaces legacy TokiApiClient class.
 */
import { reactive } from 'vue';

// --- Singleton Config ---
const gasConfig = reactive({
  baseUrl: '',
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

  gasConfig.baseUrl = localStorage.getItem('TOKI_API_URL') || '';
  gasConfig.folderId = localStorage.getItem('TOKI_ROOT_ID') || '';
  gasConfig.apiKey = localStorage.getItem('TOKI_API_KEY') || '';

  if (gasConfig.baseUrl) {
    console.log('📦 GAS Config loaded from localStorage (fallback)');
  }
}

/**
 * Set config (called from Bridge on TOKI_CONFIG or from Settings UI)
 */
function setConfig(url, folderId, apiKey = '') {
  gasConfig.baseUrl = url;
  gasConfig.folderId = folderId;
  gasConfig.apiKey = apiKey;

  // Persist to localStorage
  localStorage.setItem('TOKI_API_URL', url);
  localStorage.setItem('TOKI_ROOT_ID', folderId);
  localStorage.setItem('TOKI_API_KEY', apiKey);

  console.log('✅ GAS Config set:', { url, folderId, apiKey: apiKey ? '***' : '(empty)' });
}

/**
 * Check if API is configured
 */
function isConfigured() {
  return !!(gasConfig.baseUrl && gasConfig.folderId);
}

/**
 * Core API request function
 * @param {string} type - Request type (e.g. 'view_get_library')
 * @param {object} payload - Additional data
 * @returns {Promise<any>} Response body
 */
async function request(type, payload = {}) {
  if (!gasConfig.baseUrl) throw new Error('API URL이 설정되지 않았습니다.');

  const bodyData = {
    ...payload,
    type: type,
    folderId: gasConfig.folderId,
    apiKey: gasConfig.apiKey,
    protocolVersion: 3,
  };

  try {
    // text/plain to avoid CORS preflight with GAS
    const response = await fetch(gasConfig.baseUrl, {
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
async function getBooks(seriesId) {
  return await request('view_get_books', { seriesId });
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

export function useGAS() {
  return {
    gasConfig,
    setConfig,
    isConfigured,
    request,
    getLibrary,
    getBooks,
    getChunk,
  };
}
