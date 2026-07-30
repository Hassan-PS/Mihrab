/**
 * Spread-as-item pairing for MushafSpreadReader (mushaf-reader-split plan,
 * step 3).
 *
 * The convention comes from mushafSpread.ts (and the printed Madinah
 * mushaf): spreads pair (1,2), (3,4), (5,6)… — odd page on the RIGHT,
 * even page on the LEFT. Pages 1 (Al-Fatiha) and 2 (start of Al-Baqarah)
 * form the decorative opening spread, so page 1 is NOT alone.
 */
import {
  pageOffsetX,
  scrollXForPage,
  spreadCount,
  spreadForPage,
  spreadLeftPage,
} from '../src/quran/mushafSpread';

const TOTAL = 604;

describe('spreadForPage — spread-as-item pairing (RTL)', () => {
  test('opening spread pairs (1,2): odd right, even left, index 0', () => {
    expect(spreadForPage(1, TOTAL)).toEqual({ index: 0, right: 1, left: 2 });
    expect(spreadForPage(2, TOTAL)).toEqual({ index: 0, right: 1, left: 2 });
  });

  test('3 and 4 share spread 1; both pages resolve to the same spread', () => {
    expect(spreadForPage(3, TOTAL)).toEqual({ index: 1, right: 3, left: 4 });
    expect(spreadForPage(4, TOTAL)).toEqual({ index: 1, right: 3, left: 4 });
  });

  test('last spread of the 604-page mushaf is (603, 604)', () => {
    expect(spreadForPage(603, TOTAL)).toEqual({
      index: 301,
      right: 603,
      left: 604,
    });
    expect(spreadForPage(604, TOTAL)).toEqual({
      index: 301,
      right: 603,
      left: 604,
    });
  });

  test('every page maps to exactly one spread; right is odd, left even', () => {
    for (let p = 1; p <= TOTAL; p++) {
      const s = spreadForPage(p, TOTAL);
      expect(s.index).toBe(Math.floor((p - 1) / 2));
      expect(s.right % 2).toBe(1);
      expect(s.left).toBe(s.right + 1);
      // The page itself is a member of its spread.
      expect([s.right, s.left]).toContain(p);
    }
  });

  test('an odd total leaves the final page alone on the last spread', () => {
    expect(spreadForPage(5, 5)).toEqual({ index: 2, right: 5, left: null });
    expect(spreadForPage(1, 1)).toEqual({ index: 0, right: 1, left: null });
  });

  test('out-of-range pages clamp into the mushaf', () => {
    expect(spreadForPage(0, TOTAL)).toEqual(spreadForPage(1, TOTAL));
    expect(spreadForPage(-3, TOTAL)).toEqual(spreadForPage(1, TOTAL));
    expect(spreadForPage(9999, TOTAL)).toEqual(spreadForPage(TOTAL, TOTAL));
  });

  test('agrees with the legacy spreadLeftPage pairing everywhere', () => {
    for (let p = 1; p <= TOTAL; p++) {
      expect(spreadForPage(p, TOTAL).left).toBe(spreadLeftPage(p, TOTAL));
    }
  });

  test('spread index matches the legacy dual-page scroll offsets', () => {
    // In the spread pager each item is one frame wide; the legacy dual
    // pager scrolled by two pageW columns per spread. Inverted-list index
    // i sits at offset (count − 1 − i) frames from the RTL far end — the
    // same spread the legacy scrollXForPage math lands on.
    const pageW = 400;
    const frame = pageW * 2;
    for (const p of [1, 2, 3, 4, 77, 302, 603, 604]) {
      const legacySpreadsFromLeft = scrollXForPage(p, pageW, TOTAL, true) / frame;
      const index = spreadForPage(p, TOTAL).index;
      expect(index).toBe(spreadCount(TOTAL) - 1 - legacySpreadsFromLeft);
    }
  });

  test('spreadCount: 604 pages → 302 spreads; odd totals round up', () => {
    expect(spreadCount(TOTAL)).toBe(302);
    expect(spreadCount(5)).toBe(3);
    expect(spreadCount(1)).toBe(1);
  });

  test('single-page offsets untouched (sanity, shared module)', () => {
    expect(pageOffsetX(1, 400, TOTAL)).toBe((TOTAL - 1) * 400);
  });
});
