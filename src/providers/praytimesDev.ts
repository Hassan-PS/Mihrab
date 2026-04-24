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

function convertLondonTimeToLocal(timeStr: string, date: Date): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;

  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  let lYear = 0, lMonth = 0, lDay = 0, lHour = 0, lMinute = 0, lSecond = 0;

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

  const londonDateAsLocal = new Date(lYear, lMonth, lDay, lHour, lMinute, lSecond);
  const offsetMs = localDate.getTime() - londonDateAsLocal.getTime();

  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
  targetDate.setTime(targetDate.getTime() + offsetMs);

  const outHours = targetDate.getHours().toString().padStart(2, '0');
  const outMinutes = targetDate.getMinutes().toString().padStart(2, '0');
  return `${outHours}:${outMinutes}`;
}

function normalize(dev: NonNullable<PrayTimesDevResponse['prayer_times']>, date: Date): TimingsMap {
  return {
    Fajr: convertLondonTimeToLocal(dev.fajr, date),
    Sunrise: convertLondonTimeToLocal(dev.sunrise, date),
    Dhuhr: convertLondonTimeToLocal(dev.zuhr, date),
    Asr: convertLondonTimeToLocal(dev.asr, date),
    Maghrib: convertLondonTimeToLocal(dev.maghrib, date),
    Isha: convertLondonTimeToLocal(dev.isha, date),
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
    timings: normalize(json.prayer_times, params.date),
    timezone: json.location?.timezone,
  };
}
