/**
 * "I have been praying, I just started logging today."
 *
 * Someone who installs the app on their 200th consecutive day of praying
 * opens the Log and sees an empty wall of squares, and the record starts by
 * telling them something untrue. Filling that in one day at a time is a
 * hundred taps nobody performs, so it stays wrong, and a record that starts
 * wrong is one you stop keeping.
 *
 * One button fills every day from first launch up to yesterday. Not further
 * back than the app has existed on this phone, because that is the last
 * point at which the app has any standing to claim anything — beyond it we
 * would be inventing history rather than recording it.
 *
 * ── What it will not do ───────────────────────────────────────────────
 *
 * Today is never touched. Today has prayers in it that have not happened
 * yet, and the same rule that greys out an unarrived Isha applies here with
 * more force: this button writes hundreds of entries at once, and not one
 * of them may be a claim the user did not make.
 *
 * Already-recorded prayers are never overwritten. A day where Asr was
 * marked `missed` keeps it. The button means "the rest of it went fine".
 */
import {
  getEntryStatus,
  upsertEntry,
  type JournalEntry,
  type JournalPrayer,
} from './journal';

const PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

/** Local ISO day key. Local, not UTC: the journal is keyed on the day the
 *  user is living in, and UTC would shift the boundary for half the world. */
export function dayKeyOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * `YYYY-MM-DD` back to a Date, anchored at noon.
 *
 * Noon and not midnight, for the same reason the Log does it: adding a day
 * across a DST boundary can land on an hour that does not exist locally and
 * roll into the neighbouring day, which would make this skip 30 March or
 * repeat 26 October — once a year, in the countries least likely to be the
 * ones testing it.
 */
export function dateFromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** Every day key from `from` to `to`, inclusive. Empty if `from` is later. */
export function dayKeysBetween(from: string, to: string): string[] {
  if (from > to) return [];
  const keys: string[] = [];
  const cursor = dateFromDayKey(from);
  const end = dateFromDayKey(to);
  // Guard rather than trust: a corrupt or absurd start date would otherwise
  // spin here. Ten years of days is far more than this button is for.
  for (let i = 0; cursor <= end && i < 3700; i++) {
    keys.push(dayKeyOf(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** The day before `now`, as a key. The last day this button may fill. */
export function lastFillableDay(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return dayKeyOf(d);
}

export type BackfillPlan = {
  /** First day that would be written, or null when there is nothing to do. */
  from: string | null;
  /** Last day that would be written — always yesterday when `from` is set. */
  to: string | null;
  /** Days that would gain at least one entry. */
  days: number;
  /** Individual prayers that would be recorded. */
  prayers: number;
};

/**
 * What pressing the button would do, without doing it.
 *
 * The UI shows this before asking for confirmation, because "fill in 214
 * days" and "fill in 3 days" deserve different answers and the user is the
 * only one who can tell which this is.
 */
export function planBackfill(
  entries: JournalEntry[],
  installedOn: string,
  now: Date = new Date(),
): BackfillPlan {
  const to = lastFillableDay(now);
  const empty: BackfillPlan = { from: null, to: null, days: 0, prayers: 0 };
  if (!installedOn || installedOn > to) return empty;

  let days = 0;
  let prayers = 0;
  let first: string | null = null;
  for (const key of dayKeysBetween(installedOn, to)) {
    let missing = 0;
    for (const p of PRAYERS) if (!getEntryStatus(entries, key, p)) missing++;
    if (missing === 0) continue;
    if (first === null) first = key;
    days++;
    prayers += missing;
  }
  return days === 0 ? empty : { from: first, to, days, prayers };
}

/**
 * Fill every unrecorded prayer from `installedOn` to yesterday with
 * 'on-time'. Returns the SAME array when there is nothing to add, so the
 * caller can skip the write.
 */
export function applyBackfill(
  entries: JournalEntry[],
  installedOn: string,
  now: Date = new Date(),
): JournalEntry[] {
  const to = lastFillableDay(now);
  if (!installedOn || installedOn > to) return entries;
  let next = entries;
  for (const key of dayKeysBetween(installedOn, to)) {
    for (const p of PRAYERS) {
      if (!getEntryStatus(next, key, p)) {
        next = upsertEntry(next, key, p, 'on-time', now);
      }
    }
  }
  return next;
}
