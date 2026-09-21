/**
 * THE PULL, AS ARITHMETIC — so the gesture can be tested without a finger.
 *
 * The component next door owns the PanResponder, the Animated value and
 * the indicator. Everything that decides what the gesture MEANS is here,
 * as pure functions over numbers: how far the page follows the finger,
 * when the pull becomes a release, and what the indicator should be
 * saying at any point. A rule that lives in a gesture callback is a rule
 * nobody can check.
 */

/**
 * How far the page must come down before releasing it refreshes.
 *
 * Far enough that a flick while reading the day cannot trigger it, close
 * enough that the thumb gets there without a stretch. It is also where
 * the indicator parks during the refresh, so it doubles as the height of
 * a row of text — which is why it is not smaller.
 */
export const PULL_THRESHOLD = 72;

/** The page cannot be dragged further than this, however hard it is pulled. */
export const PULL_MAX = 120;

/**
 * The finger moves further than the page does.
 *
 * A one-to-one drag feels like the page has come loose; every pull-to-
 * refresh anybody has used pulls back against the finger, more so the
 * further it goes. Linear to the threshold — that stretch must feel
 * honest, because it is where the reader learns the gesture exists — and
 * heavily damped past it, so overshooting reads as "yes, that is enough"
 * rather than as more distance.
 */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0;
  if (dy <= PULL_THRESHOLD) return dy;
  const past = dy - PULL_THRESHOLD;
  return Math.min(PULL_MAX, PULL_THRESHOLD + past * 0.35);
}

/**
 * What the indicator is saying.
 *
 *   • `hidden`     — nothing to see; the page is where it belongs.
 *   • `pull`       — "Pull down to refresh". Not there yet.
 *   • `release`    — "Release to refresh". Let go and it happens.
 *   • `refreshing` — parked at the threshold, showing how far it has got.
 */
export type PullPhase = 'hidden' | 'pull' | 'release' | 'refreshing';

export function pullPhase(distance: number, refreshing: boolean): PullPhase {
  if (refreshing) return 'refreshing';
  if (distance <= 0) return 'hidden';
  return distance >= PULL_THRESHOLD ? 'release' : 'pull';
}

/**
 * Does letting go here start a refresh?
 *
 * Asked of the DISTANCE, not of the finger. Pulling past the threshold and
 * then pushing back up is a cancel — the reader changed their mind, and
 * the only honest reading of where they let go is where the page is.
 */
export function releaseStarts(distance: number): boolean {
  return distance >= PULL_THRESHOLD;
}

/**
 * Where the page rests while the refresh runs: at the threshold, exactly.
 *
 * "Dropping it at the threshold keeps it there during the refresh" — so
 * the indicator does not bounce to some other height the moment the
 * finger leaves, which would read as the gesture having been let go of
 * rather than accepted.
 */
export const PULL_RESTING = PULL_THRESHOLD;

/**
 * Should this drag be treated as a pull rather than left to the scroll
 * view?
 *
 * Three conditions, all of them necessary. The page must be AT THE TOP,
 * or a pull-down is an ordinary scroll-up and stealing it would jam the
 * page. The drag must be downward, because upward at the top is nothing
 * at all. And it must be more vertical than horizontal, or a swipe across
 * the day carousel — which lives on this page — would drag the whole
 * screen down instead of turning the day.
 */
export function shouldClaimPull(input: {
  atTop: boolean;
  dy: number;
  dx: number;
}): boolean {
  if (!input.atTop) return false;
  if (input.dy <= PULL_CLAIM_SLOP) return false;
  return Math.abs(input.dy) > Math.abs(input.dx) * 1.5;
}

/** Movement before a drag counts as a pull, in points. */
export const PULL_CLAIM_SLOP = 8;

/** A progress bar's width, 0–1, for a fill of `current` out of `total`. */
export function pullProgress(current: number, total: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, current / total));
}
