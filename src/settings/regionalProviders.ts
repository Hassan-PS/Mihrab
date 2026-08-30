/**
 * Which country-specific source covers which coordinates.
 *
 * This was an `if (isCoordinateInSweden(...))` inside
 * `getEffectiveDataProvider`, which was honest while Sweden was the only
 * regional source and became a liability the moment Morocco arrived: the
 * automatic branch and the manual-pin guard each hardcoded the same country
 * and would have needed editing in step for every new one.
 *
 * A table instead. Adding a country is now: a region predicate, an entry
 * here, a provider case, and its dataset — and nothing in the resolution
 * logic changes at all.
 *
 * ORDER MATTERS only if two regions overlap, which today they do not. If
 * that ever changes, the first match wins and the more specific region
 * should be listed first.
 */
import { isCoordinateInMorocco } from '../utils/moroccoRegion';
import { isCoordinateInSweden } from '../utils/swedenRegion';
import type { PrayerDataProviderId } from './types';

export type RegionalProviderRegion = {
  id: PrayerDataProviderId;
  /** Does this coordinate fall inside the country this source publishes for? */
  covers: (latitude: number, longitude: number) => boolean;
};

export const REGIONAL_PROVIDER_REGIONS: readonly RegionalProviderRegion[] = [
  { id: 'islamiska_forbundet', covers: isCoordinateInSweden },
  { id: 'habous', covers: isCoordinateInMorocco },
];

/** The regional source covering these coordinates, or null for nowhere special. */
export function regionalProviderForCoords(coords: {
  latitude: number;
  longitude: number;
} | null): PrayerDataProviderId | null {
  if (!coords) return null;
  for (const region of REGIONAL_PROVIDER_REGIONS) {
    if (region.covers(coords.latitude, coords.longitude)) return region.id;
  }
  return null;
}

/** Is this a country-specific source, i.e. one that only has data for its own region? */
export function isRegionalProvider(id: PrayerDataProviderId): boolean {
  return REGIONAL_PROVIDER_REGIONS.some(r => r.id === id);
}

/** Does this regional source cover these coordinates? True for non-regional ones. */
export function regionalProviderCovers(
  id: PrayerDataProviderId,
  coords: { latitude: number; longitude: number } | null,
): boolean {
  const region = REGIONAL_PROVIDER_REGIONS.find(r => r.id === id);
  if (!region) return true;
  if (!coords) return true; // unknown location: leave the user's pick alone
  return region.covers(coords.latitude, coords.longitude);
}
