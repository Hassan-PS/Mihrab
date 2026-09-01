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
import { checkAgainstHafs, type AlignedVerse } from './hafsAlignment';
import type { MushafPageRange, SurahMeta } from './pages';

/** One verse as QUL publishes it — the fields we need, all optional. */
type SourceVerse = {
  verse_key?: string;
  text?: string;
  page_number?: number;
  juz_number?: number;
  /**
   * Which ayahs of the Ḥafṣ muṣḥaf this one is, within the same surah.
   *
   * One, usually. Two or three where this riwayah merges Ḥafṣ ayahs; the
   * same number on two consecutive ayahs where it splits one. Absent on a
   * file that does not state it — see `verifyRiwayahDataset`, which then
   * has to fall back to a much weaker check.
   */
  number_in_hafs?: number[];
};

/** A muṣḥaf, ready to store: its pagination, its index, and its text. */
export type RiwayahDataset = {
  pages: MushafPageRange[];
  surahs: SurahMeta[];
  /**
   * Ayahs per surah IN THIS RIWAYAH, indexed from 0.
   *
   * Beside `surahs` rather than inside it because the names are shared and
   * the counts are not: `SurahMeta` is the same 114 entries for every
   * riwayah, while Warsh's al-Baqarah has 285 ayahs to Ḥafṣ's 286.
   */
  ayahCounts: number[];
  /** Ayah text keyed `"surah:ayah"`, in this riwayah's own numbering. */
  text: Record<string, string>;
};

export type RiwayahVerifyResult =
  | {
      ok: true;
      dataset: RiwayahDataset;
      totalPages: number;
      /**
       * What the content check was able to do — and it matters which.
       *
       * `aligned` means every ayah was read against the Ḥafṣ it says it
       * is. `anchors` means only the sixty juz boundaries were, because
       * the file did not say how its numbering lines up. A caller telling
       * someone what was verified should not say the first when it did
       * the second.
       */
      checked:
        | { kind: 'aligned'; groups: number; splits: number; merges: number; mean: number }
        | { kind: 'anchors'; mean: number }
        // Null when nothing could be read — no mapping in the file AND no
        // reference muṣḥaf passed in. Shape was checked and content was
        // not, and the caller has to decide whether that is enough. For
        // anything that installs scripture it is not: see
        // `riwayahDownload.ts`, which refuses it.
        | null;
    }
  | { ok: false; error: string };

/** Ayahs in surah `s` (1-based), from the app's own table. */
function ayahsIn(surah: number): number {
  return SURAHS[surah - 1].ayahCount;
}

/**
 * The verses in a published file, whichever way it is wrapped.
 *
 * Three shapes, because three shapes exist in the wild and none of them is
 * wrong. QUL's own JSON exports are the third: an object keyed by verse,
 * `{"1:1": {…}, "1:2": {…}}`. Reading only the first two is what made a
 * perfectly good 1.8 MB Warsh download fail with "no verses found in the
 * file" — a message that blames the file for the reader's app not knowing
 * how to open it.
 *
 * The key is ignored in favour of the `verse_key` inside each entry, with
 * one exception: a file whose entries carry no `verse_key` gets the key it
 * was filed under, since that is plainly what it means. Everything after
 * this point sees one flat list.
 */
function versesIn(raw: unknown): SourceVerse[] {
  if (Array.isArray(raw)) return raw as SourceVerse[];
  if (!raw || typeof raw !== 'object') return [];
  const wrapped = (raw as { verses?: unknown }).verses;
  if (Array.isArray(wrapped)) return wrapped as SourceVerse[];

  // A muṣḥaf nested under its surahs, which is how Quranpedia publishes
  // one. The surah supplies the number the ayah does not repeat, and the
  // field names differ from the flat form — `juz` rather than
  // `juz_number` — so this is a translation, not just a flattening.
  const nested = (raw as { surahs?: unknown }).surahs;
  if (Array.isArray(nested)) {
    const out: SourceVerse[] = [];
    for (const surah of nested as Array<Record<string, unknown>>) {
      const number = Number(surah?.id);
      const ayahs = surah?.ayahs;
      if (!Number.isInteger(number) || !Array.isArray(ayahs)) continue;
      for (const a of ayahs as Array<Record<string, unknown>>) {
        const inHafs = a?.number_in_hafs;
        out.push({
          verse_key: `${number}:${a?.number}`,
          text: typeof a?.text === 'string' ? a.text : undefined,
          page_number:
            typeof a?.page_number === 'number' ? a.page_number : undefined,
          juz_number: typeof a?.juz === 'number' ? a.juz : undefined,
          number_in_hafs: Array.isArray(inHafs)
            ? (inHafs as unknown[]).map(Number).filter(Number.isInteger)
            : typeof inHafs === 'number'
              ? [inHafs]
              : undefined,
        });
      }
    }
    return out;
  }
  const out: SourceVerse[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const verse = value as SourceVerse;
    out.push(verse.verse_key ? verse : { ...verse, verse_key: key });
  }
  return out;
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

  const verses = versesIn(raw);
  if (verses.length === 0) return fail('no verses found in the file');

  // ── What the file says it is ────────────────────────────────────────
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

  /**
   * This riwayah's own ayah counts, read off the file.
   *
   * NOT the Ḥafṣ table. Warsh divides the same text into 6,214 ayahs
   * rather than 6,236 — 22 fewer, in fifty surahs, and in both directions:
   * al-Baqarah has 285 where Ḥafṣ has 286, al-Wāqiʿah has 99 where Ḥafṣ
   * has 96. Checking a Madani-numbered muṣḥaf against Kufan counts refuses
   * a perfectly good Qur'an, which is what it did.
   *
   * Read off the file and then proved complete by `number_in_hafs` below:
   * the file may say how it divides the text, but it does not get to say
   * how much text there is.
   */
  const counts: number[] = [];
  for (let s = 1; s <= 114; s++) {
    const got = bySurah.get(s)!;
    const total = Math.max(...got.keys());
    for (let a = 1; a <= total; a++) {
      if (!got.has(a)) return fail(`${s}:${a} is missing`);
    }
    if (got.size !== total) return fail(`surah ${s} has ayahs out of range`);
    counts.push(total);
  }
  const at = (s: number, a: number) => bySurah.get(s)!.get(a)!;

  // ── Is it the whole Qur'an, and is it the Qur'an at all? ────────────
  //
  // Two routes, and the file chooses which by what it carries.
  //
  // A muṣḥaf that states its Ḥafṣ correspondence gets the strong one:
  // every ayah of every surah accounted for against the text this app
  // already ships and hashes, and every ayah read for content — 6,155
  // comparisons for Warsh rather than sixty. `hafsAlignment.ts` explains
  // why that is possible only with the mapping.
  //
  // One that does not is checked the old way: its counts must be the Ḥafṣ
  // counts, and its content is sampled at the thirty juz boundaries. That
  // is weaker, and it is all that can honestly be done for a file that
  // will not say how its numbering relates to anything.
  let checked: Extract<RiwayahVerifyResult, { ok: true }>['checked'] | null = null;
  const aligned: AlignedVerse[] = [];
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= counts[s - 1]; a++) {
      const v = at(s, a);
      const hafs = v.number_in_hafs;
      if (!hafs || hafs.length === 0) continue;
      aligned.push({ surah: s, ayah: a, text: v.text!, hafs });
    }
  }
  const total = counts.reduce((n, c) => n + c, 0);

  if (aligned.length === total) {
    const content = checkAgainstHafs(aligned);
    if (!content.ok) return fail(content.error);
    checked = {
      kind: 'aligned',
      groups: content.groups,
      splits: content.splits,
      merges: content.merges,
      mean: content.mean,
    };
  } else {
    if (aligned.length > 0) {
      return fail(
        `${total - aligned.length} of ${total} ayahs do not say which ` +
          'Qur’an ayah they are. A file may state that for all of them or ' +
          'for none, not for some.',
      );
    }
    if (total !== TOTAL_AYAHS) {
      return fail(
        `expected ${TOTAL_AYAHS} ayahs, found ${total}. ` +
          'This is not the whole Qur’an and will not be used.',
      );
    }
    for (let s = 1; s <= 114; s++) {
      if (counts[s - 1] !== ayahsIn(s)) {
        return fail(
          `surah ${s} has ${counts[s - 1]} ayahs, expected ${ayahsIn(s)}`,
        );
      }
    }
  }

  // ── Pagination ──────────────────────────────────────────────────────
  const pageOf = (s: number, a: number) => at(s, a).page_number!;

  let lastPage = 0;
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= counts[s - 1]; a++) {
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
    for (let a = 1; a <= counts[s - 1]; a++) seen.add(pageOf(s, a));
  }
  for (let p = 1; p <= totalPages; p++) {
    if (!seen.has(p)) return fail(`page ${p} has no ayahs on it`);
  }

  /**
   * Which juz each ayah is in, with the gaps carried forward.
   *
   * Quranpedia leaves `juz` at 0 for the ayahs a riwayah has and Ḥafṣ does
   * not — 26 of them in Warsh, every one the tail of a surah where this
   * numbering runs past the Kufan count. Their juz is the juz of the ayah
   * before, because a juz boundary never falls at the end of a surah that
   * the next juz does not also begin. Refusing the file over 26 zeroes
   * would be refusing a muṣḥaf over an omission the app can repair
   * exactly; inventing a juz where the run is genuinely ambiguous would
   * not be, so the check below still insists the result runs 1…30 forward.
   */
  const juzOfAyah = new Map<string, number>();
  let running = 0;
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= counts[s - 1]; a++) {
      const stated = at(s, a).juz_number;
      if (typeof stated === 'number' && stated > 0) {
        if (stated < running) {
          return fail(`juz goes backwards at ${s}:${a} (${running} → ${stated})`);
        }
        running = stated;
      }
      juzOfAyah.set(`${s}:${a}`, running || 1);
    }
  }
  const juzOf = (s: number, a: number) => juzOfAyah.get(`${s}:${a}`) ?? 1;

  // ── Build what the reader reads ─────────────────────────────────────
  const firstOf = new Map<number, { surah: number; ayah: number }>();
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= counts[s - 1]; a++) {
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
    for (let a = 1; a <= counts[s - 1]; a++) {
      text[`${s}:${a}`] = at(s, a).text!.trim();
    }
  }

  // The sixty-anchor check, for a file that carried no mapping. One that
  // did has already been read at every ayah, which subsumes this.
  if (!checked && hafsPages && hafsPages.length > 0) {
    const content = checkJuzBoundaries(text, ref => juzOf(ref.surah, ref.ayah), hafsPages);
    if (!content.ok) return fail(content.error);
    checked = { kind: 'anchors', mean: content.mean };
  }

  return {
    ok: true,
    totalPages,
    checked,
    dataset: {
      pages,
      // The surah index is the Hafs one: they are the same 114 names, and
      // inventing a second spelling here would be a difference nobody
      // asked for and nobody could explain. The COUNTS beside it are this
      // riwayah's own, because those genuinely differ.
      surahs: [...surahs],
      ayahCounts: counts,
      text,
    },
  };
}
