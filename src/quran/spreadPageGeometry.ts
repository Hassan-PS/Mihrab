/**
 * The spread reader's geometry — one value, published once per change.
 *
 * The same discipline as `phonePageGeometry.ts`, for the reader an iPad
 * and a Mac use. Rotating an iPad re-pairs the list — portrait is one
 * page per item, landscape a facing pair — so the items themselves are
 * new; but the size each page was then laid out AT was assembled the same
 * way as the phone's, from a live window height, a live header height and
 * a list height that had not been re-measured yet, and every new item was
 * laid out at that guess before being laid out again at the truth.
 *
 * Here the geometry carries the shape it was computed FOR — the item width
 * and whether items are pairs — so the reader can tell a settled geometry
 * that belongs to the list on screen from one left over from before the
 * rotation. Until they agree, a column draws its chrome and no page: a
 * blank page for the tail of a rotation the platform is animating anyway,
 * rather than a page laid out twice.
 */
import { useSettledValue } from './phonePageGeometry';

/** KFGQPC source page ratio — the printed page's width over height. */
export const PAGE_ASPECT = 2600 / 4206;

/** Breathing room either side of a page inside its column. */
export const H_PADDING = 4;

export const HEADER_RESERVE = 34;
export const FOOTER_RESERVE = 42;

export type SpreadGeometry = {
  /** The list item's width — the shape this geometry belongs to. */
  pageWidth: number;
  /** Facing pairs (landscape) or single pages (portrait). */
  paired: boolean;
  /** The height a page column has for the page itself. */
  availH: number;
};

export type SpreadInputs = {
  width: number;
  height: number;
  sideInset: number;
  /** The index sidebar's width when it is shown, else 0. */
  sidebarWidth: number;
  navPad: number;
  /** Measured list viewport, or 0 while unmeasured. */
  listH: number;
  playerReserve: number;
};

export function spreadPageWidth(
  width: number,
  sideInset: number,
  sidebarWidth: number,
): number {
  return width - sideInset * 2 - sidebarWidth;
}

/** The geometry these inputs describe, or null while the list is unmeasured. */
export function spreadGeometry(input: SpreadInputs): SpreadGeometry | null {
  if (!(input.listH > 0)) return null;
  return {
    pageWidth: spreadPageWidth(input.width, input.sideInset, input.sidebarWidth),
    paired: input.width > input.height,
    // Whole dp — a sub-pixel wobble in the measured viewport must not fork
    // the page's layout.
    availH: Math.round(
      Math.max(
        120,
        input.listH -
          input.navPad -
          HEADER_RESERVE -
          FOOTER_RESERVE -
          input.playerReserve,
      ),
    ),
  };
}

export function spreadGeometryKey(g: SpreadGeometry | null): string {
  if (!g) return '';
  return `${g.pageWidth}x${g.availH}${g.paired ? 'p' : 's'}`;
}

/**
 * Does this geometry belong to the list on screen? A settled geometry
 * from before a rotation names the old width and the old pairing; a page
 * must not be laid out against it inside the new items.
 */
export function spreadGeometryFits(
  g: SpreadGeometry | null,
  pageWidth: number,
  paired: boolean,
): g is SpreadGeometry {
  return g != null && g.pageWidth === pageWidth && g.paired === paired;
}

/**
 * The size of one page in a column, and the margin around a spread of two.
 *
 * ── WHY THE MARGINS ARE COMPUTED AND NOT PADDED ───────────────────────
 *
 * Each column used to pad itself by `H_PADDING` and centre the page in
 * what was left. When the page is HEIGHT-capped — which on a wide Mac
 * window it always is — the leftover width is wider than that padding,
 * and centring splits it evenly on both sides of each column. Both inner
 * halves then land against each other, so the gutter between the two
 * pages came out at twice the margin against the window's edges. A book
 * is not set that way.
 *
 * So the slack is divided into THREE equal parts — outer, gutter, outer —
 * and each page is placed against its own share rather than centred in a
 * box.
 */
export function spreadColumn(
  availH: number,
  colW: number,
  spread: boolean,
): { pageW: number; pageH: number; margin: number } {
  let pageW = colW - H_PADDING * 2;
  let pageH = pageW / PAGE_ASPECT;
  if (pageH > availH) {
    pageH = availH;
    pageW = pageH * PAGE_ASPECT;
  }
  // Three equal gaps across the pair; a single page keeps the two it has.
  // `margin` is the outer one, and the gutter is the same.
  const margin = spread
    ? Math.max(H_PADDING, (colW * 2 - pageW * 2) / 3)
    : Math.max(H_PADDING, (colW - pageW) / 2);
  return { pageW, pageH, margin };
}

/** The spread's geometry, once it has stopped changing. */
export function useSettledSpreadGeometry(
  raw: SpreadGeometry | null,
): SpreadGeometry | null {
  return useSettledValue(raw, spreadGeometryKey);
}
