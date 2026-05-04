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
  const VALID_PRAYER: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const out: JournalEntry[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    if (typeof r.prayer !== 'string' || !VALID_PRAYER.includes(r.prayer as JournalPrayer)) continue;
    if (typeof r.status !== 'string' || !VALID_STATUS.includes(r.status as JournalStatus)) continue;
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
  const idx = entries.findIndex(
    e => e.date === date && e.prayer === prayer,
  );
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
  return [
    ...filtered,
    { date, prayer, status, loggedAt: now.toISOString() },
  ];
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
  let onTime = 0, late = 0, missed = 0, qadha = 0;
  for (const e of entries) {
    if (e.status === 'on-time') onTime += 1;
    else if (e.status === 'late') late += 1;
    else if (e.status === 'missed') missed += 1;
    else if (e.status === 'qadha') qadha += 1;
  }
  const total = onTime + late + missed + qadha;
  return {
    onTime, late, missed, qadha, total,
    onTimeRatio: total === 0 ? Number.NaN : onTime / total,
  };
}

/**
 * Compute the user's current "on-time streak" — the longest unbroken run
 * of consecutive days where ALL 5 prayers were logged on-time, ending on
 * `now` (or its day). Returns 0 if today's run is broken.
 */
export function computeCurrentStreak(
  entries: JournalEntry[],
  now: Date = new Date(),
): number {
  const ALL_PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  // Index by date for O(1) day lookup.
  const byDate = new Map<string, Map<JournalPrayer, JournalStatus>>();
  for (const e of entries) {
    let day = byDate.get(e.date);
    if (!day) {
      day = new Map();
      byDate.set(e.date, day);
    }
    day.set(e.prayer, e.status);
  }

  function fmt(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  let streak = 0;
  // Walk back from yesterday (today is incomplete until Isha is done).
  // Start from today only if all 5 are already logged on-time.
  const cur = new Date(now);
  for (let i = 0; i < 366; i++) {
    const day = byDate.get(fmt(cur));
    if (!day) break;
    let allOnTime = true;
    for (const p of ALL_PRAYERS) {
      if (day.get(p) !== 'on-time') {
        allOnTime = false;
        break;
      }
    }
    if (!allOnTime) break;
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}
