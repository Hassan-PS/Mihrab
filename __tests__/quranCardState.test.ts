/**
 * Home's Quran card picks the most useful TRUE state (design review 2b).
 *
 * The old card was one wide "Open the Quran" button — a label that can never
 * be wrong, which is exactly why it carried no information. These four
 * states are the contract that replaced it, and each one has to be reachable
 * from a plausible store.
 */
import {
  pagesReadToday,
  selectQuranCardState,
} from '../src/quran/quranCardState';
import {
  khatmahPortion,
  type KhatmahPlan,
  type QuranState,
} from '../src/quran/quranState';
import { DEFAULT_RIWAYAH } from '../src/quran/riwayat';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 7, 1, 12, 0, 0).getTime();

const base: QuranState = {
  version: 1,
  lastRead: null,
  bookmarks: [],
  starred: [],
  khatmah: [],
  prefs: { riwayah: DEFAULT_RIWAYAH } as QuranState['prefs'],
};

const lastRead = {
  surah: 2,
  ayah: 283,
  page: 49,
  mode: 'mushaf' as const,
  updatedAt: NOW - 3 * DAY,
};

function plan(over: Partial<KhatmahPlan> = {}): KhatmahPlan {
  return {
    id: 'k1',
    startedAt: NOW - 11 * DAY,
    targetDays: 30,
    pagesRead: 240,
    completedAt: null,
    ...over,
  };
}

/** Local YYYY-MM-DD for a timestamp, matching the store's own day key. */
function ymd(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

describe('selectQuranCardState', () => {
  it('shows the verse of the day when nothing has been started', () => {
    expect(selectQuranCardState(base, NOW)).toEqual({ kind: 'ayah' });
  });

  it('offers to continue when a bookmark exists but no plan', () => {
    const state = selectQuranCardState({ ...base, lastRead }, NOW);
    expect(state.kind).toBe('continue');
    if (state.kind === 'continue') expect(state.lastRead.page).toBe(49);
  });

  it('reports the plan while pages remain today', () => {
    // Six portions behind it, so the reader is on the seventh — whatever
    // the calendar says. That is the fault this pins: the card counted
    // midnights while the Quran screen counted portions, so the two
    // disagreed about what day it was.
    const at = plan({ ayahsRead: khatmahPortion(plan(), 6).to });
    const state = selectQuranCardState({ ...base, lastRead, khatmah: [at] }, NOW);
    expect(state.kind).toBe('khatmah');
    if (state.kind !== 'khatmah') return;
    expect(state.dayNumber).toBe(7);
    expect(state.targetDays).toBe(30);
    expect(state.pagesLeftToday).toBeGreaterThan(0);
    expect(state.progress).toBeCloseTo(khatmahPortion(plan(), 6).to / 6236, 5);
  });

  it("says so once today's portion is finished", () => {
    // Read to the end of the sixth portion, having started the day at its
    // beginning: the day is done, and stays done however much is read on.
    const done = plan({
      ayahsRead: khatmahPortion(plan(), 6).to,
      dayStartDate: ymd(NOW),
      dayStartAyahsRead: khatmahPortion(plan(), 5).to,
    });
    const state = selectQuranCardState({ ...base, khatmah: [done] }, NOW);
    expect(state.kind).toBe('done');
    if (state.kind === 'done') {
      expect(state.dayNumber).toBe(6);
      expect(state.daysToGo).toBe(24);
    }
  });

  it('never reports a completed plan as running', () => {
    const finished = plan({ completedAt: NOW - DAY, pagesRead: 604 });
    expect(selectQuranCardState({ ...base, khatmah: [finished] }, NOW)).toEqual({
      kind: 'ayah',
    });
  });

  it('does not run past the last day of the plan', () => {
    // Nothing read for ninety days is still day one — the plan waits for
    // the reader, it does not run off without them.
    const late = plan({ startedAt: NOW - 90 * DAY, ayahsRead: 0 });
    const state = selectQuranCardState({ ...base, khatmah: [late] }, NOW);
    if (state.kind === 'khatmah' || state.kind === 'done') {
      expect(state.dayNumber).toBe(1);
    } else {
      throw new Error(`unexpected state ${state.kind}`);
    }
  });
});

describe('pagesReadToday', () => {
  it('is zero when the day snapshot belongs to an earlier day', () => {
    expect(
      pagesReadToday(plan({ dayStartDate: ymd(NOW - DAY), dayStartPagesRead: 100 }), NOW),
    ).toBe(0);
  });

  it("counts only today's pages", () => {
    expect(
      pagesReadToday(plan({ dayStartDate: ymd(NOW), dayStartPagesRead: 233 }), NOW),
    ).toBe(7);
  });

  it('never goes negative if a plan was rewound', () => {
    expect(
      pagesReadToday(plan({ dayStartDate: ymd(NOW), dayStartPagesRead: 300 }), NOW),
    ).toBe(0);
  });
});
