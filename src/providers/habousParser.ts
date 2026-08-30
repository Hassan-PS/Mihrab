/**
 * Pure, dependency-free parser for the Moroccan Ministry of Habous prayer
 * times — habous.gov.ma/prieres/index.php?ville=N.
 *
 * Deliberately imports ONLY pure modules, for the same reason
 * `islamiskaForbundetParser.ts` does: this has to be importable from the
 * React Native app AND from a plain Node script (the scheduled dataset
 * builder) without dragging in AsyncStorage or native modules.
 *
 * ── WHAT THE MINISTRY'S PAGE ACTUALLY IS ──────────────────────────────
 *
 * Established from a saved copy of the real page, kept as a fixture at
 * `__tests__/fixtures/habous/rabat-rabi-awwal-1448.html`. Four things about
 * it are not what you would guess, and each one is a bug if missed:
 *
 *  1. ONE HIJRI MONTH PER PAGE. Not a Gregorian one. So the Gregorian day
 *     column ROLLS OVER mid-table — 14…31 August, then 1…12 September — and
 *     a parser that assumes one month silently dates half the rows wrong.
 *
 *  2. The Gregorian months live only in the HEADER, as Moroccan Arabic
 *     month names (`غشت / شتنبر 2026`). Morocco does not use the Levantine
 *     names; غشت is August, شتنبر September. Hence MOROCCAN_MONTHS below.
 *
 *  3. SIX prayers, no Imsak — الصبح الشروق الظهر العصر المغرب العشاء.
 *     Imsak is derived, as it is everywhere else in this app.
 *
 *  4. The LAST row's Hijri day can read `حسب نتيجة المراقبة` ("according to
 *     the result of the sighting") instead of a number, because the month's
 *     final day depends on the moon. The Gregorian day is still a number,
 *     which is the one we date by, so the row is kept.
 *
 * The times themselves carry stray whitespace the ministry's template
 * leaves behind — `<td>13:37 </td>`, `<td> 21:41</td>`, and an Asr cell
 * wrapped across newlines — so every cell is trimmed rather than matched
 * exactly.
 */
import { ProviderError } from './errors';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import type { DatasetDayTuple } from './datasetTuple';
import type { TimingsMap } from '../types/prayer';

export const HABOUS_PROVIDER = 'habous';

/**
 * Moroccan Arabic Gregorian month names, in order.
 *
 * Morocco uses a set descended from the French/Berber calendar rather than
 * the Levantine names (كانون الثاني, شباط, …) that most Arabic month tables
 * list. Getting this wrong dates every row in the file.
 */
export const MOROCCAN_MONTHS: readonly string[] = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'ماي',
  'يونيو',
  'يوليوز',
  'غشت',
  'شتنبر',
  'أكتوبر',
  'نونبر',
  'دجنبر',
];

/** One city as the ministry's own `<select>` names it. */
export type HabousCity = { id: number; name: string };

/** One row of the ministry's table, dated. */
export type HabousDay = {
  /** ISO `YYYY-MM-DD`, resolved across the mid-table month rollover. */
  dateKey: string;
  /** The Hijri day as printed — a number, or the sighting note on the last row. */
  hijriDay: string;
  times: TimingsMap;
};

export type HabousMonth = {
  /** As printed, e.g. `ربيع الأول 1448`. */
  hijriLabel: string;
  days: HabousDay[];
};

const TIME_RE = /^\d{1,2}:\d{2}$/;

/** Strip tags and collapse the template's stray whitespace. */
function cellText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fail(message: string, meta?: Record<string, unknown>): never {
  throw new ProviderError(HABOUS_PROVIDER, 'shape', message, meta);
}

/**
 * Every city the ministry offers, from the page's own `<select name="ville">`.
 *
 * The ids are NOT contiguous — they run 1–169 and then jump to 301–322 — so
 * nothing may assume `id === index + 1`.
 */
export function parseHabousCities(html: string): HabousCity[] {
  const select = html.match(/<select[^>]*name=["']?ville["']?[^>]*>([\s\S]*?)<\/select>/i);
  if (!select) fail('no city <select> on the page');
  const cities: HabousCity[] = [];
  const re = /<option[^>]*value=['"][^'"]*ville=(\d+)['"][^>]*>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select[1]))) {
    const name = cellText(m[2]);
    if (name) cities.push({ id: Number(m[1]), name });
  }
  if (cities.length === 0) fail('city <select> held no options');
  return cities;
}

/**
 * The two Gregorian months the page spans, and their year, from its header.
 *
 * The header carries TWO lines and TWO four-digit years — the Hijri one
 * first (`ربيع الأول 1448`) and the Gregorian second (`غشت / شتنبر 2026`).
 * Taking the first number found yields 1448 and dates every row fifteen
 * centuries early, which is exactly what the first version of this did.
 * So the Gregorian line is identified by CONTAINING a Moroccan month name,
 * and the year is read from that line only.
 */
function headerMonths(html: string): { first: number; second: number; year: number } {
  const header = html.match(/<div class="priere-section-month">([\s\S]*?)<\/div>/i);
  if (!header) fail('no month header on the page');
  const lines = [...header[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(p => cellText(p[1]));
  const gregorian = lines.find(line =>
    MOROCCAN_MONTHS.some(name => line.includes(name)),
  );
  if (!gregorian) {
    fail('no Moroccan month name in the header', { lines });
  }
  const year = Number(gregorian.match(/\b(\d{4})\b/)?.[1] ?? NaN);
  if (!Number.isFinite(year)) {
    fail('no Gregorian year on the header line naming the months', { gregorian });
  }
  const found: number[] = [];
  for (const part of gregorian.split(/[/،]/)) {
    const idx = MOROCCAN_MONTHS.findIndex(name => part.includes(name));
    if (idx >= 0 && !found.includes(idx)) found.push(idx);
  }
  if (found.length === 0) fail('no Moroccan month name in the header', { gregorian });
  return { first: found[0], second: found[found.length - 1], year };
}

function iso(year: number, monthIndex: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse one city-month page into dated days.
 *
 * `imsakOffsetMinutes` derives the Imsak the ministry does not publish, so
 * the result matches the shape every other provider returns.
 */
export function parseHabousMonth(
  html: string,
  imsakOffsetMinutes: number = DEFAULT_IMSAK_OFFSET_MINUTES,
): HabousMonth {
  const { first, second, year } = headerMonths(html);
  const hijriLabel = cellText(
    html.match(/<p class="first">([\s\S]*?)<\/p>/i)?.[1] ?? '',
  );

  const days: HabousDay[] = [];
  let monthIndex = first;
  let previousDay = 0;
  let yearOffset = 0;

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html))) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => cellText(c[1]));
    // Nine columns: weekday, Hijri day, Gregorian day, then the six prayers.
    if (cells.length !== 9) continue;
    const six = cells.slice(3);
    if (!six.every(t => TIME_RE.test(t))) continue; // the heading row

    const gregorianDay = Number(cells[2]);
    if (!Number.isFinite(gregorianDay) || gregorianDay < 1 || gregorianDay > 31) {
      fail('a data row had no Gregorian day number', { cells });
    }
    // The rollover. A day number smaller than the one before it means the
    // Hijri month has crossed into the next Gregorian month — and if that
    // month is January, into the next year too.
    if (gregorianDay < previousDay) {
      monthIndex = second;
      if (second < first) yearOffset = 1;
    }
    previousDay = gregorianDay;

    const [Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha] = six;
    days.push({
      dateKey: iso(year + yearOffset, monthIndex, gregorianDay),
      hijriDay: cells[1],
      times: {
        Imsak: computeImsak(Fajr, imsakOffsetMinutes),
        Fajr,
        Sunrise,
        Dhuhr,
        Asr,
        Maghrib,
        Isha,
      },
    });
  }

  if (days.length === 0) fail('no prayer-time rows on the page');
  return { hijriLabel, days };
}

/** The dataset day tuple for one parsed day. */
export function habousDayTuple(day: HabousDay): DatasetDayTuple {
  const t = day.times;
  return [t.Imsak!, t.Fajr, t.Sunrise, t.Dhuhr, t.Asr, t.Maghrib, t.Isha];
}
