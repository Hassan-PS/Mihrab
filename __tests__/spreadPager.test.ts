/**
 * The spread pager, driven with fake offsets and fake timers.
 *
 * These are the two Mac bugs of 2 September, and the behaviours around
 * them, run for real rather than grepped for: a settle that fired in the
 * middle of a trackpad swipe and fought it, and a settle that could not
 * tell its own corrective scroll from the user's and swung between two
 * pages until the app crashed.
 */
import {
  createSpreadPager,
  GUARD_ANIMATED_MS,
  SCROLL_IDLE_MS,
  type PagerList,
  type SpreadPager,
} from '../src/quran/useSpreadPager';

const W = 700;
const TOTAL = 604;

function harness(opts: { width?: number; paired?: boolean; initialPage?: number } = {}) {
  const width = opts.width ?? W;
  const paired = opts.paired ?? true;
  const list: PagerList & { calls: string[] } = {
    calls: [],
    scrollToIndex: ({ index, animated }) => {
      list.calls.push(`index:${index}:${animated ? 'anim' : 'jump'}`);
    },
    scrollToOffset: ({ offset }) => {
      list.calls.push(`offset:${offset}`);
    },
  };
  const turns: Array<[number, number]> = [];
  const events: string[] = [];
  const pager: SpreadPager = createSpreadPager({
    list: () => list,
    itemCount: () => (paired ? 302 : TOTAL),
    pageWidth: () => width,
    indexForPage: page => (paired ? Math.floor((page - 1) / 2) : page - 1),
    pageForIndex: index => (paired ? index * 2 + 1 : index + 1),
    initialPage: opts.initialPage ?? 1,
    onTurn: (page, prev) => turns.push([page, prev]),
    onTurnStart: () => events.push('start'),
    onSettleNoop: () => events.push('noop'),
  });
  /** A trackpad swipe: wheel phases 16 ms apart, no drag end, no momentum. */
  const swipe = (...offsets: number[]) => {
    for (const x of offsets) {
      pager.onScroll(x);
      jest.advanceTimersByTime(16);
    }
  };
  const silence = () => jest.advanceTimersByTime(SCROLL_IDLE_MS + 1);
  return { list, turns, events, pager, swipe, silence, width };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('a trackpad swipe', () => {
  it('is left alone while the fingers are still moving', () => {
    const h = harness();
    h.swipe(40, 160, 330, 520, 690);
    // Five wheel phases, each of which used to fire a drag end and a
    // corrective animation against the swipe still arriving.
    expect(h.list.calls).toEqual([]);
    expect(h.turns).toEqual([]);
  });

  it('settles onto the nearest page once the scrolling goes quiet', () => {
    const h = harness();
    h.swipe(40, 160, 330, 520, 690);
    h.silence();
    expect(h.turns).toEqual([[3, 1]]);
    // 690 is ten pixels short of a page boundary: nudged, once.
    expect(h.list.calls).toEqual(['index:1:anim']);
  });

  it('does not nudge a list that already rests on a boundary', () => {
    const h = harness();
    h.swipe(200, 500, 700);
    h.silence();
    expect(h.turns).toEqual([[3, 1]]);
    expect(h.list.calls).toEqual([]);
  });

  it('that comes back where it started navigates nowhere and says so', () => {
    const h = harness();
    h.swipe(120, 260, 90, 0);
    h.silence();
    expect(h.turns).toEqual([]);
    expect(h.events).toEqual(['noop']);
  });
});

describe('a scroll the pager started itself', () => {
  it('is not settled — the correction’s own scroll events are ignored', () => {
    const h = harness();
    h.swipe(40, 160, 330, 520, 690);
    h.silence();
    expect(h.list.calls).toEqual(['index:1:anim']);
    // The correction animates 690 → 700 and raises scroll events as it
    // goes. None of them may settle, nudge, or turn.
    h.swipe(693, 697, 699, 700);
    h.silence();
    h.pager.onMomentumEnd(700);
    expect(h.list.calls).toEqual(['index:1:anim']);
    expect(h.turns).toEqual([[3, 1]]);
  });

  it('lifts its mark on arrival, so the next swipe counts again', () => {
    const h = harness();
    h.swipe(40, 690);
    h.silence();
    h.swipe(700); // arrived
    h.silence();
    h.swipe(900, 1200, 1400);
    h.silence();
    expect(h.turns).toEqual([
      [3, 1],
      [5, 3],
    ]);
  });

  it('lifts its mark by timeout when the animation never lands', () => {
    // Interrupted by a resize, say. A mark that never lifts is a reader
    // that stops responding to the trackpad entirely.
    const h = harness();
    h.pager.turnPage(1);
    expect(h.list.calls).toEqual(['index:1:anim']);
    jest.advanceTimersByTime(GUARD_ANIMATED_MS + 1);
    h.swipe(900, 1200, 1400);
    h.silence();
    expect(h.turns).toEqual([
      [3, 1],
      [5, 3],
    ]);
  });
});

describe('an arrow press onto a list the swipe left mid-page', () => {
  it('turns once and does not swing', () => {
    // The crash. The list rested at 350 — half a page — and the arrow
    // scrolled from index 1 to 2. That animation's events settled to an
    // index that did not match, settling scrolled again, and so on.
    const h = harness();
    h.swipe(120, 350);
    h.silence(); // idle settle: round(0.5) = 1, adrift → nudge to 700
    expect(h.turns).toEqual([[3, 1]]);
    expect(h.list.calls).toEqual(['index:1:anim']);

    h.pager.turnPage(1); // while the nudge is still travelling
    expect(h.turns).toEqual([
      [3, 1],
      [5, 3],
    ]);
    expect(h.list.calls).toEqual(['index:1:anim', 'index:2:anim']);

    // Everything the two animations raise, in the order UIKit raises it.
    h.swipe(500, 900, 1250, 1398, 1400);
    h.pager.onMomentumEnd(1400);
    h.silence();
    jest.advanceTimersByTime(GUARD_ANIMATED_MS);
    expect(h.turns).toHaveLength(2);
    expect(h.list.calls).toHaveLength(2);
  });

  it('and a long run of arrows is a run of single turns', () => {
    const h = harness();
    for (let i = 0; i < 10; i++) {
      h.pager.turnPage(1);
      h.swipe((i + 1) * W - 30, (i + 1) * W);
      h.pager.onMomentumEnd((i + 1) * W);
    }
    expect(h.turns).toHaveLength(10);
    expect(h.list.calls).toHaveLength(10);
    expect(h.pager.settledIndex()).toBe(10);
  });
});

describe('a finger', () => {
  it('settles the moment its momentum ends, with no second settle after', () => {
    const h = harness();
    h.swipe(200, 500, 700);
    h.pager.onMomentumEnd(700);
    expect(h.turns).toEqual([[3, 1]]);
    h.silence();
    expect(h.turns).toEqual([[3, 1]]);
    expect(h.events).toEqual([]);
  });
});

describe('a fractional page width', () => {
  it('is not read as adrift at its own rounding error', () => {
    // A Mac window is whatever width the pointer left it at. Native lands
    // the snap on a whole pixel; index × width is not one.
    const width = 705.3333;
    const h = harness({ width });
    const landed = Math.round(3 * width);
    h.swipe(landed / 2, landed);
    h.silence();
    expect(h.turns).toEqual([[7, 1]]);
    expect(h.list.calls).toEqual([]);
  });
});

describe('the edges', () => {
  it('turnPage does nothing past either end', () => {
    const h = harness();
    h.pager.turnPage(-1);
    expect(h.turns).toEqual([]);
    expect(h.list.calls).toEqual([]);
    const last = harness({ initialPage: 603 });
    last.pager.turnPage(1);
    expect(last.turns).toEqual([]);
  });

  it('a settle clamps a fling past the end onto the last item', () => {
    const h = harness({ initialPage: 601 });
    h.swipe(301 * W + 400);
    h.silence();
    expect(h.pager.settledIndex()).toBe(301);
  });
});

describe('outside changes', () => {
  it('following a page inside the current spread does not scroll', () => {
    const h = harness();
    h.pager.followPage(2);
    expect(h.list.calls).toEqual([]);
    expect(h.pager.settledPage()).toBe(2);
  });

  it('following a page in another spread jumps, without a turn', () => {
    const h = harness();
    h.pager.followPage(50);
    expect(h.list.calls).toEqual(['index:24:jump']);
    expect(h.turns).toEqual([]);
  });

  it('re-anchoring after a resize keeps the page under the new geometry', () => {
    const h = harness();
    h.pager.followPage(50);
    h.pager.reanchor();
    expect(h.list.calls).toEqual(['index:24:jump', 'index:24:jump']);
  });

  it('a failed scrollToIndex lands on the offset instead of throwing', () => {
    const h = harness();
    h.pager.turnPage(1);
    h.pager.onScrollToIndexFailed(1);
    expect(h.list.calls).toEqual(['index:1:anim', `offset:${W}`]);
    // And the mark is dropped, so the next swipe is heard.
    h.swipe(1400);
    h.silence();
    expect(h.pager.settledIndex()).toBe(2);
  });
});
