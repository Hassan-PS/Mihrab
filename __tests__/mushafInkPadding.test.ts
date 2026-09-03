/**
 * Calligraphy overshoots its metrics, and Android clips a line to its view.
 *
 * The deepest QPC glyphs reach 0.8 em below the baseline against a 0.6 em
 * descent, and the tallest 1.62 em above a 1.2 em ascent. A line's text
 * view is padded by what the ink needs beyond the room the line box gives
 * it — reported 2026-09-03 as text cut off at the bottom of the line.
 */
import {
  MUSHAF_FONT_ASCENT_EM,
  MUSHAF_FONT_DESCENT_EM,
  MUSHAF_INK_ABOVE_EM,
  MUSHAF_INK_BELOW_EM,
  lineInkPadding,
} from '../src/quran/mushafLayout';
import { MUSHAF_LINE_HEIGHT_EM } from '../src/quran/MushafTextPage';

const FS = 25;

describe('lineInkPadding', () => {
  it('pads a line at its natural height on both sides', () => {
    // The print's own leading is LESS than ascent + descent, so the box
    // is already short of the metrics before the ink overshoots them.
    const pad = lineInkPadding(FS, FS * MUSHAF_LINE_HEIGHT_EM);
    expect(pad.top).toBeGreaterThan(0);
    expect(pad.bottom).toBeGreaterThan(0);
    // Ink above: 1.64 em; room above: 1.2 em less the WHOLE deficit of
    // (1.7183 − 1.8) em — iOS may take it all off one side.
    const leading = FS * (MUSHAF_LINE_HEIGHT_EM - 1.8);
    expect(pad.top).toBe(
      Math.ceil(FS * MUSHAF_INK_ABOVE_EM - (FS * MUSHAF_FONT_ASCENT_EM + leading)),
    );
    expect(pad.bottom).toBe(
      Math.ceil(FS * MUSHAF_INK_BELOW_EM - (FS * MUSHAF_FONT_DESCENT_EM + leading)),
    );
  });

  it('splits a positive leading evenly, as both platforms do', () => {
    const L = FS * 2.0; // 0.2 em of leading: 0.1 em each side
    const pad = lineInkPadding(FS, L);
    expect(pad.top).toBe(
      Math.ceil(FS * MUSHAF_INK_ABOVE_EM - FS * (MUSHAF_FONT_ASCENT_EM + 0.1)),
    );
    expect(pad.bottom).toBe(
      Math.ceil(FS * MUSHAF_INK_BELOW_EM - FS * (MUSHAF_FONT_DESCENT_EM + 0.1)),
    );
  });

  it('pads less as the box grows, and not at all once it holds the ink', () => {
    const tight = lineInkPadding(FS, FS * 1.7);
    const roomy = lineInkPadding(FS, FS * 2.2);
    const vast = lineInkPadding(FS, FS * 2.7);
    expect(roomy.top).toBeLessThan(tight.top);
    expect(roomy.bottom).toBeLessThan(tight.bottom);
    expect(vast).toEqual({ top: 0, bottom: 0 });
  });

  it('is whole points, rounded towards more room', () => {
    const pad = lineInkPadding(24.1, 44.7);
    expect(Number.isInteger(pad.top)).toBe(true);
    expect(Number.isInteger(pad.bottom)).toBe(true);
  });

  it('is nothing for a line that has no size yet', () => {
    expect(lineInkPadding(0, 40)).toEqual({ top: 0, bottom: 0 });
    expect(lineInkPadding(25, 0)).toEqual({ top: 0, bottom: 0 });
  });
});
