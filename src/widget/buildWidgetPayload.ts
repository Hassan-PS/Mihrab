import type { TimingsMap } from '../types/prayer';
import i18n from '../i18n';
import {
  addDays,
  combineLocalDateAndTime,
  computeNextSalah,
  formatDisplayTime,
  formatLocalTime,
  getNextPrayerDisplay,
  startOfLocalDay,
} from '../utils/prayerTimes';

export type WidgetPrayerRow = {
  key: string;
  time: string;
  /** Short label for narrow / horizontal layouts (e.g. widget columns). */
  abbr: string;
};

/**
 * One day of prayer times in the multi-day schedule pushed to the native
 * renderers (home-screen widget + Android Live Activity). The native side
 * selects the entry whose `dateKey` matches the device's current local date
 * and rolls forward on its own — this is what stops the widget / Live Activity
 * going stale ~24h after the app was last opened (the times were previously a
 * single-day snapshot that only refreshed when the app was reopened).
 */
export type WidgetDay = {
  /** Local calendar date these times apply to, formatted YYYY-MM-DD. */
  dateKey: string;
  /** Short human label, e.g. "Wed, Apr 9". */
  dayLabel: string;
  /** Five salāh rows: Fajr, Dhuhr, Asr, Maghrib, Isha. */
  rows: WidgetPrayerRow[];
  /** Sunrise rendered separately (slot 1) — not a salāh. Omitted when the
   *  user has turned Sunrise off. */
  sunriseRow?: WidgetPrayerRow;
};

/** Five salāh shown as rows on the widget (Sunrise rendered separately at slot 1). */
export const WIDGET_ROW_KEYS = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

export type WidgetPrayerKey = (typeof WIDGET_ROW_KEYS)[number];

export type WidgetPrayerPayload = {
  /** Calendar day these times apply to (e.g. Wed, Apr 9). */
  dayLabel: string;
  rows: WidgetPrayerRow[];
  /**
   * Sunrise row rendered at display slot 1 (between Fajr and Dhuhr).
   * Kept separate from salāh rows because Sunrise is not a prayer. Omitted
   * when the user has turned Sunrise off (the kill-switch).
   */
  sunriseRow?: WidgetPrayerRow;
  /** Row `key` to highlight as the next salāh (matches WIDGET_ROW_KEYS or 'Sunrise'). */
  nextKey: string | null;
  /** Name of the next prayer */
  nextPrayerName?: string;
  /** Time of the next prayer */
  nextPrayerTime?: string;
  /** Location name */
  locationName?: string;
  /**
   * True when after-Isha and no `tomorrow` data was available — the next-day
   * times are estimated by re-applying today's strings to tomorrow's calendar
   * date. The widget can render a subtle indicator (e.g., a soft dot or italic
   * label) so users know the times will refresh once the app reconnects.
   */
  tomorrowEstimated?: boolean;
  /**
   * Seasonal treatment flags — task #67. Allows the iOS Lock Screen +
   * home-screen widgets to subtly accent Fridays (Jumu'ah) and Ramadan,
   * matching the in-app HomeScreen treatments. Optional so the
   * home-screen widget on Android can ignore them without a schema bump.
   */
  seasonal?: WidgetSeasonalFlags;
  /**
   * Multi-day schedule (index 0 = today). Lets the native renderers roll the
   * displayed times forward day-by-day without the app being reopened. Optional
   * for backward compatibility — when absent, native falls back to the
   * single-day `rows`. Built from the `week` argument; defaults to today
   * (+ tomorrow when supplied) so the field is always at least a short window.
   */
  days?: WidgetDay[];
};

/** Seasonal flags consumed by the iOS widget extension to tint the
 *  Lock Screen views — see PrayerWidgetExtension.swift. */
export type WidgetSeasonalFlags = {
  /** Friday before Maghrib — accent the Dhuhr row (Jumu'ah). */
  jumuah: boolean;
  /** Anywhere inside Ramadan — show a tiny crescent glyph. */
  ramadan: boolean;
  /** Eid day — show greeting tint. Null on non-eid days. */
  eid: 'fitr' | 'adha' | null;
};

/** Optional coordinates for the (0,0) assertion gate. */
export type WidgetCoords = { lat: number; lng: number };

/** Local YYYY-MM-DD for the given date (device-local, not UTC). */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Build a single labelled row for a prayer/event key. */
function buildRow(key: string, timings: TimingsMap): WidgetPrayerRow {
  const raw = timings[key];
  return {
    key,
    time: raw ? formatDisplayTime(raw) : '—',
    abbr: i18n.t(`prayer.${key}_abbr`, {
      defaultValue: i18n.t(`prayer.${key}`),
    }),
  };
}

/**
 * Build the five salāh rows and the optional Sunrise row for one day's timings.
 * `sunriseRow` is undefined when Sunrise has been turned off (its key was
 * filtered out of `timings` upstream).
 */
function buildDayRows(timings: TimingsMap): {
  rows: WidgetPrayerRow[];
  sunriseRow?: WidgetPrayerRow;
} {
  const rows = WIDGET_ROW_KEYS.map(key => buildRow(key, timings));
  const sunriseRow = timings['Sunrise'] ? buildRow('Sunrise', timings) : undefined;
  return { rows, sunriseRow };
}

/**
 * Build the multi-day schedule (`days[]`). `week[0]` is today, `week[1]`
 * tomorrow, etc. Each entry is dated by adding its index to the start of the
 * local day containing `now`, so the native side can match by wall-clock date.
 */
function buildDays(week: TimingsMap[], now: Date): WidgetDay[] {
  const base = startOfLocalDay(now);
  return week.map((timings, i) => {
    const date = addDays(base, i);
    const { rows, sunriseRow } = buildDayRows(timings);
    return {
      dateKey: localDateKey(date),
      dayLabel: date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      rows,
      ...(sunriseRow ? { sunriseRow } : {}),
    };
  });
}

/**
 * After the last prayer of the day (Isha), uses tomorrow's timings so the widget
 * shows the next day's schedule. If `tomorrow` is unavailable, the function
 * estimates by re-applying today's strings to tomorrow's calendar date and
 * sets `tomorrowEstimated: true` on the payload.
 *
 * @throws if `coords` is provided AND both lat and lng are exactly 0. The
 * (0, 0) coordinate is the canonical bug surface — `lat ?? 0` shipping prayer
 * times for off the coast of Ghana. Callers that have coords MUST pass them so
 * this gate fires before bad data reaches the widget. Callers without coords
 * (legacy paths, tests) may omit the argument.
 */
export function buildWidgetPayload(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
  locationName?: string,
  coords?: WidgetCoords,
  seasonal?: WidgetSeasonalFlags,
  /**
   * Consecutive days starting today (index 0 = today). When supplied, drives
   * the `days[]` multi-day schedule so native renderers roll over on their own.
   * Falls back to `[today, tomorrow]` when omitted.
   */
  week?: TimingsMap[],
): WidgetPrayerPayload {
  if (coords && coords.lat === 0 && coords.lng === 0) {
    throw new Error(
      'buildWidgetPayload: refusing to build payload with (0, 0) coordinates ' +
        '— this is the "lat ?? 0" footgun that ships prayer times for off the ' +
        'coast of Ghana. Check the upstream coord pipeline.',
    );
  }

  const stillToday = computeNextSalah(today, now) != null;
  const haveTomorrow =
    tomorrow != null && Object.keys(tomorrow).length > 0;
  const useTomorrow = !stillToday && haveTomorrow;
  const tomorrowEstimated = !stillToday && !haveTomorrow;
  const timings = useTomorrow ? (tomorrow as TimingsMap) : today;

  const dayAnchor = useTomorrow || tomorrowEstimated ? addDays(now, 1) : now;
  const dayLabel = startOfLocalDay(dayAnchor).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  let next = getNextPrayerDisplay(today, tomorrow, now);
  // Soft fallback: after Isha + no tomorrow data, still surface "Fajr next" by
  // estimating from today's Fajr applied to tomorrow's calendar date. The
  // widget shows something useful instead of a null nextKey + stale times.
  if (!next && tomorrowEstimated) {
    const fajr = today.Fajr;
    if (fajr) {
      const tomorrowDay = addDays(startOfLocalDay(now), 1);
      next = { name: 'Fajr', at: combineLocalDateAndTime(tomorrowDay, fajr) };
    }
  }

  // nextKey can be a salāh key OR 'Sunrise' (when sunrise is the next upcoming event)
  const nextKey =
    next &&
    ((WIDGET_ROW_KEYS as readonly string[]).includes(next.name) ||
      next.name === 'Sunrise')
      ? next.name
      : null;

  // The visible single-day `rows` reflect the day currently being shown
  // (today, or tomorrow after Isha) — same as before. The new `days[]` field
  // below carries the full window so native can roll over on its own.
  const { rows, sunriseRow } = buildDayRows(timings);

  // Multi-day schedule. Prefer the supplied `week`; otherwise synthesise the
  // shortest useful window from today (+ tomorrow when available).
  const weekSource =
    week && week.length > 0
      ? week
      : tomorrow
        ? [today, tomorrow]
        : [today];
  const days = buildDays(weekSource, now);

  return {
    dayLabel,
    rows,
    ...(sunriseRow ? { sunriseRow } : {}),
    nextKey,
    nextPrayerName: next ? i18n.t(`prayer.${next.name}`) : undefined,
    nextPrayerTime: next ? formatLocalTime(next.at) : undefined,
    locationName,
    ...(tomorrowEstimated ? { tomorrowEstimated: true } : {}),
    ...(seasonal ? { seasonal } : {}),
    days,
  };
}
