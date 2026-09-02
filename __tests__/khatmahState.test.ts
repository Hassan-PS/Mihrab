/**
 * Khatmah position pin + reset semantics (v2.7.28).
 */
import {
  __resetQuranStateForTests,
  activeKhatmah,
  clearKhatmahPosition,
  getQuranState,
  khatmahCurrentPage,
  recordKhatmahProgress,
  resetKhatmahAll,
  resetKhatmahToday,
  setKhatmahPosition,
  startKhatmah,
} from '../src/quran/quranState';

describe('khatmah position + resets', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('continue page derives from pagesRead when no pin exists', () => {
    recordKhatmahProgress(10);
    const plan = activeKhatmah(getQuranState())!;
    expect(plan.pagesRead).toBe(10);
    expect(khatmahCurrentPage(plan)).toBe(11);
  });

  it('pinning a position overrides the derived page and aligns pagesRead', () => {
    recordKhatmahProgress(50);
    setKhatmahPosition(2, 255, 42); // move BACKWARD explicitly
    const plan = activeKhatmah(getQuranState())!;
    expect(plan.position).toEqual({ surah: 2, ayah: 255, page: 42 });
    expect(plan.pagesRead).toBe(41);
    expect(khatmahCurrentPage(plan)).toBe(42);
  });

  it('clearing the pin falls back to automatic tracking', () => {
    setKhatmahPosition(2, 255, 42);
    clearKhatmahPosition();
    const plan = activeKhatmah(getQuranState())!;
    expect(plan.position).toBeNull();
    expect(khatmahCurrentPage(plan)).toBe(42); // pagesRead 41 + 1
  });

  it("reset today rewinds only today's progress", () => {
    recordKhatmahProgress(10); // first progress today → snapshot at 0
    recordKhatmahProgress(20);
    resetKhatmahToday();
    const plan = activeKhatmah(getQuranState())!;
    expect(plan.pagesRead).toBe(0); // day started at 0
    expect(plan.completedAt).toBeNull();
  });

  it('restart resets pages, pin and schedule', () => {
    recordKhatmahProgress(100);
    setKhatmahPosition(5, 3, 101);
    const before = activeKhatmah(getQuranState())!.startedAt;
    resetKhatmahAll();
    const plan = activeKhatmah(getQuranState())!;
    expect(plan.pagesRead).toBe(0);
    expect(plan.position).toBeNull();
    expect(plan.startedAt).toBeGreaterThanOrEqual(before);
  });
});

/**
 * Starting a khatmah that was already under way (issue #17).
 *
 * The reader names the page they are ON, in the muṣḥaf they are reading.
 * Two things have to come out of that: they must be put back at the top
 * of that page and not a page either side of it, and the days must cover
 * what is left rather than the whole book.
 */
describe('a khatmah begun partway through', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
  });

  it('puts the reader back on the page they named', () => {
    startKhatmah(30, { page: 143 });
    const plan = activeKhatmah(getQuranState())!;
    expect(khatmahCurrentPage(plan)).toBe(143);
  });

  it('reads the page in the reader’s own muṣḥaf, not in Ḥafṣ', () => {
    startKhatmah(30, { page: 143, riwayah: 'warsh' });
    const plan = activeKhatmah(getQuranState())!;
    expect(khatmahCurrentPage(plan, 'warsh')).toBe(143);
  });

  it('counts everything before that page as read', () => {
    startKhatmah(30, { page: 143 });
    const plan = activeKhatmah(getQuranState())!;
    expect(plan.pagesRead).toBe(142);
    expect(plan.ayahsRead).toBeGreaterThan(0);
    expect(plan.fromPage).toBeGreaterThan(0);
  });

  it('is an ordinary plan when no page is given', () => {
    startKhatmah(30);
    const plan = activeKhatmah(getQuranState())!;
    expect(plan.fromPage).toBe(0);
    expect(plan.pagesRead).toBe(0);
    expect(plan.ayahsRead).toBe(0);
    expect(khatmahCurrentPage(plan)).toBe(1);
  });

  it('rewinds to where the plan began, not to the opening', () => {
    // "Restart the khatmah" on a plan begun at page 143 must not hand it
    // back the 142 pages the reader never asked it to cover.
    startKhatmah(30, { page: 143 });
    const before = activeKhatmah(getQuranState())!.pagesRead;
    recordKhatmahProgress(200);
    resetKhatmahAll();
    const plan = activeKhatmah(getQuranState())!;
    expect(plan.pagesRead).toBe(before);
    expect(khatmahCurrentPage(plan)).toBe(143);
  });

  it('treats page 1 and nonsense as starting from the opening', () => {
    for (const page of [1, 0, -5, Number.NaN]) {
      __resetQuranStateForTests();
      startKhatmah(30, { page });
      const plan = activeKhatmah(getQuranState())!;
      expect([page, plan.pagesRead]).toEqual([page, 0]);
      expect([page, plan.fromPage ?? 0]).toEqual([page, 0]);
    }
  });
});
