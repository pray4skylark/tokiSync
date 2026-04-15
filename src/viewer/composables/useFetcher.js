import { ref } from 'vue';
import { useGAS } from './useGAS.js';
import { db } from './db.js';
import JSZip from 'jszip';

// --- Singleton State ---
const downloadProgress = ref('');
const isDownloading = ref(false);

// --- Global Configuration ---
const DOWNLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB
const CHUNK_COUNT = 6;

// --- File Cache (RAM) ---
let cachedFileId = null;
let cachedBytes = null;

// --- Preload Cache ---
let preloadPromise = null;
let preloadedFileId = null;
let preloadTargetFileId = null;
let preloadedBytes = null;
let isPreloading = ref(false);

// --- Active Blob URLs ---
let activeBlobUrls = [];

// --- Cancel State (분리: 뷰어 전용 vs 다운로드매니저 전용) ---
let _viewerController = null;    // fetchAndUnzip + preloadEpisode 전용
let _managerController = null;   // downloadBytesOnly 전용

/**
 * [v1.7.5] 뷰어 세션의 모든 네트워크 요청을 중단 (프리로드 포함)
 */
export function cancelViewerDownload() {
  if (_viewerController) {
    _viewerController.abort();
    console.log('[Fetcher] Viewer: Abort signal sent.');
  }
  _viewerController = null;
}

/**
 * [v1.7.5] 다운로드 매니저의 현재 작업만 중단
 */
export function cancelManagerDownload() {
  if (_managerController) {
    _managerController.abort();
    console.log('[Fetcher] Manager: Abort signal sent.');
  }
  _managerController = null;
}

/** @deprecated 하위 호환용 — cancelViewerDownload() 사용 권장 */
export function cancelDownload() {
  cancelViewerDownload();
}

function _newViewerSignal() {
  cancelViewerDownload(); // 이전 뷰어 요청 먼저 중단
  _viewerController = new AbortController();
  return _viewerController.signal;
}

function _newManagerSignal() {
  _managerController = new AbortController();
  return _managerController.signal;
}

function _cancelableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });
}

function cleanupBlobUrls() {
  activeBlobUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[Fetcher] Failed to revoke URL:', url, e);
    }
  });
  activeBlobUrls = [];
}

function base64ToBytes(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function saveToPersistentCache(fileId, bytes, seriesId = '') {
  try {
    await db.episodeData.put({
      fileId,
      bytes,
      seriesId,
      cachedAt: Date.now()
    });
    console.log(`[Cache:DB] Saved ${fileId} (series: ${seriesId}) to persistent storage.`);
  } catch (err) {
    console.warn(`[Cache:DB] Failed to save ${fileId}:`, err);
  }
}

async function loadFromPersistentCache(fileId) {
  try {
    const record = await db.episodeData.get(fileId);
    if (record) {
      db.episodeData.update(fileId, { cachedAt: Date.now() });
      return record.bytes;
    }
  } catch (err) {
    console.warn(`[Cache:DB] Failed to load ${fileId}:`, err);
  }
  return null;
}

/**
 * [v1.7.5] 격리된 다운로드 함수 (Download Manager용)
 * Blob URL을 생성하지 않고 순수 bytes만 IndexedDB에 저장합니다.
 * @returns {'completed' | 'cancelled' | 'failed'}
 */
export async function downloadBytesOnly(fileId, totalSize, seriesId, downloadThreads = 2, onProgress = null) {
  const { getChunk } = useGAS();
  const signal = _newManagerSignal();

  try {
    let bytes = null;
    if (totalSize > 0 && totalSize <= DOWNLOAD_THRESHOLD) {
      bytes = await fetchSingle(fileId, totalSize, getChunk, true, signal);
    } else if (totalSize === 0) {
      bytes = await fetchSequential(fileId, getChunk, true, signal);
    } else {
      bytes = await fetchConcurrent(fileId, totalSize, getChunk, downloadThreads, true, signal, onProgress);
    }

    if (bytes) {
      if (signal.aborted) return 'cancelled';
      await saveToPersistentCache(fileId, bytes, seriesId);
      return 'completed';
    }
    return 'failed';
  } catch (e) {
    if (e.name === 'AbortError') return 'cancelled';
    console.error(`[Fetcher] downloadBytesOnly error for ${fileId}:`, e);
    return 'failed';
  } finally {
    // 이 컨트롤러가 현재 매니저 컨트롤러와 동일하면 정리
    if (_managerController?.signal === signal) {
      _managerController = null;
    }
  }
}

async function fetchAndUnzip(fileId, totalSize, downloadThreads = 2, seriesId = '') {
  const { getChunk } = useGAS();
  const signal = _newViewerSignal(); // 뷰어 전용 Signal (이전 뷰어 요청 자동 중단)

  isDownloading.value = true;
  downloadProgress.value = '준비 중...';

  let combinedBytes = null;

  try {
    if (cachedFileId === fileId && cachedBytes) {
      combinedBytes = cachedBytes;
    } 
    else if (preloadedFileId === fileId && preloadedBytes) {
      combinedBytes = preloadedBytes;
    } 
    else if (preloadTargetFileId === fileId && preloadPromise) {
      downloadProgress.value = '사전 다운로드 대기 중...';
      combinedBytes = await preloadPromise;
    } 

    if (!combinedBytes) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      combinedBytes = await loadFromPersistentCache(fileId);
    }

    if (!combinedBytes) {
      if (totalSize > 0 && totalSize <= DOWNLOAD_THRESHOLD) {
        combinedBytes = await fetchSingle(fileId, totalSize, getChunk, false, signal);
      } else if (totalSize === 0) {
        combinedBytes = await fetchSequential(fileId, getChunk, false, signal);
      } else {
        combinedBytes = await fetchConcurrent(fileId, totalSize, getChunk, downloadThreads, false, signal);
      }

      if (combinedBytes && !signal.aborted) {
        saveToPersistentCache(fileId, combinedBytes, seriesId);
      }
    }

    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (combinedBytes) {
      if (fileId === preloadedFileId || fileId === preloadTargetFileId) {
        preloadedFileId = null;
        preloadedBytes = null;
        preloadPromise = null;
        preloadTargetFileId = null;
      }
      cachedFileId = fileId;
      cachedBytes = combinedBytes;
    }

    downloadProgress.value = '압축 해제 중...';
    const zip = await JSZip.loadAsync(combinedBytes);
    const files = Object.keys(zip.files).sort(naturalSort);

    const isEpub = zip.file('OEBPS/content.opf') || zip.file('OPS/content.opf') || zip.file('mimetype');
    if (isEpub) return await handleEpub(zip, files);
    return await extractImages(zip, files);

  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('[Fetcher] Download cancelled by user.');
      return null;
    }
    throw e;
  } finally {
    isDownloading.value = false;
    downloadProgress.value = '';
  }
}

async function fetchSingle(fileId, totalSize, getChunk, silent = false, signal = null) {
  if (!silent) downloadProgress.value = '다운로드 중... (50%)';
  const response = await getChunk(fileId, 0, totalSize, signal);
  if (!response || !response.data) throw new Error('Data Empty');
  return base64ToBytes(response.data);
}

async function fetchConcurrent(fileId, totalSize, getChunk, concurrency = 2, silent = false, signal = null, onProgress = null) {
  const tasks = [];
  const chunkSize = Math.floor(totalSize / CHUNK_COUNT);

  for (let i = 0; i < CHUNK_COUNT; i++) {
    const start = i * chunkSize;
    const length = (i === CHUNK_COUNT - 1) ? (totalSize - start) : chunkSize;
    tasks.push({ index: i, start, length });
  }

  let completed = 0;
  const results = new Array(CHUNK_COUNT);

  const worker = async () => {
    while (tasks.length > 0) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const task = tasks.shift();
      let retries = 3;
      while (retries > 0) {
        try {
          const response = await getChunk(fileId, task.start, task.length, signal);
          if (!response || !response.data) throw new Error('No Data');

          results[task.index] = base64ToBytes(response.data);
          completed++;
          
          const pct = Math.round((completed / CHUNK_COUNT) * 100);
          if (!silent) {
            downloadProgress.value = `다운로드 중... (${pct}%) [${completed}/${CHUNK_COUNT}]`;
          }
          if (onProgress) onProgress(pct);
          break;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          retries--;
          if (retries === 0) throw e;
          await _cancelableDelay(1500, signal);
        }
      }
    }
  };

  const activeConcurrency = Math.min(concurrency || 2, 3);
  const workers = Array.from({ length: activeConcurrency }, () => worker());
  await Promise.all(workers);

  const combinedBytes = new Uint8Array(totalSize);
  let pos = 0;
  results.forEach((r) => {
    combinedBytes.set(r, pos);
    pos += r.length;
  });

  return combinedBytes;
}

async function fetchSequential(fileId, getChunk, silent = false, signal = null) {
  const STEP_SIZE = 10 * 1024 * 1024;
  const chunks = [];
  let offset = 0;
  let totalLength = 0;

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await getChunk(fileId, offset, STEP_SIZE, signal);
    if (!response) break;

    const bytes = base64ToBytes(response.data);
    chunks.push(bytes);
    totalLength += bytes.length;
    offset = response.nextOffset;

    if (!silent) {
      if (response.totalSize) {
        const pct = Math.round((offset / response.totalSize) * 100);
        downloadProgress.value = `수신 중... (${pct}%)`;
      } else {
        downloadProgress.value = `수신 중... (${formatSize(totalLength)})`;
      }
    }

    if (!response.hasMore) break;
  }

  const combinedBytes = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    combinedBytes.set(chunk, pos);
    pos += chunk.length;
  }
  return combinedBytes;
}

async function handleEpub(zip, files) {
  const imageFiles = files.filter((f) => f.match(/\.(jpg|jpeg|png|webp|gif)$/i));
  const textFiles = files.filter((f) => f.match(/\.(xhtml|html)$/i));

  if (imageFiles.length > 5 && imageFiles.length >= textFiles.length) {
    return await extractImages(zip, files);
  }

  let htmlContent = '';
  const htmlFiles = files.filter((f) => f.match(/\.(xhtml|html)$/i));
  if (htmlFiles.length > 0) {
    const chapters = [];
    for (const hf of htmlFiles) {
      const content = await zip.file(hf).async('string');
      chapters.push(content);
    }
    htmlContent = chapters.join('<hr class="chapter-divider" />');
  }

  if (!htmlContent) throw new Error('EPUB Text Empty');
  return { type: 'text', content: htmlContent };
}

async function extractImages(zip, files) {
  cleanupBlobUrls();
  const imageUrls = [];
  
  for (const filename of files) {
    const file = zip.files[filename];
    if (file.dir) continue;
    const isHidden = filename.split('/').some(part => part.startsWith('.') || part === '__MACOSX');
    if (isHidden) continue;

    if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      const blob = await file.async('blob');
      const blobUrl = URL.createObjectURL(blob);
      activeBlobUrls.push(blobUrl);
      imageUrls.push(blobUrl);
    }
  }

  if (imageUrls.length === 0) throw new Error('No Images');

  const dimPromises = imageUrls.map((url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  }));
  const allDims = await Promise.all(dimPromises);
  
  const finalImages = [];
  const finalDims = [];
  for (let idx = 0; idx < imageUrls.length; idx++) {
    if (allDims[idx].w > 0 && allDims[idx].h > 0) {
      finalImages.push(imageUrls[idx]);
      finalDims.push(allDims[idx]);
    } else {
      URL.revokeObjectURL(imageUrls[idx]);
    }
  }

  return { type: 'images', images: finalImages, dimensions: finalDims };
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function preloadEpisode(fileId, totalSize, downloadThreads = 2, seriesId = '') {
  if (preloadedFileId === fileId || cachedFileId === fileId || preloadTargetFileId === fileId) return;

  const { getChunk } = useGAS();

  const existing = await loadFromPersistentCache(fileId);
  if (existing) {
    preloadedFileId = fileId;
    preloadedBytes = existing;
    return;
  }

  // 프리로드는 뷰어 Signal을 공유 — cancelViewerDownload() 호출 시 함께 중단됨
  // 단, 현재 뷰어 컨트롤러가 없으면 별도 생성 (에피소드 목록에서 수동 프리로드 시)
  const signal = _viewerController?.signal ?? null;

  preloadTargetFileId = fileId;
  preloadPromise = (async () => {
    isPreloading.value = true;
    try {
      let combinedBytes = null;
      if (totalSize > 0 && totalSize <= DOWNLOAD_THRESHOLD) {
        combinedBytes = await fetchSingle(fileId, totalSize, getChunk, true, signal);
      } else if (totalSize === 0) {
        combinedBytes = await fetchSequential(fileId, getChunk, true, signal);
      } else {
        combinedBytes = await fetchConcurrent(fileId, totalSize, getChunk, downloadThreads, true, signal);
      }

      if (combinedBytes && !signal?.aborted) {
        saveToPersistentCache(fileId, combinedBytes, seriesId);
      }

      preloadedFileId = signal?.aborted ? null : fileId;
      preloadedBytes = signal?.aborted ? null : combinedBytes;
      return signal?.aborted ? null : combinedBytes;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[Preload] Network error:', err);
      }
      preloadTargetFileId = null;
      preloadedFileId = null;
      preloadedBytes = null;
      return null;
    } finally {
      isPreloading.value = false;
    }
  })();
}

export function useFetcher() {
  return {
    downloadProgress,
    isDownloading,
    isPreloading,
    fetchAndUnzip,
    preloadEpisode,
    cleanupBlobUrls,
    formatSize,
    // [v1.7.5] 분리된 취소 함수
    cancelDownload,          // deprecated alias → cancelViewerDownload
    cancelViewerDownload,    // 뷰어 세션 전용 (프리로드 포함)
    cancelManagerDownload,   // 다운로드 매니저 전용
    downloadBytesOnly
  };
}
