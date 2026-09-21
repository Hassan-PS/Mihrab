/**
 * Issue #16: on Android the ayah medallion is one finished glyph from
 * MihrabMedallion.ttf, looked up by code point, so no OEM font engine can
 * pull the number out of the rosette. And every bundled face answers every
 * weight, so a bold request never becomes the system's Arabic font.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { ayahMark, ayahMarkText, MEDALLION_FONT } from '../src/quran/MushafUnicodePage';
import { FONTS } from '../src/theme/typography';

const read = (...p: string[]) => readFileSync(path.join(__dirname, '..', ...p));

/** The code points a TrueType cmap maps, from its format-4 subtable. */
function cmapCodepoints(font: Buffer): Set<number> {
  const n = font.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < n; i++) {
    const at = 12 + 16 * i;
    if (font.toString('latin1', at, at + 4) === 'cmap') cmap = font.readUInt32BE(at + 8);
  }
  const out = new Set<number>();
  const tables = font.readUInt16BE(cmap + 2);
  for (let t = 0; t < tables; t++) {
    const sub = cmap + font.readUInt32BE(cmap + 4 + 8 * t + 4);
    if (font.readUInt16BE(sub) !== 4) continue;
    const segs = font.readUInt16BE(sub + 6) / 2;
    const ends = sub + 14;
    const starts = ends + 2 * segs + 2;
    for (let s = 0; s < segs; s++) {
      const end = font.readUInt16BE(ends + 2 * s);
      const start = font.readUInt16BE(starts + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) out.add(c);
    }
  }
  return out;
}

describe('the medallion font', () => {
  const font = read('android', 'app', 'src', 'main', 'assets', 'fonts', 'MihrabMedallion.ttf');
  const mapped = cmapCodepoints(font);

  it('has a finished medallion for every ayah number there is, 1 to 286', () => {
    for (let n = 1; n <= 286; n++) expect(mapped.has(0xe000 + n)).toBe(true);
  });

  it('carries the no-break space that opens the mark', () => {
    expect(mapped.has(0x00a0)).toBe(true);
  });

  it('is not named Amiri, which the OFL reserves', () => {
    expect(font.toString('latin1')).not.toMatch(/\0?A\0?m\0?i\0?r\0?i\0?\s?\0?R\0?e\0?g/);
    expect(MEDALLION_FONT).toBe('MihrabMedallion');
  });
});

describe('the mark on each platform', () => {
  it('on Android is the no-break space and ONE private-use glyph in the medallion font', () => {
    expect(ayahMark(1, 'android')).toEqual({ text: ' ', fontFamily: 'MihrabMedallion' });
    expect(ayahMark(286, 'android')).toEqual({ text: ' ', fontFamily: 'MihrabMedallion' });
  });

  it('elsewhere is the shaped pair CoreText and Chromium draw correctly', () => {
    expect(ayahMark(12, 'ios')).toEqual({ text: ayahMarkText(12), fontFamily: FONTS.arabicQuran });
    expect(ayahMark(12, 'web').text).toBe(ayahMarkText(12));
  });

  it('falls back to the shaped pair past the font\'s range rather than drawing nothing', () => {
    expect(ayahMark(0, 'android').fontFamily).not.toBe('MihrabMedallion');
    expect(ayahMark(287, 'android').fontFamily).not.toBe('MihrabMedallion');
  });

  it('is what both page layouts draw', () => {
    const page = read('src', 'quran', 'MushafUnicodePage.tsx').toString();
    expect(page.match(/ayahMark\((ayah\.ayah|token\.mark)\)\.text/g)).toHaveLength(2);
    expect(page.match(/fontFamily: ayahMark\((ayah\.ayah|token\.mark)\)\.fontFamily/g)).toHaveLength(2);
  });
});

describe('bundled faces answer every weight on Android', () => {
  const app = read('android', 'app', 'src', 'main', 'java', 'com', 'prayer_times', 'MainApplication.kt').toString();

  it('registers them with ReactFontManager before React Native loads', () => {
    expect(app).toMatch(/registerBundledFonts\(\)\s*\n\s*loadReactNative\(this\)/);
    expect(app).toContain('manager.addCustomFont(family, Typeface.createFromAsset(assets, "fonts/$family.ttf"))');
  });

  it('names exactly the faces in the assets folder', () => {
    const list = app.match(/BUNDLED_FONTS = listOf\(([^)]*)\)/)![1];
    const named = list.match(/"([^"]+)"/g)!.map(s => s.slice(1, -1)).sort();
    const files = require('fs')
      .readdirSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'fonts'))
      .filter((f: string) => f.endsWith('.ttf'))
      .map((f: string) => f.replace(/\.ttf$/, ''))
      .sort();
    expect(named).toEqual(files);
  });
});
