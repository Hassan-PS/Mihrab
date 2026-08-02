/**
 * The verse of the day, kept current (v2.8.4).
 *
 * `verseOfTheDayRef` is date-seeded, and the Quran screen used to read it
 * ONCE per mount. A phone that sits on the Quran tab overnight — or, far
 * more commonly, an app resumed the next morning from the background —
 * therefore kept yesterday's verse on screen, while the notification that
 * had just fired carried today's. The card now re-reads the date when the
 * day actually turns: on resume, and on a timer set to the next local
 * midnight (so an app left open through the night rolls over on its own).
 *
 * Returning the same object identity while the day is unchanged matters:
 * the ref is a dependency of the Arabic/tafsir loads on the card.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { verseOfTheDayRef } from './search';

export type AyahRefLite = { surah: number; ayah: number };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function msUntilNextMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  // One extra second so the timer never fires a hair before the date flips.
  return Math.max(1000, next.getTime() - now.getTime() + 1000);
}

export function useVerseOfTheDay(): AyahRefLite {
  const [ref, setRef] = useState<AyahRefLite>(() => verseOfTheDayRef());
  const dayRef = useRef(dayKey(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      const now = new Date();
      const key = dayKey(now);
      if (key !== dayRef.current) {
        dayRef.current = key;
        setRef(verseOfTheDayRef(now));
      }
      // Re-arm for the next midnight from wherever we are now.
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, msUntilNextMidnight(now));
    };

    check();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return ref;
}
