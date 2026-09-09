/**
 * One reader for the three things the app records about a day's practice —
 * prayers logged, fasting, dhikr — so more than one screen can show them.
 *
 * Home's "Today" summary (design review 2a) and the merged Log tab (2c) both
 * need the same three facts, and they were locked inside the journal and
 * fasting screens as local `useState`. This module owns the READ side and a
 * change notification; the screens keep owning their writes and call
 * `notifyPracticeChanged()` after persisting. The cache is dropped on every
 * such notification, so the two can never disagree.
 *
 * Dhikr had no persistence at all — the tasbih counter lived and died with
 * its screen — so a completed set is recorded here. Without it the Today
 * summary would have to state a dhikr line it has no evidence for, and a
 * summary that invents its own content is worse than one that omits a row.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  durableEncryptedGet,
  durableEncryptedSet,
} from '../storage/durableWrite';
import {
  coerceJournalEntries,
  isLogged,
  type JournalEntry,
} from '../journal/journal';
import { coerceFastEntries, type FastEntry } from '../fasting/fasting';
import { coerceSunnahLog, type SunnahLog } from '../journal/sunnah';

export const JOURNAL_KEY = 'prayerapp.journal.v1';
export const FASTING_KEY = 'prayerapp.fasting.v1';
export const DHIKR_KEY = 'prayerapp.dhikr.v1';
export const SUNNAH_KEY = 'prayerapp.sunnah.v1';

/** The five salāh a day can log. */
export const LOGGABLE_PRAYERS = 5;

export type DhikrLog = Record<string, number>;

export type PracticeData = {
  journal: JournalEntry[];
  fasts: FastEntry[];
  /** ISO date (YYYY-MM-DD) → completed dhikr sets that day. */
  dhikr: DhikrLog;
  /** ISO date (YYYY-MM-DD) → that day's sunnah prayers. */
  sunnah: SunnahLog;
};

const EMPTY: PracticeData = { journal: [], fasts: [], dhikr: {}, sunnah: {} };
/**
 * How long a hook waits before asking again after a read that failed.
 * Each attempt already retries three times inside `durableEncryptedGet`;
 * this is the pause between those rounds while the store stays wedged.
 */
const READ_RETRY_MS = 3_000;

let cache: PracticeData | null = null;
let inFlight: Promise<PracticeData> | null = null;
/**
 * A value a writer published before the first read landed — see
 * `primePractice`. Laid over the read when it arrives, never over EMPTY.
 */
let pendingPrime: Partial<PracticeData> | null = null;
const listeners = new Set<() => void>();

/** Tests only: forget everything this module holds in memory. */
export function _resetPracticeStore(): void {
  cache = null;
  inFlight = null;
  pendingPrime = null;
}

/** ISO day key in LOCAL time — the day the user is living in, not UTC. */
export function dayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Read a dhikr blob back, keeping only day → positive count.
 *
 * Exported now that it also guards data arriving from ANOTHER DEVICE or an
 * exported file rather than only from this app's own disk — so the key has
 * to be checked too. A blob whose keys are not dates would otherwise put
 * junk on the graph forever, and unlike a bad number it would never be
 * noticed: nothing renders a day that does not exist.
 */
export function coerceDhikrLog(v: unknown): DhikrLog {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: DhikrLog = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      out[k] = Math.floor(n);
    }
  }
  return out;
}

const coerceDhikr = coerceDhikrLog;

function parseOr<T>(raw: string | null, coerce: (v: unknown) => T, fallback: T): T {
  if (!raw) return fallback;
  try {
    return coerce(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

/**
 * Read the four stores, STRICTLY.
 *
 * Everything that writes practice data from a screen writes what this
 * module handed it, plus one entry. So a read that fails must not come
 * back as an empty store: the screens would show a blank record with
 * `hydrated: true`, the user would log the prayer they can see is
 * missing, and the write would replace the record with that one entry
 * (issue #38 — a journal gone, a sunnah log that survived only because
 * nothing wrote it that day). A strict read throws for a key that has
 * been written before and cannot be read now; the throw leaves `cache`
 * null and `hydrated` false, and the next read tries again.
 */
async function readAll(): Promise<PracticeData> {
  const [journalRaw, fastRaw, dhikrRaw, sunnahRaw] = await Promise.all([
    durableEncryptedGet(JOURNAL_KEY, { strict: true }),
    durableEncryptedGet(FASTING_KEY, { strict: true }),
    durableEncryptedGet(DHIKR_KEY, { strict: true }),
    durableEncryptedGet(SUNNAH_KEY, { strict: true }),
  ]);
  return {
    journal: parseOr(journalRaw, coerceJournalEntries, [] as JournalEntry[]),
    fasts: parseOr(fastRaw, coerceFastEntries, [] as FastEntry[]),
    dhikr: parseOr(dhikrRaw, coerceDhikr, {} as DhikrLog),
    // Absent on every install that predates this feature, which reads as an
    // empty log rather than as a failure — that is the whole migration.
    sunnah: parseOr(sunnahRaw, coerceSunnahLog, {} as SunnahLog),
  };
}

/**
 * Read everything, using the cache when it is warm.
 *
 * REJECTS when a store that holds data cannot be read (see `readAll`).
 * Nothing is cached then, so the next call reads again; a hook that was
 * waiting stays unhydrated rather than showing an empty record.
 */
export async function loadPractice(): Promise<PracticeData> {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = readAll()
      .then(data => {
        // A writer may have published while this read was on its way; its
        // value is newer than the disk's and goes on top.
        cache = pendingPrime ? { ...data, ...pendingPrime } : data;
        pendingPrime = null;
        return cache;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Subscribe to the same change signal the hooks below ride on.
 *
 * Exported for readers that are not React components — the widget payload
 * has to be rebuilt when a prayer is logged, and it is built by a plain
 * async function rather than by a hook.
 */
export function subscribePractice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Something wrote to one of the three stores. Drops the cache and tells
 * every mounted subscriber to read again — call this from whichever screen
 * did the writing.
 */
export function notifyPracticeChanged(): void {
  cache = null;
  listeners.forEach(fn => fn());
}

/**
 * Publish a value the writer already holds, without going back to disk.
 *
 * `notifyPracticeChanged` drops the cache and every subscriber re-reads —
 * which is correct, and which means nothing can be published until the
 * encrypted write has landed. On a journal with a year in it that is long
 * enough to watch: you tap "On time", and the graph sits there. Worse, a
 * caller that notified BEFORE its write would republish the stale blob.
 *
 * So the writer hands over the new value directly. Subscribers see it on
 * the same frame as the tap, the disk write carries on behind them, and a
 * failed write calls this again with the old value to put it back.
 */
export function primePractice(patch: Partial<PracticeData>): void {
  if (cache) {
    cache = { ...cache, ...patch };
    listeners.forEach(fn => fn());
    return;
  }
  // NOT HYDRATED — or just invalidated by `notifyPracticeChanged`, with the
  // re-read still on its way. This used to build the cache as EMPTY plus
  // the patch, and publish it: a journal write arriving in that window
  // told every subscriber the fasting and sunnah logs were empty, with
  // `hydrated: true`, and the next tap on either wrote that emptiness to
  // disk. The patch is held instead and laid over the read when it lands
  // (`loadPractice`), and the subscribers hear about it then.
  pendingPrime = { ...(pendingPrime ?? {}), ...patch };
  void loadPractice()
    .then(() => listeners.forEach(fn => fn()))
    .catch(() => {
      /* the store is unreadable; the hooks stay unhydrated, which is the
         truthful state, and the disk write the caller is making carries
         its own error handling */
    });
}

/** Record one completed dhikr set for today (the counter reached its target). */
export async function recordDhikrSet(when: Date = new Date()): Promise<void> {
  let data: PracticeData;
  try {
    data = await loadPractice();
  } catch (e) {
    // A log we cannot read is not one we may rewrite — see `readAll`.
    console.warn('recordDhikrSet: practice store unreadable, not written', e);
    return;
  }
  const key = dayKey(when);
  const next: DhikrLog = { ...data.dhikr, [key]: (data.dhikr[key] ?? 0) + 1 };
  try {
    await durableEncryptedSet(DHIKR_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('recordDhikrSet failed:', e);
    return;
  }
  notifyPracticeChanged();
}

export type PracticeToday = {
  hydrated: boolean;
  /** How many of the five salāh have a journal entry today. */
  logged: number;
  /** True when today carries a fast entry. */
  fasted: boolean;
  fastType: FastEntry['type'] | null;
  /** Completed dhikr sets today. */
  dhikrSets: number;
};

/** The three facts about today, kept in step with whoever writes them. */
export function usePracticeToday(): PracticeToday {
  const [data, setData] = useState<PracticeData | null>(cache);

  const refresh = useCallback(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      void loadPractice()
        .then(d => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          // Unreadable: stay unhydrated, and ask again in a moment — a
          // store that was wedged for a second should not leave the
          // screen blank until something else happens to change.
          if (!cancelled) retry = setTimeout(read, READ_RETRY_MS);
        });
    };
    read();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, []);

  useEffect(() => {
    const cancel = refresh();
    const listener = () => {
      refresh();
    };
    listeners.add(listener);
    return () => {
      cancel();
      listeners.delete(listener);
    };
  }, [refresh]);

  const d = data ?? EMPTY;
  const today = dayKey();
  const fast = d.fasts.find(f => f.date === today) ?? null;
  return {
    hydrated: data != null,
    // Tombstones are not logged prayers — see `JournalStatus`. Counting one
    // would put a tick on the Home card for a prayer the user un-logged.
    logged: d.journal.filter(e => e.date === today && isLogged(e)).length,
    fasted: fast != null,
    fastType: fast?.type ?? null,
    dhikrSets: d.dhikr[today] ?? 0,
  };
}

/**
 * The whole history — for anything that draws the practice graph.
 *
 * `usePracticeToday` answers three questions about one day; the graph needs
 * every day there has ever been. Both ride the same cache and the same
 * change notification, so a prayer logged on the Log tab lands on Home's
 * graph without either screen knowing about the other.
 */
export function usePracticeHistory(): {
  hydrated: boolean;
  journal: JournalEntry[];
  fasts: FastEntry[];
  sunnah: SunnahLog;
} {
  const [data, setData] = useState<PracticeData | null>(cache);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      void loadPractice()
        .then(d => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          // As in `usePracticeToday`: unhydrated, and try again shortly.
          if (!cancelled) retry = setTimeout(read, READ_RETRY_MS);
        });
    };
    read();
    const listener = () => read();
    listeners.add(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
      if (retry) clearTimeout(retry);
    };
  }, []);

  const d = data ?? EMPTY;
  return {
    hydrated: data != null,
    journal: d.journal,
    fasts: d.fasts,
    sunnah: d.sunnah,
  };
}
