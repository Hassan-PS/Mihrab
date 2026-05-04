/**
 * Mosque finder via OpenStreetMap Overpass — task #28.
 *
 * Queries the public Overpass API for `amenity=place_of_worship` +
 * `religion=muslim` within a radius. No API key, no account, no analytics.
 * F-Droid-friendly: pure HTTPS to a community-run service.
 *
 * Goes through `fetchWithRetry` so the existing timeout (7s) and 5xx /
 * timeout retry policy (task #6) apply automatically.
 */

import { fetchWithRetry } from '../utils/fetchWithRetry';
import {
  ProviderError,
  isAbortOrTimeoutError,
  isNetworkError,
} from '../providers/errors';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const PROVIDER = 'overpass';

export type Mosque = {
  /** Overpass node/way id. */
  id: string;
  name?: string;
  /** name:ar tag if present (Arabic name in addition to default `name`). */
  nameArabic?: string;
  latitude: number;
  longitude: number;
  /** Distance from query origin, in meters. */
  distanceMeters: number;
};

export type FindMosquesParams = {
  latitude: number;
  longitude: number;
  /** Radius in meters. Default 5000 (5 km). Capped at 30 000 (30 km) by the
   *  caller layer to avoid abusing the public Overpass instance. */
  radiusMeters?: number;
};

type OverpassNode = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements: OverpassNode[];
};

/** Haversine distance in meters between two lat/lng points. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Build the Overpass QL query for mosques in a radius. */
export function buildOverpassQuery(
  lat: number,
  lng: number,
  radiusMeters: number,
): string {
  const r = Math.min(30_000, Math.max(100, Math.round(radiusMeters)));
  return `
[out:json][timeout:25];
(
  node["amenity"="place_of_worship"]["religion"="muslim"](around:${r},${lat},${lng});
  way["amenity"="place_of_worship"]["religion"="muslim"](around:${r},${lat},${lng});
  relation["amenity"="place_of_worship"]["religion"="muslim"](around:${r},${lat},${lng});
);
out center tags;
  `.trim();
}

/** Parse a raw Overpass response into our Mosque shape, sorted by distance. */
export function parseMosqueResponse(
  json: OverpassResponse,
  originLat: number,
  originLng: number,
): Mosque[] {
  if (!json || !Array.isArray(json.elements)) return [];
  const out: Mosque[] = [];
  for (const el of json.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const tags = el.tags ?? {};
    out.push({
      id: `${el.type}/${el.id}`,
      name: tags.name,
      nameArabic: tags['name:ar'],
      latitude: lat,
      longitude: lng,
      distanceMeters: Math.round(haversineMeters(originLat, originLng, lat, lng)),
    });
  }
  out.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return out;
}

/** Find mosques within `radiusMeters` of (lat, lng). Throws ProviderError
 *  on network / timeout / shape failures (task #6's typed errors). */
export async function findMosques(params: FindMosquesParams): Promise<Mosque[]> {
  const { latitude, longitude, radiusMeters = 5000 } = params;
  const body = `data=${encodeURIComponent(buildOverpassQuery(latitude, longitude, radiusMeters))}`;
  let res: Response;
  try {
    res = await fetchWithRetry(
      OVERPASS_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      { maxAttempts: 3, baseDelayMs: 1500, timeoutMs: 30_000 },
    );
  } catch (e) {
    if (isAbortOrTimeoutError(e)) {
      throw new ProviderError(PROVIDER, 'timeout', 'Overpass request timed out', { cause: e });
    }
    if (isNetworkError(e)) {
      throw new ProviderError(PROVIDER, 'network', 'Overpass network failure', { cause: e });
    }
    throw new ProviderError(PROVIDER, 'unknown', 'Overpass request failed', { cause: e });
  }
  if (res.status >= 500) {
    throw new ProviderError(PROVIDER, 'server', `Overpass server error (${res.status})`, {
      status: res.status,
    });
  }
  if (!res.ok) {
    throw new ProviderError(PROVIDER, 'shape', `Overpass returned ${res.status}`, {
      status: res.status,
    });
  }
  let json: OverpassResponse;
  try {
    json = (await res.json()) as OverpassResponse;
  } catch (e) {
    throw new ProviderError(PROVIDER, 'shape', 'Overpass response was not valid JSON', { cause: e });
  }
  return parseMosqueResponse(json, latitude, longitude);
}
