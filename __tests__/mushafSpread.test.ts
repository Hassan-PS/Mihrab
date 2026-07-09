import {
  pageOffsetX,
  spreadLeftPage,
  scrollXForPage,
  pageFromScroll,
} from '../src/quran/mushafSpread';

const TOTAL = 604;

describe('mushaf single-page paging (unchanged core)', () => {
  const W = 400; // pageW === frameWidth in single mode
  test('page 1 is rightmost, page TOTAL is leftmost', () => {
    expect(pageOffsetX(1, W, TOTAL)).toBe((TOTAL - 1) * W);
    expect(pageOffsetX(TOTAL, W, TOTAL)).toBe(0);
  });
  test('scroll target equals the page offset', () => {
    for (const p of [1, 2, 50, 300, 604]) {
      expect(scrollXForPage(p, W, TOTAL, false)).toBe(pageOffsetX(p, W, TOTAL));
    }
  });
  test('scroll ↔ page round-trips', () => {
    for (const p of [1, 2, 50, 300, 604]) {
      const x = scrollXForPage(p, W, TOTAL, false);
      expect(pageFromScroll(x, W, TOTAL, false)).toBe(p);
    }
  });
});

describe('mushaf dual-page spread paging (facing pages, RTL)', () => {
  const frame = 800; // viewport = one spread
  const pageW = frame / 2; // each page is half the frame

  test('pairs are (1,2), (3,4), … — even page is the left of the spread', () => {
    expect(spreadLeftPage(1, TOTAL)).toBe(2);
    expect(spreadLeftPage(2, TOTAL)).toBe(2);
    expect(spreadLeftPage(3, TOTAL)).toBe(4);
    expect(spreadLeftPage(4, TOTAL)).toBe(4);
    expect(spreadLeftPage(603, TOTAL)).toBe(604);
    expect(spreadLeftPage(604, TOTAL)).toBe(604);
  });

  test('every spread scroll offset is an exact multiple of the frame width', () => {
    for (let p = 1; p <= TOTAL; p++) {
      const x = scrollXForPage(p, pageW, TOTAL, true);
      expect(x % frame).toBe(0);
    }
  });

  test('both pages of a spread map to the same scroll offset', () => {
    for (let odd = 1; odd < TOTAL; odd += 2) {
      const even = odd + 1;
      expect(scrollXForPage(odd, pageW, TOTAL, true)).toBe(
        scrollXForPage(even, pageW, TOTAL, true),
      );
    }
  });

  test('scroll → current page reports the spread’s right-hand (odd) page', () => {
    for (let odd = 1; odd < TOTAL; odd += 2) {
      const x = scrollXForPage(odd, pageW, TOTAL, true);
      expect(pageFromScroll(x, frame, TOTAL, true)).toBe(odd);
    }
  });

  test('opening spread (1,2) sits at the far right; last spread (603,604) at x=0', () => {
    // Page 604 is leftmost → its spread offset is 0.
    expect(scrollXForPage(604, pageW, TOTAL, true)).toBe(0);
    expect(scrollXForPage(603, pageW, TOTAL, true)).toBe(0);
    // Opening spread is the largest offset.
    const opening = scrollXForPage(1, pageW, TOTAL, true);
    expect(opening).toBe((TOTAL - 2) * pageW);
    expect(pageFromScroll(opening, frame, TOTAL, true)).toBe(1);
  });
});
