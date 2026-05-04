import { APP_SOURCE_REPO_URL, httpUserAgent } from '../config/httpIdentity';
import { fetchWithRetry } from '../utils/fetchWithRetry';

export type GeocodedPlace = {
  latitude: number;
  longitude: number;
  displayName: string;
};

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
};

const USER_AGENT = httpUserAgent('OpenStreetMap Nominatim');

const MIN_QUERY = 2;

/**
 * Photon (komoot) is an alternative OSM-backed geocoder we fall through
 * to when Nominatim refuses, rate-limits, or times out. Same data corpus,
 * different infrastructure — so a Nominatim outage doesn't strand the
 * user. No User-Agent restriction; CC-licensed; no API key needed.
 */
type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    osm_value?: string;
    type?: string;
    postcode?: string;
  };
};

async function searchPhoton(
  q: string,
  acceptLanguage?: string,
): Promise<GeocodedPlace[]> {
  const lang = (acceptLanguage || '').slice(0, 2).toLowerCase();
  // Photon supports a subset of languages for localized names; falls back
  // to default otherwise. Pass only when in the supported set so we don't
  // silently confuse the API.
  const supportedLangs = new Set(['en', 'de', 'fr', 'it']);
  const langParam = supportedLangs.has(lang) ? `&lang=${lang}` : '';
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
    q,
  )}&limit=10${langParam}`;
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    },
    { maxAttempts: 2, baseDelayMs: 500, timeoutMs: 6000 },
  );
  if (!res.ok) {
    throw new Error(`Photon search failed (${res.status})`);
  }
  const json = (await res.json()) as { features?: PhotonFeature[] };
  if (!Array.isArray(json?.features)) {
    return [];
  }
  return json.features
    .map(f => {
      const c = f.geometry?.coordinates;
      if (!Array.isArray(c) || c.length < 2) return null;
      const longitude = c[0];
      const latitude = c[1];
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      const p = f.properties || {};
      const parts = [p.name, p.city, p.state, p.country].filter(
        (x): x is string => !!x && !!x.trim(),
      );
      const displayName = parts.length > 0 ? parts.join(', ') : 'Unnamed place';
      return { latitude, longitude, displayName };
    })
    .filter((x): x is GeocodedPlace => x !== null);
}

/**
 * Search Nominatim for places matching the user's typed query.
 *
 * #125: tightened the budget so an interactive type-ahead doesn't sit
 * for ~36 s before the user sees a result. Two attempts at 6 s each is
 * snappy enough for live search and still survives a single transient
 * 5xx without giving up. `acceptLanguage` is forwarded so the displayed
 * names match the user's i18n locale ("Köln" vs. "Cologne", etc.).
 *
 * #125 follow-up: Nominatim has been known to refuse RN traffic from
 * certain regions and to wedge-rate-limit on noisy networks. Falls
 * through to Photon (also OSM-backed) on any failure or zero-result
 * response, so the user sees something actionable instead of "no
 * results" silence.
 */
export async function searchPlaces(
  query: string,
  acceptLanguage?: string,
): Promise<GeocodedPlace[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) {
    return [];
  }
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    q,
  )}&format=json&limit=10&addressdetails=0`;
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    Referer: APP_SOURCE_REPO_URL,
  };
  if (acceptLanguage && acceptLanguage.trim()) {
    headers['Accept-Language'] = acceptLanguage.trim();
  }

  // Try Nominatim first.
  let nominatimResults: GeocodedPlace[] | null = null;
  let nominatimError: unknown;
  try {
    const res = await fetchWithRetry(
      url,
      { headers },
      { maxAttempts: 2, baseDelayMs: 600, timeoutMs: 6000 },
    );
    if (res.ok) {
      const data = (await res.json()) as NominatimHit[];
      if (Array.isArray(data)) {
        nominatimResults = data
          .map(row => {
            const latitude = parseFloat(row.lat);
            const longitude = parseFloat(row.lon);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              return null;
            }
            return {
              latitude,
              longitude,
              displayName: row.display_name,
            };
          })
          .filter((x): x is GeocodedPlace => x !== null);
      }
    } else {
      nominatimError = new Error(`Place search failed (${res.status})`);
    }
  } catch (e) {
    nominatimError = e;
  }

  // Got hits from the primary geocoder — done.
  if (nominatimResults && nominatimResults.length > 0) {
    return nominatimResults;
  }

  // Nominatim failed OR returned zero results — try Photon as a fallback.
  // Zero-results from Nominatim is a soft fallback signal: some regional
  // queries that Nominatim doesn't index do return rows from Photon.
  try {
    const photon = await searchPhoton(q, acceptLanguage);
    if (photon.length > 0) {
      return photon;
    }
  } catch (e) {
    if (__DEV__) {
      console.warn('Photon fallback failed:', e);
    }
    // If both failed, surface the original Nominatim error so the user
    // sees the more familiar message; otherwise propagate Photon's.
    if (nominatimError) {
      throw nominatimError;
    }
    throw e;
  }

  // Both geocoders responded but neither found matches → empty result.
  return nominatimResults ?? [];
}

export type ReverseLocality = {
  city: string;
  countryCode: string;
};

/** Reverse geocode coordinates to a locality (for Sweden IF bönetider, etc.). */
export async function reverseLocality(
  latitude: number,
  longitude: number,
): Promise<ReverseLocality> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(
    String(latitude),
  )}&lon=${encodeURIComponent(
    String(longitude),
  )}&format=json&addressdetails=1`;
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    },
    { maxAttempts: 4, baseDelayMs: 1200 },
  );
  if (!res.ok) {
    throw new Error(`Reverse geocode failed (${res.status})`);
  }
  const json = (await res.json()) as {
    address?: {
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      county?: string;
      state?: string;
      country_code?: string;
    };
  };
  const addr = json.address;
  if (!addr) {
    throw new Error('Reverse geocode returned no address.');
  }
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    addr.state ||
    '';
  if (!city.trim()) {
    throw new Error('Could not determine a city name for this location.');
  }
  const countryCode = (addr.country_code || '').toUpperCase();
  return { city: city.trim(), countryCode };
}
