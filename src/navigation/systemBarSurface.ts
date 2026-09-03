/**
 * The colour the system navigation bar should read as, when a screen wants
 * to own it.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * Everywhere in the app the bottom of the window is app chrome, and the
 * band behind the navigation buttons is the tab bar's own material — see
 * `SystemNavigationScrim`. The muṣḥaf is the exception: in fullscreen there
 * is no chrome at all, the page runs to every edge of the window, and a
 * strip of app surface across the bottom is exactly the seam the fullscreen
 * reader exists to remove. Reported against v2.9 with a sepia page and a
 * near-white bar under it.
 *
 * So a screen can PUBLISH the surface it wants there — the page colour and
 * whether that colour is dark — and two things read it: the band, which
 * paints it, and the inset controller, which puts light or dark glyphs on
 * top of it. The muṣḥaf's tone is independent of the app theme (a night
 * page in a light app is normal), so the glyphs cannot be decided from the
 * theme alone.
 *
 * A module store, not a context, for the same reason as
 * `tabBarVisibility`: the publisher is a reader that re-renders on every
 * frame of a page turn, and the consumers are two views at the root of the
 * app that must not re-render with it.
 */
import { useEffect, useState } from 'react';

export type SystemBarSurface = {
  /** The colour the bottom of the window should be. */
  color: string;
  /** Dark surface ⇒ light glyphs. */
  isDark: boolean;
};

let surface: SystemBarSurface | null = null;
const listeners = new Set<(next: SystemBarSurface | null) => void>();

function publish(next: SystemBarSurface | null): void {
  if (
    next?.color === surface?.color &&
    next?.isDark === surface?.isDark &&
    (next == null) === (surface == null)
  ) {
    return;
  }
  surface = next;
  listeners.forEach(fn => fn(next));
}

/**
 * Claim the system bar surface for a screen. Returns the release, so a
 * caller can hand it straight to an effect's cleanup and never leave the
 * app wearing a page colour on a screen that has no page.
 */
export function setSystemBarSurface(next: SystemBarSurface): () => void {
  publish(next);
  return () => {
    // Only if nobody else has claimed it since — two readers overlap for a
    // frame during a push, and the one leaving must not clear the one
    // arriving.
    if (surface?.color === next.color && surface?.isDark === next.isDark) {
      publish(null);
    }
  };
}

/** Give it back to the app chrome. */
export function clearSystemBarSurface(): void {
  publish(null);
}

/** For tests. */
export function resetSystemBarSurface(): void {
  surface = null;
  listeners.clear();
}

/** What the bottom of the window should be, or null for the app's own. */
export function useSystemBarSurface(): SystemBarSurface | null {
  const [value, setValue] = useState(surface);
  useEffect(() => {
    setValue(surface);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
