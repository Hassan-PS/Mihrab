/**
 * What Home's Quran card should say (design review 2b).
 *
 * The card used to be one wide button reading "Open the Quran" — an
 * unfalsifiable label on the widest element of the screen, while the app
 * already knew the last page, the khatmah plan and today's portion and
 * surfaced none of it. Four states, and the card picks the most useful TRUE
 * thing it can say:
 *
 *   khatmah  — a plan is running and pages remain for today
 *   done     — the plan is running and today's portion is finished
 *   continue — a bookmark exists but no plan
 *   ayah     — nothing started; show the verse of the day instead of an
 *              empty shelf, since a first run has neither of the above
 *
 * The review's own note is the reason this is a selector and not four
 * branches inside the view: four states in one card is four code paths, and
 * they belong somewhere testable. The view stays dumb.
 */
import {
  KHATMAH_TOTAL_AYAHS,
  khatmahAyahsRead,
  khatmahDay,
  khatmahDaysLeft,
  khatmahPages,
  type KhatmahPlan,
  type LastRead,
  type QuranState,
} from './quranState';

export type QuranCardState =
  | { kind: 'ayah' }
  | { kind: 'continue'; lastRead: LastRead }
  | {
      kind: 'khatmah';
      lastRead: LastRead | null;
      /** 1-based day within the plan. */
      dayNumber: number;
      targetDays: number;
      /** Pages still to read today (≥ 1 in this state). */
      pagesLeftToday: number;
      /** 0…1 of the whole mushaf. */
      progress: number;
    }
  | {
      kind: 'done';
      dayNumber: number;
      targetDays: number;
      daysToGo: number;
      progress: number;
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
  const lastRead = state.lastRead;

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
    const dayNumber = day.portion.day;
    const progress = Math.max(
      0,
      Math.min(1, khatmahAyahsRead(plan) / KHATMAH_TOTAL_AYAHS),
    );
    if (day.done) {
      return {
        kind: 'done',
        dayNumber,
        targetDays: plan.targetDays,
        daysToGo: khatmahDaysLeft(plan, now),
        progress,
      };
    }
    return {
      kind: 'khatmah',
      lastRead,
      dayNumber,
      targetDays: plan.targetDays,
      pagesLeftToday: Math.max(1, pages.leftToday),
      progress,
    };
  }

  if (lastRead) return { kind: 'continue', lastRead };
  return { kind: 'ayah' };
}
