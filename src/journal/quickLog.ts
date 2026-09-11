/**
 * The check beside each prayer on Today — one tap records the prayer.
 *
 * ── WHAT A TAP RECORDS ────────────────────────────────────────────────
 *
 * Inside the prayer's own window, one tap records it `on-time`: the row
 * knows what time it is, and nobody is asked. Once the window has
 * closed — later the same day, or on a day the card has been turned back
 * to — the tap ASKS instead: was it prayed on time, or made up? A tap
 * used to write `late` there on its own, which was the clock's answer
 * and not the reader's: someone marking yesterday's Fajr at breakfast
 * usually prayed it at Fajr, and a check that silently recorded
 * otherwise had to be corrected on the Log. So the row asks, once
 * (`LogPassedPrayerSheet`), and writes what it is told. A second tap
 * un-logs it either way (a tombstone, like the Log's own deselect) —
 * nothing to ask about undoing.
 *
 * WHAT IT ASKS DEPENDS ON THE MOMENT — issue #40. With the Mālikī second
 * times on, a window has two halves, and the half it is in is an answer
 * nobody should have to give twice: inside the second window the only
 * question is the first time or after it, because the prayer can still
 * be prayed in its own time and nothing is qaḍāʾ yet. Once the whole
 * window has gone — for everybody, with those times or without — all
 * four of the Log's statuses are on the table, missed among them, and
 * `late` is no longer the app's guess at which.
 *
 * ── THE WINDOW ────────────────────────────────────────────────────────
 *
 * Each prayer's window runs from its time to the next event that ends it:
 * Fajr to sunrise, Dhuhr to Asr, Asr to Maghrib, Maghrib to Isha, and Isha
 * to the next day's Fajr — or, when tomorrow is not to hand, to the end of
 * the day. The window belongs to the DAY OF THE CARD, not to the clock's
 * day: yesterday's Isha is still open before this morning's Fajr, and
 * tomorrow's Fajr has not come whatever the hour. A prayer whose time has
 * not come cannot be tapped: there is nothing to record yet.
 *
 * The write path is the Log screen's, not a new one: encrypt to the same
 * key, prime the shared cache first so every surface updates at once,
 * retire the evening reminder for a fully logged day, and drop the
 * second-time alerts of a prayer that has been answered.
 */
import { useCallback, useMemo, useRef } from 'react';
import { addDays, combineLocalDateAndTime, startOfLocalDay } from '../utils/prayerTimes';
import type { TimingsMap } from '../types/prayer';
import {
  clearEntry,
  getEntryStatus,
  isLogged,
  LOGGABLE_STATUSES,
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

export type QuickLogPhase =
  | 'not-yet'
  | 'in-window'
  /**
   * Mālikī only: the preferred (ikhtiyārī) time has passed and the second
   * (ḍarūrī) one is still open — issue #40. Without the second times
   * turned on there is no such moment, and the window runs to its end.
   */
  | 'after-first'
  | 'after-window';

/**
 * When the PREFERRED window closes, for a reader who has the Mālikī
 * second times on — or null for everyone else.
 *
 * The boundaries ride in the day's timings under `<Prayer>Daruri`, put
 * there by HomeScreen when `malikiSecondTimesEnabled` is set, so their
 * presence is the whole question: a table that carries them is a table
 * whose windows have two halves, and one that does not is unchanged.
 */
function firstWindowEnd(
  prayer: JournalPrayer,
  timings: TimingsMap,
  base: Date,
): number | null {
  const clock = timings[`${prayer}Daruri` as keyof TimingsMap];
  if (!clock) return null;
  try {
    let at = combineLocalDateAndTime(base, clock);
    // Ishāʾ's boundary can fall after midnight, and then belongs to the
    // next date — the same rule `daruriRowState` and the alerts apply.
    if (prayer === 'Isha' && timings.Maghrib) {
      if (at < combineLocalDateAndTime(base, timings.Maghrib)) {
        at = addDays(at, 1);
      }
    }
    return at.getTime();
  } catch {
    return null;
  }
}

/**
 * Where `now` falls for this prayer on `day` — the calendar day the
 * timings belong to, which is `now`'s own day unless the card has been
 * turned to another one.
 */
export function quickLogPhase(
  prayer: JournalPrayer,
  timings: TimingsMap,
  now: Date,
  tomorrow?: TimingsMap,
  day: Date = now,
): QuickLogPhase {
  const raw = timings[prayer];
  if (!raw) return 'not-yet';
  const base = startOfLocalDay(day);
  const start = combineLocalDateAndTime(base, raw).getTime();
  if (now.getTime() < start) return 'not-yet';
  const endKey = WINDOW_END[prayer];
  let end: number;
  if (endKey && timings[endKey]) {
    end = combineLocalDateAndTime(base, timings[endKey]).getTime();
  } else if (tomorrow?.Fajr) {
    end = combineLocalDateAndTime(addDays(base, 1), tomorrow.Fajr).getTime();
  } else {
    const eod = new Date(base);
    eod.setHours(23, 59, 59, 999);
    end = eod.getTime();
  }
  // A window that the timings put before its own start (a polar day, a
  // broken feed) is treated as open: the prayer has come, and "late" is
  // a claim the data cannot support.
  if (end <= start) return 'in-window';
  if (now.getTime() >= end) return 'after-window';
  // Mālikī: the same window, split. A boundary outside the window it is
  // meant to divide is no boundary — a modelled angle at a high latitude
  // can land past sunrise — and the window stays whole rather than
  // asking a question built on it.
  const first = firstWindowEnd(prayer, timings, base);
  if (first != null && first > start && first < end && now.getTime() >= first) {
    return 'after-first';
  }
  return 'in-window';
}

/** In the second window, a prayer was either prayed in the first or after it. */
const FIRST_PASSED_ANSWERS: readonly LoggedStatus[] = ['on-time', 'late'];

/**
 * What the check may offer once a prayer's time has passed — issue #40.
 *
 * The clock knows more at some moments than at others, and the sheet
 * should not ask a question the moment has already answered:
 *
 *   • the second window is still open — it was prayed in the first time
 *     or after it, and nothing here is missed or made up yet, because
 *     the prayer can still be prayed in its own time;
 *   • the whole window has closed — all four are on the table: prayed on
 *     time and recorded late, prayed late, missed outright, or made up
 *     since. Only the reader knows which.
 *
 * Without the Mālikī times there is no first boundary to pass, so a
 * passed prayer is always the second case.
 */
export function passedPrayerAnswers(
  phase: QuickLogPhase,
): readonly LoggedStatus[] {
  if (phase === 'after-first') return FIRST_PASSED_ANSWERS;
  return phase === 'after-window' ? LOGGABLE_STATUSES : [];
}

/**
 * What one tap does, or null where there is nothing to record yet:
 * `on-time` inside the window, and `ask` once it has closed — the row
 * does not know whether a prayer it is told about afterwards was prayed
 * in its time or made up, and must not guess.
 */
export function quickLogStatus(
  prayer: JournalPrayer,
  timings: TimingsMap,
  now: Date,
  tomorrow?: TimingsMap,
  day: Date = now,
): 'on-time' | 'ask' | null {
  const phase = quickLogPhase(prayer, timings, now, tomorrow, day);
  if (phase === 'not-yet') return null;
  return phase === 'in-window' ? 'on-time' : 'ask';
}

/**
 * An answer to "its time has passed — how was it prayed?"
 *
 * Any of the four the Log itself offers (#40). It was two — on time or
 * made up — which fitted the one moment the sheet was written for and
 * no other: inside the Mālikī second window nothing is qaḍāʾ yet, and
 * once the whole window has gone a prayer can also simply have been
 * missed. Which of the four are OFFERED is `passedPrayerAnswers`.
 */
export type PassedPrayerAnswer = LoggedStatus;

export type QuickLog = {
  hydrated: boolean;
  /** The recorded status of `prayer` on `day` (today by default), or null. */
  statusOf: (prayer: JournalPrayer, day?: Date) => LoggedStatus | null;
  /**
   * Un-log the prayer if it is recorded; record it on time if its window
   * is open; otherwise say 'ask' — the caller puts the question to the
   * user and answers it with `record`. Resolves once the write has landed
   * or failed; on failure the previous journal is restored.
   */
  toggle: (
    prayer: JournalPrayer,
    timings: TimingsMap,
    options?: { day?: Date; tomorrow?: TimingsMap },
  ) => Promise<'ask' | 'written' | 'nothing'>;
  /**
   * Which answers that question should offer, and the phase it is asked
   * in — the same reading of the clock `toggle` just made (#40).
   */
  askedAt: (
    prayer: JournalPrayer,
    timings: TimingsMap,
    options?: { day?: Date; tomorrow?: TimingsMap },
  ) => { phase: QuickLogPhase; answers: readonly PassedPrayerAnswer[] };
  /** Record `prayer` on `day` with the answer the user gave. */
  record: (
    prayer: JournalPrayer,
    day: Date,
    status: PassedPrayerAnswer,
  ) => Promise<void>;
};

export function useQuickLog(): QuickLog {
  const store = usePracticeHistory();
  const journalRef = useRef<JournalEntry[]>(store.journal);
  journalRef.current = store.journal;
  const hydratedRef = useRef(store.hydrated);
  hydratedRef.current = store.hydrated;

  const statusOf = useCallback(
    (prayer: JournalPrayer, day?: Date): LoggedStatus | null =>
      getEntryStatus(store.journal, dayKey(day), prayer),
    [store.journal],
  );

  /** The one writer: publish first, persist, and put back on failure. */
  const persist = useCallback(async (next: JournalEntry[], date: string) => {
    const prev = journalRef.current;
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
  }, []);

  const toggle = useCallback(
    async (
      prayer: JournalPrayer,
      timings: TimingsMap,
      options: { day?: Date; tomorrow?: TimingsMap } = {},
    ): Promise<'ask' | 'written' | 'nothing'> => {
      // NEVER FROM AN UNHYDRATED STORE. Before the read lands (or after a
      // read that failed) `journal` is the empty array the hook starts
      // with, and "that plus this prayer" written to disk is the user's
      // whole record replaced by one entry. The check is drawn as
      // not-yet until then (TodayCard), and this is the second lock.
      if (!hydratedRef.current) return 'nothing';
      const now = new Date();
      const day = options.day ?? now;
      const prev = journalRef.current;
      const date = dayKey(day);
      const current = prev.find(e => e.date === date && e.prayer === prayer);
      if (current && isLogged(current)) {
        await persist(clearEntry(prev, date, prayer), date);
        return 'written';
      }
      const status = quickLogStatus(prayer, timings, now, options.tomorrow, day);
      if (!status) return 'nothing';
      if (status === 'ask') return 'ask';
      await persist(upsertEntry(prev, date, prayer, status), date);
      return 'written';
    },
    [persist],
  );

  const askedAt = useCallback(
    (
      prayer: JournalPrayer,
      timings: TimingsMap,
      options: { day?: Date; tomorrow?: TimingsMap } = {},
    ) => {
      const now = new Date();
      const phase = quickLogPhase(
        prayer,
        timings,
        now,
        options.tomorrow,
        options.day ?? now,
      );
      return { phase, answers: passedPrayerAnswers(phase) };
    },
    [],
  );

  const record = useCallback(
    async (prayer: JournalPrayer, day: Date, status: PassedPrayerAnswer) => {
      if (!hydratedRef.current) return;
      const date = dayKey(day);
      await persist(upsertEntry(journalRef.current, date, prayer, status), date);
    },
    [persist],
  );

  return useMemo(
    () => ({ hydrated: store.hydrated, statusOf, toggle, askedAt, record }),
    [store.hydrated, statusOf, toggle, askedAt, record],
  );
}
