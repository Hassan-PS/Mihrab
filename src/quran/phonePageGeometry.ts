/**
 * The phone page's geometry — as one value, published once per change.
 *
 * ── WHAT A ROTATION USED TO COST ──────────────────────────────────────
 *
 * A mushaf page is fifteen justified lines in a page-specific font, ~260
 * drawn pieces, laid out by the platform's text engine. It is worth laying
 * out exactly once per size, and the phone reader was laying it out three
 * times per rotation and twice per fullscreen toggle — for every mounted
 * page, so nine and six layouts of Arabic text on a phone that was also
 * trying to animate the rotation.
 *
 * The cause was that the page's box was assembled from inputs that arrive
 * on different frames and were each fed straight through:
 *
 *   1. `useWindowDimensions` swaps width and height at once. The page was
 *      laid out at the new width against the OLD list height, which the
 *      list had not re-measured yet.
 *   2. On a notched phone the safe-area insets change a render later —
 *      landscape puts the notch on a side — so `pageWidth` changed again,
 *      and the page was laid out again.
 *   3. The list's own `onLayout` then arrived with the real height, and
 *      `useSettledMeasure` published it a hundred milliseconds after it
 *      stopped moving: the layout that was actually wanted, third.
 *
 * Fullscreen on iOS was the same shape: the floating header's height came
 * out of the box immediately, then the list re-measured, then the page
 * was laid out again.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────
 *
 * Every input that decides the page's box is folded into ONE geometry
 * here, and that one value is what settles — so a burst of inputs, however
 * many frames it takes, publishes one geometry when it is over. Until
 * then the page keeps the geometry it has: an old page briefly stretched
 * under the rotation animation, which the platform is cross-fading anyway,
 * rather than three fresh ones nobody sees.
 *
 * And a page is never laid out against a GUESSED viewport. Before the
 * list has been measured there is no geometry, and the reader draws
 * nothing in the box; the first page waits on its font for longer than
 * that anyway.
 */
import { useEffect, useState } from 'react';

/** Breathing room either side of the page inside its column. */
export const H_PADDING = 10;

/**
 * How much bigger the landscape text is than portrait. The landscape
 * screen's short side IS the portrait page width, so this is a direct
 * multiple of it.
 */
export const LANDSCAPE_ZOOM = 1.6;

/** Estimated header-row / footer-medallion heights, dp — the chrome that
 *  brackets the page inside each column. */
export const HEADER_RESERVE = 34;
export const FOOTER_RESERVE = 42;

/** How long the inputs have to stay still before a geometry is published. */
export const GEOMETRY_QUIET_MS = 100;

export type PhonePageGeometry = {
  /**
   * The pager item's width this geometry was computed FOR.
   *
   * Not used to lay anything out — it is how the reader tells a settled
   * geometry that belongs to the list on screen from one left over from
   * before a rotation. See `phoneGeometryFits`, and the same field on the
   * spread's geometry, which needed it first.
   */
  pageWidth: number;
  /** Width of the page's text block, dp. */
  textWidth: number;
  /** The pager viewport less the page's own chrome, dp. */
  viewportH: number;
  /** Landscape: the column scrolls a reading zoom. Portrait: height-fitted. */
  scrolling: boolean;
};

export type PhonePageInputs = {
  /** Window, from `useWindowDimensions`. */
  width: number;
  height: number;
  /** The larger of the two side insets — the page stays centred. */
  sideInset: number;
  /** iOS's floating header height while the chrome is up; 0 otherwise. */
  navPad: number;
  /**
   * The measured pager viewport, or 0 while it has not been measured.
   *
   * THE MINI PLAYER IS NOT SUBTRACTED FROM THIS, and an earlier version
   * that also subtracted a `playerReserve` was measurably wrong. The
   * player is a plain flex sibling BELOW the list, so the moment it
   * mounts the list is re-measured shorter by exactly the player's
   * height: taking it off again reserved the same 68dp twice and opened
   * a void between the page medallion and the player card.
   */
  listH: number;
};

/** One pager item = the list viewport, in the window less the cutout. */
export function phonePageWidth(width: number, sideInset: number): number {
  return width - sideInset * 2;
}

/**
 * The geometry these inputs describe, or null while the list is unmeasured.
 * Pure, so a rotation can be replayed in a test and the publications
 * counted.
 */
export function phonePageGeometry(
  input: PhonePageInputs,
): PhonePageGeometry | null {
  if (!(input.listH > 0)) return null;
  const scrolling = input.width > input.height;
  const pageWidth = phonePageWidth(input.width, input.sideInset);
  const chromeH = input.navPad + HEADER_RESERVE + FOOTER_RESERVE;
  const textWidth = scrolling
    ? Math.min(pageWidth - H_PADDING * 2, input.height * LANDSCAPE_ZOOM)
    : pageWidth - H_PADDING * 2;
  return {
    pageWidth: Math.round(pageWidth),
    // Whole dp, both of them. A sub-pixel wobble in a measurement is enough
    // to give the page a different box, which re-lays out all fifteen
    // lines to produce a page nobody could tell apart from the one on
    // screen.
    textWidth: Math.round(textWidth),
    viewportH: Math.round(input.listH - chromeH),
    scrolling,
  };
}

/** Two geometries that would lay the page out identically have one key. */
export function geometryKey(g: PhonePageGeometry | null): string {
  if (!g) return '';
  return `${g.pageWidth}:${g.textWidth}x${g.viewportH}${g.scrolling ? 's' : 'f'}`;
}

/**
 * Does this geometry belong to the list on screen?
 *
 * ── WHAT A ROTATION LOOKED LIKE WITHOUT THIS ──────────────────────────
 *
 * The pager's items are exactly one viewport wide and its scroll offset is
 * a multiple of that width. A rotation changes the width immediately, and
 * the offset is corrected a frame later (`reanchor`, in an effect) — so in
 * between, a landscape-wide viewport was showing an offset computed for a
 * portrait-wide item: TWO pages side by side, sliding into one. Reported
 * as the reader looking fragile, and it is: nothing about a phone muṣḥaf
 * should ever show a spread.
 *
 * The reader covers the pager in the page colour while the answer is no.
 * The platform is cross-fading the rotation over the top of it anyway.
 */
export function phoneGeometryFits(
  g: PhonePageGeometry | null,
  pageWidth: number,
): g is PhonePageGeometry {
  return g != null && g.pageWidth === Math.round(pageWidth);
}

/**
 * A value, once it has stopped changing.
 *
 * Holds the last published value through a burst — the page keeps drawing
 * at the size it has — and publishes the new one `quietMs` after the last
 * change. The first value waits too: on iOS the header reports an estimate
 * before its measured height, and a first page laid out against the
 * estimate was a second layout waiting to happen. The push transition is
 * longer than the wait, so nobody sees it.
 *
 * `key` says which values would lay the page out identically. It is what
 * the comparison runs on, because the reader builds a fresh object every
 * render, and re-arming the timer for an identical geometry would push the
 * publication out for as long as the reader kept rendering — which, during
 * recitation, is for ever.
 */
export function useSettledValue<T>(
  raw: T | null,
  key: (value: T | null) => string,
  quietMs: number = GEOMETRY_QUIET_MS,
): T | null {
  const [settled, setSettled] = useState<T | null>(null);
  const rawKey = key(raw);
  const settledKey = key(settled);
  useEffect(() => {
    if (raw == null || rawKey === settledKey) return;
    const id = setTimeout(() => setSettled(raw), quietMs);
    return () => clearTimeout(id);
    // Keyed on the VALUE, not the object — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKey, settledKey, quietMs]);
  return settled;
}

/** The phone page's geometry, once it has stopped changing. */
export function useSettledGeometry(
  raw: PhonePageGeometry | null,
  quietMs: number = GEOMETRY_QUIET_MS,
): PhonePageGeometry | null {
  return useSettledValue(raw, geometryKey, quietMs);
}
