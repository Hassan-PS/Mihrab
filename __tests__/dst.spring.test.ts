/**
 * Spring-forward DST regression tests — task #4.
 *
 * Sweden (Europe/Stockholm) springs forward on the last Sunday of March:
 *   • 2025: March 30, 02:00 → 03:00 CET → CEST
 *   • 2026: March 29, 02:00 → 03:00 CET → CEST
 *
 * On that day, the local-time hour 02:00–03:00 doesn't exist. JS `setHours(2, 30)`
 * silently shifts to 03:30 in DST timezones. This test suite asserts:
 *   1. addDays() rolls one calendar day forward (not 23h or 25h).
 *   2. buildWidgetPayload() does not throw on / around the transition day.
 *   3. computeNextSalah() returns the right salah across the gap.
 *   4. The day-after-rollover widget payload (using `tomorrow`) shows the
 *      correct date.
 *
 * These tests are timezone-agnostic — they verify mathematical invariants
 * that must hold regardless of system TZ. To exercise the actual DST gap,
 * run with `TZ=Europe/Stockholm npx jest --testPathPattern=dst.spring`.
 */
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';
import {
  addDays,
  combineLocalDateAndTime,
  computeNextSalah,
  startOfLocalDay,
} from '../src/utils/prayerTimes';

const today = {
  Fajr: '04:30', // Right around the spring-forward gap in Sweden
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

const tomorrow = {
  Fajr: '04:28', // Continues the natural earlier-by-2-min trend
  Sunrise: '06:08',
  Dhuhr: '12:00',
  Asr: '15:01',
  Maghrib: '18:02',
  Isha: '20:02',
};

// March 29, 2026 — spring-forward Sunday in Europe/Stockholm.
const SPRING_FORWARD_2026 = { year: 2026, month: 2, day: 29 }; // month is 0-indexed

describe('DST spring-forward — addDays correctness', () => {
  it('addDays(1) on the day before spring-forward yields the transition day', () => {
    const dayBefore = new Date(2026, 2, 28, 12, 0, 0); // March 28, noon
    const result = addDays(dayBefore, 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(29); // March 29 — exactly one calendar day forward
  });

  it('addDays(1) on the transition day yields the day after', () => {
    const transition = new Date(2026, 2, 29, 12, 0, 0); // March 29, noon
    const result = addDays(transition, 1);
    expect(result.getDate()).toBe(30);
  });

  it('addDays(1) preserves the same wall-clock hour even across DST', () => {
    // In Europe/Stockholm, addDays uses setDate which is calendar-aware.
    // Hour stays the same; absolute UTC ms differs by 23h instead of 24h on
    // spring-forward day, which is correct for "next calendar day same wall time".
    const t = new Date(SPRING_FORWARD_2026.year, SPRING_FORWARD_2026.month, 28, 14, 30, 0);
    const next = addDays(t, 1);
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(30);
  });
});

describe('DST spring-forward — buildWidgetPayload does not throw', () => {
  it('builds payload at noon on the day before transition', () => {
    const now = new Date(SPRING_FORWARD_2026.year, SPRING_FORWARD_2026.month, 28, 12, 0, 0);
    expect(() => buildWidgetPayload(today, tomorrow, now)).not.toThrow();
  });

  it('builds payload at the exact transition moment (02:00 local)', () => {
    // Even if the system isn't in Europe/Stockholm, this should not crash.
    const now = new Date(SPRING_FORWARD_2026.year, SPRING_FORWARD_2026.month, 29, 2, 0, 0);
    expect(() => buildWidgetPayload(today, tomorrow, now)).not.toThrow();
  });

  it('builds payload at 04:00 on transition day (post-gap, Fajr-window)', () => {
    const now = new Date(SPRING_FORWARD_2026.year, SPRING_FORWARD_2026.month, 29, 4, 0, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    expect(p.rows).toHaveLength(5);
    expect(p.dayLabel.length).toBeGreaterThan(0);
    // Fajr at 04:30 should still be next at 04:00 — even in TZs where the
    // 02:00–03:00 gap means 04:30 stayed at 04:30 wall-time.
    expect(p.nextKey).toBe('Fajr');
  });

  it('builds payload at the day boundary 23:59 on transition day', () => {
    const now = new Date(SPRING_FORWARD_2026.year, SPRING_FORWARD_2026.month, 29, 23, 59, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    // After Isha — should roll to tomorrow's data
    expect(p.rows.find(r => r.key === 'Fajr')?.time).toBe('04:28');
  });
});

describe('DST spring-forward — computeNextSalah is consistent across the gap', () => {
  it('returns Fajr as next at 03:00 on transition day (would be 02:00 pre-DST)', () => {
    const now = new Date(SPRING_FORWARD_2026.year, SPRING_FORWARD_2026.month, 29, 3, 0, 0);
    const next = computeNextSalah(today, now);
    expect(next?.name).toBe('Fajr');
  });

  it('combineLocalDateAndTime produces a valid Date for any time string on transition day', () => {
    const transitionDay = startOfLocalDay(
      new Date(SPRING_FORWARD_2026.year, SPRING_FORWARD_2026.month, 29),
    );
    // Times that fall in the spring-forward gap (02:00–03:00 local in Stockholm)
    // should still produce a valid Date — JS shifts them automatically.
    for (const timeStr of ['02:00', '02:30', '02:59', '03:00', '04:30']) {
      const d = combineLocalDateAndTime(transitionDay, timeStr);
      expect(d).toBeInstanceOf(Date);
      expect(Number.isFinite(d.getTime())).toBe(true);
    }
  });
});

describe('DST spring-forward — widget rollover continues working', () => {
  it('builds widget for the day AFTER transition with tomorrow data', () => {
    const dayAfter = new Date(SPRING_FORWARD_2026.year, SPRING_FORWARD_2026.month, 30, 12, 0, 0);
    const p = buildWidgetPayload(today, tomorrow, dayAfter);
    expect(p.rows).toHaveLength(5);
    expect(p.dayLabel.length).toBeGreaterThan(0);
    // No tomorrowEstimated flag — we have real tomorrow data.
    expect(p.tomorrowEstimated).toBeUndefined();
  });

  it('uses estimated tomorrow path when crossing DST without a tomorrow fetch', () => {
    // Realistic scenario: DST transition + offline → no tomorrow data.
    // The widget should still surface "Fajr" as the next prayer using
    // today's Fajr applied to tomorrow's date.
    const lateNight = new Date(SPRING_FORWARD_2026.year, SPRING_FORWARD_2026.month, 29, 23, 0, 0);
    const p = buildWidgetPayload(today, undefined, lateNight);
    expect(p.tomorrowEstimated).toBe(true);
    expect(p.nextKey).toBe('Fajr');
    expect(p.nextPrayerTime).toBe('04:30');
  });
});
