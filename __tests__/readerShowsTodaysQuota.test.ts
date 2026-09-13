/**
 * Today's quota, in the reader — issue #46.
 *
 * "In addition to the global page indicator (264 / 604 and Juz 14),
 * display today's specific reading progress directly in the reader view
 * so users can monitor their daily target without exiting to the
 * dashboard."
 *
 * The numbers are the dashboard card's own — `khatmahPages` — rather than
 * a second count made in the reader, because two counts of the same day
 * is exactly the shape of #44: two surfaces disagreeing about the same
 * reading, with the reader having no idea which to believe.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  __resetQuranStateForTests,
  activeKhatmah,
  getQuranState,
  khatmahPages,
  recordKhatmahPageTurn,
  startKhatmah,
} from '../src/quran/quranState';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const plan = () => activeKhatmah(getQuranState())!;

describe('the numbers the reader shows', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('start the day at none of the portion read', () => {
    const pages = khatmahPages(plan());
    expect(pages.doneToday).toBe(0);
    expect(pages.today).toBeGreaterThan(0);
    expect(pages.leftToday).toBe(pages.today);
  });

  it('follow the reading, page by page', () => {
    recordKhatmahPageTurn(1, 2);
    recordKhatmahPageTurn(2, 3);
    const pages = khatmahPages(plan());
    expect(pages.doneToday).toBe(2);
    expect(pages.leftToday).toBe(pages.today - 2);
  });

  it('do not exceed the day’s own portion', () => {
    // Reading past today's last page is credit towards the khatmah, not a
    // quota of 21 out of 20 — `extraToday` is where that goes.
    const today = khatmahPages(plan()).today;
    for (let p = 1; p <= today + 3; p++) recordKhatmahPageTurn(p, p + 1);
    const pages = khatmahPages(plan());
    expect(pages.doneToday).toBe(today);
    expect(pages.leftToday).toBe(0);
    expect(pages.extraToday).toBeGreaterThan(0);
  });

  it('are null in the reader when there is no plan to have a day', () => {
    __resetQuranStateForTests();
    expect(activeKhatmah(getQuranState())).toBeUndefined();
  });
});

/**
 * The wiring, read rather than rendered: the rail is a gesture surface
 * with a pan responder, an animated knob and a peek window, and mounting
 * it to prove a third line exists would be a test about the mocks.
 */
describe('the reader hands it to the rail', () => {
  const core = read('src/quran/mushafReaderCore.tsx');
  const reader = read('src/quran/MushafPhoneReader.tsx');
  const rail = read('src/quran/MushafPageScrubber.tsx');

  it('takes the day from the same place the card does', () => {
    expect(core).toContain('khatmahPages(plan, riwayah)');
    expect(core).toContain('todayQuota');
  });

  it('is nothing at all without a plan', () => {
    // Not a zero: "0/0 today" under the page number is a reading target
    // for a reader who never set one.
    expect(core).toMatch(/plan \? khatmahPages\(plan, riwayah\) : null/);
  });

  it('passes it to the rail, in the muṣḥaf’s own pages', () => {
    expect(reader).toContain('core.todayQuota');
    expect(reader).toMatch(/done: core\.todayQuota\.doneToday/);
    expect(reader).toMatch(/total: core\.todayQuota\.today/);
  });

  it('draws it as the khatmah, not as a third page count', () => {
    // The plan's own colour, the same one the finish pill carries.
    expect(rail).toContain('quran.todayPages');
    expect(rail).toMatch(/styles\.readoutToday, \{ color: KHATMAH_COLOR \}/);
  });

  it('says in words what the colour says', () => {
    // Two bare numbers under two other bare numbers need a label for a
    // reader who hears the screen, or who cannot tell the colours apart.
    expect(rail).toContain('quran.todayPagesLong');
  });
});
