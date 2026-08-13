/**
 * The backfill button writes hundreds of journal entries from one tap, and
 * the journal cannot be re-derived from anywhere: lose it and the user's
 * record of their own prayers is gone.
 *
 * So this file is not about whether the feature works — that is next door.
 * It is about the one thing it must never do, enumerated: every shape of
 * existing data, every corrupt input, every adversarial ordering, and a
 * randomised sweep for the cases nobody thought to name.
 */
import {
  applyBackfill,
  assertNoDataLoss,
  dayKeysBetween,
  isDayKey,
  MAX_BACKFILL_DAYS,
  planBackfill,
} from '../src/journal/backfill';
import { earliestKnownDay } from '../src/journal/installDate';
import {
  getEntryStatus,
  setEntryNote,
  upsertEntry,
  type JournalEntry,
  type JournalPrayer,
  type JournalStatus,
} from '../src/journal/journal';

const NOW = new Date(2026, 7, 10, 15, 0, 0); // Mon 10 Aug 2026
const PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const STATUSES: JournalStatus[] = ['on-time', 'late', 'missed', 'qadha'];

/** Deep copy, so a test can compare against what was there BEFORE. */
function snapshot(entries: JournalEntry[]): JournalEntry[] {
  return entries.map(e => ({ ...e }));
}

/** Every entry in `before` is still present, byte for byte, in `after`. */
function expectPreserved(before: JournalEntry[], after: JournalEntry[]) {
  for (const old of before) {
    const kept = after.find(
      e => e.date === old.date && e.prayer === old.prayer,
    );
    expect(kept).toBeDefined();
    expect(kept).toEqual(old);
  }
}

describe('applyBackfill never destroys what is already there', () => {
  test('every status survives, on every prayer, on every day in range', () => {
    // The exhaustive case: one entry of each status on each prayer across
    // the whole range, so no combination is left untested.
    let entries: JournalEntry[] = [];
    const days = ['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'];
    days.forEach((d, di) => {
      PRAYERS.forEach((p, pi) => {
        entries = upsertEntry(entries, d, p, STATUSES[(di + pi) % 4], NOW);
      });
    });
    const before = snapshot(entries);
    const after = applyBackfill(entries, '2026-08-01', NOW);
    expectPreserved(before, after);
    expect(after.length).toBeGreaterThan(before.length);
  });

  test('a private note survives — upsertEntry would have dropped it', () => {
    // setEntryNote creates an entry with a default status, and upsertEntry
    // rebuilds an entry WITHOUT its note. The guard against writing into an
    // occupied cell is the only thing standing between the two.
    let entries = setEntryNote([], '2026-08-06', 'Asr', 'travelling', NOW);
    entries = setEntryNote(entries, '2026-08-07', 'Fajr', 'at the masjid', NOW);
    const before = snapshot(entries);
    const after = applyBackfill(entries, '2026-08-01', NOW);
    expectPreserved(before, after);
    expect(
      after.find(e => e.date === '2026-08-06' && e.prayer === 'Asr')?.note,
    ).toBe('travelling');
  });

  test('loggedAt timestamps are not rewritten', () => {
    const entries = upsertEntry(
      [],
      '2026-08-06',
      'Isha',
      'late',
      new Date(2026, 7, 6, 22, 14, 0),
    );
    const before = snapshot(entries);
    const after = applyBackfill(entries, '2026-08-01', NOW);
    expectPreserved(before, after);
  });

  test('days OUTSIDE the range are untouched — before it', () => {
    const entries = upsertEntry([], '2024-01-01', 'Fajr', 'missed', NOW);
    const before = snapshot(entries);
    const after = applyBackfill(entries, '2026-08-08', NOW);
    expectPreserved(before, after);
  });

  test('days outside the range are untouched — today and after it', () => {
    let entries = upsertEntry([], '2026-08-10', 'Fajr', 'late', NOW);
    entries = upsertEntry(entries, '2026-08-11', 'Fajr', 'qadha', NOW);
    const before = snapshot(entries);
    const after = applyBackfill(entries, '2026-08-01', NOW);
    expectPreserved(before, after);
    // And nothing new was invented there either.
    expect(after.filter(e => e.date === '2026-08-10')).toHaveLength(1);
    expect(after.filter(e => e.date === '2026-08-11')).toHaveLength(1);
  });

  test('running it twice changes nothing the second time', () => {
    const once = applyBackfill([], '2026-08-01', NOW);
    const before = snapshot(once);
    const twice = applyBackfill(once, '2026-08-01', NOW);
    expect(twice).toBe(once);
    expectPreserved(before, twice);
  });

  test('a full journal comes back identical, not rebuilt', () => {
    let entries: JournalEntry[] = [];
    for (const d of dayKeysBetween('2026-08-01', '2026-08-09')) {
      for (const p of PRAYERS)
        entries = upsertEntry(entries, d, p, 'late', NOW);
    }
    const before = snapshot(entries);
    const after = applyBackfill(entries, '2026-08-01', NOW);
    expect(after).toBe(entries);
    expectPreserved(before, after);
  });

  test('no cell is ever duplicated', () => {
    let entries = upsertEntry([], '2026-08-06', 'Asr', 'missed', NOW);
    entries = upsertEntry(entries, '2026-08-07', 'Isha', 'qadha', NOW);
    const after = applyBackfill(entries, '2026-08-01', NOW);
    const seen = new Set<string>();
    for (const e of after) {
      const key = `${e.date} ${e.prayer}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('the entry count only ever grows', () => {
    let entries: JournalEntry[] = [];
    for (let i = 0; i < 9; i++) {
      entries = upsertEntry(
        entries,
        `2026-08-0${i + 1}`,
        PRAYERS[i % 5],
        STATUSES[i % 4],
        NOW,
      );
    }
    const after = applyBackfill(entries, '2026-08-01', NOW);
    expect(after.length).toBeGreaterThanOrEqual(entries.length);
  });

  test('a randomised sweep never loses anything', () => {
    // Deterministic pseudo-random: the same 200 shapes every run, so a
    // failure is reproducible rather than a rumour.
    let seed = 20260810;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 200; round++) {
      let entries: JournalEntry[] = [];
      const count = Math.floor(rand() * 12);
      for (let i = 0; i < count; i++) {
        const day = 1 + Math.floor(rand() * 12); // spans past today
        const date = `2026-08-${String(day).padStart(2, '0')}`;
        const prayer = PRAYERS[Math.floor(rand() * PRAYERS.length)];
        const status = STATUSES[Math.floor(rand() * STATUSES.length)];
        entries = upsertEntry(entries, date, prayer, status, NOW);
        if (rand() > 0.7) {
          entries = setEntryNote(entries, date, prayer, `note ${i}`, NOW);
        }
      }
      const before = snapshot(entries);
      const startDay = 1 + Math.floor(rand() * 9);
      const after = applyBackfill(
        entries,
        `2026-08-${String(startDay).padStart(2, '0')}`,
        NOW,
      );
      expectPreserved(before, after);
    }
  });
});

describe('applyBackfill refuses absurd or corrupt ranges', () => {
  test.each([
    ['empty string', ''],
    ['not a date', 'yesterday'],
    ['wrong shape', '10-08-2026'],
    ['partial', '2026-08'],
    ['whitespace', '  2026-08-01 '],
  ])('does nothing for a start date that is %s', (_label, value) => {
    const entries = upsertEntry([], '2026-08-06', 'Asr', 'missed', NOW);
    expect(applyBackfill(entries, value, NOW)).toBe(entries);
  });

  test('a start date in the future writes nothing', () => {
    const entries: JournalEntry[] = [];
    expect(applyBackfill(entries, '2027-01-01', NOW)).toBe(entries);
  });

  test('a start date of today writes nothing — today is never filled', () => {
    const entries: JournalEntry[] = [];
    expect(applyBackfill(entries, '2026-08-10', NOW)).toBe(entries);
  });

  test('an absurdly old start date is capped, and the cap is reported', () => {
    const plan = planBackfill([], '1990-01-01', NOW);
    expect(plan.capped).toBe(true);
    expect(plan.days).toBeLessThanOrEqual(MAX_BACKFILL_DAYS);
    // Capped, but still an honest range: it never claims to reach 1990.
    expect(plan.from).not.toBe('1990-01-01');
  });

  test('the cap is not reported for an ordinary range', () => {
    expect(planBackfill([], '2026-08-01', NOW).capped).toBe(false);
  });
});

describe('assertNoDataLoss is the last line, and it actually catches things', () => {
  const original = upsertEntry([], '2026-08-06', 'Asr', 'missed', NOW);

  test('passes when everything is preserved and more is added', () => {
    const grown = upsertEntry(original, '2026-08-07', 'Fajr', 'on-time', NOW);
    expect(() => assertNoDataLoss(original, grown)).not.toThrow();
  });

  test('throws when an entry was dropped', () => {
    expect(() => assertNoDataLoss(original, [])).toThrow(/drop/);
  });

  test('throws when a status was changed under the same cell', () => {
    const altered = original.map(e => ({ ...e, status: 'on-time' as const }));
    expect(() => assertNoDataLoss(original, altered)).toThrow(/alter/);
  });

  test('throws when a note was dropped', () => {
    const noted = setEntryNote(original, '2026-08-06', 'Asr', 'kept', NOW);
    const stripped = noted.map(e => ({ ...e, note: undefined }));
    expect(() => assertNoDataLoss(noted, stripped)).toThrow(/alter/);
  });

  test('throws when loggedAt was rewritten', () => {
    const touched = original.map(e => ({
      ...e,
      loggedAt: '2020-01-01T00:00:00.000Z',
    }));
    expect(() => assertNoDataLoss(original, touched)).toThrow(/alter/);
  });

  test('a swap of equal length does not sneak past a length check', () => {
    const swapped = upsertEntry([], '2026-08-06', 'Isha', 'missed', NOW);
    expect(swapped).toHaveLength(original.length);
    expect(() => assertNoDataLoss(original, swapped)).toThrow();
  });
});

describe('the start date is the install date, never an update date', () => {
  const INSTALLED = new Date(2025, 10, 3, 9, 0, 0).getTime(); // 3 Nov 2025
  const UPDATED_TODAY = '2026-08-10';

  test('the platform install date beats a first-run stamp written on update day', () => {
    // The reported worry, exactly: a year-old user updates, the stamp says
    // today, and the button must still offer the year.
    expect(
      earliestKnownDay({
        nativeInstallMs: INSTALLED,
        firstSeen: UPDATED_TODAY,
        now: NOW,
      }),
    ).toBe('2025-11-03');
  });

  test('the stamp is used ONLY when the platform said nothing', () => {
    expect(
      earliestKnownDay({
        nativeInstallMs: null,
        firstSeen: '2026-06-15',
        now: NOW,
      }),
    ).toBe('2026-06-15');
  });

  test('a restored backup older than the install still counts', () => {
    expect(
      earliestKnownDay({
        nativeInstallMs: INSTALLED,
        firstSeen: UPDATED_TODAY,
        earliestEntry: '2024-02-20',
        now: NOW,
      }),
    ).toBe('2024-02-20');
  });

  test('a future install time is refused rather than believed', () => {
    expect(
      earliestKnownDay({
        nativeInstallMs: new Date(2030, 0, 1).getTime(),
        firstSeen: '2026-06-15',
        now: NOW,
      }),
    ).toBe('2026-06-15');
  });

  test('a corrupt stamp is ignored, not parsed', () => {
    expect(
      earliestKnownDay({ nativeInstallMs: null, firstSeen: 'soon', now: NOW }),
    ).toBe('2026-08-10');
  });

  test('with nothing known it claims today, which fills nothing', () => {
    const from = earliestKnownDay({ now: NOW });
    expect(from).toBe('2026-08-10');
    expect(applyBackfill([], from, NOW)).toEqual([]);
  });
});

describe('isDayKey', () => {
  test.each([
    ['2026-08-10', true],
    ['2026-8-10', false],
    ['', false],
    ['tomorrow', false],
    [null, false],
    [undefined, false],
    [20260810, false],
  ])('%p → %p', (value, expected) => {
    expect(isDayKey(value)).toBe(expected);
  });
});

describe('what the user is promised is what is written', () => {
  test('the plan’s count matches the entries actually added', () => {
    let entries = upsertEntry([], '2026-08-06', 'Asr', 'missed', NOW);
    entries = setEntryNote(entries, '2026-08-07', 'Fajr', 'note', NOW);
    const plan = planBackfill(entries, '2026-08-01', NOW);
    const after = applyBackfill(entries, '2026-08-01', NOW);
    expect(after.length - entries.length).toBe(plan.prayers);
  });

  test('the plan’s day count matches the days actually touched', () => {
    const entries = upsertEntry([], '2026-08-06', 'Asr', 'missed', NOW);
    const plan = planBackfill(entries, '2026-08-01', NOW);
    const after = applyBackfill(entries, '2026-08-01', NOW);
    const added = after.filter(a => !entries.includes(a));
    expect(new Set(added.map(e => e.date)).size).toBe(plan.days);
  });

  test('the plan’s range does not claim days it will not fill', () => {
    // Yesterday is already complete, so the range must stop before it.
    let entries: JournalEntry[] = [];
    for (const p of PRAYERS) {
      entries = upsertEntry(entries, '2026-08-09', p, 'on-time', NOW);
    }
    const plan = planBackfill(entries, '2026-08-07', NOW);
    expect(plan.from).toBe('2026-08-07');
    expect(plan.to).toBe('2026-08-08');
  });

  test('everything the plan promised is on-time, and nothing else moved', () => {
    const entries = upsertEntry([], '2026-08-06', 'Asr', 'missed', NOW);
    const after = applyBackfill(entries, '2026-08-05', NOW);
    expect(getEntryStatus(after, '2026-08-06', 'Asr')).toBe('missed');
    expect(getEntryStatus(after, '2026-08-06', 'Fajr')).toBe('on-time');
    expect(getEntryStatus(after, '2026-08-05', 'Isha')).toBe('on-time');
  });
});
