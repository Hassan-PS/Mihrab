/**
 * Which tokens of an ayah's Tanzil text the word-timing data counts.
 *
 * The timing data (cpfair/quran-align) numbers words the way QPC does —
 * checked against the layout, ayah for ayah: 36:1 is one word, 36:11
 * twelve, 36:12 fourteen. The translation view draws the Tanzil text and
 * splits it on spaces, and Tanzil differs from that count in exactly two
 * ways:
 *
 *   • a pause mark — ۖ ۚ ۗ ۜ and the rest of U+06D6–U+06ED — stands as a
 *     token of its own between two spaces, where QPC attaches it to the
 *     word before it;
 *   • the first ayah of every surah but the first and the ninth opens
 *     with the basmalah, four words the timing data does not count.
 *
 * So the lit word was one off for the rest of any ayah with a pause mark
 * in it — about a quarter of them — and the basmalah lit up at the start
 * of every surah while the reciter was on its first word. This maps the
 * timing's index onto the token it means.
 */

/**
 * Quranic annotation signs (U+06D6–U+06ED) and the small high marks
 * (U+0610–U+061A): a token that is only these. Escaped rather than
 * written, because a right-to-left range inside a left-to-right regex
 * reorders on its way through most editors.
 */
const PAUSE_MARK = /^[\u0610-\u061A\u06D6-\u06ED]+$/;

/** Everything but the letters — vowels, marks, the superscript alef. */
const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/** Alef wasla (U+0671) reads as alef for the comparison. */
const strip = (token: string) =>
  token.replace(MARKS, '').replace(/\u0671/g, '\u0627');

/** بسم الله — the first two words, without their vowels. */
const BASMALAH_1 = '\u0628\u0633\u0645';
const BASMALAH_2 = '\u0627\u0644\u0644\u0647';

export function startsWithBasmalah(words: readonly string[]): boolean {
  return (
    words.length >= 5 &&
    strip(words[0]) === BASMALAH_1 &&
    strip(words[1]) === BASMALAH_2
  );
}

/**
 * The indices, into `words`, of the tokens the timing data counts — in the
 * order it counts them. `counted[wordIndex]` is the token to light.
 */
export function countedWordIndices(
  surah: number,
  ayah: number,
  words: readonly string[],
): number[] {
  const out: number[] = [];
  const start =
    ayah === 1 && surah !== 1 && surah !== 9 && startsWithBasmalah(words)
      ? 4
      : 0;
  for (let i = start; i < words.length; i++) {
    if (!PAUSE_MARK.test(words[i])) out.push(i);
  }
  return out;
}
