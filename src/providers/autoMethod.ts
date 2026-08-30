/**
 * Which calculation method "Automatic" means, when the app has to answer
 * for itself.
 *
 * "Automatic" was always AlAdhan's job: omit `method` and its server picks
 * one from the coordinates. That left the on-device path with nothing to go
 * on, so it hardcoded MWL (3) — fine as a global default, wrong wherever a
 * country has its own parameters. It only ever showed up offline, which is
 * to say rarely, which is to say nobody reported it.
 *
 * It matters more now: the on-device computation is the rung underneath
 * every provider, the one that cannot fail (`prayerStorage.ts`), so it is
 * what a Moroccan user gets on a plane or past a published window. Answering
 * "MWL" there would be a visible minutes-level error against the table they
 * pray by.
 *
 * The table stays deliberately small: an entry belongs here only where a
 * country's own method is in `CALCULATION_METHODS` and the region predicate
 * already exists for provider routing. Everywhere else MWL remains the
 * honest answer.
 */
import { isCoordinateInMorocco } from '../utils/moroccoRegion';

/** Muslim World League — the global default when nothing more specific applies. */
export const DEFAULT_AUTO_METHOD = 3;

type AutoMethodRegion = {
  method: number;
  covers: (latitude: number, longitude: number) => boolean;
};

const AUTO_METHOD_REGIONS: readonly AutoMethodRegion[] = [
  // 21 = Morocco (Fajr 19°, Isha 17°, plus the ministry's own margins).
  { method: 21, covers: isCoordinateInMorocco },
];

/**
 * The method to compute with when the user has chosen "Automatic".
 *
 * Mirrors what AlAdhan would have auto-selected for these coordinates, for
 * the countries the app knows about; MWL otherwise.
 */
export function autoMethodForCoords(
  latitude: number,
  longitude: number,
): number {
  for (const region of AUTO_METHOD_REGIONS) {
    if (region.covers(latitude, longitude)) return region.method;
  }
  return DEFAULT_AUTO_METHOD;
}
