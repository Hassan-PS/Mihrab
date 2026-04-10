import type { TimingsMap } from '../types/prayer';
import { formatLocalDate } from '../utils/date';
import type { PrayerTimesResult } from './types';

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

function normalize(dev: NonNullable<PrayTimesDevResponse['prayer_times']>): TimingsMap {
  return {
    Fajr: dev.fajr,
    Sunrise: dev.sunrise,
    Dhuhr: dev.zuhr,
    Asr: dev.asr,
    Maghrib: dev.maghrib,
    Isha: dev.isha,
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
  const res = await fetch(`${BASE}?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`PrayTimes.dev request failed (${res.status})`);
  }
  const json = (await res.json()) as PrayTimesDevResponse;
  if (!json.prayer_times) {
    throw new Error('PrayTimes.dev returned no prayer times');
  }
  return {
    timings: normalize(json.prayer_times),
    timezone: json.location?.timezone,
  };
}
