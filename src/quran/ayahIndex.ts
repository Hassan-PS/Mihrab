/**
 * The ayah as a number from 1 to 6236 — the one coordinate every riwayah
 * agrees on.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * Khatmah progress, bookmarks and last-read all stored a PAGE. A page is
 * a fact about a printed muṣḥaf, not about the Qur'an: page 300 of a
 * Warsh muṣḥaf is not page 300 of a Hafs one, and nothing in the stored
 * record said which print it meant. Adding a second riwayah would have
 * made every saved number quietly ambiguous — a khatmah that read "300
 * pages" would mean two different amounts of Qur'an depending on which
 * muṣḥaf you happened to have open.
 *
 * Ayahs do not have that problem. The riwayat differ in recitation and
 * orthography, not in where the ayahs are: 6236 ayahs, in the same order,
 * in every one of them. So progress is counted in ayahs and pages become
 * a display detail of whichever muṣḥaf is on screen.
 *
 * Done BEFORE a second riwayah exists rather than after, because
 * migrating one set of page numbers is much cheaper than reconciling two.
 */
import { SURAHS } from './quran';

/** Ayahs in the Qur'an. The number every riwayah agrees on. */
export const TOTAL_AYAHS = 6236;

/**
 * Cumulative ayah counts: `OFFSETS[s]` is how many ayahs precede surah
 * `s`. Built once from the surah table rather than written out, so it
 * cannot drift from it.
 */
const OFFSETS: number[] = (() => {
  const out = new Array<number>(116).fill(0);
  let running = 0;
  for (let s = 1; s <= 114; s++) {
    out[s] = running;
    running += SURAHS[s - 1].ayahCount;
  }
  out[115] = running;
  return out;
})();

/** Ayahs in a surah, or 0 for a surah number that does not exist. */
export function ayahCount(surah: number): number {
  if (surah < 1 || surah > 114) return 0;
  return SURAHS[surah - 1].ayahCount;
}

/**
 * (surah, ayah) → 1-based index into the whole Qur'an.
 *
 * Clamped rather than throwing: this is fed by persisted records, and a
 * restored file from a future version or a corrupted one should land
 * somewhere sane instead of taking the reader down.
 */
export function ayahIndexOf(surah: number, ayah: number): number {
  const s = Math.min(114, Math.max(1, Math.trunc(surah) || 1));
  const count = ayahCount(s);
  const a = Math.min(count, Math.max(1, Math.trunc(ayah) || 1));
  return OFFSETS[s] + a;
}

/** The inverse. Also clamped. */
export function ayahAtIndex(index: number): { surah: number; ayah: number } {
  const i = Math.min(TOTAL_AYAHS, Math.max(1, Math.trunc(index) || 1));
  // 114 surahs; a linear scan is 114 comparisons at worst and this is not
  // on a hot path. Binary search would be faster and harder to read.
  for (let s = 114; s >= 1; s--) {
    if (OFFSETS[s] < i) return { surah: s, ayah: i - OFFSETS[s] };
  }
  return { surah: 1, ayah: 1 };
}

/**
 * How much of the Qur'an has been read, as a fraction.
 *
 * Takes the count rather than a page so the answer does not depend on
 * which muṣḥaf is open.
 */
export function ayahProgress(ayahsRead: number): number {
  return Math.min(1, Math.max(0, ayahsRead / TOTAL_AYAHS));
}

/** True when the surah table and this module still agree. */
export function ayahTableIsConsistent(): boolean {
  return OFFSETS[115] === TOTAL_AYAHS;
}
