/**
 * Taps on the Log Today widget, on their way to the journal.
 *
 * ── Why a queue, and not a write ──────────────────────────────────────
 *
 * The journal is an ENCRYPTED blob. A widget's broadcast receiver is
 * Kotlin, it has no access to the key, and even if it did it would have to
 * reimplement `upsertEntry`'s rule that an existing status is never
 * overwritten — so an accidental double press cannot clear a "missed" the
 * user set on purpose. Two implementations of that rule is one too many;
 * the one in `prayerLogAction.logPrayerOnTime` is the writer, and it stays
 * the only one.
 *
 * The alternative was a HeadlessJsTaskService: spin up the whole React
 * Native runtime on a tap, run the write in JS, tear it down. That is
 * seconds of work for one line of journal, Android 12+ restricts starting
 * services from the background anyway, and the user is standing there
 * waiting for a checkmark. So the receiver appends to a queue in the same
 * SharedPreferences the payload already lives in — a few bytes, instant —
 * and the app drains it through the real writer at the next opportunity.
 *
 * ── What the user sees ────────────────────────────────────────────────
 *
 * Immediately: the tick. The widget renders the queue over the payload, so
 * a tapped prayer reads as logged the moment it is tapped, whether or not
 * the app has run since.
 *
 * ── The undo window falls out of this for free ────────────────────────
 *
 * Tapping the same prayer again inside the undo window removes it from the
 * queue instead of adding a second entry. Nothing had been written yet, so
 * "undo" is a deletion from a list rather than a journal edit that has to
 * decide what the previous status was.
 *
 * ── Which day an entry lands on ───────────────────────────────────────
 *
 * The date is stamped when the tap happens and travels with the entry, for
 * the reason `prayerLogAction` gives about notifications: Isha fires at
 * 23:40 in a Swedish winter and is answered at 00:05, and a drain that used
 * "today" would credit the wrong day and leave the real one blank.
 */
import type { JournalPrayer } from '../journal/journal';

/** One queued tap. Short keys — this rides in a SharedPreferences string. */
export type WidgetLogEntry = {
  /** Local YYYY-MM-DD the tap was FOR, stamped at tap time. */
  d: string;
  /** Which prayer. */
  p: JournalPrayer;
  /** Epoch ms of the tap, for the undo window and for ordering. */
  t: number;
};

/** How long a tap can be taken back by tapping the same prayer again. */
export const UNDO_WINDOW_MS = 60_000;

/**
 * How stale a queued tap may be and still be written.
 *
 * A queue that has not drained in a fortnight means the app has not been
 * opened in a fortnight, and writing those entries then would silently
 * backfill two weeks of history the user has had no chance to review. The
 * journal is a record of what someone did; it should not gain a fortnight
 * in one go without them seeing it happen.
 */
export const MAX_QUEUE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRAYERS: readonly JournalPrayer[] = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
];

/**
 * Read a stored queue back, keeping only entries that could have come from
 * a real tap.
 *
 * The same discipline as every other blob this app reads: the string comes
 * from another process, and a malformed entry is dropped rather than
 * written into someone's record of their own worship.
 */
export function coerceLogQueue(input: unknown): WidgetLogEntry[] {
  if (!Array.isArray(input)) return [];
  const out: WidgetLogEntry[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.d !== 'string' || !DATE_RE.test(r.d)) continue;
    if (typeof r.p !== 'string' || !PRAYERS.includes(r.p as JournalPrayer)) {
      continue;
    }
    const t = typeof r.t === 'number' && Number.isFinite(r.t) ? r.t : 0;
    if (t <= 0) continue;
    out.push({ d: r.d, p: r.p as JournalPrayer, t });
  }
  return out;
}

/**
 * Apply one tap to a queue.
 *
 * Exported and pure so the rule can be tested without a device, and so the
 * Kotlin side has something to be checked AGAINST rather than a second
 * opinion — the receiver implements the same three cases and the tests
 * here are what say what they should be.
 *
 * The three cases:
 *   • Already queued, inside the undo window → remove it. This is the undo.
 *   • Already queued, outside the window → leave it. A second tap an hour
 *     later is someone confirming, not someone retracting.
 *   • Not queued → add it.
 */
export function applyTap(
  queue: WidgetLogEntry[],
  date: string,
  prayer: JournalPrayer,
  now: number,
  undoWindowMs: number = UNDO_WINDOW_MS,
): WidgetLogEntry[] {
  const existing = queue.find(e => e.d === date && e.p === prayer);
  if (existing) {
    if (now - existing.t <= undoWindowMs) {
      return queue.filter(e => !(e.d === date && e.p === prayer));
    }
    return queue;
  }
  return [...queue, { d: date, p: prayer, t: now }];
}

/**
 * Split a queue into what should be written now and what should be dropped.
 *
 * Dropped entries are NOT written and not kept: a tap older than the window
 * has already been superseded by the user opening the app and seeing the
 * day as it really is.
 */
export function partitionQueue(
  queue: WidgetLogEntry[],
  now: number,
  maxAgeMs: number = MAX_QUEUE_AGE_MS,
): { write: WidgetLogEntry[]; stale: WidgetLogEntry[] } {
  const write: WidgetLogEntry[] = [];
  const stale: WidgetLogEntry[] = [];
  for (const e of queue) {
    (now - e.t > maxAgeMs ? stale : write).push(e);
  }
  // Oldest first, so a day's five prayers land in the order they were
  // tapped rather than in whatever order the array happened to hold.
  write.sort((a, b) => a.t - b.t);
  return { write, stale };
}

/** Everything a drain needs, injected so the whole thing is testable. */
export type DrainDeps = {
  /** Read the queue AND clear it, atomically, on the native side. */
  take: () => Promise<unknown>;
  /** The real writer — `logPrayerOnTime`. */
  write: (date: string, prayer: JournalPrayer, now?: Date) => Promise<boolean>;
  now?: number;
};

export type DrainResult = {
  written: number;
  /** Taps that named a prayer already carrying a status. Not an error: the
   *  user logged it in the app before the queue drained. */
  skipped: number;
  dropped: number;
  failed: number;
};

/**
 * Write every queued tap through the real journal writer.
 *
 * Failures are counted rather than thrown. A drain runs on app foreground
 * and from the notification background handler, and neither of those is a
 * place to surface an exception — the queue was already taken, so a throw
 * here would lose the taps rather than report them.
 */
export async function drainWidgetLogQueue(
  deps: DrainDeps,
): Promise<DrainResult> {
  const now = deps.now ?? Date.now();
  const raw = await deps.take().catch(() => null);
  const queue = coerceLogQueue(raw);
  if (queue.length === 0) {
    return { written: 0, skipped: 0, dropped: 0, failed: 0 };
  }
  const { write, stale } = partitionQueue(queue, now);
  let written = 0;
  let skipped = 0;
  let failed = 0;
  for (const e of write) {
    try {
      const didWrite = await deps.write(e.d, e.p, new Date(e.t));
      if (didWrite) written += 1;
      else skipped += 1;
    } catch {
      failed += 1;
    }
  }
  return { written, skipped, dropped: stale.length, failed };
}
