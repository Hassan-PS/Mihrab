import {
  clockNightTimes,
  injectNightTimes,
  filterOptionalTimes,
} from '../src/utils/nightTimes';
import type { TimingsMap } from '../src/types/prayer';

describe('clockNightTimes (Maghrib → Fajr, classical basis)', () => {
  it('computes the midpoint and last-third for a normal night', () => {
    // Maghrib 22:00 → Fajr 03:00 = 5h night.
    // Midnight = +2h30 = 00:30 ; Last third start = +3h20 = 01:20.
    expect(clockNightTimes('22:00', '03:00')).toEqual({
      Midnight: '00:30',
      Lastthird: '01:20',
    });
  });

  it('handles a short summer night that still crosses midnight', () => {
    // Maghrib 22:10 → Fajr 02:20 = 4h10 (250m).
    // Midnight = +125m = 00:15 ; Last third = +166.67m ≈ 00:57.
    expect(clockNightTimes('22:10', '02:20')).toEqual({
      Midnight: '00:15',
      Lastthird: '00:57',
    });
  });

  it('handles a midpoint that lands before midnight', () => {
    // Maghrib 16:00 → Fajr 06:00 = 14h. Midnight = +7h = 23:00.
    expect(clockNightTimes('16:00', '06:00').Midnight).toBe('23:00');
  });
});

describe('injectNightTimes', () => {
  const day = (Maghrib: string, Fajr: string): TimingsMap => ({
    Fajr,
    Sunrise: '05:00',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib,
    Isha: '21:00',
  });

  it('derives each day from the previous day Maghrib + that day Fajr', () => {
    const week = [day('22:00', '03:00'), day('22:02', '03:02')];
    const out = injectNightTimes(week);
    // Day 0 (today) uses its own Maghrib as the prev-day proxy.
    expect(out[0].Midnight).toBe('00:30');
    expect(out[0].Lastthird).toBe('01:20');
    // Day 1 uses day 0's Maghrib (22:00) + day 1's Fajr (03:02).
    // night = 302m → midpoint +151 = 00:31, last third +201.3 ≈ 01:21.
    expect(out[1].Midnight).toBe('00:31');
    expect(out[1].Lastthird).toBe('01:21');
  });

  it('leaves a day untouched when Maghrib or Fajr is missing', () => {
    const week: TimingsMap[] = [{ Fajr: '03:00' }];
    expect(injectNightTimes(week)[0].Midnight).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const week = [day('22:00', '03:00')];
    const snapshot = JSON.stringify(week);
    injectNightTimes(week);
    expect(JSON.stringify(week)).toBe(snapshot);
  });
});

describe('filterOptionalTimes (toggle gating / Sunrise kill-switch)', () => {
  const base: TimingsMap = {
    Fajr: '03:00',
    Sunrise: '05:00',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib: '22:00',
    Isha: '21:00',
    Midnight: '00:30',
    Lastthird: '01:20',
  };

  it('keeps everything when all toggles are on', () => {
    const out = filterOptionalTimes(base, {
      Sunrise: true,
      Midnight: true,
      Lastthird: true,
    });
    expect(out).toBe(base); // same reference — no copy when nothing removed
  });

  it('drops Sunrise when the kill-switch is off', () => {
    const out = filterOptionalTimes(base, {
      Sunrise: false,
      Midnight: true,
      Lastthird: true,
    });
    expect(out.Sunrise).toBeUndefined();
    expect(out.Midnight).toBe('00:30');
    expect(out.Fajr).toBe('03:00');
  });

  it('drops both night times when their toggles are off (defaults)', () => {
    const out = filterOptionalTimes(base, {
      Sunrise: true,
      Midnight: false,
      Lastthird: false,
    });
    expect(out.Midnight).toBeUndefined();
    expect(out.Lastthird).toBeUndefined();
    expect(out.Sunrise).toBe('05:00');
  });
});
