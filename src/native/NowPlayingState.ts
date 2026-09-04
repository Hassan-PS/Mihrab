/**
 * The system's idea of whether the recitation is playing.
 *
 * `MPNowPlayingInfoCenter.playbackState` is optional on iOS and REQUIRED on
 * macOS, and a Mac Catalyst build is a macOS app as far as that rule is
 * concerned. react-native-track-player fills in every other now-playing
 * field and never sets this one, so on the Mac the app published a
 * complete Control Center entry that macOS then ignored: no panel, no
 * media keys, no "what is playing".
 *
 * Android has no equivalent — its media session carries the state in the
 * PlaybackState itself, which track-player already publishes — so the
 * native module is iOS-only and this is a no-op there, and in tests.
 */
import { NativeModules } from 'react-native';

export type NowPlayingPlaybackState = 'playing' | 'paused' | 'stopped';

type Native = { setState(state: NowPlayingPlaybackState): void };

const native = (NativeModules as { NowPlayingState?: Native }).NowPlayingState;

/** Whether the platform module is present (false on Android and in tests). */
export const nowPlayingStateAvailable = native != null;

let last: NowPlayingPlaybackState | null = null;

/**
 * Publish the state, but only when it has actually changed.
 *
 * The caller is `setStatus`, which fires on every progress-adjacent update
 * as well as on real transitions; a bridge call per tick would be pure
 * noise on a page whose whole point is to be cheap while it plays.
 */
export function setNowPlayingState(state: NowPlayingPlaybackState): void {
  if (!native || state === last) return;
  last = state;
  try {
    native.setState(state);
  } catch {
    // A missing or older native module must never take the player down.
  }
}

/** Test seam: forget what was last published. */
export function _resetNowPlayingState(): void {
  last = null;
}
