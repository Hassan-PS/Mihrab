/**
 * Rough WGS84 bounding box for Morocco, including Western Sahara.
 *
 * The same shape as `swedenRegion.ts` and for the same reason: automatic
 * provider selection has to answer "is this coordinate in the country this
 * dataset covers?" instantly and offline, before any network call. A
 * reverse-geocoded country code would be exact but needs the network and
 * arrives too late to choose a provider with.
 *
 * The box necessarily takes in a strip of western Algeria and northern
 * Mauritania — Morocco's eastern border runs from about -1° in the north to
 * -8° in the south, and no rectangle follows that. Two guards make it
 * tolerable: the Canary Islands are carved out explicitly, being Spanish and
 * squarely inside the box, and the dataset provider refuses a nearest city
 * further than a few hundred kilometres away, so a coordinate deep in
 * Algeria falls through to the global source rather than silently being
 * served Oujda's table.
 *
 * Ceuta and Melilla are deliberately NOT carved out: the ministry publishes
 * سبتة and مليلية in its own city list, so the dataset covers them.
 */
const MA_MIN_LAT = 20.7;
const MA_MAX_LAT = 36.05;
const MA_MIN_LNG = -17.1;
const MA_MAX_LNG = -0.95;

/** The Canaries: Spanish, and inside any box drawn around Morocco. */
function isCanaryIslands(latitude: number, longitude: number): boolean {
  return (
    latitude >= 27.4 &&
    latitude <= 29.5 &&
    longitude >= -18.3 &&
    longitude <= -13.3
  );
}

export function isCoordinateInMorocco(
  latitude: number,
  longitude: number,
): boolean {
  if (
    latitude < MA_MIN_LAT ||
    latitude > MA_MAX_LAT ||
    longitude < MA_MIN_LNG ||
    longitude > MA_MAX_LNG
  ) {
    return false;
  }
  return !isCanaryIslands(latitude, longitude);
}
