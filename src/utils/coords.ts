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

/**
 * Great-circle distance between two lat/lng points, in kilometres
 * (haversine). Used by the city registry to decide, when reverse-geocoding
 * is unavailable (offline), whether a fresh fix is close enough to an
 * already-known city to be treated as the same place.
 */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius, km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
