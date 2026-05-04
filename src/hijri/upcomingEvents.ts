/**
 * Upcoming Islamic events — task #84.
 *
 * Given a Gregorian date, find the next Hijri calendar occurrence of a
 * known Islamic event. Brute-force forward search bounded at 400 days
 * (one full Hijri year + safety margin) — fast enough for a screen
 * render, simpler than a closed-form Hijri→Gregorian inverse.
 *
 * The "fasting reward" days surfaced on the FastingScreen overlap with
 * the broader event list but lean toward fasting Sunnahs:
 *   • Day of Ashura (10 Muharram) — fasting it expiates the past year
 *   • Day of Arafah (9 Dhul Hijjah) — fasting it expiates two years
 *   • White Days (13–15 every Hijri month) — Sunnah every month
 *   • First day of Ramadan
 *   • 6 of Shawwal (1–6 Shawwal, optional after Ramadan)
 */

import { gregorianToHijri } from './convert';

export type FastingRewardDay = {
  /** Stable id used as i18n key suffix. */
  id: string;
  /** Free-form English fallback when locale key is missing. */
  englishLabel: string;
  /** Hijri month (1..12). */
  hijriMonth: number;
  /** Hijri day-of-month (1..30). When the event spans multiple days,
   *  this is the FIRST day; consumers can show a range. */
  hijriDay: number;
  /** When the event spans multiple consecutive days, length in days
   *  (default 1). White Days = 3, 6 of Shawwal = 6. */
  spanDays?: number;
  /** When true, this is one of the highest-reward fasting days. */
  major?: boolean;
};

/**
 * Curated list of fasting Sunnahs / reward days the FastingScreen
 * surfaces with a "next occurrence" countdown.
 */
export const FASTING_REWARD_DAYS: ReadonlyArray<FastingRewardDay> = [
  {
    id: 'ashura',
    englishLabel: 'Day of Ashura',
    hijriMonth: 1,
    hijriDay: 10,
    major: true,
  },
  {
    id: 'arafah',
    englishLabel: 'Day of Arafah',
    hijriMonth: 12,
    hijriDay: 9,
    major: true,
  },
  {
    id: 'ramadanBegins',
    englishLabel: 'First day of Ramadan',
    hijriMonth: 9,
    hijriDay: 1,
    major: true,
  },
  {
    id: 'sixOfShawwal',
    englishLabel: 'Six of Shawwal',
    hijriMonth: 10,
    hijriDay: 2, // skip Eid (1 Shawwal); fast 2–7
    spanDays: 6,
  },
  {
    id: 'whiteDays',
    englishLabel: 'White Days',
    hijriMonth: 0, // sentinel — handled specially: every month
    hijriDay: 13,
    spanDays: 3,
  },
];

export type UpcomingFastingEvent = {
  event: FastingRewardDay;
  /** Gregorian date of the event start. */
  gregorianDate: Date;
  /** Days from `from` (a Date at local midnight) to `gregorianDate`. */
  daysAway: number;
};

/** YYYY-MM-DD identity check for "same Hijri month/day". */
function matchesHijri(
  hMonth: number,
  hDay: number,
  target: { hijriMonth: number; hijriDay: number },
): boolean {
  return target.hijriMonth === hMonth && target.hijriDay === hDay;
}

/**
 * Find the next Gregorian date (at or after `from`) where the given
 * Hijri month/day occurs. Walks forward at most 400 days. Returns null
 * if no match is found in that window (shouldn't happen for valid
 * month/day pairs).
 */
function findNextOccurrence(
  hijriMonth: number,
  hijriDay: number,
  from: Date,
): Date | null {
  // Special sentinel: hijriMonth 0 = "every Hijri month" (used for
  // the White Days). The next occurrence is the next 13th of any month.
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 400; i++) {
    const h = gregorianToHijri(cur);
    if (hijriMonth === 0) {
      if (h.day === hijriDay) return new Date(cur);
    } else {
      if (matchesHijri(h.month, h.day, { hijriMonth, hijriDay }))
        return new Date(cur);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

/** Days from `a` to `b` (b - a), at midnight precision. */
function daysBetween(a: Date, b: Date): number {
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bMid - aMid) / 86_400_000);
}

/**
 * Compute the next occurrence of every reward day (relative to `from`)
 * and return them sorted by increasing days away. Skip occurrences
 * whose START date has already passed if today is mid-span.
 */
export function getUpcomingFastingEvents(
  from: Date = new Date(),
): UpcomingFastingEvent[] {
  const out: UpcomingFastingEvent[] = [];
  for (const event of FASTING_REWARD_DAYS) {
    const next = findNextOccurrence(event.hijriMonth, event.hijriDay, from);
    if (!next) continue;
    out.push({
      event,
      gregorianDate: next,
      daysAway: daysBetween(from, next),
    });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}

/** Find the next start of Ramadan (1 Ramadan), in Gregorian. */
export function getNextRamadanStart(from: Date = new Date()): Date | null {
  return findNextOccurrence(9, 1, from);
}
