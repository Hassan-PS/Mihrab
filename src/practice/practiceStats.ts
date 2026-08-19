/**
 * The four numbers above the graph.
 *
 * They exist because the card was being asked to answer two different
 * questions with one mark. A square carrying fill depth, a fast ring, a
 * sunnah line, a missed dot, a qiyam dot and a selection outline is six
 * encodings on 18 points — which is why its legend needed two rows, and why
 * "how am I doing" was something you had to decode rather than read.
 *
 * Totals are not a heatmap's job. They are four headline numbers, so they
 * should be four numbers. The grid keeps the per-day marks, which are the
 * thing totals cannot tell you: WHICH days.
 *
 * Pure on purpose — no storage, no clock beyond what is handed in — so the
 * arithmetic can be tested without a device.
 */
import type { JournalEntry } from '../journal/journal';
import type { FastEntry } from '../fasting/fasting';
import {
  dayAt,
  sunnahCount,
  SUNNAH_TOTAL,
  type SunnahLog,
} from '../journal/sunnah';

/** One prayer still owed: recorded as missed and not yet made up. */
export type OwedPrayer = { date: string; prayer: JournalEntry['prayer'] };

export type PracticeStats = {
  /** Consecutive all-on-time days, ending today or yesterday. */
  streak: number;
  /** The longest such run anywhere in the journal. */
  bestStreak: number;
  /**
   * Sunnah kept this month, 0…1 — or null before the month has any day
   * worth dividing by.
   */
  sunnahRate: number | null;
  /** Days fasted in the current calendar month. */
  fastsThisMonth: number;
  /**
   * Every prayer still owed, newest first.
   *
   * A LIST, not a count, because the point of the number is to act on it.
   * Telling someone they owe three prayers and leaving them to find three
   * 5pt dots among ninety-one squares is most of a feature.
   */
  owed: OwedPrayer[];
};

function ym(date: string): string {
  return date.slice(0, 7);
}

function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Days of the current month that have already happened, including today. */
function daysElapsed(now: Date): number {
  return now.getDate();
}

/**
 * Sunnah as a RATE, not a streak.
 *
 * A sunnah streak means every sunnah and Witr, every day, unbroken — so
 * demanding that most people would read zero forever, which is exactly the
 * discouragement the prayer streak was just fixed for. Sunnah is voluntary
 * and partial by nature: someone praying four of seven has done something,
 * and a number that calls that nothing is not describing their practice.
 *
 * The denominator is days ELAPSED this month, not days in the month, so the
 * figure means the same thing on the 3rd as on the 30th.
 */
export function sunnahRateFor(
  sunnah: SunnahLog,
  now: Date = new Date(),
): number | null {
  const elapsed = daysElapsed(now);
  if (elapsed <= 0 || SUNNAH_TOTAL <= 0) return null;
  const month = monthKey(now);
  let kept = 0;
  for (let d = 1; d <= elapsed; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    kept += sunnahCount(dayAt(sunnah, key));
  }
  const possible = elapsed * SUNNAH_TOTAL;
  return possible > 0 ? kept / possible : null;
}

/**
 * Everything still owed, newest first.
 *
 * `missed` and `qadha` are already separate statuses, so this needs no new
 * state: an entry sitting at `missed` is owed, and changing it to `qadha`
 * takes it off the list. The number goes down as they are made up, which is
 * the whole reason to show it.
 */
export function owedPrayers(entries: JournalEntry[]): OwedPrayer[] {
  const out: OwedPrayer[] = [];
  for (const e of entries) {
    if (e.status === 'missed') out.push({ date: e.date, prayer: e.prayer });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function computePracticeStats(input: {
  entries: JournalEntry[];
  fasts: FastEntry[];
  sunnah: SunnahLog;
  streak: number;
  bestStreak: number;
  now?: Date;
}): PracticeStats {
  const now = input.now ?? new Date();
  const month = monthKey(now);
  return {
    streak: input.streak,
    bestStreak: input.bestStreak,
    sunnahRate: sunnahRateFor(input.sunnah, now),
    fastsThisMonth: input.fasts.filter(f => f.completed && ym(f.date) === month)
      .length,
    owed: owedPrayers(input.entries),
  };
}

/** The set of days carrying at least one owed prayer — for the grid's emphasis. */
export function owedDays(owed: OwedPrayer[]): Set<string> {
  return new Set(owed.map(o => o.date));
}
