import { httpUserAgent } from '../config/httpIdentity';
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

export async function searchPlaces(query: string): Promise<GeocodedPlace[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) {
    return [];
  }
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    q,
  )}&format=json&limit=10`;
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
    throw new Error(`Place search failed (${res.status})`);
  }
  const data = (await res.json()) as NominatimHit[];
  if (!Array.isArray(data)) {
    return [];
  }
  return data
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
