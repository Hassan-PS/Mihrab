import { httpUserAgent } from '../config/httpIdentity';
import {
  reverseLocality,
  type ReverseLocality,
} from '../geocoding/nominatim';
import { getNearestIslamiskaForbundetCity } from './islamiskaForbundetNearest';
import { computeLocalAdhanTimes } from './localAdhan';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import {
  ProviderError,
  isAbortOrTimeoutError,
  isNetworkError,
} from './errors';
import type { TimingsMap } from '../types/prayer';
import type { PrayerTimesResult } from './types';

const PROVIDER = 'islamiska_forbundet';
const WIDGET_URL =
  'https://www.islamiskaforbundet.se/wp-content/plugins/bonetider/Bonetider_Widget.php';

const MAX_REVERSE_CACHE = 200;
const reverseCache = new Map<string, ReverseLocality>();
/**
 * In-flight requests, keyed identically to the result cache. Lets us
 * deduplicate concurrent reverse-geocode hits for the same coords —
 * the 12-month cache fill in `prayerStorage.refreshPrayerDataCache`
 * runs 4 day-fetches in parallel per batch, and before #137 each one
 * raced its own reverse-geocode call. Nominatim rate-limits at ~1
 * req/s, so 4 races → 3 failures until the cache populated. With
 * single-flight, the first pending Promise is shared across all
 * concurrent callers and the cache is filled atomically.
 */
const reverseInFlight = new Map<string, Promise<ReverseLocality>>();

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
  // Coalesce concurrent callers onto a single network request.
  const inflight = reverseInFlight.get(k);
  if (inflight) {
    return inflight;
  }
  const promise = reverseLocality(latitude, longitude)
    .then(v => {
      if (reverseCache.size >= MAX_REVERSE_CACHE) {
        const firstKey = reverseCache.keys().next().value;
        if (firstKey !== undefined) {
          reverseCache.delete(firstKey);
        }
      }
      reverseCache.set(k, v);
      return v;
    })
    .finally(() => {
      // Drop the in-flight slot whether we succeeded or failed; on
      // failure the next caller will retry, on success the cache hit
      // path takes over.
      reverseInFlight.delete(k);
    });
  reverseInFlight.set(k, promise);
  return promise;
}

const TIME_RE = /\b\d{1,2}:\d{2}\b/g;

/**
 * Parse the bönetider widget HTML response and return the 6 prayer times.
 *
 * Extracted from the fetch path in task #6 so the parser can be unit-tested
 * with HTML fixtures. The provider-doctor subagent owns this parser long-term:
 * each Ramadan or after a site redesign, save a real HTML response under
 * `__tests__/fixtures/islamiskaForbundet/` and add a regression test.
 *
 * Strategy:
 *   1. Strip script/style blocks (defensive — embedded JS or CSS could
 *      include accidental HH:MM literals).
 *   2. Extract HH:MM-shaped tokens from the remaining HTML.
 *   3. Filter to canonical zero-padded HH:MM (rejects spurious matches like
 *      "1:23" or "99:99").
 *   4. Take the first 6 in document order — these are Fajr, Sunrise, Dhuhr,
 *      Asr, Maghrib, Isha as rendered by the widget.
 *   5. Verify physical ordering: Fajr < Sunrise < Dhuhr < Asr < Maghrib,
 *      with Isha allowed to wrap past midnight at high latitudes.
 *
 * @throws ProviderError('shape') if fewer than 6 times are found or ordering
 *         fails — the website layout has likely changed.
 */
export function parseIslamiskaForbundetHtml(
  html: string,
  cityForError: string = 'unknown',
): TimingsMap {
  // Strip <script> and <style> blocks so any HH:MM literal embedded in inline
  // JS or CSS doesn't poison the time extraction.
  const stripped = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  const matches = stripped.match(TIME_RE) ?? [];
  // Normalise to HH:MM (the widget always pads, but be defensive).
  const normalised: string[] = [];
  for (const t of matches) {
    const [hStr, mStr] = t.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    if (h < 0 || h > 23 || m < 0 || m > 59) continue;
    normalised.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }

  if (normalised.length < 6) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `No prayer times returned for "${cityForError}". The service may have ` +
        `changed, or the place is not in the Sweden city list. ` +
        `Found ${normalised.length} time-shaped tokens; need 6.`,
    );
  }

  // Ramadan detection (task #7): the Islamiska Förbundet site sometimes
  // publishes a Ramadan-specific timetable that includes Imsak as an
  // additional column, producing 7+ HH:MM tokens. When we see exactly 7,
  // assume the leading token is Imsak (the conventional column order is
  // Imsak | Fajr | Sunrise | Dhuhr | Asr | Maghrib | Isha). When we see
  // 6, fall back to computing Imsak = Fajr − 10 with a debug log.
  //
  // The provider-doctor subagent owns the long-term maintenance: each
  // Ramadan, save a fixture HTML response and add a regression test here
  // verifying the column order has not been swapped.
  let imsak: string | undefined;
  let salahStart = 0;
  if (normalised.length >= 7) {
    imsak = normalised[0];
    salahStart = 1;
  }
  const [fajr, sunrise, dhuhr, asr, maghrib, isha] = normalised.slice(
    salahStart,
    salahStart + 6,
  );

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const [fM, srM, dhM, asM, mgM, isM] = [
    fajr,
    sunrise,
    dhuhr,
    asr,
    maghrib,
    isha,
  ].map(toMinutes);

  // At high Swedish latitudes in summer, Isha can fall past midnight.
  // Only normalise if Isha is in the early-morning window (before 06:00) —
  // that's the only physically plausible "past midnight" zone for Isha.
  // This prevents a mis-parsed afternoon time from being silently accepted.
  const EARLY_MORNING_THRESHOLD = 6 * 60; // 06:00
  const isM_norm = isM < EARLY_MORNING_THRESHOLD ? isM + 1440 : isM;
  if (!(fM < srM && srM < dhM && dhM < asM && asM < mgM && mgM < isM_norm)) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `Prayer times for "${cityForError}" are out of order — the website ` +
        `layout may have changed. Got ` +
        `[${fajr}, ${sunrise}, ${dhuhr}, ${asr}, ${maghrib}, ${isha}].`,
    );
  }

  // Imsak fallback: site didn't include a Ramadan column. Compute locally so
  // downstream consumers (widget, fasting tracker, Suhoor countdown) always
  // have a value. Debug log so the provider-doctor can investigate if a
  // Ramadan timetable was expected but not detected.
  if (!imsak) {
    imsak = computeImsak(fajr, DEFAULT_IMSAK_OFFSET_MINUTES);
    if (process.env.NODE_ENV !== 'test') {
      console.debug(
        `[islamiskaForbundet] No Imsak column in response for "${cityForError}" ` +
          `(${normalised.length} tokens) — computed Imsak=${imsak} from Fajr=${fajr}.`,
      );
    }
  } else {
    // Sanity: Imsak from response must be at-or-before Fajr (with high-latitude
    // wrap allowed). If the column order was swapped or the wrong section was
    // parsed, the time will look wildly off.
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const iM = toMin(imsak);
    const fLocal = toMin(fajr);
    const wrap = iM >= 18 * 60 && fLocal < 6 * 60; // late-evening Imsak with early-morning Fajr
    if (!wrap && iM > fLocal) {
      throw new ProviderError(
        PROVIDER,
        'shape',
        `Imsak (${imsak}) after Fajr (${fajr}) for "${cityForError}" — column order likely changed.`,
      );
    }
  }

  return {
    Imsak: imsak,
    Fajr: fajr,
    Sunrise: sunrise,
    Dhuhr: dhuhr,
    Asr: asr,
    Maghrib: maghrib,
    Isha: isha,
  };
}

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
  let locality;
  try {
    locality = await resolveLocality(params.latitude, params.longitude);
  } catch (e) {
    if (isAbortOrTimeoutError(e)) {
      throw new ProviderError(PROVIDER, 'timeout', 'Reverse geocoding timed out', { cause: e });
    }
    if (isNetworkError(e)) {
      throw new ProviderError(PROVIDER, 'network', 'Reverse geocoding failed', { cause: e });
    }
    throw new ProviderError(PROVIDER, 'unknown', 'Reverse geocoding failed', { cause: e });
  }
  const { countryCode } = locality;
  if (countryCode !== 'SE') {
    throw new ProviderError(
      PROVIDER,
      'shape',
      'Sweden prayer times are only available for locations in Sweden.',
    );
  }

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
      { maxAttempts: 4, baseDelayMs: 800, timeoutMs: 7000 },
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
