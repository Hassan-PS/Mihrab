/**
 * The muṣḥaf that SHIPS is the one in the repository.
 *
 * `tools/riwayat/import.ts` refuses anything that is not the whole Qur'an,
 * and that is the right place for the check — but it runs on one person's
 * machine, once. What reaches a reader is whatever is committed at
 * `src/quran/data/<riwayah>/`, and between those two facts sits every way
 * a file gets truncated, half-written, hand-edited or replaced by a
 * fixture somebody meant to delete.
 *
 * So this reads the bundled files as they actually are and allows exactly
 * two states:
 *
 *   • EMPTY — the committed placeholders. `riwayahAvailable` reads them as
 *     absent and the app offers Hafs only, which is the correct behaviour
 *     for a build without the data. (Empty rather than missing because
 *     Metro resolves `require()` at bundle time; see the README beside
 *     them.)
 *   • WHOLE — 6236 ayahs, every surah's exact count, a pagination that
 *     covers all of them once and in order.
 *
 * Anything between the two is a corrupted muṣḥaf, and it fails here rather
 * than on someone's phone. What this CANNOT tell you is whether correct-
 * shaped text is the real thing: that is a human's job, and the README
 * says whose.
 */
import * as fs from 'fs';
import * as path from 'path';
import { TOTAL_AYAHS, ayahAtIndex, ayahCount, ayahIndexOf } from '../src/quran/ayahIndex';
import { RIWAYAT } from '../src/quran/riwayat';

type PageRange = {
  page: number;
  juz: number;
  start: { surah: number; ayah: number };
  end: { surah: number; ayah: number } | null;
};

const DATA = path.join(__dirname, '..', 'src', 'quran', 'data');

function read(riwayah: string, file: string): unknown {
  const p = path.join(DATA, riwayah, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Every riwayah drawn from bundled Unicode text, from the table — so a
// sixth one added tomorrow is checked without anybody remembering to.
const BUNDLED = RIWAYAT.filter(r => r.render === 'unicode');

describe.each(BUNDLED.map(r => [r.id, r] as const))(
  'the bundled %s data',
  (id, def) => {
    const pagesFile = read(id, 'pages.json') as {
      pages?: PageRange[];
      surahs?: unknown[];
    } | null;
    const textFile = read(id, 'text.json') as Record<string, string> | null;

    it('has both files, because Metro resolves requires at build time', () => {
      // A missing file is not "no riwayah", it is a bundle that will not
      // build. The placeholders exist so every checkout compiles.
      expect(pagesFile).not.toBeNull();
      expect(textFile).not.toBeNull();
    });

    const pages = pagesFile?.pages ?? [];
    const text = textFile ?? {};
    const empty = pages.length === 0 && Object.keys(text).length === 0;

    it('is either wholly absent or wholly present, never half', () => {
      const full =
        pages.length > 0 && Object.keys(text).length === TOTAL_AYAHS;
      expect(empty || full).toBe(true);
    });

    (empty ? it.skip : it)('paginates the whole Qur’an, once, in order', () => {
      expect(pages).toHaveLength(def.totalPages);
      let expected = 1;
      for (const [i, page] of pages.entries()) {
        expect(page.page).toBe(i + 1);
        expect(page.juz).toBeGreaterThanOrEqual(1);
        expect(page.juz).toBeLessThanOrEqual(30);
        expect(ayahIndexOf(page.start.surah, page.start.ayah)).toBe(expected);
        expected = page.end
          ? ayahIndexOf(page.end.surah, page.end.ayah)
          : TOTAL_AYAHS + 1;
      }
      expect(expected).toBe(TOTAL_AYAHS + 1);
    });

    (empty ? it.skip : it)('carries every ayah, and nothing else', () => {
      const keys = Object.keys(text);
      expect(keys).toHaveLength(TOTAL_AYAHS);
      for (let i = 1; i <= TOTAL_AYAHS; i++) {
        const ref = ayahAtIndex(i);
        const body = text[`${ref.surah}:${ref.ayah}`];
        expect(typeof body).toBe('string');
        expect(body.trim().length).toBeGreaterThan(0);
      }
      // No 2:287, no 115:1 — a key the Qur'an does not have means the
      // ayah numbering of whatever produced this file is not ours.
      for (const key of keys) {
        const [surah, ayah] = key.split(':').map(Number);
        expect(Number.isInteger(surah)).toBe(true);
        expect(surah).toBeGreaterThanOrEqual(1);
        expect(surah).toBeLessThanOrEqual(114);
        expect(ayah).toBeGreaterThanOrEqual(1);
        expect(ayah).toBeLessThanOrEqual(ayahCount(surah));
      }
    });

    (empty ? it.skip : it)('names all 114 surahs for its own index', () => {
      expect(pagesFile?.surahs).toHaveLength(114);
    });
  },
);

it('offers Hafs whatever else is or is not in the build', () => {
  // The invariant underneath all of the above: there is always a muṣḥaf.
  const hafs = RIWAYAT.find(r => r.id === 'hafs');
  expect(hafs).toBeDefined();
  expect(hafs?.render).toBe('glyph');
});
