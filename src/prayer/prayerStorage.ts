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

// Serialises all cache writes so that concurrent fetches (e.g. month scroll)
// don't clobber each other.  Each write waits for the previous one to finish
// before reading-and-updating the cache.
let _writeMutex: Promise<void> = Promise.resolve();

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDayKey(date: Date): string {
  return formatLocalDate(date);
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

export async function saveStoredPrayerData(data: StoredPrayerData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save prayer data cache', e);
  }
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
  _writeMutex = _writeMutex.then(async () => {
    try {
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
    } catch (e) {
      console.error('Failed to update prayer cache after fetch', e);
    }
  });

  return res.timings;
}

export async function getCacheStatus(
  params: Omit<StoredPrayerData, 'months'>,
  now: Date = new Date()
): Promise<{ monthsStored: number; isExpired: boolean }> {
  const stored = await getStoredPrayerData();
  if (!stored || !isSameParams(stored, params)) {
    return { monthsStored: 0, isExpired: true };
  }

  let count = 0;
  const currentMonthKey = getMonthKey(now);
  
  // Check if current month is fully stored
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentMonthData = stored.months[currentMonthKey];
  const isExpired = !currentMonthData || Object.keys(currentMonthData).length < dim;

  // Count how many consecutive months from now are stored
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

  return { monthsStored: count, isExpired };
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
          console.error('Failed to fetch for date', date, e);
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
