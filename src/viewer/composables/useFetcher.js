/**
 * 📦 useFetcher - Client-side Download & Unzip Composable
 * Ports the legacy fetcher.js logic to Vue.
 *
 * Features:
 * - Adaptive download: Single fetch (<26MB) or Concurrent Chunks (>=26MB)
 * - Format detection: CBZ/ZIP → images, EPUB → images or text
 * - Progress tracking via reactive state
 */
import { ref } from 'vue';
import { useGAS } from './useGAS.js';
import JSZip from 'jszip';

// --- Singleton State ---
const downloadProgress = ref('');  // e.g. "다운로드 중... (45%)"
const isDownloading = ref(false);

// --- File Cache ---
let cachedFileId = null;
let cachedBytes = null;

// --- Active Blob URLs (for memory cleanup) ---
let activeBlobUrls = [];

/**
 * Revoke all active Blob URLs to prevent memory leaks
 */
function cleanupBlobUrls() {
  activeBlobUrls.forEach((url) => URL.revokeObjectURL(url));
  activeBlobUrls = [];
  // Also clear file cache to prevent stale content
  cachedFileId = null;
  cachedBytes = null;
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
 * Main entry point: Download, unzip, and return content
 *
 * @param {string} fileId - Google Drive File ID
 * @param {number} totalSize - Total file size in bytes (0 = unknown)
 * @returns {Promise<Object>} Result object:
 *   - { type: 'images', images: string[] }  - Array of Blob URLs
 *   - { type: 'text', content: string }     - HTML content string
 */
async function fetchAndUnzip(fileId, totalSize) {
  const { getChunk } = useGAS();

  isDownloading.value = true;
  downloadProgress.value = '다운로드 준비 중...';

  let combinedBytes = null;
  const SAFE_THRESHOLD = 26 * 1024 * 1024; // 26MB

  try {
    // 1. Check Cache
    if (cachedFileId === fileId && cachedBytes) {
      console.log('♻️ Using cached data for re-render');
      combinedBytes = cachedBytes;
    } else {
      // Clear old cache
      cachedFileId = null;
      cachedBytes = null;

      if (totalSize > 0 && totalSize < SAFE_THRESHOLD) {
        // [Mode A] Single Fetch (Small file)
        combinedBytes = await fetchSingle(fileId, totalSize, getChunk);
      } else if (totalSize === 0) {
        // [Mode C] Sequential Fallback (Unknown size)
        combinedBytes = await fetchSequential(fileId, getChunk);
      } else {
        // [Mode B] Concurrent Chunk Fetch (Large file)
        combinedBytes = await fetchConcurrent(fileId, totalSize, getChunk);
      }
    }

    // 2. Update cache
    if (combinedBytes) {
      cachedFileId = fileId;
      cachedBytes = combinedBytes;
    }

    // 3. Unzip
    downloadProgress.value = '압축 해제 중...';
    const zip = await JSZip.loadAsync(combinedBytes);
    const files = Object.keys(zip.files).sort(naturalSort);

    // 4. Detect Format
    const isEpub = zip.file('OEBPS/content.opf') || zip.file('OPS/content.opf') || zip.file('mimetype');

    if (isEpub) {
      return await handleEpub(zip, files);
    }

    // 5. Extract Images (CBZ/ZIP)
    return await extractImages(zip, files);
  } finally {
    isDownloading.value = false;
    downloadProgress.value = '';
  }
}

/**
 * [Mode A] Single Fetch for small files
 */
async function fetchSingle(fileId, totalSize, getChunk) {
  downloadProgress.value = '다운로드 중... (0%)';
  const response = await getChunk(fileId, 0, totalSize);
  if (!response || !response.data) throw new Error('Empty Response');
  downloadProgress.value = '다운로드 완료 (100%)';
  return base64ToBytes(response.data);
}

/**
 * [Mode B] Concurrent Chunk Fetch for large files (10MB chunks, 3 workers)
 */
async function fetchConcurrent(fileId, totalSize, getChunk) {
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
  const CONCURRENCY = 3;
  const chunkCount = Math.ceil(totalSize / CHUNK_SIZE);

  const tasks = [];
  for (let i = 0; i < chunkCount; i++) {
    tasks.push({ index: i, start: i * CHUNK_SIZE, length: CHUNK_SIZE });
  }

  let completed = 0;
  const results = new Array(chunkCount);

  const worker = async () => {
    while (tasks.length > 0) {
      const task = tasks.shift();

      let retries = 3;
      while (retries > 0) {
        try {
          const response = await getChunk(fileId, task.start, task.length);
          if (!response || !response.data) throw new Error('No response');

          results[task.index] = base64ToBytes(response.data);
          completed++;
          downloadProgress.value = `다운로드 중... (${Math.round((completed / chunkCount) * 100)}%)`;
          break;
        } catch (e) {
          retries--;
          if (retries === 0) throw e;
          console.warn(`Chunk ${task.index} failed, retrying...`, e);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  };

  const workers = [];
  for (let k = 0; k < CONCURRENCY; k++) workers.push(worker());
  await Promise.all(workers);

  // Merge chunks
  downloadProgress.value = '병합 중...';
  let totalLen = 0;
  results.forEach((r) => (totalLen += r.length));
  const combinedBytes = new Uint8Array(totalLen);
  let pos = 0;
  results.forEach((r) => {
    combinedBytes.set(r, pos);
    pos += r.length;
  });

  return combinedBytes;
}

/**
 * [Mode C] Sequential Fallback for unknown file size
 */
async function fetchSequential(fileId, getChunk) {
  const CHUNK_SIZE = 10 * 1024 * 1024;
  const chunks = [];
  let offset = 0;
  let totalLength = 0;

  while (true) {
    const response = await getChunk(fileId, offset, CHUNK_SIZE);
    if (!response) break;

    const bytes = base64ToBytes(response.data);
    chunks.push(bytes);
    totalLength += bytes.length;
    offset = response.nextOffset;

    if (response.totalSize) {
      downloadProgress.value = `다운로드 중... (${Math.round((offset / response.totalSize) * 100)}%)`;
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
 * Handle EPUB format detection and extraction
 * @returns {{ type: 'images', images: string[] } | { type: 'text', content: string }}
 */
async function handleEpub(zip, files) {
  const imageFiles = files.filter((f) => f.match(/\.(jpg|jpeg|png|webp|gif)$/i));
  const textFiles = files.filter((f) => f.match(/\.(xhtml|html)$/i));

  // Image-heavy EPUB → treat as Comic
  if (imageFiles.length > 5 && imageFiles.length >= textFiles.length) {
    console.log('📘 Comic EPUB Detected → Using Image Mode');
    return await extractImages(zip, files);
  }

  // Text EPUB
  console.log('📘 Text EPUB Detected → Using Novel Mode');

  let htmlContent = '';
  let targetFile = zip.file('OEBPS/Text/chapter.xhtml');

  if (!targetFile) {
    // Try to find any HTML file
    const htmlFiles = files.filter((f) => f.match(/\.(xhtml|html)$/i));
    if (htmlFiles.length > 0) {
      // Concatenate all chapters
      const chapters = [];
      for (const hf of htmlFiles) {
        const content = await zip.file(hf).async('string');
        chapters.push(content);
      }
      htmlContent = chapters.join('<hr class="chapter-divider" />');
    }
  } else {
    htmlContent = await targetFile.async('string');
  }

  if (!htmlContent) {
    throw new Error('EPUB 내에서 텍스트 파일을 찾을 수 없습니다.');
  }

  return { type: 'text', content: htmlContent };
}

/**
 * Extract images from a ZIP archive and return Blob URLs with dimensions
 */
async function extractImages(zip, files) {
  // Cleanup previous Blob URLs
  cleanupBlobUrls();

  downloadProgress.value = '이미지 추출 중...';
  const imageUrls = [];
  const dimensions = [];

  for (const filename of files) {
    if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      const blob = await zip.files[filename].async('blob');
      const blobUrl = URL.createObjectURL(blob);
      activeBlobUrls.push(blobUrl);
      imageUrls.push(blobUrl);
    }
  }

  if (imageUrls.length === 0) {
    throw new Error('이미지를 찾을 수 없습니다.');
  }

  // Detect dimensions for spread detection
  downloadProgress.value = '레이아웃 분석 중...';
  const dimPromises = imageUrls.map((url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  }));
  const dims = await Promise.all(dimPromises);

  return { type: 'images', images: imageUrls, dimensions: dims };
}

/**
 * Format file size for display
 */
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function useFetcher() {
  return {
    downloadProgress,
    isDownloading,
    fetchAndUnzip,
    cleanupBlobUrls,
    formatSize,
  };
}
