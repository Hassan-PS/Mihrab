/**
 * Islamiska Förbundet — prepared-dataset source (v2.7.x).
 *
 * Instead of scraping the flaky bönetider widget on every device, a scheduled
 * GitHub Actions job scrapes it once and publishes per-city JSON + a small
 * `index.json` (see `tools/ifis-dataset/`). This module serves those times:
 *
 *   1. cached host mirror  — the per-city file we last fetched from the CDN.
 *   2. bundled seed        — a compact snapshot shipped inside the app.
 *
 * Refresh timing: on lookup (throttled to ~6 h with jitter) the client reads
 * the tiny `index.json` to learn the server's latest build time. Because the
 * server commits atomically at the END of its run, a client that polls mid-run
 * just sees the previous build and skips — no collision. The per-city file is
 * re-downloaded only when the server's build timestamp advances, so devices
 * update within hours of a publish and never mid-write.
 *
 * A lookup that finds neither cache nor seed throws `ProviderError('shape')` so
 * the caller falls through to the live scrape → AlAdhan → local-adhan chain.
 * Runtime never blocks on the network: polling/refresh are fire-and-forget.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpUserAgent } from '../config/httpIdentity';
import {
  IFIS_DATASET_BASE_URL,
  IFIS_INDEX_POLL_INTERVAL_MS,
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
import { recordServerIndex, type ServerStatus } from '../prayer/dataStatus';
import type { DataSource, PrayerTimesResult } from './types';
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
  cities: Record<string, CityDays>; // keyed by slug
};

type HostCityFile = {
  city: string;
  slug: string;
  timezone: string;
  builtAt: string;
  days: CityDays;
};

type ServerIndex = {
  builtAt?: string;
  minCoverageDays?: number;
  deadCities?: string[];
  serverStatus?: ServerStatus;
};

type CachedCity = {
  fetchedAt: number;
  builtAt: string | null; // the server build the cached file came from
  timezone: string;
  days: CityDays;
};

// `as unknown as` because resolveJsonModule infers the day arrays as `string[]`,
// which doesn't structurally overlap the fixed 7-tuple in DatasetDayTuple.
const seed = seedJson as unknown as SeedFile;

const memCity = new Map<string, CachedCity>();
const refreshInFlight = new Map<string, Promise<void>>();

// In-memory throttle: earliest time we'll re-read index.json (jittered).
let nextIndexPollAt = 0;
let indexPollInFlight: Promise<ServerIndex | null> | null = null;

function cacheKey(slug: string): string {
  return `${CACHE_PREFIX}${slug}`;
}

function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5)); // ±25%
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
    /* corrupt cache — treat as absent */
  }
  return null;
}

/** Download the per-city file and cache it (with the server's build stamp). */
function downloadCity(slug: string): Promise<void> {
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
        builtAt: file.builtAt ?? null,
        timezone: file.timezone || DEFAULT_TZ,
        days: file.days,
      };
      memCity.set(slug, entry);
      await AsyncStorage.setItem(cacheKey(slug), JSON.stringify(entry));
    } catch {
      /* offline / CDN hiccup — keep prior data */
    } finally {
      refreshInFlight.delete(slug);
    }
  })();
  refreshInFlight.set(slug, p);
  return p;
}

/** Read index.json (throttled). Records server status for the stats panel. */
function pollServerIndex(): Promise<ServerIndex | null> {
  if (Date.now() < nextIndexPollAt) return Promise.resolve(null);
  if (indexPollInFlight) return indexPollInFlight;
  indexPollInFlight = (async () => {
    try {
      const res = await fetchWithRetry(
        `${IFIS_DATASET_BASE_URL}/index.json`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': httpUserAgent('Islamic prayer app; dataset'),
          },
        },
        { maxAttempts: 2, baseDelayMs: 500, timeoutMs: 6000 },
      );
      if (!res.ok) return null;
      const idx = (await res.json()) as ServerIndex;
      const interval = jitter(IFIS_INDEX_POLL_INTERVAL_MS);
      nextIndexPollAt = Date.now() + interval;
      // Derive status from coverage when the index predates the serverStatus
      // field (older builds), so the panel isn't stuck on "unknown".
      const status: ServerStatus =
        idx.serverStatus ??
        (typeof idx.minCoverageDays === 'number'
          ? idx.minCoverageDays >= 40
            ? 'ok'
            : 'warning'
          : 'unknown');
      await recordServerIndex(
        {
          builtAt: idx.builtAt ?? null,
          serverStatus: status,
          minCoverageDays: idx.minCoverageDays ?? null,
          deadCities: Array.isArray(idx.deadCities) ? idx.deadCities.length : null,
        },
        new Date(nextIndexPollAt),
      );
      return idx;
    } catch {
      // Even on failure, back off so we don't hammer a flaky CDN.
      nextIndexPollAt = Date.now() + jitter(IFIS_INDEX_POLL_INTERVAL_MS);
      return null;
    } finally {
      indexPollInFlight = null;
    }
  })();
  return indexPollInFlight;
}

/**
 * Fire-and-forget: poll the server index, and download the city file only when
 * the server has a newer build than our cache (or we have no cache yet).
 */
async function maybeRefresh(slug: string, cached: CachedCity | null): Promise<void> {
  const idx = await pollServerIndex();
  const serverBuilt = idx?.builtAt ?? null;
  const needsDownload =
    !cached ||
    (serverBuilt != null && serverBuilt !== cached.builtAt);
  if (needsDownload) await downloadCity(slug);
}

/**
 * Resolve prayer times for a coordinate+date from the prepared dataset.
 * Answers from whatever is on hand (cache → seed) without waiting; the server
 * poll + any download run in the background for subsequent lookups.
 *
 * @throws ProviderError('shape') when neither cache nor seed cover the date.
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
  // Background: keep the mirror fresh without blocking this answer.
  void maybeRefresh(slug, cached);

  const fromCache = cached?.days[dateKey];
  const tuple = fromCache ?? seed.cities[slug]?.[dateKey];
  if (!tuple) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `No prepared dataset entry for "${city}" on ${dateKey} ` +
        `(cache ${cached ? 'present' : 'empty'}, seed ` +
        `${seed.cities[slug] ? 'has-city' : 'no-city'}).`,
    );
  }

  const source: DataSource = fromCache ? 'cdn' : 'seed';
  return {
    timings: tupleToTimings(tuple),
    timezone: cached?.timezone ?? seed.timezone ?? DEFAULT_TZ,
    source,
  };
}

/**
 * Proactively refresh the server-index snapshot (throttled the same way as the
 * lookup path). Lets the statistics panel show the last server-run status +
 * next-check time even when prayer times are being served from a warm cache
 * (so no dataset fetch would otherwise fire).
 */
export async function pollServerIndexNow(): Promise<void> {
  await pollServerIndex();
}

/** Test seam: clear the in-process memo (does not touch AsyncStorage). */
export function _resetDatasetMemoForTests(): void {
  memCity.clear();
  refreshInFlight.clear();
  nextIndexPollAt = 0;
  indexPollInFlight = null;
}
