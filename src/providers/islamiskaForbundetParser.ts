/**
 * Pure, dependency-free parser + helpers for Islamiska Förbundet prayer times.
 *
 * Deliberately imports ONLY from `./errors` and `./imsak` (both pure) so this
 * module can be imported from:
 *   • the React Native app (the live `islamiskaForbundet.ts` provider), and
 *   • a plain Node script (the scheduled dataset builder in `tools/ifis-dataset`)
 * without dragging in AsyncStorage / native modules.
 *
 * The `provider-doctor` subagent owns the parser long-term: each Ramadan or
 * after a site redesign, save a real HTML response under
 * `__tests__/fixtures/islamiskaForbundet/` and add a regression test.
 */
import { ProviderError } from './errors';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import type { TimingsMap } from '../types/prayer';

export const ISLAMISKA_FORBUNDET_PROVIDER = 'islamiska_forbundet';

/** Fixed on-disk column order for the dataset day tuples. */
export const DATASET_TIME_KEYS = [
  'Imsak',
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

/** A single day in the prepared dataset: 7 `HH:MM` strings in DATASET_TIME_KEYS order. */
export type DatasetDayTuple = [
  string, string, string, string, string, string, string,
];

const TIME_RE = /\b\d{1,2}:\d{2}\b/g;

/**
 * ASCII slug for a Swedish city name, shared by the dataset builder (filename)
 * and the app (lookup) so both agree byte-for-byte. Handles å/ä/ö/é and strips
 * everything else to `[a-z0-9-]`.
 *
 *   "Alingsås"     → "alingsas"
 *   "Örebro"       → "orebro"
 *   "Motala Ström" → "motala-strom"
 */
export function citySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[àáâã]/g, 'a')
    .replace(/[å]/g, 'a')
    .replace(/[ä]/g, 'a')
    .replace(/[ö]/g, 'o')
    .replace(/[ø]/g, 'o')
    .replace(/[é]/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse the bönetider widget HTML response and return the 6 prayer times
 * (+ Imsak). See the file header for the maintenance contract.
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
      ISLAMISKA_FORBUNDET_PROVIDER,
      'shape',
      `No prayer times returned for "${cityForError}". The service may have ` +
        `changed, or the place is not in the Sweden city list. ` +
        `Found ${normalised.length} time-shaped tokens; need 6.`,
    );
  }

  // Ramadan: the site sometimes prepends an Imsak column, producing 7+ tokens.
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

  // At high Swedish latitudes in summer, Isha can fall past midnight. Only
  // normalise if Isha is in the early-morning window (before 06:00).
  const EARLY_MORNING_THRESHOLD = 6 * 60;
  const isM_norm = isM < EARLY_MORNING_THRESHOLD ? isM + 1440 : isM;
  if (!(fM < srM && srM < dhM && dhM < asM && asM < mgM && mgM < isM_norm)) {
    throw new ProviderError(
      ISLAMISKA_FORBUNDET_PROVIDER,
      'shape',
      `Prayer times for "${cityForError}" are out of order — the website ` +
        `layout may have changed. Got ` +
        `[${fajr}, ${sunrise}, ${dhuhr}, ${asr}, ${maghrib}, ${isha}].`,
    );
  }

  if (!imsak) {
    imsak = computeImsak(fajr, DEFAULT_IMSAK_OFFSET_MINUTES);
  } else {
    const iM = toMinutes(imsak);
    const fLocal = toMinutes(fajr);
    const wrap = iM >= 18 * 60 && fLocal < 6 * 60;
    if (!wrap && iM > fLocal) {
      throw new ProviderError(
        ISLAMISKA_FORBUNDET_PROVIDER,
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

/** Build a TimingsMap from a dataset day tuple (DATASET_TIME_KEYS order). */
export function tupleToTimings(t: DatasetDayTuple): TimingsMap {
  return {
    Imsak: t[0],
    Fajr: t[1],
    Sunrise: t[2],
    Dhuhr: t[3],
    Asr: t[4],
    Maghrib: t[5],
    Isha: t[6],
  };
}

/** Build a dataset day tuple from a TimingsMap (DATASET_TIME_KEYS order). */
export function timingsToTuple(t: TimingsMap): DatasetDayTuple {
  return [
    t.Imsak ?? computeImsak(t.Fajr, DEFAULT_IMSAK_OFFSET_MINUTES),
    t.Fajr,
    t.Sunrise,
    t.Dhuhr,
    t.Asr,
    t.Maghrib,
    t.Isha,
  ];
}
