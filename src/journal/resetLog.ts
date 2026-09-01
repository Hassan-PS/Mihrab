/**
 * Undoing a log entry, a day, a month, a year, or all of it — issue #13.
 *
 * ── WHY THE COUNTING IS ITS OWN FILE ──────────────────────────────────
 *
 * The reporter back-filled three months by accident and could not get back.
 * The thing that makes a reset safe to offer is not the reset — it is being
 * able to say, before anything happens, exactly how much is about to go:
 * "412 prayers across 92 days". `fillMonths.ts` earned that lesson in the
 * other direction; this is the same discipline pointing the other way.
 *
 * So the plan is pure, testable and computed from the same array the write
 * will use. A confirmation that says a number the write then disagrees with
 * is worse than no number at all.
 *
 * ── WHAT IT DOES NOT TOUCH ────────────────────────────────────────────
 *
 * Prayers only. Fasts, sunnah and dhikr are separate stores and separate
 * records of separate acts, and "reset the prayer log" is not consent to
 * clear a Ramadan. The UI says so; this file simply never sees them.
 */
import { isLogged, type JournalEntry } from './journal';

/** How much of the log a reset covers. */
export type ResetScope = 'day' | 'month' | 'year' | 'all';

export const RESET_SCOPES: readonly ResetScope[] = ['day', 'month', 'year', 'all'];

export type ResetPlan = {
  scope: ResetScope;
  /** Inclusive bounds, or null for open — the shape `clearRange` takes. */
  from: string | null;
  to: string | null;
  /** Logged prayers this would clear. */
  prayers: number;
  /** Distinct days those prayers sit on. */
  days: number;
};

/** `YYYY-MM-DD` → the bounds of the scope containing it. */
export function scopeBounds(
  scope: ResetScope,
  date: string,
): { from: string | null; to: string | null } {
  if (scope === 'all') return { from: null, to: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  // An unparseable date can only come from a corrupted preference, and the
  // safe reading of it is "nothing", not "everything".
  if (!m) return { from: date, to: date };
  const [, year, month] = m;
  if (scope === 'day') return { from: date, to: date };
  if (scope === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` };
  // Month: the LAST DAY THAT EXISTS, not the 31st.
  //
  // The 31st would be correct for the clearing — these are string
  // comparisons and every real day of September sorts below "2026-09-31" —
  // but the bounds are also what the confirmation shows the user, and
  // `2026-09-31` parses as 1 October. The dialog said "September 1 –
  // October 1" over a button that clears a month. Seen on the simulator,
  // and the kind of thing only looking at it catches: every test passed.
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** What a reset of `scope` around `date` would actually clear. */
export function planReset(
  entries: JournalEntry[],
  date: string,
  scope: ResetScope,
): ResetPlan {
  const { from, to } = scopeBounds(scope, date);
  const days = new Set<string>();
  let prayers = 0;
  for (const e of entries) {
    if (!isLogged(e)) continue;
    if (from !== null && e.date < from) continue;
    if (to !== null && e.date > to) continue;
    prayers += 1;
    days.add(e.date);
  }
  return { scope, from, to, prayers, days: days.size };
}

/** Every scope, in widening order, so the sheet can show counts up front. */
export function resetPlans(
  entries: JournalEntry[],
  date: string,
): ResetPlan[] {
  return RESET_SCOPES.map(scope => planReset(entries, date, scope));
}
