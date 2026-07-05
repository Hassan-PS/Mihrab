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
