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

import {
  AccessibilityInfo,
  NativeModules,
  Platform,
  Vibration,
} from 'react-native';

/**
 * iOS Taptic Engine (ios/PrayerApp/Haptics.swift). Absent on Android and in
 * Jest, where every call becomes a no-op through the optional chaining
 * below — the scrubber must not need to know which platform it is on.
 */
const TapticEngine: {
  prepare?: () => void;
  selectionTick?: () => void;
  impact?: (style: 'light' | 'medium' | 'heavy') => void;
} | undefined = NativeModules.Haptics;

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

/**
 * Wake the haptic hardware at the start of a drag. Without this the first
 * tick of a scrub arrives visibly late on iOS.
 */
export function hapticScrubStart(): void {
  if (reduceMotionCache === true) return;
  TapticEngine?.prepare?.();
}

/**
 * One tick of a continuous scrub — fired when the value under the finger
 * crosses a landmark (for the mushaf rail: a surah boundary).
 *
 * `fast` is about INTENT, not speed for its own sake. A slow, deliberate
 * drag means the reader is hunting for one particular surah, so each
 * boundary gets a firm knock they can stop on. A fast drag means they are
 * ranging across the mushaf and only want the texture of passing surahs,
 * so the ticks go light — a firm knock repeated twenty times a second is
 * a buzz, which carries no information at all.
 *
 * Synchronous on purpose: a scrubber tick that arrives a frame after the
 * knob moved feels like a different event. The Reduce Motion check reads
 * the cache rather than awaiting it, and primes the cache in the
 * background on first use.
 */
export function hapticScrubTick(fast: boolean): void {
  if (reduceMotionCache === null) {
    void isReduceMotionEnabled();
  } else if (reduceMotionCache) {
    return;
  }
  if (Platform.OS === 'android') {
    // Duration IS the intensity on Android's core vibrator: there is no
    // amplitude control in RN's Vibration. 8 ms reads as a faint tick,
    // 20 ms as a definite one, and both stay under a frame.
    Vibration.vibrate(fast ? 8 : 20);
    return;
  }
  if (fast) {
    TapticEngine?.selectionTick?.();
  } else {
    TapticEngine?.impact?.('medium');
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
