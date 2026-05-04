/**
 * Verifies that buildWidgetPayload handles the exact-midnight rollover
 * correctly — the widget should switch to tomorrow's times precisely when
 * Isha has passed, not a moment earlier or later.
 */
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';

const today = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

const tomorrow = {
  Fajr: '05:02',
  Sunrise: '06:12',
  Dhuhr: '12:02',
  Asr: '15:02',
  Maghrib: '18:02',
  Isha: '20:02',
};

describe('buildWidgetPayload midnight rollover', () => {
  it('still shows today at 23:59 (Isha already passed, tomorrow available)', () => {
    // One minute before midnight — tomorrow should already be shown
    // because all of today's prayers have passed.
    const now = new Date(2026, 3, 9, 23, 59, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    // After Isha, widget should roll to tomorrow
    expect(p.rows.find(r => r.key === 'Fajr')?.time).toBe('05:02');
  });

  it('shows today at 19:59, one minute before Isha', () => {
    const now = new Date(2026, 3, 9, 19, 59, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    // Isha is still upcoming today
    expect(p.rows.find(r => r.key === 'Isha')?.time).toBe('20:00');
    expect(p.nextKey).toBe('Isha');
  });

  it('rolls to tomorrow immediately after Isha fires', () => {
    // 20:01 — one minute after Isha, no more prayers today
    const now = new Date(2026, 3, 9, 20, 1, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    expect(p.rows.find(r => r.key === 'Fajr')?.time).toBe('05:02');
    expect(p.nextKey).toBe('Fajr');
  });

  it('estimates tomorrow Fajr when after Isha and tomorrow data is unavailable', () => {
    // After Isha (21:00) with no tomorrow data, the previous behavior fell back
    // to today's stale times with `nextKey: null` — the user saw an inert widget.
    // The fix surfaces a soft-state estimate: today's Fajr applied to tomorrow's
    // calendar date, with `tomorrowEstimated: true` so the widget can render a
    // subtle indicator.
    const now = new Date(2026, 3, 9, 21, 0, 0);
    const p = buildWidgetPayload(today, undefined, now);
    expect(p.tomorrowEstimated).toBe(true);
    // Times shown are today's strings re-applied to tomorrow's date.
    expect(p.rows.find(r => r.key === 'Fajr')?.time).toBe('05:00');
    // The next-prayer hint points at Fajr (the user expects to see this).
    expect(p.nextKey).toBe('Fajr');
    expect(p.nextPrayerTime).toBe('05:00');
  });

  it('shows correct nextKey at each prayer boundary', () => {
    const boundaries: [number, number, string][] = [
      [4, 30, 'Fajr'],      // before Fajr
      [5, 30, 'Sunrise'],   // after Fajr, before Sunrise
      [11, 0, 'Dhuhr'],     // after Sunrise, before Dhuhr
      [13, 0, 'Asr'],       // after Dhuhr, before Asr
      [16, 0, 'Maghrib'],   // after Asr, before Maghrib
      [19, 0, 'Isha'],      // after Maghrib, before Isha
    ];
    for (const [h, m, expectedNext] of boundaries) {
      const now = new Date(2026, 3, 9, h, m, 0);
      const p = buildWidgetPayload(today, tomorrow, now);
      expect(p.nextKey).toBe(expectedNext);
    }
  });
});
