import type { TimingsMap } from '../types/prayer';

const REQUIRED_KEYS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
const OPTIONAL_KEYS = ['Imsak', 'Midnight', 'Firstthird', 'Lastthird'] as const;
const HH_MM = /^\d{2}:\d{2}$/;
const EARLY_MORNING_THRESHOLD_MIN = 6 * 60; // 06:00
const LATE_EVENING_THRESHOLD_MIN = 18 * 60; // 18:00

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Verifies the standard prayer order:
 *   Fajr < Sunrise < Dhuhr < Asr < Maghrib < Isha
 *
 * Isha can legitimately fall past midnight at high northern latitudes (Sweden
 * in summer). When Isha is in the early-morning window (< 06:00), it's
 * interpreted as the next day and treated as Isha + 24h before the comparison.
 *
 * Returns the offending key pair on failure, or `null` on success.
 */
function findOrderViolation(timings: TimingsMap): string | null {
  const f = timeToMinutes(timings.Fajr!);
  const sr = timeToMinutes(timings.Sunrise!);
  const d = timeToMinutes(timings.Dhuhr!);
  const a = timeToMinutes(timings.Asr!);
  const m = timeToMinutes(timings.Maghrib!);
  const i = timeToMinutes(timings.Isha!);

  if (!(f < sr)) return `Fajr (${timings.Fajr}) must be before Sunrise (${timings.Sunrise})`;
  if (!(sr < d)) return `Sunrise (${timings.Sunrise}) must be before Dhuhr (${timings.Dhuhr})`;
  if (!(d < a)) return `Dhuhr (${timings.Dhuhr}) must be before Asr (${timings.Asr})`;
  if (!(a < m)) return `Asr (${timings.Asr}) must be before Maghrib (${timings.Maghrib})`;
  // Isha may wrap past midnight at high latitudes.
  const iAdj = i < EARLY_MORNING_THRESHOLD_MIN ? i + 1440 : i;
  if (!(iAdj > m)) {
    return `Isha (${timings.Isha}) must be after Maghrib (${timings.Maghrib})`;
  }
  return null;
}

/**
 * Validates Imsak when present:
 *   • Format: HH:MM.
 *   • Order: Imsak ≤ Fajr (Umm al-Qura uses Imsak = Fajr; most others use
 *     Imsak = Fajr − 10).
 *   • High-latitude exception: at extreme northern latitudes Fajr can fall
 *     just after midnight, in which case Imsak occurs late the previous
 *     evening. We accept this when Imsak ≥ 18:00 AND Fajr < 06:00.
 *
 * @returns the violation message, or `null` on success.
 */
function findImsakViolation(timings: TimingsMap): string | null {
  const imsak = timings.Imsak;
  if (imsak === undefined) return null; // optional
  if (!HH_MM.test(imsak)) {
    return `Imsak ("${imsak}") must be in HH:MM format`;
  }
  const fajr = timings.Fajr!;
  const i = timeToMinutes(imsak);
  const f = timeToMinutes(fajr);
  // Wrap case: Imsak late evening, Fajr early morning (rare but valid).
  if (i >= LATE_EVENING_THRESHOLD_MIN && f < EARLY_MORNING_THRESHOLD_MIN) {
    return null;
  }
  if (i > f) {
    return `Imsak (${imsak}) must be at or before Fajr (${fajr})`;
  }
  return null;
}

/**
 * Asserts that all six required prayer keys are present, in HH:MM format, and
 * in the canonical prayer order. Throws a descriptive error so the caller
 * (prayerStorage / usePrayerDay) can fall through to the offline local-adhan
 * fallback instead of caching garbage.
 *
 * Optional keys (Imsak, Midnight, Firstthird, Lastthird) are validated when
 * present and ignored when absent. Imsak ordering is enforced specifically —
 * a misformed Imsak shipping to the widget during Ramadan would surface a
 * Suhoor cutoff that's clearly wrong, hence the strictness.
 */
export function validateTimings(timings: TimingsMap): TimingsMap {
  for (const key of REQUIRED_KEYS) {
    const val = timings[key];
    if (!val || !HH_MM.test(val)) {
      throw new Error(
        `Invalid prayer times: key "${key}" is missing or not in HH:MM format (got "${val ?? 'undefined'}")`,
      );
    }
  }
  // Optional-key shape check (cheaper than ordering, fail fast).
  for (const key of OPTIONAL_KEYS) {
    const val = timings[key];
    if (val !== undefined && !HH_MM.test(val)) {
      throw new Error(
        `Invalid prayer times: key "${key}" present but not in HH:MM format (got "${val}")`,
      );
    }
  }
  const violation = findOrderViolation(timings);
  if (violation) {
    throw new Error(`Invalid prayer times — out of order: ${violation}`);
  }
  const imsakViolation = findImsakViolation(timings);
  if (imsakViolation) {
    throw new Error(`Invalid prayer times — Imsak ordering: ${imsakViolation}`);
  }
  return timings;
}
