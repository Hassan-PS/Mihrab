/**
 * Home's Quran card picks the most useful TRUE state (design review 2b).
 *
 * The old card was one wide "Open the Quran" button — a label that can never
 * be wrong, which is exactly why it carried no information. Two doors are
 * the contract that replaced it — the khatmah's and the reader's own
 * (#41) — and each has to be reachable from a plausible store.
 */
import {
  pagesReadToday,
  selectQuranCardState,
} from '../src/quran/quranCardState';
import {
  khatmahCurrentPage,
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
  it('offers the way in when nothing has been started — never a verse to read here', () => {
    expect(selectQuranCardState(base, NOW)).toEqual({ khatmah: null, reading: null });
  });

  it('offers to continue reading when a marker exists but no plan', () => {
    const state = selectQuranCardState({ ...base, lastRead }, NOW);
    expect(state.khatmah).toBeNull();
    expect(state.reading?.page).toBe(49);
  });

  it('reports the plan while pages remain today, and leads to ITS page', () => {
    // Six portions behind it, so the reader is on the seventh — whatever
    // the calendar says. That is the fault this pins: the card counted
    // midnights while the Quran screen counted portions, so the two
    // disagreed about what day it was.
    const at = plan({ ayahsRead: khatmahPortion(plan(), 6).to });
    const state = selectQuranCardState({ ...base, khatmah: [at] }, NOW);
    const k = state.khatmah;
    expect(k).not.toBeNull();
    if (!k) return;
    expect(k.done).toBe(false);
    expect(k.dayNumber).toBe(7);
    expect(k.targetDays).toBe(30);
    expect(k.pagesLeftToday).toBeGreaterThan(0);
    expect(k.progress).toBeCloseTo(khatmahPortion(plan(), 6).to / 6236, 5);
    // The plan's own next page — never the last page looked at (#41).
    expect(k.target.page).toBe(khatmahCurrentPage(at));
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
    expect(state.khatmah?.done).toBe(true);
    expect(state.khatmah?.pagesLeftToday).toBe(0);
    expect(state.khatmah?.dayNumber).toBe(6);
    expect(state.khatmah?.daysToGo).toBe(24);
  });

  it('never reports a completed plan as running', () => {
    const finished = plan({ completedAt: NOW - DAY, pagesRead: 604 });
    expect(selectQuranCardState({ ...base, khatmah: [finished] }, NOW)).toEqual({
      khatmah: null,
      reading: null,
    });
  });

  it('does not run past the last day of the plan', () => {
    // Nothing read for ninety days is still day one — the plan waits for
    // the reader, it does not run off without them.
    const late = plan({ startedAt: NOW - 90 * DAY, ayahsRead: 0 });
    const state = selectQuranCardState({ ...base, khatmah: [late] }, NOW);
    expect(state.khatmah?.dayNumber).toBe(1);
  });

  /**
   * Two trails through one book — issue #41. A reader who keeps a
   * khatmah and reads Al-Kahf on Fridays has two places to go back to,
   * and the card offers both; a marker that is riding with the plan is
   * not a second place, and gets no second door.
   */
  describe('two doors', () => {
    const at = plan({ ayahsRead: khatmahPortion(plan(), 6).to });
    const frontier = khatmahCurrentPage(at);

    it('opens both when the marker is somewhere the plan is not', () => {
      const kahf = { ...lastRead, surah: 18, ayah: 40, page: 297 };
      const state = selectQuranCardState({ ...base, lastRead: kahf, khatmah: [at] }, NOW);
      expect(state.khatmah?.target.page).toBe(frontier);
      expect(state.reading?.page).toBe(297);
      expect(state.reading?.ayah).toBe(40);
    });

    it('opens one when the marker is riding with the plan', () => {
      // Every marker written before the two trails existed sits on the
      // plan's page; a door to it beside the khatmah's would be two doors
      // to one page.
      const riding = { ...lastRead, page: frontier };
      const state = selectQuranCardState({ ...base, lastRead: riding, khatmah: [at] }, NOW);
      expect(state.khatmah).not.toBeNull();
      expect(state.reading).toBeNull();
      // And a spread's second page is still the plan's.
      const beside = { ...lastRead, page: frontier + 1 };
      expect(
        selectQuranCardState({ ...base, lastRead: beside, khatmah: [at] }, NOW).reading,
      ).toBeNull();
    });

    it('does not mistake a page well behind the plan for the plan', () => {
      // Re-reading Al-Baqarah with the plan in juz ten is the reader's own
      // reading, and the marker there is theirs to come back to.
      const behind = { ...lastRead, page: 5 };
      const state = selectQuranCardState({ ...base, lastRead: behind, khatmah: [at] }, NOW);
      expect(state.reading?.page).toBe(5);
    });
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
