/**
 * Mushaf page metadata — task #111.
 *
 * Bundled JSON (~50 KB) describing the standard 604-page Madinah
 * mushaf split: each page's start (surah, ayah), end (exclusive
 * surah, ayah), and the juz it belongs to. Plus a 114-surah index
 * for header rendering.
 *
 * Source: alquran.cloud /v1/meta (Tanzil-derived, CC BY 3.0).
 */

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

/** Find the page index (1..604) that contains a given surah/ayah. */
export function findPageForAyah(surah: number, ayah: number): number {
  let lo = 0;
  let hi = MUSHAF_PAGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = MUSHAF_PAGES[mid];
    const startCmp = compare(p.start, { surah, ayah });
    const endCmp = p.end ? compare(p.end, { surah, ayah }) : 1;
    if (startCmp <= 0 && endCmp > 0) return p.page;
    if (startCmp > 0) hi = mid - 1;
    else lo = mid + 1;
  }
  return 1;
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
