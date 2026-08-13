import { dragTranslation, swipeDayDelta } from '../src/journal/daySwipe';

const W = 360;

describe('swipeDayDelta', () => {
  test('a small drag springs back rather than changing day', () => {
    expect(
      swipeDayDelta({ dx: 30, vx: 0.05, width: W, canGoForward: true }),
    ).toBe(0);
  });

  test('a long slow drag right opens the previous day', () => {
    expect(
      swipeDayDelta({ dx: 120, vx: 0.01, width: W, canGoForward: true }),
    ).toBe(-1);
  });

  test('a flick counts even though it barely travels', () => {
    // The whole point of the second threshold: this drag is under the
    // distance bar and would otherwise be ignored.
    expect(
      swipeDayDelta({ dx: 22, vx: 0.9, width: W, canGoForward: true }),
    ).toBe(-1);
  });

  test('a flick back the other way wins over the drag it undid', () => {
    expect(
      swipeDayDelta({ dx: 100, vx: -0.8, width: W, canGoForward: true }),
    ).toBe(1);
  });

  test('forward is refused on today, and does not fall back to going back', () => {
    expect(
      swipeDayDelta({ dx: -200, vx: -0.9, width: W, canGoForward: false }),
    ).toBe(0);
  });

  test('backwards still works on today', () => {
    expect(
      swipeDayDelta({ dx: 200, vx: 0.9, width: W, canGoForward: false }),
    ).toBe(-1);
  });

  test('a narrow screen still needs a real drag, not 22% of very little', () => {
    // 22% of 160 is 35pt, which is a thumb twitch; the floor applies.
    expect(
      swipeDayDelta({ dx: 40, vx: 0.01, width: 160, canGoForward: true }),
    ).toBe(0);
    expect(
      swipeDayDelta({ dx: 50, vx: 0.01, width: 160, canGoForward: true }),
    ).toBe(-1);
  });

  test('RTL mirrors the axis, as the arrows either side of the date do', () => {
    expect(
      swipeDayDelta({
        dx: 120,
        vx: 0.01,
        width: W,
        canGoForward: true,
        rtl: true,
      }),
    ).toBe(1);
    expect(
      swipeDayDelta({
        dx: -120,
        vx: 0.01,
        width: W,
        canGoForward: true,
        rtl: true,
      }),
    ).toBe(-1);
  });

  test('RTL respects the no-future rule on the mirrored side', () => {
    expect(
      swipeDayDelta({
        dx: 200,
        vx: 0.9,
        width: W,
        canGoForward: false,
        rtl: true,
      }),
    ).toBe(0);
  });
});

describe('dragTranslation', () => {
  test('follows the finger when the day it is heading for exists', () => {
    expect(dragTranslation({ dx: 80, canGoForward: true })).toBe(80);
    expect(dragTranslation({ dx: -80, canGoForward: true })).toBe(-80);
  });

  test('rubber-bands towards tomorrow, which does not exist', () => {
    const moved = dragTranslation({ dx: -80, canGoForward: false });
    expect(Math.abs(moved)).toBeLessThan(80);
    // It must still MOVE: a panel that ignores the finger reads as a bug,
    // one that resists reads as an answer.
    expect(Math.abs(moved)).toBeGreaterThan(0);
  });

  test('backwards is never resisted, even on today', () => {
    expect(dragTranslation({ dx: 80, canGoForward: false })).toBe(80);
  });

  test('RTL resists on the mirrored side', () => {
    expect(
      dragTranslation({ dx: 80, canGoForward: false, rtl: true }),
    ).not.toBe(80);
    expect(dragTranslation({ dx: -80, canGoForward: false, rtl: true })).toBe(
      -80,
    );
  });
});
