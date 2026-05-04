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

const STORAGE_KEY = 'prayer_times_cache';

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

/**
 * Pick the lexicographically smallest month key. Months are formatted YYYY-MM,
 * so lexicographic order matches chronological order. Returns `null` if no
 * months are cached.
 */
function pickOldestMonthKey(data: StoredPrayerData): string | null {
  const keys = Object.keys(data.months);
  if (keys.length === 0) return null;
  return keys.reduce((a, b) => (a < b ? a : b));
}

/**
 * Drop the oldest cached month from `data`. Returns a new object (does not
 * mutate the input) with the month removed, or `null` if there's nothing to
 * evict (cache already empty in `months`).
 */
function evictOldestMonth(data: StoredPrayerData): StoredPrayerData | null {
  const oldest = pickOldestMonthKey(data);
  if (!oldest) return null;
  const months = { ...data.months };
  delete months[oldest];
  return { ...data, months };
}

export async function getStoredPrayerData(): Promise<StoredPrayerData | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data) as StoredPrayerData;
  } catch {
    return null;
  }
}

/** Internal save — single attempt, returns categorised result. */
async function saveOnce(data: StoredPrayerData): Promise<SaveResult> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unknown', error: e };
  }
}

/**
 * Save the cache. On quota errors, evicts the oldest cached month and retries
 * once. Returns a `SaveResult` so callers can surface a "couldn't save" toast
 * when persistence ultimately fails — silent swallow is no longer the default.
 */
export async function saveStoredPrayerData(
  data: StoredPrayerData,
): Promise<SaveResult> {
  const first = await saveOnce(data);
  if (first.ok) return first;

  if (first.reason === 'quota') {
    // Evict the oldest month and try again. The user trades older history for
    // future months, which is what they actually need for prayer times.
    const slim = evictOldestMonth(data);
    if (slim) {
      console.warn(
        'prayerStorage: storage quota exceeded, evicting oldest month and retrying',
      );
      const second = await saveOnce(slim);
      if (second.ok) return second;
      // Both attempts failed — surface to caller.
      console.error('prayerStorage: cache write failed after eviction', second.error);
      return second;
    }
  }

  console.error('prayerStorage: cache write failed', first.error);
  return first;
}

export async function clearStoredPrayerData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear prayer data cache', e);
  }
}

function isSameParams(a: StoredPrayerData, b: Omit<StoredPrayerData, 'months'>): boolean {
  return (
    a.provider === b.provider &&
    Math.abs(a.latitude - b.latitude) < 0.01 &&
    Math.abs(a.longitude - b.longitude) < 0.01 &&
    a.calculationMethod === b.calculationMethod &&
    a.school === b.school
  );
}

export async function getCachedPrayerTimes(
  params: Omit<StoredPrayerData, 'months'> & { date: Date }
): Promise<TimingsMap | null> {
  const stored = await getStoredPrayerData();
  if (!stored) return null;

  if (!isSameParams(stored, params)) {
    return null; // Cache is for different settings
  }

  const monthKey = getMonthKey(params.date);
  const dayKey = getDayKey(params.date);

  if (stored.months[monthKey] && stored.months[monthKey][dayKey]) {
    return stored.months[monthKey][dayKey];
  }

  return null;
}

export async function getOrFetchPrayerTimes(
  params: Omit<StoredPrayerData, 'months'> & { date: Date }
): Promise<TimingsMap> {
  const cached = await getCachedPrayerTimes(params);
  if (cached) {
    return cached;
  }

  // Not in cache, fetch it
  const res = await fetchPrayerTimesUnified({
    provider: params.provider,
    latitude: params.latitude,
    longitude: params.longitude,
    date: params.date,
    calculationMethod: params.calculationMethod,
    school: params.school,
  });

  // Save to cache via the mutex so concurrent fetches don't clobber each other.
  // The mutex'd block is wrapped in a hard timeout — if AsyncStorage hangs
  // (rooted/jailbroken devices, exotic backends, native bugs), the mutex
  // releases after MUTEX_TIMEOUT_MS so subsequent writes are not blocked.
  _writeMutex = _writeMutex.then(async () => {
    try {
      await withTimeout(
        (async () => {
          let newData = await getStoredPrayerData();
          if (!newData || !isSameParams(newData, params)) {
            newData = {
              provider: params.provider,
              latitude: params.latitude,
              longitude: params.longitude,
              calculationMethod: params.calculationMethod,
              school: params.school,
              months: {},
            };
          }

          const monthKey = getMonthKey(params.date);
          const dayKey = getDayKey(params.date);

          if (!newData.months[monthKey]) {
            newData.months[monthKey] = {};
          }
          newData.months[monthKey][dayKey] = res.timings;

          await saveStoredPrayerData(newData);
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
 * Returns cache health for the current month and a count of contiguous
 * fully-stored months from now forward.
 *
 * @returns
 *  - `monthsStored` — count of contiguous fully-stored months starting from
 *    the current month.
 *  - `isExpired` — true if the current month is missing ANY days. Preserved
 *    for backwards compatibility with `usePrayerDay`'s coarse "needs cache
 *    fill" decision.
 *  - `daysMissingThisMonth` — exact count of missing days in the current
 *    calendar month. Lets callers fetch ONLY the missing days instead of
 *    re-fetching the entire month (refresh logic in `refreshPrayerDataCache`
 *    already supports this).
 *  - `totalDaysCached` — diagnostic counter across all stored months.
 */
export async function getCacheStatus(
  params: Omit<StoredPrayerData, 'months'>,
  now: Date = new Date()
): Promise<{
  monthsStored: number;
  isExpired: boolean;
  daysMissingThisMonth: number;
  totalDaysCached: number;
}> {
  const stored = await getStoredPrayerData();
  if (!stored || !isSameParams(stored, params)) {
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return {
      monthsStored: 0,
      isExpired: true,
      daysMissingThisMonth: dim,
      totalDaysCached: 0,
    };
  }

  const currentMonthKey = getMonthKey(now);
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentMonthData = stored.months[currentMonthKey] ?? {};
  const daysPresentThisMonth = Object.keys(currentMonthData).length;
  const daysMissingThisMonth = Math.max(0, dim - daysPresentThisMonth);
  const isExpired = daysMissingThisMonth > 0;

  let count = 0;
  let totalDaysCached = 0;
  for (const days of Object.values(stored.months)) {
    totalDaysCached += Object.keys(days).length;
  }

  // Count consecutive fully-stored months from `now` forward.
  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < 12; i++) {
    const mk = getMonthKey(d);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (stored.months[mk] && Object.keys(stored.months[mk]).length >= daysInMonth) {
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

export async function refreshPrayerDataCache(
  params: Omit<StoredPrayerData, 'months'>,
  monthsAhead: number = 12,
  onProgress?: (progress: number, total: number) => void
): Promise<void> {
  const now = new Date();
  const datesToFetch: Date[] = [];

  const existingData = await getStoredPrayerData();
  const keepExisting = existingData && isSameParams(existingData, params);

  const newData: StoredPrayerData = keepExisting
    ? existingData
    : {
        provider: params.provider,
        latitude: params.latitude,
        longitude: params.longitude,
        calculationMethod: params.calculationMethod,
        school: params.school,
        months: {},
      };

  for (let i = 0; i < monthsAhead; i++) {
    const year = now.getFullYear();
    const month = now.getMonth() + i;
    const dim = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const date = new Date(year, month, d);
      const monthKey = getMonthKey(date);
      const dayKey = getDayKey(date);

      // Only fetch if missing
      if (!newData.months[monthKey] || !newData.months[monthKey][dayKey]) {
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
          // Background 12-month cache fill — failures are best-effort
          // and recover automatically next time the user opens the
          // app or hits a fresh batch. Use warn (not error) so dev
          // builds don't flash a red LogBox banner over the UI for a
          // recoverable network blip (#137).
          console.warn('Failed to fetch for date', date, e);
          return null;
        }
      })
    );

    for (const item of batchResult) {
      if (item) {
        const monthKey = getMonthKey(item.date);
        const dayKey = getDayKey(item.date);
        if (!newData.months[monthKey]) {
          newData.months[monthKey] = {};
        }
        newData.months[monthKey][dayKey] = item.timings;
      }
    }

    completed += batch.length;
    if (onProgress) {
      onProgress(completed, datesToFetch.length);
    }

    // Small delay to avoid hammering APIs
    await new Promise(resolve => setTimeout(() => resolve(undefined), 100));
  }

  await saveStoredPrayerData(newData);
}

/** Minimum gap between automatic full 12-month syncs (1 hour). */
const FULL_SYNC_COOLDOWN_MS = 60 * 60 * 1000;
let _lastFullSyncAttemptMs = 0;

/**
 * Run a full 12-month background sync only if:
 *  - The cache has fewer than 12 months stored, AND
 *  - At least FULL_SYNC_COOLDOWN_MS have passed since the last attempt.
 *
 * Designed to be called whenever WiFi connectivity is detected.
 * Returns true if a sync was kicked off.
 */
export async function maybeFullSyncOnWifi(
  params: Omit<StoredPrayerData, 'months'>,
): Promise<boolean> {
  const now = Date.now();
  if (now - _lastFullSyncAttemptMs < FULL_SYNC_COOLDOWN_MS) {
    return false;
  }
  const status = await getCacheStatus(params);
  if (status.monthsStored >= 12) {
    return false;
  }
  _lastFullSyncAttemptMs = now;
  refreshPrayerDataCache(params, 12).catch(e =>
    console.warn('WiFi-triggered 12-month sync failed:', e),
  );
  return true;
}
