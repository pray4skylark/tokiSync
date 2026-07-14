import { reactive, ref, computed } from 'vue';
import { db } from './db.js';
import { useFetcher, cancelManagerDownload } from './useFetcher.js';

// --- Global State ---
const downloadQueue = reactive(new Map()); // fileId -> { progress, status, seriesId, title, size }
const isGCRunning = ref(false);

/**
 * [v1.7.5] Download Manager Composable
 * Handles background downloading to IndexedDB and LRU cache management.
 */
export function useDownloadManager() {
  const { downloadBytesOnly, formatSize } = useFetcher();

  /**
   * 에피소드 다운로드 시작
   */
  async function startDownload(episode, threads = 2) {
    const fileId = episode.id;
    
    // 이미 큐에 있거나 다운로드 중이면 무시
    if (downloadQueue.has(fileId)) return;

    // 초기 상태 등록
    downloadQueue.set(fileId, {
      id: fileId,
      title: episode.title || episode.name,
      seriesId: episode.seriesId || '',
      size: episode.size || 0,
      progress: 0,
      status: 'pending'
    });

    const task = downloadQueue.get(fileId);
    task.status = 'downloading';

    try {
      const result = await downloadBytesOnly(
        fileId, 
        episode.size || 0, 
        task.seriesId, 
        threads,
        (p) => { task.progress = p; }
      );

      if (result === 'completed') {
        task.status = 'completed';
        task.progress = 100;
        // 완료 후 5초 뒤 큐에서 자동 제거 (UI 표시용)
        setTimeout(() => {
          if (downloadQueue.get(fileId)?.status === 'completed') {
            downloadQueue.delete(fileId);
          }
        }, 5000);
      } else if (result === 'cancelled') {
        // 사용자가 의도적으로 취소한 경우 조용히 큐에서 제거
        downloadQueue.delete(fileId);
      } else {
        task.status = 'failed';
      }
    } catch (err) {
      console.error(`[DownloadManager] Failed ${fileId}:`, err);
      task.status = 'failed';
    }
  }

  /**
   * 다운로드 취소/제거
   */
  function removeTask(fileId) {
    cancelManagerDownload(); // 현재 매니저 다운로드 중단
    downloadQueue.delete(fileId);
  }

  /**
   * [GC] 저장소 용량 관리
   * - 브라우저 저장소가 90% 이상 찼을 때만 오래된 항목 30% 정리
   * - 현재 시청 중이거나 다운로드 중인 데이터는 보호
   */
  async function runGC(currentViewingId = null) {
    if (isGCRunning.value) return;
    isGCRunning.value = true;

    try {
      // storage.estimate()로 실제 저장소 압력 확인
      let usage = 0, quota = 1;
      try {
        const est = await navigator.storage.estimate();
        usage = est.usage || 0;
        quota = est.quota || 1;
      } catch (_) { /* fallback: GC 생략 */ }

      if (usage / quota < 0.9) return; // 90% 미만이면 GC 불필요

      const all = await db.episodeData.orderBy('cachedAt').reverse().toArray();
      if (all.length <= 5) return;

      const protectedIds = new Set();
      if (currentViewingId) protectedIds.add(currentViewingId);
      downloadQueue.forEach((_, id) => protectedIds.add(id));

      const keepCount = Math.ceil(all.length * 0.7); // 최신 70% 유지
      const toDelete = all.slice(keepCount).filter(item => !protectedIds.has(item.fileId));

      if (toDelete.length > 0) {
        const ids = toDelete.map(item => item.fileId);
        await db.episodeData.bulkDelete(ids);
        console.log(`[LRU:GC] Storage at ${(usage/quota*100).toFixed(0)}%. Removed ${ids.length} old episodes.`);
      }
    } catch (err) {
      console.warn('[LRU:GC] Error:', err);
    } finally {
      isGCRunning.value = false;
    }
  }

  /**
   * 특정 에피소드의 다운로드 상태 확인
   */
  function getStatus(fileId) {
    return downloadQueue.get(fileId) || null;
  }

  /**
   * 특정 에피소드가 IndexedDB에 캐시되어 있는지 확인
   */
  async function isCached(fileId) {
    const record = await db.episodeData.get(fileId);
    return !!record;
  }

  return {
    downloadQueue: computed(() => Array.from(downloadQueue.values())),
    isGCRunning,
    startDownload,
    removeTask,
    runGC,
    getStatus,
    isCached,
    formatSize
  };
}
