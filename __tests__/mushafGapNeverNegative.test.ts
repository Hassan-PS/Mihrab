/**
 * The word gap, over every line of all 604 pages — issue #6.
 *
 * A reader in Egypt reported that An-Nisa was missing words. It was: the
 * last word of a line, on ~1,100 lines spread over 603 of the 604 pages.
 * Every one of them was a line justified to a gap TIGHTER than the space
 * glyph we draw the gap with, which the renderer asked for as negative
 * letter spacing; no line asking for a wider gap ever lost anything.
 *
 * So the invariant is not "the box is big enough" — it was, by half an em —
 * it is that the renderer must never ask the platform to take width away.
 * These tests hold that line for the whole mushaf, not for a sample.
 */
import {
  MUSHAF_SPACE_ADVANCE_EM,
  WORD_SPACE_EM,
  gapMetrics,
  getPageLayout,
  lineGapCount,
  lineSpaceEm,
  pageMeasureEm,
} from '../src/quran/mushafLayout';

const PAGES = 604;
/** A page font is ~58 px on a 1080-wide phone; the exact value is arbitrary. */
const FONT_SIZE = 58;

describe('gapMetrics', () => {
  it('never returns a negative letter spacing', () => {
    for (let em = 0; em <= 1; em += 0.001) {
      expect(gapMetrics(em, FONT_SIZE).letterSpacing).toBeGreaterThanOrEqual(0);
    }
  });

  it('reproduces the asked-for advance exactly, tight or wide', () => {
    for (const em of [0.2, 0.25, 0.29, MUSHAF_SPACE_ADVANCE_EM, 0.35, 0.75]) {
      const g = gapMetrics(em, FONT_SIZE);
      const drawn = MUSHAF_SPACE_ADVANCE_EM * g.fontSize + g.letterSpacing;
      expect(drawn).toBeCloseTo(em * FONT_SIZE, 6);
    }
  });

  it('shrinks the glyph rather than the spacing when the gap is tight', () => {
    const tight = gapMetrics(0.25, FONT_SIZE);
    expect(tight.fontSize).toBeLessThan(FONT_SIZE);
    expect(tight.letterSpacing).toBe(0);
  });

  it('leaves the glyph alone and adds spacing when the gap is wide', () => {
    const wide = gapMetrics(0.5, FONT_SIZE);
    expect(wide.fontSize).toBe(FONT_SIZE);
    expect(wide.letterSpacing).toBeGreaterThan(0);
  });

  it('never scales the glyph up — that would drag the line box height', () => {
    for (const em of [0.3, 0.5, 0.75, 2]) {
      expect(gapMetrics(em, FONT_SIZE).fontSize).toBeLessThanOrEqual(FONT_SIZE);
    }
  });

  it('survives a degenerate size without producing a negative anything', () => {
    for (const em of [0, -1]) {
      const g = gapMetrics(em, FONT_SIZE);
      expect(g.fontSize).toBeGreaterThanOrEqual(0);
      expect(g.letterSpacing).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('every line of the mushaf', () => {
  /** Every ayah line of all 604 pages, with the gap it is drawn at. */
  const lines: Array<{ page: number; index: number; spaceEm: number; gaps: number }> =
    [];
  beforeAll(() => {
    for (let page = 1; page <= PAGES; page++) {
      const layout = getPageLayout(page);
      if (!layout) throw new Error(`page ${page} has no layout`);
      const measure = pageMeasureEm(layout);
      layout.lines.forEach((line, index) => {
        if (line.kind !== 'ayah') return;
        lines.push({
          page,
          index,
          spaceEm: lineSpaceEm(line, measure),
          gaps: lineGapCount(line),
        });
      });
    }
  });

  it('covers the whole mushaf', () => {
    expect(lines.length).toBeGreaterThan(8000);
    expect(new Set(lines.map(l => l.page)).size).toBe(PAGES);
  });

  it('asks for a tighter-than-the-glyph gap on a large minority of lines', () => {
    // Not a requirement — a guard on the premise. If this ever goes to zero
    // the bug became unreachable by accident and these tests stopped testing
    // anything, which should be noticed rather than celebrated.
    const tight = lines.filter(l => l.spaceEm < MUSHAF_SPACE_ADVANCE_EM);
    expect(tight.length).toBeGreaterThan(1000);
  });

  it('never draws a gap with negative letter spacing', () => {
    const bad = lines.filter(
      l => gapMetrics(l.spaceEm, FONT_SIZE).letterSpacing < 0,
    );
    expect(bad).toEqual([]);
  });

  it('draws every gap at exactly the width the line was solved for', () => {
    for (const line of lines) {
      const g = gapMetrics(line.spaceEm, FONT_SIZE);
      const drawn = MUSHAF_SPACE_ADVANCE_EM * g.fontSize + g.letterSpacing;
      expect(drawn).toBeCloseTo(line.spaceEm * FONT_SIZE, 6);
    }
  });

  it('draws the inner gap — hizb and sajdah tokens — without going negative', () => {
    const g = gapMetrics(WORD_SPACE_EM, FONT_SIZE);
    expect(g.letterSpacing).toBeGreaterThanOrEqual(0);
    expect(MUSHAF_SPACE_ADVANCE_EM * g.fontSize + g.letterSpacing).toBeCloseTo(
      WORD_SPACE_EM * FONT_SIZE,
      6,
    );
  });

  it('keeps the drawn line inside its box on every page', () => {
    // The width the renderer builds the box from, re-derived here from the
    // gap metrics rather than from the solver, so a change to either that
    // silently disagrees with the other fails here.
    for (let page = 1; page <= PAGES; page++) {
      const layout = getPageLayout(page);
      if (!layout) throw new Error(`page ${page} has no layout`);
      const measure = pageMeasureEm(layout);
      for (const line of layout.lines) {
        if (line.kind !== 'ayah') continue;
        const spaceEm = lineSpaceEm(line, measure);
        const g = gapMetrics(spaceEm, FONT_SIZE);
        const gapWidth = MUSHAF_SPACE_ADVANCE_EM * g.fontSize + g.letterSpacing;
        const drawn = line.natural * FONT_SIZE + gapWidth * lineGapCount(line);
        expect(drawn).toBeLessThanOrEqual(measure * FONT_SIZE + 1e-6);
      }
    }
  });
});
