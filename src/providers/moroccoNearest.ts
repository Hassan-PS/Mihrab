/**
 * Which of the ministry's cities is nearest, and how far away.
 *
 * Sweden's equivalent (`islamiskaForbundetNearest.ts`) keys by city NAME.
 * This keys by the ministry's own numeric `ville` id, because that is what
 * addresses a page and names a dataset file, and because the Arabic names
 * are not unique — تاهلة appears twice in the ministry's list, at 303 and
 * as 94. A name-keyed map would silently lose one of them.
 *
 * Pure and offline: a brute-force haversine over ~191 entries costs
 * nothing, and doing it without a network call is what lets provider
 * selection happen before anything has loaded.
 */
import cities from './data/moroccoCities.json';

export type MoroccoCityEntry = {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
};

/** Only cities that have coordinates can be matched against a location. */
const LOCATABLE: MoroccoCityEntry[] = (cities as MoroccoCityEntry[]).filter(
  c => typeof c.lat === 'number' && typeof c.lng === 'number',
);

export const MOROCCO_CITY_COUNT = (cities as MoroccoCityEntry[]).length;
export const MOROCCO_LOCATABLE_COUNT = LOCATABLE.length;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestMoroccoCity(
  latitude: number,
  longitude: number,
): { id: number; name: string; distanceKm: number } | null {
  let best: MoroccoCityEntry | null = null;
  let bestKm = Infinity;
  for (const city of LOCATABLE) {
    const km = haversineKm(latitude, longitude, city.lat as number, city.lng as number);
    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  }
  if (!best) return null;
  return { id: best.id, name: best.name, distanceKm: bestKm };
}
