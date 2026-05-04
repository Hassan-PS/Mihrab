/**
 * getNextPrayerDisplay — task #17.
 *
 * The function that powers the "next prayer" pill across HomeScreen, the
 * widget, and notifications. Tested indirectly via buildWidgetPayload tests
 * but not directly. This file locks in the day-rollover and Sunrise-as-next
 * edge cases that subtle changes could regress.
 */

import {
  getNextPrayerDisplay,
  isSameLocalDay,
} from '../src/utils/prayerTimes';

const TODAY = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

const TOMORROW = {
  Fajr: '05:02',
  Sunrise: '06:12',
  Dhuhr: '12:02',
  Asr: '15:02',
  Maghrib: '18:02',
  Isha: '20:02',
};

describe('getNextPrayerDisplay', () => {
  test('returns Fajr at 04:00 on a fresh day', () => {
    const now = new Date(2026, 3, 9, 4, 0, 0);
    const next = getNextPrayerDisplay(TODAY, TOMORROW, now);
    expect(next?.name).toBe('Fajr');
  });

  test('returns Sunrise as the next event after Fajr passes', () => {
    const now = new Date(2026, 3, 9, 5, 30, 0);
    const next = getNextPrayerDisplay(TODAY, TOMORROW, now);
    expect(next?.name).toBe('Sunrise');
  });

  test('skips past Sunrise to Dhuhr after sunrise', () => {
    const now = new Date(2026, 3, 9, 7, 0, 0);
    const next = getNextPrayerDisplay(TODAY, TOMORROW, now);
    expect(next?.name).toBe('Dhuhr');
  });

  test('returns tomorrow Fajr after Isha passes', () => {
    const now = new Date(2026, 3, 9, 21, 0, 0);
    const next = getNextPrayerDisplay(TODAY, TOMORROW, now);
    expect(next?.name).toBe('Fajr');
    // The returned `at` Date is on tomorrow's calendar day.
    expect(next?.at.getDate()).toBe(10);
  });

  test('returns null after Isha when no tomorrow data is available', () => {
    const now = new Date(2026, 3, 9, 21, 0, 0);
    const next = getNextPrayerDisplay(TODAY, undefined, now);
    expect(next).toBeNull();
  });

  test('returns null after Isha when tomorrow has no Fajr', () => {
    const now = new Date(2026, 3, 9, 21, 0, 0);
    const next = getNextPrayerDisplay(
      TODAY,
      { ...TOMORROW, Fajr: '' } as Record<string, string>,
      now,
    );
    expect(next).toBeNull();
  });

  test('"at" timestamp is always strictly in the future', () => {
    for (const h of [0, 4, 5, 7, 12, 14, 17, 19, 21]) {
      const now = new Date(2026, 3, 9, h, 30, 0);
      const next = getNextPrayerDisplay(TODAY, TOMORROW, now);
      if (next) {
        expect(next.at.getTime()).toBeGreaterThan(now.getTime());
      }
    }
  });
});

describe('isSameLocalDay', () => {
  test('true for the same calendar day at different times', () => {
    expect(
      isSameLocalDay(new Date(2026, 3, 9, 0, 0), new Date(2026, 3, 9, 23, 59)),
    ).toBe(true);
  });

  test('false across midnight', () => {
    expect(
      isSameLocalDay(new Date(2026, 3, 9, 23, 59), new Date(2026, 3, 10, 0, 0)),
    ).toBe(false);
  });

  test('false across month boundaries', () => {
    expect(
      isSameLocalDay(new Date(2026, 3, 30), new Date(2026, 4, 1)),
    ).toBe(false);
  });

  test('false across year boundaries', () => {
    expect(
      isSameLocalDay(new Date(2026, 11, 31), new Date(2027, 0, 1)),
    ).toBe(false);
  });
});
