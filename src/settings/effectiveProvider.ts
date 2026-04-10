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
  if (!dataProviderAuto) {
    return dataProvider;
  }
  if (coords && isCoordinateInSweden(coords.latitude, coords.longitude)) {
    return 'islamiska_forbundet';
  }
  return AUTO_DEFAULT_OUTSIDE_SWEDEN;
}
