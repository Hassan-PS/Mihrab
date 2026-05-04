/**
 * Pure coordinate utilities — extracted from `usePrayerDay` (task #17) so
 * they can be unit-tested without pulling in the React-Native NetInfo /
 * Geolocation native modules that the hook also depends on.
 */

/**
 * Returns true when the two positions differ by more than `thresholdDeg`
 * degrees in either axis (~1 km at the equator with the default 0.01°).
 *
 * Used by `usePrayerDay` to gate re-fetches: a fresh GPS reading that's
 * within ~1 km of the previous one doesn't warrant a network round-trip.
 *
 * Boundary: strictly greater-than. A diff of exactly `thresholdDeg` does
 * NOT trigger a refresh.
 *
 * Approximation per axis at common latitudes (with default 0.01°):
 *   • Equator: ~1.1 km
 *   • Stockholm (~59°N): ~700 m
 *   • Northern Norway (~70°N): ~400 m
 *
 * Longitude shrinks with cos(latitude); latitude is constant. Either axis
 * exceeding the threshold counts.
 */
export function coordsChangedSignificantly(
  newLat: number,
  newLng: number,
  oldLat: number | null | undefined,
  oldLng: number | null | undefined,
  thresholdDeg = 0.01,
): boolean {
  if (oldLat == null || oldLng == null) return true;
  return (
    Math.abs(newLat - oldLat) > thresholdDeg ||
    Math.abs(newLng - oldLng) > thresholdDeg
  );
}
