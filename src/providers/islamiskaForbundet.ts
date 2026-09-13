import { httpUserAgent } from '../config/httpIdentity';
import { getNearestIslamiskaForbundetCity } from './islamiskaForbundetNearest';
import { computeLocalAdhanTimes } from './localAdhan';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import {
  ProviderError,
  isAbortOrTimeoutError,
  isNetworkError,
} from './errors';
import { parseIslamiskaForbundetHtml } from './islamiskaForbundetParser';
import type { PrayerTimesResult } from './types';

// Re-exported for existing consumers/tests that import the parser from here.
export { parseIslamiskaForbundetHtml };

const PROVIDER = 'islamiska_forbundet';
const WIDGET_URL =
  'https://www.islamiskaforbundet.se/wp-content/plugins/bonetider/Bonetider_Widget.php';

/**
 * The reverse-geocode cache that used to live here is gone.
 *
 * `d2ec685b` dropped the Nominatim lookup this provider made per batch —
 * the nearest-city table answers the same question offline — and left
 * the machinery behind it orphaned: a disk-backed cache, an in-flight
 * coalescer and a 200-entry eviction policy, none of them reachable. It
 * is in the history if the lookup ever comes back.
 */

/** Match how the upstream bönetider widget expects city names. */
function capitalizeForWidget(city: string): string {
  const t = city.trim();
  if (!t) {
    return t;
  }
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Used by other internal call sites. */
export { capitalizeForWidget as _capitalizeForWidget };

export async function fetchIslamiskaForbundetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
}): Promise<PrayerTimesResult> {
  // We used to reverse-geocode here just to confirm `countryCode === 'SE'`,
  // but the caller already gates this provider behind `isCoordinateInSweden`
  // (see `getEffectiveDataProvider`), so the Nominatim round-trip was pure
  // dead weight — and worse, every day-fetch in the 12-month cache fill
  // raced 4 concurrent reverse-geocodes through Nominatim's 1-req/s rate
  // limit, falling back to local_adhan calculations and showing the user
  // wrong times. The nearest-city lookup below is a pure static-table
  // operation; no network call needed (#138).
  const nearestCity = getNearestIslamiskaForbundetCity(
    params.latitude,
    params.longitude,
  );
  const widgetCity = nearestCity;

  const body = new URLSearchParams({
    ifis_bonetider_widget_city: `${widgetCity}, SE`,
    ifis_bonetider_widget_date: formatLocalDate(params.date),
  });

  let res: Response;
  try {
    res = await fetchWithRetry(
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
      // 2 attempts × 6 s (v2.7.30, down from 4 × 7 s): when this small
      // origin is down it's down for hours — long retry chains just
      // delay the same-request AlAdhan failover in fetchPrayerTimes.
      { maxAttempts: 2, baseDelayMs: 600, timeoutMs: 6000 },
    );
  } catch (e) {
    if (isAbortOrTimeoutError(e)) {
      throw new ProviderError(PROVIDER, 'timeout', 'Sweden prayer-times request timed out', {
        cause: e,
      });
    }
    if (isNetworkError(e)) {
      throw new ProviderError(PROVIDER, 'network', 'Sweden prayer-times network failure', {
        cause: e,
      });
    }
    throw new ProviderError(PROVIDER, 'unknown', 'Sweden prayer-times request failed', {
      cause: e,
    });
  }

  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(PROVIDER, 'unauthorized', `Sweden source returned ${res.status}`, {
      status: res.status,
    });
  }
  if (res.status >= 500) {
    throw new ProviderError(PROVIDER, 'server', `Sweden prayer times server error (${res.status})`, {
      status: res.status,
    });
  }
  if (!res.ok) {
    throw new ProviderError(PROVIDER, 'shape', `Sweden source returned ${res.status}`, {
      status: res.status,
    });
  }

  const html = await res.text();
  const timings = parseIslamiskaForbundetHtml(html, widgetCity);

  // Advisory comparison against on-device adhan — logged only, never thrown.
  //
  // The Swedish Islamic Society uses a high-latitude method that legitimately
  // diverges from MWL (the local fallback) near midsummer, so any mismatch
  // is expected and must not block the scraped result. At extreme latitudes
  // Fajr/Isha can straddle midnight, so we use circular diff to avoid a
  // phantom ~24 h gap when one method places Isha at 23:52 and the other
  // at 00:45 (they are actually only 53 min apart).
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const circularMinuteDiff = (a: number, b: number): number => {
    const diff = Math.abs(a - b);
    return Math.min(diff, 1440 - diff);
  };
  try {
    const local = computeLocalAdhanTimes({
      latitude: params.latitude,
      longitude: params.longitude,
      date: params.date,
      calculationMethod: 'auto',
      school: 0,
    });
    const ADVISORY_DIFF_MIN = 6 * 60;
    const pairs: Array<[string, string, string]> = [
      [timings.Fajr, local.timings.Fajr, 'Fajr'],
      [timings.Sunrise, local.timings.Sunrise, 'Sunrise'],
      [timings.Dhuhr, local.timings.Dhuhr, 'Dhuhr'],
      [timings.Asr, local.timings.Asr, 'Asr'],
      [timings.Maghrib, local.timings.Maghrib, 'Maghrib'],
      [timings.Isha, local.timings.Isha, 'Isha'],
    ];
    for (const [scraped, localTime, name] of pairs) {
      const diff = circularMinuteDiff(toMinutes(scraped), toMinutes(localTime));
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
    timings,
    timezone: 'Europe/Stockholm',
  };
}
