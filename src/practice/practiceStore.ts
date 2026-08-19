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
import { coerceJournalEntries, type JournalEntry } from '../journal/journal';
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

let cache: PracticeData | null = null;
let inFlight: Promise<PracticeData> | null = null;
const listeners = new Set<() => void>();

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

async function readAll(): Promise<PracticeData> {
  const [journalRaw, fastRaw, dhikrRaw, sunnahRaw] = await Promise.all([
    durableEncryptedGet(JOURNAL_KEY).catch(() => null),
    durableEncryptedGet(FASTING_KEY).catch(() => null),
    durableEncryptedGet(DHIKR_KEY).catch(() => null),
    durableEncryptedGet(SUNNAH_KEY).catch(() => null),
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

/** Read everything, using the cache when it is warm. */
export async function loadPractice(): Promise<PracticeData> {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = readAll()
      .then(data => {
        cache = data;
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
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
  cache = { ...(cache ?? EMPTY), ...patch };
  listeners.forEach(fn => fn());
}

/** Record one completed dhikr set for today (the counter reached its target). */
export async function recordDhikrSet(when: Date = new Date()): Promise<void> {
  const data = await loadPractice();
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
    void loadPractice().then(d => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
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
    logged: d.journal.filter(e => e.date === today).length,
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
    const read = () => {
      void loadPractice().then(d => {
        if (!cancelled) setData(d);
      });
    };
    read();
    const listener = () => read();
    listeners.add(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
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
