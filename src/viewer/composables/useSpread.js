/**
 * [v1.7.0] Smart Double Spread Algorithm
 * Converts a flat image list into a 2D slots array based on aspect ratio.
 */
export function useSpread() {
  
  /**
   * @param {Array} images Flat list of image objects { url, width, height }
   * @param {Object} options { spread, rtl, coverFirst }
   */
  const calculateSlots = (images, options = {}) => {
    const { spread, rtl, coverFirst } = options;
    
    // Default: Single Mode
    if (!spread) return images.map(img => [img]);

    const slots = [];
    let i = 0;

    // 1. Handle Cover First
    if (coverFirst && images.length > 0) {
      slots.push([images[0]]);
      i = 1;
    }

    while (i < images.length) {
      const current = images[i];
      const next = images[i + 1];

      // Detect "Wide" image (Spread) - Aspect Ratio > 1.15 approx.
      const isWide = current.width / current.height > 1.15;

      if (isWide) {
        // Wide image occupies its own slot
        slots.push([current]);
        i += 1;
      } else if (next) {
        const isNextWide = next.width / next.height > 1.15;
        
        if (isNextWide) {
          // Current is single, next is wide. Current must be single slot.
          slots.push([current]);
          i += 1;
        } else {
          // Both are normal (portrait). Pair them!
          // RTL: [Right, Left], LTR: [Left, Right]
          slots.push(rtl ? [next, current] : [current, next]);
          i += 2;
        }
      } else {
        // Last image alone
        slots.push([current]);
        i += 1;
      }
    }

    return slots;
  };

  return { calculateSlots };
}
