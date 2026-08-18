/**
 * Prayer journal — task #25.
 *
 * Tap each prayer to mark it on-time / late / missed / qadha (make-up).
 * All data is private and never leaves the device. Storage is via the
 * encrypted layer (the same one that holds coordinates) since
 * "did/didn't pray X today" is sensitive personal information.
 *
 * Data model is a flat append-only log: one entry per (date, prayer)
 * combination. Re-marking a prayer overwrites the previous status.
 */

export type JournalStatus = 'on-time' | 'late' | 'missed' | 'qadha';
export type JournalPrayer = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

export type JournalEntry = {
  /** YYYY-MM-DD in local time. */
  date: string;
  prayer: JournalPrayer;
  status: JournalStatus;
  /** ISO timestamp when the user logged this entry. */
  loggedAt: string;
  /**
   * Optional private personal note — task #82. Stored only in the
   * encrypted journal blob; never logged or transmitted. Empty string
   * and undefined are equivalent (no note).
   */
  note?: string;
};

/** Parse + sanitize a stored entries array. Drops malformed records. */
export function coerceJournalEntries(input: unknown): JournalEntry[] {
  if (!Array.isArray(input)) return [];
  const VALID_STATUS: JournalStatus[] = ['on-time', 'late', 'missed', 'qadha'];
  const VALID_PRAYER: JournalPrayer[] = [
    'Fajr',
    'Dhuhr',
    'Asr',
    'Maghrib',
    'Isha',
  ];
  const out: JournalEntry[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date))
      continue;
    if (
      typeof r.prayer !== 'string' ||
      !VALID_PRAYER.includes(r.prayer as JournalPrayer)
    )
      continue;
    if (
      typeof r.status !== 'string' ||
      !VALID_STATUS.includes(r.status as JournalStatus)
    )
      continue;
    if (typeof r.loggedAt !== 'string') continue;
    const note = typeof r.note === 'string' ? r.note : undefined;
    out.push({
      date: r.date,
      prayer: r.prayer as JournalPrayer,
      status: r.status as JournalStatus,
      loggedAt: r.loggedAt,
      ...(note !== undefined ? { note } : {}),
    });
  }
  return out;
}

/**
 * Update the personal note on an existing entry, or create a fresh
 * entry with `status: 'on-time'` if none exists yet (the user is
 * jotting down a thought without picking a status). Empty string
 * removes the note.
 */
export function setEntryNote(
  entries: JournalEntry[],
  date: string,
  prayer: JournalPrayer,
  note: string,
  now: Date = new Date(),
): JournalEntry[] {
  const trimmed = note.trim();
  const idx = entries.findIndex(e => e.date === date && e.prayer === prayer);
  if (idx < 0) {
    // No entry yet — create one with a neutral default status. The
    // user can change the status later via the row buttons.
    return [
      ...entries,
      {
        date,
        prayer,
        status: 'on-time',
        loggedAt: now.toISOString(),
        ...(trimmed ? { note: trimmed } : {}),
      },
    ];
  }
  const next = entries.slice();
  const prev = next[idx];
  next[idx] = {
    ...prev,
    note: trimmed || undefined,
  };
  return next;
}

/** Return all entries for a given date (any prayer). Used by month view. */
export function entriesForDate(
  entries: JournalEntry[],
  date: string,
): JournalEntry[] {
  return entries.filter(e => e.date === date);
}

/** Return all unique dates (YYYY-MM-DD) that have any entry, sorted ascending. */
export function loggedDates(entries: JournalEntry[]): string[] {
  const seen = new Set<string>();
  for (const e of entries) seen.add(e.date);
  return Array.from(seen).sort();
}

/**
 * Add or update a journal entry. If an entry for the same (date, prayer)
 * already exists, it's replaced (last-write-wins) and the older entry is
 * discarded — the journal is intent-of-record, not append-only audit log.
 */
export function upsertEntry(
  entries: JournalEntry[],
  date: string,
  prayer: JournalPrayer,
  status: JournalStatus,
  now: Date = new Date(),
): JournalEntry[] {
  const filtered = entries.filter(
    e => !(e.date === date && e.prayer === prayer),
  );
  return [...filtered, { date, prayer, status, loggedAt: now.toISOString() }];
}

/**
 * Remove the entry for a given (date, prayer). Returns the entries array with
 * any matching entry stripped out. Used by the Journal "tap-to-deselect" UX
 * (#145): tapping the already-active status pill clears the log instead of
 * being a no-op.
 */
export function removeEntry(
  entries: JournalEntry[],
  date: string,
  prayer: JournalPrayer,
): JournalEntry[] {
  return entries.filter(e => !(e.date === date && e.prayer === prayer));
}

/** Lookup the status of a single (date, prayer) cell, or null if unlogged. */
export function getEntryStatus(
  entries: JournalEntry[],
  date: string,
  prayer: JournalPrayer,
): JournalStatus | null {
  const hit = entries.find(e => e.date === date && e.prayer === prayer);
  return hit ? hit.status : null;
}

export type JournalStats = {
  /** Number of entries logged on-time, across all dates. */
  onTime: number;
  late: number;
  missed: number;
  qadha: number;
  /** Total prayers logged (any status). */
  total: number;
  /** On-time fraction (0..1) over all logged prayers. NaN when total === 0. */
  onTimeRatio: number;
};

/** Aggregate stats over the entire journal (or a filtered subset passed in). */
export function computeStats(entries: JournalEntry[]): JournalStats {
  let onTime = 0,
    late = 0,
    missed = 0,
    qadha = 0;
  for (const e of entries) {
    if (e.status === 'on-time') onTime += 1;
    else if (e.status === 'late') late += 1;
    else if (e.status === 'missed') missed += 1;
    else if (e.status === 'qadha') qadha += 1;
  }
  const total = onTime + late + missed + qadha;
  return {
    onTime,
    late,
    missed,
    qadha,
    total,
    onTimeRatio: total === 0 ? Number.NaN : onTime / total,
  };
}

const ALL_PRAYERS: JournalPrayer[] = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
];

/** `YYYY-MM-DD` in local time — the same shape the entries are keyed by. */
function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** date -> prayer -> status, for O(1) day lookup. */
function indexByDate(
  entries: JournalEntry[],
): Map<string, Map<JournalPrayer, JournalStatus>> {
  const byDate = new Map<string, Map<JournalPrayer, JournalStatus>>();
  for (const e of entries) {
    let day = byDate.get(e.date);
    if (!day) {
      day = new Map();
      byDate.set(e.date, day);
    }
    day.set(e.prayer, e.status);
  }
  return byDate;
}

/**
 * All five present and all five on time.
 *
 * Shared by both streaks on purpose: the longest must be measured with the
 * same ruler as the current one, or a user can be shown a "best" smaller
 * than the streak they are standing in.
 */
function isPerfect(
  day: Map<JournalPrayer, JournalStatus> | undefined,
): boolean {
  if (!day) return false;
  return ALL_PRAYERS.every(p => day.get(p) === 'on-time');
}

/** Something is already recorded that no later prayer can take back. */
function isSpoiled(
  day: Map<JournalPrayer, JournalStatus> | undefined,
): boolean {
  if (!day) return false;
  for (const status of day.values()) {
    if (status !== 'on-time') return true;
  }
  return false;
}

/**
 * The longest run of perfect days anywhere in the journal — the personal
 * best the current streak is measured against.
 *
 * RECOMPUTED, NOT REMEMBERED. Storing a high-water mark would mean a number
 * that cannot be corrected: the Log screen lets any past day be edited and
 * "Fill in earlier days" writes whole weeks at once, so a stored best would
 * drift away from the record it claims to describe and there would be no way
 * back. Deriving it costs one pass over a journal that is at most a few
 * thousand entries, and it is only ever recomputed when that journal changes.
 *
 * Unlike the current streak this asks nothing about today. Today is either
 * already perfect, in which case it is part of a run like any other day, or
 * it is not, in which case it belongs to no run yet. There is no third state
 * to be careful about, because a best is a fact about finished days.
 */
export function computeLongestStreak(entries: JournalEntry[]): number {
  const byDate = indexByDate(entries);

  const perfect = new Set<string>();
  for (const [date, day] of byDate) {
    if (isPerfect(day)) perfect.add(date);
  }
  if (perfect.size === 0) return 0;

  /** The day before `key`, via a noon-anchored Date so DST cannot shift it. */
  function dayBefore(key: string): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() - 1);
    return fmt(d);
  }

  let longest = 0;
  for (const start of perfect) {
    // Only walk forward from the START of a run, so each run is measured
    // once however long it is — the whole thing stays O(days).
    const before = dayBefore(start);
    if (before !== null && perfect.has(before)) continue;

    let run = 0;
    let cursor: string | null = start;
    while (cursor !== null && perfect.has(cursor)) {
      run += 1;
      const next = new Date(
        Number(cursor.slice(0, 4)),
        Number(cursor.slice(5, 7)) - 1,
        Number(cursor.slice(8, 10)),
        12,
      );
      next.setDate(next.getDate() + 1);
      cursor = fmt(next);
    }
    if (run > longest) longest = run;
  }
  return longest;
}

/**
 * Consecutive days on which all five prayers were logged on time, ending
 * today or yesterday.
 *
 * TODAY IS NOT OVER, AND THE STREAK MUST NOT PRETEND IT IS. This used to
 * start counting at today and stop the instant today was not already five
 * from five, so someone who had prayed every prayer on time for three months
 * was told "0 days" over breakfast, every single morning, until Isha went
 * in. The comment above the loop even described the right rule; the code
 * never implemented it. A streak is a claim about the past.
 *
 * So today is in one of three states:
 *
 *   - all five on time      -> it counts, and the walk starts here
 *   - nothing wrong with it -> undecided; the walk starts at yesterday, and
 *                              an untouched morning shows the run intact
 *   - already spoiled       -> a late, missed or qadha prayer is a fact that
 *                              today can no longer undo, so the streak ends
 *                              now rather than at midnight
 *
 * That last case is where this deliberately parts company with
 * `computeSunnahStreak`, which has no way to be spoiled early: every sunnah
 * is optional, so an unfinished sunnah day is only ever unfinished. A fard
 * prayer marked missed is a different kind of fact, and carrying yesterday's
 * number for another twelve hours after the user has recorded one would be
 * flattery rather than a record.
 */
export function computeCurrentStreak(
  entries: JournalEntry[],
  now: Date = new Date(),
): number {
  const byDate = indexByDate(entries);

  // Noon, so that adding and subtracting days never lands on an hour that
  // does not exist — the same anchor `computeSunnahStreak` and
  // `computeFastStats` use. A cursor left on the wall-clock time of `now`
  // is one DST boundary away from counting a day twice or skipping one.
  const cur = new Date(now);
  cur.setHours(12, 0, 0, 0);

  const today = byDate.get(fmt(cur));
  if (!isPerfect(today)) {
    // A spoiled today ends the run here and now; an unfinished one is simply
    // not part of the record yet, so the question moves to yesterday.
    if (isSpoiled(today)) return 0;
    cur.setDate(cur.getDate() - 1);
  }

  let streak = 0;
  // A year and a day bounds the loop against a corrupt clock; no streak
  // anyone can hold needs more.
  for (let i = 0; i < 366; i++) {
    if (!isPerfect(byDate.get(fmt(cur)))) break;
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

/**
 * What each status is worth when the graph colours a day.
 *
 * The square used to darken by the NUMBER of entries, which meant a day
 * marked missed five times looked exactly like a day prayed five times on
 * time — the graph said "you logged" when the user read it as "you prayed",
 * which is worse than saying nothing at all.
 *
 * A missed prayer is worth nothing, so it darkens nothing. Late and qadha
 * are worth less than on time but far more than nothing: both mean the
 * prayer was prayed, and a graph that flattened them to zero would tell a
 * traveller making up Dhuhr on the road that the day was a write-off.
 */
export const STATUS_WEIGHT: Record<JournalStatus, number> = {
  'on-time': 1,
  late: 0.7,
  qadha: 0.45,
  missed: 0,
};

export type DayScore = {
  /** 0…5, weighted by status — what the fill depth is drawn from. */
  kept: number;
  /** How many of the five have any entry at all, whatever it says. */
  logged: number;
  /**
   * How many were marked `missed`.
   *
   * Tracked separately from the score because it is not a quantity of
   * anything — it is a flag on the day. People use `missed` as a note to
   * themselves that a prayer is owed and will be made up, so the day needs
   * to be findable later; a day of four on-time and one missed is a strong
   * green square and the one thing the user is looking for in it is
   * invisible in the depth. The graph draws a mark from this.
   */
  missed: number;
};

/**
 * Every logged day, scored. `logged` is kept separately from `kept` so the
 * graph can tell "nothing recorded" (blank paper) from "recorded, and none
 * of them kept" (a mark, because the user did the work of logging it).
 */
export function scoreByDay(entries: JournalEntry[]): Map<string, DayScore> {
  const out = new Map<string, DayScore>();
  for (const e of entries) {
    const cur = out.get(e.date) ?? { kept: 0, logged: 0, missed: 0 };
    cur.kept += STATUS_WEIGHT[e.status] ?? 0;
    cur.logged += 1;
    if (e.status === 'missed') cur.missed += 1;
    out.set(e.date, cur);
  }
  return out;
}
