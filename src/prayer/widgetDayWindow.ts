/**
 * The schedule window the WIDGET carries, and the cache-only reader that
 * fills it.
 *
 * Lifted out of `usePrayerDay` so the payload can be rebuilt with no screen
 * mounted. The hook still owns the live path — GPS, the network fan-out, the
 * twelve-month cache fill — but the arithmetic of "how many days does the
 * widget carry, and where do they come from" is not a rendering concern and
 * had no business living inside a React file. One implementation, imported by
 * both, so the foreground and headless paths cannot drift into disagreeing
 * about the size of the window.
 */
import { getCachedPrayerTimes, getStoredPrayerTimes } from './prayerStorage';
import type { PrayerAppSettings } from '../settings/types';
import type { TimingsMap } from '../types/prayer';
import { addDays } from '../utils/prayerTimes';

/**
 * How many consecutive days the WIDGET's copy of the schedule covers.
 *
 * This number is how long the widget survives an app nobody opens. Seven days
 * is invisible on a phone, which gets opened most days. It was the whole bug
 * on a Mac, where an app installed from Homebrew can sit closed for weeks: the
 * window ran out and the widget had nothing true left to show.
 *
 * Thirty is nearly free. These extra days are READ FROM THE CACHE that is
 * already on disk — the app stores up to a year — and never trigger a fetch,
 * so this costs disk reads and no network. Whatever is not cached simply is
 * not appended, which leaves the widget exactly where it was before.
 */
export const WIDGET_WINDOW_DAYS = 30;

/** The cache-key half of a prayer-times lookup, without the date. */
export type DayWindowParams = {
  provider: Parameters<typeof getCachedPrayerTimes>[0]['provider'];
  latitude: number;
  longitude: number;
  calculationMethod: PrayerAppSettings['calculationMethod'];
  school: PrayerAppSettings['school'];
};

/**
 * Days `from`…`WIDGET_WINDOW_DAYS` read STRICTLY FROM CACHE, stopping at the
 * first day that isn't there.
 *
 * Cache-only on purpose. The point of the longer window is to cost nothing —
 * if this ever fetched, opening the app would fire off weeks of requests to
 * feed a widget. Stopping at the first miss keeps the array gapless, which is
 * the invariant every consumer of these arrays relies on.
 */
export async function cachedDaysFrom(
  from: number,
  params: DayWindowParams,
  now: Date,
): Promise<TimingsMap[]> {
  const extra: TimingsMap[] = [];
  for (let i = from; i < WIDGET_WINDOW_DAYS; i++) {
    let day: TimingsMap | null = null;
    try {
      day = await getCachedPrayerTimes({ ...params, date: addDays(now, i) });
    } catch {
      break;
    }
    if (!day) break;
    extra.push(day);
  }
  return extra;
}

/**
 * How many days BEHIND today the Today card can be turned to.
 *
 * A week, to match the week ahead: the card swipes back to log a prayer
 * that was missed on the day, or to see what yesterday's Isha was, and a
 * week is as far as either question reaches. Beyond that the Log's own
 * history is the surface.
 */
export const PAST_DAYS = 7;

/**
 * Yesterday and the days before it, FROM THE DEVICE ALONE, nearest first —
 * `[0]` is yesterday — stopping at the first day that isn't there.
 *
 * Never a fetch, for the same reason the widget window never fetches:
 * the past is looked at, not waited for, and a swipe must not fire a
 * request. "The device" is the prepared dataset where the provider has
 * one and the cache otherwise (`getStoredPrayerTimes`) — not the cache
 * alone, which the dataset providers never write to. The current month
 * is on hand either way, so the days that are missing are the ones
 * across a boundary nothing held, and a card that stops there is honest.
 */
export async function cachedDaysBefore(
  params: DayWindowParams,
  now: Date,
): Promise<TimingsMap[]> {
  const past: TimingsMap[] = [];
  for (let i = 1; i <= PAST_DAYS; i++) {
    let day: TimingsMap | null = null;
    try {
      day = await getStoredPrayerTimes({ ...params, date: addDays(now, -i) });
    } catch {
      break;
    }
    if (!day) break;
    past.push(day);
  }
  return past;
}
