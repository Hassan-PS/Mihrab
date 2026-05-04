import { Platform } from 'react-native';
import { normalizeHeadingDeg } from '../../utils/qibla';

/**
 * Pure math helpers for the compass — task #10.
 *
 * Extracted from CompassScreen so they can be unit-tested in isolation.
 * No React, no platform side effects beyond the iOS/Android branch in
 * `headingFromMagnetometer` (which is a coordinate-system difference, not
 * a runtime side effect).
 */

export function headingFromMagnetometer(x: number, y: number): number {
  if (Platform.OS === 'ios') {
    const rad = Math.atan2(y, x);
    const deg = (rad * 180) / Math.PI;
    return normalizeHeadingDeg(90 - deg);
  }
  const rad = Math.atan2(-x, y);
  const deg = (rad * 180) / Math.PI;
  return normalizeHeadingDeg(deg);
}

/** Shortest signed angle from `from` to `to`, in (-180, 180]. */
export function shortestAngleDiff(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Map magnetic field magnitude (µT) to a 0-100 score (Earth field is ~25-65). */
export function magneticFieldScore(x: number, y: number, z: number): number {
  const mag = Math.sqrt(x * x + y * y + z * z);
  return Math.min(100, Math.max(0, ((mag - 10) / 60) * 100));
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
