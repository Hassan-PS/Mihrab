import type { TimingsMap } from '../types/prayer';

const REQUIRED_KEYS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
const HH_MM = /^\d{2}:\d{2}$/;

/**
 * Asserts that all six required prayer keys are present and in HH:MM format.
 * Throws a descriptive error so the caller (prayerStorage / usePrayerDay) can
 * fall through to the offline local-adhan fallback instead of caching garbage.
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
  return timings;
}
