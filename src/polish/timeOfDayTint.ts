/**
 * Time-of-day tint — task #32 / principle 5 ("time-of-day awareness").
 *
 * Returns a hue-shift that other UI surfaces can apply (status-bar tint,
 * HomeScreen header hairline, dynamic icon variant). The shift is SUBTLE
 * — at most a few percent of saturation toward the prayer's character —
 * never a full color swap. CLAUDE.md principle: "felt, not announced."
 *
 * Returned as semantic identifiers so the design layer (#34/#35) can pick
 * exact values from the palette tokens; this module stays pure.
 */

import { computeNextSalah } from '../utils/prayerTimes';
import type { TimingsMap } from '../types/prayer';

export type TimeOfDayTint =
  | 'fajr' // pre-dawn cool blue
  | 'sunrise' // warming amber
  | 'midday' // bright clear
  | 'asr' // golden afternoon
  | 'maghrib' // amber sunset
  | 'isha' // deep purple-night
  | 'night'; // late after-isha

export function tintForTime(
  today: TimingsMap,
  now: Date = new Date(),
): TimeOfDayTint {
  const next = computeNextSalah(today, now);
  // The "next" prayer name tells us where we are in the day.
  if (!next) return 'night'; // after Isha
  switch (next.name) {
    case 'Fajr':
      return 'night'; // pre-Fajr is the deepest night
    case 'Sunrise':
      return 'fajr';
    case 'Dhuhr':
      return 'sunrise';
    case 'Asr':
      return 'midday';
    case 'Maghrib':
      return 'asr';
    case 'Isha':
      return 'maghrib';
    default:
      return 'midday';
  }
}
