import type { TimingsMap } from '../types/prayer';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import {
  ProviderError,
  isAbortOrTimeoutError,
  isNetworkError,
} from './errors';
import type { PrayerTimesResult } from './types';

const PROVIDER = 'aladhan';
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
  method?: number | 'auto';
  school?: number;
}): Promise<PrayerTimesResult> {
  const dateStr = formatLocalDate(params.date);
  const query = new URLSearchParams();
  query.append('latitude', String(params.latitude));
  query.append('longitude', String(params.longitude));
  if (params.method !== 'auto' && params.method !== undefined) {
    query.append('method', String(params.method));
  } else {
    // If 'auto' or undefined, AlAdhan automatically selects the best method based on location.
    // We can explicitly pass '99' for auto, or just omit it. Omitting it defaults to auto detection.
  }
  if (params.school !== undefined) {
    query.append('school', String(params.school));
  }
  const url = `${BASE}/timings/${dateStr}?${query.toString()}`;

  let res: Response;
  try {
    res = await fetchWithRetry(url, undefined, {
      maxAttempts: 4,
      baseDelayMs: 1000,
      timeoutMs: 7000,
    });
  } catch (e) {
    if (isAbortOrTimeoutError(e)) {
      throw new ProviderError(PROVIDER, 'timeout', 'AlAdhan request timed out', { cause: e });
    }
    if (isNetworkError(e)) {
      throw new ProviderError(PROVIDER, 'network', 'AlAdhan network failure', { cause: e });
    }
    throw new ProviderError(PROVIDER, 'unknown', 'AlAdhan request failed', { cause: e });
  }

  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(
      PROVIDER,
      'unauthorized',
      `AlAdhan returned ${res.status}`,
      { status: res.status },
    );
  }
  if (res.status >= 500) {
    throw new ProviderError(
      PROVIDER,
      'server',
      `AlAdhan server error (${res.status})`,
      { status: res.status },
    );
  }
  if (!res.ok) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `AlAdhan request failed (${res.status})`,
      { status: res.status },
    );
  }

  let json: AladhanTimingsResponse;
  try {
    json = (await res.json()) as AladhanTimingsResponse;
  } catch (e) {
    throw new ProviderError(PROVIDER, 'shape', 'AlAdhan response was not valid JSON', { cause: e });
  }
  if (json.code !== 200 || !json.data?.timings) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      json.status || 'AlAdhan returned an unexpected payload shape',
    );
  }
  return {
    timings: json.data.timings,
    timezone: json.data.meta?.timezone,
  };
}
