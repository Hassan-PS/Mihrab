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
  getQuranState,
  khatmahCurrentPage,
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
