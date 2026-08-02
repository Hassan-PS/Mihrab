/**
 * The mushaf rail's landmark + speed model (v2.8.5).
 *
 * Two decisions decide whether the rail feels like navigation or like a
 * buzzing slider, and neither can be judged from a screenshot:
 *
 *  1. WHAT gets a tick. Pages are the wrong unit — 604 of them across a
 *     phone is roughly two per pixel, so ticking per page is a continuous
 *     vibration carrying no information. Surahs are what people navigate
 *     by, and their uneven spacing is the signal.
 *  2. HOW HARD. A slow drag is a hunt for one surah and each boundary
 *     should be firm enough to stop on; a sweep wants light texture.
 */
import {
  isRangingDrag,
  surahAtPage,
} from '../src/quran/MushafPageScrubber';
import { MUSHAF_TOTAL_PAGES } from '../src/quran/mushafImages';

describe('surahAtPage', () => {
  it('knows the openings every reader can check by hand', () => {
    expect(surahAtPage(1)).toBe(1); // Al-Fatihah
    expect(surahAtPage(2)).toBe(2); // Al-Baqarah
    expect(surahAtPage(50)).toBe(3); // Aal-i-Imran
    expect(surahAtPage(604)).toBe(112); // the last page opens at Al-Ikhlas
  });

  it('clamps rather than returning undefined off either end', () => {
    expect(surahAtPage(0)).toBe(surahAtPage(1));
    expect(surahAtPage(-40)).toBe(surahAtPage(1));
    expect(surahAtPage(9999)).toBe(surahAtPage(MUSHAF_TOTAL_PAGES));
  });

  it('never leaves a page without a surah', () => {
    for (let page = 1; page <= MUSHAF_TOTAL_PAGES; page++) {
      const surah = surahAtPage(page);
      expect(surah).toBeGreaterThanOrEqual(1);
      expect(surah).toBeLessThanOrEqual(114);
    }
  });

  it('is monotonic — the mushaf never goes back a surah', () => {
    let previous = 0;
    for (let page = 1; page <= MUSHAF_TOTAL_PAGES; page++) {
      const surah = surahAtPage(page);
      expect(surah).toBeGreaterThanOrEqual(previous);
      previous = surah;
    }
  });

  it('spaces landmarks the way the mushaf does', () => {
    // Al-Baqarah is ~48 pages of one surah: a slow drag through juz 1
    // should feel almost silent. The last juz is a tick every few
    // millimetres. That contrast IS the feedback.
    const early = new Set<number>();
    for (let p = 2; p <= 49; p++) early.add(surahAtPage(p));
    const late = new Set<number>();
    for (let p = 580; p <= 604; p++) late.add(surahAtPage(p));
    expect(early.size).toBe(1);
    expect(late.size).toBeGreaterThan(15);
  });
});

describe('isRangingDrag', () => {
  it('calls a deliberate hunt slow', () => {
    // A fifth of the rail in a second — someone looking for one surah.
    expect(isRangingDrag(120, 1000)).toBe(false);
    // Nudging a few pages over half a second.
    expect(isRangingDrag(4, 500)).toBe(false);
  });

  it('calls a sweep fast', () => {
    // Half the mushaf in a second.
    expect(isRangingDrag(300, 1000)).toBe(true);
    // 30 pages between two touch samples 16 ms apart is a flick.
    expect(isRangingDrag(30, 16)).toBe(true);
  });

  it('is direction-blind — dragging back is the same gesture', () => {
    expect(isRangingDrag(-300, 1000)).toBe(isRangingDrag(300, 1000));
  });

  it('treats a zero-length sample as fast rather than dividing by it', () => {
    expect(isRangingDrag(5, 0)).toBe(true);
  });
});
