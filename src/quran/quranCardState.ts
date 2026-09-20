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
import { countRanges } from './khatmahDone';
import { islamicDayKey } from '../hijri/islamicDay';
import { firstAyahOfPage } from './pages';
import { type RiwayahId } from './riwayat';
import {
  KHATMAH_TOTAL_AYAHS,
  khatmahDay,
  planDays,
  khatmahDaysLeft,
  khatmahDone,
  khatmahGap,
  khatmahOnlyGapsLeft,
  khatmahPages,
  isLivePlan,
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
  /**
   * A stretch behind the reader that was never read, if there is one, and
   * where to go for it. Null is the ordinary case.
   *
   * It exists because the plan no longer stalls on one: reading on is
   * credited and the hole stays open, so something has to say the hole is
   * there — otherwise a khatmah could be "finished" with pages in it the
   * reader knows they skipped. See `khatmahGap`.
   */
  gap: KhatmahGap | null;
};

export type KhatmahGap = {
  /** The nearest unread page — what a tap opens. */
  target: KhatmahTarget;
  /** Every unread page behind the reader, not just this stretch's. */
  pages: number;
  /** The day the nearest one belongs to. */
  day: number;
  /** All of them fall in that day, so naming it is honest. */
  oneDay: boolean;
  /**
   * There is nothing left AHEAD — these holes are the whole of the
   * reading that remains. The door becomes the way back to them, and the
   * row inside it would be saying the same thing twice.
   */
  onlyLeft: boolean;
};

export type QuranCardState = {
  khatmah: QuranCardKhatmah | null;
  reading: LastRead | null;
};

/** `khatmahGap` as something the card can open. */
function gapDoor(plan: KhatmahPlan, riwayah: RiwayahId): KhatmahGap | null {
  const gap = khatmahGap(plan, riwayah);
  if (!gap) return null;
  const start = firstAyahOfPage(gap.page, riwayah);
  return {
    target: { page: gap.page, surah: start.surah, ayah: start.ayah },
    pages: gap.pages,
    day: gap.day,
    oneDay: gap.oneDay,
    onlyLeft: khatmahOnlyGapsLeft(plan),
  };
}

/** The same day the store writes its snapshot under — see `quranState`. */
function localYmd(now: number): string {
  return islamicDayKey(new Date(now));
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
  return state.khatmah.find(isLivePlan);
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
      // The plan's LENGTH, not the number it was made with: a plan paced
      // to a date is as long as the calendar says (issue #53), and "day 9
      // of 30" has to mean the same thing here, on the khatmah card and
      // on the widget.
      targetDays: planDays(plan),
      done: day.done,
      pagesLeftToday: day.done ? 0 : Math.max(1, pages.leftToday),
      daysToGo: khatmahDaysLeft(plan, now),
      // What was READ, not the contiguous run: one un-marked page early
      // on would otherwise drag the bar back to that page and report a
      // plan two thirds done as barely started.
      progress: Math.max(
        0,
        Math.min(1, countRanges(khatmahDone(plan)) / KHATMAH_TOTAL_AYAHS),
      ),
      target: khatmahContinueTarget(plan, state.prefs.riwayah),
      gap: gapDoor(plan, state.prefs.riwayah),
    };
  }

  return {
    khatmah,
    reading: readingContinueTarget(state, state.prefs.riwayah),
  };
}
