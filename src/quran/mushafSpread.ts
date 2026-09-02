/**
 * The spread pager's item model: which two pages sit together, and where.
 *
 * Model (RTL): page 1 is the rightmost. A facing spread pairs an odd
 * right-hand page with the next even left-hand page — (1,2), (3,4), (5,6)… —
 * matching the printed Madinah muṣḥaf, whose pages 1 (Al-Fatiha) and 2 (the
 * opening of Al-Baqarah) are a decorative opening spread.
 *
 * This used to be the paging arithmetic for the image reader as well —
 * scroll offsets in page-widths, the dual-page snap, the phone-landscape
 * zoom clamped against a render cache. That reader is gone, and with it
 * every function here that turned a scroll offset into a page: the spread
 * pager's FlatList index IS the spread index, so there is nothing to
 * invert.
 */

export type MushafSpread = {
  /** 0-based spread index — the FlatList index in the spread pager. */
  index: number;
  /** The odd, right-hand page (RTL: read first). */
  right: number;
  /** The even, left-hand page, or null past the end of the muṣḥaf. */
  left: number | null;
};

function clampPage(page: number, total: number): number {
  return Math.max(1, Math.min(total, page));
}

/**
 * The spread containing `page`. With the item BEING the pair, a page-skip
 * cannot be expressed: the FlatList index is the spread index.
 */
export function spreadForPage(page: number, total: number): MushafSpread {
  const p = clampPage(page, total);
  const right = p % 2 === 0 ? p - 1 : p;
  return {
    index: (right - 1) / 2,
    right,
    left: right + 1 <= total ? right + 1 : null,
  };
}

/** Number of spreads in a muṣḥaf of `total` pages. */
export function spreadCount(total: number): number {
  return Math.ceil(total / 2);
}
