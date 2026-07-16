/**
 * Regression: a notification sync that runs AFTER midnight with state that
 * was fetched YESTERDAY must not pin yesterday's HH:MM onto today's date.
 *
 * Real-world case (2026-07-16, Stockholm): Fajr 02:38 / Sunrise 03:52, but
 * the previous day's map (02:37 / 03:50) was still in memory when a sync
 * fired shortly after midnight (brief phone wake). Anchored to "now", the
 * scheduler placed 02:37/03:50 on the 16th — the adhan fired 1–2 min early
 * and the later resync added a SECOND alert at the true time.
 *
 * With the `baseDay` anchor, the stale `today` map lands on its own (past)
 * day and is filtered out, while the `tomorrow` map covers the actual today
 * with the correct times.
 */
import { buildUpcomingSalahEvents } from '../src/utils/prayerTimes';

// Stockholm-style July times: the day the maps were fetched for (Jul 15)…
const jul15 = {
  Fajr: '02:37',
  Sunrise: '03:50',
  Dhuhr: '12:59',
  Asr: '17:31',
  Maghrib: '21:57',
  Isha: '23:02',
};
// …and its tomorrow (Jul 16) — the day `now` actually falls on.
const jul16 = {
  Fajr: '02:38',
  Sunrise: '03:52',
  Dhuhr: '12:59',
  Asr: '17:31',
  Maghrib: '21:56',
  Isha: '23:01',
};

describe('buildUpcomingSalahEvents with a stale base day', () => {
  // Sync fires at 00:30 on Jul 16 with state fetched on Jul 15.
  const now = new Date(2026, 6, 16, 0, 30, 0);
  const baseDay = new Date(2026, 6, 15);

  it('anchored to baseDay: today comes from the tomorrow map with correct times', () => {
    const events = buildUpcomingSalahEvents(jul15, jul16, now, baseDay);

    const fajr = events.find(e => e.name === 'Fajr');
    expect(fajr).toBeDefined();
    // Jul 16 Fajr at the CORRECT 02:38 — not yesterday's 02:37.
    expect(fajr!.at.getDate()).toBe(16);
    expect(fajr!.at.getHours()).toBe(2);
    expect(fajr!.at.getMinutes()).toBe(38);

    const sunrise = events.find(e => e.name === 'Sunrise');
    expect(sunrise).toBeDefined();
    expect(sunrise!.at.getMinutes()).toBe(52);

    // No event may carry yesterday's clock times onto today.
    for (const e of events) {
      expect(
        e.at.getDate() === 16 &&
          ((e.name === 'Fajr' && e.at.getMinutes() === 37) ||
            (e.name === 'Sunrise' && e.at.getMinutes() === 50)),
      ).toBe(false);
    }
  });

  it('without the anchor (legacy behavior) the schedule is wrong — documents the bug', () => {
    const events = buildUpcomingSalahEvents(jul15, jul16, now);
    const fajr = events.find(e => e.name === 'Fajr');
    // Legacy anchoring to `now` places yesterday's 02:37 on the 16th.
    expect(fajr!.at.getDate()).toBe(16);
    expect(fajr!.at.getMinutes()).toBe(37);
  });

  it('a 2+ day stale base yields no events at all (caller keeps existing alarms)', () => {
    const muchLater = new Date(2026, 6, 18, 0, 30, 0);
    const events = buildUpcomingSalahEvents(jul15, jul16, muchLater, baseDay);
    expect(events).toHaveLength(0);
  });

  it('fresh state (base == today) behaves exactly as before', () => {
    const freshNow = new Date(2026, 6, 16, 12, 0, 0);
    const withAnchor = buildUpcomingSalahEvents(
      jul16,
      undefined,
      freshNow,
      new Date(2026, 6, 16),
    );
    const legacy = buildUpcomingSalahEvents(jul16, undefined, freshNow);
    expect(withAnchor.map(e => `${e.name}@${e.at.getTime()}`)).toEqual(
      legacy.map(e => `${e.name}@${e.at.getTime()}`),
    );
  });
});
