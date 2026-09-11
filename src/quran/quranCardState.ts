/**
 * What the Quran doors say — on Home's card and at the top of the Qur'an
 * tab, which draw the same thing (design review 2b; issue #41).
 *
 * The card used to be one wide button reading "Open the Quran" — an
 * unfalsifiable label on the widest element of the screen, while the app
 * already knew the last page, the khatmah plan and today's portion and
 * surfaced none of it. It became four states, and the four had one flaw:
 * they were EITHER a khatmah OR a place to continue reading, and a reader
 * who keeps a khatmah and reads Al-Kahf on Fridays has two places to go
 * back to, not one. With a plan running the card said "Continue" and
 * opened the last page looked at, which was sometimes the plan and
 * sometimes not, and never said which.
 *
 * So: two doors, each present when it is true, each leading exactly where
 * it says.
 *
 *   khatmah — a plan is running: its day, what is left today or that it
 *             is done, and the plan's OWN next page (`khatmahContinueTarget`
 *             — never the last page looked at).
 *   reading — the reading marker (`quranState.lastRead`), unless it is
 *             riding with the plan, in which case the khatmah door already
 *             leads there and a second door to the same page is noise
 *             (`readingContinueTarget`).
 *
 * Neither is the "start" state: the way into the muṣḥaf and the offer of a
 * khatmah. It used to show the verse of the day there; that is a reading,
 * and Today is not where one is read — the card's job is the way in.
 *
 * A selector and not branches inside the view, as the review's own note
 * asks: the states belong somewhere testable, and two screens draw them.
 */
import { khatmahContinueTarget, type KhatmahTarget } from './khatmahTarget';
import {
  KHATMAH_TOTAL_AYAHS,
  khatmahAyahsRead,
  khatmahDay,
  khatmahDaysLeft,
  khatmahPages,
  readingContinueTarget,
  type KhatmahPlan,
  type LastRead,
  type QuranState,
} from './quranState';

export type QuranCardKhatmah = {
  /** 1-based day within the plan. */
  dayNumber: number;
  targetDays: number;
  /** Today's portion is finished; the door still opens, on the next one. */
  done: boolean;
  /** Pages still to read today; 0 once done. */
  pagesLeftToday: number;
  daysToGo: number;
  /** 0…1 of the whole muṣḥaf. */
  progress: number;
  /** Where "Continue khatmah" leads. */
  target: KhatmahTarget;
};

export type QuranCardState = {
  khatmah: QuranCardKhatmah | null;
  reading: LastRead | null;
};

function localYmd(now: number): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Pages of the plan read since the start of the local day. */
export function pagesReadToday(plan: KhatmahPlan, now: number): number {
  // The day snapshot is only written when progress is recorded, so a plan
  // whose snapshot names an earlier date has read nothing today.
  if (plan.dayStartDate !== localYmd(now)) return 0;
  const base = plan.dayStartPagesRead ?? plan.pagesRead;
  return Math.max(0, plan.pagesRead - base);
}

export function activeKhatmah(state: QuranState): KhatmahPlan | undefined {
  return state.khatmah.find(k => k.completedAt == null);
}

export function selectQuranCardState(
  state: QuranState,
  now: number = Date.now(),
): QuranCardState {
  const plan = activeKhatmah(state);
  let khatmah: QuranCardKhatmah | null = null;

  if (plan) {
    /**
     * ── ONE DAY NUMBER, AND IT IS THE READER'S ────────────────────────
     *
     * This used to count midnights since the plan started, while the
     * Quran screen counted portions actually reached. Two cards, two
     * answers to "what day am I on", and a reader who had read ahead saw
     * both of them at once.
     *
     * The portion is the one that is true: it is what the page marker,
     * the widget and the done pill are all keyed to. What is left today
     * is likewise the portion's own pages rather than "what remains
     * divided by the days remaining", which moved every midnight and
     * counted a portion finished last night for nothing this morning.
     */
    const day = khatmahDay(plan, now);
    const pages = khatmahPages(plan, state.prefs.riwayah, now);
    khatmah = {
      dayNumber: day.portion.day,
      targetDays: plan.targetDays,
      done: day.done,
      pagesLeftToday: day.done ? 0 : Math.max(1, pages.leftToday),
      daysToGo: khatmahDaysLeft(plan, now),
      progress: Math.max(
        0,
        Math.min(1, khatmahAyahsRead(plan) / KHATMAH_TOTAL_AYAHS),
      ),
      target: khatmahContinueTarget(plan, state.prefs.riwayah),
    };
  }

  return {
    khatmah,
    reading: readingContinueTarget(state, state.prefs.riwayah),
  };
}
