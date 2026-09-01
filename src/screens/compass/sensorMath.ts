import { normalizeHeadingDeg } from '../../utils/qibla';

/**
 * Pure math helpers for the compass — task #10.
 *
 * Extracted from CompassScreen so they can be unit-tested in isolation.
 * No React, no platform branches: both platforms now hand over a finished
 * heading from their native module, so everything here operates on
 * degrees rather than on raw sensor axes.
 *
 * `headingFromMagnetometer` and `magneticFieldScore` used to live here.
 * They computed a heading from the two horizontal magnetometer axes,
 * which is correct only while the phone is flat and takes no account of
 * magnetic declination. Both are gone with the Android sensor rewrite
 * rather than kept "just in case": a helper that produces a plausible
 * wrong bearing is the kind of thing that gets called again.
 */

/** Shortest signed angle from `from` to `to`, in (-180, 180]. */
export function shortestAngleDiff(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Score recent heading samples on stability — 100 = perfectly still, 0 = chaotic. */
export function stabilityScoreFromHeadings(headings: number[]): number {
  if (headings.length < 4) return 55;
  let sumSin = 0;
  let sumCos = 0;
  for (const h of headings) {
    const r = (h * Math.PI) / 180;
    sumSin += Math.sin(r);
    sumCos += Math.cos(r);
  }
  const meanAngle = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  const mean = normalizeHeadingDeg(meanAngle);
  let varSum = 0;
  for (const h of headings) {
    const d = shortestAngleDiff(mean, h);
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / headings.length);
  return Math.min(100, Math.max(0, 100 - std * 6));
}

/** Combine field strength and stability into a single 0-100 signal score. */
export function combineSignal(field: number, stability: number): number {
  return Math.round(field * 0.5 + stability * 0.5);
}
