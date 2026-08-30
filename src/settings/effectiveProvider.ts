import {
  regionalProviderCovers,
  regionalProviderForCoords,
} from './regionalProviders';
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
    // Automatic: a country with its own published tables gets them, and
    // everywhere else gets the global default. Switches as the user moves.
    // The countries live in `regionalProviders.ts` — this branch does not
    // name any of them, which is the point of the table.
    return regionalProviderForCoords(coords) ?? AUTO_DEFAULT_OUTSIDE_SWEDEN;
  }

  // Manual provider — honour the user's pick, with ONE safety guard. A
  // regional source only holds data for its own country and maps anything
  // else to its nearest listed city, so a user who pinned it and then
  // travelled would get a neighbouring country's schedule presented as
  // their own. Redirect only when we KNOW the coordinate is out of region;
  // with no coords yet the pick stands and is re-resolved once location
  // loads. The reverse — forcing a regional source on someone inside its
  // country — is left to automatic mode, because a deliberate pick of
  // something else is a choice worth respecting.
  if (!regionalProviderCovers(dataProvider, coords)) {
    return AUTO_DEFAULT_OUTSIDE_SWEDEN;
  }
  return dataProvider;
}
