import { httpUserAgent } from '../config/httpIdentity';
import {
  reverseLocality,
  type ReverseLocality,
} from '../geocoding/nominatim';
import { getNearestIslamiskaForbundetCity } from './islamiskaForbundetNearest';
import { computeLocalAdhanTimes } from './localAdhan';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import type { PrayerTimesResult } from './types';

const WIDGET_URL =
  'https://www.islamiskaforbundet.se/wp-content/plugins/bonetider/Bonetider_Widget.php';

const MAX_REVERSE_CACHE = 200;
const reverseCache = new Map<string, ReverseLocality>();

function localityCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

async function resolveLocality(
  latitude: number,
  longitude: number,
): Promise<ReverseLocality> {
  const k = localityCacheKey(latitude, longitude);
  const hit = reverseCache.get(k);
  if (hit) {
    return hit;
  }
  const v = await reverseLocality(latitude, longitude);
  if (reverseCache.size >= MAX_REVERSE_CACHE) {
    const firstKey = reverseCache.keys().next().value;
    if (firstKey !== undefined) {
      reverseCache.delete(firstKey);
    }
  }
  reverseCache.set(k, v);
  return v;
}

/** Match how the upstream bönetider widget expects city names. */
function capitalizeForWidget(city: string): string {
  const t = city.trim();
  if (!t) {
    return t;
  }
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export async function fetchIslamiskaForbundetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
}): Promise<PrayerTimesResult> {
  const { city, countryCode } = await resolveLocality(
    params.latitude,
    params.longitude,
  );
  if (countryCode !== 'SE') {
    throw new Error(
      'Sweden prayer times are only available for locations in Sweden.',
    );
  }

  const nearestCity = getNearestIslamiskaForbundetCity(params.latitude, params.longitude);
  const widgetCity = nearestCity;

  const body = new URLSearchParams({
    ifis_bonetider_widget_city: `${widgetCity}, SE`,
    ifis_bonetider_widget_date: formatLocalDate(params.date),
  });

  const res = await fetchWithRetry(
    WIDGET_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,*/*',
        'User-Agent': httpUserAgent('Islamic prayer app'),
        Origin: 'https://www.islamiskaforbundet.se',
        Referer: 'https://www.islamiskaforbundet.se/bonetider/',
      },
      body: body.toString(),
    },
    { maxAttempts: 4, baseDelayMs: 800 },
  );

  if (!res.ok) {
    throw new Error(`Sweden prayer times server error (${res.status})`);
  }

  const html = await res.text();
  const times = html.match(/\d{2}:\d{2}/g);

  if (!Array.isArray(times) || times.length < 6) {
    throw new Error(
      `No prayer times returned for “${widgetCity}”. The service may have changed, or the place is not in the Sweden city list.`,
    );
  }

  const [fajr, sunrise, dhuhr, asr, maghrib, isha] = times.slice(0, 6);

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  // Circular diff handles times that straddle midnight (e.g. Isha 23:52 vs 00:45
  // are only 53 min apart, but naive subtraction gives 1387 min = 23 h).
  const circularMinuteDiff = (a: number, b: number): number => {
    const diff = Math.abs(a - b);
    return Math.min(diff, 1440 - diff);
  };

  const [fM, srM, dhM, asM, mgM, isM] = [fajr, sunrise, dhuhr, asr, maghrib, isha].map(toMinutes);

  // At high Swedish latitudes in summer, Isha can fall past midnight.
  // Only normalise if Isha is in the early-morning window (before 06:00) —
  // that's the only physically plausible "past midnight" zone for Isha.
  // This prevents a mis-parsed afternoon time from being silently accepted.
  const EARLY_MORNING_THRESHOLD = 6 * 60; // 06:00
  const isM_norm = isM < EARLY_MORNING_THRESHOLD ? isM + 1440 : isM;
  if (!(fM < srM && srM < dhM && dhM < asM && asM < mgM && mgM < isM_norm)) {
    throw new Error(
      `Prayer times for "${widgetCity}" are out of order — the website layout may have changed.`,
    );
  }

  // Advisory comparison against on-device adhan — logged only, never thrown.
  //
  // The Swedish Islamic Society uses a high-latitude method that legitimately
  // diverges from MWL (the local fallback) near midsummer, so any mismatch
  // is expected and must not block the scraped result. At extreme latitudes
  // Fajr/Isha can straddle midnight, so we use circular diff to avoid a
  // phantom ~24 h gap when one method places Isha at 23:52 and the other
  // at 00:45 (they are actually only 53 min apart).
  try {
    const local = computeLocalAdhanTimes({
      latitude: params.latitude,
      longitude: params.longitude,
      date: params.date,
      calculationMethod: 'auto',
      school: 0,
    });
    const ADVISORY_DIFF_MIN = 6 * 60;
    const pairs: Array<[number, string, string]> = [
      [fM,  local.timings.Fajr,    'Fajr'],
      [srM, local.timings.Sunrise, 'Sunrise'],
      [dhM, local.timings.Dhuhr,   'Dhuhr'],
      [asM, local.timings.Asr,     'Asr'],
      [mgM, local.timings.Maghrib, 'Maghrib'],
      [isM, local.timings.Isha,    'Isha'],
    ];
    for (const [scraped, localTime, name] of pairs) {
      const diff = circularMinuteDiff(scraped, toMinutes(localTime));
      if (diff > ADVISORY_DIFF_MIN) {
        console.warn(
          `[islamiskaForbundet] ${name} for "${widgetCity}" differs from ` +
          `on-device adhan by ${diff} min — returning scraped value anyway.`,
        );
      }
    }
  } catch {
    // Local adhan calculation failed — irrelevant to the scraped result.
  }

  return {
    timings: {
      Fajr: fajr,
      Sunrise: sunrise,
      Dhuhr: dhuhr,
      Asr: asr,
      Maghrib: maghrib,
      Isha: isha,
    },
    timezone: 'Europe/Stockholm',
  };
}
