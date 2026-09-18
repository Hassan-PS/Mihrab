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
  khatmahGap,
  khatmahTracksPage,
  isKhatmahPageDone,
  recordKhatmahPageTurn,
  setKhatmahPosition,
  startKhatmah,
} from '../src/quran/quranState';
import { ayahAtIndex } from '../src/quran/ayahIndex';
import { findPageForAyah } from '../src/quran/pages';

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

  it('credits every page a fling crossed, not just a step of two', () => {
    // The pager reports where a scroll came to REST. A hard fling on
    // Android crosses several pages on the way, and the reader watched
    // all of them go past.
    recordKhatmahPageTurn(1, 2);
    expect(plan().pagesRead).toBe(1);
    recordKhatmahPageTurn(2, 8);
    expect(plan().pagesRead).toBe(7);
  });

  it('does not freeze the plan for the rest of the session — #44', () => {
    // The stall this cost: one uncredited crossing left the reader ahead
    // of the frontier, `khatmahTracksPage` then said no to every turn
    // after it, and the card sat at the page of the last small step while
    // the reader read on. Reported as a khatmah stuck at 254 with the
    // reader at 264, and "Continue reading" correct throughout.
    recordKhatmahPageTurn(1, 6);
    recordKhatmahPageTurn(6, 7);
    recordKhatmahPageTurn(7, 8);
    expect(plan().pagesRead).toBe(7);
    expect(khatmahCurrentPage(plan())).toBe(8);
  });

  it('ignores a backwards turn', () => {
    recordKhatmahPageTurn(1, 2);
    recordKhatmahPageTurn(2, 1);
    expect(plan().pagesRead).toBe(1);
  });
});

/**
 * The hair trigger, which is the second half of #44.
 *
 * Crediting the whole crossing fixed the flings and left the gate exactly
 * as tight as it was: the frontier sits ON the page each turn starts
 * from, so there is no slack in it anywhere. One page ahead — by any
 * means at all — and every turn from then on starts further ahead than
 * the last, so the plan stops for the session while the pages keep
 * turning. Reported back as "works for about six swipes, then it blocks
 * again", and reproducible by simply opening the reader one page past the
 * frontier.
 */
describe('a few pages ahead is still the plan’s own trail', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30, { page: 249 });
  });

  const frontier = () => khatmahCurrentPage(plan());

  it('counts a turn that starts just ahead of the frontier', () => {
    expect(frontier()).toBe(249);
    expect(khatmahTracksPage(250)).toBe(true);
    expect(khatmahTracksPage(259)).toBe(true);
  });

  /**
   * THE WIDTH IS THE PORTION NOW, not a distance.
   *
   * The slack was ten pages because progress was a
   * high-water mark: everything between the frontier and the page read
   * had to be counted too, so ten pages was the most the plan could ever
   * be wrong by. With a set of what has actually been read there is no
   * such cost — a turn credits the pages it turned past and nothing else
   * — so the limit is what it should always have been: read inside
   * today's portion and it counts, however you arrived; read a future
   * day's and it does not, because you have not earned it.
   */
  it('counts anywhere inside today’s portion, well past the old ten', () => {
    const portionEnd = khatmahCurrentPortion(plan()).to;
    const lastPage = findPageForAyah(
      ayahAtIndex(portionEnd).surah,
      ayahAtIndex(portionEnd).ayah,
      'hafs',
    );
    expect(lastPage).toBeGreaterThan(259);
    expect(khatmahTracksPage(lastPage)).toBe(true);
  });

  it('and refuses a future day’s reading, which is the point of the window', () => {
    const portionEnd = khatmahCurrentPortion(plan()).to;
    const wellPast = ayahAtIndex(Math.min(portionEnd + 400, 6236));
    const page = findPageForAyah(wellPast.surah, wellPast.ayah, 'hafs');
    expect(khatmahTracksPage(page)).toBe(false);
  });

  it('catches up when the reader arrives one page past it and reads on', () => {
    // The reproduction: open the reader at 250 with the plan at 249 — an
    // arrival credits nothing, which is right — then turn a page. This
    // used to be refused, and so was every turn after it.
    recordKhatmahPageTurn(250, 250); // the arrival itself
    recordKhatmahPageTurn(250, 251);
    expect(frontier()).toBe(251);
    recordKhatmahPageTurn(251, 252);
    expect(frontier()).toBe(252);
  });

  it('keeps counting for the rest of the session, which is the whole bug', () => {
    recordKhatmahPageTurn(252, 253); // three ahead of the frontier
    for (let p = 253; p < 268; p++) recordKhatmahPageTurn(p, p + 1);
    expect(frontier()).toBe(268);
  });

  it('credits the pages it turned past, and not the ones it arrived over', () => {
    /**
     * THE TRADE THAT USED TO BE HERE IS GONE.
     *
     * Crediting ran from the plan's start, so arriving ten pages ahead
     * and turning once banked all ten. The ten-page slack was the bound
     * on that — a turn starting further ahead was refused outright — and
     * replacing the slack with the
     * portion window quietly removed the bound: a portion is a twentieth
     * of the book on a thirty-day plan and an eighth of it on a
     * seven-day one.
     *
     * So a turn credits its own crossing. Arriving at 259 and turning to
     * 260 reads 259, and 250–258 stay unread until the reader goes back
     * for them — which is what the card's unread row is for.
     */
    recordKhatmahPageTurn(259, 260);
    expect(isKhatmahPageDone(plan(), 259)).toBe(true);
    for (const page of [249, 255, 258]) {
      expect(isKhatmahPageDone(plan(), page)).toBe(false);
    }
    // The legacy mirror stays at the plan's own start — nothing
    // contiguous has been read from it — as it must.
    expect(plan().pagesRead).toBe(248);
    // Pages 249–258: ten, offered on the card, and gone the moment the
    // reader goes back for them.
    expect(khatmahGap(plan())?.pages).toBe(10);
    expect(khatmahGap(plan())?.page).toBe(249);
  });

  it('but a fling credits every page it crossed — issue #44’s own rule', () => {
    recordKhatmahPageTurn(250, 256);
    for (const page of [250, 251, 252, 253, 254, 255]) {
      expect(isKhatmahPageDone(plan(), page)).toBe(true);
    }
  });

  it('leaves a plan alone when the reader is genuinely elsewhere', () => {
    // Juz 30 against a plan at 249 — the case the gate exists for, and
    // the width does not reach a tenth of the way there.
    recordKhatmahPageTurn(582, 583);
    recordKhatmahPageTurn(583, 584);
    expect(frontier()).toBe(249);
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
