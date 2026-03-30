import { ref, onMounted, onUnmounted } from 'vue';

/**
 * [v1.7.0] Virtual Scroll Composable
 * Manages viewport visibility to optimize Dom performance for 100+ images.
 */
export function useVirtualScroll() {
  const visibleIndices = ref(new Set());
  let observer = null;
  const pendingElements = new Set();

  const initObserver = (containerSelector = '#viewer-container') => {
    const rootEl = document.querySelector(containerSelector);
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
      root: rootEl || null, // Viewport 대신 스크롤 컨테이너를 정확히 타겟팅
      rootMargin: '3000px 0px', // Preload buffer 확대 (3000px 위/아래)
      threshold: 0 // 1픽셀이라도 보이면 교차로 인식
    });

    // 보류 중이던 DOM 요소가 있다면 옵저버 생성 즉시 일괄 등록
    pendingElements.forEach(el => observer.observe(el));
    pendingElements.clear();
  };

  const observeElement = (el) => {
    if (observer) {
      if (el) observer.observe(el);
    } else {
      if (el) pendingElements.add(el);
    }
  };

  const unobserveElement = (el) => {
    if (observer) {
      if (el) observer.unobserve(el);
    } else {
      if (el) pendingElements.delete(el);
    }
  };

  const isVisible = (index) => {
    return visibleIndices.value.has(index);
  };

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    pendingElements.clear();
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
