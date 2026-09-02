import type { TimingsMap } from '../types/prayer';
import { extractClock } from './prayerTimes';

/**
 * Derived "night" times — the end of the First Third, Islamic Midnight and
 * the start of the Last Third of the night (Qiyām al-Layl) — plus a per-key
 * filter for the optional, toggle-gated non-prayer entries (Sunrise,
 * Midnight, Lastthird, Firstthird).
 *
 * Classical (Maghrib → Fajr) basis: the night runs from sunset (Maghrib) to
 * true dawn (Fajr the following morning). The first third ends 1/3 of the way
 * through, Islamic Midnight is its midpoint, and the last third begins 2/3 of
 * the way through. These are derived at read time (in `usePrayerDay`, like
 * per-prayer offsets) so the on-disk cache stays raw.
 *
 * ── WHY THE FIRST THIRD IS ON A DIFFERENT NIGHT FROM THE OTHER TWO ────
 *
 * Because it is the only one of the three that has not already happened by
 * the time anyone reads the card. Midnight and the Last Third belong to the
 * night that ENDS this morning — they are why they sort before Fajr. The
 * first third of that same night ended before yesterday's Isha row, which is
 * of no use to anyone. What a reader wants at 21:00 is when TONIGHT's first
 * third closes, because in the Mālikī reckoning that is when Ishāʾ passes out
 * of its preferred window into its late one (issue #14). So `Firstthird` is
 * taken from the night that BEGINS on this card: today's Maghrib to
 * tomorrow's Fajr.
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
): { Firstthird: string; Midnight: string; Lastthird: string } {
  const m = toMinutes(maghribClock);
  let f = toMinutes(fajrClock);
  if (f <= m) f += 1440; // Fajr is the next morning.
  const nightLen = f - m;
  return {
    Firstthird: fromMinutes(m + nightLen / 3),
    Midnight: fromMinutes(m + nightLen / 2),
    Lastthird: fromMinutes(m + (nightLen * 2) / 3),
  };
}

/**
 * Inject `Midnight`, `Lastthird` and `Firstthird` into each day of a
 * consecutive week.
 *
 * Two nights are involved, and each entry takes the one it belongs to.
 *
 * For day i the night that produced its PRE-DAWN times started the previous
 * evening, so Midnight and the Last Third are computed from day (i-1)'s
 * Maghrib and day i's Fajr. For the first day (today) the previous day isn't
 * in the window, so today's own Maghrib is used as a proxy — those times are
 * already in the past, and Maghrib drifts only ~1 min/day, so the
 * approximation is sub-minute.
 *
 * The First Third is the mirror of that: it belongs to the night that BEGINS
 * on day i, so it comes from day i's Maghrib and day (i+1)'s Fajr, with day
 * i's own Fajr as the proxy on the last day of the window — the same
 * sub-minute trade, made at the other end.
 *
 * Pure: returns a new array with new day objects; never mutates the input.
 */
export function injectNightTimes(week: TimingsMap[]): TimingsMap[] {
  return week.map((day, i) => {
    const prevMaghrib = i > 0 ? week[i - 1].Maghrib : day.Maghrib;
    const nextFajr = i < week.length - 1 ? week[i + 1].Fajr : day.Fajr;
    const fajr = day.Fajr;
    if (!prevMaghrib || !fajr) return day;
    try {
      const { Midnight, Lastthird } = clockNightTimes(prevMaghrib, fajr);
      const out: TimingsMap = { ...day, Midnight, Lastthird };
      if (day.Maghrib && nextFajr) {
        out.Firstthird = clockNightTimes(day.Maghrib, nextFajr).Firstthird;
      }
      return out;
    } catch {
      // Unparseable time string — leave the day untouched rather than throw.
      return day;
    }
  });
}

/** Which of the optional non-prayer entries are currently enabled. */
export type OptionalTimeToggles = {
  Sunrise: boolean;
  Midnight: boolean;
  Lastthird: boolean;
  Firstthird: boolean;
};

/**
 * Return a copy of `timings` with any disabled optional entry removed. Because
 * every consumer skips keys that are absent from the map, this single filter is
 * the kill-switch for Sunrise and the on/off gate for the three night times
 * across the table, notifications, widget, and Live Activity.
 */
export function filterOptionalTimes(
  timings: TimingsMap,
  toggles: OptionalTimeToggles,
): TimingsMap {
  if (
    toggles.Sunrise &&
    toggles.Midnight &&
    toggles.Lastthird &&
    toggles.Firstthird
  ) {
    return timings;
  }
  const out = { ...timings };
  if (!toggles.Sunrise) delete out.Sunrise;
  if (!toggles.Midnight) delete out.Midnight;
  if (!toggles.Lastthird) delete out.Lastthird;
  if (!toggles.Firstthird) delete out.Firstthird;
  return out;
}
