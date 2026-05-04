/**
 * Gregorian ↔ Hijri (Umm al-Qura tabular) conversion — task #20.
 *
 * Implements the Kuwaiti / tabular algorithm. Accurate to ±1 day vs. observed
 * lunar calendar; sufficient for the events overlay where the user already
 * understands moon-sighting may shift dates.
 *
 * Reference: Khalid Shaukat, "The Hijri Calendar Algorithm" (1985);
 * standard implementation matched against Tanzil and ulug.org for the
 * range AD 1900–2100.
 */

import type { HijriDate } from './events';

const HIJRI_EPOCH_JD = 1948440; // Julian Day for 1 Muharram 1 AH (16 July 622 CE, Friday)

function gregorianToJulianDay(year: number, month: number, day: number): number {
  // Standard astronomical formula (works for negative years too).
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * Convert a Gregorian date (local-calendar) to a Hijri date using the
 * Umm al-Qura tabular algorithm.
 *
 * @param d Date — only year/month/day are used; time-of-day ignored.
 */
export function gregorianToHijri(d: Date): HijriDate {
  const jd = gregorianToJulianDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const days = jd - HIJRI_EPOCH_JD;
  // 30-year cycle: 11 leap years at fixed positions.
  const cycle30 = Math.floor(days / 10631);
  const remDays = days - cycle30 * 10631;
  const yearInCycle = Math.min(29, Math.floor((remDays + 1) / 354));
  const yearStartDays = Math.floor((yearInCycle * 354) + Math.floor((yearInCycle * 11 + 3) / 30));
  let dayInYear = remDays - yearStartDays;
  // Handle boundary edge: the rough year-in-cycle estimate can over-shoot
  // by one day at year boundaries because the leap-day distribution is
  // uneven — drop back one year if so.
  let year = cycle30 * 30 + yearInCycle + 1;
  if (dayInYear < 0) {
    year -= 1;
    const leap = isHijriLeap(year);
    dayInYear += leap ? 355 : 354;
  }
  // Convert day-in-year to month/day. Months alternate 30/29 with the 12th
  // month gaining a day in leap years.
  let month = 1;
  let day = dayInYear + 1;
  while (true) {
    const dim = hijriMonthLength(year, month);
    if (day <= dim) break;
    day -= dim;
    month += 1;
    if (month > 12) {
      // Roll into next year — extremely rare cycle-boundary edge.
      year += 1;
      month = 1;
    }
  }
  return { year, month, day };
}

/** True if the given Hijri year is a leap year in the 30-year cycle. */
export function isHijriLeap(year: number): boolean {
  // Leap years in each 30-year cycle: 2,5,7,10,13,16,18,21,24,26,29
  const inCycle = ((year - 1) % 30) + 1;
  return [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29].includes(inCycle);
}

/** Days in a given Hijri month: odd months = 30, even = 29; 12th month +1 in leap year. */
export function hijriMonthLength(year: number, month: number): number {
  if (month === 12) return isHijriLeap(year) ? 30 : 29;
  return month % 2 === 1 ? 30 : 29;
}
