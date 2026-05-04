import type { TimingsMap } from '../types/prayer';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import {
  ProviderError,
  isAbortOrTimeoutError,
  isNetworkError,
} from './errors';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import type { PrayerTimesResult } from './types';

const PROVIDER = 'prayertimes_dev';
const BASE = 'https://prayertimes.dev/api/prayer-times';

type PrayTimesDevResponse = {
  location?: {
    timezone?: string;
  };
  prayer_times?: {
    fajr: string;
    sunrise: string;
    zuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
  };
};

function convertLondonTimeToLocal(timeStr: string, date: Date): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;

  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  let lYear: number | undefined,
    lMonth: number | undefined,
    lDay: number | undefined,
    lHour: number | undefined,
    lMinute: number | undefined,
    lSecond: number | undefined;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/London',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    }).formatToParts(localDate);

    for (const part of parts) {
      if (part.type === 'year') lYear = parseInt(part.value, 10);
      if (part.type === 'month') lMonth = parseInt(part.value, 10) - 1;
      if (part.type === 'day') lDay = parseInt(part.value, 10);
      if (part.type === 'hour') {
        lHour = parseInt(part.value, 10);
        if (lHour === 24) lHour = 0;
      }
      if (part.type === 'minute') lMinute = parseInt(part.value, 10);
      if (part.type === 'second') lSecond = parseInt(part.value, 10);
    }
  } catch {
    // Fallback if Intl is not fully supported
    return timeStr;
  }

  if (
    lYear === undefined || isNaN(lYear) ||
    lMonth === undefined || isNaN(lMonth) ||
    lDay === undefined || isNaN(lDay) || lDay < 1 ||
    lHour === undefined || isNaN(lHour) ||
    lMinute === undefined || isNaN(lMinute) ||
    lSecond === undefined || isNaN(lSecond)
  ) {
    return timeStr;
  }

  const londonDateAsLocal = new Date(lYear, lMonth, lDay, lHour, lMinute, lSecond);
  const offsetMs = localDate.getTime() - londonDateAsLocal.getTime();

  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
  targetDate.setTime(targetDate.getTime() + offsetMs);

  const outHours = targetDate.getHours().toString().padStart(2, '0');
  const outMinutes = targetDate.getMinutes().toString().padStart(2, '0');
  return `${outHours}:${outMinutes}`;
}

function normalize(dev: NonNullable<PrayTimesDevResponse['prayer_times']>, date: Date): TimingsMap {
  const fajr = convertLondonTimeToLocal(dev.fajr, date);
  // PrayTimes.dev does not return Imsak. Compute the canonical Fajr − 10 fallback
  // so downstream consumers (widget, fasting tracker, Suhoor countdown) always
  // have a value. The user-configurable offset (task #21) will override this
  // once the setting lands.
  return {
    Fajr: fajr,
    Sunrise: convertLondonTimeToLocal(dev.sunrise, date),
    Dhuhr: convertLondonTimeToLocal(dev.zuhr, date),
    Asr: convertLondonTimeToLocal(dev.asr, date),
    Maghrib: convertLondonTimeToLocal(dev.maghrib, date),
    Isha: convertLondonTimeToLocal(dev.isha, date),
    Imsak: computeImsak(fajr, DEFAULT_IMSAK_OFFSET_MINUTES),
  };
}

export async function fetchPrayTimesDev(params: {
  latitude: number;
  longitude: number;
  date: Date;
  school: number;
}): Promise<PrayerTimesResult> {
  const dateStr = formatLocalDate(params.date);
  const school = params.school === 1 ? 'hanafi' : 'shafi';
  const q = new URLSearchParams();
  q.append('lat', String(params.latitude));
  q.append('lng', String(params.longitude));
  q.append('date', dateStr);
  q.append('school', school);

  let res: Response;
  try {
    // Migrated from raw fetch() to the unified retry helper (task #6) so this
    // provider gets the same per-request timeout, jittered backoff, and 5xx
    // retry policy as the others.
    res = await fetchWithRetry(`${BASE}?${q.toString()}`, undefined, {
      maxAttempts: 4,
      baseDelayMs: 900,
      timeoutMs: 7000,
    });
  } catch (e) {
    if (isAbortOrTimeoutError(e)) {
      throw new ProviderError(PROVIDER, 'timeout', 'PrayTimes.dev request timed out', { cause: e });
    }
    if (isNetworkError(e)) {
      throw new ProviderError(PROVIDER, 'network', 'PrayTimes.dev network failure', { cause: e });
    }
    throw new ProviderError(PROVIDER, 'unknown', 'PrayTimes.dev request failed', { cause: e });
  }

  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(PROVIDER, 'unauthorized', `PrayTimes.dev returned ${res.status}`, {
      status: res.status,
    });
  }
  if (res.status >= 500) {
    throw new ProviderError(PROVIDER, 'server', `PrayTimes.dev server error (${res.status})`, {
      status: res.status,
    });
  }
  if (!res.ok) {
    throw new ProviderError(PROVIDER, 'shape', `PrayTimes.dev request failed (${res.status})`, {
      status: res.status,
    });
  }

  let json: PrayTimesDevResponse;
  try {
    json = (await res.json()) as PrayTimesDevResponse;
  } catch (e) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      'PrayTimes.dev response was not valid JSON',
      { cause: e },
    );
  }
  if (!json.prayer_times) {
    throw new ProviderError(PROVIDER, 'shape', 'PrayTimes.dev returned no prayer times');
  }
  return {
    timings: normalize(json.prayer_times, params.date),
    timezone: json.location?.timezone,
  };
}
