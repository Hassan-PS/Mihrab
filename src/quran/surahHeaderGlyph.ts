/**
 * Surah names as a muṣḥaf writes them — the name in the calligrapher's
 * hand, vocalised, and nothing else.
 *
 * `SurahNames.ttf` holds one pre-composed glyph per surah NAME — "ٱلْبَقَرَة",
 * not "سُورَةُ ٱلْبَقَرَة" — in the King Fahd Glorious Qur'an Printing
 * Complex's calligraphy, the glyphs quran.com draws its chapter titles
 * with. There is no shaping and no text in it: 114 drawings, each mapped
 * to a private-use code point, so a name is looked up by number, never
 * typed. It was rebuilt from quran.com's `sura_names.ttf` (MIT-licensed
 * repository; glyphs © KFGQPC), which reaches each name through a digit
 * ligature ("001" → glyph): the ligatures were resolved and each glyph
 * given a direct code point, so rendering does not depend on `liga`, and
 * the digits and unused glyphs were dropped. 151 KB.
 *
 * THE ADVANCES WERE WIDENED. As shipped by quran.com, several glyphs draw
 * past their own advance width — Yūsuf by a quarter of an em, so the
 * first letter of the name (its rightmost, the ي) fell outside the box a
 * Text measures for it and was cut off; a dozen more overhang by a hair.
 * Every glyph's advance is now its ink's right edge plus 40 units (about
 * a point at this size), so no name is clipped and every name keeps the
 * same margin. The drawings themselves are untouched.
 *
 * Why not the Complex's header font (QCF4_QBSML), which the reader's own
 * pages use above each surah: those headers are drawn as one piece with
 * the word سورة, whose tail sweeps under the name — the word cannot be
 * cut out, and a list that already says "Al-Baqarah" does not want to say
 * "Surah" 114 times. Asked for by name: the name alone.
 *
 * Licensing: KFGQPC permits use in software (dm.qurancomplex.gov.sa/
 * copyright-2), the same terms the QCF2 page fonts ship under — see
 * docs/mushaf-font-rendering-plan.md §Licensing. Credited in Attributions.
 *
 * A glyph is meaningless to a screen reader: every use must carry the
 * name as text in an accessibility label, or sit inside an element that
 * already does.
 */
import type { TextStyle } from 'react-native';

/** Family name and asset filename are the same. */
export const SURAH_HEADER_FONT = 'SurahNames';

/** Surah 1 at U+F100 … surah 114 at U+F171. */
const FIRST_CODEPOINT = 0xf100;

/** The name glyph for a surah, 1–114. Empty for anything else. */
export function surahHeaderGlyph(surahNumber: number): string {
  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) return '';
  return String.fromCodePoint(FIRST_CODEPOINT + surahNumber - 1);
}

/**
 * ONE size, everywhere the name appears — the Quran list, its juz rows,
 * the Tilawah hero and its list. The name is the same drawing wherever it
 * is met, so it is met at the same size; a list that showed it at three
 * sizes would be three different things. The glyphs sit on the baseline
 * with their marks reaching 0.85 em above it and almost nothing below;
 * Android's extra font padding is off so the name does not float high in
 * its row. Widest name ≈ 2.7 em (Al-ʿAnkabūt) → 92 dp.
 */
export const SURAH_NAME_SIZE = 34;

export function surahHeaderStyle(): TextStyle {
  return {
    fontFamily: SURAH_HEADER_FONT,
    fontSize: SURAH_NAME_SIZE,
    lineHeight: Math.round(SURAH_NAME_SIZE * 1.35),
    includeFontPadding: false,
  };
}
