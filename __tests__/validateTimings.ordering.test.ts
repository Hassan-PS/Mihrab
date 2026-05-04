/**
 * validateTimings prayer-order checks — task #6.
 *
 * Strict shape (the existing test) verifies key presence and HH:MM format.
 * Ordering verifies the canonical sequence Fajr < Sunrise < Dhuhr < Asr < Maghrib < Isha,
 * with the high-latitude exception that Isha may wrap past midnight.
 */
import { validateTimings } from '../src/providers/validateTimings';

const VALID = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '19:30',
};

describe('validateTimings ordering', () => {
  test('accepts canonical order', () => {
    expect(() => validateTimings(VALID)).not.toThrow();
  });

  test('throws when Sunrise <= Fajr', () => {
    expect(() => validateTimings({ ...VALID, Sunrise: '04:30' })).toThrow(
      /Fajr.*before Sunrise/i,
    );
    expect(() => validateTimings({ ...VALID, Sunrise: '05:00' })).toThrow(
      /Fajr.*before Sunrise/i,
    );
  });

  test('throws when Dhuhr <= Sunrise', () => {
    expect(() => validateTimings({ ...VALID, Dhuhr: '06:00' })).toThrow(
      /Sunrise.*before Dhuhr/i,
    );
  });

  test('throws when Asr <= Dhuhr', () => {
    expect(() => validateTimings({ ...VALID, Asr: '11:30' })).toThrow(
      /Dhuhr.*before Asr/i,
    );
  });

  test('throws when Maghrib <= Asr', () => {
    expect(() => validateTimings({ ...VALID, Maghrib: '14:00' })).toThrow(
      /Asr.*before Maghrib/i,
    );
  });

  test('throws when Isha <= Maghrib (same-day Isha-before-Maghrib)', () => {
    // Isha 17:00 with Maghrib 18:00 — both above the early-morning wrap window.
    expect(() => validateTimings({ ...VALID, Isha: '17:00' })).toThrow(
      /Isha.*after Maghrib/i,
    );
  });

  test('accepts Isha past midnight at high latitudes (Stockholm summer)', () => {
    // Late spring in Stockholm: Isha falls past midnight (~00:48 the next day).
    // 00:48 < EARLY_MORNING_THRESHOLD (06:00) so it's interpreted as +24h.
    expect(() =>
      validateTimings({
        Fajr: '01:30',
        Sunrise: '03:30',
        Dhuhr: '12:50',
        Asr: '17:00',
        Maghrib: '21:50',
        Isha: '00:48',
      }),
    ).not.toThrow();
  });

  test('rejects pseudo-wrap (Isha at 07:00) — above threshold but before Maghrib', () => {
    // 07:00 is above EARLY_MORNING_THRESHOLD so it is NOT wrapped — and it's
    // less than Maghrib 21:50, so this is a genuine bad parse, not wrap.
    expect(() =>
      validateTimings({
        Fajr: '01:30',
        Sunrise: '03:30',
        Dhuhr: '12:50',
        Asr: '17:00',
        Maghrib: '21:50',
        Isha: '07:00',
      }),
    ).toThrow(/Isha.*after Maghrib/i);
  });

  test('still passes shape check before ordering check', () => {
    // Missing key fails the existing shape check, not the ordering check.
    const bad = { ...VALID } as Record<string, string>;
    delete bad.Fajr;
    expect(() => validateTimings(bad)).toThrow(
      /missing or not in HH:MM format/i,
    );
  });

  test('extra keys (Imsak) do not break ordering check', () => {
    expect(() => validateTimings({ ...VALID, Imsak: '04:30' })).not.toThrow();
  });
});
