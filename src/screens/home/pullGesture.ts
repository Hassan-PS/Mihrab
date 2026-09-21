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

/** How much of the finger's travel past the threshold the page follows. */
export const PULL_DAMPING = 0.35;

/**
 * THE CURVE — the finger's travel in, the page's travel out.
 *
 * A one-to-one drag feels like the page has come loose; every pull-to-
 * refresh anybody has used pulls back against the finger, more so the
 * further it goes. Linear to the threshold — that stretch must feel
 * honest, because it is where the reader learns the gesture exists — and
 * heavily damped past it, so overshooting reads as "yes, that is enough"
 * rather than as more distance.
 *
 * ONE DEFINITION, TWO READERS. The page is moved by a native-driven
 * `interpolate` over these ranges, on the UI thread, so it keeps up with
 * the finger whatever the JavaScript thread is doing. The decision about
 * whether a release refreshes is made in JavaScript by `pullDistance`
 * below. If the two ever disagreed, the page would sit visibly past the
 * threshold on a release that did nothing — so `pullDistance` IS this
 * curve, read the same way, and a test holds them together.
 */
export const PULL_CURVE = {
  inputRange: [
    0,
    PULL_THRESHOLD,
    PULL_THRESHOLD + (PULL_MAX - PULL_THRESHOLD) / PULL_DAMPING,
  ],
  outputRange: [0, PULL_THRESHOLD, PULL_MAX],
} as const;

/**
 * The page's travel for a finger's, by the same piecewise-linear reading
 * `Animated.interpolate` makes of `PULL_CURVE` with `extrapolate: 'clamp'`.
 */
export function pullDistance(dy: number): number {
  const { inputRange: xs, outputRange: ys } = PULL_CURVE;
  if (!(dy > xs[0])) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (dy <= xs[i]) {
      const t = (dy - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
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
 * ── WHICH DRAGS ARE A PULL ────────────────────────────────────────────
 *
 * Three conditions, all of them necessary, and now said to the gesture
 * handler natively rather than asked in JavaScript on every move:
 *
 *   • AT THE TOP — the handler is disabled anywhere else, or a pull-down
 *     would be an ordinary scroll-up and stealing it would jam the page;
 *   • DOWNWARD — it activates only once the finger has come
 *     `PULL_CLAIM_SLOP` down, and fails the moment it goes that far up,
 *     which hands an upward scroll straight back to the scroll view;
 *   • NOT SIDEWAYS — it fails once the finger has gone `PULL_SIDEWAYS`
 *     across, because the day carousel lives on this page and a swipe to
 *     yesterday must turn the day, not drag the screen down.
 *
 * The offsets are in the shape `PanGestureHandler` takes them: a range the
 * finger may move within without the handler deciding anything.
 */

/** Movement before a drag counts as a pull, in points. */
export const PULL_CLAIM_SLOP = 8;

/** Sideways movement that means "this is the carousel's". */
export const PULL_SIDEWAYS = 20;

/** No practical limit — the handler's offsets want a bound on both sides. */
const FAR = 10_000;

/** Activate once the finger is `PULL_CLAIM_SLOP` DOWN, and never upward. */
export const PULL_ACTIVE_OFFSET_Y: [number, number] = [-FAR, PULL_CLAIM_SLOP];
/** Give up once it is `PULL_CLAIM_SLOP` UP — the scroll view's gesture. */
export const PULL_FAIL_OFFSET_Y: [number, number] = [-PULL_CLAIM_SLOP, FAR];
/** Give up once it is `PULL_SIDEWAYS` across — the carousel's gesture. */
export const PULL_FAIL_OFFSET_X: [number, number] = [-PULL_SIDEWAYS, PULL_SIDEWAYS];

/** A progress bar's width, 0–1, for a fill of `current` out of `total`. */
export function pullProgress(current: number, total: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, current / total));
}
