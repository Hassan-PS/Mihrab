/**
 * The 12-hour clock — issue #18.
 *
 * Two things are worth pinning here. One is the arithmetic nobody gets
 * right first time: midnight is 12 AM and noon is 12 PM, and both come
 * from an hour whose remainder mod 12 is zero. The other is that the
 * digits are ours and only the marker is `Intl`'s — an Arabic user
 * reading "٥:٣١" beside a Latin-digit countdown on the same card is the
 * bug this arrangement exists to prevent.
 */
import {
  _resetClockFormatCaches,
  clockParts,
  coerceClockFormat,
  dayPeriodNames,
  formatClock,
  formatClockDate,
  hour12Of,
  makeClockFormatter,
  resolveHour12,
} from '../src/utils/clockFormat';

beforeEach(() => {
  _resetClockFormatCaches();
});

describe('coerceClockFormat', () => {
  it('keeps the two explicit choices and treats everything else as auto', () => {
    expect(coerceClockFormat('12')).toBe('12');
    expect(coerceClockFormat('24')).toBe('24');
    expect(coerceClockFormat('auto')).toBe('auto');
    expect(coerceClockFormat(undefined)).toBe('auto');
    expect(coerceClockFormat(12)).toBe('auto');
    expect(coerceClockFormat('12h')).toBe('auto');
    expect(coerceClockFormat(null)).toBe('auto');
  });
});

describe('hour12Of', () => {
  it('puts midnight and noon on 12, not on 0', () => {
    expect(hour12Of(0)).toBe(12);
    expect(hour12Of(12)).toBe(12);
  });

  it('counts the rest the way a clock face does', () => {
    expect(hour12Of(1)).toBe(1);
    expect(hour12Of(11)).toBe(11);
    expect(hour12Of(13)).toBe(1);
    expect(hour12Of(23)).toBe(11);
  });
});

describe('resolveHour12', () => {
  it('honours an explicit choice over the device', () => {
    expect(resolveHour12('12', true, 'en')).toBe(true);
    expect(resolveHour12('12', false, 'en')).toBe(true);
    expect(resolveHour12('24', false, 'ar')).toBe(false);
    expect(resolveHour12('24', true, 'ar')).toBe(false);
  });

  it('follows the device on auto', () => {
    expect(resolveHour12('auto', false, 'sv')).toBe(true);
    expect(resolveHour12('auto', true, 'en')).toBe(false);
  });

  /**
   * The conservative fallback, and the reason it is conservative: this
   * app has shown 24-hour since its first release, so a build that
   * cannot reach the native module must not start writing AM/PM at every
   * English-reading user on a guess drawn from their language.
   */
  it('stays on 24-hour when the device could not be asked', () => {
    expect(resolveHour12('auto', null, 'en')).toBe(false);
    expect(resolveHour12('auto', undefined, 'en-US')).toBe(false);
  });
});

describe('formatClock', () => {
  it('passes a 24-hour clock through, zero-padded', () => {
    expect(formatClock('17:31', false, 'en')).toBe('17:31');
    expect(formatClock('5:04', false, 'en')).toBe('05:04');
  });

  it('writes afternoon and evening on a 12-hour clock', () => {
    expect(formatClock('17:31', true, 'en')).toBe('5:31 PM');
    expect(formatClock('23:59', true, 'en')).toBe('11:59 PM');
  });

  it('gets midnight and noon right', () => {
    expect(formatClock('00:05', true, 'en')).toBe('12:05 AM');
    expect(formatClock('12:00', true, 'en')).toBe('12:00 PM');
    expect(formatClock('11:59', true, 'en')).toBe('11:59 AM');
  });

  it('keeps the minutes padded and the hour not', () => {
    expect(formatClock('09:05', true, 'en')).toBe('9:05 AM');
  });

  /**
   * A row for a prayer that does not occur at this latitude is an em
   * dash, and the month table hands whatever it has to the formatter.
   */
  it('hands back anything that is not a clock', () => {
    expect(formatClock('—', true, 'en')).toBe('—');
    expect(formatClock('', true, 'en')).toBe('');
    expect(formatClock('N/A', false, 'en')).toBe('N/A');
  });
});

describe('localisation', () => {
  it('localises the marker but never the digits', () => {
    const arabic = formatClock('17:31', true, 'ar');
    // The digits are the app's own, so the Latin run is intact...
    expect(arabic).toMatch(/^5:31 /);
    // ...and there is a marker after them that is not "PM".
    expect(arabic.length).toBeGreaterThan('5:31 '.length);
    expect(arabic).not.toContain('PM');
    // No Arabic-Indic digits anywhere.
    expect(arabic).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('puts the marker where the locale puts it', () => {
    const zh = dayPeriodNames('zh');
    const en = dayPeriodNames('en');
    expect(en.prefix).toBe(false);
    // Chinese writes 下午5:31, so the marker leads. If a future ICU
    // disagrees, the assertion below still describes what was rendered.
    expect(formatClock('17:31', true, 'zh').endsWith('5:31')).toBe(zh.prefix);
  });

  it('falls back to English markers when Intl cannot answer', () => {
    const real = Intl.DateTimeFormat;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Intl as any).DateTimeFormat = function () {
      throw new Error('no ICU in this build');
    };
    try {
      _resetClockFormatCaches();
      expect(formatClock('17:31', true, 'ar')).toBe('5:31 PM');
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Intl as any).DateTimeFormat = real;
      _resetClockFormatCaches();
    }
  });
});

describe('clockParts', () => {
  it('leaves the day period off a 24-hour clock', () => {
    expect(clockParts(17, 31, false, 'en')).toEqual({
      digits: '17:31',
      dayPeriodFirst: false,
    });
  });

  it('splits the marker out so it can be drawn differently', () => {
    expect(clockParts(17, 31, true, 'en')).toEqual({
      digits: '5:31',
      dayPeriod: 'PM',
      dayPeriodFirst: false,
    });
  });
});

describe('makeClockFormatter', () => {
  it('formats strings and dates the same way', () => {
    const clock = makeClockFormatter(true, 'en');
    expect(clock.hour12).toBe(true);
    expect(clock('17:31')).toBe('5:31 PM');
    expect(clock.fromDate(new Date(2026, 0, 1, 17, 31))).toBe('5:31 PM');
    expect(formatClockDate(new Date(2026, 0, 1, 6, 5), false, 'en')).toBe(
      '06:05',
    );
  });

  it('returns null parts for something that is not a clock', () => {
    expect(makeClockFormatter(true, 'en').parts('—')).toBeNull();
  });
});
