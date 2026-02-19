import { useStore } from './useStore';

/**
 * 터치 제스처 composable
 * - Page 모드 전용: 수평 스와이프로 페이지 이동
 * - Scroll 모드: 브라우저 기본 스크롤을 그대로 유지
 * - 플로팅 UI(헤더/푸터) 위 터치는 무시
 */
export function useTouch() {
  const { viewerData, currentView, handleNext, handlePrev, toggleViewerUI } = useStore();

  let startX = 0;
  let startY = 0;
  let tracking = false;

  const SWIPE_THRESHOLD = 40;

  // 플로팅 UI 영역인지 확인 (헤더, 푸터, 모달 등)
  const isUIElement = (el) => {
    if (el?.closest('.glass-controls, [class*="z-[4000]"], button, input')) return true;
    // <a> 태그는 뷰어 콘텐츠(v-html) 내부가 아닌 경우만 UI 요소로 판정
    if (el?.closest('a') && !el?.closest('#viewer-container')) return true;
    return false;
  };

  const onTouchStart = (e) => {
    // 리더 뷰가 아니거나 UI 요소 위면 무시
    if (currentView.value !== 'viewer') return;
    if (isUIElement(e.target)) {
      console.log('[Touch] UI 요소 위 → 무시', e.target.tagName, e.target.className);
      tracking = false;
      return;
    }

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
    console.log('[Touch] START', { x: startX, y: startY, mode: viewerData.mode, target: e.target.tagName });
  };

  const onTouchMove = (e) => {
    if (!tracking) return;
    // Page 모드에서만 수평 스와이프 시 브라우저 기본 동작 차단
    if (viewerData.mode !== 'scroll') {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dx > dy && dx > 10) {
        e.preventDefault();
      }
    }
    // Scroll 모드: preventDefault 호출 안 함 → 자연스러운 세로 스크롤 유지
  };

  const onTouchEnd = (e) => {
    if (!tracking) {
      console.log('[Touch] END → tracking=false, 무시됨');
      return;
    }
    tracking = false;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    console.log('[Touch] END', { dx: deltaX, dy: deltaY, absDX: absDeltaX, absDY: absDeltaY, mode: viewerData.mode });

    // Scroll 모드에서는 스와이프 페이지 이동 불필요
    if (viewerData.mode === 'scroll') {
      // 탭 감지: 이동 거리 작음
      if (absDeltaX < 10 && absDeltaY < 10) {
        console.log('[Touch] 탭 감지 → toggleViewerUI 호출');
        toggleViewerUI();
      } else {
        console.log('[Touch] 스크롤 모드 스와이프 → 무시');
      }
      return;
    }

    // Page 모드: 탭이면 무시 (nav-zone이 처리)
    if (absDeltaX < 10 && absDeltaY < 10) {
      console.log('[Touch] Page 모드 탭 → nav-zone 처리');
      return;
    }

    // 수평 스와이프
    if (absDeltaX > absDeltaY && absDeltaX > SWIPE_THRESHOLD) {
      console.log('[Touch] 수평 스와이프', deltaX < 0 ? 'NEXT' : 'PREV');
      if (deltaX < 0) handleNext();
      else handlePrev();
    }
  };

  let bound = false;

  const attach = () => {
    if (bound) return;
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    bound = true;
  };

  const detach = () => {
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    bound = false;
  };

  return { attach, detach };
}
