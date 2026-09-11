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

/**
 * ── ONE WEIGHT, NOT ONE SIZE — the names are 114 separate drawings ────
 *
 * The Complex's calligraphers drew each name on its own, to fill the
 * header of a printed page, so the drawings differ in the weight of the
 * pen as well as in length: measured off the outlines, the main stroke
 * of ٱلْبَقَرَة is 1.94 px at 34 pt where ٱلنِّسَاء is 1.42 — a difference of
 * three eighths, and the two sit four rows apart in the list. It read as
 * some names being bold and others light, which was reported as exactly
 * that.
 *
 * A drawing cannot be un-bolded without redrawing it, and these are not
 * ours to redraw. What a printer would do instead is set the heavier
 * ones a little smaller, and that is what this table is: a size per
 * name, chosen so the stroke lands near the LIGHTEST the font offers
 * (the reported end to aim for), with a limit on how far any name may
 * shrink — the pull towards one weight is traded against the pull
 * towards one size, since the two are unrelated in these drawings
 * (correlation 0.06) and no single size can satisfy both.
 *
 * Measured with a distance transform over each rasterised glyph — the
 * 85th percentile of twice the distance-to-edge, which is the main
 * strokes rather than the hair-thin vowel marks. The spread of weights
 * across the 114 goes from ×1.37 to ×1.20; nothing grows, so no name can
 * outgrow the room the row measured for it, and nothing falls below 28.
 * The line height does NOT follow the size (`surahHeaderStyle`): the
 * rows of the list are the same height whichever name they carry.
 */
const SURAH_NAME_SIZES: readonly number[] = [
  29, 28, 30, 34, 34, 32, 32, 33, 34, 34,  // 1–10
  30, 34, 31, 33, 29, 30, 34, 31, 32, 34,  // 11–20
  30, 32, 30, 32, 32, 34, 34, 34, 34, 34,  // 21–30
  34, 33, 31, 33, 33, 34, 34, 32, 32, 32,  // 31–40
  33, 32, 31, 33, 32, 29, 30, 31, 29, 34,  // 41–50
  34, 32, 31, 29, 29, 29, 30, 31, 31, 30,  // 51–60
  32, 30, 33, 34, 34, 31, 32, 33, 31, 30,  // 61–70
  30, 31, 34, 33, 31, 33, 32, 32, 34, 34,  // 71–80
  29, 32, 30, 31, 31, 34, 31, 34, 29, 32,  // 81–90
  32, 34, 30, 31, 33, 31, 33, 34, 34, 33,  // 91–100
  33, 31, 31, 30, 33, 29, 31, 29, 30, 32,  // 101–110
  32, 31, 32, 34,  // 111–114
];

/** The size this name is set at — see the table above. */
export function surahNameSize(surahNumber: number): number {
  return SURAH_NAME_SIZES[surahNumber - 1] ?? SURAH_NAME_SIZE;
}

export function surahHeaderStyle(surahNumber?: number): TextStyle {
  return {
    fontFamily: SURAH_HEADER_FONT,
    fontSize: surahNumber ? surahNameSize(surahNumber) : SURAH_NAME_SIZE,
    // The BASE size's line height, always: a name set smaller than the
    // base must not make its row shorter than its neighbours'.
    lineHeight: Math.round(SURAH_NAME_SIZE * 1.35),
    includeFontPadding: false,
  };
}
