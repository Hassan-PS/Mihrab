/**
 * The player's position, polled only while someone can see it.
 *
 * `useProgress` from react-native-track-player is a timeout loop that
 * asks the native player for its position every `ms` for as long as the
 * hook is mounted. It does not know whether the screen is on. The app's
 * own promise is that recitation keeps playing with the screen off — and
 * with the screen off, every screen that used this hook was still asking
 * the bridge for a number twice, four times a second, to draw a line and
 * a highlight in a pocket.
 *
 * `useIsActive` is the app's one answer to "is a human looking at this
 * screen": navigation focus AND the app in the foreground (see the note
 * there for why neither alone is enough). Away, the loop is re-armed at
 * an hour, which the library treats as a dependency change and restarts
 * cleanly; back, it re-arms at the real pace and polls at once, so the
 * first frame is current rather than stale by the time spent away.
 */
import { useProgress } from 'react-native-track-player';
import { useIsActive } from '../../hooks/useIsActive';

/** Once an hour is "never" for a UI, and still a valid timer. */
export const IDLE_POLL_MS = 60 * 60 * 1000;

export function useProgressWhileActive(
  ms: number,
): ReturnType<typeof useProgress> {
  const active = useIsActive();
  return useProgress(active ? ms : IDLE_POLL_MS);
}
