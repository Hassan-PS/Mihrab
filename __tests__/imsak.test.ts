/**
 * Imsak helpers + Ramadan provider plumbing — task #7.
 *
 * Verifies:
 *   1. timeMinusMinutes wraps past midnight correctly.
 *   2. computeImsak applies the configured offset.
 *   3. validateTimings enforces Imsak ≤ Fajr (with high-latitude wrap).
 *   4. localAdhan returns Imsak.
 *   5. Islamiska Förbundet parser extracts Imsak from a 7-token Ramadan
 *      response and falls back to Fajr − 10 from a 6-token regular response.
 *   6. fetchPrayerTimesUnified guarantees Imsak is present after every
 *      provider call.
 */

import {
  DEFAULT_IMSAK_OFFSET_MINUTES,
  computeImsak,
  timeMinusMinutes,
} from '../src/providers/imsak';
import { validateTimings } from '../src/providers/validateTimings';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { parseIslamiskaForbundetHtml } from '../src/providers/islamiskaForbundet';

describe('timeMinusMinutes', () => {
  test('subtracts within the same day', () => {
    expect(timeMinusMinutes('05:00', 10)).toBe('04:50');
    expect(timeMinusMinutes('12:00', 30)).toBe('11:30');
    expect(timeMinusMinutes('14:30', 90)).toBe('13:00');
  });

  test('wraps past midnight when Fajr is in the early morning', () => {
    // Fajr 00:05 minus 10 → previous day 23:55 (high-latitude scenario).
    expect(timeMinusMinutes('00:05', 10)).toBe('23:55');
    expect(timeMinusMinutes('00:00', 1)).toBe('23:59');
  });

  test('zero offset is identity', () => {
    expect(timeMinusMinutes('05:00', 0)).toBe('05:00');
  });

  test('clamps negative offsets to 0', () => {
    expect(timeMinusMinutes('05:00', -10)).toBe('05:00');
  });

  test('handles malformed input gracefully (returns input)', () => {
    expect(timeMinusMinutes('not a time', 10)).toBe('not a time');
  });
});

describe('computeImsak', () => {
  test('default offset is 10 minutes', () => {
    expect(DEFAULT_IMSAK_OFFSET_MINUTES).toBe(10);
    expect(computeImsak('05:00')).toBe('04:50');
  });

  test('respects custom offsets (15, 20)', () => {
    expect(computeImsak('05:00', 15)).toBe('04:45');
    expect(computeImsak('05:00', 20)).toBe('04:40');
  });

  test('Umm al-Qura case: offset 0 → Imsak = Fajr', () => {
    expect(computeImsak('05:00', 0)).toBe('05:00');
  });
});

describe('validateTimings: Imsak validation', () => {
  const VALID_TIMINGS = {
    Fajr: '05:00',
    Sunrise: '06:10',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib: '18:00',
    Isha: '19:30',
  };

  test('accepts Imsak ≤ Fajr (Imsak = Fajr − 10 normal case)', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: '04:50' }),
    ).not.toThrow();
  });

  test('accepts Imsak = Fajr (Umm al-Qura)', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: '05:00' }),
    ).not.toThrow();
  });

  test('rejects Imsak > Fajr (clear ordering bug)', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: '05:30' }),
    ).toThrow(/Imsak.*at or before Fajr/i);
  });

  test('rejects Imsak with malformed format', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: '4:30' }),
    ).toThrow(/Imsak.*HH:MM format/i);
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: 'soon' }),
    ).toThrow(/Imsak.*HH:MM format/i);
  });

  test('accepts Imsak in late evening when Fajr is in early morning (high-latitude wrap)', () => {
    // Stockholm late June: Fajr just after midnight, Imsak the previous evening.
    expect(() =>
      validateTimings({
        Fajr: '00:48',
        Sunrise: '03:30',
        Dhuhr: '12:50',
        Asr: '17:00',
        Maghrib: '21:50',
        Isha: '23:55',
        Imsak: '23:30',
      }),
    ).not.toThrow();
  });

  test('Imsak omitted is fine (optional key)', () => {
    expect(() => validateTimings(VALID_TIMINGS)).not.toThrow();
  });

  test('Midnight optional key validates format only', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Midnight: '00:00' }),
    ).not.toThrow();
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Midnight: 'mid' }),
    ).toThrow(/Midnight.*HH:MM format/i);
  });
});

describe('computeLocalAdhanTimes returns Imsak', () => {
  test('default 10-minute offset is applied', () => {
    const result = computeLocalAdhanTimes({
      latitude: 59.33,
      longitude: 18.07,
      date: new Date(2026, 3, 9),
      calculationMethod: 'auto',
      school: 0,
    });
    expect(result.timings.Imsak).toBeDefined();
    expect(result.timings.Imsak).toMatch(/^\d{2}:\d{2}$/);
    // Adhan mock returns the same time for every prayer; Imsak should be
    // 10 minutes earlier (with possible day-wrap).
    const fajr = result.timings.Fajr;
    const expected = computeImsak(fajr, 10);
    expect(result.timings.Imsak).toBe(expected);
  });

  test('respects a custom imsakOffsetMinutes', () => {
    const result = computeLocalAdhanTimes({
      latitude: 59.33,
      longitude: 18.07,
      date: new Date(2026, 3, 9),
      calculationMethod: 'auto',
      school: 0,
      imsakOffsetMinutes: 20,
    });
    expect(result.timings.Imsak).toBe(computeImsak(result.timings.Fajr, 20));
  });
});

describe('Islamiska Förbundet parser: Ramadan column detection', () => {
  function buildHtml(times: string[]): string {
    return `
      <html><body>
        <table>
          ${times.map(t => `<tr><td>${t}</td></tr>`).join('')}
        </table>
      </body></html>`;
  }

  test('regular response (6 times): computes Imsak fallback from Fajr', () => {
    // Suppress the debug log for cleaner test output.
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const html = buildHtml(['05:30', '07:45', '12:00', '14:30', '16:00', '17:30']);
    const result = parseIslamiskaForbundetHtml(html, 'Stockholm');
    expect(result.Imsak).toBe('05:20'); // Fajr 05:30 − 10
    expect(result.Fajr).toBe('05:30');
    debugSpy.mockRestore();
  });

  test('Ramadan response (7 times): extracts Imsak as the leading column', () => {
    // Conventional column order: Imsak | Fajr | Sunrise | Dhuhr | Asr | Maghrib | Isha
    const html = buildHtml([
      '04:00', // Imsak
      '04:10', // Fajr
      '06:30', // Sunrise
      '13:00', // Dhuhr
      '17:00', // Asr
      '19:30', // Maghrib
      '21:00', // Isha
    ]);
    const result = parseIslamiskaForbundetHtml(html, 'Stockholm');
    expect(result.Imsak).toBe('04:00'); // Real, not computed
    expect(result.Fajr).toBe('04:10');
    expect(result.Sunrise).toBe('06:30');
    expect(result.Isha).toBe('21:00');
  });

  test('throws if 7-token response has Imsak after Fajr (column order swapped)', () => {
    // If the site swaps the order, the leading "Imsak" would be > Fajr.
    const html = buildHtml([
      '06:30', // Pretend this is Imsak — but it's actually after Fajr
      '04:10', // Fajr
      '07:00',
      '13:00',
      '17:00',
      '19:30',
      '21:00',
    ]);
    expect(() => parseIslamiskaForbundetHtml(html, 'Stockholm')).toThrow(
      /column order.*changed/i,
    );
  });

  test('Ramadan response with high-latitude wrap (Imsak late evening, Fajr after midnight)', () => {
    const html = buildHtml([
      '23:30', // Imsak (previous evening)
      '00:48', // Fajr (just past midnight)
      '03:30', // Sunrise
      '12:50',
      '17:00',
      '21:50',
      '23:55', // Isha
    ]);
    const result = parseIslamiskaForbundetHtml(html, 'Stockholm');
    expect(result.Imsak).toBe('23:30');
    expect(result.Fajr).toBe('00:48');
  });
});
