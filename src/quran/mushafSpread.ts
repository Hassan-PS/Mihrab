/**
 * Pure paging math for the mushaf reader's single- and dual-page (facing
 * spread) layouts. Extracted from MushafReader so the RTL spread alignment is
 * unit-testable without a renderer.
 *
 * Model (RTL): page 1 is the rightmost column; higher page numbers sit further
 * LEFT. Each page fills one `pageW` column. A facing spread pairs an odd
 * right-hand page with the next even left-hand page — (1,2), (3,4), (5,6)… —
 * matching the printed Madinah mushaf whose pages 1 (Al-Fatiha) and 2 (start of
 * Al-Baqarah) are a decorative opening spread.
 *
 * In dual mode the viewport width equals two `pageW` columns (one spread), so a
 * `pagingEnabled` ScrollView that snaps by its frame width lands exactly on
 * spread boundaries — provided every spread's left edge is an integer multiple
 * of the frame width, which the pairing above guarantees for the 604-page
 * mushaf.
 */

/** Left edge (in `pageW` units) of a page's own column. */
export function pageOffsetX(page: number, pageW: number, total: number): number {
  return (total - page) * pageW;
}

/** The even, left-hand page of the spread that contains `page`. */
export function spreadLeftPage(page: number, total: number): number {
  return Math.min(total, page % 2 === 0 ? page : page + 1);
}

/**
 * Scroll offset that brings the spread containing `page` flush to the viewport
 * left edge. In single mode this is just the page's own offset.
 */
export function scrollXForPage(
  page: number,
  pageW: number,
  total: number,
  dual: boolean,
): number {
  const target = dual ? spreadLeftPage(page, total) : page;
  return pageOffsetX(target, pageW, total);
}

/**
 * Inverse: given a settled scroll offset and the viewport frame width, which
 * page is "current"? In dual mode we report the spread's right-hand (odd) page
 * — the first one read in RTL.
 */
export function pageFromScroll(
  x: number,
  frameWidth: number,
  total: number,
  dual: boolean,
): number {
  if (dual) {
    const spreads = Math.round(x / frameWidth);
    const leftPage = total - 2 * spreads; // even, left side
    return clampPage(leftPage - 1, total); // odd, right side
  }
  return clampPage(total - Math.round(x / frameWidth), total);
}

function clampPage(page: number, total: number): number {
  return Math.max(1, Math.min(total, page));
}

/**
 * Reading-layout decision for the mushaf (v2.7.41).
 *
 * Two independent facts drive it:
 *  • DEVICE class — the physical screen's shorter side (<600dp = phone,
 *    the classic Android phone/tablet split). A tall phone in landscape
 *    can be ~1280dp WIDE, which used to satisfy the old width-only
 *    dual-page rule and opened an iPad-style spread on a 576dp-tall
 *    screen (and on some phones the doubled page column pushed the
 *    604-page strip past what the platform can rasterise, so the page
 *    rendered BLANK).
 *  • WINDOW shape — landscape and wide enough for two legible columns.
 *
 * Phones in landscape instead get `phoneLandscape`: ONE page, fitted to
 * the full window width and scrolled vertically (reading zoom).
 */
export function mushafLayoutMode(dims: {
  windowWidth: number;
  windowHeight: number;
  /** Shorter side of the physical screen, in dp. */
  screenShortSide: number;
}): { dualPage: boolean; phoneLandscape: boolean } {
  const isLandscape = dims.windowWidth > dims.windowHeight;
  const isPhoneDevice = dims.screenShortSide < 600;
  return {
    dualPage: isLandscape && dims.windowWidth >= 960 && !isPhoneDevice,
    phoneLandscape: isLandscape && isPhoneDevice,
  };
}

/** Width of the source mushaf PNGs, in pixels. */
export const MUSHAF_SOURCE_PX = 2600;

/**
 * `ensureScaledPage` skips generating a display-size copy once the request
 * reaches 90 % of the source width — at that point it isn't a downscale
 * worth making. Past this line the reader decodes the full 2600×4206 PNG
 * (~44 MB of bitmap) for EVERY mounted page.
 */
export const RENDER_CACHE_SKIP_PX = MUSHAF_SOURCE_PX * 0.9;

/**
 * Physical pixels the reader asks the render cache for, given a page's
 * display width. Mirrors `cachePxWidth` in MushafReader: the full-image
 * width implied by drawing the crop region `cropW` wide at `dispWDp`.
 */
export function renderRequestPx(
  dispWDp: number,
  cropW: number,
  pixelRatio: number,
): number {
  return (dispWDp * pixelRatio) / cropW;
}

/**
 * How wide to draw a page in phone-landscape reading zoom, in dp.
 *
 * Three forces, balanced here (v2.7.43):
 *  • ZOOM — the point of the mode. Target ~1.6× the portrait page width,
 *    which is `shortSideDp` (a phone's portrait width IS its landscape
 *    height).
 *  • MEMORY — only the visible page gets the zoom. The pager mounts the
 *    neighbours either side for swipe; those are offscreen, so they stay
 *    portrait-sized. Zooming all three is what produced ~130 MB of bitmap
 *    and made rotation crawl and then OOM.
 *  • THE RENDER CACHE — the result must keep `renderRequestPx` under
 *    `RENDER_CACHE_SKIP_PX`, or `ensureScaledPage` declines to make a
 *    copy and the reader decodes the full 2600 px source per page.
 *
 * A fixed pixel budget alone doesn't work: it's spent in real pixels, so
 * on a 3.5× screen it left almost no zoom over portrait. Hence the
 * zoom-relative target, clamped by the cache line.
 */
export function landscapePageWidthDp(opts: {
  /** Page-area width in dp (window width minus horizontal padding). */
  availableWidthDp: number;
  /** Portrait page width in dp — the window's short side. */
  shortSideDp: number;
  cropW: number;
  pixelRatio: number;
  /** Offscreen neighbours stay portrait-sized. */
  isCurrentPage: boolean;
  targetZoom?: number;
  minBudgetPx?: number;
}): number {
  const {
    availableWidthDp,
    shortSideDp,
    cropW,
    pixelRatio,
    isCurrentPage,
    targetZoom = 1.6,
    minBudgetPx = 1700,
  } = opts;
  if (!isCurrentPage) return Math.min(availableWidthDp, shortSideDp);
  const target = Math.max(
    shortSideDp * targetZoom,
    (minBudgetPx * cropW) / pixelRatio,
  );
  // 0.98 keeps a margin below the skip line so bucket rounding can't tip
  // the request over it.
  const cacheCeiling = (RENDER_CACHE_SKIP_PX * 0.98 * cropW) / pixelRatio;
  return Math.min(availableWidthDp, target, cacheCeiling);
}
