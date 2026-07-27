/**
 * Multi-day alert coverage (v2.7.40).
 *
 * Regression for "the adhan never fires since I turned off the Live
 * Activity": scheduling only spanned today+tomorrow, so if the app wasn't
 * opened for 2+ days every alert silently lapsed. The Live Activity's
 * foreground service used to mask this by keeping the app alive/exempt on
 * OEM shells; users who turned it off hit the gap directly. Now
 * `buildUpcomingSalahEvents` accepts extra cached days (week[2..]) and
 * schedules them at day offsets 2, 3, … from the base day.
 */
import { buildUpcomingSalahEvents } from '../src/utils/prayerTimes';

const day = (fajr: string) => ({
  Fajr: fajr,
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
});

describe('buildUpcomingSalahEvents — extra cached days', () => {
  const today = day('05:00');
  const tomorrow = day('05:01');
  const dayAfter = day('05:02');
  const dayAfterThat = day('05:03');

  it('schedules events at day offsets 2+ for extraDays', () => {
    const now = new Date(2026, 6, 17, 10, 0, 0);
    const events = buildUpcomingSalahEvents(today, tomorrow, now, now, [
      dayAfter,
      dayAfterThat,
    ]);
    const fajrs = events.filter(e => e.name === 'Fajr');
    // Today's Fajr (05:00) is past; tomorrow + 2 extra days remain.
    expect(fajrs).toHaveLength(3);
    expect(fajrs[0].at.getDate()).toBe(18);
    expect(fajrs[0].at.getMinutes()).toBe(1);
    expect(fajrs[1].at.getDate()).toBe(19);
    expect(fajrs[1].at.getMinutes()).toBe(2);
    expect(fajrs[2].at.getDate()).toBe(20);
    expect(fajrs[2].at.getMinutes()).toBe(3);
  });

  it('keeps events chronologically sorted across days', () => {
    const now = new Date(2026, 6, 17, 4, 0, 0);
    const events = buildUpcomingSalahEvents(today, tomorrow, now, now, [
      dayAfter,
    ]);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].at.getTime()).toBeGreaterThanOrEqual(
        events[i - 1].at.getTime(),
      );
    }
    // 3 days × 6 events, all future at 04:00 on day one.
    expect(events).toHaveLength(18);
  });

  it('extraDays anchored to baseDay, not now — stale-state safety', () => {
    // State fetched for the 17th, but it is now the 18th at 03:00: today's
    // map anchors to the 17th (past, filtered), tomorrow covers the actual
    // today, and the first extra day covers the actual tomorrow.
    const base = new Date(2026, 6, 17, 12, 0, 0);
    const now = new Date(2026, 6, 18, 3, 0, 0);
    const events = buildUpcomingSalahEvents(today, tomorrow, now, base, [
      dayAfter,
    ]);
    const fajrs = events.filter(e => e.name === 'Fajr');
    expect(fajrs).toHaveLength(2);
    expect(fajrs[0].at.getDate()).toBe(18); // tomorrow-map on the real today
    expect(fajrs[1].at.getDate()).toBe(19); // extra day on the real tomorrow
  });

  it('defaults to today+tomorrow when no extraDays given (unchanged)', () => {
    const now = new Date(2026, 6, 17, 4, 0, 0);
    const events = buildUpcomingSalahEvents(today, tomorrow, now);
    expect(events).toHaveLength(12);
  });
});
