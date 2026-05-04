/**
 * coordsChangedSignificantly threshold — task #17.
 *
 * `usePrayerDay` uses this gate to decide whether a fresh GPS reading
 * warrants a re-fetch. Without the threshold, the app would re-fetch on
 * every tiny sub-meter wobble (battery / network waste). With too high a
 * threshold, walking from home to the corner mosque wouldn't refresh.
 *
 * Default 0.01° is approximately:
 *   • 1.1 km at the equator,
 *   • ~700 m at 50° latitude (Stockholm),
 *   • ~280 m at 80° latitude (extreme north).
 *
 * That's the right granularity for prayer times — a difference of <1 km
 * shifts Fajr/Maghrib by less than a minute at temperate latitudes.
 */
import { coordsChangedSignificantly } from '../src/utils/coords';

describe('coordsChangedSignificantly', () => {
  test('returns true when no previous position is known', () => {
    expect(coordsChangedSignificantly(59.33, 18.07, null, null)).toBe(true);
    expect(coordsChangedSignificantly(59.33, 18.07, undefined, undefined)).toBe(
      true,
    );
    expect(coordsChangedSignificantly(59.33, 18.07, 59.33, undefined)).toBe(
      true,
    );
    expect(coordsChangedSignificantly(59.33, 18.07, undefined, 18.07)).toBe(
      true,
    );
  });

  test('returns false for sub-threshold drift in either axis (default 0.01°)', () => {
    // ~100 m shift in lat — well under the 1.1 km threshold at the equator.
    expect(
      coordsChangedSignificantly(59.331, 18.07, 59.33, 18.07),
    ).toBe(false);
    expect(
      coordsChangedSignificantly(59.33, 18.071, 59.33, 18.07),
    ).toBe(false);
    // Identical position.
    expect(coordsChangedSignificantly(59.33, 18.07, 59.33, 18.07)).toBe(false);
  });

  test('returns true when latitude shifts by more than the threshold', () => {
    // 0.02° shift = ~2.2 km at the equator → above threshold.
    expect(
      coordsChangedSignificantly(59.35, 18.07, 59.33, 18.07),
    ).toBe(true);
  });

  test('returns true when longitude shifts by more than the threshold', () => {
    expect(
      coordsChangedSignificantly(59.33, 18.09, 59.33, 18.07),
    ).toBe(true);
  });

  test('threshold is strictly greater-than — clearly-under stays false', () => {
    // 0.009° — clearly under 0.01°, no float precision wobble.
    expect(
      coordsChangedSignificantly(59.339, 18.07, 59.33, 18.07),
    ).toBe(false);
  });

  test('threshold is strictly greater-than — clearly-over triggers', () => {
    // 0.015° — clearly over.
    expect(
      coordsChangedSignificantly(59.345, 18.07, 59.33, 18.07),
    ).toBe(true);
  });

  test('respects a custom threshold for tighter or looser behavior', () => {
    // 0.005° shift, threshold 0.001°: should trigger.
    expect(
      coordsChangedSignificantly(59.335, 18.07, 59.33, 18.07, 0.001),
    ).toBe(true);
    // Same shift, threshold 0.01°: still under, no trigger.
    expect(
      coordsChangedSignificantly(59.335, 18.07, 59.33, 18.07, 0.01),
    ).toBe(false);
  });

  test('handles negative coordinates (southern hemisphere, west of prime meridian)', () => {
    expect(
      coordsChangedSignificantly(-33.86, 151.2, -33.85, 151.2),
    ).toBe(false); // Sydney → Sydney + ~1 km north
    expect(
      coordsChangedSignificantly(-33.86, -151.2, -33.85, -151.2),
    ).toBe(false);
  });

  test('handles antipodal flip (rare but valid input)', () => {
    expect(coordsChangedSignificantly(59.33, 18.07, -59.33, -18.07)).toBe(true);
  });
});
