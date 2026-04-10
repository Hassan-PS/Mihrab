import type { TimingsMap } from '../types/prayer';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import type { PrayerTimesResult } from './types';

const BASE = 'https://api.aladhan.com/v1';

type AladhanTimingsResponse = {
  code: number;
  status: string;
  data?: {
    timings: TimingsMap;
    meta?: {
      timezone?: string;
    };
  };
};

export async function fetchAladhanTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  method?: number;
  school?: number;
}): Promise<PrayerTimesResult> {
  const dateStr = formatLocalDate(params.date);
  const query = new URLSearchParams();
  query.append('latitude', String(params.latitude));
  query.append('longitude', String(params.longitude));
  query.append('method', String(params.method ?? 2));
  if (params.school !== undefined) {
    query.append('school', String(params.school));
  }
  const url = `${BASE}/timings/${dateStr}?${query.toString()}`;
  const res = await fetchWithRetry(url, undefined, {
    maxAttempts: 5,
    baseDelayMs: 1000,
  });
  if (!res.ok) {
    throw new Error(`AlAdhan request failed (${res.status})`);
  }
  const json = (await res.json()) as AladhanTimingsResponse;
  if (json.code !== 200 || !json.data?.timings) {
    throw new Error(json.status || 'Unexpected AlAdhan response');
  }
  return {
    timings: json.data.timings,
    timezone: json.data.meta?.timezone,
  };
}
