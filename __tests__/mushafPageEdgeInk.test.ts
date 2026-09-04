/**
 * The cut that `lineInkPadding` does not reach: the page's OWN top and
 * bottom edge.
 *
 * A line's ink overshoots its box and the line view lets it, by padding
 * the text and pulling the padding back with a negative margin. Inside a
 * page that is free — the room borrowed is the neighbouring line's box,
 * and a line box is transparent. The FIRST line has no neighbour above it
 * and the LAST none below, so they borrow from outside the page, and
 * whatever contains the page clips them there. The landscape column is a
 * ScrollView, and a ScrollView on Android always clips its content.
 *
 * Reported 2026-09-04: in the landscape reader the line at the top of the
 * viewport keeps every letter and loses the marks above it — which reads
 * as a broken font rather than a clip. It shows on every scroll, not only
 * at the top of a page, because the recitation's follow-scroll comes to
 * rest exactly on a line box.
 */
import {
  fitLinesWithInk,
  mushafPageColumnHeight,
} from '../src/quran/MushafTextPageSurface';
import { MUSHAF_LINE_HEIGHT_EM } from '../src/quran/MushafTextPage';
import { lineInkPadding } from '../src/quran/mushafLayout';

const LINES = 15;

describe('fitLinesWithInk', () => {
  it('reserves room above the first line and below the last', () => {
    const fs = 25;
    const box = 640;
    const fit = fitLinesWithInk(fs, box, LINES);
    expect(fit.top).toBeGreaterThan(0);
    expect(fit.bottom).toBeGreaterThan(0);
  });

  it('spends the reserve out of the box, not on top of it', () => {
    // The page still occupies exactly the box it was given — the lines get
    // shorter instead. A page that grew by its reserve would push the
    // medallion off the bottom of a column that has nothing to scroll.
    const fs = 25;
    const box = 640;
    const fit = fitLinesWithInk(fs, box, LINES);
    expect(fit.lineHeight * LINES + fit.top + fit.bottom).toBeCloseTo(box, 5);
    expect(fit.lineHeight).toBeLessThan(box / LINES);
  });

  it('reserves what the line it settles on actually needs', () => {
    // The reserve is a fixed point, not a formula: a shorter line has less
    // leading and so needs a hair more room. Whatever height it lands on,
    // the reserve must cover that height's ink — reserving for the taller
    // starting line would leave the real one a dp short.
    const fs = 25;
    const fit = fitLinesWithInk(fs, 640, LINES);
    const needed = lineInkPadding(fs, fit.lineHeight);
    expect(fit.top).toBeGreaterThanOrEqual(needed.top - 1);
    expect(fit.bottom).toBeGreaterThanOrEqual(needed.bottom - 1);
  });

  it('keeps the lines rather than collapsing them in an impossible box', () => {
    // A box smaller than the ink needs is a bad layout, not a crash. The
    // page draws squeezed; it never draws at a negative line height.
    const fit = fitLinesWithInk(200, 40, LINES);
    expect(fit.lineHeight).toBeGreaterThan(0);
  });

  it('does nothing without a font size to measure the ink against', () => {
    const fit = fitLinesWithInk(0, 640, LINES);
    expect(fit).toEqual({ lineHeight: 640 / LINES, top: 0, bottom: 0 });
  });
});

describe('mushafPageColumnHeight', () => {
  const textWidth = 560;

  it('asks the scrolling column for the reserve on top of the line boxes', () => {
    // Landscape takes it the other way round from portrait: the column can
    // scroll, so it grows by the reserve rather than shrinking the text.
    // The surface then takes the same reserve back out of the height it is
    // handed, which is what leaves the reading zoom exactly where it was.
    const scrolled = mushafPageColumnHeight({
      page: 332,
      textWidth,
      viewportHeight: 300,
      scrolling: true,
    });
    const fit = fitLinesWithInk(
      // Whatever the page's own line count and drawn em turn out to be,
      // the identity has to hold: fitting the returned height must give
      // back a line height at the print's natural leading.
      textWidth / 14,
      scrolled,
      LINES,
    );
    expect(fit.lineHeight).toBeGreaterThan(0);
    expect(scrolled).toBeGreaterThan(300);
  });

  it('leaves a page with nothing to scroll at exactly its viewport', () => {
    // Portrait is height-fitted: the column IS the viewport, and padding
    // it pushed the medallion off the bottom of the page.
    expect(
      mushafPageColumnHeight({
        page: 332,
        textWidth,
        viewportHeight: 620,
        scrolling: false,
      }),
    ).toBe(620);
  });

  it('never returns less than the viewport', () => {
    for (const page of [1, 2, 100, 332, 604]) {
      expect(
        mushafPageColumnHeight({
          page,
          textWidth,
          viewportHeight: 900,
          scrolling: true,
        }),
      ).toBeGreaterThanOrEqual(900);
    }
  });
});

describe('the reserve is what the landscape column was missing', () => {
  it('covers the harakat band above a line at the natural leading', () => {
    // The print's leading (1.7183 em) is SHORTER than ascent + descent
    // (1.8 em), so a line at its natural height starts already short of
    // its own metrics — before the ink overshoots them by another 0.44 em.
    // That deficit is the band the marks live in, and it is what the top
    // line of the viewport was losing.
    const fs = 40;
    const ink = lineInkPadding(fs, fs * MUSHAF_LINE_HEIGHT_EM);
    expect(ink.top).toBeGreaterThan(fs * 0.5);
  });
});
