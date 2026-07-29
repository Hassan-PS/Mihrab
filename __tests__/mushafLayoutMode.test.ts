/**
 * Mushaf reading-layout gating (v2.7.41).
 *
 * Regression for "turning a phone horizontal opens double pages as if it
 * were an iPad": the old rule was width-only (landscape && width >= 960),
 * and a tall phone in landscape IS ~1280dp wide — so phones got the
 * tablet spread on a 576dp-tall screen, which on some devices rendered
 * blank because the doubled page column pushed the 604-page strip past
 * the platform's rasterisable width.
 */
import { mushafLayoutMode } from '../src/quran/mushafSpread';

describe('mushafLayoutMode', () => {
  // 1080×2400 @ 300dpi — the emulator config that reproduced the bug.
  const phoneShort = 576;

  it('phone landscape → single-page reading zoom, never a spread', () => {
    expect(
      mushafLayoutMode({
        windowWidth: 1280,
        windowHeight: 576,
        screenShortSide: phoneShort,
      }),
    ).toEqual({ dualPage: false, phoneLandscape: true });
  });

  it('phone portrait → unchanged single-page fit', () => {
    expect(
      mushafLayoutMode({
        windowWidth: 576,
        windowHeight: 1280,
        screenShortSide: phoneShort,
      }),
    ).toEqual({ dualPage: false, phoneLandscape: false });
  });

  it('iPad landscape → facing-page spread (unchanged)', () => {
    expect(
      mushafLayoutMode({
        windowWidth: 1376,
        windowHeight: 1032,
        screenShortSide: 1032,
      }),
    ).toEqual({ dualPage: true, phoneLandscape: false });
  });

  it('iPad portrait → single page (unchanged)', () => {
    expect(
      mushafLayoutMode({
        windowWidth: 1032,
        windowHeight: 1376,
        screenShortSide: 1032,
      }),
    ).toEqual({ dualPage: false, phoneLandscape: false });
  });

  it('wide Mac window → spread; narrow Mac window → single page', () => {
    const screenShortSide = 982; // 1512×982 Mac display
    expect(
      mushafLayoutMode({
        windowWidth: 1400,
        windowHeight: 900,
        screenShortSide,
      }).dualPage,
    ).toBe(true);
    expect(
      mushafLayoutMode({
        windowWidth: 820,
        windowHeight: 700,
        screenShortSide,
      }).dualPage,
    ).toBe(false);
  });

  it('a short-but-wide desktop window is never treated as a phone', () => {
    expect(
      mushafLayoutMode({
        windowWidth: 1400,
        windowHeight: 500,
        screenShortSide: 982,
      }),
    ).toEqual({ dualPage: true, phoneLandscape: false });
  });
});
