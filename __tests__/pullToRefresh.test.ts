/**
 * THE PULL, AS ARITHMETIC.
 *
 * A gesture is usually tested by being used, which is why gestures are
 * usually not tested. Everything that decides what this one MEANS — how
 * far the page follows the finger, when a pull becomes a release, which
 * drags are claimed from the scroll view at all — is pure, so it can be.
 * What is left for a device is whether it FEELS right, which no test was
 * ever going to answer.
 */
import { Animated } from 'react-native';
import {
  PULL_ACTIVE_OFFSET_Y,
  PULL_CLAIM_SLOP,
  PULL_CURVE,
  PULL_FAIL_OFFSET_X,
  PULL_FAIL_OFFSET_Y,
  PULL_MAX,
  PULL_RESTING,
  PULL_SIDEWAYS,
  PULL_THRESHOLD,
  pullDistance,
  pullPhase,
  pullProgress,
  releaseStarts,
} from '../src/screens/home/pullGesture';
import { PullStore } from '../src/screens/home/PullToRefresh';

describe('how far the page follows the finger', () => {
  it('does not move for an upward drag', () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
  });

  it('follows one to one until the threshold', () => {
    // That stretch is where the reader learns the gesture exists, so it
    // has to feel honest.
    expect(pullDistance(20)).toBe(20);
    expect(pullDistance(PULL_THRESHOLD)).toBe(PULL_THRESHOLD);
  });

  it('pulls back hard past it, and stops', () => {
    // Overshooting should read as "yes, that is enough" rather than as
    // more distance.
    expect(pullDistance(PULL_THRESHOLD + 100)).toBeLessThan(
      PULL_THRESHOLD + 100,
    );
    expect(pullDistance(10_000)).toBe(PULL_MAX);
    // Monotonic all the way: the page never goes backwards while the
    // finger goes forwards.
    let last = -1;
    for (let dy = 0; dy < 400; dy += 7) {
      const next = pullDistance(dy);
      expect(next).toBeGreaterThanOrEqual(last);
      last = next;
    }
  });
});

describe('what the indicator is saying', () => {
  it('nothing, until the page has moved', () => {
    expect(pullPhase(0, false)).toBe('hidden');
  });

  it('"pull" below the threshold and "release" at it', () => {
    expect(pullPhase(PULL_THRESHOLD - 1, false)).toBe('pull');
    expect(pullPhase(PULL_THRESHOLD, false)).toBe('release');
    expect(pullPhase(PULL_MAX, false)).toBe('release');
  });

  it('and "refreshing" wins over the distance once it is running', () => {
    // Including at rest: the page is parked at the threshold, which on
    // the way down would have read as "release".
    expect(pullPhase(PULL_RESTING, true)).toBe('refreshing');
    expect(pullPhase(0, true)).toBe('refreshing');
  });
});

describe('what letting go means', () => {
  it('starts at the threshold, not a pixel before', () => {
    expect(releaseStarts(PULL_THRESHOLD - 1)).toBe(false);
    expect(releaseStarts(PULL_THRESHOLD)).toBe(true);
  });

  it('is asked of the page, so pulling past and back up cancels', () => {
    // The reader changed their mind. The only honest reading of where
    // they let go is where the page is.
    const pulledPastThenBack = pullDistance(20);
    expect(releaseStarts(pulledPastThenBack)).toBe(false);
  });

  it('and the page waits at the threshold while it runs', () => {
    expect(PULL_RESTING).toBe(PULL_THRESHOLD);
  });
});

describe('the page and the decision read one curve', () => {
  /**
   * The page is moved NATIVELY, by `Animated.interpolate` over PULL_CURVE,
   * so it keeps up with the finger whatever JavaScript is doing. Whether a
   * release refreshes is decided in JavaScript by `pullDistance`. If those
   * two disagreed, the page could sit visibly past the threshold on a
   * release that did nothing. So this asks React Native's own
   * interpolation, not a copy of it.
   */
  it('agrees with Animated.interpolate at every point of the pull', () => {
    for (let dy = -50; dy <= 400; dy += 3) {
      const native = new Animated.Value(dy).interpolate({
        inputRange: [...PULL_CURVE.inputRange],
        outputRange: [...PULL_CURVE.outputRange],
        extrapolate: 'clamp',
      }) as unknown as { __getValue: () => number };
      expect(pullDistance(dy)).toBeCloseTo(native.__getValue(), 6);
    }
  });

  it('parks at a point the curve passes through one to one', () => {
    // The page is sprung to PULL_RESTING by springing the FINGER's value
    // there; that only lands the page at the same number because the
    // curve is the identity up to the threshold.
    expect(pullDistance(PULL_RESTING)).toBe(PULL_RESTING);
  });
});

describe('which drags are a pull, said to the gesture handler', () => {
  /** "Moving outside this range" is how the handler reads an offset pair. */
  const outside = ([lo, hi]: [number, number], v: number) => v < lo || v > hi;

  it('activates only downward, after the slop', () => {
    expect(outside(PULL_ACTIVE_OFFSET_Y, PULL_CLAIM_SLOP)).toBe(false);
    expect(outside(PULL_ACTIVE_OFFSET_Y, PULL_CLAIM_SLOP + 1)).toBe(true);
    // Upward never activates it, however far.
    expect(outside(PULL_ACTIVE_OFFSET_Y, -500)).toBe(false);
  });

  it('fails upward, which hands the scroll straight back', () => {
    expect(outside(PULL_FAIL_OFFSET_Y, -(PULL_CLAIM_SLOP + 1))).toBe(true);
    expect(outside(PULL_FAIL_OFFSET_Y, 300)).toBe(false);
  });

  it('fails sideways — the day carousel lives on this page', () => {
    expect(outside(PULL_FAIL_OFFSET_X, PULL_SIDEWAYS + 1)).toBe(true);
    expect(outside(PULL_FAIL_OFFSET_X, -(PULL_SIDEWAYS + 1))).toBe(true);
    expect(outside(PULL_FAIL_OFFSET_X, PULL_SIDEWAYS - 1)).toBe(false);
  });
});

/**
 * ── THE LAG, ON THE REACT SIDE ─────────────────────────────────────────
 *
 * The first version called a state setter from HomeScreen on every move,
 * so a fifteen-hundred-line screen could render dozens of times a second
 * under the reader's thumb. The store is what replaced that, and these
 * count exactly how often it wakes anything up.
 */
describe('the store the pull lives in', () => {
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  it('wakes its readers only when the words change, not per move', () => {
    const store = new PullStore();
    let wakes = 0;
    store.subscribe(() => {
      wakes += 1;
    });
    // Sixty move events across the whole pull, past the threshold.
    for (let dy = 1; dy <= 180; dy += 3) store.onDrag(dy);
    // hidden → pull, pull → release. Twice. Not sixty.
    expect(wakes).toBe(2);
    expect(store.get().phase).toBe('release');
  });

  it('scrolling wakes nothing unless the page reaches or leaves the top', () => {
    const store = new PullStore();
    let wakes = 0;
    store.subscribe(() => {
      wakes += 1;
    });
    const at = (y: number) =>
      ({ nativeEvent: { contentOffset: { y } } }) as never;
    for (let y = 0; y <= 600; y += 10) store.onScroll(at(y));
    for (let y = 600; y >= 0; y -= 10) store.onScroll(at(y));
    expect(wakes).toBe(2); // left the top, came back to it
  });

  it('a release short of the threshold is a cancel', async () => {
    const store = new PullStore();
    const work = jest.fn(async () => {});
    store.setWork(work);
    store.onDrag(40);
    store.onRelease(40, true);
    await settle();
    expect(work).not.toHaveBeenCalled();
    expect(store.get().running).toBe(false);
  });

  it('so is pulling past it and pushing back up before letting go', async () => {
    const store = new PullStore();
    const work = jest.fn(async () => {});
    store.setWork(work);
    store.onDrag(150);
    store.onDrag(30);
    store.onRelease(30, true);
    await settle();
    expect(work).not.toHaveBeenCalled();
  });

  it('and so is the system taking the gesture, however far it had got', async () => {
    const store = new PullStore();
    const work = jest.fn(async () => {});
    store.setWork(work);
    store.onRelease(200, false);
    await settle();
    expect(work).not.toHaveBeenCalled();
  });

  it('a release past it runs the work, reports progress, and ends', async () => {
    const store = new PullStore();
    let finish!: () => void;
    let report!: (c: number, t: number) => void;
    store.setWork(
      r =>
        new Promise<void>(resolve => {
          report = r;
          finish = resolve;
        }),
    );
    store.onDrag(120);
    store.onRelease(120, true);
    expect(store.get()).toMatchObject({ running: true, phase: 'refreshing' });

    report(12, 31);
    expect(store.get().progress).toEqual({ current: 12, total: 31 });

    // A drag while it runs changes nothing: the page is parked.
    store.onDrag(10);
    expect(store.get().phase).toBe('refreshing');

    finish();
    await settle();
    expect(store.get()).toMatchObject({ running: false, progress: null });
  });

  it('cannot be started twice', async () => {
    const store = new PullStore();
    const work = jest.fn(() => new Promise<void>(() => {}));
    store.setWork(work);
    store.onRelease(120, true);
    store.onRelease(120, true);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('survives work that throws, and puts the page back', async () => {
    const store = new PullStore();
    store.setWork(async () => {
      throw new Error('offline');
    });
    store.onRelease(120, true);
    await settle();
    expect(store.get().running).toBe(false);
  });
});

describe('the progress bar', () => {
  it('is a fraction, and stays one', () => {
    expect(pullProgress(0, 10)).toBe(0);
    expect(pullProgress(5, 10)).toBe(0.5);
    expect(pullProgress(10, 10)).toBe(1);
  });

  it('cannot be embarrassed by the numbers it is given', () => {
    // A fill that reports more done than it has, or a total of nothing.
    expect(pullProgress(20, 10)).toBe(1);
    expect(pullProgress(1, 0)).toBe(0);
    expect(pullProgress(-1, 10)).toBe(0);
    expect(pullProgress(Number.NaN, 10)).toBe(0);
    expect(pullProgress(1, Number.NaN)).toBe(0);
  });
});
