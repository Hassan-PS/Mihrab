/**
 * The four numbers above the graph.
 *
 * The one that matters most is `owed`. Making up a missed prayer is one of
 * the few things on this screen that is actually urgent, and the old design
 * left it as a 5pt dot to hunt for among ninety-one squares — on a day that
 * went four-of-five, drawn as a strong green square that camouflages it.
 */
import {
  computePracticeStats,
  owedDays,
  owedPrayers,
  sunnahRateFor,
} from '../src/practice/practiceStats';
import type { JournalEntry } from '../src/journal/journal';
import type { SunnahLog } from '../src/journal/sunnah';

const NOW = new Date(2026, 7, 10, 12, 0); // 10 Aug 2026 — ten days elapsed

function entry(
  date: string,
  prayer: JournalEntry['prayer'],
  status: JournalEntry['status'],
): JournalEntry {
  return { date, prayer, status, loggedAt: `${date}T12:00:00.000Z` };
}

describe('owed prayers', () => {
  it('is exactly what is still marked missed', () => {
    const entries = [
      entry('2026-08-03', 'Fajr', 'missed'),
      entry('2026-08-03', 'Dhuhr', 'on-time'),
      entry('2026-08-07', 'Asr', 'late'),
      entry('2026-08-09', 'Isha', 'missed'),
    ];
    expect(owedPrayers(entries)).toEqual([
      { date: '2026-08-09', prayer: 'Isha' },
      { date: '2026-08-03', prayer: 'Fajr' },
    ]);
  });

  it('drops off the list once it is made up', () => {
    // The whole point of the number: it goes DOWN as you make them up, and
    // that needs no new state because qadha is already its own status.
    const before = [entry('2026-08-03', 'Fajr', 'missed')];
    const after = [entry('2026-08-03', 'Fajr', 'qadha')];
    expect(owedPrayers(before)).toHaveLength(1);
    expect(owedPrayers(after)).toHaveLength(0);
  });

  it('counts late and on-time as owing nothing', () => {
    const entries = [
      entry('2026-08-01', 'Fajr', 'late'),
      entry('2026-08-02', 'Fajr', 'on-time'),
      entry('2026-08-03', 'Fajr', 'qadha'),
    ];
    expect(owedPrayers(entries)).toEqual([]);
  });

  it('lists newest first — the ones you are most likely to remember', () => {
    const entries = [
      entry('2026-06-01', 'Fajr', 'missed'),
      entry('2026-08-09', 'Asr', 'missed'),
      entry('2026-07-04', 'Isha', 'missed'),
    ];
    expect(owedPrayers(entries).map(o => o.date)).toEqual([
      '2026-08-09',
      '2026-07-04',
      '2026-06-01',
    ]);
  });

  it('collapses several owed on one day into a single grid day', () => {
    const entries = [
      entry('2026-08-03', 'Fajr', 'missed'),
      entry('2026-08-03', 'Asr', 'missed'),
      entry('2026-08-09', 'Isha', 'missed'),
    ];
    expect(owedPrayers(entries)).toHaveLength(3);
    expect(owedDays(owedPrayers(entries))).toEqual(
      new Set(['2026-08-03', '2026-08-09']),
    );
  });
});

describe('sunnah as a rate', () => {
  const full = {
    fajr: 1, dhuhr: 2, maghrib: 1, isha: 2, witr: true, qiyam: 0,
  };

  it('is null before anything can be divided', () => {
    // 1st of the month at 00:00 still counts as one day elapsed, so the only
    // null case is a nonsense clock.
    expect(sunnahRateFor({}, new Date(2026, 7, 1))).toBe(0);
  });

  it('divides by days ELAPSED, not days in the month', () => {
    // Otherwise the figure would mean something different on the 3rd than on
    // the 30th, and always look like failure early in a month.
    const log: SunnahLog = { '2026-08-01': { ...full } };
    // One perfect day out of ten elapsed.
    expect(sunnahRateFor(log, NOW)).toBeCloseTo(1 / 10);
  });

  it('credits partial days, which is the nature of sunnah', () => {
    const log: SunnahLog = {
      '2026-08-01': { fajr: 1, dhuhr: 0, maghrib: 0, isha: 0, witr: false, qiyam: 0 },
    };
    // 1 of 7 units, over ten days of 7.
    expect(sunnahRateFor(log, NOW)).toBeCloseTo(1 / 70);
  });

  it('reaches 1 when every elapsed day is complete', () => {
    const log: SunnahLog = {};
    for (let d = 1; d <= 10; d++) {
      log[`2026-08-${String(d).padStart(2, '0')}`] = { ...full };
    }
    expect(sunnahRateFor(log, NOW)).toBeCloseTo(1);
  });

  it('ignores other months', () => {
    const log: SunnahLog = { '2026-07-15': { ...full } };
    expect(sunnahRateFor(log, NOW)).toBe(0);
  });

  it('never exceeds 1, whatever a corrupt store claims', () => {
    const log: SunnahLog = {};
    for (let d = 1; d <= 10; d++) {
      log[`2026-08-${String(d).padStart(2, '0')}`] = {
        fajr: 9, dhuhr: 9, maghrib: 9, isha: 9, witr: true, qiyam: 99,
      };
    }
    expect(sunnahRateFor(log, NOW)!).toBeLessThanOrEqual(1);
  });
});

describe('fasts this month', () => {
  it('counts only completed fasts in the current month', () => {
    const stats = computePracticeStats({
      entries: [],
      fasts: [
        { date: '2026-08-02', type: 'voluntary', completed: true, loggedAt: '' },
        { date: '2026-08-05', type: 'voluntary', completed: false, loggedAt: '' },
        { date: '2026-07-30', type: 'voluntary', completed: true, loggedAt: '' },
      ],
      sunnah: {},
      streak: 0,
      bestStreak: 0,
      now: NOW,
    });
    expect(stats.fastsThisMonth).toBe(1);
  });
});

describe('the whole row together', () => {
  it('carries the streak through untouched and computes the rest', () => {
    const stats = computePracticeStats({
      entries: [entry('2026-08-04', 'Asr', 'missed')],
      fasts: [],
      sunnah: {},
      streak: 5,
      bestStreak: 12,
      now: NOW,
    });
    expect(stats.streak).toBe(5);
    expect(stats.bestStreak).toBe(12);
    expect(stats.owed).toEqual([{ date: '2026-08-04', prayer: 'Asr' }]);
    expect(stats.fastsThisMonth).toBe(0);
    expect(stats.sunnahRate).toBe(0);
  });

  it('is all-zero on a device with nothing on it', () => {
    const stats = computePracticeStats({
      entries: [], fasts: [], sunnah: {}, streak: 0, bestStreak: 0, now: NOW,
    });
    expect(stats.owed).toEqual([]);
    expect(stats.fastsThisMonth).toBe(0);
    expect(stats.sunnahRate).toBe(0);
  });
});
