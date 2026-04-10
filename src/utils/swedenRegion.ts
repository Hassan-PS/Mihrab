/**
 * Rough WGS84 bounding box for Sweden (mainland + major islands).
 * Used to pick Sweden (city-list) prayer times in automatic mode when coordinates fall in Sweden.
 * (Edges may overlap neighbouring countries slightly; IF fetch still validates SE via geocoding.)
 */
const SE_MIN_LAT = 55.2;
const SE_MAX_LAT = 69.2;
const SE_MIN_LNG = 10.9;
const SE_MAX_LNG = 24.4;

/** Copenhagen area — inside rough SE bbox but not Sweden. */
function isLikelyCopenhagenArea(latitude: number, longitude: number): boolean {
  return (
    latitude >= 55.45 &&
    latitude <= 55.85 &&
    longitude >= 12.35 &&
    longitude <= 12.75
  );
}

/** Oslo area — west of Sweden’s land border in the south. */
function isLikelyOsloArea(latitude: number, longitude: number): boolean {
  return (
    latitude >= 59.75 &&
    latitude <= 60.15 &&
    longitude >= 10.35 &&
    longitude <= 10.95
  );
}

export function isCoordinateInSweden(
  latitude: number,
  longitude: number,
): boolean {
  if (
    latitude < SE_MIN_LAT ||
    latitude > SE_MAX_LAT ||
    longitude < SE_MIN_LNG ||
    longitude > SE_MAX_LNG
  ) {
    return false;
  }
  if (isLikelyCopenhagenArea(latitude, longitude)) {
    return false;
  }
  if (isLikelyOsloArea(latitude, longitude)) {
    return false;
  }
  return true;
}
