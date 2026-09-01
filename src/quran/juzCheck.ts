/**
 * Is this actually the Qur'an? — checked at the sixty places a reader knows.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * `riwayahImport.ts` proves a dataset has the SHAPE of a Qur'an: 6236
 * ayahs, 114 surahs, every count exact, pages that run forwards. It said,
 * in as many words, that what it could not check was whether correct-shaped
 * Arabic is the real thing — "that is a human's job".
 *
 * That was true and it was not good enough. A file that passes every
 * structural check and contains something else entirely renders as a
 * muṣḥaf: surah band, juz label, ayah medallions, page number, the lot.
 * Nothing about the screen tells the reader that what they are reading is
 * not the Qur'an. That is the worst failure this app has available to it,
 * and leaving it to a human who may never look is not a defence.
 *
 * ── WHY THE JUZ BOUNDARIES ────────────────────────────────────────────
 *
 * The app already ships a Qur'an it is entitled to trust: the Tanzil Hafs
 * text, whose bytes `quranIntegrity.test.ts` hashes. A second riwayah is
 * the SAME Qur'an in a different orthography — the recitations differ in
 * how words are voiced and spelled, not in which words they are — so every
 * ayah of a genuine Warsh text is recognisably its Hafs counterpart.
 *
 * Sixty of them are checked: the first and last ayah of each of the thirty
 * ajzāʾ. They are spread evenly through the whole book, they are the
 * places a ḥāfiẓ can recite from memory, and they are exactly where a
 * dataset that is misaligned by an ayah — the failure that looks most
 * plausible on screen — gives itself away.
 *
 * Two things are checked at each, and they catch different faults:
 *
 *   • the dataset's own `juz_number` must put the juz boundary where the
 *     Qur'an puts it. A file shifted by one ayah passes every count in
 *     `riwayahImport` and fails here.
 *   • the TEXT there must be recognisably the same ayah. This is what
 *     refuses a file that is well-formed and simply is not scripture.
 *
 * ── AND WHY IT IS A SIMILARITY, NOT AN EQUALITY ───────────────────────
 *
 * Warsh is not Hafs. It differs in orthography at real places and would
 * fail any exact comparison, so the test is how much of the reference
 * ayah's vocabulary survives once the marks are stripped. A genuine Warsh
 * ayah keeps nearly all of it; text that is not the Qur'an keeps almost
 * none. The thresholds below are set far apart on purpose — this is a
 * question with a very loud answer, and it should never be a close call.
 */
import { bundledSurahArabic } from './quran';
import { ayahCount } from './ayahIndex';
import type { MushafPageRange } from './pages';

export const JUZ_COUNT = 30;

export type AyahRef = { surah: number; ayah: number };

/**
 * The first ayah of each juz, from the muṣḥaf table the app already ships.
 *
 * Derived rather than typed out: the thirty boundaries are already stated
 * in `data/pages.json`, and a second hand-written copy of them is a second
 * thing that can be wrong. The last ayah of a juz is simply the one before
 * the next juz begins, and juz 30 ends where the Qur'an does.
 */
export function juzStarts(pages: ReadonlyArray<MushafPageRange>): AyahRef[] {
  const starts: AyahRef[] = [];
  for (let juz = 1; juz <= JUZ_COUNT; juz++) {
    const page = pages.find(p => p.juz === juz);
    if (!page) return [];
    starts.push({ ...page.start });
  }
  return starts;
}

/** The ayah immediately before `ref`, or null at the very beginning. */
function previousAyah(ref: AyahRef): AyahRef | null {
  if (ref.ayah > 1) return { surah: ref.surah, ayah: ref.ayah - 1 };
  if (ref.surah <= 1) return null;
  return { surah: ref.surah - 1, ayah: ayahCount(ref.surah - 1) };
}

/** The sixty anchors: `[first, last]` of each juz, in order. */
export function juzAnchors(
  pages: ReadonlyArray<MushafPageRange>,
): Array<{ juz: number; first: AyahRef; last: AyahRef }> {
  const starts = juzStarts(pages);
  if (starts.length !== JUZ_COUNT) return [];
  return starts.map((first, i) => ({
    juz: i + 1,
    first,
    last:
      i + 1 < JUZ_COUNT
        ? (previousAyah(starts[i + 1]) ?? first)
        : { surah: 114, ayah: ayahCount(114) },
  }));
}

/**
 * Marks that are drawn but carry no letter: the ḥarakāt, the Qur'anic
 * annotation signs, the waqf and sajdah marks, the extended set, plus
 * tatweel and the ayah-end sign. Written as escapes for the reason
 * `MushafUnicodePage` gives: an isolated combining character in source
 * pastes and diffs unpredictably.
 *
 * NOT the dagger alif, U+0670, which this deleted until a real Warsh
 * muṣḥaf was measured against a real Ḥafṣ one. Warsh writes the alif of
 * prolongation as a dagger where Ḥafṣ writes it in full — ʿaynān as
 * عَيْنَٰنِ against عَيْنَانِ — so deleting it turned a correct Warsh
 * spelling into a word that matched nothing, and short ayahs made of two
 * or three such words scored 0% against themselves. It is folded to a
 * plain alif below instead.
 */
const MARKS =
  /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF\u0640\u200C-\u200F]/g;

/**
 * The basmalah, as the bundled files prefix it to every surah but 9.
 *
 * `\u0627?` in al-raḥmān because `skeleton` now folds the dagger alif to a
 * full one rather than dropping it, so the word arrives here spelled
 * either way depending on the edition.
 */
const BASMALAH_PREFIX =
  /^\u0628\u0633\u0645\s*\u0627\u0644\u0644\u0647\s*\u0627\u0644\u0631\u062D\u0645\u0627?\u0646\s*\u0627\u0644\u0631\u062D\u064A\u0645\s*/;

/**
 * Reduce an ayah to the letters it is made of.
 *
 * Alif, ya and hamza are written several ways across editions and the
 * differences are orthographic rather than lexical, so they are folded
 * together. What is left is close to the rasm, which is what the two
 * riwayat genuinely share.
 */
export function skeleton(text: string): string {
  return (
    text
      .replace(MARKS, '')
      // alif in all its spellings
      .replace(/[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/g, '\u0627')
      // the dagger alif IS an alif — see MARKS above
      .replace(/\u0670/g, '\u0627')
      // ya, alif maqsura, farsi ya, yeh barree, e
      //
      // U+06D2 is the second thing the Warsh measurement found: it ends
      // words there where Ḥafṣ uses a plain ya — fī as فے against في — so
      // without it every such word missed.
      .replace(/[\u0649\u06CC\u06D2\u06D0]/g, '\u064A')
      // bare and seated hamza carry no consonant of their own here
      .replace(/[\u0624\u0626\u0621]/g, '')
      // ta marbuta reads as ha
      .replace(/\u0629/g, '\u0647')
      // anything that is not Arabic or a space — digits, punctuation,
      // the verse-key numbers a placeholder file is full of
      .replace(/[^\u0600-\u06FF\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * The reference ayah, reduced, with its basmalah prefix taken off.
 *
 * ONLY where the bundled files actually add one: at ayah 1 of every surah
 * except al-Tawbah, which has none, and al-Fātiḥah, whose first ayah IS
 * the basmalah. Stripping it there empties the reference — and an empty
 * reference scored zero, which failed the real Qur'an at 1:1 on the very
 * first run of this check. The bug was worth having: a content check that
 * rejects scripture is worse than no content check at all.
 */
/** Does this reduced text begin with the basmalah? */
export function startsWithBasmalah(bare: string): boolean {
  return BASMALAH_PREFIX.test(bare);
}

/**
 * The same text without its leading basmalah.
 *
 * Returns '' when the basmalah was all there was — al-Fātiḥah's first ayah
 * in the Kufan count — so a caller can tell "nothing left to compare"
 * apart from "nothing to strip", and refuse to judge rather than judge
 * against emptiness.
 */
export function stripBasmalah(bare: string): string {
  return bare.replace(BASMALAH_PREFIX, '').trim();
}

function referenceSkeleton(ref: AyahRef, text: string): string {
  const bare = skeleton(text);
  if (ref.ayah !== 1 || ref.surah === 1 || ref.surah === 9) return bare;
  return bare.replace(BASMALAH_PREFIX, '').trim();
}

/**
 * How much of the reference's vocabulary the candidate keeps, 0..1.
 *
 * A multiset intersection over words rather than an edit distance: the two
 * riwayat differ word by word where they differ at all, and a word-level
 * measure says so in a number that means something when it is printed in
 * an error.
 */
export function vocabularyOverlap(reference: string, candidate: string): number {
  const refWords = reference.split(' ').filter(Boolean);
  if (refWords.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const w of candidate.split(' ').filter(Boolean)) {
    pool.set(w, (pool.get(w) ?? 0) + 1);
  }
  let kept = 0;
  for (const w of refWords) {
    const have = pool.get(w) ?? 0;
    if (have > 0) {
      pool.set(w, have - 1);
      kept += 1;
    }
  }
  return kept / refWords.length;
}

/**
 * How much of the reference's LETTERS survive, in order, 0..1.
 *
 * ── WHY A SECOND MEASURE AT ALL ───────────────────────────────────────
 *
 * `vocabularyOverlap` counts words, and on a three-word ayah it can only
 * answer 0, ⅓, ⅔ or 1. That is not a threshold problem, it is a
 * resolution problem: al-Muddaththir 74:33 reads وَٱلَّيْلِ إِذْ أَدْبَرَ in
 * Ḥafṣ and إِذَا دَبَرَ in other readings — one genuine variant in three
 * words — and the word measure scores that real muṣḥaf at 33%, which is
 * indistinguishable from noise. A check that refuses scripture is worse
 * than no check at all; this file has made that mistake once already.
 *
 * So where the reference is too short for words to say anything useful,
 * the letters are compared instead. A longest-common-subsequence ratio
 * over the bare letters puts إذ أدبر against إذا دبر at over 90% and puts
 * anything that is not that ayah far below.
 */
export function letterOverlap(reference: string, candidate: string): number {
  const a = reference.replace(/\s+/g, '');
  const b = candidate.replace(/\s+/g, '');
  if (a.length === 0) return 0;
  // Two rows rather than a full table: these are single ayahs, but there
  // is no reason to hold n×m of anything.
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1] + 1
          : Math.max(prev[j], cur[j - 1]);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
    cur.fill(0);
  }
  return prev[b.length] / a.length;
}

/**
 * Below this many words, judge by letters instead.
 *
 * Five because a four-word ayah still loses 25% to one variant reading,
 * and the riwayat differ by a word far more often than that.
 */
export const SHORT_REFERENCE_WORDS = 5;

/** And what the letter measure must clear — higher, because it forgives more. */
export const MIN_LETTER_OVERLAP = 0.7;

/**
 * The one number for a reference and a candidate, whichever measure suits.
 */
export function textAgreement(
  reference: string,
  candidate: string,
): { score: number; floor: number } {
  const words = reference.split(' ').filter(Boolean).length;
  if (words < SHORT_REFERENCE_WORDS) {
    return {
      score: letterOverlap(reference, candidate),
      floor: MIN_LETTER_OVERLAP,
    };
  }
  return {
    score: vocabularyOverlap(reference, candidate),
    floor: MIN_ANCHOR_OVERLAP,
  };
}

/**
 * The floor no single anchor may fall below.
 *
 * Warsh and Hafs share far more than this at any given ayah; nothing that
 * is not the Qur'an comes close to it. Deliberately not tuned finely — a
 * threshold that needs tuning is one that will eventually be tuned until
 * it passes whatever was in front of someone.
 */
export const MIN_ANCHOR_OVERLAP = 0.5;

/** And the average the sixty must clear together. */
export const MIN_MEAN_OVERLAP = 0.75;

export type JuzCheckResult = { ok: true; mean: number } | { ok: false; error: string };

/**
 * Check a riwayah's text at the sixty juz boundaries.
 *
 * `text` is keyed `"surah:ayah"`; `juzOf` answers which juz the dataset
 * itself puts an ayah in, so a shifted file is caught before the text is
 * even compared.
 */
export function checkJuzBoundaries(
  text: Record<string, string>,
  juzOf: (ref: AyahRef) => number | null,
  pages: ReadonlyArray<MushafPageRange>,
): JuzCheckResult {
  const anchors = juzAnchors(pages);
  if (anchors.length !== JUZ_COUNT) {
    return { ok: false, error: 'the reference muṣḥaf has no juz table' };
  }

  let total = 0;
  let counted = 0;
  for (const { juz, first, last } of anchors) {
    for (const [where, ref] of [
      ['begins', first],
      ['ends', last],
    ] as const) {
      const key = `${ref.surah}:${ref.ayah}`;
      const candidate = text[key];
      if (!candidate) {
        return { ok: false, error: `juz ${juz} ${where} at ${key}, which this file has no text for` };
      }

      const claimed = juzOf(ref);
      if (claimed !== null && claimed !== juz) {
        return {
          ok: false,
          error: `juz ${juz} ${where} at ${key}, but this file puts that ayah in juz ${claimed}`,
        };
      }

      const surah = bundledSurahArabic(ref.surah);
      const reference = surah?.[ref.ayah - 1];
      // No reference for this ayah means this build cannot judge it. Skip
      // rather than fail: refusing a real muṣḥaf because our own corpus is
      // incomplete would be the wrong way round.
      if (!reference) continue;

      const wanted = referenceSkeleton(ref, reference);
      // Nothing left to compare against — see `referenceSkeleton`. Judging
      // an ayah by an empty reference is how a correct file gets refused.
      if (wanted.length === 0) continue;
      const overlap = vocabularyOverlap(wanted, skeleton(candidate));
      if (overlap < MIN_ANCHOR_OVERLAP) {
        return {
          ok: false,
          error:
            `the text at ${key}, where juz ${juz} ${where}, does not read ` +
            `like that ayah (${Math.round(overlap * 100)}% of its words). ` +
            'This file is not the Qur’an and will not be used.',
        };
      }
      total += overlap;
      counted += 1;
    }
  }

  if (counted === 0) {
    return { ok: false, error: 'this build has no reference text to check against' };
  }
  const mean = total / counted;
  if (mean < MIN_MEAN_OVERLAP) {
    return {
      ok: false,
      error:
        `across the thirty juz boundaries this file keeps only ` +
        `${Math.round(mean * 100)}% of the Qur’an’s words. It will not be used.`,
    };
  }
  return { ok: true, mean };
}
