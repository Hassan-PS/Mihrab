/**
 * Text that does not run the way the layout does.
 *
 * ── THE SITUATION ─────────────────────────────────────────────────────
 *
 * The app mirrors itself for Arabic and Urdu. Most of what it then draws
 * is Arabic or Urdu, and mirroring is exactly right. But some of it is
 * not, and cannot be:
 *
 *   • a dua's Latin transliteration, which is Latin by definition — it
 *     exists FOR the reader who cannot read the Arabic line above it;
 *   • a dua's meaning, which is bundled in English for every language;
 *   • a release note for the ten languages with no translated ones.
 *
 * Laid out by the mirrored tree, an English paragraph hugs the right edge
 * with a ragged left one, the bullet sits on the right of the text, and
 * the bidi algorithm puts the full stop at the START of the line —
 * because in a right-to-left paragraph that is where a line ends. It is
 * not subtly wrong; it is most of a page of English set backwards.
 *
 * ── THE FIX, AND WHY IT IS NOT ONE LINE ───────────────────────────────
 *
 * Three things, each needed, and the third is the one that surprises:
 *
 *   1. `writingDirection`, which iOS honours and Android ignores;
 *   2. a directional ISOLATE around the text, so the punctuation at its
 *      ends belongs to the run rather than to the paragraph — this is
 *      what Android needs in place of (1);
 *   3. `textAlign`, and the value is `right`. Not `left`.
 *
 * Neither platform treats `left`/`right` as physical once a layout is
 * mirrored. iOS mirrors the word against the LAYOUT direction: under a
 * right-to-left layout `right` means the left edge. Android mirrors it
 * against the TEXT direction whenever that disagrees with the layout's,
 * which is precisely this case, and there `right` resolves to the text's
 * own normal edge — the left, for English. Two different rules; in the
 * one situation this module is for, both send `right` to the same place.
 * `left` goes the other way on both. Checked on an emulator and a
 * simulator, both words, rather than reasoned about.
 *
 * None of it fires when the two directions agree, which is every other
 * reader: there the tree's own direction is already correct, and
 * `i18n/layoutDirection.ts` asks that nothing inside a mirrored tree
 * mirror itself a second time.
 */
import type { TextStyle } from 'react-native';
import { isRtlLanguage } from './layoutDirection';

/** LEFT-TO-RIGHT ISOLATE, RIGHT-TO-LEFT ISOLATE, POP DIRECTIONAL ISOLATE.
 *  By code point rather than as themselves: an invisible character in
 *  source is a character nobody can see to review. */
export const LRI = String.fromCharCode(0x2066);
export const RLI = String.fromCharCode(0x2067);
export const PDI = String.fromCharCode(0x2069);

/**
 * The alignment that puts text against its OWN starting edge when the
 * layout runs the other way. See the header for why it is not `left`.
 */
export const ALIGN_TO_OWN_SIDE = 'right' as const;

export type ForeignText = {
  /** True when the text and the layout disagree — nothing else fires otherwise. */
  mismatched: boolean;
  /** Goes on the `<Text>`, after its own styles. Null when nothing is needed. */
  style: TextStyle | null;
  /** The Text's FIRST child, before any run. Empty when nothing is needed. */
  open: string;
  /** The Text's LAST child. Empty when nothing is needed. */
  close: string;
};

const AGREES: ForeignText = {
  mismatched: false,
  style: null,
  open: '',
  close: '',
};

/**
 * How to set `textLanguage` for a reader reading in `readerLanguage`.
 *
 * Both are language codes — `'en'`, `'ur'`, `'ar'`, or anything i18next
 * hands back including a regional one. Only their DIRECTIONS are
 * compared, so an English note read in Swedish is not "foreign" here and
 * gets nothing.
 */
export function foreignText(
  textLanguage: string | null | undefined,
  readerLanguage: string | null | undefined,
): ForeignText {
  const textIsRtl = isRtlLanguage(textLanguage);
  if (textIsRtl === isRtlLanguage(readerLanguage)) return AGREES;
  return {
    mismatched: true,
    style: {
      writingDirection: textIsRtl ? 'rtl' : 'ltr',
      textAlign: ALIGN_TO_OWN_SIDE,
    },
    open: textIsRtl ? RLI : LRI,
    close: PDI,
  };
}
