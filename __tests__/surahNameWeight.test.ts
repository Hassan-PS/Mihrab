/**
 * The surah names are one weight, or as near as 114 drawings allow.
 *
 * Reported as "some are bold and some are light": the Complex drew each
 * name on its own, and the pen is heavier in some than in others — the
 * main stroke of ٱلْبَقَرَة measures 1.94 px at 34 pt where ٱلنِّسَاء measures
 * 1.42, and the two sit four rows apart in the list. The drawings are not
 * ours to redraw, so the heavier ones are SET SMALLER, the way a printer
 * would even a page up (`SURAH_NAME_SIZES`).
 *
 * What is pinned here is the table's shape and the rules it must keep —
 * the measurements themselves were taken off the font with a distance
 * transform and are quoted in `surahHeaderGlyph.ts`. `WEIGHT` below is
 * that measurement per surah, in ems, so this test can check the table
 * actually evens the weights out rather than trusting that it did.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SURAH_NAME_SIZE,
  surahHeaderGlyph,
  surahHeaderStyle,
  surahNameSize,
} from '../src/quran/surahHeaderGlyph';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/**
 * Main-stroke thickness per surah, in ems × 10⁴ — twice the 85th
 * percentile of the distance-to-edge over each rasterised glyph, which
 * is the letters rather than the hair-thin vowel marks.
 */
const WEIGHT = [
  527, 571, 486, 417, 417, 425, 425, 417, 417, 417, 500, 417, 471, 449, 500,
  486, 417, 471, 449, 417, 471, 449, 486, 449, 449, 417, 417, 417, 425, 417,
  417, 425, 449, 417, 425, 417, 417, 449, 449, 417, 449, 449, 471, 425, 449,
  500, 500, 486, 523, 425, 417, 449, 486, 486, 500, 507, 507, 486, 471, 486,
  449, 500, 425, 417, 417, 449, 449, 417, 486, 486, 500, 471, 425, 425, 486,
  425, 449, 449, 417, 425, 486, 449, 500, 471, 471, 417, 449, 417, 500, 425,
  449, 417, 500, 471, 417, 471, 449, 417, 417, 449, 449, 449, 471, 500, 425,
  486, 486, 486, 486, 449, 449, 471, 449, 417,
] as const;

/** How thick that name's main stroke lands once the table has set it. */
const rendered = (surah: number) => (WEIGHT[surah - 1] / 1e4) * surahNameSize(surah);

const spread = (values: number[]) => Math.max(...values) / Math.min(...values);
const all = Array.from({ length: 114 }, (_, i) => i + 1);

describe('the table', () => {
  it('names every surah and nothing else', () => {
    for (const n of all) {
      expect(Number.isInteger(surahNameSize(n))).toBe(true);
    }
    // Out of range falls back to the base rather than to NaN — the juz
    // rows ask for a surah they may not have.
    expect(surahNameSize(0)).toBe(SURAH_NAME_SIZE);
    expect(surahNameSize(115)).toBe(SURAH_NAME_SIZE);
  });

  it('never grows a name past the size the row was built for', () => {
    // The row measures the widest name at the base size (92 dp). A name
    // set LARGER than the base could outgrow that and be cut off, which
    // is the other half of what was reported.
    for (const n of all) {
      expect(surahNameSize(n)).toBeLessThanOrEqual(SURAH_NAME_SIZE);
    }
  });

  it('never shrinks one so far that it reads as a different size', () => {
    for (const n of all) {
      expect(surahNameSize(n)).toBeGreaterThanOrEqual(Math.round(SURAH_NAME_SIZE * 0.82));
    }
  });
});

describe('the weights', () => {
  it('are closer together than the drawings are', () => {
    const before = spread(all.map(n => WEIGHT[n - 1] / 1e4));
    const after = spread(all.map(rendered));
    expect(before).toBeGreaterThan(1.35);
    expect(after).toBeLessThan(1.22);
    expect(after).toBeLessThan(before);
  });

  it('land on the light end, never past the heaviest drawing', () => {
    const lightest = Math.min(...all.map(n => WEIGHT[n - 1] / 1e4)) * SURAH_NAME_SIZE;
    for (const n of all) {
      expect(rendered(n)).toBeGreaterThanOrEqual(lightest * 0.9);
      expect(rendered(n)).toBeLessThanOrEqual(lightest * 1.2);
    }
  });

  it('takes the most off the heaviest names, and leaves the lightest alone', () => {
    // Al-Baqarah is the heaviest drawing in the font, An-Nisāʾ among the
    // lightest: one is set smaller and the other is not touched.
    expect(surahNameSize(2)).toBeLessThan(surahNameSize(4));
    expect(surahNameSize(4)).toBe(SURAH_NAME_SIZE);
    expect(surahNameSize(1)).toBeLessThan(SURAH_NAME_SIZE);
  });
});

describe('the row', () => {
  it('is the same height whichever name it carries', () => {
    // Only the size follows the name; the line height is the base's, so a
    // list of 114 rows does not ripple.
    const heights = all.map(n => surahHeaderStyle(n).lineHeight);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBe(surahHeaderStyle().lineHeight);
  });

  it('sets each name at its own size, in every list that draws one', () => {
    for (const file of [
      'src/screens/QuranScreen.tsx',
      'src/screens/quran/TilawahScreen.tsx',
    ]) {
      const src = read(file);
      const glyphs = src.match(/surahHeaderGlyph\(/g)?.length ?? 0;
      const sizes = src.match(/surahNameSize\(/g)?.length ?? 0;
      expect(glyphs).toBeGreaterThan(0);
      expect(sizes).toBe(glyphs);
    }
  });

  it('still draws one glyph per surah', () => {
    expect(surahHeaderGlyph(1)).toBe(String.fromCodePoint(0xf100));
    expect(surahHeaderGlyph(114)).toBe(String.fromCodePoint(0xf171));
    expect(surahHeaderGlyph(115)).toBe('');
  });
});
