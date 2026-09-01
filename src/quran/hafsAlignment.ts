/**
 * Is this the Qur'an? — asked of every ayah, not sixty of them.
 *
 * ── WHY THIS REPLACES THE SIXTY ANCHORS, WHERE IT CAN ─────────────────
 *
 * `juzCheck.ts` reads a candidate muṣḥaf at the first and last ayah of
 * each juz, because those were the only places where a riwayah with its
 * own ayah numbering could be lined up against the Ḥafṣ text this app
 * ships and trusts. Sixty places out of 6,236 is a thin gate, and it was
 * built thin for a reason: without a mapping between the two numberings,
 * ayah N of one is simply not ayah N of the other, and comparing them
 * fails the real Qur'an rather than a fake one.
 *
 * Quranpedia's muṣḥafs carry that mapping. Every ayah states which Ḥafṣ
 * ayahs of its own surah it corresponds to — one, usually; two or three
 * where this riwayah merges them; and the same one twice where it splits.
 * With that, the whole book can be checked, and it is.
 *
 * ── WHY A GROUP AND NOT AN AYAH ───────────────────────────────────────
 *
 * A riwayah that splits a Ḥafṣ ayah gives each half only part of that
 * ayah's words, and half an ayah scores about 45% against the whole of
 * one — which reads exactly like corruption and is nothing of the kind.
 * So the unit of comparison is the smallest span where the two numberings
 * agree: consecutive ayahs are drawn into one group until the Ḥafṣ ayahs
 * they lay claim to are used up. Merges and splits both come out whole,
 * and nothing is ever judged against a reference it is only part of.
 *
 * Measured against the KFGQPC Warsh muṣḥaf, the 6,214 ayahs form 6,155
 * groups — 59 splits, 78 merges — and agree with the bundled Ḥafṣ text to
 * a mean of 98.5%, with no group below 50%. Against something that is not
 * the Qur'an the mean is near zero. The thresholds below sit in the wide
 * gap between those two numbers, which is where a threshold should sit.
 *
 * ── AND WHY COVERAGE IS THE COMPLETENESS PROOF ────────────────────────
 *
 * `riwayahImport.ts` used to prove a file was the whole Qur'an by counting
 * 6,236 ayahs. That test is wrong for any riwayah that does not use the
 * Kufan division — Warsh has 6,214, and 22 fewer is not 22 missing. The
 * honest test is here: the Ḥafṣ ayahs the file claims must cover every
 * surah's count exactly, in order, with nothing skipped and nothing out of
 * place. A file short of an ayah cannot satisfy it whatever its own total
 * happens to be.
 */
import { bundledSurahArabic } from './quran';
import { ayahCount } from './ayahIndex';
import {
  skeleton,
  stripBasmalah,
  startsWithBasmalah,
  textAgreement,
} from './juzCheck';

/** One ayah of a candidate muṣḥaf, with the Ḥafṣ ayahs it stands for. */
export type AlignedVerse = {
  surah: number;
  ayah: number;
  text: string;
  /** Ḥafṣ ayah numbers WITHIN THE SAME SURAH. Never empty. */
  hafs: readonly number[];
};

export type AlignmentResult =
  | { ok: true; mean: number; groups: number; splits: number; merges: number }
  | { ok: false; error: string };

/**
 * The mean the whole book must clear.
 *
 * A real riwayah measures ~98.5%. Deliberately far below that and far
 * above what any non-scripture reaches, because this is a question with a
 * very loud answer and should never be a close call.
 */
export const MIN_CORPUS_MEAN = 0.85;

/** Consecutive ayahs that share a span of Ḥafṣ ayahs, and that span. */
type Group = { verses: AlignedVerse[]; hafs: number[] };

export function groupBySharedSpan(
  verses: readonly AlignedVerse[],
): Group[] {
  const groups: Group[] = [];
  let i = 0;
  while (i < verses.length) {
    const surah = verses[i].surah;
    const hafs = new Set<number>(verses[i].hafs);
    const group = [verses[i]];
    let j = i + 1;
    // Absorb the next ayah while it still lays claim to a Ḥafṣ ayah this
    // group has already begun — that is what a split looks like from this
    // side, and half an ayah must never be judged against the whole.
    while (
      j < verses.length &&
      verses[j].surah === surah &&
      Math.min(...verses[j].hafs) <= Math.max(...hafs)
    ) {
      verses[j].hafs.forEach(n => hafs.add(n));
      group.push(verses[j]);
      j += 1;
    }
    groups.push({ verses: group, hafs: [...hafs].sort((a, b) => a - b) });
    i = j;
  }
  return groups;
}

/**
 * Does the file account for every Ḥafṣ ayah, in order?
 *
 * Returns the first thing wrong, or null. This is the completeness check;
 * the content check below assumes it has already passed.
 */
export function coversHafs(verses: readonly AlignedVerse[]): string | null {
  const bySurah = new Map<number, number[]>();
  for (const v of verses) {
    if (v.hafs.length === 0) return `${v.surah}:${v.ayah} says which Qur’an ayah it is`;
    const claimed = bySurah.get(v.surah) ?? [];
    claimed.push(...v.hafs);
    bySurah.set(v.surah, claimed);
  }
  for (let surah = 1; surah <= 114; surah++) {
    const claimed = bySurah.get(surah);
    if (!claimed) return `surah ${surah} is missing entirely`;
    for (let k = 1; k < claimed.length; k++) {
      if (claimed[k] < claimed[k - 1]) {
        return `surah ${surah} goes backwards at ayah ${claimed[k]}`;
      }
    }
    const distinct = [...new Set(claimed)];
    const expected = ayahCount(surah);
    if (distinct.length !== expected) {
      return (
        `surah ${surah} accounts for ${distinct.length} of the Qur’an’s ` +
        `${expected} ayahs there. This is not the whole Qur’an and will not be used.`
      );
    }
    for (let k = 0; k < distinct.length; k++) {
      if (distinct[k] !== k + 1) {
        return `surah ${surah} skips ayah ${k + 1}`;
      }
    }
  }
  return null;
}

/**
 * Read every ayah against the Ḥafṣ it claims to be.
 *
 * The reference for a group is the bundled text of the Ḥafṣ ayahs it
 * covers, joined. Where that reference opens with a basmalah the candidate
 * does not have, the basmalah is dropped from it: whether the basmalah is
 * an ayah of al-Fātiḥah is a question about the counting madhhab, not
 * about the text, and the Kufan count answers it differently from the
 * Madani one. Dropping it unconditionally is what once failed the real
 * Qur'an at 1:1, by leaving the reference empty.
 */
export function checkAgainstHafs(
  verses: readonly AlignedVerse[],
): AlignmentResult {
  const missing = coversHafs(verses);
  if (missing) return { ok: false, error: missing };

  const groups = groupBySharedSpan(verses);
  let total = 0;
  let counted = 0;
  let splits = 0;
  let merges = 0;

  for (const group of groups) {
    if (group.verses.length > 1) splits += 1;
    if (group.hafs.length > 1) merges += 1;

    const surah = group.verses[0].surah;
    const bundled = bundledSurahArabic(surah);
    // No reference for this surah means this build cannot judge it. Skip
    // rather than fail: refusing a real muṣḥaf because our own corpus is
    // incomplete would be the wrong way round.
    if (!bundled) continue;

    const reference = group.hafs
      .map(n => bundled[n - 1] ?? '')
      .filter(Boolean)
      .join(' ');
    if (!reference) continue;

    const candidate = skeleton(group.verses.map(v => v.text).join(' '));
    let wanted = skeleton(reference);
    if (startsWithBasmalah(wanted) && !startsWithBasmalah(candidate)) {
      const bare = stripBasmalah(wanted);
      if (bare) wanted = bare;
    }
    if (!wanted) continue;

    const { score: overlap, floor } = textAgreement(wanted, candidate);
    if (overlap < floor) {
      const where =
        group.verses.length > 1
          ? `${surah}:${group.verses[0].ayah}–${group.verses[group.verses.length - 1].ayah}`
          : `${surah}:${group.verses[0].ayah}`;
      return {
        ok: false,
        error:
          `the text at ${where} does not read like that ayah ` +
          `(${Math.round(overlap * 100)}% of its words). ` +
          'This file is not the Qur’an and will not be used.',
      };
    }
    total += overlap;
    counted += 1;
  }

  if (counted === 0) {
    return { ok: false, error: 'this build has no reference text to check against' };
  }
  const mean = total / counted;
  if (mean < MIN_CORPUS_MEAN) {
    return {
      ok: false,
      error:
        `read against the Qur’an this file keeps only ${Math.round(mean * 100)}% ` +
        'of its words. It will not be used.',
    };
  }
  return { ok: true, mean, groups: groups.length, splits, merges };
}
