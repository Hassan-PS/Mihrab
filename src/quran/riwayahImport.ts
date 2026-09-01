/**
 * Turning a published riwayah dataset into a muṣḥaf — or refusing to.
 *
 * ── WHY THIS IS IN `src/` AND NOT IN `tools/` ─────────────────────────
 *
 * It began in `tools/riwayat/import.ts`, where a human ran it once and
 * looked at the output. That was the right place while the data was going
 * to be committed. It is the wrong place now: the app no longer ships any
 * riwayah data (`docs/design/riwayat-plan.md` §0), so the file that
 * becomes scripture on someone's phone is one THEIR device fetched, which
 * no maintainer will ever see.
 *
 * A check that only runs on the maintainer's laptop protects the
 * maintainer. So the checks live here, the CLI calls them, and the device
 * calls the same ones on whatever arrives before a single ayah of it is
 * drawn. Nothing becomes a muṣḥaf without passing through this function.
 *
 * ── WHAT IT REFUSES, AND WHY EACH ─────────────────────────────────────
 *
 * Scripture is the one payload where "probably right" is not a state the
 * app may be in, so every check is fatal rather than a warning. A checksum
 * proves a file arrived intact; these prove it is a Qur'an:
 *
 *   • 6236 ayahs, 114 surahs, and every surah's exact count. A dataset
 *     missing an ayah is not a shorter Qur'an, it is a wrong one.
 *   • No duplicates, no gaps.
 *   • Every ayah has text. An empty string renders as a blank line that
 *     looks like layout, not like loss.
 *   • Page numbers never go backwards. This is the one that catches a
 *     dataset stitched together out of order — the failure that would look
 *     completely plausible on screen.
 *   • Every page has at least one ayah on it. A muṣḥaf with a page nobody
 *     is on is a broken import, not a blank page in the print.
 *
 * ── AND WHETHER IT IS THE QUR'AN AT ALL ───────────────────────────────
 *
 * This used to say that whether correct-shaped Arabic is the real thing
 * was a human's job. It was left at that, and the consequence turned up on
 * an emulator: a synthetic dataset — literally the words "test text, not
 * Qur'an" repeated 6236 times — passed every check here and rendered as a
 * muṣḥaf, with surah band, juz label, ayah medallions and page number.
 * Nothing on that screen told a reader what they were looking at.
 *
 * So the content is checked too, at the sixty places a reader would check
 * it themselves: the first and last ayah of each of the thirty ajzāʾ, read
 * against the Tanzil Hafs text this app already ships and hashes. See
 * `juzCheck.ts`. It is not a proof of authenticity and does not pretend to
 * be one — but nothing that is not the Qur'an gets past it, which is the
 * failure that actually happened.
 */
import { SURAHS } from './quran';
import { TOTAL_AYAHS } from './ayahIndex';
import { checkJuzBoundaries } from './juzCheck';
import type { MushafPageRange, SurahMeta } from './pages';

/** One verse as QUL publishes it — the fields we need, all optional. */
type SourceVerse = {
  verse_key?: string;
  text?: string;
  page_number?: number;
  juz_number?: number;
};

/** A muṣḥaf, ready to store: its pagination, its index, and its text. */
export type RiwayahDataset = {
  pages: MushafPageRange[];
  surahs: SurahMeta[];
  /** Ayah text keyed `"surah:ayah"`. */
  text: Record<string, string>;
};

export type RiwayahVerifyResult =
  | { ok: true; dataset: RiwayahDataset; totalPages: number }
  | { ok: false; error: string };

/** Ayahs in surah `s` (1-based), from the app's own table. */
function ayahsIn(surah: number): number {
  return SURAHS[surah - 1].ayahCount;
}

/**
 * Verify a parsed dataset and convert it, or say exactly what is wrong.
 *
 * Returns rather than throws: the caller is a CLI that wants to print the
 * reason, or a phone that wants to SHOW it. Neither is served by a stack
 * trace, and a message a reader can act on ("this file has 6235 ayahs") is
 * the whole point of checking.
 */
export function verifyRiwayahDataset(
  raw: unknown,
  /** The Hafs surah index; names are the same 114 in every riwayah. */
  surahs: ReadonlyArray<SurahMeta>,
  /**
   * The Hafs pagination, which carries the juz table the content check
   * reads its sixty anchors from.
   *
   * Passed in rather than imported so this module keeps no runtime
   * dependency on `pages.ts` — that would pull the riwayah store and
   * `react-native-blob-util` into `tools/riwayat/import.ts`, which runs
   * under plain node.
   */
  hafsPages?: ReadonlyArray<MushafPageRange>,
): RiwayahVerifyResult {
  const fail = (error: string): RiwayahVerifyResult => ({ ok: false, error });

  // The dataset ships either as a bare array or wrapped; accept both
  // rather than make anyone reshape a file they were given.
  const verses: SourceVerse[] = Array.isArray(raw)
    ? (raw as SourceVerse[])
    : ((raw as { verses?: SourceVerse[] } | null)?.verses ?? []);
  if (verses.length === 0) return fail('no verses found in the file');

  if (verses.length !== TOTAL_AYAHS) {
    return fail(
      `expected ${TOTAL_AYAHS} ayahs, found ${verses.length}. ` +
        'This is not the whole Qur’an and will not be used.',
    );
  }

  const bySurah = new Map<number, Map<number, SourceVerse>>();
  for (const v of verses) {
    const key = v.verse_key ?? '';
    const m = /^(\d+):(\d+)$/.exec(key);
    if (!m) return fail(`verse_key "${key}" is not in surah:ayah form`);
    const surah = Number(m[1]);
    const ayah = Number(m[2]);
    if (surah < 1 || surah > 114) return fail(`surah ${surah} is out of range`);
    if (!v.text || !v.text.trim()) return fail(`${key} has no text`);
    if (typeof v.page_number !== 'number') {
      return fail(`${key} has no page_number`);
    }
    if (!bySurah.has(surah)) bySurah.set(surah, new Map());
    if (bySurah.get(surah)!.has(ayah)) return fail(`${key} appears twice`);
    bySurah.get(surah)!.set(ayah, v);
  }

  if (bySurah.size !== 114) {
    return fail(`expected 114 surahs, found ${bySurah.size}`);
  }
  for (let s = 1; s <= 114; s++) {
    const got = bySurah.get(s);
    if (!got) return fail(`surah ${s} is missing entirely`);
    if (got.size !== ayahsIn(s)) {
      return fail(`surah ${s} has ${got.size} ayahs, expected ${ayahsIn(s)}`);
    }
    for (let a = 1; a <= ayahsIn(s); a++) {
      if (!got.has(a)) return fail(`${s}:${a} is missing`);
    }
  }

  const pageOf = (s: number, a: number) => bySurah.get(s)!.get(a)!.page_number!;
  const juzOf = (s: number, a: number) =>
    bySurah.get(s)!.get(a)!.juz_number ?? 1;

  let lastPage = 0;
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= ayahsIn(s); a++) {
      const page = pageOf(s, a);
      if (page < lastPage) {
        return fail(
          `page numbers go backwards at ${s}:${a} (${lastPage} → ${page})`,
        );
      }
      lastPage = page;
    }
  }
  const totalPages = lastPage;
  if (totalPages < 1) return fail('no page numbers at all');

  const seen = new Set<number>();
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= ayahsIn(s); a++) seen.add(pageOf(s, a));
  }
  for (let p = 1; p <= totalPages; p++) {
    if (!seen.has(p)) return fail(`page ${p} has no ayahs on it`);
  }

  // ── Build what the reader reads ─────────────────────────────────────
  const firstOf = new Map<number, { surah: number; ayah: number }>();
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= ayahsIn(s); a++) {
      const p = pageOf(s, a);
      if (!firstOf.has(p)) firstOf.set(p, { surah: s, ayah: a });
    }
  }
  const pages: MushafPageRange[] = [];
  for (let p = 1; p <= totalPages; p++) {
    const start = firstOf.get(p)!;
    // `end` is EXCLUSIVE and null on the last page — the same contract the
    // Hafs table has, so `findPageForAyah` is shared between them.
    const end = p < totalPages ? firstOf.get(p + 1)! : null;
    pages.push({ page: p, juz: juzOf(start.surah, start.ayah), start, end });
  }

  const text: Record<string, string> = {};
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= ayahsIn(s); a++) {
      text[`${s}:${a}`] = bySurah.get(s)!.get(a)!.text!.trim();
    }
  }

  // ── And is it the Qur'an? ───────────────────────────────────────────
  if (hafsPages && hafsPages.length > 0) {
    const juzOf = (ref: { surah: number; ayah: number }): number | null =>
      bySurah.get(ref.surah)?.get(ref.ayah)?.juz_number ?? null;
    const content = checkJuzBoundaries(text, juzOf, hafsPages);
    if (!content.ok) return fail(content.error);
  }

  return {
    ok: true,
    totalPages,
    // The surah index is the Hafs one: they are the same 114 names, and
    // inventing a second spelling here would be a difference nobody asked
    // for and nobody could explain.
    dataset: { pages, surahs: [...surahs], text },
  };
}
