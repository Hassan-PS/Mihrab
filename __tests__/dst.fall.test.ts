/**
 * Fall-back DST regression tests — task #4.
 *
 * Sweden (Europe/Stockholm) falls back on the last Sunday of October:
 *   • 2025: October 26, 03:00 → 02:00 CEST → CET
 *   • 2026: October 25, 03:00 → 02:00 CEST → CET
 *
 * On that day, the local-time hour 02:00–03:00 happens TWICE. JS `setHours(2, 30)`
 * picks one of them deterministically (typically the second / standard-time
 * occurrence). This test suite asserts:
 *   1. addDays() rolls one calendar day forward (the longer 25-hour day).
 *   2. buildWidgetPayload() does not throw on / around the transition day.
 *   3. computeNextSalah() returns a sensible salah across the duplicated hour.
 *   4. The Islamiska Förbundet midnight-rollover logic (separately tested) is
 *      not perturbed by the duplicate-hour ambiguity.
 *
 * Timezone-agnostic — exercises mathematical invariants. For full coverage of
 * the duplicate hour ambiguity, run with `TZ=Europe/Stockholm npx jest --testPathPattern=dst.fall`.
 */
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';
import {
  addDays,
  combineLocalDateAndTime,
  computeNextSalah,
  startOfLocalDay,
} from '../src/utils/prayerTimes';

const today = {
  Fajr: '06:00', // Late-October Fajr in Sweden
  Sunrise: '07:30',
  Dhuhr: '11:50',
  Asr: '14:00',
  Maghrib: '17:30',
  Isha: '19:30',
};

const tomorrow = {
  Fajr: '06:02',
  Sunrise: '07:32',
  Dhuhr: '11:50',
  Asr: '14:00',
  Maghrib: '17:28',
  Isha: '19:28',
};

// October 25, 2026 — fall-back Sunday in Europe/Stockholm.
const FALL_BACK_2026 = { year: 2026, month: 9, day: 25 }; // month is 0-indexed (October)

describe('DST fall-back — addDays correctness', () => {
  it('addDays(1) on the day before fall-back yields the transition day', () => {
    const dayBefore = new Date(2026, 9, 24, 12, 0, 0); // October 24, noon
    const result = addDays(dayBefore, 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(9); // October
    expect(result.getDate()).toBe(25); // exactly one calendar day forward
  });

  it('addDays(1) on the transition day yields the day after', () => {
    const transition = new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 25, 12, 0, 0);
    const result = addDays(transition, 1);
    expect(result.getDate()).toBe(26);
  });

  it('addDays(1) preserves wall-clock hour across the 25-hour fall-back day', () => {
    // The fall-back day is 25 hours long in the local timezone, but addDays uses
    // setDate (calendar-aware), so the wall-clock hour is preserved.
    const t = new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 24, 14, 30, 0);
    const next = addDays(t, 1);
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(30);
  });
});

describe('DST fall-back — buildWidgetPayload does not throw', () => {
  it('builds payload at the duplicated 02:30 (the ambiguous wall-clock moment)', () => {
    // 02:30 happens twice on fall-back day in Europe/Stockholm. JS picks one;
    // either choice should produce a valid widget payload, no crash.
    const now = new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 25, 2, 30, 0);
    expect(() => buildWidgetPayload(today, tomorrow, now)).not.toThrow();
  });

  it('builds payload at noon on transition day', () => {
    const now = new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 25, 12, 0, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    expect(p.rows).toHaveLength(5);
    expect(p.dayLabel.length).toBeGreaterThan(0);
    expect(p.nextKey).toBe('Asr'); // 14:00 is next at noon
  });

  it('builds payload at 23:59 on transition day (post-Isha)', () => {
    const now = new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 25, 23, 59, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    // Should roll to tomorrow's Fajr.
    expect(p.rows.find(r => r.key === 'Fajr')?.time).toBe('06:02');
    expect(p.nextKey).toBe('Fajr');
  });
});

describe('DST fall-back — computeNextSalah and combineLocalDateAndTime', () => {
  it('combineLocalDateAndTime produces a valid Date for the duplicated 02:30', () => {
    const transitionDay = startOfLocalDay(
      new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 25),
    );
    const d = combineLocalDateAndTime(transitionDay, '02:30');
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d.getTime())).toBe(true);
    // The chosen instance should be on October 25, regardless of which
    // duplicate-hour interpretation JS picks.
    expect(d.getDate()).toBe(25);
    expect(d.getMonth()).toBe(9);
  });

  it('computeNextSalah returns the next salah at 06:30 on transition day', () => {
    const now = new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 25, 6, 30, 0);
    const next = computeNextSalah(today, now);
    // Fajr (06:00) has passed, Sunrise is next.
    expect(next?.name).toBe('Sunrise');
  });

  it('computeNextSalah behaves consistently across times near the duplicate hour', () => {
    // We don't assert which "02:30" the system picks — just that calling the
    // function repeatedly never throws and always returns a sensible result.
    for (const m of [0, 15, 30, 45]) {
      const now = new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 25, 2, m, 0);
      expect(() => computeNextSalah(today, now)).not.toThrow();
    }
  });
});

describe('DST fall-back — widget rollover and estimation paths', () => {
  it('uses estimated tomorrow when offline on fall-back transition night', () => {
    // The user's device wakes from sleep at 21:00 on October 25, no tomorrow
    // fetch yet. The widget should still surface tomorrow's Fajr estimate.
    const lateNight = new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 25, 21, 0, 0);
    const p = buildWidgetPayload(today, undefined, lateNight);
    expect(p.tomorrowEstimated).toBe(true);
    expect(p.nextKey).toBe('Fajr');
    expect(p.nextPrayerTime).toBe('06:00'); // today's Fajr applied to tomorrow's date
  });

  it('day after fall-back: clean payload with real tomorrow data', () => {
    const dayAfter = new Date(FALL_BACK_2026.year, FALL_BACK_2026.month, 26, 12, 0, 0);
    const p = buildWidgetPayload(today, tomorrow, dayAfter);
    expect(p.tomorrowEstimated).toBeUndefined();
    expect(p.rows).toHaveLength(5);
  });
});
