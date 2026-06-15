export type TimingsMap = Record<string, string>;

/**
 * Visual + chronological order of every row that can appear in a day card.
 *
 * The three non-salāh entries — `Midnight` (Islamic midnight), `Lastthird`
 * (start of the last third of the night / Qiyām) and `Sunrise` — are derived,
 * optional, and individually gated by user toggles (see `nightTimes.ts` +
 * `filterOptionalTimes`). When their toggle is off they are simply absent from
 * the `TimingsMap` and every consumer (table, notifications, widget, Live
 * Activity) skips them automatically.
 *
 * `Midnight` and `Lastthird` are pre-dawn events (e.g. 00:47, 02:48) so they
 * sort BEFORE Fajr in clock order.
 */
export const DISPLAY_ORDER = [
  'Midnight',
  'Lastthird',
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

export type DisplayPrayerKey = (typeof DISPLAY_ORDER)[number];

export const NEXT_SALAH_ORDER = [
  'Midnight',
  'Lastthird',
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

export type NextSalahName = (typeof NEXT_SALAH_ORDER)[number];

/**
 * The non-prayer "events" the app can surface alongside the five daily salāh.
 * All three use the default notification sound (never the adhan) and are each
 * gated by an individual settings toggle. Sunrise defaults ON; the two night
 * times default OFF.
 */
export const OPTIONAL_TIME_KEYS = ['Sunrise', 'Midnight', 'Lastthird'] as const;
export type OptionalTimeKey = (typeof OPTIONAL_TIME_KEYS)[number];
