/**
 * The khatmah follows its own trail, and nothing else.
 *
 * Reported as "opening the Qur'an and starting to read can make the
 * khitma point at that point": every page turn in the muṣḥaf credited the
 * active plan, so an evening in juz 30 moved a plan sitting at page 50 to
 * page 590. The reader had no way back except pinning the position by
 * hand — and no way to know it had happened until the card said so.
 */
import {
  __resetQuranStateForTests,
  activeKhatmah,
  finishKhatmahPortion,
  getQuranState,
  khatmahCurrentPage,
  khatmahCurrentPortion,
  khatmahTracksPage,
  recordKhatmahPageTurn,
  setKhatmahPosition,
  startKhatmah,
} from '../src/quran/quranState';

const plan = () => activeKhatmah(getQuranState())!;

describe('khatmahTracksPage', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('says yes on the page the plan is asking for', () => {
    expect(khatmahCurrentPage(plan())).toBe(1);
    expect(khatmahTracksPage(1)).toBe(true);
  });

  it('says yes behind the plan — that is re-reading, and harmless', () => {
    setKhatmahPosition(2, 255, 42);
    expect(khatmahTracksPage(20)).toBe(true);
  });

  it('says no ahead of the plan', () => {
    expect(khatmahTracksPage(582)).toBe(false);
  });

  it('says no when there is no plan at all', () => {
    __resetQuranStateForTests();
    expect(khatmahTracksPage(1)).toBe(false);
  });
});

describe('recordKhatmahPageTurn', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('advances one page at a time on a phone', () => {
    recordKhatmahPageTurn(1, 2);
    expect(plan().pagesRead).toBe(1);
    recordKhatmahPageTurn(2, 3);
    expect(plan().pagesRead).toBe(2);
  });

  it('advances a spread by the pair it left behind', () => {
    recordKhatmahPageTurn(1, 3);
    expect(plan().pagesRead).toBe(2);
  });

  it('leaves the plan alone while the reader is ahead of it', () => {
    // Juz 30 opens at page 582; the plan has not begun.
    recordKhatmahPageTurn(582, 583);
    recordKhatmahPageTurn(583, 584);
    expect(plan().pagesRead).toBe(0);
    expect(khatmahCurrentPage(plan())).toBe(1);
  });

  it('picks the plan back up when the reader returns to it', () => {
    recordKhatmahPageTurn(582, 583); // ignored
    recordKhatmahPageTurn(1, 2); // the khatmah's own page
    expect(plan().pagesRead).toBe(1);
  });

  it('credits a bookmark that happens to sit on the plan’s page', () => {
    setKhatmahPosition(2, 255, 42);
    expect(khatmahCurrentPage(plan())).toBe(42);
    recordKhatmahPageTurn(42, 43);
    expect(plan().pagesRead).toBe(42);
  });

  it('ignores a backwards turn', () => {
    recordKhatmahPageTurn(1, 2);
    recordKhatmahPageTurn(2, 1);
    expect(plan().pagesRead).toBe(1);
  });
});

/**
 * The two ways to move the plan on purpose.
 *
 * The gate is about READING: it decides whether the pages going past are
 * the khatmah's own. Neither of these is reading. Pinning an ayah as the
 * khatmah position and pressing the portion's done button are the reader
 * saying where the plan is, and the plan goes there.
 */
describe('pinning an ayah as the khatmah position', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('moves the plan there, from anywhere', () => {
    // Page 300 is a long way ahead of a plan that has not begun — the
    // reading gate would refuse it, and this is not reading.
    expect(khatmahTracksPage(300)).toBe(false);
    setKhatmahPosition(21, 1, 322);
    expect(khatmahCurrentPage(plan())).toBe(322);
  });

  it('makes reading from the pin count', () => {
    setKhatmahPosition(21, 1, 322);
    expect(khatmahTracksPage(322)).toBe(true);
    recordKhatmahPageTurn(322, 323);
    expect(plan().pagesRead).toBeGreaterThanOrEqual(322);
  });

  it('keeps counting past it, rather than freezing a page later', () => {
    // `khatmahCurrentPage` answers with the pinned page while a pin is
    // set. Left standing, the frontier never moved and the second turn
    // after a pin was refused — the plan advanced exactly one page and
    // stopped. The pin is spent when the reading reaches it.
    setKhatmahPosition(21, 1, 322);
    recordKhatmahPageTurn(322, 323);
    recordKhatmahPageTurn(323, 324);
    recordKhatmahPageTurn(324, 325);
    expect(plan().position).toBeNull();
    expect(khatmahCurrentPage(plan())).toBe(325);
  });

  it('a pin behind the reading rewinds the plan, and reading resumes', () => {
    recordKhatmahPageTurn(1, 2);
    recordKhatmahPageTurn(2, 3);
    setKhatmahPosition(2, 255, 42); // an explicit pin is authoritative
    expect(khatmahCurrentPage(plan())).toBe(42);
    recordKhatmahPageTurn(42, 43);
    recordKhatmahPageTurn(43, 44);
    expect(khatmahCurrentPage(plan())).toBe(44);
  });
});

describe('marking the portion read', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('finishes the portion in hand wherever the reader is', () => {
    const portion = khatmahCurrentPortion(plan());
    finishKhatmahPortion();
    expect(plan().ayahsRead).toBe(portion.to);
  });

  it('moves the frontier on, so the next page reads as the khatmah', () => {
    finishKhatmahPortion();
    const next = khatmahCurrentPage(plan());
    expect(khatmahTracksPage(next)).toBe(true);
    recordKhatmahPageTurn(next, next + 1);
    expect(khatmahCurrentPage(plan())).toBe(next + 1);
  });

  it('works even when the reader is off in another juz', () => {
    // The button is about the plan, not about the page on screen.
    recordKhatmahPageTurn(582, 583); // ignored by the gate
    const portion = khatmahCurrentPortion(plan());
    finishKhatmahPortion();
    expect(plan().ayahsRead).toBe(portion.to);
  });

  it('spends a pin that the finished portion has passed', () => {
    setKhatmahPosition(1, 1, 1);
    finishKhatmahPortion();
    expect(plan().position).toBeNull();
  });
});
