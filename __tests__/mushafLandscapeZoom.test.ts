/**
 * Phone-landscape reading-zoom memory ceiling (v2.7.43).
 *
 * Regression for "rotating is slow and sometimes crashes the app". The
 * landscape zoom originally width-fitted the page with no cap, which made
 * the render-cache request land ~2450 px — past RENDER_CACHE_SKIP_PX. The
 * cache then declined to make a copy and every mounted page decoded the
 * full 2600×4206 source (~44 MB each, ~130 MB for the three pages the
 * pager mounts), so rotation allocated a huge amount of bitmap at once.
 *
 * The invariant these tests protect: whatever the device, the landscape
 * page must stay inside the render cache's working range AND still be a
 * meaningful zoom over portrait.
 */
import {
  RENDER_CACHE_SKIP_PX,
  landscapePageWidthDp,
  renderRequestPx,
} from '../src/quran/mushafSpread';

// Typical full-text page crop (see mushafImages.mushafPageCrop).
const CROP_W = 0.972;
const HORIZONTAL_PADDING = 8;

/** What the reader actually draws for a page in phone landscape. */
function landscapePageWidth(
  windowWidthDp: number,
  pixelRatio: number,
  shortSideDp: number,
  isCurrentPage = true,
): number {
  return landscapePageWidthDp({
    availableWidthDp: windowWidthDp - HORIZONTAL_PADDING,
    shortSideDp,
    cropW: CROP_W,
    pixelRatio,
    isCurrentPage,
  });
}

describe('phone-landscape zoom stays inside the render cache', () => {
  // Landscape window width, device pixel ratio, portrait page width.
  const devices: Array<[string, number, number, number]> = [
    ['1080×2400 @2.75 (Pixel-class)', 873, 2.75, 385],
    ['1080×2400 @3.0', 800, 3.0, 352],
    ['1440×3200 @3.5 (flagship)', 914, 3.5, 403],
    ['720×1600 @2.0 (budget)', 800, 2.0, 352],
    ['emulator 300dpi repro', 1280, 1.875, 568],
  ];

  it.each(devices)(
    '%s: render request stays under the cache-skip line',
    (_name, windowWidth, pixelRatio, portraitWidth) => {
      const dispW = landscapePageWidth(windowWidth, pixelRatio, portraitWidth);
      const requested = renderRequestPx(dispW, CROP_W, pixelRatio);
      expect(requested).toBeLessThan(RENDER_CACHE_SKIP_PX);
      // …and never asks for more pixels than the source actually has.
      expect(requested).toBeLessThanOrEqual(2600);
    },
  );

  it.each(devices)(
    '%s: still zooms meaningfully past the portrait page',
    (_name, windowWidth, pixelRatio, portraitWidth) => {
      const dispW = landscapePageWidth(windowWidth, pixelRatio, portraitWidth);
      expect(dispW / portraitWidth).toBeGreaterThan(1.3);
    },
  );

  it('an uncapped width-fit would have blown the cache (the old bug)', () => {
    const uncapped = 873 - HORIZONTAL_PADDING; // Pixel-class landscape
    expect(renderRequestPx(uncapped, CROP_W, 2.75)).toBeGreaterThan(
      RENDER_CACHE_SKIP_PX,
    );
  });

  it.each(devices)(
    '%s: offscreen neighbours stay portrait-sized (memory)',
    (_name, windowWidth, pixelRatio, portraitWidth) => {
      const neighbour = landscapePageWidth(
        windowWidth,
        pixelRatio,
        portraitWidth,
        false,
      );
      const current = landscapePageWidth(windowWidth, pixelRatio, portraitWidth);
      expect(neighbour).toBeLessThanOrEqual(portraitWidth);
      expect(neighbour).toBeLessThan(current);
    },
  );
});
