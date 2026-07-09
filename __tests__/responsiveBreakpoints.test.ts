import {
  classifyWidth,
  columnsFor,
  contentColumnWidth,
  MAX_CONTENT_WIDTH,
  BREAKPOINT_REGULAR,
  BREAKPOINT_EXPANDED,
} from '../src/responsive/breakpoints';

describe('classifyWidth', () => {
  it('maps widths to the three tiers at the documented edges', () => {
    expect(classifyWidth(390)).toBe('compact');
    expect(classifyWidth(BREAKPOINT_REGULAR - 1)).toBe('compact');
    expect(classifyWidth(BREAKPOINT_REGULAR)).toBe('regular');
    expect(classifyWidth(1000)).toBe('regular');
    expect(classifyWidth(BREAKPOINT_EXPANDED - 1)).toBe('regular');
    expect(classifyWidth(BREAKPOINT_EXPANDED)).toBe('expanded');
    expect(classifyWidth(1600)).toBe('expanded');
  });
});

describe('contentColumnWidth', () => {
  it('is full width on compact, capped on wide', () => {
    expect(contentColumnWidth(390)).toBe(390);
    expect(contentColumnWidth(1600)).toBe(MAX_CONTENT_WIDTH);
    expect(contentColumnWidth(BREAKPOINT_REGULAR)).toBe(
      Math.min(BREAKPOINT_REGULAR, MAX_CONTENT_WIDTH),
    );
  });
});

describe('columnsFor', () => {
  it('fits as many min-width columns as the space allows', () => {
    // 6 tiles of 150 + 5 gutters of 12 = 960 <= 1000
    expect(columnsFor(1000, 150, 12)).toBe(6);
    expect(columnsFor(360, 150, 12)).toBe(2); // 2*150+12=312<=360, 3*150+24=474>360
    expect(columnsFor(150, 150, 12)).toBe(1);
    expect(columnsFor(140, 150, 12)).toBe(1); // never below 1
  });
  it('respects the max clamp', () => {
    expect(columnsFor(5000, 100, 8, 4)).toBe(4);
  });
  it('degrades safely on bad input', () => {
    expect(columnsFor(0, 150)).toBe(1);
    expect(columnsFor(1000, 0)).toBe(1);
  });
});
