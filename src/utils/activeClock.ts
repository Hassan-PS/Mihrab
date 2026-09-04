/**
 * The clock format, for code that runs outside React — issue #18.
 *
 * The widget and Live Activity payloads are built by plain functions that
 * already reach for the `i18n` singleton to name a prayer. They cannot
 * call a hook, and threading a formatter through
 * `buildWidgetPayload(today, tomorrow, now, locationName, coords,
 * seasonal, week, extras, …)` would make a nine-deep signature ten.
 *
 * So the preference is mirrored here, next to the language it travels
 * with, and set from one place: `PrayerSettingsProvider`, whenever the
 * stored setting changes. Anything that formats a time for native reads
 * `activeClock()`.
 *
 * In-app screens do NOT use this — they use `useClockFormatter`, which
 * re-renders when the answer changes. This mirror exists for the
 * non-React edge.
 */
import i18n from '../i18n';
import { systemIs24Hour } from '../native/SystemClock';
import {
  makeClockFormatter,
  resolveHour12,
  type ClockFormat,
  type ClockFormatter,
} from './clockFormat';

let preference: ClockFormat = 'auto';

let memo: {
  preference: ClockFormat;
  systemIs24: boolean | null;
  language: string;
  formatter: ClockFormatter;
} | null = null;

export function setActiveClockFormat(next: ClockFormat): void {
  preference = next;
}

export function getActiveClockFormat(): ClockFormat {
  return preference;
}

/**
 * A formatter matching what the app is showing on screen right now.
 *
 * Rebuilt only when one of its three inputs moves, so the hundreds of
 * rows in a week-long widget payload share one.
 */
export function activeClock(): ClockFormatter {
  const systemIs24 = systemIs24Hour();
  const language = i18n.language ?? 'en';
  if (
    memo &&
    memo.preference === preference &&
    memo.systemIs24 === systemIs24 &&
    memo.language === language
  ) {
    return memo.formatter;
  }
  const formatter = makeClockFormatter(
    resolveHour12(preference, systemIs24, language),
    language,
  );
  memo = { preference, systemIs24, language, formatter };
  return formatter;
}

/** Test seam. */
export function _resetActiveClock(): void {
  preference = 'auto';
  memo = null;
}
