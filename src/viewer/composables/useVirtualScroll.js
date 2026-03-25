import { ref, onMounted, onUnmounted } from 'vue';

/**
 * [v1.7.0] Virtual Scroll Composable
 * Manages viewport visibility to optimize Dom performance for 100+ images.
 */
export function useVirtualScroll() {
  const visibleIndices = ref(new Set());
  let observer = null;

  const initObserver = (containerSelector = '.reader-container') => {
    observer = new IntersectionObserver((entries) => {
      // [v1.7.0] [오류 5 수정] Set 교체 방식으로 반응성 트리거 + 배치 처리로 성능 최적화
      const next = new Set(visibleIndices.value);
      let changed = false;

      entries.forEach(entry => {
        const index = parseInt(entry.target.dataset.index);
        if (entry.isIntersecting) {
          if (!next.has(index)) {
            next.add(index);
            changed = true;
          }
        } else {
          if (next.has(index)) {
            next.delete(index);
            changed = true;
          }
        }
      });

      if (changed) {
        visibleIndices.value = next;
      }
    }, {
      root: null, // Viewport
      rootMargin: '1000px 0px', // Preload buffer (1000px above/below)
      threshold: 0.01
    });
  };

  const observeElement = (el) => {
    if (observer && el) observer.observe(el);
  };

  const unobserveElement = (el) => {
    if (observer && el) observer.unobserve(el);
  };

  const isVisible = (index) => {
    return visibleIndices.value.has(index);
  };

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    visibleIndices.value.clear();
  };

  return { 
    initObserver, 
    observeElement, 
    unobserveElement, 
    isVisible, 
    cleanup 
  };
}
