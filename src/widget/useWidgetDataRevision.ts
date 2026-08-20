/**
 * One number that changes when anything the widget shows changes.
 *
 * Prayer times are not the only thing on a widget any more. A prayer
 * logged, a page turned or a bead counted all change what the home screen
 * should say while changing no prayer time at all — so the effect that
 * pushes the payload needs a dependency that moves on those too.
 *
 * COALESCED ON PURPOSE. Tasbih is the reason: a round is thirty-three taps,
 * and rebuilding and re-pushing the whole payload thirty-three times would
 * mean thirty-three reads of the encrypted journal and thirty-three writes
 * to an App Group plist, for a number that is only interesting once the
 * user stops tapping. The trailing delay collapses a burst into one push,
 * and it collapses an unrelated burst — log a prayer, then turn a page —
 * into one push as well, which is the same win for free.
 */
import { useEffect, useRef, useState } from 'react';
import { subscribePractice } from '../practice/practiceStore';
import { subscribeQuranState } from '../quran/quranState';
import { subscribeTasbihState } from '../tasbih/tasbihStore';

/** Long enough to swallow a tasbih round's tail, short enough to feel live. */
export const WIDGET_COALESCE_MS = 1500;

export function useWidgetDataRevision(delayMs = WIDGET_COALESCE_MS): number {
  const [revision, setRevision] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const bump = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        setRevision(r => r + 1);
      }, delayMs);
    };
    const unsubscribe = [
      subscribePractice(bump),
      subscribeQuranState(bump),
      subscribeTasbihState(bump),
    ];
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      unsubscribe.forEach(fn => fn());
    };
  }, [delayMs]);

  return revision;
}
