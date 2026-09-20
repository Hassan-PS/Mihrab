/**
 * A page read is a page done — the set, the window, and the mark.
 *
 * Progress used to be a high-water mark, which could only say how far.
 * It had to count pages nobody read when a reader skipped forward, and it
 * had nowhere to put today's portion read out of order. These pin the
 * replacement: which pages are done, what may be credited right now, and
 * that a plan written before any of this still behaves exactly as it did.
 */
import {
  __resetQuranStateForTests,
  activeKhatmah,
  coerceQuranState,
  getQuranState,
  isKhatmahPageDone,
  khatmahAyahsRead,
  khatmahCreditWindow,
  ayahsThroughPage,
  khatmahCurrentPortion,
  khatmahBehindBy,
  khatmahDay,
  khatmahDaysLeft,
  khatmahDone,
  khatmahGap,
  khatmahIsComplete,
  khatmahOnlyGapsLeft,
  khatmahPages,
  khatmahReachPage,
  khatmahStartAyah,
  khatmahTracksPage,
  recordKhatmahPageTurn,
  resetKhatmahAll,
  resetKhatmahToday,
  setKhatmahPosition,
  startKhatmah,
  stepKhatmahBack,
  finishKhatmahPortion,
  khatmahCurrentPage,
  toggleKhatmahPageDone,
  KHATMAH_TOTAL_AYAHS,
} from '../src/quran/quranState';
import { countRanges } from '../src/quran/khatmahDone';
import { khatmahContinueTarget } from '../src/quran/khatmahTarget';
import { selectQuranCardState } from '../src/quran/quranCardState';
import { buildReadingBlock } from '../src/widget/widgetBlocks';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mergeKhatmah } from '../src/sync/merge';
import { pageProgressOf } from '../src/quran/PageProgressMark';

const plan = () => activeKhatmah(getQuranState())!;
const read = (from: number, to: number) => {
  for (let p = from; p < to; p++) recordKhatmahPageTurn(p, p + 1);
};

beforeEach(() => {
  __resetQuranStateForTests();
});

describe('a plan from before the set still behaves exactly as it did', () => {
  it('its high-water mark becomes one range, and nothing is lost', () => {
    const old = {
      id: 'k', startedAt: 1, targetDays: 30, pagesRead: 100, completedAt: null,
    };
    const s = coerceQuranState({ version: 1, khatmah: [old] });
    const p = s.khatmah[0];
    expect(p.done).toBeUndefined(); // untouched on disk
    expect(khatmahDone(p)[0][0]).toBe(1); // ...but read as a set
    expect(khatmahAyahsRead(p)).toBeGreaterThan(0);
    expect(isKhatmahPageDone(p, 50)).toBe(true);
    expect(isKhatmahPageDone(p, 300)).toBe(false);
  });

  it('and a plan that began mid-mushaf owns only what follows its start', () => {
    const old = {
      id: 'k', startedAt: 1, targetDays: 30, pagesRead: 200,
      fromPage: 143, completedAt: null,
    };
    const p = coerceQuranState({ version: 1, khatmah: [old] }).khatmah[0];
    expect(khatmahDone(p)[0][0]).toBe(khatmahStartAyah(p));
    expect(isKhatmahPageDone(p, 100)).toBe(false); // behind its start
    expect(isKhatmahPageDone(p, 180)).toBe(true);
  });
});

describe('the window is the portion, not a distance', () => {
  beforeEach(() => startKhatmah(30));

  it('opens on today’s portion', () => {
    const [from, to] = khatmahCreditWindow(plan());
    const portion = khatmahCurrentPortion(plan());
    expect(from).toBeLessThanOrEqual(portion.from);
    expect(to).toBe(portion.to);
  });

  it('refuses a future day, which is what stops a plan being finished out of order', () => {
    const portion = khatmahCurrentPortion(plan());
    const [, to] = khatmahCreditWindow(plan());
    expect(to).toBeLessThan(portion.to + 1000);
  });

  it('and opens into the next once today’s is done', () => {
    const portion = khatmahCurrentPortion(plan());
    // Read the whole portion, then ask again.
    read(1, 40);
    const after = khatmahCreditWindow(plan());
    if (countRanges(khatmahDone(plan())) >= portion.to - portion.from + 1) {
      expect(after[1]).toBeGreaterThan(portion.to);
    }
  });
});

describe('reading counts however the reader arrived', () => {
  beforeEach(() => startKhatmah(30));

  it('pages turned are pages done', () => {
    read(1, 6);
    expect(isKhatmahPageDone(plan(), 1)).toBe(true);
    expect(isKhatmahPageDone(plan(), 4)).toBe(true);
    expect(isKhatmahPageDone(plan(), 60)).toBe(false);
  });

  it('a jump credits nothing — it reports the same page twice', () => {
    recordKhatmahPageTurn(100, 100);
    expect(countRanges(khatmahDone(plan()))).toBe(0);
  });

  it('and a page of a future day is refused', () => {
    expect(khatmahTracksPage(1)).toBe(true);
    expect(khatmahTracksPage(400)).toBe(false);
  });
});

describe('the mark beside the surah name', () => {
  it('says nothing at all without a plan', () => {
    expect(pageProgressOf(getQuranState(), 5)).toBeNull();
  });

  it('is amber for a page still to read and a check once it is', () => {
    startKhatmah(30);
    expect(pageProgressOf(getQuranState(), 3)).toBe('toRead');
    read(1, 6);
    expect(pageProgressOf(getQuranState(), 3)).toBe('done');
    // Still amber further into today's portion.
    expect(pageProgressOf(getQuranState(), 18)).toBe('toRead');
  });

  it('says nothing out past what the plan may credit today', () => {
    // A plan in Aal-Imran and a reader in al-Kahf. The mark is a
    // control: offering one out there would offer a claim the plan
    // cannot honour without inventing the portions in between.
    startKhatmah(30);
    expect(khatmahTracksPage(293)).toBe(false);
    expect(pageProgressOf(getQuranState(), 293)).toBeNull();
    // And it comes back the moment the window reaches it.
    read(1, 292);
    expect(pageProgressOf(getQuranState(), 293)).toBe('toRead');
  });

  it('says nothing behind the start of a plan begun mid-mushaf', () => {
    startKhatmah(30, { page: 143 });
    // The plan does not own these pages, so there is nothing to offer:
    // neither the header mark nor the ayah sheet may propose a toggle
    // that `toggleKhatmahPageDone` would decline.
    expect(pageProgressOf(getQuranState(), 100)).toBeNull();
    expect(pageProgressOf(getQuranState(), 150)).toBe('toRead');
  });
});

describe('a page can be marked by hand', () => {
  beforeEach(() => startKhatmah(30));

  it('marks a page nobody could see you read', () => {
    // Read on paper, or on someone else's phone. One tap says so.
    expect(pageProgressOf(getQuranState(), 3)).toBe('toRead');
    toggleKhatmahPageDone(3);
    expect(pageProgressOf(getQuranState(), 3)).toBe('done');
  });

  it('and takes back one the plan credited that you had not read', () => {
    read(1, 6);
    expect(isKhatmahPageDone(plan(), 3)).toBe(true);
    toggleKhatmahPageDone(3);
    expect(isKhatmahPageDone(plan(), 3)).toBe(false);
    // The pages around it are untouched — the thing a high-water mark
    // could never do, since winding back took everything after it.
    expect(isKhatmahPageDone(plan(), 2)).toBe(true);
    expect(isKhatmahPageDone(plan(), 4)).toBe(true);
  });

  it('but not one the plan has not reached — the tap obeys the window', () => {
    // The same gate reading passes through. A tap is a claim about a
    // page, not a licence to skip the fifty portions before it, and the
    // gate is held in the state so no caller can get around it.
    expect(khatmahTracksPage(400)).toBe(false);
    toggleKhatmahPageDone(400);
    expect(isKhatmahPageDone(plan(), 400)).toBe(false);
  });

  it('reaches the end of the portion in hand, and the edge moves with you', () => {
    // The window ends at the portion the reader stands in, and standing
    // moves — `khatmahCreditWindow`. One portion at a time, never a leap.
    let last = 1;
    while (khatmahTracksPage(last + 1)) last += 1;
    toggleKhatmahPageDone(last + 1);
    expect(isKhatmahPageDone(plan(), last + 1)).toBe(false);
    toggleKhatmahPageDone(last);
    expect(isKhatmahPageDone(plan(), last)).toBe(true);
    expect(khatmahTracksPage(last + 1)).toBe(true);
    expect(khatmahTracksPage(last + 40)).toBe(false);
  });

  it('winds the legacy mirror back to the first gap, never past it', () => {
    read(1, 6);
    const before = plan().ayahsRead!;
    toggleKhatmahPageDone(3);
    expect(plan().ayahsRead!).toBeLessThan(before);
    // Exactly the contiguous run: everything up to the hole just made.
    expect(plan().ayahsRead!).toBe(khatmahDone(plan())[0][1]);
  });

  it('toggling twice puts it back exactly', () => {
    read(1, 6);
    const before = khatmahDone(plan());
    toggleKhatmahPageDone(3);
    toggleKhatmahPageDone(3);
    expect(khatmahDone(plan())).toEqual(before);
  });

  it('does nothing without a plan', () => {
    __resetQuranStateForTests();
    toggleKhatmahPageDone(3);
    expect(getQuranState().khatmah).toHaveLength(0);
  });
});

describe('a gap behind the reader does not freeze the frontier', () => {
  beforeEach(() => startKhatmah(30));

  // Reading cannot make a hole: `recordKhatmahProgress` marks everything
  // from the plan's start up to the page reached, so a jump forward
  // inside the window fills the span behind it. A hole comes from the
  // reader SAYING one is there — un-marking a page they had not really
  // read — and from two devices' sets meeting in a merge.
  const holeAtPage11 = () => {
    read(1, 21); // day one, in full
    toggleKhatmahPageDone(11); // "I never actually read that one"
  };

  it('the contiguous run winds back, as a legacy device must see it', () => {
    holeAtPage11();
    expect(khatmahAyahsRead(plan())).toBe(ayahsThroughPage(10, 'hafs'));
  });

  it('but reading on is still credited', () => {
    // This is the fix. The frontier used to BE the contiguous run, so
    // one un-marked page behind the reader refused every page of every
    // day after it until they went back — the plan looked stuck, and
    // nothing said why.
    holeAtPage11();
    expect(khatmahTracksPage(21)).toBe(true);
    read(21, 26);
    expect(isKhatmahPageDone(plan(), 25)).toBe(true);
  });

  it('and the hole SURVIVES reading on, which is the whole point', () => {
    // The bug this pins: crediting runs from the plan's start, so one
    // page turn after an un-mark filled the hole back in — locally, and
    // before sync even came into it. The feature lasted one page.
    holeAtPage11();
    read(21, 26);
    expect(isKhatmahPageDone(plan(), 11)).toBe(false);
    expect(khatmahGap(plan())).toEqual({ page: 11, pages: 1, day: 1, oneDay: true });
    // And the legacy mirror still stops at the hole, so an older device
    // is not told about pages nobody has read.
    expect(khatmahAyahsRead(plan())).toBe(ayahsThroughPage(10, 'hafs'));
  });

  it('but going back and reading it does close it', () => {
    holeAtPage11();
    read(21, 26);
    read(11, 12);
    expect(isKhatmahPageDone(plan(), 11)).toBe(true);
    expect(khatmahGap(plan())).toBeNull();
  });

  it('and a fling still credits every page it crossed', () => {
    // Issue #44's rule, which is why a turn credits the pages LEFT
    // BEHIND rather than only the one it landed on.
    __resetQuranStateForTests();
    startKhatmah(30);
    recordKhatmahPageTurn(1, 6);
    for (const p of [1, 2, 3, 4, 5]) {
      expect(isKhatmahPageDone(plan(), p)).toBe(true);
    }
  });

  it('and a page the reader has not reached is still refused', () => {
    holeAtPage11();
    expect(khatmahTracksPage(293)).toBe(false); // al-Kahf, fifty portions on
  });

  it('names the hole and the page to go to', () => {
    holeAtPage11();
    expect(khatmahGap(plan())).toEqual({ page: 11, pages: 1, day: 1, oneDay: true });
  });

  it('measures a hole several pages wide', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    toggleKhatmahPageDone(12);
    toggleKhatmahPageDone(13);
    expect(khatmahGap(plan())).toEqual({ page: 11, pages: 3, day: 1, oneDay: true });
  });

  it('says nothing when the unread part is simply where you stopped', () => {
    // The frontier is not a hole: nothing has been read past it.
    read(1, 11);
    expect(khatmahGap(plan())).toBeNull();
  });

  it('nor when there is no hole at all', () => {
    read(1, 21);
    expect(khatmahGap(plan())).toBeNull();
  });

  it('closes once the hole is filled, by reading or by hand', () => {
    holeAtPage11();
    expect(khatmahGap(plan())?.page).toBe(11);
    toggleKhatmahPageDone(11);
    expect(khatmahGap(plan())).toBeNull();
  });

  it('counts EVERY unread page behind the reader, not just the first run', () => {
    // Five skipped, one read, another missed, the rest read. Two
    // stretches: reporting one would have the reader close a gap, be
    // told about another, and never know what was outstanding.
    read(1, 21);
    for (const p of [5, 6, 7, 8, 9, 11]) toggleKhatmahPageDone(p);
    const gap = khatmahGap(plan())!;
    expect(gap.page).toBe(5); // the nearest of them is where Go leads
    expect(gap.pages).toBe(6); // 5–9 and 11
    expect(gap.oneDay).toBe(true);
  });

  it('and drops the day once they straddle more than one', () => {
    read(1, 41); // two portions
    toggleKhatmahPageDone(5); // day one
    toggleKhatmahPageDone(35); // day two
    const gap = khatmahGap(plan())!;
    expect(gap.pages).toBe(2);
    expect(gap.day).toBe(1);
    expect(gap.oneDay).toBe(false);
  });

  it('and walks the holes, not the pages — same answer either way', () => {
    // The scan used to ask all six hundred pages whether they were read,
    // at two ayah-to-page conversions each. A page is unread exactly
    // when a hole touches it, and holes are almost always one or two.
    read(1, 601);
    for (const p of [5, 6, 7, 300, 599]) toggleKhatmahPageDone(p);
    const gap = khatmahGap(plan())!;
    expect(gap.page).toBe(5);
    expect(gap.pages).toBe(5);
    expect(gap.oneDay).toBe(false);
  });

  it('counts a page once even when two holes share it', () => {
    // Holes are ayah ranges and a page is many ayahs: two holes inside
    // one page are one page to go and read.
    read(1, 21);
    const page = 11;
    const state = plan();
    expect(isKhatmahPageDone(state, page)).toBe(true);
    toggleKhatmahPageDone(page);
    expect(khatmahGap(plan())!.pages).toBe(1);
  });

  it('surfaces the next hole once the first is filled', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    toggleKhatmahPageDone(17);
    expect(khatmahGap(plan())?.page).toBe(11);
    toggleKhatmahPageDone(11);
    expect(khatmahGap(plan())).toEqual({ page: 17, pages: 1, day: 1, oneDay: true });
  });

  it('and reports a hole that two devices left between them', () => {
    // The case the set exists for: each side read its own part, and the
    // union is what both of them did — including what neither did.
    const base = plan();
    const mine = { ...base, done: [[1, 100]] as [number, number][] };
    const theirs = { ...base, done: [[200, 300]] as [number, number][] };
    const merged = mergeKhatmah([mine], [theirs])[0];
    expect(khatmahGap(merged)?.day).toBe(1);
    expect(khatmahGap(merged)!.pages).toBeGreaterThan(1);
  });
});

describe('every door offers the same place', () => {
  // Home and the Qur'an tab draw the same rows from the same selector,
  // so "synced" is a question about the SOURCE: whatever the plan says
  // its next page is, both show it, and so do the widget and the
  // reminder (`khatmahContinueTarget`).
  beforeEach(() => startKhatmah(30));

  it('the plan’s next page is where the reader actually is', () => {
    read(1, 21);
    expect(khatmahCurrentPage(plan())).toBe(21);
  });

  it('and a hole behind them does not drag it back', () => {
    // The bug: one un-marked page sent every door back to it, however
    // far the reader had gone since. The hole gets its own offer now.
    read(1, 21);
    toggleKhatmahPageDone(11);
    expect(khatmahCurrentPage(plan())).toBe(21);
    expect(khatmahGap(plan())?.page).toBe(11);
  });

  it('every door reads it from the one resolver', () => {
    read(1, 21);
    const page = khatmahCurrentPage(plan());
    expect(khatmahContinueTarget(plan()).page).toBe(page);
    // The card's rows are `selectQuranCardState`, which both screens call
    // with the same state — one source, so they cannot disagree.
    expect(selectQuranCardState(getQuranState()).khatmah?.target.page).toBe(page);
  });

  it('a pin still wins, because it is the reader saying so', () => {
    read(1, 21);
    setKhatmahPosition(2, 1, 2);
    expect(khatmahCurrentPage(plan())).toBe(2);
    expect(selectQuranCardState(getQuranState()).khatmah?.target.page).toBe(2);
  });

  it('and the bar reports what was read, not the contiguous run', () => {
    read(1, 21);
    const before = selectQuranCardState(getQuranState()).khatmah!.progress;
    toggleKhatmahPageDone(11);
    const after = selectQuranCardState(getQuranState()).khatmah!.progress;
    // One page of twenty, not a wind-back to page 10.
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(before * 0.9);
  });
});

describe('one answer to “where is the reader”', () => {
  // Half of these used to read the CONTIGUOUS run while the window and
  // the continue page read the reach, so one un-marked page made the card
  // nag about a finished day and claim sixty pages behind schedule over
  // two pages skipped — the gap's own report, counted twice.
  beforeEach(() => {
    startKhatmah(30);
    read(1, 21); // day one, in full
  });

  it('a finished day stays finished', () => {
    expect(khatmahDay(plan()).done).toBe(true);
    toggleKhatmahPageDone(11);
    expect(khatmahDay(plan()).done).toBe(true);
  });

  it('and today’s pages stay counted', () => {
    const before = khatmahPages(plan(), 'hafs').doneToday;
    toggleKhatmahPageDone(11);
    expect(khatmahPages(plan(), 'hafs').doneToday).toBe(before);
  });

  it('being behind is measured from where they got to', () => {
    toggleKhatmahPageDone(11);
    // Two decades of pages are NOT suddenly outstanding; the one page is
    // reported by `khatmahGap` and nowhere else.
    expect(khatmahBehindBy(plan(), Date.now(), 'hafs')).toBe(0);
    expect(khatmahGap(plan())!.pages).toBe(1);
  });

  it('and days left counts the plan, not the run', () => {
    const before = khatmahDaysLeft(plan());
    toggleKhatmahPageDone(11);
    expect(khatmahDaysLeft(plan())).toBe(before);
  });

  it('but a hole still keeps a plan from being complete', () => {
    // Built by hand rather than read to the end: finishing the book
    // completes the plan, and a completed plan is no longer the active
    // one to ask. The point is the predicate, either way.
    const full = { ...plan(), done: [[1, KHATMAH_TOTAL_AYAHS]] as [number, number][] };
    expect(khatmahIsComplete(full)).toBe(true);
    expect(khatmahDaysLeft(full)).toBe(0);
    // With the claim beside it that made the hole — reading is dated now
    // (see `AyahMark`), so a set full of read pages and a hole in it is
    // only half the story; without the denial the replay fills it back in.
    const holed = {
      ...full,
      done: [[1, 100], [102, KHATMAH_TOTAL_AYAHS]] as [number, number][],
      marks: [[101, 101, Date.now() + 1000, 0] as [number, number, number, 0 | 1]],
    };
    expect(khatmahIsComplete(holed)).toBe(false);
    expect(khatmahDaysLeft(holed)).toBeGreaterThan(0);
  });

  it('and the widget publishes the same page the card does', () => {
    toggleKhatmahPageDone(11);
    expect(khatmahReachPage(plan(), 'hafs')).toBe(20);
    // `plan.pagesRead` is the legacy mirror and still winds back — that
    // is its job, for a device that only understands one number.
    expect(plan().pagesRead).toBeLessThan(20);
  });
});

describe('the end of a khatmah read out of order', () => {
  beforeEach(() => startKhatmah(30));

  it('continuing means going back, once there is nothing ahead', () => {
    // The whole book read but for one page. The plan is live — a hole
    // keeps it from completing — and the door used to hand back the last
    // page, over and over, while the only reading left was behind them.
    const plan = {
      id: 'k',
      startedAt: 1,
      targetDays: 30,
      pagesRead: 0,
      completedAt: null,
      done: [
        [1, 100],
        [120, KHATMAH_TOTAL_AYAHS],
      ] as [number, number][],
    };
    expect(khatmahOnlyGapsLeft(plan)).toBe(true);
    expect(khatmahIsComplete(plan)).toBe(false);
    const gap = khatmahGap(plan)!;
    expect(khatmahCurrentPage(plan)).toBe(gap.page);
  });

  it('and every door agrees, because they all ask the one resolver', () => {
    const plan = {
      id: 'k',
      startedAt: 1,
      targetDays: 30,
      pagesRead: 0,
      completedAt: null,
      done: [
        [1, 100],
        [120, KHATMAH_TOTAL_AYAHS],
      ] as [number, number][],
    };
    expect(khatmahContinueTarget(plan).page).toBe(khatmahCurrentPage(plan));
  });

  it('but a plan still reading forward is not sent backward', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    expect(khatmahOnlyGapsLeft(plan())).toBe(false);
    // Forward: the page after the reach, not back to the hole.
    expect(khatmahCurrentPage(plan())).toBe(21);
  });

  it('and a plan with no holes at all ends at the end', () => {
    const plan = {
      id: 'k',
      startedAt: 1,
      targetDays: 30,
      pagesRead: 0,
      completedAt: null,
      done: [[1, KHATMAH_TOTAL_AYAHS]] as [number, number][],
    };
    expect(khatmahOnlyGapsLeft(plan)).toBe(false);
    expect(khatmahGap(plan)).toBeNull();
    expect(khatmahCurrentPage(plan)).toBe(604);
  });
});

describe('every rewind takes the marks with it', () => {
  // Progress used to be one number, so a rewind was one assignment. With
  // a set of ranges, a rewind that forgets the set leaves every check
  // green and the plan's next page where it was.
  beforeEach(() => startKhatmah(30));

  it('reset today', () => {
    read(1, 11);
    resetKhatmahToday();
    expect(isKhatmahPageDone(plan(), 5)).toBe(false);
    expect(khatmahDone(plan())).toEqual([]);
  });

  it('reset the whole plan, and it keeps the pages the plan never covered', () => {
    __resetQuranStateForTests();
    startKhatmah(30, { page: 143 });
    read(143, 160);
    resetKhatmahAll();
    expect(isKhatmahPageDone(plan(), 150)).toBe(false);
    expect(khatmahCurrentPage(plan())).toBe(143);
  });

  it('a step back', () => {
    read(1, 41); // two portions
    const wasDone = isKhatmahPageDone(plan(), 35);
    expect(wasDone).toBe(true);
    stepKhatmahBack();
    expect(isKhatmahPageDone(plan(), 35)).toBe(false);
  });

  it('and finishing the portion fills it', () => {
    finishKhatmahPortion();
    expect(isKhatmahPageDone(plan(), 5)).toBe(true);
  });

  it('a pin says where the reader is, in both directions', () => {
    read(1, 41);
    // Pinned back to the start of Al-Baqarah: what is behind it is read,
    // what is ahead of it is not — the same rule the legacy mirror has
    // always had for a pin.
    setKhatmahPosition(2, 1, 2);
    expect(isKhatmahPageDone(plan(), 35)).toBe(false);
    expect(isKhatmahPageDone(plan(), 1)).toBe(true);
  });
});

describe('the gap scan is not run twice for one answer', () => {
  it('the same set gives the same object back, without rescanning', () => {
    // It asks every page from the first hole to the reach, and
    // `selectQuranCardState` runs on every render of two screens — one of
    // which stays mounted under the reader, so that is every page turn.
    startKhatmah(30);
    read(1, 21);
    toggleKhatmahPageDone(11);
    const first = khatmahGap(plan());
    expect(khatmahGap(plan())).toBe(first); // identity, not just equality
  });

  it('and a new set gives a new answer', () => {
    startKhatmah(30);
    read(1, 21);
    toggleKhatmahPageDone(11);
    const before = khatmahGap(plan())!;
    toggleKhatmahPageDone(12);
    const after = khatmahGap(plan())!;
    expect(after).not.toBe(before);
    expect(after.pages).toBe(2);
  });

  it('and a different muṣḥaf is a different question', () => {
    startKhatmah(30);
    read(1, 21);
    toggleKhatmahPageDone(11);
    const hafs = khatmahGap(plan(), 'hafs');
    expect(khatmahGap(plan(), 'hafs')).toBe(hafs);
    // Asking for another print must not hand back the first print's answer.
    expect(khatmahGap(plan(), 'warsh')).not.toBe(hafs);
  });
});

describe('the widget says the pages are missing too', () => {
  // It would otherwise say "Done for today" about a book with pages in
  // it the reader knows they skipped — the plan no longer stalls on them,
  // so nothing else on that surface would mention them at all.
  it('publishes the count when there is one, and nothing when there is not', () => {
    startKhatmah(30);
    read(1, 21);
    const block = () =>
      buildReadingBlock({
        lastRead: getQuranState().lastRead,
        bookmarks: getQuranState().bookmarks,
        khatmah: plan(),
      });
    expect(block()?.khatmah?.skipped).toBeUndefined();
    toggleKhatmahPageDone(11);
    expect(block()?.khatmah?.skipped).toBe(1);
  });

  it('and both widgets rank it above “done for today”', () => {
    const kotlin = readFileSync(
      join(
        __dirname,
        '..',
        'android/app/src/main/java/com/prayer_times/PrayerWidgetReadingProvider.kt',
      ),
      'utf8',
    );
    // Behind schedule first, then skipped, then done — a plan that is
    // both behind and holed has one line to say it in.
    const order = ['behind > 0', 'skipped > 0', 'left == 0'];
    const at = order.map(k => kotlin.indexOf(k));
    expect(at.every(i => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const swift = readFileSync(
      join(__dirname, '..', 'ios/PrayerWidgetExtension/ReadingWidget.swift'),
      'utf8',
    );
    const sAt = ['k.behindBy > 0', 'k.skipped', 'left == 0'].map(k =>
      swift.indexOf(k),
    );
    expect(sAt.every(i => i > 0)).toBe(true);
    expect([...sAt].sort((a, b) => a - b)).toEqual(sAt);
    // And the iOS "done" line is localized now — it was a hardcoded
    // English string sitting between two resource lookups.
    expect(swift).toContain('widgetString("widget_reading_done_today")');
  });
});

describe('an un-mark survives the other device', () => {
  // `done` merges by UNION, and a union only grows: without a dated
  // claim the Mac's set puts an un-marked page straight back, every
  // round — the khatmah-delete bug one level down.
  beforeEach(() => startKhatmah(30));

  const other = (p: ReturnType<typeof plan>) => ({ ...p, marks: undefined, done: [[1, 4000]] as [number, number][] });

  it('the union alone would resurrect it; the claim stops that', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    const mine = plan();
    expect(isKhatmahPageDone(mine, 11)).toBe(false);
    const merged = mergeKhatmah([mine], [other(mine)])[0];
    expect(isKhatmahPageDone(merged, 11)).toBe(false);
    // ...and the rest of the other device's reading is still kept.
    expect(isKhatmahPageDone(merged, 50)).toBe(true);
  });

  it('whichever side is asked first', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    const mine = plan();
    const theirs = other(mine);
    const a = mergeKhatmah([mine], [theirs])[0];
    const b = mergeKhatmah([theirs], [mine])[0];
    expect(isKhatmahPageDone(a, 11)).toBe(false);
    expect(isKhatmahPageDone(b, 11)).toBe(false);
    expect(khatmahDone(a)).toEqual(khatmahDone(b));
  });

  it('and reading it again beats the un-mark, because that is dated too', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    const denied = plan();
    expect(isKhatmahPageDone(denied, 11)).toBe(false);
    // Re-read across the hole. Reading is a dated claim of its own now,
    // so this is newer than the denial and says the opposite — and the
    // LOG does not grow by it: the compaction resolves the two into the
    // verdict they amount to (`compactMarks`). What must change is what
    // the plan says about the page, not how much it had to say.
    read(10, 13);
    const mine = plan();
    expect(isKhatmahPageDone(mine, 11)).toBe(true);
    const merged = mergeKhatmah([mine], [other(mine)])[0];
    expect(isKhatmahPageDone(merged, 11)).toBe(true);
  });

  it('a plan that never claimed anything gains no key', () => {
    // A plan nobody has read a page of: reading is a claim, so this is
    // now the only way to hold a plan with no log at all — and the merge
    // must not hand one back with a `marks` key neither side had.
    const mine = plan();
    expect(mine.marks).toBeUndefined();
    const merged = mergeKhatmah([mine], [mine])[0];
    expect(merged).toEqual(mine);
    expect('marks' in merged).toBe(false);
  });

  it('merging a claiming plan with itself returns it', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    const mine = plan();
    expect(mergeKhatmah([mine], [mine])[0]).toEqual(mine);
  });

  it('claims older than the tombstone window are dropped', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    const old = {
      ...plan(),
      marks: plan().marks!.map(
        m => [m[0], m[1], 1, m[3]] as [number, number, number, 0 | 1],
      ),
    };
    const coerced = coerceQuranState({ version: 1, khatmah: [old] }).khatmah[0];
    expect(coerced.marks).toBeUndefined();
  });

  it('and the log is bounded', () => {
    read(1, 21);
    for (let i = 0; i < 200; i++) toggleKhatmahPageDone(11);
    expect(plan().marks!.length).toBeLessThanOrEqual(128);
  });
});

describe('the three fields say one thing', () => {
  // The set, and the legacy mirror derived from it. A writer that chose
  // the mirror's number could point it past a hole and tell an older
  // device about pages nobody read.
  beforeEach(() => startKhatmah(30));

  it('a turn that changes nothing writes nothing', () => {
    read(1, 21);
    const before = getQuranState();
    recordKhatmahPageTurn(5, 6); // re-reading credited ground
    expect(getQuranState()).toBe(before); // identity: no state write at all
  });

  it('“finish today” claims the portion, not the plan from its start', () => {
    read(1, 21);
    toggleKhatmahPageDone(11); // last week's un-mark
    read(21, 30);
    finishKhatmahPortion();
    // Today's portion is done, and the hole behind it is still a hole.
    expect(isKhatmahPageDone(plan(), 11)).toBe(false);
    expect(khatmahGap(plan())?.page).toBe(11);
  });

  it('and the mirror stops at the hole after every writer', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    const stop = ayahsThroughPage(10, 'hafs');
    expect(plan().ayahsRead).toBe(stop);
    read(21, 30);
    expect(plan().ayahsRead).toBe(stop);
    finishKhatmahPortion();
    expect(plan().ayahsRead).toBe(stop);
    resetKhatmahToday();
    expect(plan().ayahsRead).toBeLessThanOrEqual(stop);
  });

  it('a finished-by-hand plan is complete only when the set is', () => {
    const almost = {
      ...plan(),
      done: [[1, 100], [102, KHATMAH_TOTAL_AYAHS]] as [number, number][],
    };
    expect(khatmahIsComplete(almost)).toBe(false);
  });

  it('the page mirror counts pages FINISHED, not reached', () => {
    // A pin at 2:255 has read up to 2:254, which is partway down page 42:
    // 41 pages finished, not 42.
    setKhatmahPosition(2, 255, 42);
    expect(plan().pagesRead).toBe(41);
  });

  it('every writer stores the resolved set, so a merge with itself is itself', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    read(21, 30);
    finishKhatmahPortion();
    stepKhatmahBack();
    const mine = plan();
    expect(mergeKhatmah([mine], [mine])[0]).toEqual(mine);
  });

  it('and the merged mirror follows the merged set, never the larger number', () => {
    read(1, 21);
    toggleKhatmahPageDone(11);
    const mine = plan();
    // The other device never saw the un-mark and still counts to page 20.
    const theirs = { ...mine, marks: undefined, ayahsRead: ayahsThroughPage(20, 'hafs'), pagesRead: 20 };
    const merged = mergeKhatmah([mine], [theirs])[0];
    expect(isKhatmahPageDone(merged, 11)).toBe(false);
    expect(merged.ayahsRead).toBe(ayahsThroughPage(10, 'hafs'));
    expect(merged.pagesRead).toBe(10);
  });
});

describe('the marks belong to a khatmah reading, not to the muṣḥaf', () => {
  const mark = readFileSync(
    join(__dirname, '..', 'src', 'quran', 'PageProgressMark.tsx'),
    'utf8',
  );

  it('the hook draws nothing unless this visit came in the khatmah’s door', () => {
    // A plan is months long, so most of the book is behind one: opening
    // Al-Fatiha from the index put a green check in the header of a
    // reading that had nothing to do with the khatmah.
    expect(mark).toMatch(/const isKhatmahVisit = useKhatmahSession\(\);/);
    expect(mark).toMatch(/return isKhatmahVisit \? progress : null;/);
  });

  it('and both headers take it from the hook, never from the raw state', () => {
    for (const f of [
      'src/quran/mushafReaderCore.tsx',
      'src/screens/quran/MushafSurahScreen.tsx',
    ]) {
      const s = readFileSync(join(__dirname, '..', f), 'utf8');
      expect(s).toMatch(/usePageProgress\(/);
      expect(s).not.toMatch(/pageProgressOf\(/);
    }
  });

  it('the khatmah’s own doors say so, and no other door does', () => {
    const tab = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'QuranScreen.tsx'),
      'utf8',
    );
    expect(tab).toMatch(/openSurah\(target\.surah, target\.ayah, target\.page, undefined, true\)/);
    const card = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'home', 'QuranCard.tsx'),
      'utf8',
    );
    expect(card).toMatch(/onOpenAt\(target\.surah, target\.page, target\.ayah, true\)/);
    // The marker's door is the same shape and must NOT claim the khatmah.
    expect(card).toMatch(/onOpenAt\(marker\.surah, marker\.page, marker\.ayah\)/);
  });

  it('crediting still does not care which door it was', () => {
    // The gate that decides whether reading counts is the portion, not
    // the session — a reader who opens a surah from the index and reads
    // today's portion is still reading it.
    startKhatmah(30);
    read(1, 6);
    expect(isKhatmahPageDone(plan(), 3)).toBe(true);
  });
});

describe('the khatmah pin in the ayah sheet obeys the same window', () => {
  const sheet = readFileSync(
    join(__dirname, '..', 'src', 'quran', 'mushaf', 'AyahActionSheet.tsx'),
    'utf8',
  );

  it('is not offered on a page the plan has not reached', () => {
    // Moving the position fifty portions ahead is not a move; it is a
    // claim that everything between was read, which is the plan's to
    // decide from what was actually read.
    expect(sheet).toMatch(
      /\{plan && \(isKhatmahHere \|\| khatmahPageInWindow\(plan, page, riwayah\)\) \? \(/,
    );
  });

  it('but an existing pin can always be taken back off', () => {
    // `isKhatmahHere ||` — otherwise a pin left out there by an older
    // version, or by the plan slipping behind it, could never be removed.
    expect(sheet).toMatch(/isKhatmahHere \|\| khatmahPageInWindow/);
  });
});

describe('two devices that read different parts keep both', () => {
  const base = {
    id: 'k', startedAt: 1, targetDays: 30, pagesRead: 0, completedAt: null,
  };
  const withDone = (done: [number, number][]) => ({ ...base, done });

  it('unions rather than taking the furthest', () => {
    const phone = withDone([[1, 100]]);
    const mac = withDone([[200, 300]]);
    const merged = mergeKhatmah([phone], [mac])[0];
    expect(merged.done).toEqual([[1, 100], [200, 300]]);
  });

  it('whichever side is asked first', () => {
    const phone = withDone([[1, 100]]);
    const mac = withDone([[200, 300]]);
    expect(mergeKhatmah([phone], [mac])).toEqual(mergeKhatmah([mac], [phone]));
  });

  it('and adds no key to a pair that never had one', () => {
    const merged = mergeKhatmah([base], [base])[0];
    expect('done' in merged).toBe(false);
  });

  it('the legacy mirror never claims more than the contiguous run', () => {
    // A device still reading `ayahsRead` must not be told pages are read
    // that nobody read — progress stops at the first gap.
    startKhatmah(30);
    read(1, 4);
    const p = plan();
    expect(p.ayahsRead).toBe(
      khatmahDone(p)[0][1],
    );
    expect(p.ayahsRead).toBeLessThan(KHATMAH_TOTAL_AYAHS);
  });
});
