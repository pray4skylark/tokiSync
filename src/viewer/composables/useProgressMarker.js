import { ref, nextTick } from 'vue';
import { db } from './db.js';

/**
 * [v2.2] Progress Locator System (Architecture v2.2)
 * Hierarchy: logicalIndex (SSOT) -> Adapter (How) -> Strategy (What)
 */

// --- Content Strategies (The "What") ---

const ImageStrategy = {
  type: 'images',
  getLocatorFromElement(el) {
    return parseInt(el.getAttribute('data-locator'), 10);
  },
  getOffsetFromLocator(index) {
    const el = document.querySelector(`[data-locator="${index}"]`);
    return el ? el.offsetTop : null;
  },
  getPageFromLocator(index, store) {
    // Find which slot contains this image index
    const slots = store.pageSlots?.value || store.pageSlots || [];
    return slots.findIndex(s => s.pages.includes(index));
  }
};

const TextStrategy = {
  type: 'text',
  getLocatorFromElement(el) {
    return parseInt(el.getAttribute('data-locator'), 10);
  },
  getOffsetFromLocator(index) {
    const el = document.querySelector(`[data-locator="${index}"]`);
    return el ? el.offsetTop : null;
  },
  getPageFromLocator(index, store) {
    // [v2.9] DOM 기반의 정확한 페이지 계산 (문단을 직접 찾아서 확인)
    const el = document.querySelector(`[data-locator="${index}"]`);
    if (el) {
      const container = el.closest('.v2-text-renderer');
      if (container && container.clientWidth > 0) {
        const pageIndex = Math.floor(el.offsetLeft / container.clientWidth);
        console.log(`[V2:Locator] DOM Offset Recalc: index=${index}, offsetLeft=${el.offsetLeft}, clientWidth=${container.clientWidth} -> Page ${pageIndex + 1}`);
        return pageIndex;
      }
    }

    // DOM 요소를 찾지 못한 경우에만 Heuristic으로 Fallback
    const content = store.viewerContent?.value || store.viewerContent;
    if (!content?.paragraphs) return -1;
    const totalParas = content.paragraphs.length;
    const totalPages = store.novelPageCount?.value || store.novelPageCount || 1;
    
    if (totalParas === 0 || totalPages === 0) return 0;
    
    // Heuristic: paragraph index / total paragraphs * total pages
    const ratio = index / totalParas;
    const fallbackIdx = Math.max(0, Math.min(totalPages - 1, Math.floor(ratio * totalPages)));
    console.log(`[V2:Locator] Fallback Heuristic: idx=${index}, ratio=${ratio.toFixed(2)} -> Page ${fallbackIdx + 1}`);
    return fallbackIdx;
  }
};

// --- State Management (SSOT) ---

const logicalIndex = ref(0);
const isInternalSyncing = ref(false);
const isRestoring = ref(true); // [v2.9-fix] 시작 시 잠금 상태로 출발

// [v2.9.4] Safety timeout: isRestoring 15초 이상 풀리지 않으면 강제 해제
const RESTORE_TIMEOUT = 15000;
let _restoreTimer = null;

function _startRestoreTimer() {
  _clearRestoreTimer();
  _restoreTimer = setTimeout(() => {
    if (isRestoring.value) {
      console.warn('[V2:Restore] FORCED UNLOCK — restore timed out');
      isRestoring.value = false;
    }
  }, RESTORE_TIMEOUT);
}

function _clearRestoreTimer() {
  if (_restoreTimer) {
    clearTimeout(_restoreTimer);
    _restoreTimer = null;
  }
}

export function useProgressMarker() {
  
  const getStrategy = (type) => {
    if (type === 'images') return ImageStrategy;
    if (type === 'text') return TextStrategy;
    return null;
  };

  const updateLocator = (index) => {
    if (isInternalSyncing.value) return;
    if (logicalIndex.value === index) return;
    logicalIndex.value = index;
    console.log(`[V2:Locator] ${index}`);
  };

  /**
   * Persistence: Saving to IndexedDB v7 (with 1s Debounce)
   */
  let saveTimeout = null;
  const saveToDB = async (episodeId) => {
    if (!episodeId || isInternalSyncing.value) return;

    // [v2.9.2] 호출 시점의 값을 스냅샷으로 캡처 (비동기 지연 중 값이 변하는 것 방지)
    const snapshotIndex = logicalIndex.value;

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await db.readHistory.update(episodeId, {
          markerIndex: snapshotIndex,
          lastReadAt: new Date().toISOString()
        });
        console.log(`[V2:DB] Auto-saved marker: ${snapshotIndex}`);
      } catch (e) {
        console.warn('[V2:Save] Failed:', e);
      }
    }, 1000);
  };

  /**
   * [v2.9.2] Flush Save
   * 지연 없이 즉시 DB에 현재 위치를 저장 (페이지 전환/종료 시 호출)
   */
  const flushSaveToDB = async (episodeId) => {
    if (!episodeId) return;
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    try {
      await db.readHistory.update(episodeId, {
        markerIndex: logicalIndex.value,
        lastReadAt: new Date().toISOString()
      });
      console.log(`[V2:DB] Flushed marker: ${logicalIndex.value} for ${episodeId}`);
    } catch (e) {
      console.warn('[V2:Save:Flush] Failed:', e);
    }
  };

  /**
   * [v2.8] Heuristic Jump: Approximate position based on average height
   */
  const heuristicJump = (avgHeight, store) => {
    if (!store || !store.viewerData || store.viewerData.mode !== 'scroll' || !avgHeight) return;
    
    // We already have the logicalIndex if we are restoring
    const index = logicalIndex.value;
    const targetScroll = index * avgHeight;

    const container = document.getElementById('viewer-container');
    if (container) {
      container.scrollTo({ top: targetScroll - 80, behavior: 'auto' });
      console.log(`[V2:Heuristic] Jumped to estimated offset: ${targetScroll}`);
    }
  };

  /**
   * [v2.9.1] Reset Locator
   * 이전 에피소드의 읽던 위치가 새 에피소드에 오염되지 않도록 초기화
   */
  const resetLocator = () => {
    logicalIndex.value = 0;
    isInternalSyncing.value = false;
    _clearRestoreTimer();
    console.log('[V2:Locator] Reset to 0');
  };

  /**
   * Restoration: Jump to logicalIndex based on Mode and Strategy
   */
  const restore = async (store) => {
    // Handle both Ref and plain object for flexibility
    const ep = store.currentEpisode?.value || store.currentEpisode;
    if (!ep?.id) {
      isRestoring.value = false;
      return;
    }

    try {
      isRestoring.value = true;
      _startRestoreTimer();
      const history = await db.readHistory.get(ep.id);
      if (!history || history.markerIndex === undefined) {
        console.warn(`[V2:Restore] ⚠️ No history found for ep.id=${ep.id}. Resetting to 0.`);
        logicalIndex.value = 0; // 이력이 없으면 강제로 첫 페이지로 초기화
        return;
      }

      const index = history.markerIndex;
      const content = store.viewerContent?.value || store.viewerContent;
      const strategy = getStrategy(content?.type);
      if (!strategy) {
        console.warn(`[V2:Restore] ⚠️ No strategy. content.type="${content?.type}", content is ${content ? 'loaded' : 'NULL'}. Restore will retry on content load.`);
        return;
      }

      isInternalSyncing.value = true;
      logicalIndex.value = index; // Set index immediately for reference
      console.log(`[V2:Restore] Started for Index ${index}`);

      const vData = store.viewerData?.value || store.viewerData;
      if (vData?.mode === 'scroll') {
        // Wait for DOM to render containers
        await nextTick();
        
        const offset = strategy.getOffsetFromLocator(index);
        if (offset !== null) {
          const container = document.getElementById('viewer-container');
          if (container) {
            container.scrollTo({ top: offset - 80, behavior: 'auto' });
            console.log(`[V2:Restore] Scroll to precise offset ${offset}`);
          }
        } else {
          console.log('[V2:Restore] Locator not ready, waiting for heuristic or manual load...');
        }
      } else {
        // Page Mode
        if (strategy.type === 'images') {
          const slots = store.pageSlots?.value || store.pageSlots || [];
          let targetPage = 1;
          
          if (store.viewerDefaults?.spread && slots.length > 0) {
            const slotIdx = slots.findIndex(s => s.pages.includes(index));
            targetPage = slotIdx !== -1 ? slotIdx + 1 : 1;
            console.log(`[V2:Restore] SPREAD mode — slotIdx=${slotIdx}, targetPage=${targetPage}, slots=${slots.length}`);
          } else {
            targetPage = index + 1;
            console.log(`[V2:Restore] SINGLE PAGE mode — index=${index}, targetPage=${targetPage}`);
          }

          console.log(`[V2:Restore] Before reset — currentPage=${store.currentPage?.value}, type=${typeof store.currentPage}`);
          
          // Reset to 1 and loop
          if (store.currentPage?.value !== undefined) store.currentPage.value = 1;
          if (store.currentSlotIndex?.value !== undefined) store.currentSlotIndex.value = 0;
          
          console.log(`[V2:Restore] After reset — currentPage=${store.currentPage?.value}, moveFn=${typeof store.next}`);

          const moveFn = store.next;
          if (typeof moveFn === 'function') {
            for (let i = 1; i < targetPage; i++) {
              moveFn();
            }
            console.log(`[V2:Restore] After loop — currentPage=${store.currentPage?.value}`);
          } else {
            console.warn('[V2:Restore] store.next is not a function! Falling back to direct assignment.');
            if (store.currentPage?.value !== undefined) store.currentPage.value = targetPage;
          }
          console.log(`[V2:Restore] FINAL currentPage=${store.currentPage?.value}`);
        } else if (strategy.type === 'text') {
          const pageIdx = strategy.getPageFromLocator(index, store);
          if (pageIdx !== -1) {
            const targetPage = pageIdx + 1;
            console.log(`[V2:Restore] NOVEL mode — pageIdx=${pageIdx}, targetPage=${targetPage}`);
            if (store.novelCurrentPage?.value !== undefined) store.novelCurrentPage.value = 0;
            if (store.currentPage?.value !== undefined) store.currentPage.value = 1;

            const moveFn = store.next;
            if (typeof moveFn === 'function') {
              for (let i = 1; i < targetPage; i++) {
                moveFn();
              }
            } else {
              if (store.novelCurrentPage?.value !== undefined) store.novelCurrentPage.value = pageIdx;
              if (store.currentPage?.value !== undefined) store.currentPage.value = targetPage;
            }
          }
        }
      }
    } catch (err) {
      console.error('[V2:Restore] Error:', err);
    } finally {
      _clearRestoreTimer();
      // Release lock after rendering settles
      setTimeout(() => { 
        isInternalSyncing.value = false; 
        isRestoring.value = false;
        console.log('[V2:Restore] Completed');
      }, 500);
    }
  };

  return {
    logicalIndex,
    isInternalSyncing,
    isRestoring,
    updateLocator,
    resetLocator,
    saveToDB,
    flushSaveToDB,
    restore,
    heuristicJump,
    getStrategy
  };
}
