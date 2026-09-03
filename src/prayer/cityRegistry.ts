import AsyncStorage from '@react-native-async-storage/async-storage';
import { distanceKm } from '../utils/coords';
import type { ReverseLocality } from '../geocoding/nominatim';
import { isCoordinateLabel } from '../widget/shortPlaceLabel';
import { nearestKnownCityName } from './nearestKnownCity';

/**
 * City registry — task: "be resourceful about location changes".
 *
 * The goal, in the user's words:
 *   • moving WITHIN a city must not re-download the same prayer times;
 *   • when the city CHANGES, fetch the new city but keep the previous city
 *     cached for a week in case the user returns;
 *   • don't hoard data while travelling through many cities — only keep a
 *     city long-term once it's been the active location for more than a day.
 *
 * How it works. Each known city gets a STABLE anchor coordinate (the first
 * fix we saw there). All prayer-time fetches for that city use the anchor,
 * not the live GPS point — so `prayerStorage`'s coordinate-keyed cache stays
 * on one slot no matter where in the city you walk. Identity is the
 * reverse-geocoded city name when we have network; offline we fall back to
 * the nearest known anchor (within {@link OFFLINE_SAME_CITY_KM}) or a coarse
 * coordinate bucket, so the flow degrades gracefully without ever stranding
 * the user.
 *
 * Retention. A city is "promoted" once it's been active across more than a
 * day ({@link PROMOTE_AFTER_MS}); promoted cities are kept for a week after
 * you leave ({@link PROMOTED_RETENTION_MS}); un-promoted pass-through cities
 * are dropped a day after you leave ({@link TRANSIENT_RETENTION_MS}). The
 * active city is never evicted.
 *
 * This module owns only the small registry metadata; evicting a dropped
 * city's actual prayer-times cache is done by the caller via
 * `prayerStorage.purgeCachesNear(anchor)`.
 */

export type CityEntry = {
  /** Stable identity — `CC:cityname` when geocoded, else `geo:latB,lngB`. */
  cityId: string;
  /** Human-friendly label for the chip (e.g. "Stockholm"). */
  displayName: string;
  /** Stable representative coordinate — the FIRST fix seen in this city.
   *  Drives the prayer-cache key so intra-city movement never re-fetches. */
  anchorLat: number;
  anchorLng: number;
  firstSeenAt: string; // ISO
  lastActiveAt: string; // ISO
  /** True once active across a >24h span → eligible for week-long retention. */
  promoted: boolean;
};

export type CityRegistry = {
  activeCityId: string | null;
  cities: Record<string, CityEntry>;
};

export const STORAGE_KEY = 'mihrab.cityRegistry.v1';

/** Coarse grid used for the offline / no-geocode fallback id (~11 km). */
const BUCKET_DEG = 0.1;
/** Offline: a fix this close to a known anchor is treated as that city. */
export const OFFLINE_SAME_CITY_KM = 15;
/** Active across a longer span than this → "lived here", keep for a week. */
export const PROMOTE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Promoted (stayed >1 day) cities live this long after you leave. */
export const PROMOTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Pass-through (<1 day) cities are dropped this long after you leave. */
export const TRANSIENT_RETENTION_MS = 24 * 60 * 60 * 1000;

export const emptyRegistry = (): CityRegistry => ({
  activeCityId: null,
  cities: {},
});

// ── Pure helpers (unit-tested without AsyncStorage) ──────────────────────

export function coarseBucketId(lat: number, lng: number): string {
  const b = (n: number) => Math.round(n / BUCKET_DEG);
  return `geo:${b(lat)},${b(lng)}`;
}

/** Normalise a locality into a stable id + a friendly display name. */
export function cityIdFromLocality(loc: ReverseLocality): {
  cityId: string;
  displayName: string;
} {
  const name = loc.city.trim();
  const cc = (loc.countryCode || '').toUpperCase();
  const norm = name.toLowerCase().replace(/\s+/g, ' ');
  return {
    cityId: `${cc || '??'}:${norm}`,
    displayName: name,
  };
}

/** Nearest existing city within `maxKm`, or null. Used only offline. */
export function nearestCityWithin(
  cities: Record<string, CityEntry>,
  lat: number,
  lng: number,
  maxKm: number = OFFLINE_SAME_CITY_KM,
): CityEntry | null {
  let best: CityEntry | null = null;
  let bestKm = Infinity;
  for (const c of Object.values(cities)) {
    const km = distanceKm(lat, lng, c.anchorLat, c.anchorLng);
    if (km < bestKm && km <= maxKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}

export type ResolveResult = {
  registry: CityRegistry;
  entry: CityEntry;
  /** The city we just became active in differs from the previously active one. */
  changedCity: boolean;
  /** This city had no registry entry before now. */
  isNew: boolean;
};

/**
 * Fold a fresh position fix into the registry: identify the city, create or
 * touch its entry, mark it active. Pure — returns a new registry, does no I/O.
 */
export function resolveActiveCity(
  registry: CityRegistry,
  lat: number,
  lng: number,
  locality: ReverseLocality | null,
  now: Date = new Date(),
): ResolveResult {
  const iso = now.toISOString();
  const cities = { ...registry.cities };

  let cityId: string;
  let displayName: string;
  if (locality) {
    ({ cityId, displayName } = cityIdFromLocality(locality));
  } else {
    // Offline: reuse the nearest city we have already been to if we're
    // close to one, else a coarse bucket so we still get stable "same
    // place" behaviour.
    const near = nearestCityWithin(cities, lat, lng);
    if (near) {
      cityId = near.cityId;
      displayName = near.displayName;
    } else {
      cityId = coarseBucketId(lat, lng);
      // The IDENTITY is a bucket, but the NAME need not be a coordinate.
      // This used to write "59.33°, 18.07°" straight into the display
      // name, and from there it was saved as `autoLocationLabel` and read
      // as a city by the location chip, the widget and the month sheet —
      // which is how a shared timetable ended up published with a decimal
      // degree where a place belongs. The app ships coordinates for a
      // couple of hundred cities so its datasets can pick one; the nearest
      // of those is a real answer, and free.
      displayName =
        nearestKnownCityName(lat, lng) ??
        `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
    }
  }

  const prevActive = registry.activeCityId;
  const existing = cities[cityId];
  const isNew = !existing;

  let entry: CityEntry;
  if (existing) {
    const promoted =
      existing.promoted ||
      now.getTime() - Date.parse(existing.firstSeenAt) >= PROMOTE_AFTER_MS;
    // The stored name stands, unless this fix carries a better one. A
    // fresh geocode always does. So does a nearest-city name over the
    // coordinates an earlier version wrote here — an install that has been
    // carrying "59.33°, 18.07°" as its city since the geocoder last failed
    // heals on the next fix instead of waiting for the geocoder to come
    // back.
    const improved =
      (locality != null && !!displayName) ||
      (isCoordinateLabel(existing.displayName) &&
        !isCoordinateLabel(displayName));
    entry = {
      ...existing,
      // Keep the stable anchor; only improve a placeholder display name.
      displayName: improved ? displayName : existing.displayName,
      lastActiveAt: iso,
      promoted,
    };
  } else {
    entry = {
      cityId,
      displayName,
      anchorLat: lat,
      anchorLng: lng,
      firstSeenAt: iso,
      lastActiveAt: iso,
      promoted: false,
    };
  }
  cities[cityId] = entry;

  return {
    registry: { activeCityId: cityId, cities },
    entry,
    changedCity: prevActive !== cityId,
    isNew,
  };
}

/**
 * Drop cities whose retention window has passed. The active city is always
 * kept. Returns the trimmed registry plus the anchors of evicted cities so
 * the caller can purge their prayer-times cache slots.
 */
export function sweepRetention(
  registry: CityRegistry,
  now: Date = new Date(),
): { registry: CityRegistry; evicted: CityEntry[] } {
  const kept: Record<string, CityEntry> = {};
  const evicted: CityEntry[] = [];
  for (const c of Object.values(registry.cities)) {
    if (c.cityId === registry.activeCityId) {
      kept[c.cityId] = c;
      continue;
    }
    const idleMs = now.getTime() - Date.parse(c.lastActiveAt);
    const cutoff = c.promoted ? PROMOTED_RETENTION_MS : TRANSIENT_RETENTION_MS;
    if (idleMs > cutoff) {
      evicted.push(c);
    } else {
      kept[c.cityId] = c;
    }
  }
  return { registry: { ...registry, cities: kept }, evicted };
}

// ── Persistence ──────────────────────────────────────────────────────────

export async function loadCityRegistry(): Promise<CityRegistry> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CityRegistry;
      if (parsed && typeof parsed === 'object' && parsed.cities) {
        return { activeCityId: parsed.activeCityId ?? null, cities: parsed.cities };
      }
    }
  } catch {
    /* start fresh */
  }
  return emptyRegistry();
}

export async function saveCityRegistry(reg: CityRegistry): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reg));
  } catch (e) {
    console.warn('cityRegistry: save failed', e);
  }
}

export type FixSummary = {
  /** Stable anchor coords to fetch prayer times against. */
  anchorLat: number;
  anchorLng: number;
  displayName: string;
  cityId: string;
  changedCity: boolean;
  isNew: boolean;
  /** Anchors of cities evicted this pass — purge their cache slots. */
  evictedAnchors: { latitude: number; longitude: number }[];
};

/**
 * Full round-trip: load → resolve the active city for this fix → sweep
 * retention → persist. Returns the anchor to fetch against + eviction list.
 * Locality is resolved by the caller (network) and passed in; null when
 * offline / geocode failed.
 */
export async function recordLocationFix(
  lat: number,
  lng: number,
  locality: ReverseLocality | null,
  now: Date = new Date(),
): Promise<FixSummary> {
  const current = await loadCityRegistry();
  const resolved = resolveActiveCity(current, lat, lng, locality, now);
  const swept = sweepRetention(resolved.registry, now);
  await saveCityRegistry(swept.registry);
  return {
    anchorLat: resolved.entry.anchorLat,
    anchorLng: resolved.entry.anchorLng,
    displayName: resolved.entry.displayName,
    cityId: resolved.entry.cityId,
    changedCity: resolved.changedCity,
    isNew: resolved.isNew,
    evictedAnchors: swept.evicted.map(c => ({
      latitude: c.anchorLat,
      longitude: c.anchorLng,
    })),
  };
}
