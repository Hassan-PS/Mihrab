import { isCoordinateInSweden } from '../utils/swedenRegion';
import type { PrayerAppSettings, PrayerDataProviderId } from './types';

/** When automatic mode is on and coordinates are outside Sweden, use this source. */
export const AUTO_DEFAULT_OUTSIDE_SWEDEN: PrayerDataProviderId = 'aladhan';

/** Minimal hook state shape for resolving coordinates (avoids circular imports). */
export type ProviderCoordState = {
  phase: string;
  latitude?: number;
  longitude?: number;
};

export function resolveCoordsForProvider(
  settings: PrayerAppSettings,
  state: ProviderCoordState,
): { latitude: number; longitude: number } | null {
  if (settings.locationMode === 'manual') {
    return {
      latitude: settings.manualLatitude,
      longitude: settings.manualLongitude,
    };
  }
  if (state.phase === 'ready') {
    const lat = state.latitude;
    const lng = state.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { latitude: lat, longitude: lng };
    }
  }
  if (
    settings.lastFetchedLatitude != null &&
    settings.lastFetchedLongitude != null
  ) {
    return {
      latitude: settings.lastFetchedLatitude,
      longitude: settings.lastFetchedLongitude,
    };
  }
  return null;
}

/** Coords for Settings UI when Home may not be mounted (GPS: last fetch only). */
export function resolveCoordsFromSettings(
  settings: PrayerAppSettings,
): { latitude: number; longitude: number } | null {
  if (settings.locationMode === 'manual') {
    return {
      latitude: settings.manualLatitude,
      longitude: settings.manualLongitude,
    };
  }
  if (
    settings.lastFetchedLatitude != null &&
    settings.lastFetchedLongitude != null
  ) {
    return {
      latitude: settings.lastFetchedLatitude,
      longitude: settings.lastFetchedLongitude,
    };
  }
  return null;
}

export function getEffectiveDataProvider(
  dataProviderAuto: boolean,
  dataProvider: PrayerDataProviderId,
  coords: { latitude: number; longitude: number } | null,
): PrayerDataProviderId {
  if (dataProviderAuto) {
    // Automatic: Sweden → the Swedish city source, everywhere else → the
    // global default. Switches intuitively as the user's location changes.
    if (coords && isCoordinateInSweden(coords.latitude, coords.longitude)) {
      return 'islamiska_forbundet';
    }
    return AUTO_DEFAULT_OUTSIDE_SWEDEN;
  }

  // Manual provider — honour the user's pick, with ONE safety guard:
  // `islamiska_forbundet` only has data for Swedish cities, so it returns
  // nonsense for coordinates outside Sweden (it maps to the nearest Swedish
  // city). When the user has it pinned but has moved outside Sweden, fall
  // back to the global default for that location so prayer times stay
  // correct. We only redirect when we KNOW the coordinate is out of region;
  // with no coords yet we leave the pick untouched and re-resolve once the
  // location loads. The reverse (forcing the Swedish source while in Sweden)
  // is left to automatic mode — a deliberate non-Sweden pick is respected.
  if (
    dataProvider === 'islamiska_forbundet' &&
    coords &&
    !isCoordinateInSweden(coords.latitude, coords.longitude)
  ) {
    return AUTO_DEFAULT_OUTSIDE_SWEDEN;
  }
  return dataProvider;
}
