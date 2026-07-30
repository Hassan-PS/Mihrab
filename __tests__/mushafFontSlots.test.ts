/**
 * Font slot pool for the font-rendered mushaf (v2.8.0).
 *
 * React Native caches a typeface per `fontFamily` name and never evicts it, so
 * naming fonts after pages would pin every page visited in a session — 604
 * fonts, ~190 MB. The reader instead recycles a small ring of slot families.
 *
 * Two failure modes these tests exist to prevent:
 *   • a slot recycled while its page is still on screen → that page would draw
 *     ANOTHER page's words in its own shapes: a silently wrong Quran page;
 *   • the pool growing without bound → the memory problem we set out to fix.
 */
jest.mock('react-native', () => ({
  NativeModules: {
    MushafFont: {
      registerFont: jest.fn(async (family: string) => family),
      isValidFont: jest.fn(async () => true),
    },
  },
  Platform: { OS: 'android', select: (o: { default: unknown }) => o.default },
}));

import {
  FONT_SLOT_COUNT,
  _fontSlotDebug,
  _resetFontSlots,
  acquirePageFont,
  loadedPageFont,
  pinPageFont,
  unpinPageFont,
} from '../src/native/MushafFont';

const path = (page: number) => `/fonts/QCF2${String(page).padStart(3, '0')}.ttf`;

beforeEach(() => {
  _resetFontSlots();
});

describe('mushaf font slots', () => {
  it('registers a page once and reuses it afterwards', async () => {
    const first = await acquirePageFont(3, path(3));
    expect(first).toBeTruthy();
    expect(loadedPageFont(3)).toBe(first);
    const again = await acquirePageFont(3, path(3));
    expect(again).toBe(first);
  });

  it('gives concurrent callers for one page a single registration', async () => {
    const [a, b, c] = await Promise.all([
      acquirePageFont(7, path(7)),
      acquirePageFont(7, path(7)),
      acquirePageFont(7, path(7)),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    const used = _fontSlotDebug().slots.filter(s => s.page === 7);
    expect(used).toHaveLength(1);
  });

  it('gives concurrently loaded pages DIFFERENT slots', async () => {
    // The reader mounts three pages at once. Claiming a slot only after
    // registration came back let all three pick the same free slot, and since
    // every page font uses the same codepoints, the losers silently drew
    // another page's words inside their own line structure — a wrong Quran
    // page with no error anywhere. Regression guard.
    const families = await Promise.all([
      acquirePageFont(10, path(10)),
      acquirePageFont(11, path(11)),
      acquirePageFont(12, path(12)),
    ]);
    expect(new Set(families).size).toBe(3);
    expect(loadedPageFont(10)).toBe(families[0]);
    expect(loadedPageFont(11)).toBe(families[1]);
    expect(loadedPageFont(12)).toBe(families[2]);
  });

  it('reports no font until registration has actually completed', async () => {
    const { NativeModules } = require('react-native');
    let release: (v: string) => void = () => {};
    NativeModules.MushafFont.registerFont.mockImplementationOnce(
      (family: string) =>
        new Promise<string>(resolve => {
          release = () => resolve(family);
        }),
    );
    const pending = acquirePageFont(20, path(20));
    // Mid-flight the slot is claimed but the platform has not accepted the
    // file — drawing with it would render tofu.
    expect(loadedPageFont(20)).toBeNull();
    release('MihrabMushaf0');
    await pending;
    expect(loadedPageFont(20)).not.toBeNull();
  });

  it('never holds more fonts than it has slots', async () => {
    for (let page = 1; page <= FONT_SLOT_COUNT * 3; page++) {
      // eslint-disable-next-line no-await-in-loop
      await acquirePageFont(page, path(page));
    }
    const slots = _fontSlotDebug().slots;
    expect(slots).toHaveLength(FONT_SLOT_COUNT);
    const resident = slots.filter(s => s.page != null);
    expect(resident.length).toBeLessThanOrEqual(FONT_SLOT_COUNT);
    // The most recent pages are the ones still resident.
    expect(loadedPageFont(FONT_SLOT_COUNT * 3)).toBeTruthy();
    expect(loadedPageFont(1)).toBeNull();
  });

  it('never recycles a slot that a mounted page is drawing with', async () => {
    const family = await acquirePageFont(100, path(100));
    pinPageFont(100);
    // Churn far more pages than there are slots.
    for (let page = 200; page < 200 + FONT_SLOT_COUNT * 2; page++) {
      // eslint-disable-next-line no-await-in-loop
      await acquirePageFont(page, path(page));
    }
    expect(loadedPageFont(100)).toBe(family);
    unpinPageFont(100);
  });

  it('releases the slot once a page unmounts', async () => {
    await acquirePageFont(300, path(300));
    pinPageFont(300);
    unpinPageFont(300);
    for (let page = 400; page < 400 + FONT_SLOT_COUNT + 2; page++) {
      // eslint-disable-next-line no-await-in-loop
      await acquirePageFont(page, path(page));
    }
    expect(loadedPageFont(300)).toBeNull();
  });

  it('reports a failed registration instead of throwing', async () => {
    const { NativeModules } = require('react-native');
    NativeModules.MushafFont.registerFont.mockRejectedValueOnce(
      new Error('bad font'),
    );
    await expect(acquirePageFont(500, path(500))).resolves.toBeNull();
  });
});
