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
   * [LRU GC] 저장소 용량 관리
   * - 최대 5개의 에피소드만 유지
   * - 현재 시청 중이거나 다운로드 중인 데이터는 보호
   */
  async function runGC(currentViewingId = null) {
    if (isGCRunning.value) return;
    isGCRunning.value = true;

    try {
      const all = await db.episodeData.orderBy('cachedAt').reverse().toArray();

      // 기존: all.length <= 5일 때도 early return으로 인해
      // isGCRunning이 true로 고착되는 버그가 있었음 — finally를 타게 return 전환
      if (all.length > 5) {
        // 보호 대상 ID 목록
        const protectedIds = new Set();
        if (currentViewingId) protectedIds.add(currentViewingId);
        downloadQueue.forEach((_, id) => protectedIds.add(id));

        const candidates = all.slice(5); // 5개 이후 가장 오래된 순서
        const toDelete = candidates.filter(item => !protectedIds.has(item.fileId));

        if (toDelete.length > 0) {
          const ids = toDelete.map(item => item.fileId);
          await db.episodeData.bulkDelete(ids);
          console.log(`[LRU:GC] Removed ${ids.length} episodes. Protected: ${protectedIds.size}`);
        }
      }
    } catch (err) {
      console.warn('[LRU:GC] Error:', err);
    } finally {
      isGCRunning.value = false; // 항상 실행됨 (조기 return 없음)
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
    const count = await db.episodeData.where('fileId').equals(fileId).count();
    return count > 0;
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
