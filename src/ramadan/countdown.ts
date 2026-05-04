/**
 * Suhoor / Iftar countdown helpers — task #21.
 *
 * Reads from a `TimingsMap` populated by task #7's Ramadan-aware provider
 * (Imsak guaranteed present). Pure date math; the React hook lives in
 * `useRamadanCountdown.ts`.
 *
 * Conventions:
 *   • Suhoor cutoff = Imsak (start of the fast).
 *   • Iftar = Maghrib (break of the fast).
 *   • If `now` is between Imsak and Maghrib, the next event is Iftar
 *     (the user is fasting — they're waiting to break).
 *   • Otherwise the next event is Suhoor / next-day Imsak.
 */

import { addDays, combineLocalDateAndTime, startOfLocalDay } from '../utils/prayerTimes';
import type { TimingsMap } from '../types/prayer';

export type RamadanCountdownEvent = {
  /** 'suhoor' = wait until Imsak; 'iftar' = wait until Maghrib. */
  type: 'suhoor' | 'iftar';
  /** Absolute moment the event fires. */
  at: Date;
};

/**
 * Compute the next Suhoor / Iftar moment from today and (optionally)
 * tomorrow's prayer times.
 *
 * Returns null when the data isn't sufficient (missing Imsak or Maghrib,
 * or after Maghrib with no tomorrow data — caller should re-fetch).
 */
export function getNextRamadanEvent(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
): RamadanCountdownEvent | null {
  const imsakStr = today.Imsak;
  const maghribStr = today.Maghrib;
  if (!imsakStr || !maghribStr) return null;

  const dayStart = startOfLocalDay(now);
  const imsakAt = combineLocalDateAndTime(dayStart, imsakStr);
  const maghribAt = combineLocalDateAndTime(dayStart, maghribStr);

  if (now < imsakAt) {
    // Pre-dawn — countdown to Suhoor cutoff (Imsak).
    return { type: 'suhoor', at: imsakAt };
  }
  if (now < maghribAt) {
    // Daytime fast — countdown to Iftar (Maghrib).
    return { type: 'iftar', at: maghribAt };
  }
  // After Maghrib — point at tomorrow's Imsak if we have it.
  const tomorrowImsak = tomorrow?.Imsak;
  if (!tomorrowImsak) return null;
  const tomorrowDay = addDays(dayStart, 1);
  return {
    type: 'suhoor',
    at: combineLocalDateAndTime(tomorrowDay, tomorrowImsak),
  };
}
