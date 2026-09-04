/**
 * Where an āyah sits down the page, so a scrolling column can follow the
 * recitation.
 *
 * ── WHY A COLUMN HAS TO FOLLOW AT ALL ─────────────────────────────────
 *
 * In portrait the page is height-fitted: every line is on screen, and the
 * highlight moving from line to line needs nothing from the reader. Turn
 * the phone and the column becomes a 1.6× reading zoom — deliberately
 * taller than the window — and the recitation walks off the bottom of it
 * within a few āyāt. Reported as the player "not following the word
 * highlight as it moves across the page", which is exactly what it looked
 * like: the highlight was moving, on a part of the page nobody could see.
 *
 * The unit is the LINE, not the word. A muṣḥaf line is horizontal, so a
 * word's position across it says nothing about how far down the page the
 * reciter has got; scrolling per word would jitter the page sideways-worth
 * of nothing fifteen times a line.
 *
 * Only the glyph renderer has a layout to answer from. A bundled riwayah
 * (`unicode`) flows its text and has no fixed lines, so this returns null
 * and the column stays where the reader put it.
 */
import { getPageLayout, pageBlockEm } from './mushafLayout';
import { MUSHAF_LINE_HEIGHT_EM } from './MushafTextPage';

export type AyahLineBox = {
  /** Top of the line, in points from the top of the page block. */
  y: number;
  /** The line's own height, so a caller can centre on it. */
  lineHeight: number;
};

/**
 * The height of one printed line on `page` at this drawn width, or null
 * where the page has no glyph layout to measure.
 *
 * Pulled out of `ayahLineBox` because a caller can need the unit before
 * it knows which āyah is on screen — the Tilāwah preview sizes its own
 * window in lines, and has to do that whether or not the recitation has
 * reached this page yet.
 */
export function mushafLineHeight(
  page: number,
  textWidth: number,
): number | null {
  if (!(textWidth > 0)) return null;
  const layout = getPageLayout(page);
  if (!layout) return null;
  const blockEm = pageBlockEm(layout);
  if (!(blockEm > 0)) return null;
  return (textWidth / blockEm) * MUSHAF_LINE_HEIGHT_EM;
}

/**
 * The first line of `page` that carries this āyah, or null when the page
 * has no glyph layout or the āyah is not on it.
 *
 * `textWidth` is the drawn width of the block — the same number the
 * surface is given — because the font size, and so the line height, is
 * derived from it.
 */
export function ayahLineBox(
  page: number,
  textWidth: number,
  surah: number,
  ayah: number,
): AyahLineBox | null {
  const lineHeight = mushafLineHeight(page, textWidth);
  if (lineHeight == null) return null;
  const layout = getPageLayout(page)!;
  const index = layout.lines.findIndex(
    line =>
      line.kind === 'ayah' &&
      line.words.some(w => w.surah === surah && w.ayah === ayah),
  );
  if (index < 0) return null;
  return { y: index * lineHeight, lineHeight };
}

/**
 * Where to scroll a column of `viewportH` so that line is comfortably in
 * view — a third of the way down rather than centred, because the reader
 * is going DOWN the page and the lines that matter next are below it.
 */
export function followOffset(
  box: AyahLineBox,
  viewportH: number,
  contentH: number,
): number {
  const target = box.y + box.lineHeight / 2 - viewportH / 3;
  return Math.max(0, Math.min(target, Math.max(0, contentH - viewportH)));
}

/**
 * Where to scroll a column so the line being recited is the FIRST one in
 * a short window, with the lines that come next filling the rest of it.
 *
 * Different question from `followOffset`, which keeps a line comfortably
 * inside a tall viewport. Here the viewport is four lines: "comfortably
 * inside" would spend two of them on text already recited. The clamp at
 * the end is what handles the foot of the page — once there are fewer
 * than three lines left below, the window stops moving and the recited
 * line arrives at the bottom of it with its predecessors above, which is
 * the only honest thing a four-line window can show there.
 */
export function windowOffset(
  box: AyahLineBox,
  viewportH: number,
  contentH: number,
): number {
  return Math.max(0, Math.min(box.y, Math.max(0, contentH - viewportH)));
}

/**
 * Which printed line first carries this āyah, or null when the page has
 * no glyph layout or the āyah is not on it.
 *
 * The index, not a position: a caller that knows the column's real
 * geometry (`mushafLineGeometry`) can turn an index into points exactly,
 * and one that does not has no business guessing.
 */
export function ayahLineIndex(
  page: number,
  surah: number,
  ayah: number,
): number | null {
  const layout = getPageLayout(page);
  if (!layout) return null;
  const index = layout.lines.findIndex(
    line =>
      line.kind === 'ayah' &&
      line.words.some(w => w.surah === surah && w.ayah === ayah),
  );
  return index < 0 ? null : index;
}
