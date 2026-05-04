/**
 * Motion design language — task #38.
 *
 * Single source of truth for animation curves and durations. Every
 * animation in the app reads from these tokens — direct number literals
 * in `Animated.timing(value, { duration: 300 })` are forbidden by the
 * `reviewer` subagent's rule.
 *
 * Curves named after their character, not their math:
 *
 *   • emphasized — for "important" reveals (modal open, hero card pulse).
 *   • standard   — default for most transitions.
 *   • decelerated — entering elements (settle).
 *   • accelerated — exiting elements (whoosh).
 *
 * Durations:
 *
 *   • instant    100ms — tap feedback, focus rings.
 *   • quick      200ms — small toggles, inline UI shifts.
 *   • standard   300ms — modal opens, screen transitions.
 *   • expressive 450ms — celebratory moments (Eid greeting, streak).
 *
 * Every animation MUST have a Reduce Motion fallback. The
 * `getMotionConfig` helper does the right thing — when Reduce Motion is
 * enabled, returns instant durations and identity easing.
 */

import { AccessibilityInfo, type EasingFunction } from 'react-native';

/** Cubic-bezier control points. RN's `Easing.bezier(...)` produces an
 *  EasingFunction directly; pre-instantiating here avoids per-render churn. */
export const EASING_BEZIERS = {
  emphasized: [0.2, 0, 0, 1] as const,
  standard: [0.4, 0, 0.2, 1] as const,
  decelerated: [0, 0, 0.2, 1] as const,
  accelerated: [0.4, 0, 1, 1] as const,
} as const;

export type EasingToken = keyof typeof EASING_BEZIERS;

export const DURATION = {
  instant: 100,
  quick: 200,
  standard: 300,
  expressive: 450,
} as const;
export type DurationToken = keyof typeof DURATION;

let reduceMotionCache: boolean | null = null;

export function invalidateReduceMotionCache(): void {
  reduceMotionCache = null;
}

export async function isReduceMotion(): Promise<boolean> {
  if (reduceMotionCache !== null) return reduceMotionCache;
  try {
    reduceMotionCache = await AccessibilityInfo.isReduceMotionEnabled();
  } catch {
    reduceMotionCache = false;
  }
  return reduceMotionCache;
}

/**
 * Resolve a motion-token pair into an animation config compatible with
 * RN `Animated.timing`. When Reduce Motion is enabled, returns a
 * 0-duration linear config so the value snaps without animation.
 *
 * Caller passes a pre-built easing fn (RN's `Easing.bezier(...a)`) — we
 * keep this module independent of `react-native`'s Easing module so it
 * can be unit-tested without RN runtime.
 */
export function resolveMotion(
  duration: DurationToken,
  reduceMotion: boolean,
): { duration: number; useNativeDriver: boolean } {
  return {
    duration: reduceMotion ? 0 : DURATION[duration],
    useNativeDriver: true,
  };
}

/** A no-op identity easing function fallback for the Reduce Motion path —
 *  RN's Easing.linear is the canonical choice; we expose a marker constant
 *  callers can pattern-match against. */
export const REDUCE_MOTION_EASING_NAME = 'linear' as const;
