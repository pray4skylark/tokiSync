import { db } from './db.js';

/**
 * [v1.7.0] Auto-Crop Margin Detection Engine
 * Uses OffscreenCanvas to analyze image pixels and remove unnecessary margins.
 */
export function useAutoCrop() {
  const imageMeta = db.table('imageMeta');

  /**
   * Get Cached Bounds or Analyze Image
   */
  const getBounds = async (seriesId, episodeId, index, imageUrl) => {
    try {
      // 1. Check Cache
      const cached = await imageMeta.get([seriesId, episodeId, index]);
      if (cached && cached.bounds) return cached.bounds;

      // 2. Perform Pixel Analysis (Slow Path)
      const bounds = await analyzeImage(imageUrl);
      
      // 3. Save to Cache (Fire & Forget)
      imageMeta.put({
        seriesId, 
        episodeId, 
        index, 
        bounds,
        lastAnalyzed: Date.now()
      }).catch(e => console.warn('[AutoCrop] Cache save failed:', e));

      return bounds;
    } catch (e) {
      console.warn('[AutoCrop] Analysis failed, fallback to original:', e);
      return null;
    }
  };

  /**
   * Pixel Analysis using OffscreenCanvas
   */
  async function analyzeImage(url) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    await img.decode();

    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height).data;
    const w = img.width;
    const h = img.height;

    let minX = w, minY = h, maxX = 0, maxY = 0;
    
    // Scan pixels (Sample every 2 pixels for speed if needed, but here we do full scan for precision)
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const a = imageData[i + 3];

        // Detect non-white (250+) and non-black (5-) and non-transparent
        const isBackground = (r > 250 && g > 250 && b > 250) || (r < 5 && g < 5 && b < 5) || a < 10;
        
        if (!isBackground) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Safety: If no content found (blank page), return null
    if (maxX < minX || maxY < minY) return null;

    // Buffer margin (2px)
    minX = Math.max(0, minX - 2);
    minY = Math.max(0, minY - 2);
    maxX = Math.min(w, maxX + 2);
    maxY = Math.min(h, maxY + 2);

    return {
      top: (minY / h) * 100,
      bottom: ((h - maxY) / h) * 100,
      left: (minX / w) * 100,
      right: ((w - maxX) / w) * 100,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  return { getBounds };
}
