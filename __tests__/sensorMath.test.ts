/**
 * Compass sensor math — task #17.
 *
 * Pure-function tests for the helpers extracted from CompassScreen in task
 * #10. These power the live compass dial — smoothing and stability
 * scoring. Bugs here surface as a jittery dial or an always-very-weak
 * signal indicator.
 *
 * `headingFromMagnetometer` and `magneticFieldScore` were tested here too
 * and are gone: both platforms now hand over a finished heading from
 * their native module, so nothing in the app turns raw magnetometer axes
 * into a bearing any more. Their tests only ever asserted that the answer
 * was in range and repeatable, which a wrong bearing also satisfies.
 */

import {
  combineSignal,
  shortestAngleDiff,
  stabilityScoreFromHeadings,
} from '../src/screens/compass/sensorMath';

describe('shortestAngleDiff', () => {
  test('returns 0 for identical angles', () => {
    expect(shortestAngleDiff(0, 0)).toBe(0);
    expect(shortestAngleDiff(180, 180)).toBe(0);
  });

  test('returns positive degrees for clockwise traversal', () => {
    expect(shortestAngleDiff(0, 30)).toBe(30);
    expect(shortestAngleDiff(170, 175)).toBe(5);
  });

  test('returns negative degrees for counter-clockwise traversal', () => {
    expect(shortestAngleDiff(30, 0)).toBe(-30);
    expect(shortestAngleDiff(180, 175)).toBe(-5);
  });

  test('takes the shortest path across the 0/360 discontinuity', () => {
    expect(shortestAngleDiff(350, 10)).toBe(20);
    expect(shortestAngleDiff(10, 350)).toBe(-20);
  });

  test('result is bounded in [-180, 180]', () => {
    // Antipodal pairs (diff of 180°) return ±180 — both endpoints are
    // valid representations of the same shortest path.
    for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (const b of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const d = shortestAngleDiff(a, b);
        expect(d).toBeGreaterThanOrEqual(-180);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('stabilityScoreFromHeadings', () => {
  test('returns the placeholder 55 for fewer than 4 samples', () => {
    expect(stabilityScoreFromHeadings([])).toBe(55);
    expect(stabilityScoreFromHeadings([0, 0, 0])).toBe(55);
  });

  test('returns ~100 for a perfectly steady reading', () => {
    expect(stabilityScoreFromHeadings([90, 90, 90, 90, 90, 90])).toBe(100);
  });

  test('returns a low score for chaotic readings', () => {
    const chaotic = [0, 90, 180, 270, 30, 200, 100, 350];
    expect(stabilityScoreFromHeadings(chaotic)).toBeLessThan(50);
  });

  test('handles the 0/360 discontinuity (samples straddling north)', () => {
    // All within ±5° of north — the score should be near-perfect even though
    // numerically the values jump from 355 to 5.
    const stableNearNorth = [358, 1, 359, 2, 0, 3];
    expect(stabilityScoreFromHeadings(stableNearNorth)).toBeGreaterThan(80);
  });

  test('result is always in [0, 100]', () => {
    for (const samples of [
      [0, 90, 180, 270, 0, 90, 180, 270],
      [10, 11, 12, 13, 14, 15, 16, 17],
      [180, 180, 180, 180],
    ]) {
      const s = stabilityScoreFromHeadings(samples);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});

describe('combineSignal', () => {
  test('returns the average of field and stability', () => {
    expect(combineSignal(0, 0)).toBe(0);
    expect(combineSignal(100, 100)).toBe(100);
    expect(combineSignal(80, 40)).toBe(60);
    expect(combineSignal(40, 80)).toBe(60); // commutative
  });

  test('rounds to an integer (signal-strength is displayed as N%)', () => {
    expect(Number.isInteger(combineSignal(33, 67))).toBe(true);
    expect(Number.isInteger(combineSignal(50, 51))).toBe(true);
  });
});
