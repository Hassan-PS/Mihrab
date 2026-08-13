/**
 * Which day a horizontal drag on the Log lands on.
 *
 * The arrows were the only way to change day, which is fine for yesterday
 * and tedious for last month — a hundred taps to reach a square you can
 * already see on the graph. The day panel is now a page you can throw
 * sideways, and this is the part of that worth testing on its own: a
 * gesture is untestable in Jest, a decision is not.
 *
 * Reads as a page, not as a scrollbar: a short flick counts, a long slow
 * drag counts, and everything else springs back. Two thresholds rather than
 * one because a fast swipe barely travels and a careful drag has no speed,
 * and refusing either would feel broken to whoever's habit it is.
 */

/** Fraction of the panel's width a slow drag must cross to commit. */
const DISTANCE_FRACTION = 0.22;
/** Floor for the above, so a narrow phone still needs a real drag. */
const MIN_DISTANCE = 48;
/** Points per millisecond. Above this, distance stops mattering. */
const FLICK_VELOCITY = 0.35;

export type DaySwipe = {
  /** Horizontal travel, in points. Positive = towards the right edge. */
  dx: number;
  /** Horizontal velocity at release, points per ms. */
  vx: number;
  /** Width of the panel being dragged. */
  width: number;
  /** False on today: there is no tomorrow to log. */
  canGoForward: boolean;
  /** Arabic and the other RTL locales read the other way — so does this. */
  rtl?: boolean;
};

/**
 * -1 for the previous day, +1 for the next, 0 to stay put.
 *
 * In LTR, dragging right pulls yesterday in from the left, the same way a
 * photo carousel does. In RTL the whole axis mirrors, because the arrows
 * either side of the date mirror too and a pager that disagreed with them
 * would be worse than one that simply went the "wrong" way.
 */
export function swipeDayDelta({
  dx,
  vx,
  width,
  canGoForward,
  rtl = false,
}: DaySwipe): -1 | 0 | 1 {
  const travel = rtl ? -dx : dx;
  const speed = rtl ? -vx : vx;
  const threshold = Math.max(MIN_DISTANCE, width * DISTANCE_FRACTION);

  // A flick and a drag are different gestures with the same intent. Either
  // qualifies; neither is required to also satisfy the other. Direction is
  // taken from whichever one qualified — a drag that ends with a flick back
  // the other way is a change of mind, and the flick wins.
  let delta: -1 | 0 | 1 = 0;
  if (Math.abs(speed) >= FLICK_VELOCITY) delta = speed > 0 ? -1 : 1;
  else if (Math.abs(travel) >= threshold) delta = travel > 0 ? -1 : 1;

  // Forward stops at today, for the same reason the arrow is disabled: a
  // log of the future is a plan. Return 0 rather than clamping to -1, so an
  // over-eager swipe on today does nothing instead of going backwards.
  if (delta === 1 && !canGoForward) return 0;
  return delta;
}

/**
 * How far the panel should actually move while a drag is in progress.
 *
 * Dragging towards a day that does not exist gets heavy rubber-banding
 * rather than a hard stop: the panel still answers the finger, so the
 * gesture feels received, and it visibly refuses to go, which says "not
 * that way" more clearly than nothing moving at all.
 */
export function dragTranslation({
  dx,
  canGoForward,
  rtl = false,
}: Pick<DaySwipe, 'dx' | 'canGoForward'> & { rtl?: boolean }): number {
  const forward = rtl ? dx > 0 : dx < 0;
  if (forward && !canGoForward) return dx * 0.18;
  return dx;
}
