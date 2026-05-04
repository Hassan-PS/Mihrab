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
   * Kept separate from salāh rows because Sunrise is not a prayer.
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
    next && (
      (WIDGET_ROW_KEYS as readonly string[]).includes(next.name) ||
      next.name === 'Sunrise'
    )
      ? next.name
      : null;

  const rows: WidgetPrayerRow[] = WIDGET_ROW_KEYS.map((key: WidgetPrayerKey) => {
    const raw = timings[key];
    return {
      key,
      time: raw ? formatDisplayTime(raw) : '—',
      abbr: i18n.t(`prayer.${key}_abbr`, { defaultValue: i18n.t(`prayer.${key}`) }),
    };
  });

  const sunriseRaw = timings['Sunrise'];
  const sunriseRow: WidgetPrayerRow = {
    key: 'Sunrise',
    time: sunriseRaw ? formatDisplayTime(sunriseRaw) : '—',
    abbr: i18n.t('prayer.Sunrise_abbr', { defaultValue: i18n.t('prayer.Sunrise') }),
  };

  return {
    dayLabel,
    rows,
    sunriseRow,
    nextKey,
    nextPrayerName: next ? i18n.t(`prayer.${next.name}`) : undefined,
    nextPrayerTime: next ? formatLocalTime(next.at) : undefined,
    locationName,
    ...(tomorrowEstimated ? { tomorrowEstimated: true } : {}),
    ...(seasonal ? { seasonal } : {}),
  };
}
