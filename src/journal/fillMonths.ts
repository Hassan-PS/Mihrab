/**
 * "Fill the past three months" — the blunter sibling of the backfill button.
 *
 * The install-date button cannot help someone who prayed for years before
 * they ever heard of this app: it stops where the app's own history stops,
 * because that is the last point at which the app can claim to know
 * anything. This one deliberately reaches past it. The user is the
 * authority on their own prayers, and a record that refuses to accept what
 * they tell it is not being careful, it is being useless.
 *
 * What makes that safe is the OTHER end of the trade: this button is far
 * stricter about what it will touch.
 *
 * ── It only fills days that are completely untouched ──────────────────
 *
 * Not "empty prayer slots" — empty DAYS. A day is eligible only if it holds
 * nothing at all: no status on any of the five, no private note, no fast,
 * not one thing the user has ever said about it. One entry anywhere in the
 * day and the whole day is skipped, including the four slots that are
 * blank.
 *
 * That is stricter than it strictly needs to be, and deliberately so. A day
 * with Fajr marked and nothing else is a day the user was in the middle of
 * describing; filling the rest of it in behind them would put four claims
 * in their record that they did not make, next to one they did, with no way
 * afterwards to tell which was which. The existing per-day "Mark all on
 * time" already fills that day, at a tap, with the user looking at it.
 *
 * So: an untouched day is one this feature may write to, and a day with
 * anything in it belongs to the user. There is no case where this button
 * changes, replaces or removes something already recorded — not because
 * the code is careful about how it overwrites, but because it never
 * overwrites at all.
 */
import {
  assertNoDataLoss,
  dayKeyOf,
  dayKeysBetween,
  isDayKey,
  lastFillableDay,
} from './backfill';
import {
  isLogged,
  upsertEntry,
  type JournalEntry,
  type JournalPrayer,
} from './journal';
import type { FastEntry } from '../fasting/fasting';

const PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

/** How far back the button reaches. Three calendar months, not 90 days —
 *  "the past three months" is what the button says, and a month is not 30
 *  days in any calendar a user has. */
export const FILL_MONTHS = 3;

/**
 * `months` calendar months before `from`, with the day-of-month clamped to
 * one that exists.
 *
 * 31 May minus three months is 28 February, not 3 March: letting the Date
 * constructor roll a 31st into the next month would silently move the
 * window's start forward past days the button promised to cover.
 */
export function monthsBefore(from: Date, months: number): Date {
  const year = from.getFullYear();
  const month = from.getMonth() - months;
  const day = from.getDate();
  // Day 0 of the following month is the last day of the month we want.
  const daysInTarget = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, daysInTarget), 12, 0, 0, 0);
}

export type MonthFillWindow = { from: string; to: string };

/**
 * The window this button covers: three calendar months back from today, up
 * to yesterday. Today is excluded for the same reason it is everywhere else
 * here — it still holds prayers that have not happened.
 */
export function monthFillWindow(
  now: Date = new Date(),
  months: number = FILL_MONTHS,
): MonthFillWindow {
  return {
    from: dayKeyOf(monthsBefore(now, months)),
    to: lastFillableDay(now),
  };
}

/**
 * Has the user said ANYTHING about this day? A status, a note, a fast.
 *
 * Notes live on journal entries, so an entry-free day is also a note-free
 * day; fasts are their own store and are checked separately. Both are the
 * user's own words about that day and both make it off limits.
 */
export function dayIsUntouched(
  entries: JournalEntry[],
  fasts: FastEntry[],
  date: string,
): boolean {
  // A day whose entries have all been cleared has nothing recorded on it,
  // so it is untouched again and the fill may offer it. The reset in issue
  // #13 exists precisely so a day can go back to having nothing on it.
  for (const e of entries) if (e.date === date && isLogged(e)) return false;
  for (const f of fasts) if (f.date === date) return false;
  return true;
}

export type MonthFillPlan = {
  /** First day that would be written, or null when there is nothing to do. */
  from: string | null;
  /** Last day that would be written. */
  to: string | null;
  /** Untouched days that would be filled. */
  days: number;
  /** Prayers that would be recorded — always five per day, by definition. */
  prayers: number;
  /** Days in the window left alone because they already hold something.
   *  Shown to the user: it is the reassurance the button most needs. */
  skipped: number;
};

const EMPTY_PLAN: MonthFillPlan = {
  from: null,
  to: null,
  days: 0,
  prayers: 0,
  skipped: 0,
};

/** What the button would do, without doing it. */
export function planMonthFill(
  entries: JournalEntry[],
  fasts: FastEntry[],
  now: Date = new Date(),
  months: number = FILL_MONTHS,
): MonthFillPlan {
  const { from, to } = monthFillWindow(now, months);
  if (!isDayKey(from) || !isDayKey(to) || from > to) return EMPTY_PLAN;

  let first: string | null = null;
  let last: string | null = null;
  let days = 0;
  let skipped = 0;
  for (const key of dayKeysBetween(from, to)) {
    if (!dayIsUntouched(entries, fasts, key)) {
      skipped++;
      continue;
    }
    if (first === null) first = key;
    last = key;
    days++;
  }
  if (days === 0) return { ...EMPTY_PLAN, skipped };
  return {
    from: first,
    to: last,
    days,
    prayers: days * PRAYERS.length,
    skipped,
  };
}

/**
 * Fill every untouched day in the window with five on-time prayers.
 *
 * Returns the SAME array when there is nothing to do. Ends by proving it
 * added and never altered — see `assertNoDataLoss`, which throws rather
 * than let a bug here reach the user's journal.
 */
export function applyMonthFill(
  entries: JournalEntry[],
  fasts: FastEntry[],
  now: Date = new Date(),
  months: number = FILL_MONTHS,
): JournalEntry[] {
  const { from, to } = monthFillWindow(now, months);
  if (!isDayKey(from) || !isDayKey(to) || from > to) return entries;

  let next = entries;
  for (const key of dayKeysBetween(from, to)) {
    // Tested against the ORIGINAL journal, not against `next`. Days this
    // loop has already filled would otherwise stop looking untouched, which
    // would be harmless here but is the sort of thing that stops being
    // harmless the first time someone edits this loop.
    if (!dayIsUntouched(entries, fasts, key)) continue;
    for (const p of PRAYERS) next = upsertEntry(next, key, p, 'on-time', now);
  }
  assertNoDataLoss(entries, next);
  return next;
}
