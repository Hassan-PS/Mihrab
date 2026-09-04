/**
 * 12-hour and 24-hour clock display — issue #18.
 *
 * The app stores and computes every prayer time as canonical 24-hour
 * `HH:mm` (see `formatDisplayTime` / `formatLocalTime` in
 * `prayerTimes.ts`). That string is machine data: the iOS widget's
 * progress ring, the Android Live Activity and the log widget all parse
 * it back into minutes, and `lockScreenPayload` compares it against
 * `nowHHMM`. None of that may ever become "5:31 PM".
 *
 * So this module is display-only. It takes a canonical `HH:mm` (or a
 * `Date`) and renders it the way the user reads a clock. Nothing here
 * writes to storage, and nothing here is parsed back.
 *
 * Digits are always Latin, on purpose. The rest of the app pads times
 * with `String(n).padStart(2, '0')`, so borrowing `Intl`'s numerals
 * would print Arabic-Indic digits in `ar` next to Latin ones in the
 * countdown on the same card. Only the day-period marker ("PM", "م",
 * "下午") and its position are localised, and those come from `Intl`
 * with an English fallback for engines built without it.
 */

/** What the user chose in Settings → Appearance. */
export type ClockFormat = 'auto' | '12' | '24';

export const CLOCK_FORMATS: readonly ClockFormat[] = ['auto', '12', '24'];

export function coerceClockFormat(value: unknown): ClockFormat {
  return value === '12' || value === '24' ? value : 'auto';
}

/**
 * The day-period markers for one locale, and where they go.
 *
 * `prefix` is true for the locales that lead with the marker — Chinese
 * writes 下午5:31, not 5:31下午 — which is why this is resolved from
 * `formatToParts` rather than assembled by hand.
 */
export type DayPeriodNames = {
  am: string;
  pm: string;
  prefix: boolean;
};

const FALLBACK_PERIODS: DayPeriodNames = { am: 'AM', pm: 'PM', prefix: false };

const periodCache = new Map<string, DayPeriodNames>();

/** Exported for tests; the cache is a memo, never state anyone depends on. */
export function _resetClockFormatCaches(): void {
  periodCache.clear();
}

function partsFor(locale: string, hour: number): Intl.DateTimeFormatPart[] {
  const at = new Date(2020, 0, 1, hour, 30, 0, 0);
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(at);
}

export function dayPeriodNames(locale: string): DayPeriodNames {
  const cached = periodCache.get(locale);
  if (cached) return cached;
  let resolved = FALLBACK_PERIODS;
  try {
    const morning = partsFor(locale, 9);
    const evening = partsFor(locale, 17);
    const am = morning.find(p => p.type === 'dayPeriod')?.value;
    const pm = evening.find(p => p.type === 'dayPeriod')?.value;
    if (am && pm) {
      const hourIndex = morning.findIndex(p => p.type === 'hour');
      const periodIndex = morning.findIndex(p => p.type === 'dayPeriod');
      resolved = {
        am,
        pm,
        prefix: periodIndex >= 0 && hourIndex >= 0 && periodIndex < hourIndex,
      };
    }
  } catch {
    // No Intl, or a locale it refuses. English markers still read as a
    // clock; a missing marker would not.
  }
  periodCache.set(locale, resolved);
  return resolved;
}

/**
 * The one decision: should times be drawn on a 12-hour clock?
 *
 * `systemIs24` is what the device says, and `null` means nobody could be
 * asked — a build without the native module, or a test. That case falls
 * back to 24-hour rather than to what the locale would write, and the
 * difference matters: guessing from `en` would put AM/PM in front of
 * every English-reading user the moment the bridge hiccups, on an app
 * that has shown 24-hour since its first release. The historical answer
 * is the safe answer; the locale is not evidence about this device.
 *
 * An explicit choice wins over both — someone reading Arabic on a phone
 * set to 24-hour who wants AM/PM gets it.
 *
 * `locale` is unused here today. It stays in the signature because it is
 * the third input to the question and every caller already has it; a
 * future locale-aware rule has somewhere to go without a churn of call
 * sites.
 */
export function resolveHour12(
  preference: ClockFormat,
  systemIs24: boolean | null | undefined,
  _locale: string,
): boolean {
  if (preference === '12') return true;
  if (preference === '24') return false;
  return systemIs24 === false;
}

/** The 12-hour hour for a 24-hour one: 0 → 12, 13 → 1. */
export function hour12Of(hour24: number): number {
  const h = ((hour24 % 24) + 24) % 24 % 12;
  return h === 0 ? 12 : h;
}

export type ClockParts = {
  /** "5:31" or "17:31" — Latin digits, never localised. */
  digits: string;
  /** "PM" / "م" / "下午", or undefined on a 24-hour clock. */
  dayPeriod?: string;
  /** True when the day period is written before the digits. */
  dayPeriodFirst: boolean;
};

/**
 * Split rendering, so a caller that wants the marker smaller or quieter
 * than the digits can draw them as two `<Text>` runs.
 */
export function clockParts(
  hour: number,
  minute: number,
  hour12: boolean,
  locale: string,
): ClockParts {
  const m = String(minute).padStart(2, '0');
  if (!hour12) {
    return {
      digits: `${String(hour).padStart(2, '0')}:${m}`,
      dayPeriodFirst: false,
    };
  }
  const names = dayPeriodNames(locale);
  const normalised = ((hour % 24) + 24) % 24;
  return {
    digits: `${hour12Of(normalised)}:${m}`,
    dayPeriod: normalised < 12 ? names.am : names.pm,
    dayPeriodFirst: names.prefix,
  };
}

export function joinClockParts(parts: ClockParts): string {
  if (!parts.dayPeriod) return parts.digits;
  return parts.dayPeriodFirst
    ? `${parts.dayPeriod}${parts.digits}`
    : `${parts.digits} ${parts.dayPeriod}`;
}

/**
 * A canonical `HH:mm` rendered for display. Anything that isn't a clock
 * — an em dash for a prayer that does not occur at this latitude, an
 * empty string — is handed straight back rather than thrown over.
 */
export function formatClock(
  timeStr: string,
  hour12: boolean,
  locale: string,
): string {
  const match = /(\d{1,2}):(\d{2})/.exec(timeStr);
  if (!match) return timeStr;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return timeStr;
  return joinClockParts(clockParts(hour, minute, hour12, locale));
}

/** The same, from a `Date`, for the handful of callers that have one. */
export function formatClockDate(
  date: Date,
  hour12: boolean,
  locale: string,
): string {
  return joinClockParts(
    clockParts(date.getHours(), date.getMinutes(), hour12, locale),
  );
}

/** A bound formatter, for call sites that format many times in a row. */
export type ClockFormatter = ((timeStr: string) => string) & {
  hour12: boolean;
  fromDate: (date: Date) => string;
  parts: (timeStr: string) => ClockParts | null;
};

export function makeClockFormatter(
  hour12: boolean,
  locale: string,
): ClockFormatter {
  const fn = ((timeStr: string) =>
    formatClock(timeStr, hour12, locale)) as ClockFormatter;
  fn.hour12 = hour12;
  fn.fromDate = (date: Date) => formatClockDate(date, hour12, locale);
  fn.parts = (timeStr: string) => {
    const match = /(\d{1,2}):(\d{2})/.exec(timeStr);
    if (!match) return null;
    return clockParts(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      hour12,
      locale,
    );
  };
  return fn;
}
