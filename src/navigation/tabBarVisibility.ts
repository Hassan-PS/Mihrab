/**
 * The tab bar gets out of the way when you are reading, and comes back the
 * moment you look like you want it.
 *
 * ── WHY A MODULE AND NOT A CONTEXT ────────────────────────────────────
 *
 * A scroll handler fires every frame. Putting that through React context
 * would re-render every consumer of the context on every frame of every
 * scroll, on six screens, to move one bar. This is the same read-through
 * store the practice screens use: the scroll writes to a module variable,
 * and only a CHANGE of direction notifies anybody.
 *
 * ── THE RULES, AND WHY EACH ONE IS THERE ──────────────────────────────
 *
 * Hide on the way down, show on the way up — but not literally, or the bar
 * flickers on every stutter of a thumb. So:
 *
 *   • nothing happens in the first `FLOOR` points, because a list that has
 *     barely moved is not "scrolling down", it is settling;
 *   • a direction has to be sustained for `THRESHOLD` points before it
 *     counts, which is what stops a shaking hand strobing the bar;
 *   • the top always shows it, unconditionally, because arriving back at
 *     the top of a list is the clearest "I am done reading" there is;
 *   • and any bounce past the end is ignored, since an over-scroll is the
 *     list moving, not the reader.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { FLOATS_OVER_CONTENT } from './tabBarInset';

/** Below this offset the bar is always shown. Roughly the bar's own height. */
const FLOOR = 64;

/** How far a direction must be sustained before the bar reacts. */
const THRESHOLD = 12;

let hidden = false;
const listeners = new Set<(next: boolean) => void>();

function setHidden(next: boolean): void {
  if (next === hidden) return;
  hidden = next;
  listeners.forEach(fn => fn(next));
}

/** Bring it back — on a tab change, on a screen that does not scroll. */
export function showTabBar(): void {
  setHidden(false);
}

/** For tests. */
export function resetTabBarVisibility(): void {
  hidden = false;
  listeners.clear();
}

/** Whether the bar is currently out of the way. */
export function useTabBarHidden(): boolean {
  const [value, setValue] = useState(hidden);
  useEffect(() => {
    setValue(hidden);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/**
 * Decide what a scroll position means. Pure, so the rules above can be
 * tested without a scroll view.
 *
 * `last` is the previous offset and `anchor` the offset where the current
 * direction began; both are carried by the caller.
 */
export function nextTabBarState(input: {
  y: number;
  last: number;
  anchor: number;
  hidden: boolean;
}): { hidden: boolean; anchor: number } {
  const { y, last, anchor } = input;
  // An over-scroll — the rubber band at either end — is the list moving,
  // not the reader deciding anything.
  if (y <= 0) return { hidden: false, anchor: 0 };
  // Near the top the bar is always available. Someone who has scrolled
  // back up to the beginning is not reading any more.
  if (y < FLOOR) return { hidden: false, anchor: y };

  const goingDown = y > last;
  // A change of direction re-anchors, so the threshold is measured from
  // where the direction changed rather than from wherever the list started.
  const turned = goingDown !== y > anchor;
  if (turned) return { hidden: input.hidden, anchor: last };

  const travelled = Math.abs(y - anchor);
  if (travelled < THRESHOLD) return { hidden: input.hidden, anchor };
  return { hidden: goingDown, anchor: y };
}

/**
 * Spread onto a scrolling view to let it move the bar.
 *
 * Returns nothing useful on the platforms where the bar is IN FLOW rather
 * than floating over the content — hiding one of those would reflow the
 * page under the reader's thumb, which is a different and much worse
 * behaviour than the one being asked for.
 */
export function useTabBarScroll(): {
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
} {
  const last = useRef(0);
  const anchor = useRef(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const next = nextTabBarState({
        y,
        last: last.current,
        anchor: anchor.current,
        hidden,
      });
      last.current = y;
      anchor.current = next.anchor;
      setHidden(next.hidden);
    },
    [],
  );

  // Leaving a screen must not leave the bar hidden on the next one.
  useEffect(() => showTabBar, []);

  if (!FLOATS_OVER_CONTENT) return {};
  return { onScroll, scrollEventThrottle: 16 };
}
