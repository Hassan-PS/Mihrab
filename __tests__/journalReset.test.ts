/**
 * Undoing a log entry, and having it stay undone — issue #13.
 *
 * The reporter filled three months by accident and could not get back. The
 * feature is a reset; the DESIGN is that the reset survives a sync round,
 * because `merge.ts` says out loud that nothing is ever deleted and an
 * absent row therefore carries no opinion at all. A delete that the other
 * phone quietly reverses is not a way out of anything, so the tests that
 * matter most here are the merge ones.
 */
import {
  clearEntry,
  clearRange,
  computeLongestStreak,
  computeStats,
  entriesForDate,
  getEntryStatus,
  isLogged,
  loggedDates,
  scoreByDay,
  upsertEntry,
  type JournalEntry,
} from '../src/journal/journal';
import { assertNoDataLoss } from '../src/journal/backfill';
import { planReset, resetPlans, scopeBounds } from '../src/journal/resetLog';
import { mergeJournal } from '../src/sync/merge';

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

function day(date: string, at = '2026-01-01T00:00:00.000Z'): JournalEntry[] {
  return PRAYERS.map(prayer => ({
    date,
    prayer,
    status: 'on-time' as const,
    loggedAt: at,
  }));
}

describe('clearing one prayer', () => {
  it('reads back as unlogged', () => {
    const before = day('2026-03-01');
    const after = clearEntry(before, '2026-03-01', 'Asr');
    expect(getEntryStatus(after, '2026-03-01', 'Asr')).toBeNull();
    expect(getEntryStatus(after, '2026-03-01', 'Fajr')).toBe('on-time');
  });

  it('leaves a tombstone rather than a gap', () => {
    // The gap is the bug: an absent row is not an opinion, and the other
    // device's copy wins the merge.
    const after = clearEntry(day('2026-03-01'), '2026-03-01', 'Asr');
    expect(after).toHaveLength(5);
    expect(after.find(e => e.prayer === 'Asr')?.status).toBe('cleared');
  });

  it('says nothing about a prayer nobody logged', () => {
    const before = day('2026-03-01').filter(e => e.prayer !== 'Isha');
    const after = clearEntry(before, '2026-03-01', 'Isha');
    expect(after).toBe(before);
  });

  it('does not re-stamp a cell that is already clear', () => {
    const once = clearEntry(day('2026-03-01'), '2026-03-01', 'Asr');
    expect(clearEntry(once, '2026-03-01', 'Asr')).toBe(once);
  });
});

describe('a cleared prayer, once two devices meet', () => {
  const original = day('2026-03-01', '2026-03-01T05:00:00.000Z');
  const cleared = clearEntry(
    original,
    '2026-03-01',
    'Asr',
    new Date('2026-03-02T09:00:00.000Z'),
  );

  it('stays cleared against a device that still has it', () => {
    // THE test. Before tombstones this returned the original entry and the
    // user's correction vanished on the next round.
    const merged = mergeJournal(cleared, original);
    expect(getEntryStatus(merged, '2026-03-01', 'Asr')).toBeNull();
  });

  it('is commutative — neither device is the primary', () => {
    const a = mergeJournal(cleared, original);
    const b = mergeJournal(original, cleared);
    expect(a).toEqual(b);
  });

  it('is idempotent — a second round changes nothing', () => {
    const once = mergeJournal(cleared, original);
    expect(mergeJournal(once, once)).toEqual(once);
    expect(mergeJournal(once, original)).toEqual(once);
  });

  it('still loses to a LATER re-log, which is the point of last-write-wins', () => {
    // Clearing is not a veto. Someone who clears on one phone and then logs
    // it again on the other must end up logged.
    const relogged = upsertEntry(
      original,
      '2026-03-01',
      'Asr',
      'late',
      new Date('2026-03-03T09:00:00.000Z'),
    );
    expect(getEntryStatus(mergeJournal(cleared, relogged), '2026-03-01', 'Asr')).toBe('late');
    expect(getEntryStatus(mergeJournal(relogged, cleared), '2026-03-01', 'Asr')).toBe('late');
  });
});

describe('clearing a range', () => {
  const journal = [
    ...day('2026-02-27'),
    ...day('2026-03-01'),
    ...day('2026-03-15'),
    ...day('2026-04-02'),
    ...day('2027-01-09'),
  ];

  it('clears a day and nothing else', () => {
    const after = clearRange(journal, '2026-03-01', '2026-03-01');
    expect(loggedDates(after)).toEqual([
      '2026-02-27',
      '2026-03-15',
      '2026-04-02',
      '2027-01-09',
    ]);
  });

  it('clears a month by its string bounds', () => {
    const { from, to } = scopeBounds('month', '2026-03-15');
    const after = clearRange(journal, from, to);
    expect(loggedDates(after)).toEqual(['2026-02-27', '2026-04-02', '2027-01-09']);
  });

  it('clears a year', () => {
    const { from, to } = scopeBounds('year', '2026-06-06');
    expect(loggedDates(clearRange(journal, from, to))).toEqual(['2027-01-09']);
  });

  it('clears everything', () => {
    const after = clearRange(journal, null, null);
    expect(loggedDates(after)).toEqual([]);
    // Still five rows a day, all tombstones — that is what survives a sync.
    expect(after).toHaveLength(journal.length);
    expect(after.every(e => !isLogged(e))).toBe(true);
  });

  it('returns the same array when there is nothing left to clear', () => {
    const once = clearRange(journal, null, null);
    expect(clearRange(once, null, null)).toBe(once);
  });

  it('handles a 30-day month without inventing a 31st', () => {
    const j = [...day('2026-04-30'), ...day('2026-05-01')];
    const { from, to } = scopeBounds('month', '2026-04-15');
    expect(loggedDates(clearRange(j, from, to))).toEqual(['2026-05-01']);
  });
});

describe('what a reset would cost, before it happens', () => {
  const journal = [...day('2026-03-01'), ...day('2026-03-15'), ...day('2026-04-02')];

  it('counts prayers and days for each scope', () => {
    const [dayPlan, month, year, all] = resetPlans(journal, '2026-03-15');
    expect(dayPlan).toMatchObject({ scope: 'day', prayers: 5, days: 1 });
    expect(month).toMatchObject({ scope: 'month', prayers: 10, days: 2 });
    expect(year).toMatchObject({ scope: 'year', prayers: 15, days: 3 });
    expect(all).toMatchObject({ scope: 'all', prayers: 15, days: 3 });
  });

  it('counts nothing once it has been cleared', () => {
    const after = clearRange(journal, null, null);
    expect(planReset(after, '2026-03-15', 'all').prayers).toBe(0);
  });

  it('agrees with what the write actually does', () => {
    // A confirmation that names a number the write disagrees with is worse
    // than naming none.
    for (const plan of resetPlans(journal, '2026-03-15')) {
      const after = clearRange(journal, plan.from, plan.to);
      const removed = journal.filter(isLogged).length - after.filter(isLogged).length;
      expect(removed).toBe(plan.prayers);
    }
  });
});

describe('what the rest of the app sees', () => {
  it('does not count a tombstone as a logged prayer', () => {
    const after = clearEntry(day('2026-03-01'), '2026-03-01', 'Asr');
    expect(computeStats(after).total).toBe(4);
    expect(entriesForDate(after, '2026-03-01')).toHaveLength(4);
    expect(scoreByDay(after).get('2026-03-01')?.logged).toBe(4);
  });

  it('does not break a streak the user never broke', () => {
    // `isSpoiled` treats anything that is not on-time as a spoiler, so a
    // tombstone left in the day index would end a run at the day someone
    // corrected a mis-tap on.
    const journal = [
      ...day('2026-03-01'),
      ...day('2026-03-02'),
      ...day('2026-03-03'),
    ];
    expect(computeLongestStreak(journal)).toBe(3);
    const corrected = clearEntry(journal, '2026-03-02', 'Asr');
    // The day is no longer perfect — it has four prayers, not five — so the
    // run is 1, not 3, and above all not a crash or a 2 that depends on
    // which side of the gap you count from.
    expect(computeLongestStreak(corrected)).toBe(1);
  });

  it('lets the backfill write over a cleared cell', () => {
    // `assertNoDataLoss` refuses any change to an existing cell. Without an
    // exemption for tombstones the fill button would throw for anyone who
    // had ever used the reset.
    const before = clearEntry(day('2026-03-01'), '2026-03-01', 'Asr');
    const after = upsertEntry(before, '2026-03-01', 'Asr', 'missed');
    expect(() => assertNoDataLoss(before, after)).not.toThrow();
  });

  it('still refuses to alter a real entry', () => {
    const before = day('2026-03-01');
    const after = upsertEntry(before, '2026-03-01', 'Asr', 'missed');
    expect(() => assertNoDataLoss(before, after)).toThrow(/would alter/);
  });
});
