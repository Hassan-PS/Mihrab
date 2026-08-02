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
import type { KhatmahPlan, QuranState } from '../src/quran/quranState';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 7, 1, 12, 0, 0).getTime();

const base: QuranState = {
  version: 1,
  lastRead: null,
  bookmarks: [],
  starred: [],
  khatmah: [],
  prefs: {} as QuranState['prefs'],
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
    const state = selectQuranCardState(
      { ...base, lastRead, khatmah: [plan()] },
      NOW,
    );
    expect(state.kind).toBe('khatmah');
    if (state.kind !== 'khatmah') return;
    expect(state.dayNumber).toBe(12);
    expect(state.targetDays).toBe(30);
    expect(state.pagesLeftToday).toBeGreaterThan(0);
    // 240 of 604 pages.
    expect(state.progress).toBeCloseTo(240 / 604, 5);
  });

  it("says so once today's portion is finished", () => {
    // khatmahToday spreads 364 remaining pages over 19 days → 20 today.
    const done = plan({
      dayStartDate: ymd(NOW),
      dayStartPagesRead: 240 - 25,
    });
    const state = selectQuranCardState({ ...base, khatmah: [done] }, NOW);
    expect(state.kind).toBe('done');
    if (state.kind === 'done') {
      expect(state.daysToGo).toBeGreaterThan(0);
      expect(state.dayNumber).toBe(12);
    }
  });

  it('never reports a completed plan as running', () => {
    const finished = plan({ completedAt: NOW - DAY, pagesRead: 604 });
    expect(selectQuranCardState({ ...base, khatmah: [finished] }, NOW)).toEqual({
      kind: 'ayah',
    });
  });

  it('caps the day number at the plan length', () => {
    const late = plan({ startedAt: NOW - 90 * DAY });
    const state = selectQuranCardState({ ...base, khatmah: [late] }, NOW);
    if (state.kind === 'khatmah' || state.kind === 'done') {
      expect(state.dayNumber).toBe(30);
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
