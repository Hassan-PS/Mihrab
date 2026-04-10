import type { TimingsMap } from '../types/prayer';
import {
  addDays,
  computeNextSalah,
  formatDisplayTime,
  getNextPrayerDisplay,
  startOfLocalDay,
} from '../utils/prayerTimes';

export type WidgetPrayerRow = {
  key: string;
  time: string;
  /** Short label for narrow / horizontal layouts (e.g. widget columns). */
  abbr: string;
};

/** Five daily salāh times on the widget (Sunrise is omitted to save space). */
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
  /** Row `key` to highlight as the next salāh (matches WIDGET_ROW_KEYS). */
  nextKey: string | null;
};

const WIDGET_ABBR: Record<WidgetPrayerKey, string> = {
  Fajr: 'Fajr',
  Dhuhr: 'Dhuhr',
  Asr: 'Asr',
  Maghrib: 'Magh',
  Isha: 'Isha',
};

/**
 * After the last prayer of the day (Isha), uses tomorrow's timings so the widget
 * shows the next day's schedule.
 */
export function buildWidgetPayload(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
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
  const nextKey =
    next && (WIDGET_ROW_KEYS as readonly string[]).includes(next.name)
      ? next.name
      : null;

  const rows: WidgetPrayerRow[] = WIDGET_ROW_KEYS.map((key: WidgetPrayerKey) => {
    const raw = timings[key];
    return {
      key,
      time: raw ? formatDisplayTime(raw) : '—',
      abbr: WIDGET_ABBR[key],
    };
  });

  return {
    dayLabel,
    rows,
    nextKey,
  };
}
