import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPrayerTimesUnified } from '../providers/fetchPrayerTimes';
import type { PrayerDataProviderId } from '../settings/types';
import type { TimingsMap } from '../types/prayer';
import { formatLocalDate } from '../utils/date';

export type StoredPrayerData = {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
  calculationMethod: number | 'auto';
  school: number;
  months: Record<string, Record<string, TimingsMap>>; // YYYY-MM -> YYYY-MM-DD -> TimingsMap
};

/**
 * Multi-location cache — task #145.
 *
 * Until v1.7.0-beta.32 the prayer-times cache held a SINGLE
 * `StoredPrayerData` object keyed by params. As soon as the user switched to
 * a different location preset, `isSameParams` returned false and the next
 * cache write replaced everything. The user'\''s symptom: "switching deletes
 * stored prayer times".
 *
 * v2 keeps every (provider, lat, lng, method, school) combination alive in
 * its own slot of `caches`. Switching presets just changes which slot we
 * read/write — the other slots stay intact, so going back to a previous
 * preset is instant and doesn'\''t re-fetch anything that was already
 * pre-warmed.
 *
 * Migration: a one-time read of the legacy single-cache key
 * `prayer_times_cache` converts that data into the new `prayer_times_cache.v2`
 * shape so existing users keep their pre-cached months. The legacy key is
 * deleted after migration.
 */
type CacheEntry = StoredPrayerData & {
  /** ISO timestamp of the last `getCachedPrayerTimes`/`getOrFetch…` hit on
   *  this entry. Used as the LRU key when storage hits quota. */
  lastAccessedAt: string;
};

type V2Shape = {
  /**
   * Keyed by `cacheKey(params)` — see below. Round-tripped through JSON via
   * AsyncStorage; not encrypted (prayer times are derivable from coordinates,
   * which is the privacy-sensitive bit and lives in the encrypted store).
   */
  caches: Record<string, CacheEntry>;
};

const STORAGE_KEY_V2 = 'prayer_times_cache.v2';
const STORAGE_KEY_LEGACY = 'prayer_times_cache';

/** Maximum time to hold the write mutex before forcing release. */
const MUTEX_TIMEOUT_MS = 10_000;

// Serialises all cache writes so that concurrent fetches (e.g. month scroll)
// don't clobber each other.  Each write waits for the previous one to finish
// before reading-and-updating the cache. Wrapped in a 10s timeout so a hung
// inner operation can never block all subsequent writes (task #5).
let _writeMutex: Promise<void> = Promise.resolve();

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDayKey(date: Date): string {
  return formatLocalDate(date);
}

/**
 * Stable cache key for a (provider, lat, lng, method, school) tuple.
 *
 * Lat/lng are rounded to 2 decimals (~1.1 km at the equator) so a slightly
 * jittery GPS reading on the same physical location reuses the same slot
 * instead of creating a new one each fetch.
 */
function cacheKey(p: Omit<StoredPrayerData, 'months'>): string {
  return [
    p.provider,
    p.latitude.toFixed(2),
    p.longitude.toFixed(2),
    String(p.calculationMethod),
    String(p.school),
  ].join('|');
}

/** Race a promise against a timeout that throws if the promise hangs. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`prayerStorage: ${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer!) clearTimeout(timer);
  }) as Promise<T>;
}

/** Result of a cache write — exposed so callers can react to quota errors. */
export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'quota'; error: unknown }
  | { ok: false; reason: 'unknown'; error: unknown };

/**
 * Detect whether an error indicates "storage full" / "quota exceeded".
 * AsyncStorage surfaces this as different exception types per platform:
 *   • iOS:     NSError with "Code=4" (NSFileWriteOutOfSpaceError) or
 *              messages containing "disk full" / "no space".
 *   • Android: SQLiteFullException or "database or disk is full".
 *   • Web/PWA: DOMException named QuotaExceededError.
 *
 * Conservative: any of these patterns count as quota.
 */
export function isQuotaError(e: unknown): boolean {
  if (!e) return false;
  const name = (e as { name?: string }).name ?? '';
  const message = (e as { message?: string }).message ?? '';
  const haystack = `${name} ${message}`.toLowerCase();
  return (
    haystack.includes('quotaexceeded') ||
    haystack.includes('quota_exceeded') ||
    haystack.includes('quota exceeded') ||
    haystack.includes('disk full') ||
    haystack.includes('no space') ||
    haystack.includes('database or disk is full') ||
    haystack.includes('sqlitefullexception')
  );
}

function pickOldestMonthKey(data: StoredPrayerData): string | null {
  const keys = Object.keys(data.months);
  if (keys.length === 0) return null;
  return keys.reduce((a, b) => (a < b ? a : b));
}

function evictOldestMonth(entry: CacheEntry): CacheEntry | null {
  const oldest = pickOldestMonthKey(entry);
  if (!oldest) return null;
  const months = { ...entry.months };
  delete months[oldest];
  return { ...entry, months };
}

/**
 * Pick the cache entry to evict first under quota pressure: the one with the
 * oldest `lastAccessedAt`. Falls back to any non-current key if timestamps
 * are missing (e.g., freshly migrated entries).
 */
function pickStalestCacheKey(v2: V2Shape, exclude: string): string | null {
  const keys = Object.keys(v2.caches).filter(k => k !== exclude);
  if (keys.length === 0) return null;
  return keys.reduce((a, b) => {
    const ta = Date.parse(v2.caches[a].lastAccessedAt) || 0;
    const tb = Date.parse(v2.caches[b].lastAccessedAt) || 0;
    return ta <= tb ? a : b;
  });
}

async function loadV2(): Promise<V2Shape> {
  // Try the v2 shape first.
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as V2Shape;
      if (parsed && typeof parsed === 'object' && parsed.caches) {
        return parsed;
      }
    }
  } catch {
    // fall through to legacy migration
  }

  // Migration: read the pre-v2 single-cache shape and convert.
  try {
    const legacyRaw = await AsyncStorage.getItem(STORAGE_KEY_LEGACY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as StoredPrayerData;
      if (legacy && typeof legacy === 'object' && legacy.months) {
        const k = cacheKey(legacy);
        const v2: V2Shape = {
          caches: {
            [k]: { ...legacy, lastAccessedAt: new Date().toISOString() },
          },
        };
        // Best-effort: write the new shape and drop the legacy key.
        try {
          await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(v2));
          await AsyncStorage.removeItem(STORAGE_KEY_LEGACY);
        } catch {
          // ignore — next call will retry
        }
        return v2;
      }
    }
  } catch {
    // ignore — start fresh
  }

  return { caches: {} };
}

async function saveV2Once(v2: V2Shape): Promise<SaveResult> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_V2, JSON.stringify(v2));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unknown', error: e };
  }
}

async function saveV2(v2: V2Shape, activeKey: string): Promise<SaveResult> {
  let attempt = await saveV2Once(v2);
  if (attempt.ok) return attempt;

  // Quota pressure — evict oldest month from the active cache first.
  if (attempt.reason === 'quota') {
    const active = v2.caches[activeKey];
    if (active) {
      const slim = evictOldestMonth(active);
      if (slim) {
        const next: V2Shape = {
          ...v2,
          caches: { ...v2.caches, [activeKey]: slim },
        };
        attempt = await saveV2Once(next);
        if (attempt.ok) {
          console.warn(
            'prayerStorage: quota exceeded, evicted oldest month from active cache',
          );
          return attempt;
        }
      }
    }

    // Still over quota — evict the entire stalest non-active cache and retry.
    const stale = pickStalestCacheKey(v2, activeKey);
    if (stale) {
      const trimmed: V2Shape = { caches: { ...v2.caches } };
      delete trimmed.caches[stale];
      attempt = await saveV2Once(trimmed);
      if (attempt.ok) {
        console.warn(
          `prayerStorage: quota exceeded, evicted stale cache "${stale}"`,
        );
        return attempt;
      }
    }
  }

  console.error('prayerStorage: cache write failed', attempt);
  return attempt;
}

/**
 * Backward-compat helper kept for the legacy test harness — task #145.
 * Writes the given single-cache shape into the v2 multi-cache under that
 * params'\'' computed cacheKey. Production code paths use
 * `getOrFetchPrayerTimes` / `refreshPrayerDataCache` instead and never call
 * this directly.
 */
export async function saveStoredPrayerData(
  data: StoredPrayerData,
): Promise<SaveResult> {
  const v2 = await loadV2();
  const k = cacheKey(data);
  const next: V2Shape = {
    caches: {
      ...v2.caches,
      [k]: { ...data, lastAccessedAt: new Date().toISOString() },
    },
  };
  return saveV2(next, k);
}

/** Backward-compat helper for callers that want "the single active cache".
 *  Returns the most-recently-accessed entry, or null if the cache is empty. */
export async function getStoredPrayerData(): Promise<StoredPrayerData | null> {
  const v2 = await loadV2();
  const keys = Object.keys(v2.caches);
  if (keys.length === 0) return null;
  const newest = keys.reduce((a, b) => {
    const ta = Date.parse(v2.caches[a].lastAccessedAt) || 0;
    const tb = Date.parse(v2.caches[b].lastAccessedAt) || 0;
    return ta >= tb ? a : b;
  });
  // Strip lastAccessedAt to keep the public StoredPrayerData shape stable.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { lastAccessedAt: _ts, ...rest } = v2.caches[newest];
  return rest;
}

export async function clearStoredPrayerData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_V2);
    // Legacy too, in case migration hadn'\''t run yet.
    await AsyncStorage.removeItem(STORAGE_KEY_LEGACY);
  } catch (e) {
    console.error('Failed to clear prayer data cache', e);
  }
}

export async function getCachedPrayerTimes(
  params: Omit<StoredPrayerData, 'months'> & { date: Date },
): Promise<TimingsMap | null> {
  const v2 = await loadV2();
  const k = cacheKey(params);
  const entry = v2.caches[k];
  if (!entry) return null;

  const monthKey = getMonthKey(params.date);
  const dayKey = getDayKey(params.date);

  if (entry.months[monthKey] && entry.months[monthKey][dayKey]) {
    return entry.months[monthKey][dayKey];
  }
  return null;
}

export async function getOrFetchPrayerTimes(
  params: Omit<StoredPrayerData, 'months'> & { date: Date },
): Promise<TimingsMap> {
  const cached = await getCachedPrayerTimes(params);
  if (cached) return cached;

  const res = await fetchPrayerTimesUnified({
    provider: params.provider,
    latitude: params.latitude,
    longitude: params.longitude,
    date: params.date,
    calculationMethod: params.calculationMethod,
    school: params.school,
  });

  // Save under the cacheKey, preserving every other location'\''s entry.
  // The mutex guards against concurrent month-scroll writes; the timeout
  // releases it if AsyncStorage hangs.
  _writeMutex = _writeMutex.then(async () => {
    try {
      await withTimeout(
        (async () => {
          const v2 = await loadV2();
          const k = cacheKey(params);
          const existing = v2.caches[k];
          const monthKey = getMonthKey(params.date);
          const dayKey = getDayKey(params.date);
          const months = { ...(existing?.months ?? {}) };
          months[monthKey] = { ...(months[monthKey] ?? {}) };
          months[monthKey][dayKey] = res.timings;
          const next: V2Shape = {
            caches: {
              ...v2.caches,
              [k]: {
                provider: params.provider,
                latitude: params.latitude,
                longitude: params.longitude,
                calculationMethod: params.calculationMethod,
                school: params.school,
                months,
                lastAccessedAt: new Date().toISOString(),
              },
            },
          };
          await saveV2(next, k);
        })(),
        MUTEX_TIMEOUT_MS,
        'cache write',
      );
    } catch (e) {
      console.error('Failed to update prayer cache after fetch', e);
    }
  });

  return res.timings;
}

/**
 * Returns cache health for the given params and a count of contiguous
 * fully-stored months from now forward.
 */
export async function getCacheStatus(
  params: Omit<StoredPrayerData, 'months'>,
  now: Date = new Date(),
): Promise<{
  monthsStored: number;
  isExpired: boolean;
  daysMissingThisMonth: number;
  totalDaysCached: number;
}> {
  const v2 = await loadV2();
  const k = cacheKey(params);
  const entry = v2.caches[k];

  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (!entry) {
    return {
      monthsStored: 0,
      isExpired: true,
      daysMissingThisMonth: dim,
      totalDaysCached: 0,
    };
  }

  const currentMonthKey = getMonthKey(now);
  const currentMonthData = entry.months[currentMonthKey] ?? {};
  const daysPresentThisMonth = Object.keys(currentMonthData).length;
  const daysMissingThisMonth = Math.max(0, dim - daysPresentThisMonth);
  const isExpired = daysMissingThisMonth > 0;

  let totalDaysCached = 0;
  for (const days of Object.values(entry.months)) {
    totalDaysCached += Object.keys(days).length;
  }

  // Count consecutive fully-stored months from `now` forward.
  let count = 0;
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < 12; i++) {
    const mk = getMonthKey(d);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (entry.months[mk] && Object.keys(entry.months[mk]).length >= daysInMonth) {
      count++;
    } else {
      break;
    }
    d.setMonth(d.getMonth() + 1);
  }

  return {
    monthsStored: count,
    isExpired,
    daysMissingThisMonth,
    totalDaysCached,
  };
}

/**
 * Pre-fetch (and cache) the next `monthsAhead` calendar months for a given
 * (provider, lat, lng, method, school) tuple. Existing months are left intact;
 * only missing days are fetched. Other locations'\'' caches are untouched.
 *
 * Used both for the on-demand "fill the active location's cache" path AND
 * for the "warm a newly-saved location preset" path so switching presets is
 * instant.
 */
export async function refreshPrayerDataCache(
  params: Omit<StoredPrayerData, 'months'>,
  monthsAhead: number = 12,
  onProgress?: (progress: number, total: number) => void,
): Promise<void> {
  const now = new Date();
  const datesToFetch: Date[] = [];

  const v2 = await loadV2();
  const k = cacheKey(params);
  const existing: CacheEntry = v2.caches[k] ?? {
    provider: params.provider,
    latitude: params.latitude,
    longitude: params.longitude,
    calculationMethod: params.calculationMethod,
    school: params.school,
    months: {},
    lastAccessedAt: new Date().toISOString(),
  };

  for (let i = 0; i < monthsAhead; i++) {
    const year = now.getFullYear();
    const month = now.getMonth() + i;
    const dim = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const date = new Date(year, month, d);
      const monthKey = getMonthKey(date);
      const dayKey = getDayKey(date);
      if (!existing.months[monthKey] || !existing.months[monthKey][dayKey]) {
        datesToFetch.push(date);
      }
    }
  }

  if (datesToFetch.length === 0) {
    if (onProgress) onProgress(1, 1);
    return;
  }

  const concurrency = 4;
  let completed = 0;
  const months = { ...existing.months };

  for (let i = 0; i < datesToFetch.length; i += concurrency) {
    const batch = datesToFetch.slice(i, i + concurrency);
    const batchResult = await Promise.all(
      batch.map(async date => {
        try {
          const res = await fetchPrayerTimesUnified({
            provider: params.provider,
            latitude: params.latitude,
            longitude: params.longitude,
            date,
            calculationMethod: params.calculationMethod,
            school: params.school,
          });
          return { date, timings: res.timings };
        } catch (e) {
          // Background fill failures are best-effort. warn (not error) so
          // dev builds don'\''t flash a red LogBox banner over the UI for a
          // recoverable network blip (#137).
          console.warn('Failed to fetch for date', date, e);
          return null;
        }
      }),
    );

    for (const item of batchResult) {
      if (item) {
        const monthKey = getMonthKey(item.date);
        const dayKey = getDayKey(item.date);
        if (!months[monthKey]) months[monthKey] = {};
        months[monthKey][dayKey] = item.timings;
      }
    }

    completed += batch.length;
    if (onProgress) onProgress(completed, datesToFetch.length);

    // Small delay to avoid hammering APIs.
    await new Promise(resolve => setTimeout(() => resolve(undefined), 100));
  }

  // Single write at the end so concurrent month-scroll writes don'\''t race.
  const v2After = await loadV2();
  const next: V2Shape = {
    caches: {
      ...v2After.caches,
      [k]: {
        provider: params.provider,
        latitude: params.latitude,
        longitude: params.longitude,
        calculationMethod: params.calculationMethod,
        school: params.school,
        months,
        lastAccessedAt: new Date().toISOString(),
      },
    },
  };
  await saveV2(next, k);
}

/** Minimum gap between automatic full 12-month syncs (1 hour). */
const FULL_SYNC_COOLDOWN_MS = 60 * 60 * 1000;
const _lastFullSyncAttemptByKey = new Map<string, number>();

/**
 * Run a full 12-month background sync only if:
 *  - The cache for these params has fewer than 12 months stored, AND
 *  - At least FULL_SYNC_COOLDOWN_MS have passed since the last attempt
 *    for the SAME params (other locations are tracked independently so
 *    switching back triggers a sync if needed).
 *
 * Returns true if a sync was kicked off.
 */
export async function maybeFullSyncOnWifi(
  params: Omit<StoredPrayerData, 'months'>,
): Promise<boolean> {
  const k = cacheKey(params);
  const now = Date.now();
  const last = _lastFullSyncAttemptByKey.get(k) ?? 0;
  if (now - last < FULL_SYNC_COOLDOWN_MS) return false;
  const status = await getCacheStatus(params);
  if (status.monthsStored >= 12) return false;
  _lastFullSyncAttemptByKey.set(k, now);
  refreshPrayerDataCache(params, 12).catch(e =>
    console.warn('WiFi-triggered 12-month sync failed:', e),
  );
  return true;
}

/**
 * Reset the in-memory cooldown so the next call to `maybeFullSyncOnWifi`
 * fires immediately. Used by tests and by the "I switched location and want
 * a fresh sync now" path in the settings screen. Process-local — does not
 * touch persisted state.
 */
export function resetFullSyncCooldown(): void {
  _lastFullSyncAttemptByKey.clear();
}
