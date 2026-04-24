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

  // Save to cache asynchronously
  getStoredPrayerData().then(async (stored) => {
    let newData = stored;
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
  }).catch(() => {});

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

  for (let i = 0; i < monthsAhead; i++) {
    const year = now.getFullYear();
    const month = now.getMonth() + i;
    const dim = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      datesToFetch.push(new Date(year, month, d));
    }
  }

  const newData: StoredPrayerData = {
    provider: params.provider,
    latitude: params.latitude,
    longitude: params.longitude,
    calculationMethod: params.calculationMethod,
    school: params.school,
    months: {},
  };

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
