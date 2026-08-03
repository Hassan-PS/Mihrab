/**
 * Which of the five have not happened yet.
 *
 * Pulled out of the Log screen so the rule can be tested on its own, because
 * it is enforced in two places that must not drift: the status chips, which
 * grey out, and "Mark all on time", which has to skip the same prayers. A
 * button that filled in an Isha four hours away would write a claim into the
 * user's own record that they never made — and the record is the product.
 */
import type { TimingsMap } from '../types/prayer';
import type { JournalPrayer } from './journal';

/** Minutes past local midnight, or null if the string is not a clock time. */
export function minutesOfDay(value: unknown): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * The prayers in `prayers` whose time is still ahead of `now`.
 *
 * Empty unless `isToday` — a past day happened in full, and there is no
 * future day to be on. Empty too when the timetable is missing: a day older
 * than the local cache, or one logged in another city, greys out nothing.
 * Refusing to record a prayer because the app has misplaced its own
 * timetable would be the app's problem charged to the user.
 */
export function upcomingPrayers(
  prayers: readonly JournalPrayer[],
  times: TimingsMap | undefined,
  now: Date,
  isToday: boolean,
): Set<JournalPrayer> {
  const out = new Set<JournalPrayer>();
  if (!isToday || !times) return out;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (const p of prayers) {
    const at = minutesOfDay(times[p]);
    if (at !== null && at > nowMinutes) out.add(p);
  }
  return out;
}
