/**
 * The surah-name calligraphy is a DRAWING, and iOS must never be asked to
 * shrink it to fit.
 *
 * Reported on the iPhone simulator at 2.18.1: Maryam (19) and Al-Qāri'ah
 * (101) drew as a ~4pt speck in the Quran list, the same two names on
 * every launch, while all 112 others drew correctly — and both drew
 * correctly on Android and on Mac Catalyst.
 *
 * The font was not at fault: every glyph's ink sits inside its advance,
 * and CoreText measures all 114 at sane widths. `adjustsFontSizeToFit`
 * was. On the new architecture iOS runs `NSTextStorage+FontScaling`,
 * whose `compareToSize:` has a special case for a ONE-character string —
 * which is exactly what a name glyph is — that calls the text too large
 * as soon as `sizeWithAttributes` and the container width disagree, a
 * matter of where a fixed width lands on the pixel grid. When no ratio
 * satisfies the search it ends on its initial `lastRatioWhichFits = 0.02`
 * and clamps to a hard-coded 4pt floor. `minimumFontScale` cannot stop
 * it: iOS reads `minimumFontSize` out of the paragraph attributes and
 * only Android forwards the scale prop.
 *
 * So: no `adjustsFontSizeToFit` anywhere near the glyph. The width is
 * held by `flexShrink: 0` and the flexible left column gives way, and
 * `allowFontScaling={false}` keeps a 310% text setting from growing a
 * decorative glyph out of its row.
 */
import { readFileSync } from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', 'src');
/**
 * Comments come out first: the sources carry a "no adjustsFontSizeToFit
 * here" note beside these very elements, and a check that reads prose as
 * if it were props would fail on the warning that keeps it fixed.
 */
const read = (...p: string[]) =>
  readFileSync(path.join(SRC, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

/** Every file that draws a surah-name glyph. */
const DRAWS_THE_GLYPH = [
  ['screens', 'QuranScreen.tsx'],
  ['screens', 'quran', 'TilawahScreen.tsx'],
];

describe('the surah-name glyph is never auto-shrunk', () => {
  for (const file of DRAWS_THE_GLYPH) {
    const name = file[file.length - 1];

    it(`${name} draws it without adjustsFontSizeToFit`, () => {
      const src = read(...file);
      expect(src).toContain('surahHeaderGlyph');
      // Not "none in the file" — "none in a Text that draws the glyph".
      // Each <Text …>{…surahHeaderGlyph(…)}</Text> is taken whole and
      // read for the prop.
      const blocks = [...src.matchAll(/<Text\b[^>]*>\s*\{[^}]*surahHeaderGlyph\([^)]*\)[^}]*\}/g)];
      expect(blocks.length).toBeGreaterThan(0);
      for (const [block] of blocks) {
        expect(block).not.toMatch(/adjustsFontSizeToFit/);
        expect(block).not.toMatch(/minimumFontScale/);
      }
    });
  }

  it('the Quran list holds the glyph at a fixed size', () => {
    const src = read('screens', 'QuranScreen.tsx');
    const blocks = [...src.matchAll(/<Text\b[^>]*>\s*\{[^}]*surahHeaderGlyph\([^)]*\)[^}]*\}/g)];
    // Both rows that carry a name — the surah row and the juz row.
    expect(blocks.length).toBe(2);
    for (const [block] of blocks) {
      expect(block).toMatch(/allowFontScaling=\{false\}/);
      expect(block).toMatch(/numberOfLines=\{1\}/);
    }
    // And the width the drawing measured is the width it keeps.
    expect(src).toMatch(/arabic: \{\s*flexShrink: 0,/);
  });
});
