/**
 * Fasting tracker — task #29.
 *
 * Logs Ramadan fasting days and voluntary fasts. Like the prayer journal
 * (#25), entries persist to **encrypted storage** because fasting history
 * reveals religious practice — sensitive personal data that must never
 * sit in plaintext on disk.
 *
 * Voluntary-fast detection uses pure date math: Mondays/Thursdays are
 * the recurring Sunnah voluntary fasts, plus the three "white days"
 * (13/14/15 of each Hijri month — Ayyam al-Bidh).
 */

import { gregorianToHijri } from '../hijri/convert';
import {
  isLaylatAlQadrCandidate,
  isRamadan,
  type HijriDate,
} from '../hijri/events';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _: typeof isLaylatAlQadrCandidate = isLaylatAlQadrCandidate; // re-exported for callers via this module surface

export type FastType = 'ramadan' | 'voluntary' | 'qadha';

export type FastEntry = {
  /** YYYY-MM-DD (local Gregorian). */
  date: string;
  type: FastType;
  /** True when the fast was completed (kept full-day, no break). */
  completed: boolean;
  /** ISO-8601 timestamp the entry was last updated. */
  loggedAt: string;
  /** Optional intention timestamp (set by the niyyah-reminder flow). */
  niyyahAt?: string;
  /** Free-form notes (capped at 500 chars). */
  notes?: string;
  /**
   * A DELETED ENTRY, kept as a dated fact rather than dropped.
   *
   * Deleting used to filter the row out of the array, and the sync merge
   * — which keeps the newest entry per `(date, type)` — cannot tell a row
   * deleted here from a row logged there: the other device still had it,
   * so the delete undid itself on the next round. The journal has always
   * answered this with `status: 'cleared'` (a clear is a WRITE), and this
   * is the same answer in this store's shape. Readers go through
   * `liveFasts`/`findFastEntry`, which never hand back a cleared row;
   * `coerceFastEntries` drops it once it is older than any peer could
   * still argue about.
   */
  cleared?: true;
};

/** How long a deleted entry travels before it is dropped for good. */
export const FAST_TOMBSTONE_TTL_DAYS = 90;

const VALID_TYPES: ReadonlyArray<FastType> = ['ramadan', 'voluntary', 'qadha'];

export function coerceFastEntries(input: unknown): FastEntry[] {
  if (!Array.isArray(input)) return [];
  const out: FastEntry[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    if (typeof r.type !== 'string' || !VALID_TYPES.includes(r.type as FastType)) continue;
    if (typeof r.completed !== 'boolean') continue;
    if (typeof r.loggedAt !== 'string') continue;
    // Past the window a removal needs, the row is gone everywhere and is
    // pure weight in every sealed file — the same prune `coerceKhatmah`
    // and `coerceSunnahLog` do for their tombstones.
    if (r.cleared === true) {
      const at = Date.parse(r.loggedAt);
      const ttl = FAST_TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000;
      if (Number.isFinite(at) && Date.now() - at > ttl) continue;
    }
    out.push({
      date: r.date,
      type: r.type as FastType,
      completed: r.completed,
      loggedAt: r.loggedAt,
      niyyahAt: typeof r.niyyahAt === 'string' ? r.niyyahAt : undefined,
      notes: typeof r.notes === 'string' ? r.notes.slice(0, 500) : undefined,
      ...(r.cleared === true ? { cleared: true as const } : {}),
    });
  }
  return out;
}

/**
 * The entries a reader would call theirs — everything but the tombstones.
 *
 * Every list, count, grid and streak goes through this. A cleared row is
 * carried so the deletion can reach the other devices, and it must never
 * be mistaken for a fast that happened.
 */
export function liveFasts(entries: readonly FastEntry[]): FastEntry[] {
  return entries.filter(e => e.cleared !== true);
}

export function upsertFastEntry(
  entries: FastEntry[],
  date: string,
  patch: Partial<Omit<FastEntry, 'date'>>,
): FastEntry[] {
  const idx = entries.findIndex(e => e.date === date);
  const now = new Date().toISOString();
  if (idx === -1) {
    return [
      ...entries,
      {
        date,
        type: patch.type ?? 'voluntary',
        completed: patch.completed ?? true,
        loggedAt: now,
        niyyahAt: patch.niyyahAt,
        notes: patch.notes?.slice(0, 500),
      },
    ];
  }
  const next = [...entries];
  next[idx] = { ...next[idx], ...patch, loggedAt: now };
  return next;
}

export function deleteFastEntry(entries: FastEntry[], date: string): FastEntry[] {
  const now = new Date().toISOString();
  let found = false;
  const next = entries.map(e => {
    if (e.date !== date) return e;
    found = true;
    // A WRITE, not a removal — see `cleared`. `loggedAt` moves with it,
    // because the merge keeps the newest word on a `(date, type)` and
    // this is the newest word.
    return { ...e, cleared: true as const, loggedAt: now };
  });
  return found ? next : entries;
}

export function findFastEntry(
  entries: FastEntry[],
  date: string,
): FastEntry | undefined {
  const found = entries.find(e => e.date === date);
  return found?.cleared === true ? undefined : found;
}

/** Detects whether the given Gregorian date is a recurring Sunnah voluntary
 *  fast: Mondays/Thursdays, the three white days (13–15 Hijri), the Day of
 *  Arafah (9 Dhul Hijjah), or Ashura (10 Muharram).
 */
export function isRecommendedVoluntaryFastDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 1 || dow === 4) return true; // Monday or Thursday
  const h = gregorianToHijri(date);
  // White days
  if (h.day === 13 || h.day === 14 || h.day === 15) return true;
  // Arafah (9 Dhul Hijjah)
  if (h.month === 12 && h.day === 9) return true;
  // Ashura (10 Muharram)
  if (h.month === 1 && h.day === 10) return true;
  return false;
}

/** Returns the Ramadan day number (1–30) for a Gregorian date, or null. */
export function ramadanDayNumber(date: Date): number | null {
  const h = gregorianToHijri(date);
  return isRamadan(h) ? h.day : null;
}

export type FastStats = {
  /** Ramadan days completed in the current Hijri year (or whichever year is queried). */
  ramadanDaysKept: number;
  /** Voluntary fasts completed in the entire log. */
  voluntaryDaysKept: number;
  /** Qadha (make-up) days completed. */
  qadhaDaysKept: number;
  /** Total days fasted (any type, completed=true). */
  total: number;
  /** Current consecutive-day streak ending today (any-type fasts). */
  currentStreak: number;
};

export function computeFastStats(
  entries: FastEntry[],
  now: Date = new Date(),
): FastStats {
  // `liveFasts` first: a deleted day is carried as a tombstone now, and
  // it still has `completed: true` on it from when it was a fast.
  const completed = liveFasts(entries).filter(e => e.completed);
  const stats: FastStats = {
    ramadanDaysKept: 0,
    voluntaryDaysKept: 0,
    qadhaDaysKept: 0,
    total: completed.length,
    currentStreak: 0,
  };
  for (const e of completed) {
    if (e.type === 'ramadan') stats.ramadanDaysKept += 1;
    else if (e.type === 'voluntary') stats.voluntaryDaysKept += 1;
    else if (e.type === 'qadha') stats.qadhaDaysKept += 1;
  }
  // Streak: walk back day-by-day from today as long as a completed entry exists.
  const completedDates = new Set(completed.map(e => e.date));
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0); // noon to avoid DST shift edges
  let streak = 0;
  for (;;) {
    const key = formatDate(cursor);
    if (!completedDates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  stats.currentStreak = streak;
  return stats;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Re-export — kept here so consumers can import HijriDate from this module
 *  alongside the fast types without reaching into hijri/. */
export type { HijriDate };
