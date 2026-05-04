/**
 * Polish layer: haptics — task #32.
 *
 * Cross-platform haptic helpers. Uses `Vibration` (built into RN core) so
 * nothing extra ships in the F-Droid build. Patterns are calibrated for
 * the prayer-app context — quiet by default, never aggressive.
 *
 * Respects the user's "Reduce Motion" accessibility preference: when
 * Reduce Motion is on we skip haptics entirely (some users mark Reduce
 * Motion as a proxy for "less sensory feedback in general").
 */

import { AccessibilityInfo, Platform, Vibration } from 'react-native';

let reduceMotionCache: boolean | null = null;

/** Cached Reduce Motion state — refreshed lazily; the OS event for changes
 *  fires `AccessibilityInfo.reduceMotionChanged` which the caller can wire
 *  to invalidate the cache. */
async function isReduceMotionEnabled(): Promise<boolean> {
  if (reduceMotionCache !== null) return reduceMotionCache;
  try {
    reduceMotionCache = await AccessibilityInfo.isReduceMotionEnabled();
  } catch {
    reduceMotionCache = false;
  }
  return reduceMotionCache;
}

export function invalidateReduceMotionCache(): void {
  reduceMotionCache = null;
}

/** Tick — used for tasbih increments. ~10 ms on Android, default haptic on iOS. */
export async function hapticTick(): Promise<void> {
  if (await isReduceMotionEnabled()) return;
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    // iOS doesn't expose a granular short tick via core Vibration — falls
    // back to the default pulse, which is short.
    Vibration.vibrate();
  }
}

/** Celebration — used at tasbih target completion, streak milestone. */
export async function hapticCelebrate(): Promise<void> {
  if (await isReduceMotionEnabled()) return;
  if (Platform.OS === 'android') {
    Vibration.vibrate([0, 60, 80, 60, 80, 60]);
  } else {
    Vibration.vibrate();
  }
}

/** Adhan-impending — subtle pulse 1 minute before prayer (used by the
 *  HomeScreen hero card pulse, in concert with the visual scale animation). */
export async function hapticPulse(): Promise<void> {
  if (await isReduceMotionEnabled()) return;
  if (Platform.OS === 'android') {
    Vibration.vibrate(40);
  }
  // iOS: skip — the visual cue is enough on iOS where short-tick haptics
  // require the UIKit Selection / Notification feedback generators.
}
