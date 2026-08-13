import {
  applyBackfill,
  dayKeysBetween,
  lastFillableDay,
  planBackfill,
} from '../src/journal/backfill';
import { earliestKnownDay } from '../src/journal/installDate';
import {
  getEntryStatus,
  upsertEntry,
  type JournalEntry,
} from '../src/journal/journal';

const NOW = new Date(2026, 7, 10, 15, 0, 0); // Mon 10 Aug 2026, afternoon

function withEntry(
  entries: JournalEntry[],
  date: string,
  prayer: 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha',
  status: 'on-time' | 'missed' = 'on-time',
): JournalEntry[] {
  return upsertEntry(entries, date, prayer, status, NOW);
}

describe('dayKeysBetween', () => {
  test('is inclusive at both ends', () => {
    expect(dayKeysBetween('2026-08-08', '2026-08-10')).toEqual([
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
    ]);
  });

  test('is empty when the range is backwards', () => {
    expect(dayKeysBetween('2026-08-10', '2026-08-08')).toEqual([]);
  });

  test('crosses a month boundary', () => {
    expect(dayKeysBetween('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  test('crosses the spring DST boundary without skipping a day', () => {
    // 29 March 2026 is when most of Europe springs forward. A midnight
    // anchor lands on an hour that does not exist and rolls the date.
    const keys = dayKeysBetween('2026-03-28', '2026-03-31');
    expect(keys).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
    ]);
  });

  test('crosses the autumn DST boundary without repeating a day', () => {
    const keys = dayKeysBetween('2026-10-24', '2026-10-27');
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('2026-10-25');
  });
});

describe('lastFillableDay', () => {
  test('is yesterday — today still has prayers that have not happened', () => {
    expect(lastFillableDay(NOW)).toBe('2026-08-09');
  });
});

describe('planBackfill', () => {
  test('counts every day and prayer it would write', () => {
    const plan = planBackfill([], '2026-08-07', NOW);
    expect(plan.from).toBe('2026-08-07');
    expect(plan.to).toBe('2026-08-09');
    expect(plan.days).toBe(3);
    expect(plan.prayers).toBe(15);
  });

  test('skips days that are already complete, and starts at the first gap', () => {
    let entries: JournalEntry[] = [];
    for (const p of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const) {
      entries = withEntry(entries, '2026-08-07', p);
    }
    const plan = planBackfill(entries, '2026-08-07', NOW);
    expect(plan.from).toBe('2026-08-08');
    expect(plan.days).toBe(2);
    expect(plan.prayers).toBe(10);
  });

  test('counts only the missing prayers of a partly logged day', () => {
    const entries = withEntry([], '2026-08-08', 'Asr', 'missed');
    const plan = planBackfill(entries, '2026-08-08', NOW);
    expect(plan.days).toBe(2);
    expect(plan.prayers).toBe(9);
  });

  test('reports nothing to do when the install date is today', () => {
    expect(planBackfill([], '2026-08-10', NOW)).toEqual({
      from: null,
      to: null,
      days: 0,
      prayers: 0,
    });
  });

  test('reports nothing to do when every earlier day is full', () => {
    let entries: JournalEntry[] = [];
    for (const d of ['2026-08-08', '2026-08-09']) {
      for (const p of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const) {
        entries = withEntry(entries, d, p);
      }
    }
    expect(planBackfill(entries, '2026-08-08', NOW).days).toBe(0);
  });
});

describe('applyBackfill', () => {
  test('fills every prayer from the install day to yesterday', () => {
    const next = applyBackfill([], '2026-08-07', NOW);
    expect(next).toHaveLength(15);
    expect(getEntryStatus(next, '2026-08-07', 'Fajr')).toBe('on-time');
    expect(getEntryStatus(next, '2026-08-09', 'Isha')).toBe('on-time');
  });

  test('NEVER writes today — it still contains prayers that have not happened', () => {
    const next = applyBackfill([], '2026-08-07', NOW);
    expect(getEntryStatus(next, '2026-08-10', 'Fajr')).toBeNull();
  });

  test('never writes tomorrow either', () => {
    const next = applyBackfill([], '2026-08-07', NOW);
    expect(getEntryStatus(next, '2026-08-11', 'Fajr')).toBeNull();
  });

  test('leaves a deliberate "missed" exactly as it was', () => {
    const entries = withEntry([], '2026-08-08', 'Asr', 'missed');
    const next = applyBackfill(entries, '2026-08-07', NOW);
    expect(getEntryStatus(next, '2026-08-08', 'Asr')).toBe('missed');
    expect(getEntryStatus(next, '2026-08-08', 'Fajr')).toBe('on-time');
  });

  test('returns the same array when there is nothing to add', () => {
    const entries = applyBackfill([], '2026-08-07', NOW);
    expect(applyBackfill(entries, '2026-08-07', NOW)).toBe(entries);
  });

  test('does nothing when the app was installed today', () => {
    const entries: JournalEntry[] = [];
    expect(applyBackfill(entries, '2026-08-10', NOW)).toBe(entries);
  });
});

describe('earliestKnownDay', () => {
  test('prefers the platform install time when it is the oldest', () => {
    expect(
      earliestKnownDay({
        nativeInstallMs: new Date(2025, 10, 3, 9, 0, 0).getTime(),
        firstSeen: '2026-08-01',
        earliestEntry: '2026-07-01',
        now: NOW,
      }),
    ).toBe('2025-11-03');
  });

  test('a restored backup older than the install wins — it is evidence too', () => {
    expect(
      earliestKnownDay({
        nativeInstallMs: new Date(2026, 7, 1).getTime(),
        firstSeen: '2026-08-01',
        earliestEntry: '2024-02-20',
        now: NOW,
      }),
    ).toBe('2024-02-20');
  });

  test('falls back to the first-seen stamp where there is no native value', () => {
    expect(
      earliestKnownDay({
        nativeInstallMs: null,
        firstSeen: '2026-06-15',
        now: NOW,
      }),
    ).toBe('2026-06-15');
  });

  test('with nothing known at all it claims only today, never earlier', () => {
    expect(earliestKnownDay({ now: NOW })).toBe('2026-08-10');
  });
});
