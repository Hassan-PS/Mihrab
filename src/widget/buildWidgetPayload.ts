import type { TimingsMap } from '../types/prayer';
import i18n from '../i18n';
import {
  addDays,
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
};

/**
 * After the last prayer of the day (Isha), uses tomorrow's timings so the widget
 * shows the next day's schedule.
 */
export function buildWidgetPayload(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
  locationName?: string,
): WidgetPrayerPayload {
  const stillToday = computeNextSalah(today, now) != null;
  const timings =
    !stillToday && tomorrow != null && Object.keys(tomorrow).length > 0
      ? tomorrow
      : today;

  const dayAnchor = !stillToday && tomorrow ? addDays(now, 1) : now;
  const dayLabel = startOfLocalDay(dayAnchor).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const next = getNextPrayerDisplay(today, tomorrow, now);
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
  };
}
