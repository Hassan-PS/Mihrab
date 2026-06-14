import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';

const today = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '19:30',
};

const tomorrow = {
  Fajr: '05:02',
  Sunrise: '06:12',
  Dhuhr: '12:02',
  Asr: '15:02',
  Maghrib: '18:02',
  Isha: '19:32',
};

describe('buildWidgetPayload', () => {
  it('uses today and lists five salāh times (no Sunrise)', () => {
    const now = new Date(2026, 3, 9, 14, 0, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    expect(p.rows.find(r => r.key === 'Dhuhr')?.time).toBe('12:00');
    expect(p.rows.find(r => r.key === 'Maghrib')?.abbr).toBe('Magh');
    expect(p.rows.some(r => r.key === 'Sunrise')).toBe(false);
    expect(p.dayLabel.length).toBeGreaterThan(0);
    expect(p.nextKey).toBe('Asr');
  });

  it('switches to tomorrow after Isha', () => {
    const now = new Date(2026, 3, 9, 22, 0, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    expect(p.rows.find(r => r.key === 'Fajr')?.time).toBe('05:02');
    expect(p.rows).toHaveLength(5);
    expect(p.nextKey).toBe('Fajr');
  });
});

describe('buildWidgetPayload multi-day schedule (days[])', () => {
  const day0 = today;
  const day1 = tomorrow;
  const day2 = { ...today, Fajr: '05:04', Dhuhr: '12:04' };

  it('emits one dated entry per supplied week day with correct local dateKeys', () => {
    const now = new Date(2026, 3, 9, 14, 0, 0); // Apr 9 2026, local
    const p = buildWidgetPayload(
      today,
      tomorrow,
      now,
      undefined,
      undefined,
      undefined,
      [day0, day1, day2],
    );
    expect(p.days).toBeDefined();
    expect(p.days).toHaveLength(3);
    expect(p.days!.map(d => d.dateKey)).toEqual([
      '2026-04-09',
      '2026-04-10',
      '2026-04-11',
    ]);
    // Each day carries its OWN times — this is what lets native roll over.
    expect(p.days![0].rows.find(r => r.key === 'Dhuhr')?.time).toBe('12:00');
    expect(p.days![1].rows.find(r => r.key === 'Fajr')?.time).toBe('05:02');
    expect(p.days![2].rows.find(r => r.key === 'Fajr')?.time).toBe('05:04');
    // Sunrise is carried per-day but separate from the salāh rows.
    expect(p.days![0].sunriseRow?.time).toBe('06:10');
    expect(p.days![0].rows.some(r => r.key === 'Sunrise')).toBe(false);
  });

  it('falls back to today (+tomorrow) when no week is supplied', () => {
    const now = new Date(2026, 3, 9, 14, 0, 0);
    const p = buildWidgetPayload(today, tomorrow, now);
    expect(p.days).toHaveLength(2);
    expect(p.days!.map(d => d.dateKey)).toEqual(['2026-04-09', '2026-04-10']);
  });

  it('emits a single-day schedule when only today is known', () => {
    const now = new Date(2026, 3, 9, 14, 0, 0);
    const p = buildWidgetPayload(today, undefined, now);
    expect(p.days).toHaveLength(1);
    expect(p.days![0].dateKey).toBe('2026-04-09');
  });

  it('does not let day-rollover of the single-day view affect days[] dates', () => {
    // After Isha the single-day `rows` roll to tomorrow, but days[0] must still
    // be anchored to the actual current calendar day so native matches by date.
    const now = new Date(2026, 3, 9, 22, 0, 0);
    const p = buildWidgetPayload(
      today,
      tomorrow,
      now,
      undefined,
      undefined,
      undefined,
      [today, tomorrow],
    );
    expect(p.rows.find(r => r.key === 'Fajr')?.time).toBe('05:02'); // view rolled
    expect(p.days![0].dateKey).toBe('2026-04-09'); // schedule anchored to today
    expect(p.days![0].rows.find(r => r.key === 'Fajr')?.time).toBe('05:00');
  });
});
