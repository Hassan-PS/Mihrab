/**
 * Muṣḥaf page metadata — task #111.
 *
 * Bundled JSON (~50 KB) describing the standard 604-page Madinah
 * muṣḥaf split: each page's start (surah, ayah), end (exclusive
 * surah, ayah), and the juz it belongs to. Plus a 114-surah index
 * for header rendering.
 *
 * Source: alquran.cloud /v1/meta (Tanzil-derived, CC BY 3.0).
 *
 * ── ONE TABLE PER RIWAYAH ─────────────────────────────────────────────
 *
 * This file used to export a single global pagination, which was correct
 * while there was one muṣḥaf. There is now a riwayah dimension: a Warsh
 * print does not break its pages where a Hafs print does, so "which page
 * is 2:142 on" has no answer until you say which muṣḥaf.
 *
 * `MUSHAF_PAGES` and the one-argument `findPageForAyah` remain, meaning
 * Hafs, because they are correct for every caller that has not been told
 * about riwayat and because a default that silently switched under them
 * would be worse than one that stays put.
 */
import { ayahCount } from './ayahIndex';
import { loadRiwayahPages } from './riwayahData';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const data = require('./data/pages.json') as {
  pages: Array<{
    page: number;
    juz: number;
    start: { surah: number; ayah: number };
    end: { surah: number; ayah: number } | null;
  }>;
  surahs: Array<{ number: number; name: string; englishName: string }>;
};

export type MushafPageRange = {
  page: number;
  juz: number;
  start: { surah: number; ayah: number };
  end: { surah: number; ayah: number } | null;
};

export const MUSHAF_PAGES: ReadonlyArray<MushafPageRange> = data.pages;

export type SurahMeta = { number: number; name: string; englishName: string };
export const MUSHAF_SURAHS: ReadonlyArray<SurahMeta> = data.surahs;

/**
 * The pagination for a riwayah, falling back to Hafs.
 *
 * Falls back rather than throwing: a stored riwayah id this build cannot
 * draw should put the reader on a muṣḥaf, not on an error screen.
 */
export function pagesForRiwayah(
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): ReadonlyArray<MushafPageRange> {
  if (riwayah === DEFAULT_RIWAYAH) return MUSHAF_PAGES;
  return loadRiwayahPages(riwayah)?.pages ?? MUSHAF_PAGES;
}

/** The surah index for a riwayah — names can differ in spelling. */
export function surahsForRiwayah(
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): ReadonlyArray<SurahMeta> {
  if (riwayah === DEFAULT_RIWAYAH) return MUSHAF_SURAHS;
  return loadRiwayahPages(riwayah)?.surahs ?? MUSHAF_SURAHS;
}

/**
 * Ayahs in a surah, IN THIS RIWAYAH.
 *
 * `ayahCount` is the Ḥafṣ table, and for a riwayah that divides the text
 * differently it is the wrong answer in fifty surahs. Warsh's al-Māʾidah
 * has 122 ayahs where Ḥafṣ has 120, so anything walking the Ḥafṣ counts
 * stops two ayahs early and drops them off the page without a word.
 *
 * Falls back to the Ḥafṣ count when a stored muṣḥaf predates `ayahCounts`
 * or is not installed — the caller is then reading Ḥafṣ anyway.
 */
export function ayahCountForRiwayah(
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  surah: number,
): number {
  if (riwayah === DEFAULT_RIWAYAH) return ayahCount(surah);
  const counts = loadRiwayahPages(riwayah)?.ayahCounts;
  const own = counts?.[surah - 1];
  return own && own > 0 ? own : ayahCount(surah);
}

/** Pages in this riwayah's muṣḥaf — not assumed to be 604. */
export function totalPagesForRiwayah(
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  return pagesForRiwayah(riwayah).length;
}

/** Find the page that contains a given surah/ayah, in a given riwayah. */
export function findPageForAyah(
  surah: number,
  ayah: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  const pages = pagesForRiwayah(riwayah);
  let lo = 0;
  let hi = pages.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = pages[mid];
    const startCmp = compare(p.start, { surah, ayah });
    const endCmp = p.end ? compare(p.end, { surah, ayah }) : 1;
    if (startCmp <= 0 && endCmp > 0) return p.page;
    if (startCmp > 0) hi = mid - 1;
    else lo = mid + 1;
  }
  return 1;
}

/**
 * The first ayah of a page — the inverse of `findPageForAyah`.
 *
 * This is what makes a riwayah switch keep your place: the page you were
 * on becomes an ayah, and the ayah becomes whatever page holds it in the
 * other muṣḥaf.
 */
export function firstAyahOfPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): { surah: number; ayah: number } {
  const pages = pagesForRiwayah(riwayah);
  const found = pages.find(p => p.page === page);
  return found ? found.start : { surah: 1, ayah: 1 };
}

/** The juz a page belongs to, in a given riwayah. */
export function juzForPageIn(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  return pagesForRiwayah(riwayah).find(p => p.page === page)?.juz ?? 1;
}

function compare(
  a: { surah: number; ayah: number },
  b: { surah: number; ayah: number },
): number {
  if (a.surah !== b.surah) return a.surah - b.surah;
  return a.ayah - b.ayah;
}

/** Convert a Western-Arabic numeral string to Eastern-Arabic. */
export function easternNumerals(n: number | string): string {
  return String(n).replace(/[0-9]/g, d =>
    String.fromCharCode('٠'.charCodeAt(0) + Number(d)),
  );
}
