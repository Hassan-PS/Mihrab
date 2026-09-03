/**
 * A name for a place, without a network.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * The app learns what a place is CALLED by reverse-geocoding it. When that
 * fails — offline, the geocoder rate-limiting us, a desktop where nothing
 * ever asked — the city registry writes `"59.33°, 18.07°"` into the entry's
 * `displayName` and moves on. That string is then a name as far as
 * everything downstream is concerned: it is saved as `autoLocationLabel`,
 * it is what the location chip shows, and it is what the shared month
 * sheet prints where a city belongs. Reported as "the monthly view still
 * shows the longitude and latitude instead of the nearest city" — and the
 * sheet's own fallback to coordinates was never even reached, because a
 * coordinate had already been handed to it as a name. (`shortPlaceLabel`
 * has known the shape of that string all along: it has a rule to pass it
 * through whole rather than splitting it at the comma. It just had nothing
 * better to suggest.)
 *
 * But the app is not actually ignorant of where it is. It ships two lists
 * of cities WITH coordinates, because the prepared datasets need them to
 * decide whose times to serve: a hundred-odd Swedish cities and a hundred
 * and sixty-four Moroccan ones. Naming the nearest of those costs a couple
 * of hundred haversines and no network at all.
 *
 * ── THE RADIUS IS THE WHOLE ARGUMENT ───────────────────────────────────
 *
 * The dataset providers accept a nearest city up to 200–250 km away,
 * because a timetable computed for a city 200 km north is still roughly
 * right and much better than nothing. A NAME is not like that: calling
 * somewhere "Stockholm" when it is two hundred kilometres from Stockholm
 * is not approximate, it is false, and it would be printed on a sheet
 * people pass around.
 *
 * 75 km is the compromise. Both lists are dense enough that a real
 * inhabited place is nearly always inside it — Sweden's includes towns,
 * not just cities — and it is small enough that the answer is somewhere a
 * person would actually say they live near. Beyond it there is no answer,
 * and the caller says so however it says so.
 */
import { getNearestIslamiskaForbundetCityWithDistance } from '../providers/islamiskaForbundetNearest';
import { nearestMoroccoCity } from '../providers/moroccoNearest';

/** How far a listed city may be and still be what this place is called. */
export const NAMEABLE_CITY_KM = 75;

/**
 * The name of the nearest city the app ships coordinates for, or null when
 * the nearest one is too far away to be an honest answer.
 */
export function nearestKnownCityName(
  latitude: number,
  longitude: number,
): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  let name: string | null = null;
  let km = Infinity;

  const se = getNearestIslamiskaForbundetCityWithDistance(latitude, longitude);
  if (se.distanceKm < km) {
    km = se.distanceKm;
    name = se.city;
  }
  const ma = nearestMoroccoCity(latitude, longitude);
  if (ma && ma.distanceKm < km) {
    km = ma.distanceKm;
    name = ma.name;
  }

  return km <= NAMEABLE_CITY_KM ? name : null;
}
