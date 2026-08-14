/**
 * The practice graph, read from both ends.
 *
 * Every one of these has a Latin case and an Arabic case, because the bug
 * was not that the Arabic maths was wrong — there was no Arabic maths. The
 * component asked "is x near zero?" and got the right answer in one language
 * and the exact opposite in the other.
 */
import {
  distanceToOldest,
  maxOffset,
  offsetAfterGrowth,
  shouldLoadOlder,
  todayOffset,
} from '../src/practice/heatmapScroll';

/** A square plus its gap, matching PracticeHeatmap's COL. */
const COL = 19;
/** A year and a half of weeks on a phone-width viewport. */
const CONTENT = COL * 78;
const VIEWPORT = 300;
const MAX = CONTENT - VIEWPORT;

describe('maxOffset', () => {
  it('is the content that does not fit', () => {
    expect(maxOffset(CONTENT, VIEWPORT)).toBe(MAX);
  });

  it('is zero when the graph fits — a fresh install has nothing to scroll', () => {
    expect(maxOffset(200, 300)).toBe(0);
    expect(maxOffset(300, 300)).toBe(0);
  });

  it('is zero rather than NaN before anything has been measured', () => {
    expect(maxOffset(0, 0)).toBe(0);
    expect(maxOffset(NaN, 300)).toBe(0);
  });
});

describe('todayOffset', () => {
  it('parks at the far end in Latin — today is the last column', () => {
    expect(todayOffset(false, MAX)).toBe(MAX);
  });

  it('parks at zero in Arabic — the row runs the other way', () => {
    expect(todayOffset(true, MAX)).toBe(0);
  });

  it('is the same place either way when there is nothing to scroll', () => {
    expect(todayOffset(false, 0)).toBe(0);
    expect(todayOffset(true, 0)).toBe(0);
  });

  it('opens somewhere the other direction calls the oldest week', () => {
    // The regression in one line: the Latin park is the Arabic past.
    expect(distanceToOldest(true, todayOffset(false, MAX), MAX)).toBe(0);
    expect(distanceToOldest(false, todayOffset(true, MAX), MAX)).toBe(0);
  });
});

describe('distanceToOldest', () => {
  it('counts from zero in Latin', () => {
    expect(distanceToOldest(false, 0, MAX)).toBe(0);
    expect(distanceToOldest(false, 5 * COL, MAX)).toBe(5 * COL);
    expect(distanceToOldest(false, MAX, MAX)).toBe(MAX);
  });

  it('counts from the far end in Arabic', () => {
    expect(distanceToOldest(true, MAX, MAX)).toBe(0);
    expect(distanceToOldest(true, MAX - 5 * COL, MAX)).toBe(5 * COL);
    expect(distanceToOldest(true, 0, MAX)).toBe(MAX);
  });

  it('never goes negative when the platform overscrolls past the edge', () => {
    expect(distanceToOldest(false, -40, MAX)).toBe(0);
    expect(distanceToOldest(true, MAX + 40, MAX)).toBe(0);
  });
});

describe('shouldLoadOlder', () => {
  const check = (rtl: boolean, offset: number) =>
    shouldLoadOlder({
      rtl,
      offset,
      contentWidth: CONTENT,
      viewportWidth: VIEWPORT,
      columnWidth: COL,
    });

  it('asks at the oldest edge, in whichever direction that is', () => {
    expect(check(false, 0)).toBe(true);
    expect(check(true, MAX)).toBe(true);
  });

  it('does not ask when the view is parked on today', () => {
    expect(check(false, MAX)).toBe(false);
    // The regression: in Arabic, parking on today put the offset at 0 and
    // the graph immediately asked for another two years of history — then
    // did it again as soon as those landed.
    expect(check(true, 0)).toBe(false);
  });

  it('asks two columns early, so there is still something to drag', () => {
    expect(check(false, COL * 2)).toBe(true);
    expect(check(false, COL * 2 + 1)).toBe(false);
    expect(check(true, MAX - COL * 2)).toBe(true);
    expect(check(true, MAX - COL * 2 - 1)).toBe(false);
  });

  it('never asks while the whole graph fits on screen', () => {
    for (const rtl of [false, true]) {
      expect(
        shouldLoadOlder({
          rtl,
          offset: 0,
          contentWidth: 240,
          viewportWidth: 300,
          columnWidth: COL,
        }),
      ).toBe(false);
    }
  });
});

describe('offsetAfterGrowth', () => {
  const added = 26;

  it('follows the columns in Latin — they were inserted to the left', () => {
    const before = 3 * COL;
    expect(offsetAfterGrowth(false, before, added, COL)).toBe(
      before + added * COL,
    );
  });

  it('holds still in Arabic — the past extends the other way', () => {
    const before = MAX - 3 * COL;
    expect(offsetAfterGrowth(true, before, added, COL)).toBe(before);
  });

  it('keeps the same week under the thumb in both directions', () => {
    // Three columns from the oldest edge, before and after the load.
    const oldMax = MAX;
    const newMax = MAX + added * COL;
    const ltrBefore = 3 * COL;
    const ltrAfter = offsetAfterGrowth(false, ltrBefore, added, COL);
    expect(distanceToOldest(false, ltrAfter, newMax)).toBe(
      distanceToOldest(false, ltrBefore, oldMax) + added * COL,
    );

    const rtlBefore = oldMax - 3 * COL;
    const rtlAfter = offsetAfterGrowth(true, rtlBefore, added, COL);
    expect(distanceToOldest(true, rtlAfter, newMax)).toBe(
      distanceToOldest(true, rtlBefore, oldMax) + added * COL,
    );
  });

  it('ignores a negative or zero growth rather than dragging backwards', () => {
    expect(offsetAfterGrowth(false, 100, 0, COL)).toBe(100);
    expect(offsetAfterGrowth(false, 100, -4, COL)).toBe(100);
    expect(offsetAfterGrowth(true, 100, -4, COL)).toBe(100);
  });
});
