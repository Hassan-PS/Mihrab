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
