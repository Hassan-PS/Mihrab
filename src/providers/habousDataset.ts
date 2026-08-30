/**
 * Morocco — the Ministry of Habous's published tables, served from a
 * prepared dataset.
 *
 * The same arrangement as `islamiskaForbundetDataset.ts`: a scheduled job
 * scrapes the ministry once, server-side, and commits per-city JSON plus a
 * small `index.json` (see `tools/habous-dataset/`). Devices read that. Read
 * the Swedish module first; this explains only what differs.
 *
 * ── WHY A DATASET AND NOT A CALCULATION ───────────────────────────────
 *
 * The app CAN compute Moroccan times, and since the Morocco method gained
 * the ministry's own margins it lands within a minute of the published
 * table (see `localAdhan.ts`). But the ministry computes each city from its
 * own reference point, and those are not published — so a calculation from
 * the user's GPS is always close and never identical. Where an authority
 * publishes the times its country prays by, serving those beats
 * approximating them.
 *
 * ── THE SHORTER WINDOW ────────────────────────────────────────────────
 *
 * The ministry's page has no date parameter: it returns whatever Hijri
 * month it is showing. So the builder cannot walk a horizon, it accumulates
 * one month at a time, and the forward window is weeks rather than the
 * Swedish year. A miss here is therefore ordinary rather than alarming, and
 * it falls through to the computed chain — which for Morocco is a good
 * fallback rather than a cliff.
 *
 * ── KEYED BY ID, NOT NAME ─────────────────────────────────────────────
 *
 * The ministry's `ville` id addresses the page and names the file. Its
 * Arabic city names are NOT unique — تاهلة appears twice — so keying by
 * name would quietly lose a city.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpUserAgent } from '../config/httpIdentity';
import {
  HABOUS_DATASET_BASE_URL,
  HABOUS_DATASET_REFRESH_TTL_MS,
  HABOUS_INDEX_POLL_INTERVAL_MS,
} from '../config/datasets';
import { nearestMoroccoCity } from './moroccoNearest';
import { tupleToTimings } from './islamiskaForbundetParser';
import type { DatasetDayTuple } from './datasetTuple';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { ProviderError } from './errors';
import { recordServerIndex, type ServerStatus } from '../prayer/dataStatus';
import type { DataSource, PrayerTimesResult } from './types';

const PROVIDER = 'habous';
const DEFAULT_TZ = 'Africa/Casablanca';
const CACHE_PREFIX = 'habous.dataset.v1.city.';

/**
 * Defence-in-depth distance cap, as in the Swedish module and for the same
 * reason — more sharply needed here. No rectangle follows Morocco's eastern
 * border, so `isCoordinateInMorocco` takes in a strip of western Algeria.
 * A user there would otherwise be handed Oujda's table as their own. 200 km
 * is comfortably more than any real Moroccan location is from a listed city
 * — there are 191 of them — while still catching the overspill.
 */
const MAX_DATASET_CITY_KM = 200;

type CityDays = Record<string, DatasetDayTuple>;
type CityFile = {
  id: number;
  city: string;
  timezone?: string;
  builtAt: string;
  days: CityDays;
};
type SeedFile = {
  version: number;
  builtAt: string;
  timezone?: string;
  cities: Record<string, CityDays>;
};
type IndexFile = {
  builtAt?: string;
  timezone?: string;
  serverStatus?: ServerStatus;
  minCoverageDays?: number;
  deadCities?: number[];
};

/**
 * The bundled seed, if there is one yet.
 *
 * `require` rather than `import` on purpose: the file is written by the
 * dataset builder, so a checkout that has never run it does not have one.
 * A missing seed is a provider that always misses and falls through to the
 * computed chain, which is the correct behaviour — not a build failure.
 */
function loadSeed(): SeedFile {
  try {
    return require('./data/habousSeed.json') as SeedFile;
  } catch {
    return { version: 0, builtAt: '', cities: {} };
  }
}

const seed = loadSeed();

const memCity = new Map<number, CityFile | null>();
const refreshInFlight = new Set<number>();
let nextIndexPollAt = 0;
let indexPollInFlight: Promise<IndexFile | null> | null = null;

/** ±25% so devices do not all wake against the CDN at the same moment. */
function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

async function loadCachedCity(id: number): Promise<CityFile | null> {
  if (memCity.has(id)) return memCity.get(id) ?? null;
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${id}`);
    const parsed = raw ? (JSON.parse(raw) as CityFile) : null;
    memCity.set(id, parsed);
    return parsed;
  } catch {
    memCity.set(id, null);
    return null;
  }
}

async function pollServerIndex(): Promise<IndexFile | null> {
  const now = Date.now();
  if (now < nextIndexPollAt) return null;
  if (indexPollInFlight) return indexPollInFlight;
  indexPollInFlight = (async () => {
    try {
      const res = await fetchWithRetry(
        `${HABOUS_DATASET_BASE_URL}/index.json`,
        { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; dataset') } },
        { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 7000 },
      );
      if (!res.ok) return null;
      const index = (await res.json()) as IndexFile;
      const dueAt = Date.now() + jitter(HABOUS_INDEX_POLL_INTERVAL_MS);
      await recordServerIndex(
        {
          builtAt: index.builtAt ?? null,
          serverStatus: index.serverStatus,
          minCoverageDays: index.minCoverageDays ?? null,
          deadCities: Array.isArray(index.deadCities) ? index.deadCities.length : null,
        },
        new Date(dueAt),
      );
      return index;
    } catch {
      return null;
    } finally {
      nextIndexPollAt = Date.now() + jitter(HABOUS_INDEX_POLL_INTERVAL_MS);
      indexPollInFlight = null;
    }
  })();
  return indexPollInFlight;
}

async function downloadCity(id: number): Promise<void> {
  if (refreshInFlight.has(id)) return;
  refreshInFlight.add(id);
  try {
    const res = await fetchWithRetry(
      `${HABOUS_DATASET_BASE_URL}/cities/${id}.json`,
      { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; dataset') } },
      { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 9000 },
    );
    if (!res.ok) return;
    const file = (await res.json()) as CityFile;
    if (!file || typeof file.days !== 'object') return;
    await AsyncStorage.setItem(`${CACHE_PREFIX}${id}`, JSON.stringify(file));
    memCity.set(id, file);
  } catch {
    // Silent by design: this is a background refresh, and the answer the
    // caller is waiting on has already been served from cache or seed.
  } finally {
    refreshInFlight.delete(id);
  }
}

/**
 * Fire-and-forget freshness. Never awaited by a lookup — the times are
 * already in hand by the time this runs.
 */
async function maybeRefresh(id: number, cached: CityFile | null): Promise<void> {
  const index = await pollServerIndex();
  const serverBuilt = index?.builtAt;
  if (!cached) {
    await downloadCity(id);
    return;
  }
  if (serverBuilt && serverBuilt !== cached.builtAt) {
    await downloadCity(id);
    return;
  }
  // The index was unreachable: fall back to a plain age check so a device
  // that cannot see the index still refreshes eventually.
  const age = Date.now() - Date.parse(cached.builtAt);
  if (Number.isFinite(age) && age > HABOUS_DATASET_REFRESH_TTL_MS) {
    await downloadCity(id);
  }
}

/**
 * The ministry's published times for the nearest listed city.
 *
 * @throws ProviderError('shape') when the coordinate is out of coverage or
 * neither cache nor seed holds the date — the caller then falls through to
 * the computed chain.
 */
export async function getHabousDatasetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
}): Promise<PrayerTimesResult> {
  const nearest = nearestMoroccoCity(params.latitude, params.longitude);
  if (!nearest) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      'No Moroccan city has coordinates yet — run the habous-cities workflow.',
    );
  }
  if (nearest.distanceKm > MAX_DATASET_CITY_KM) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `Nearest listed city "${nearest.name}" is ${Math.round(nearest.distanceKm)} km ` +
        `away (> ${MAX_DATASET_CITY_KM} km) — outside the ministry's coverage.`,
    );
  }

  const dateKey = formatLocalDate(params.date);
  const cached = await loadCachedCity(nearest.id);
  void maybeRefresh(nearest.id, cached);

  const fromCache = cached?.days[dateKey];
  const tuple = fromCache ?? seed.cities?.[String(nearest.id)]?.[dateKey];
  if (!tuple) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `No published entry for "${nearest.name}" on ${dateKey} ` +
        `(cache ${cached ? 'present' : 'empty'}, seed ` +
        `${seed.cities?.[String(nearest.id)] ? 'has-city' : 'no-city'}). ` +
        'The ministry publishes one Hijri month at a time, so this is ordinary ' +
        'past the window rather than a fault.',
    );
  }

  const source: DataSource = fromCache ? 'cdn' : 'seed';
  return {
    timings: tupleToTimings(tuple),
    timezone: cached?.timezone ?? seed.timezone ?? DEFAULT_TZ,
    source,
  };
}

/** Test seam: clear the in-process memo (does not touch AsyncStorage). */
export function _resetHabousDatasetMemoForTests(): void {
  memCity.clear();
  refreshInFlight.clear();
  nextIndexPollAt = 0;
  indexPollInFlight = null;
}
