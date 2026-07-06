/**
 * Islamiska Förbundet — prepared-dataset source (v2.7.x).
 *
 * Instead of scraping the flaky bönetider widget on every device, a scheduled
 * GitHub Actions job scrapes it once and publishes per-city JSON (see
 * `tools/ifis-dataset/`). This module serves those times to the app:
 *
 *   1. cached host mirror  — the per-city file we last fetched from the CDN,
 *      stored in AsyncStorage (authoritative; refreshed opportunistically).
 *   2. bundled seed        — a compact snapshot shipped inside the app so a
 *      fresh install / offline first launch has near-term times immediately.
 *
 * A lookup that finds neither throws `ProviderError('shape')` so the caller
 * falls through to the live scrape → AlAdhan → local-adhan chain unchanged.
 * Runtime never blocks on the network: the CDN refresh is fire-and-forget and
 * only benefits subsequent lookups.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpUserAgent } from '../config/httpIdentity';
import {
  IFIS_DATASET_BASE_URL,
  IFIS_DATASET_REFRESH_TTL_MS,
} from '../config/datasets';
import { getNearestIslamiskaForbundetCity } from './islamiskaForbundetNearest';
import {
  citySlug,
  tupleToTimings,
  type DatasetDayTuple,
} from './islamiskaForbundetParser';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { ProviderError } from './errors';
import type { PrayerTimesResult } from './types';
import seedJson from './data/ifisSeed.json';

const PROVIDER = 'islamiska_forbundet';
const DEFAULT_TZ = 'Europe/Stockholm';
const CACHE_PREFIX = 'ifis.dataset.v1.city.';

/** `"YYYY-MM-DD" -> [Imsak,Fajr,Sunrise,Dhuhr,Asr,Maghrib,Isha]`. */
type CityDays = Record<string, DatasetDayTuple>;

type SeedFile = {
  version: number;
  builtAt: string | null;
  timezone: string;
  /** keyed by city slug */
  cities: Record<string, CityDays>;
};

type HostCityFile = {
  city: string;
  slug: string;
  timezone: string;
  builtAt: string;
  days: CityDays;
};

type CachedCity = { fetchedAt: number; timezone: string; days: CityDays };

const seed = seedJson as SeedFile;

// Process-lifetime memo of the parsed cache, keyed by slug.
const memCity = new Map<string, CachedCity>();
// De-dupe concurrent refreshes for the same city.
const refreshInFlight = new Map<string, Promise<void>>();

function cacheKey(slug: string): string {
  return `${CACHE_PREFIX}${slug}`;
}

async function loadCachedCity(slug: string): Promise<CachedCity | null> {
  const memo = memCity.get(slug);
  if (memo) return memo;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCity;
    if (parsed && parsed.days && typeof parsed.days === 'object') {
      memCity.set(slug, parsed);
      return parsed;
    }
  } catch {
    /* corrupt cache — treat as absent, it will be refetched */
  }
  return null;
}

/**
 * Fetch the latest per-city file from the CDN and cache it. Never throws into
 * the caller — failures just leave the previous cache/seed in place.
 */
function refreshCity(slug: string): Promise<void> {
  const existing = refreshInFlight.get(slug);
  if (existing) return existing;
  const p = (async () => {
    try {
      const res = await fetchWithRetry(
        `${IFIS_DATASET_BASE_URL}/cities/${slug}.json`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': httpUserAgent('Islamic prayer app; dataset'),
          },
        },
        { maxAttempts: 2, baseDelayMs: 500, timeoutMs: 6000 },
      );
      if (!res.ok) return;
      const file = (await res.json()) as HostCityFile;
      if (!file || !file.days || Object.keys(file.days).length === 0) return;
      const entry: CachedCity = {
        fetchedAt: Date.now(),
        timezone: file.timezone || DEFAULT_TZ,
        days: file.days,
      };
      memCity.set(slug, entry);
      await AsyncStorage.setItem(cacheKey(slug), JSON.stringify(entry));
    } catch {
      /* offline / CDN hiccup — non-fatal, keep prior data */
    } finally {
      refreshInFlight.delete(slug);
    }
  })();
  refreshInFlight.set(slug, p);
  return p;
}

/**
 * Resolve prayer times for a coordinate+date from the prepared dataset.
 * Kicks off a background CDN refresh when the cache is missing/stale, but
 * answers from whatever is already on hand (cache → seed) without waiting.
 *
 * @throws ProviderError('shape') when neither the cache nor the seed cover the
 *         requested day — the caller then falls through to the live scrape.
 */
export async function getIslamiskaForbundetDatasetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
}): Promise<PrayerTimesResult> {
  const city = getNearestIslamiskaForbundetCity(
    params.latitude,
    params.longitude,
  );
  const slug = citySlug(city);
  const dateKey = formatLocalDate(params.date);

  const cached = await loadCachedCity(slug);
  const stale = !cached || Date.now() - cached.fetchedAt > IFIS_DATASET_REFRESH_TTL_MS;
  if (stale) {
    // Fire-and-forget — helps the NEXT lookup, never blocks this one.
    void refreshCity(slug);
  }

  const tuple = cached?.days[dateKey] ?? seed.cities[slug]?.[dateKey];
  if (!tuple) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `No prepared dataset entry for "${city}" on ${dateKey} ` +
        `(cache ${cached ? 'present' : 'empty'}, seed ` +
        `${seed.cities[slug] ? 'has-city' : 'no-city'}).`,
    );
  }

  return {
    timings: tupleToTimings(tuple),
    timezone: cached?.timezone ?? seed.timezone ?? DEFAULT_TZ,
  };
}

/** Test seam: clear the in-process memo (does not touch AsyncStorage). */
export function _resetDatasetMemoForTests(): void {
  memCity.clear();
  refreshInFlight.clear();
}
