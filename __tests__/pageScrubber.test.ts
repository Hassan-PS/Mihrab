/**
 * The mushaf rail's landmark + speed model (v2.8.5), and what is left of
 * its haptics.
 *
 * `surahAtPage` is what the readout above the knob is built from — it
 * names the surah under the thumb, because nobody knows Yaseen starts on
 * 440 and everybody knows Yaseen.
 *
 * It used to drive the ticks as well: one at every surah boundary,
 * weighted by whether the drag was a hunt or a sweep (`isRangingDrag`).
 * The reasoning was sound and the result was not — surahs are unevenly
 * spaced, so the same sideways gesture is silent across half the muṣḥaf
 * and a continuous buzz across the last juz, which reads as a noisy rail
 * rather than as information. Sliding ALONG the rail says nothing now.
 * The only tick left is reaching UP into a slower speed: a mode change
 * with no visible sign, and the one thing here worth telling a finger.
 *
 * Both functions stay tested: the model is still what the readout uses,
 * and it is what a future speed-aware tick would reach for.
 */
import {
  isRangingDrag,
  surahAtPage,
} from '../src/quran/MushafPageScrubber';
import { MUSHAF_TOTAL_PAGES } from '../src/quran/mushafImages';
import fs from 'fs';
import path from 'path';

const RAIL = fs.readFileSync(
  path.join(__dirname, '..', 'src/quran/MushafPageScrubber.tsx'),
  'utf8',
);

describe('what the rail vibrates for', () => {
  it('is a change of speed, and nothing else', () => {
    // One call site, in the move handler, guarded by the tier changing.
    expect(RAIL).toMatch(/if \(tier !== before\) hapticScrubTick\(false\);/);
    expect(RAIL.match(/hapticScrubTick\(/g)).toHaveLength(1);
  });

  it('no longer ticks its way along the rail', () => {
    // The per-surah feedback and its rate limiter are gone, not disabled.
    expect(RAIL).not.toMatch(/MIN_TICK_INTERVAL_MS/);
    expect(RAIL).not.toMatch(/lastSurah|lastTickAt|const feedback =/);
  });

  it('still warms the engine on grab, so the first tick is not late', () => {
    // `prepare()`, not a pulse: grabbing the rail is something the finger
    // already knows it did.
    expect(RAIL).toMatch(/hapticScrubStart\(\)/);
  });
});

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
