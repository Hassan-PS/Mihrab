/**
 * TWO WAYS TO PACE A KHATMAH, and the arithmetic for the second one.
 *
 * A plan has always been a DURATION: "finish in thirty days", cut into
 * thirty equal portions when it is made, and the day number is the
 * reader's — the portion they have reached — never the calendar's. That
 * is the right model for someone who wants a rhythm, and nothing here
 * changes it.
 *
 * Issue #53 asks for the other one: "finish by the 30th". A DEADLINE is a
 * promise about a date, so the day number IS the calendar's, and the cut
 * cannot be made once and left: miss a day and what remains has one fewer
 * day to fit into. So the book is re-cut every day — what is still unread
 * over the days that are still left — and the reader is told the new
 * number rather than the count of days they missed.
 *
 * ── WHY THE DAY'S CUT IS PINNED AND NOT RECOMPUTED ────────────────────
 *
 * `unread / daysLeft` is the pace, but it cannot be asked twice in one
 * day. Read `r` of today's portion and the remainder falls to `unread-r`,
 * so the quota falls to `(unread-r)/D`, and what is left of today becomes
 * `(unread-r)/D` again — a day that recedes as you walk towards it, and
 * never ends. The cut is therefore taken ONCE, when the day opens, and
 * held for that day (`KhatmahPace`). Tomorrow asks again.
 *
 * ── AND WHY IT IS STORED RATHER THAN DERIVED ──────────────────────────
 *
 * The obvious pin is `dayStartAyahsRead`, which already records where
 * this device stood when the day began. It is deliberately NOT synced
 * (docs/sync-conflict-rules.md): it is a fact about one device's morning.
 * Two devices that first opened the app at different hours today would
 * pin different starting points and show different quotas for the same
 * day — the plan saying "14 pages today" on the phone and "9 pages today"
 * on the Mac. So a deadline plan keeps its own cut, and that one travels.
 *
 * Everything here is pure: the plan's fields in, numbers out. The writer
 * that pins the cut lives with the other khatmah writers in
 * `quranState.ts`, and the plan-shaped wrappers with the rest of the
 * portion maths.
 */
import { daysAway } from './khatmahDayWhen';

/** One day's reading, as inclusive ayah indices. */
export type KhatmahPace = {
  /** The day-key this cut belongs to — the store's key, not midnight's. */
  day: string;
  /** First ayah of the day's portion. */
  from: number;
  /** Last ayah of the day's portion. */
  to: number;
  /**
   * When it was cut, wall-clock ms. What lets two cuts of the same day
   * from two devices that had not synced be told apart on the merge —
   * see `pickPace`. Absent on a cut from a build before it.
   */
  at?: number;
};

/** `YYYY-MM-DD` as a local instant, taken at noon so no DST shift bites. */
export function deadlineInstant(deadline: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline);
  if (!m) return null;
  const at = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    12,
    0,
    0,
    0,
  );
  return Number.isFinite(at.getTime()) ? at.getTime() : null;
}

/**
 * Days from today to the deadline, today included — so a plan due today
 * has one day left, not none.
 *
 * Zero means the date has passed. That is a real state and not an error:
 * the reader is not shamed for it, the remaining reading simply becomes
 * today's (see `paceCut`), and the card offers a new date.
 */
export function daysToDeadline(deadline: string, now: number): number {
  const at = deadlineInstant(deadline);
  if (at === null) return 0;
  return Math.max(0, daysAway(at, now) + 1);
}

/**
 * The plan's whole length in days — the day it began to the day it is
 * due, inclusive. Used for "day 9 of 30", so it counts the same way.
 */
export function deadlineTotalDays(startedAt: number, deadline: string): number {
  const at = deadlineInstant(deadline);
  if (at === null) return 1;
  return Math.max(1, daysAway(at, startedAt) + 1);
}

/** Which day of the plan today is — the calendar's answer, clamped. */
export function deadlineDayNumber(
  startedAt: number,
  deadline: string,
  now: number,
): number {
  const total = deadlineTotalDays(startedAt, deadline);
  const left = daysToDeadline(deadline, now);
  // Past the deadline there is no day after the last one to move to.
  if (left <= 0) return total;
  return Math.min(total, Math.max(1, total - left + 1));
}

export type PaceCutInput = {
  /** Furthest ayah the reader has reached; 0 before they start. */
  reach: number;
  /** Ḥafṣ pages fully read, counted from the book's first page. */
  reachPage: number;
  /** Pages of this plan still unread — ones skipped BEHIND included. */
  unreadPages: number;
  /** Pages in the muṣḥaf the cut is made in (Ḥafṣ, always: see below). */
  totalPages: number;
  /** Ayahs in the book, and the last index. */
  total: number;
  /** Days left including today; 0 once the deadline has passed. */
  daysLeft: number;
  /** Ayahs completed once a given Ḥafṣ page is finished. */
  ayahsThroughPage: (page: number) => number;
};

/**
 * TODAY'S PORTION: what is left, over the days that are left.
 *
 * ── IN PAGES, LIKE EVERY OTHER CUT IN THIS APP ────────────────────────
 *
 * An ayah is not a unit of reading. The first pages of al-Baqarah carry
 * six or seven long ones and the last juz carries forty short ones, so a
 * quota of "208 ayahs a day" is thirty-one pages in one place and
 * fourteen in another — the reader would be handed a different day's work
 * every morning without moving the pace at all. The duration plan cuts by
 * Ḥafṣ pages for exactly this reason (`portionEnd`), and so does this: a
 * whole number of pages, the same number wherever in the book they fall,
 * ending where a page ends.
 *
 * It runs FORWARD from where the reader is, because that is what
 * "continue" means — but the quota counts the backlog too
 * (`unreadPages` includes pages skipped behind them), so a plan with
 * holes in it asks for the pace that actually finishes the book. The
 * holes themselves are reported where they always were, by `khatmahGap`,
 * which offers to take the reader back to them.
 */
export function paceCut(input: PaceCutInput): { from: number; to: number } {
  const { reach, reachPage, unreadPages, totalPages, total, daysLeft } = input;
  const from = Math.min(total, Math.max(1, reach + 1));
  if (unreadPages <= 0) return { from, to: total };
  // A deadline that has passed leaves one day: this one. Everything that
  // is left is today's, which is the truth and not a punishment — the
  // card says the date has gone and offers another.
  const days = Math.max(1, daysLeft);
  const share = Math.max(1, Math.ceil(unreadPages / days));
  const lastPage = Math.min(totalPages, Math.max(0, reachPage) + share);
  return { from, to: Math.max(from, Math.min(total, input.ayahsThroughPage(lastPage))) };
}

/** Is this cut the one for `day`, or is it yesterday's? */
export function paceIsFor(pace: KhatmahPace | undefined, day: string): boolean {
  return pace?.day === day;
}
