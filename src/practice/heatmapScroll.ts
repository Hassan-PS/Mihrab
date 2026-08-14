/**
 * Which way the practice graph runs, in raw scroll coordinates.
 *
 * The graph is one horizontal ScrollView of week columns, oldest first. Under
 * an RTL locale the row lays itself out the other way, so **the oldest week is
 * on the right and today is on the left** — the mirror of the Latin reading,
 * which is what it should be.
 *
 * What does NOT mirror is `contentOffset.x`. Both platforms report it from the
 * left edge of the content whatever the writing direction is (Android converts
 * to a from-the-start offset internally and converts straight back, so what
 * reaches JS is the raw value). Every piece of scroll logic here was written
 * for Latin, where "x near 0" means "at the oldest week" and "scroll to the
 * end" means "go to today". In Arabic both of those are exactly inverted:
 *
 * - the graph opened parked on the OLDEST week instead of today,
 * - dragging towards today read as reaching the past and kept requesting more
 *   history, which then arrived and shoved the view again,
 * - and the compensation for that history landing pushed the view the wrong
 *   way, because in RTL the new columns extend the content to the right and
 *   everything already drawn keeps the x it had.
 *
 * So the direction lives here, in four functions with no React in them, and
 * the component asks rather than assumes.
 */

/** Furthest the view can be scrolled; 0 when the content fits. */
export function maxOffset(contentWidth: number, viewportWidth: number): number {
  const room = contentWidth - viewportWidth;
  return Number.isFinite(room) && room > 0 ? room : 0;
}

/**
 * Where today sits. The graph parks here on open — the recent weeks are the
 * default view, the history is what you drag towards.
 */
export function todayOffset(rtl: boolean, max: number): number {
  return rtl ? 0 : max;
}

/**
 * How far the view is from the oldest column drawn, in pixels. This is the
 * number the load-more threshold is measured against, and the only reason
 * `maxOffset` has to be known at all in RTL.
 */
export function distanceToOldest(
  rtl: boolean,
  offset: number,
  max: number,
): number {
  const d = rtl ? max - offset : offset;
  return d > 0 ? d : 0;
}

/**
 * Where to be once `added` older columns have landed, so the dates under the
 * thumb hold still.
 *
 * LTR: the past is to the left, so the new columns push everything the user
 * was looking at right by exactly their width — follow it.
 *
 * RTL: the past is to the right. The new columns extend the content in that
 * direction and every column already drawn keeps the x it had, so the honest
 * answer is "don't move" — and saying so explicitly matters, because Android
 * re-anchors an RTL scroll view to its right edge on a content change all by
 * itself, which would otherwise carry the view off into the new weeks.
 */
export function offsetAfterGrowth(
  rtl: boolean,
  offset: number,
  added: number,
  columnWidth: number,
): number {
  if (rtl) return offset;
  return offset + Math.max(0, added) * columnWidth;
}

export type LoadOlderCheck = {
  rtl: boolean;
  offset: number;
  contentWidth: number;
  viewportWidth: number;
  /** One week column including its gap. */
  columnWidth: number;
  /** Columns of slack, so the request goes out with something still to drag. */
  slackColumns?: number;
};

/**
 * Is the view close enough to the oldest week to ask for more of them?
 *
 * `false` while the content still fits the viewport: there is nothing to
 * scroll, the offset is pinned at 0, and in both directions that reads as
 * standing on the oldest column — which is how a fresh install used to ask
 * for two more years of empty weeks it had no use for.
 */
export function shouldLoadOlder({
  rtl,
  offset,
  contentWidth,
  viewportWidth,
  columnWidth,
  slackColumns = 2,
}: LoadOlderCheck): boolean {
  const max = maxOffset(contentWidth, viewportWidth);
  if (max <= 0) return false;
  return distanceToOldest(rtl, offset, max) <= columnWidth * slackColumns;
}
