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
import {
  PULL_CLAIM_SLOP,
  PULL_MAX,
  PULL_RESTING,
  PULL_THRESHOLD,
  pullDistance,
  pullPhase,
  pullProgress,
  releaseStarts,
  shouldClaimPull,
} from '../src/screens/home/pullGesture';

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

describe('which drags are taken from the scroll view', () => {
  const claim = (over: Partial<Parameters<typeof shouldClaimPull>[0]>) =>
    shouldClaimPull({ atTop: true, dy: 40, dx: 0, ...over });

  it('only at the top, or a pull-down is an ordinary scroll', () => {
    expect(claim({})).toBe(true);
    expect(claim({ atTop: false })).toBe(false);
  });

  it('only downward', () => {
    expect(claim({ dy: -40 })).toBe(false);
    expect(claim({ dy: 0 })).toBe(false);
  });

  it('not before the slop, so a tap that trembles is not a pull', () => {
    expect(claim({ dy: PULL_CLAIM_SLOP })).toBe(false);
    expect(claim({ dy: PULL_CLAIM_SLOP + 1 })).toBe(true);
  });

  it('and never a sideways drag — the day carousel lives on this page', () => {
    // Swiping to yesterday must turn the day, not drag the screen down.
    expect(claim({ dy: 20, dx: 60 })).toBe(false);
    expect(claim({ dy: 20, dx: 20 })).toBe(false);
    expect(claim({ dy: 60, dx: 20 })).toBe(true);
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
