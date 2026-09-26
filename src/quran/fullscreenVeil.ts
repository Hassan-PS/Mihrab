/**
 * THE VEIL — fullscreen goes in and out behind a sheet of page colour.
 *
 * Toggling fullscreen is not one change but five that land on their own
 * schedules: the navigation header goes (native, at once), the status bar
 * goes (native, animated), the rail goes (a React render), the list
 * re-measures its new height (a layout pass), and then the page re-lays
 * out fifteen lines against it — after `useSettledGeometry` has waited for
 * the measurements to stop moving. Each step showed: a page that jumped,
 * then stretched, then jumped again, over a quarter of a second. It read
 * as the app struggling, not as a mode changing.
 *
 * So the change happens under a veil. On a tap the page fades to its own
 * paper colour — quickly, but a fade, so the eye has a cue — and only THEN
 * is fullscreen toggled; the chrome and the re-layout do their shuffling
 * under the veil, and once the new geometry has settled the veil fades out
 * onto the finished page. Two fades and one page, in place of five
 * twitches.
 *
 * The screen that owns `isFullscreen` owns the veil too, so every way in
 * and out — a tap on the page, the ✕, the header's ⛶, the back button —
 * goes through it. The phone reader draws it (it is the page's colour, so
 * it has to be inside the page) and lifts it when its geometry settles;
 * a timer here lifts it regardless, so the page always comes back.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';

/** In is short (the tap should feel answered); out is where the ease shows. */
export const VEIL_IN_MS = 90;
export const VEIL_OUT_MS = 220;
/** A frame or two for the page to draw at its new size before the lift. */
export const VEIL_SETTLE_MS = 32;
/** The promise that the page always comes back. */
export const VEIL_MAX_MS = 900;

export type FullscreenVeil = {
  /** 0 = page visible, 1 = veiled. Drive an Animated.View's opacity. */
  opacity: Animated.Value;
  /** Fade the veil out — the reader calls this once its layout has settled. */
  lift: () => void;
  /** True while the veil is up and waiting to be lifted. */
  pending: () => boolean;
};

export function useFullscreenVeil(setFullscreen: (next: boolean | ((f: boolean) => boolean)) => void): {
  veil: FullscreenVeil;
  /** Toggle (no argument) or set fullscreen, behind the veil. */
  request: (next?: boolean) => void;
} {
  const opacity = useRef(new Animated.Value(0)).current;
  const pendingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lift = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    Animated.timing(opacity, { toValue: 0, duration: VEIL_OUT_MS, useNativeDriver: true }).start();
  }, [opacity]);

  const request = useCallback(
    (next?: boolean) => {
      // A second tap while the veil is up: let the first one finish.
      if (pendingRef.current) return;
      pendingRef.current = true;
      Animated.timing(opacity, { toValue: 1, duration: VEIL_IN_MS, useNativeDriver: true }).start(
        ({ finished }) => {
          if (!finished) {
            pendingRef.current = false;
            opacity.setValue(0);
            return;
          }
          if (next == null) setFullscreen(f => !f);
          else setFullscreen(next);
          timer.current = setTimeout(lift, VEIL_MAX_MS);
        },
      );
    },
    [opacity, setFullscreen, lift],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const veil = useMemo<FullscreenVeil>(
    () => ({ opacity, lift, pending: () => pendingRef.current }),
    [opacity, lift],
  );
  return { veil, request };
}
