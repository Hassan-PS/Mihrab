/**
 * The check beside each prayer on Today — one tap records the prayer.
 *
 * ── WHAT A TAP RECORDS ────────────────────────────────────────────────
 *
 * The prayer, now, with the status the Log would give it: `on-time` while
 * the tap lands inside the prayer's own window, `late` once that window
 * has closed. Nobody is asked to choose — the row already knows what time
 * it is — and someone who prayed earlier than they tap gets the answer
 * the clock gives, which is editable on the Log like any other entry.
 * A second tap un-logs it (a tombstone, like the Log's own deselect).
 *
 * ── THE WINDOW ────────────────────────────────────────────────────────
 *
 * Each prayer's window runs from its time to the next event that ends it:
 * Fajr to sunrise, Dhuhr to Asr, Asr to Maghrib, Maghrib to Isha, and Isha
 * to the next day's Fajr — or, when tomorrow is not to hand, to the end of
 * the day. A prayer whose time has not come cannot be tapped: there is
 * nothing to record yet.
 *
 * The write path is the Log screen's, not a new one: encrypt to the same
 * key, prime the shared cache first so every surface updates at once,
 * retire the evening reminder for a fully logged day, and drop the
 * second-time alerts of a prayer that has been answered.
 */
import { useCallback, useMemo, useRef } from 'react';
import { combineLocalDateAndTime } from '../utils/prayerTimes';
import type { TimingsMap } from '../types/prayer';
import {
  clearEntry,
  getEntryStatus,
  isLogged,
  upsertEntry,
  type JournalEntry,
  type JournalPrayer,
  type LoggedStatus,
} from './journal';
import { loggedPrayersOn } from './loggedPrayers';
import {
  dayKey,
  JOURNAL_KEY,
  primePractice,
  usePracticeHistory,
} from '../practice/practiceStore';
import { durableEncryptedSet } from '../storage/durableWrite';
import { syncEndOfDayReminderForDay } from '../notifications/endOfDayLog';
import { dropDaruriAlertsForLogged } from '../notifications/prayerNotifications';

export const SALAH: readonly JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export function isSalah(key: string): key is JournalPrayer {
  return (SALAH as readonly string[]).includes(key);
}

/** The key in the day's timings that closes each prayer's window. */
const WINDOW_END: Record<JournalPrayer, string | null> = {
  Fajr: 'Sunrise',
  Dhuhr: 'Asr',
  Asr: 'Maghrib',
  Maghrib: 'Isha',
  Isha: null, // tomorrow's Fajr, or the end of the day
};

export type QuickLogPhase = 'not-yet' | 'in-window' | 'after-window';

/** Where `now` falls for this prayer on this day. */
export function quickLogPhase(
  prayer: JournalPrayer,
  timings: TimingsMap,
  now: Date,
  tomorrow?: TimingsMap,
): QuickLogPhase {
  const raw = timings[prayer];
  if (!raw) return 'not-yet';
  const start = combineLocalDateAndTime(now, raw).getTime();
  if (now.getTime() < start) return 'not-yet';
  const endKey = WINDOW_END[prayer];
  let end: number;
  if (endKey && timings[endKey]) {
    end = combineLocalDateAndTime(now, timings[endKey]).getTime();
  } else if (tomorrow?.Fajr) {
    const t = combineLocalDateAndTime(now, tomorrow.Fajr);
    t.setDate(t.getDate() + 1);
    end = t.getTime();
  } else {
    const eod = new Date(now);
    eod.setHours(23, 59, 59, 999);
    end = eod.getTime();
  }
  // A window that the timings put before its own start (a polar day, a
  // broken feed) is treated as open: the prayer has come, and "late" is
  // a claim the data cannot support.
  if (end <= start) return 'in-window';
  return now.getTime() < end ? 'in-window' : 'after-window';
}

/** The status one tap records, or null where there is nothing to record yet. */
export function quickLogStatus(
  prayer: JournalPrayer,
  timings: TimingsMap,
  now: Date,
  tomorrow?: TimingsMap,
): LoggedStatus | null {
  const phase = quickLogPhase(prayer, timings, now, tomorrow);
  if (phase === 'not-yet') return null;
  return phase === 'in-window' ? 'on-time' : 'late';
}

export type QuickLog = {
  hydrated: boolean;
  /** Today's recorded status per prayer, or null when not logged. */
  statusOf: (prayer: JournalPrayer) => LoggedStatus | null;
  /**
   * Record the prayer (with the status the clock gives), or un-log it if
   * it is already recorded. Resolves once the write has landed or failed;
   * on failure the previous journal is restored.
   */
  toggle: (
    prayer: JournalPrayer,
    timings: TimingsMap,
    tomorrow?: TimingsMap,
  ) => Promise<void>;
};

export function useQuickLog(): QuickLog {
  const store = usePracticeHistory();
  const journalRef = useRef<JournalEntry[]>(store.journal);
  journalRef.current = store.journal;
  const hydratedRef = useRef(store.hydrated);
  hydratedRef.current = store.hydrated;
  const today = dayKey();

  const statusOf = useCallback(
    (prayer: JournalPrayer): LoggedStatus | null =>
      getEntryStatus(store.journal, today, prayer),
    [store.journal, today],
  );

  const toggle = useCallback(
    async (prayer: JournalPrayer, timings: TimingsMap, tomorrow?: TimingsMap) => {
      // NEVER FROM AN UNHYDRATED STORE. Before the read lands (or after a
      // read that failed) `journal` is the empty array the hook starts
      // with, and "that plus this prayer" written to disk is the user's
      // whole record replaced by one entry. The check is drawn as
      // not-yet until then (TodayCard), and this is the second lock.
      if (!hydratedRef.current) return;
      const prev = journalRef.current;
      const date = dayKey();
      const current = prev.find(e => e.date === date && e.prayer === prayer);
      let next: JournalEntry[];
      if (current && isLogged(current)) {
        next = clearEntry(prev, date, prayer);
      } else {
        const status = quickLogStatus(prayer, timings, new Date(), tomorrow);
        if (!status) return;
        next = upsertEntry(prev, date, prayer, status);
      }
      journalRef.current = next;
      primePractice({ journal: next });
      try {
        await durableEncryptedSet(JOURNAL_KEY, JSON.stringify(next));
        void syncEndOfDayReminderForDay(date, next);
        void dropDaruriAlertsForLogged(date, loggedPrayersOn(next, date));
      } catch (e) {
        console.warn('quickLog persist failed', e);
        journalRef.current = prev;
        primePractice({ journal: prev });
      }
    },
    [],
  );

  return useMemo(
    () => ({ hydrated: store.hydrated, statusOf, toggle }),
    [store.hydrated, statusOf, toggle],
  );
}
