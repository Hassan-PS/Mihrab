import type { TimingsMap } from '../types/prayer';
import { extractClock } from './prayerTimes';

/**
 * Derived "night" times — Islamic Midnight and the start of the Last Third of
 * the night (Qiyām al-Layl) — plus a per-key filter for the three optional,
 * toggle-gated non-prayer entries (Sunrise, Midnight, Lastthird).
 *
 * Classical (Maghrib → Fajr) basis: the night runs from sunset (Maghrib) to
 * true dawn (Fajr the following morning). Islamic Midnight is its midpoint; the
 * last third begins 2/3 of the way through. These are derived at read time (in
 * `usePrayerDay`, like per-prayer offsets) so the on-disk cache stays raw.
 */

function toMinutes(clock: string): number {
  const { hour, minute } = extractClock(clock);
  return hour * 60 + minute;
}

function fromMinutes(total: number): string {
  // Wrap into [0, 1440) so a post-midnight result (e.g. 1487 → 00:47) renders
  // as a normal clock time on its own calendar day.
  const m = ((Math.round(total) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Compute Islamic Midnight and Last-Third clock times for the night that runs
 * from `maghribClock` (the evening of the PREVIOUS day) to `fajrClock` (the
 * morning of THIS day). The returned clock times therefore belong to THIS
 * calendar day's pre-dawn hours.
 *
 * Fajr is always treated as the morning after Maghrib, so the night length
 * crosses midnight correctly even at high latitudes.
 */
export function clockNightTimes(
  maghribClock: string,
  fajrClock: string,
): { Midnight: string; Lastthird: string } {
  const m = toMinutes(maghribClock);
  let f = toMinutes(fajrClock);
  if (f <= m) f += 1440; // Fajr is the next morning.
  const nightLen = f - m;
  return {
    Midnight: fromMinutes(m + nightLen / 2),
    Lastthird: fromMinutes(m + (nightLen * 2) / 3),
  };
}

/**
 * Inject `Midnight` + `Lastthird` into each day of a consecutive week.
 *
 * For day i the night that produced its pre-dawn times started the previous
 * evening, so it is computed from day (i-1)'s Maghrib and day i's Fajr. For the
 * first day (today) the previous day isn't in the window, so today's own
 * Maghrib is used as a proxy — those times are already in the past, and Maghrib
 * drifts only ~1 min/day, so the approximation is sub-minute.
 *
 * Pure: returns a new array with new day objects; never mutates the input.
 */
export function injectNightTimes(week: TimingsMap[]): TimingsMap[] {
  return week.map((day, i) => {
    const prevMaghrib = i > 0 ? week[i - 1].Maghrib : day.Maghrib;
    const fajr = day.Fajr;
    if (!prevMaghrib || !fajr) return day;
    try {
      const { Midnight, Lastthird } = clockNightTimes(prevMaghrib, fajr);
      return { ...day, Midnight, Lastthird };
    } catch {
      // Unparseable time string — leave the day untouched rather than throw.
      return day;
    }
  });
}

/** Which of the three optional non-prayer entries are currently enabled. */
export type OptionalTimeToggles = {
  Sunrise: boolean;
  Midnight: boolean;
  Lastthird: boolean;
};

/**
 * Return a copy of `timings` with any disabled optional entry removed. Because
 * every consumer skips keys that are absent from the map, this single filter is
 * the kill-switch for Sunrise and the on/off gate for the two night times
 * across the table, notifications, widget, and Live Activity.
 */
export function filterOptionalTimes(
  timings: TimingsMap,
  toggles: OptionalTimeToggles,
): TimingsMap {
  if (toggles.Sunrise && toggles.Midnight && toggles.Lastthird) {
    return timings;
  }
  const out = { ...timings };
  if (!toggles.Sunrise) delete out.Sunrise;
  if (!toggles.Midnight) delete out.Midnight;
  if (!toggles.Lastthird) delete out.Lastthird;
  return out;
}
