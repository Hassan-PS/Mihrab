/**
 * "Fill the past three months" reaches back before the app was installed,
 * so the only thing keeping it honest is its rule about what it will touch:
 * a day with ANYTHING in it is not its business.
 *
 * This file tries to break that rule from every direction.
 */
import {
  applyMonthFill,
  dayIsUntouched,
  FILL_MONTHS,
  monthFillWindow,
  monthsBefore,
  planMonthFill,
} from '../src/journal/fillMonths';
import { dayKeysBetween, dayKeyOf } from '../src/journal/backfill';
import {
  getEntryStatus,
  setEntryNote,
  upsertEntry,
  type JournalEntry,
  type JournalPrayer,
  type JournalStatus,
} from '../src/journal/journal';
import { upsertFastEntry, type FastEntry } from '../src/fasting/fasting';

const NOW = new Date(2026, 7, 10, 15, 0, 0); // Mon 10 Aug 2026
const PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const STATUSES: JournalStatus[] = ['on-time', 'late', 'missed', 'qadha'];
const NO_FASTS: FastEntry[] = [];

function snapshot(entries: JournalEntry[]): JournalEntry[] {
  return entries.map(e => ({ ...e }));
}

function expectPreserved(before: JournalEntry[], after: JournalEntry[]) {
  for (const old of before) {
    const kept = after.find(
      e => e.date === old.date && e.prayer === old.prayer,
    );
    expect(kept).toEqual(old);
  }
}

function entriesFor(date: string): JournalEntry[] {
  let out: JournalEntry[] = [];
  for (const p of PRAYERS) out = upsertEntry(out, date, p, 'on-time', NOW);
  return out;
}

describe('the window', () => {
  test('is three calendar months back, ending yesterday', () => {
    expect(monthFillWindow(NOW)).toEqual({
      from: '2026-05-10',
      to: '2026-08-09',
    });
  });

  test('never includes today', () => {
    const { to } = monthFillWindow(NOW);
    expect(to).toBe('2026-08-09');
    expect(to < dayKeyOf(NOW)).toBe(true);
  });

  test('clamps the day of month rather than rolling into the next month', () => {
    // 31 May − 3 months is February, which has no 31st. Rolling would land
    // on 3 March and silently drop three days the button promised.
    expect(dayKeyOf(monthsBefore(new Date(2026, 4, 31, 12), 3))).toBe(
      '2026-02-28',
    );
  });

  test('handles a leap February', () => {
    expect(dayKeyOf(monthsBefore(new Date(2024, 4, 31, 12), 3))).toBe(
      '2024-02-29',
    );
  });

  test('crosses a year boundary', () => {
    expect(dayKeyOf(monthsBefore(new Date(2026, 0, 15, 12), 3))).toBe(
      '2025-10-15',
    );
  });

  test('covers roughly three months of days', () => {
    const { from, to } = monthFillWindow(NOW);
    const span = dayKeysBetween(from, to).length;
    expect(span).toBeGreaterThan(85);
    expect(span).toBeLessThan(95);
  });

  test('FILL_MONTHS is what the button says it is', () => {
    expect(FILL_MONTHS).toBe(3);
  });
});

describe('dayIsUntouched', () => {
  test('true for a day with nothing at all', () => {
    expect(dayIsUntouched([], NO_FASTS, '2026-07-01')).toBe(true);
  });

  test('false for a day with one status', () => {
    const entries = upsertEntry([], '2026-07-01', 'Asr', 'missed', NOW);
    expect(dayIsUntouched(entries, NO_FASTS, '2026-07-01')).toBe(false);
  });

  test('false for a day carrying only a note', () => {
    const entries = setEntryNote([], '2026-07-01', 'Fajr', 'travelling', NOW);
    expect(dayIsUntouched(entries, NO_FASTS, '2026-07-01')).toBe(false);
  });

  test('false for a day with only a fast', () => {
    const fasts = upsertFastEntry([], '2026-07-01', {
      type: 'voluntary',
      completed: true,
    });
    expect(dayIsUntouched([], fasts, '2026-07-01')).toBe(false);
  });

  test('false for a day with a fast that was NOT completed', () => {
    // Still the user saying something about that day.
    const fasts = upsertFastEntry([], '2026-07-01', {
      type: 'voluntary',
      completed: false,
    });
    expect(dayIsUntouched([], fasts, '2026-07-01')).toBe(false);
  });

  test('a neighbouring day being touched does not touch this one', () => {
    const entries = upsertEntry([], '2026-06-30', 'Asr', 'missed', NOW);
    expect(dayIsUntouched(entries, NO_FASTS, '2026-07-01')).toBe(true);
  });
});

describe('applyMonthFill never alters what the user recorded', () => {
  test('a day with a single logged prayer is skipped ENTIRELY', () => {
    const entries = upsertEntry([], '2026-07-01', 'Fajr', 'missed', NOW);
    const before = snapshot(entries);
    const after = applyMonthFill(entries, NO_FASTS, NOW);
    expectPreserved(before, after);
    // The four blanks stay blank: a half-described day belongs to whoever
    // was describing it.
    expect(getEntryStatus(after, '2026-07-01', 'Dhuhr')).toBeNull();
    expect(getEntryStatus(after, '2026-07-01', 'Fajr')).toBe('missed');
  });

  test('a day carrying only a note is skipped entirely', () => {
    const entries = setEntryNote([], '2026-07-02', 'Isha', 'unwell', NOW);
    const after = applyMonthFill(entries, NO_FASTS, NOW);
    expect(after.filter(e => e.date === '2026-07-02')).toHaveLength(1);
    expect(
      after.find(e => e.date === '2026-07-02' && e.prayer === 'Isha')?.note,
    ).toBe('unwell');
  });

  test('a day with only a fast is skipped entirely', () => {
    const fasts = upsertFastEntry([], '2026-07-03', {
      type: 'ramadan',
      completed: true,
    });
    const after = applyMonthFill([], fasts, NOW);
    expect(after.filter(e => e.date === '2026-07-03')).toHaveLength(0);
  });

  test('every status on every prayer survives untouched', () => {
    let entries: JournalEntry[] = [];
    const days = ['2026-06-01', '2026-06-02', '2026-07-15', '2026-08-01'];
    days.forEach((d, di) => {
      PRAYERS.forEach((p, pi) => {
        entries = upsertEntry(entries, d, p, STATUSES[(di + pi) % 4], NOW);
      });
    });
    const before = snapshot(entries);
    const after = applyMonthFill(entries, NO_FASTS, NOW);
    expectPreserved(before, after);
  });

  test('fills the untouched days around a touched one', () => {
    const entries = upsertEntry([], '2026-07-01', 'Fajr', 'missed', NOW);
    const after = applyMonthFill(entries, NO_FASTS, NOW);
    expect(getEntryStatus(after, '2026-06-30', 'Fajr')).toBe('on-time');
    expect(getEntryStatus(after, '2026-07-02', 'Fajr')).toBe('on-time');
  });

  test('fills five prayers on each day it does fill', () => {
    const after = applyMonthFill([], NO_FASTS, NOW);
    for (const p of PRAYERS) {
      expect(getEntryStatus(after, '2026-07-01', p)).toBe('on-time');
    }
  });

  test('never writes today', () => {
    const after = applyMonthFill([], NO_FASTS, NOW);
    expect(after.filter(e => e.date === '2026-08-10')).toHaveLength(0);
  });

  test('never writes tomorrow', () => {
    const after = applyMonthFill([], NO_FASTS, NOW);
    expect(after.filter(e => e.date === '2026-08-11')).toHaveLength(0);
  });

  test('never writes before the window', () => {
    const after = applyMonthFill([], NO_FASTS, NOW);
    expect(after.filter(e => e.date < '2026-05-10')).toHaveLength(0);
  });

  test('a second run adds nothing', () => {
    const once = applyMonthFill([], NO_FASTS, NOW);
    const twice = applyMonthFill(once, NO_FASTS, NOW);
    expect(twice).toBe(once);
  });

  test('leaves an already-full window completely alone', () => {
    let entries: JournalEntry[] = [];
    for (const d of dayKeysBetween('2026-05-10', '2026-08-09')) {
      entries = [...entries, ...entriesFor(d)];
    }
    const before = snapshot(entries);
    const after = applyMonthFill(entries, NO_FASTS, NOW);
    expect(after).toBe(entries);
    expectPreserved(before, after);
  });

  test('no cell is ever duplicated', () => {
    const entries = upsertEntry([], '2026-07-01', 'Fajr', 'missed', NOW);
    const after = applyMonthFill(entries, NO_FASTS, NOW);
    const seen = new Set<string>();
    for (const e of after) {
      const key = `${e.date} ${e.prayer}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('reaches back before the install date, which is the point of it', () => {
    // The install-date button stops at install; this one does not, because
    // the user prayed before they installed anything.
    const after = applyMonthFill([], NO_FASTS, NOW);
    expect(getEntryStatus(after, '2026-05-10', 'Fajr')).toBe('on-time');
  });

  test('a randomised sweep never alters an existing entry', () => {
    let seed = 3141592;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const window = dayKeysBetween('2026-05-10', '2026-08-09');
    for (let round = 0; round < 150; round++) {
      let entries: JournalEntry[] = [];
      let fasts: FastEntry[] = [];
      const touched = new Set<string>();
      const count = Math.floor(rand() * 10);
      for (let i = 0; i < count; i++) {
        const date = window[Math.floor(rand() * window.length)];
        touched.add(date);
        if (rand() > 0.35) {
          entries = upsertEntry(
            entries,
            date,
            PRAYERS[Math.floor(rand() * 5)],
            STATUSES[Math.floor(rand() * 4)],
            NOW,
          );
        } else if (rand() > 0.5) {
          entries = setEntryNote(
            entries,
            date,
            PRAYERS[Math.floor(rand() * 5)],
            'n',
            NOW,
          );
        } else {
          fasts = upsertFastEntry(fasts, date, {
            type: 'voluntary',
            completed: rand() > 0.5,
          });
        }
      }
      const before = snapshot(entries);
      const after = applyMonthFill(entries, fasts, NOW);
      expectPreserved(before, after);
      // And every touched day has exactly what it had — no more.
      for (const date of touched) {
        const wasFast = fasts.some(f => f.date === date);
        const had = before.filter(e => e.date === date);
        if (had.length > 0 || wasFast) {
          expect(after.filter(e => e.date === date)).toHaveLength(had.length);
        }
      }
    }
  });
});

describe('planMonthFill describes exactly what will happen', () => {
  test('the promised prayer count is what gets written', () => {
    const entries = upsertEntry([], '2026-07-01', 'Fajr', 'missed', NOW);
    const plan = planMonthFill(entries, NO_FASTS, NOW);
    const after = applyMonthFill(entries, NO_FASTS, NOW);
    expect(after.length - entries.length).toBe(plan.prayers);
  });

  test('the promised day count is what gets touched', () => {
    const entries = upsertEntry([], '2026-07-01', 'Fajr', 'missed', NOW);
    const plan = planMonthFill(entries, NO_FASTS, NOW);
    const after = applyMonthFill(entries, NO_FASTS, NOW);
    const added = after.filter(a => !entries.includes(a));
    expect(new Set(added.map(e => e.date)).size).toBe(plan.days);
  });

  test('always five prayers per day, by definition', () => {
    const plan = planMonthFill([], NO_FASTS, NOW);
    expect(plan.prayers).toBe(plan.days * 5);
  });

  test('counts the days it will leave alone', () => {
    let entries = upsertEntry([], '2026-07-01', 'Fajr', 'missed', NOW);
    entries = setEntryNote(entries, '2026-07-02', 'Isha', 'note', NOW);
    const fasts = upsertFastEntry([], '2026-07-03', {
      type: 'voluntary',
      completed: true,
    });
    expect(planMonthFill(entries, fasts, NOW).skipped).toBe(3);
  });

  test('reports nothing to do when every day is spoken for', () => {
    let entries: JournalEntry[] = [];
    for (const d of dayKeysBetween('2026-05-10', '2026-08-09')) {
      entries = upsertEntry(entries, d, 'Fajr', 'missed', NOW);
    }
    const plan = planMonthFill(entries, NO_FASTS, NOW);
    expect(plan.days).toBe(0);
    expect(plan.from).toBeNull();
    expect(plan.prayers).toBe(0);
    expect(plan.skipped).toBeGreaterThan(85);
  });

  test('the range names real days, not the window edges', () => {
    // First and last days of the window are taken, so the range must
    // report the untouched span inside it.
    let entries = upsertEntry([], '2026-05-10', 'Fajr', 'missed', NOW);
    entries = upsertEntry(entries, '2026-08-09', 'Fajr', 'missed', NOW);
    const plan = planMonthFill(entries, NO_FASTS, NOW);
    expect(plan.from).toBe('2026-05-11');
    expect(plan.to).toBe('2026-08-08');
  });
});

describe('the two fill buttons do not fight', () => {
  test('running the month fill after a per-day backfill adds nothing to those days', () => {
    // The install-date button filled 8 and 9 August; the month button must
    // now consider them spoken for.
    let entries = upsertEntry([], '2026-08-08', 'Fajr', 'on-time', NOW);
    entries = upsertEntry(entries, '2026-08-09', 'Isha', 'late', NOW);
    const before = snapshot(entries);
    const after = applyMonthFill(entries, NO_FASTS, NOW);
    expectPreserved(before, after);
    expect(after.filter(e => e.date === '2026-08-08')).toHaveLength(1);
    expect(after.filter(e => e.date === '2026-08-09')).toHaveLength(1);
  });
});
