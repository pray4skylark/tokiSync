import { ref, toRaw } from 'vue';
import { useGAS } from './useGAS.js';
import { useStore } from './useStore.js';
import { db } from './db.js';
import JSZip from 'jszip';

// --- Singleton State ---
const downloadProgress = ref('');  // e.g. "다운로드 중... (45%)"
const isDownloading = ref(false);

// [v1.7.4] Global Configuration
const DOWNLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB (4G environment baseline)
const CHUNK_COUNT = 6; // Always divide into 6 chunks for progress resolution

// --- File Cache (Level 1: RAM) ---
let cachedFileId = null;
let cachedBytes = null;

// --- Preload Cache ---
let preloadPromise = null;
let preloadedFileId = null;
let preloadTargetFileId = null;
let preloadedBytes = null;
let isPreloading = ref(false);

// --- Active Blob URLs (for memory cleanup) ---
let activeBlobUrls = [];

/**
 * Revoke all active Blob URLs to prevent memory leaks.
 */
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

/**
 * Convert base64 string to Uint8Array
 */
function base64ToBytes(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Sort filenames naturally (numeric-aware)
 */
function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * [v1.7.4] Persistent Cache Helpers (Level 2: IndexedDB)
 */
async function saveToPersistentCache(fileId, bytes) {
  try {
    await db.episodeData.put({
      fileId,
      bytes,
      cachedAt: Date.now()
    });
    console.log(`[Cache:DB] Saved ${fileId} to persistent storage.`);
  } catch (err) {
    console.warn(`[Cache:DB] Failed to save ${fileId}:`, err);
  }
}

async function loadFromPersistentCache(fileId) {
  try {
    const record = await db.episodeData.get(fileId);
    if (record) {
      console.log(`[Cache:DB] Hit! Loaded ${fileId} from persistent storage.`);
      // Update cachedAt to keep it alive (LRU)
      db.episodeData.update(fileId, { cachedAt: Date.now() });
      return record.bytes;
    }
  } catch (err) {
    console.warn(`[Cache:DB] Failed to load ${fileId}:`, err);
  }
  return null;
}

/**
 * Main entry point: Download, unzip, and return content
 */
async function fetchAndUnzip(fileId, totalSize) {
  const { getChunk } = useGAS();
  const { viewerDefaults } = useStore();

  isDownloading.value = true;
  downloadProgress.value = '준비 중...';

  let combinedBytes = null;

  try {
    // 1. Level 1 Cache (RAM)
    if (cachedFileId === fileId && cachedBytes) {
      console.log('♻️ Using RAM cache');
      combinedBytes = cachedBytes;
    } 
    // 2. Preload Cache (Memory)
    else if (preloadedFileId === fileId && preloadedBytes) {
      console.log('⚡️ Using preload cache');
      combinedBytes = preloadedBytes;
    } 
    // 3. Ongoing Preload
    else if (preloadTargetFileId === fileId && preloadPromise) {
      console.log('⏳ Waiting for ongoing preload...');
      downloadProgress.value = '사전 다운로드 대기 중...';
      combinedBytes = await preloadPromise;
    } 
    // 4. Level 2 Cache (IndexedDB)
    if (!combinedBytes) {
      combinedBytes = await loadFromPersistentCache(fileId);
    }

    // 5. Network Fetch (Final Fallback)
    if (!combinedBytes) {
      // Clear old ephemeral cache
      cachedFileId = null;
      cachedBytes = null;

      if (totalSize > 0 && totalSize <= DOWNLOAD_THRESHOLD) {
        // [Mode A] Single Fetch (Small file)
        combinedBytes = await fetchSingle(fileId, totalSize, getChunk);
      } else if (totalSize === 0) {
        // [Mode C] Sequential Fallback (Unknown size)
        combinedBytes = await fetchSequential(fileId, getChunk);
      } else {
        // [Mode B] Concurrent 6-Chunk Fetch (Standard file)
        combinedBytes = await fetchConcurrent(fileId, totalSize, getChunk, viewerDefaults.downloadThreads);
      }

      // Save to Level 2 Cache (IndexedDB) after successful download
      if (combinedBytes) {
        saveToPersistentCache(fileId, combinedBytes);
      }
    }

    // Update Level 1 Cache (RAM)
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

    // Unzip
    downloadProgress.value = '이미지 압축 해제 중...';
    const zip = await JSZip.loadAsync(combinedBytes);
    const files = Object.keys(zip.files).sort(naturalSort);

    const isEpub = zip.file('OEBPS/content.opf') || zip.file('OPS/content.opf') || zip.file('mimetype');
    if (isEpub) return await handleEpub(zip, files);
    return await extractImages(zip, files);

  } finally {
    isDownloading.value = false;
    downloadProgress.value = '';
  }
}

/**
 * [Mode A] Single Fetch
 */
async function fetchSingle(fileId, totalSize, getChunk, silent = false) {
  if (!silent) downloadProgress.value = '다운로드 중... (50%)';
  const response = await getChunk(fileId, 0, totalSize);
  if (!response || !response.data) throw new Error('Data Empty');
  if (!silent) downloadProgress.value = '다운로드 완료 (100%)';
  return base64ToBytes(response.data);
}

/**
 * [Mode B] Concurrent 6-Chunk Fetch with Byte Correction
 */
async function fetchConcurrent(fileId, totalSize, getChunk, concurrency = 2, silent = false) {
  const tasks = [];
  const chunkSize = Math.floor(totalSize / CHUNK_COUNT);

  for (let i = 0; i < CHUNK_COUNT; i++) {
    const start = i * chunkSize;
    // Last chunk takes all remaining bytes to prevent rounding errors
    const length = (i === CHUNK_COUNT - 1) ? (totalSize - start) : chunkSize;
    tasks.push({ index: i, start, length });
  }

  let completed = 0;
  const results = new Array(CHUNK_COUNT);

  const worker = async () => {
    while (tasks.length > 0) {
      const task = tasks.shift();
      let retries = 3;
      while (retries > 0) {
        try {
          const response = await getChunk(fileId, task.start, task.length);
          if (!response || !response.data) throw new Error('No Data');

          results[task.index] = base64ToBytes(response.data);
          completed++;
          
          if (!silent) {
            const pct = Math.round((completed / CHUNK_COUNT) * 100);
            downloadProgress.value = `다운로드 중... (${pct}%) [${completed}/${CHUNK_COUNT}]`;
          }
          break;
        } catch (e) {
          retries--;
          if (retries === 0) throw e;
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }
  };

  const workers = [];
  const activeConcurrency = Math.min(concurrency || 2, 3); // Cap at 3 for safety
  for (let k = 0; k < activeConcurrency; k++) workers.push(worker());
  await Promise.all(workers);

  // Merge chunks (Guaranteed byte accuracy)
  if (!silent) downloadProgress.value = '데이터 병합 중...';
  const combinedBytes = new Uint8Array(totalSize);
  let pos = 0;
  results.forEach((r) => {
    combinedBytes.set(r, pos);
    pos += r.length;
  });

  return combinedBytes;
}

/**
 * [Mode C] Sequential Fallback (Progressive)
 */
async function fetchSequential(fileId, getChunk, silent = false) {
  const STEP_SIZE = 10 * 1024 * 1024;
  const chunks = [];
  let offset = 0;
  let totalLength = 0;

  while (true) {
    const response = await getChunk(fileId, offset, STEP_SIZE);
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

/**
 * EPUB/Image handling remains same logic but integrated
 */
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
  downloadProgress.value = '이미지 추출 중...';
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

  downloadProgress.value = '레이아웃 분석 중...';
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

/**
 * Background Preload with Level 2 Cache Support
 */
async function preloadEpisode(fileId, totalSize) {
  if (preloadedFileId === fileId || cachedFileId === fileId || preloadTargetFileId === fileId) return;

  const { getChunk } = useGAS();
  const { viewerDefaults } = useStore();

  // Check Level 2 Cache first before preloading via network
  const existing = await loadFromPersistentCache(fileId);
  if (existing) {
    console.log(`[Preload] Found in persistent cache: ${fileId}. Skipping network preload.`);
    preloadedFileId = fileId;
    preloadedBytes = existing;
    return;
  }

  preloadTargetFileId = fileId;
  preloadPromise = (async () => {
    isPreloading.value = true;
    try {
      let combinedBytes = null;
      if (totalSize > 0 && totalSize <= DOWNLOAD_THRESHOLD) {
        combinedBytes = await fetchSingle(fileId, totalSize, getChunk, true);
      } else if (totalSize === 0) {
        combinedBytes = await fetchSequential(fileId, getChunk, true);
      } else {
        combinedBytes = await fetchConcurrent(fileId, totalSize, getChunk, viewerDefaults.downloadThreads, true);
      }

      if (combinedBytes) {
        saveToPersistentCache(fileId, combinedBytes);
      }

      preloadedFileId = fileId;
      preloadedBytes = combinedBytes;
      return combinedBytes;
    } catch (err) {
      console.warn(`[Preload] Failed:`, err);
      preloadTargetFileId = null;
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
  };
}
