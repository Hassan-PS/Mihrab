/**
 * The tajwīd colours: a second set of page faces, the geometry that goes
 * with them, and the rules that explain them.
 *
 * The font set is what the store, the slot pool and the download manager
 * key by; the glyph set is what the layout measures with. A page drawn in
 * the V4 faces but laid out with V2's advances would hit-test the wrong
 * word, and a V4 font filed under a V2 name would be "stale" for ever.
 */
import fs from 'fs';
import path from 'path';
import {
  expectedFontBytes,
  fontFileName,
  fontFileState,
  fontUrl,
  pageOfFileName,
  tajweedFontSet,
  TAJWEED_FONT_RELEASES,
} from '../src/quran/mushafFontStore';
import tajweedManifest from '../src/quran/data/mushafTajweedFontManifest.json';
import v4AdvancesJson from '../src/quran/data/mushafLayoutV4Advances.json';
import layout from '../src/quran/data/mushafLayoutV2.json';
import {
  _resetLayoutCache,
  getPageLayout,
  mushafGlyphSet,
  pageMeasureEm,
  setMushafGlyphSet,
} from '../src/quran/mushafLayout';
import { fontKey } from '../src/quran/useMushafPageFont';
import { fontSetOf, isJobRunning } from '../src/quran/quranDownloadManager';
import { MUSHAF_TOTAL_PAGES } from '../src/quran/mushafImages';
import {
  TAJWEED_FAMILIES,
  TAJWEED_RULES,
  rulesOfFamily,
  tajweedInk,
  tajweedRule,
} from '../src/quran/tajweed/rules';
import { tajweedRuns, type TajweedWord } from '../src/quran/tajweed/tajweedData';

jest.mock('../src/native/MushafFont', () => ({
  isValidFontFile: jest.fn(async () => true),
  loadedPageFont: jest.fn(() => false),
  acquirePageFont: jest.fn(async () => null),
  pinPageFont: jest.fn(),
  unpinPageFont: jest.fn(),
  mushafFontAvailable: jest.fn(() => true),
}));

const RULES_DIR = path.join(__dirname, '..', 'assets', 'quran', 'tajweed');
const v4Advances = v4AdvancesJson as Array<Array<[number, number[]] | null>>;

describe('the tajwīd font sets', () => {
  it('name their files apart from V2, and read the page back', () => {
    expect(fontFileName(125)).toBe('QCF2125.ttf');
    expect(fontFileName(125, 'tajweed-light')).toBe('QCF4T125L.ttf');
    expect(fontFileName(125, 'tajweed-dark')).toBe('QCF4T125D.ttf');
    expect(pageOfFileName('QCF4T125L.ttf', 'tajweed-light')).toBe(125);
    expect(pageOfFileName('QCF4T125D.ttf', 'tajweed-dark')).toBe(125);
    // The sets share a folder: a light file is not a dark page.
    expect(pageOfFileName('QCF4T125L.ttf', 'tajweed-dark')).toBeNull();
    expect(pageOfFileName('QCF4T125L.ttf')).toBeNull();
  });

  it('come from their own release', () => {
    // One release per palette: GitHub caps a release at a thousand assets.
    expect(TAJWEED_FONT_RELEASES).toEqual({
      light: 'mushaf-fonts-v4-tajweed-light',
      dark: 'mushaf-fonts-v4-tajweed-dark',
    });
    expect(fontUrl(1, 'tajweed-light')).toBe(
      'https://github.com/Hassan-PS/Mihrab/releases/download/mushaf-fonts-v4-tajweed-light/QCF4T001L.ttf',
    );
    expect(fontUrl(604, 'tajweed-dark')).toBe(
      'https://github.com/Hassan-PS/Mihrab/releases/download/mushaf-fonts-v4-tajweed-dark/QCF4T604D.ttf',
    );
    expect(fontUrl(1)).toContain('/mushaf-fonts-v2/QCF2001.ttf');
  });

  it('have a manifest size for every page in both palettes', () => {
    expect(tajweedManifest.light).toHaveLength(MUSHAF_TOTAL_PAGES);
    expect(tajweedManifest.dark).toHaveLength(MUSHAF_TOTAL_PAGES);
    for (const bytes of [...tajweedManifest.light, ...tajweedManifest.dark]) {
      expect(bytes).toBeGreaterThan(8_192);
    }
    expect(expectedFontBytes(1, 'tajweed-light')).toBe(tajweedManifest.light[0]);
    expect(expectedFontBytes(604, 'tajweed-dark')).toBe(tajweedManifest.dark[603]);
    expect(fontFileState(tajweedManifest.dark[603], 604, 'tajweed-dark')).toBe('ok');
    expect(fontFileState(tajweedManifest.dark[603] + 1, 604, 'tajweed-dark')).toBe('stale');
  });

  it('follow the page tone', () => {
    expect(tajweedFontSet(false)).toBe('tajweed-light');
    expect(tajweedFontSet(true)).toBe('tajweed-dark');
  });

  it('get their own slot keys, so a set never evicts another set of the same page', () => {
    expect(fontKey(125, 'v2')).toBe(125);
    expect(fontKey(125, 'tajweed-light')).toBe(1125);
    expect(fontKey(125, 'tajweed-dark')).toBe(2125);
    expect(fontKey(604, 'v2')).toBeLessThan(fontKey(1, 'tajweed-light'));
  });

  it('are separate download jobs', () => {
    expect(fontSetOf({ kind: 'fonts' })).toBe('v2');
    expect(fontSetOf({ kind: 'fonts', set: 'tajweed-dark' })).toBe('tajweed-dark');
    // Nothing running: no job is.
    expect(isJobRunning({ kind: 'fonts', set: 'tajweed-light' })).toBe(false);
  });
});

describe('the V4 advances', () => {
  afterEach(() => _resetLayoutCache());

  it('cover every page and every āyah line', () => {
    expect(v4Advances).toHaveLength(MUSHAF_TOTAL_PAGES);
    for (let p = 0; p < MUSHAF_TOTAL_PAGES; p++) {
      const lines = (layout as Array<{ l: Array<{ t: string; a?: number[] }> }>)[p].l;
      expect(v4Advances[p]).toHaveLength(lines.length);
      lines.forEach((line, i) => {
        const v4 = v4Advances[p][i];
        if (line.t !== 'a') {
          expect(v4).toBeNull();
          return;
        }
        expect(v4).not.toBeNull();
        expect(v4![1]).toHaveLength(line.a!.length);
        expect(v4![0]).toBeGreaterThan(0);
      });
    }
  });

  it('are what the layout measures with once the tajwīd set is live', () => {
    expect(mushafGlyphSet()).toBe('v2');
    const v2 = getPageLayout(125)!;
    setMushafGlyphSet('tajweed');
    expect(mushafGlyphSet()).toBe('tajweed');
    const v4 = getPageLayout(125)!;
    expect(v4).not.toBe(v2);
    const v2Line = v2.lines.find(l => l.kind === 'ayah')!;
    const v4Line = v4.lines.find(l => l.kind === 'ayah')!;
    if (v2Line.kind === 'ayah' && v4Line.kind === 'ayah') {
      expect(v4Line.words).toHaveLength(v2Line.words.length);
      // The V4 faces are cut a little wider: the same words, wider advances.
      expect(v4Line.natural).not.toBe(v2Line.natural);
      const idx = layout[124].l.findIndex(l => l.t === 'a');
      expect(v4Line.natural).toBeCloseTo(v4Advances[124][idx]![0], 3);
      v4Line.words.forEach((w, i) =>
        expect(w.advance).toBeCloseTo(v4Advances[124][idx]![1][i], 3),
      );
    }
    // The measure follows the set, so the font size does too.
    expect(pageMeasureEm(v4)).not.toBe(pageMeasureEm(v2));
    setMushafGlyphSet('v2');
    expect(getPageLayout(125)!.lines).toEqual(v2.lines);
  });

  it('switching to the same set is a no-op that keeps the cache', () => {
    const a = getPageLayout(1);
    setMushafGlyphSet('v2');
    expect(getPageLayout(1)).toBe(a);
  });
});

describe('the rules', () => {
  const surahFile = (n: number) =>
    JSON.parse(
      fs.readFileSync(path.join(RULES_DIR, `${String(n).padStart(3, '0')}.json`), 'utf8'),
    ) as { v: number; rules: string[]; ayahs: Array<Array<[string] | [string, number[][]]>> };

  it('ship one file per surah, every rule id known to the catalogue', () => {
    const known = new Set(TAJWEED_RULES.map(r => r.id));
    for (let n = 1; n <= 114; n++) {
      const data = surahFile(n);
      expect(data.v).toBe(1);
      for (const id of data.rules) expect(known.has(id as never)).toBe(true);
    }
  });

  it('agree with the layout on the number of words in every āyah', () => {
    const counts = new Map<string, number>();
    for (const page of layout as Array<{ l: Array<{ t: string; w?: number[][] }> }>) {
      for (const line of page.l) {
        if (line.t !== 'a') continue;
        for (const seg of line.w!) {
          const key = `${seg[0]}:${seg[1]}`;
          counts.set(key, (counts.get(key) ?? 0) + seg[3]);
        }
      }
    }
    for (let n = 1; n <= 114; n++) {
      const data = surahFile(n);
      data.ayahs.forEach((words, i) => {
        // The layout counts the medallion as a word; the rules do not.
        expect(words.length).toBe(counts.get(`${n}:${i + 1}`)! - 1);
      });
    }
  });

  it('have an example on the page for every rule', () => {
    // Ḥafṣ's own and the shared rules; Warsh's are checked against its
    // own files in warshTajweed.test.ts.
    for (const rule of TAJWEED_RULES.filter(r => r.riwayah == null)) {
      const { surah, ayah, word } = rule.example;
      const data = surahFile(surah);
      const w = data.ayahs[ayah - 1][word - 1];
      expect(w).toBeDefined();
      const ids = (w[1] ?? []).map(span => data.rules[span[0]]);
      expect(ids).toContain(rule.id);
    }
  });

  it('carry tafkhīm from the fonts, over the whole word', () => {
    // رَبِّ — the heavy rā the API does not mark and the page paints blue.
    const data = surahFile(1);
    const rabb = data.ayahs[1][2];
    const spans = (rabb[1] ?? []).map(span => [data.rules[span[0]], span[1], span[2]]);
    expect(spans).toContainEqual(['tafkheem', 0, rabb[0].length]);
    // لِلَّهِ after a kasrah is thin: no tafkhīm.
    expect((data.ayahs[1][1][1] ?? []).map(span => data.rules[span[0]])).not.toContain('tafkheem');
  });

  it('are arranged one colour per family, and every family is listed', () => {
    for (const family of TAJWEED_FAMILIES) {
      // Warsh's family has rules only for a Warsh reader.
      const rules = rulesOfFamily(family, family === 'warsh' ? 'warsh' : undefined);
      expect(rules.length).toBeGreaterThan(0);
      // Warsh's family is three changes to how a letter is said, and each
      // has its own ink; the Complex's families are one ink each.
      if (family !== 'madd' && family !== 'warsh') {
        expect(new Set(rules.map(r => r.light)).size).toBe(1);
      }
    }
    expect(tajweedRule('qalaqah')?.family).toBe('qalqalah');
    expect(tajweedRule('nope')).toBeUndefined();
    expect(tajweedInk(tajweedRule('ghunnah')!, false)).toBe('#09b000');
    expect(tajweedInk(tajweedRule('ghunnah')!, true)).toBe('#26b55d');
  });

  it('cut a word into runs by its spans', () => {
    const grey = tajweedRule('ham_wasl')!;
    const madd = tajweedRule('madda_normal')!;
    const word: TajweedWord = {
      text: 'ٱلرَّحۡمَـٰنِ',
      position: 3,
      spans: [
        { rule: grey, start: 0, end: 1 },
        { rule: madd, start: 9, end: 11 },
      ],
    };
    const runs = tajweedRuns(word);
    expect(runs.map(r => r.text).join('')).toBe(word.text);
    expect(runs.map(r => r.rule?.id ?? null)).toEqual([
      'ham_wasl',
      null,
      'madda_normal',
      null,
    ]);
    // A span past the end is clipped, not thrown.
    expect(
      tajweedRuns({ text: 'ab', position: 1, spans: [{ rule: grey, start: 1, end: 9 }] })
        .map(r => r.text)
        .join(''),
    ).toBe('ab');
  });
});
