/**
 * The first third of the night (issue #14).
 *
 * A reader in the Mālikī school uses it to tell which window Ishāʾ was
 * prayed in: before the first third closes it is in its preferred time,
 * after it in its late one. That makes it the one night mark that is still
 * ahead of the reader when they look at the day — and the reason it needs
 * its own handling rather than joining Islamic Midnight and the Last Third,
 * which both belong to the night that has just ended.
 */
import { clockNightTimes, injectNightTimes } from '../src/utils/nightTimes';
import {
  buildUpcomingSalahEvents,
  computeNextSalah,
} from '../src/utils/prayerTimes';
import { DISPLAY_ORDER, OPTIONAL_TIME_KEYS } from '../src/types/prayer';
import type { TimingsMap } from '../src/types/prayer';

const day = (over: Partial<TimingsMap> = {}): TimingsMap => ({
  Fajr: '05:33',
  Sunrise: '07:02',
  Dhuhr: '13:35',
  Asr: '17:07',
  Maghrib: '19:59',
  Isha: '21:16',
  ...over,
});

describe('where the first third falls', () => {
  it('is a third of the way from Maghrib to Fajr', () => {
    // 19:59 → 05:33 next morning is 574 minutes. A third is 191.3, so the
    // first third closes at 23:10.
    expect(clockNightTimes('19:59', '05:33').Firstthird).toBe('23:10');
  });

  it('is the first of the three marks of one night', () => {
    // The same night, cut at a third, a half and two thirds.
    const n = clockNightTimes('19:59', '05:33');
    expect(n).toEqual({
      Firstthird: '23:10',
      Midnight: '00:46',
      Lastthird: '02:22',
    });
  });

  it('is last in display order, where the other two are first', () => {
    expect(DISPLAY_ORDER[DISPLAY_ORDER.length - 1]).toBe('Firstthird');
    expect(DISPLAY_ORDER[0]).toBe('Midnight');
    expect(DISPLAY_ORDER[1]).toBe('Lastthird');
  });

  it('is a time, never a prayer — so it can never carry the adhan', () => {
    expect(OPTIONAL_TIME_KEYS).toContain('Firstthird');
  });
});

describe('the night that runs past midnight', () => {
  // Swedish midsummer: Maghrib 23:10, Fajr 01:30. The night is 140 minutes
  // and its first third closes at 23:56 — but move Maghrib on and the same
  // arithmetic lands in the small hours of the NEXT day, where pinning it
  // to this one would announce it almost a day early.
  const late = day({ Maghrib: '23:30', Fajr: '01:30', Isha: '23:59' });

  it('puts a wrapped first third on the following day', () => {
    const times = injectNightTimes([late])[0];
    expect(times.Firstthird).toBe('00:10');
    const now = new Date(2026, 5, 20, 22, 0, 0);
    const next = computeNextSalah(times, now);
    // Not "in ten minutes' time this morning" — it is after Maghrib.
    expect(next?.name).toBe('Maghrib');
  });

  it('schedules it after Maghrib, not before it', () => {
    const times = injectNightTimes([late])[0];
    const now = new Date(2026, 5, 20, 12, 0, 0);
    const events = buildUpcomingSalahEvents(times, undefined, now);
    const maghrib = events.find(e => e.name === 'Maghrib')!;
    const third = events.find(e => e.name === 'Firstthird')!;
    expect(third.at.getTime()).toBeGreaterThan(maghrib.at.getTime());
    expect(third.at.getDate()).toBe(21);
  });

  it('leaves an ordinary evening on its own day', () => {
    const times = injectNightTimes([day()])[0];
    const now = new Date(2026, 5, 20, 12, 0, 0);
    const events = buildUpcomingSalahEvents(times, undefined, now);
    const third = events.find(e => e.name === 'Firstthird')!;
    expect(third.at.getDate()).toBe(20);
  });
});

describe('what it is next after', () => {
  it('follows Isha as the next event of the evening', () => {
    const times = injectNightTimes([day()])[0];
    const now = new Date(2026, 5, 20, 22, 0, 0);
    expect(computeNextSalah(times, now)?.name).toBe('Firstthird');
  });

  it('is simply absent when the toggle is off', () => {
    // And the evening then has nothing after Isha, exactly as before — the
    // other two night marks are this morning's and already behind.
    const times = injectNightTimes([day()])[0];
    delete times.Firstthird;
    const now = new Date(2026, 5, 20, 22, 0, 0);
    expect(computeNextSalah(times, now)).toBeNull();
  });
});
