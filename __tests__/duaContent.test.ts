/**
 * What a dua entry has to carry — and the two categories added for #34.
 *
 * "Religious content must always be attributable" is the rule at the top
 * of src/duas/duas.ts, and a missing `source` is the failure that cannot
 * be seen by looking at the screen: the card renders, the words are
 * right, and nothing says where they came from.
 *
 * The lavatory and garment texts are the first entries added from an
 * outside dataset rather than typed from a note, so this also pins the
 * shape of that import: Arabic, a transliteration, an English rendering
 * of our own, and a citation naming the collection — see
 * docs/data-sources.md for why the English in the mirrors is not usable.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { DUAS, DUA_CATEGORIES, duasByCategory } from '../src/duas/duas';

const LOCALES = [
  'ar', 'bn', 'de', 'en', 'es', 'fr', 'hi', 'id', 'ru', 'sv', 'tr', 'ur', 'zh',
];
const localeFile = (l: string) =>
  JSON.parse(
    readFileSync(
      path.join(__dirname, '..', 'src', 'i18n', 'locales', `${l}.json`),
      'utf8',
    ),
  );

describe('every dua is attributable', () => {
  it('names a source, always', () => {
    const unsourced = DUAS.filter(d => !d.source || d.source.trim() === '');
    expect(unsourced.map(d => d.id)).toEqual([]);
  });

  it('carries Arabic and a transliteration', () => {
    for (const d of DUAS) {
      expect(d.arabic.trim().length).toBeGreaterThan(0);
      expect(d.transliteration.trim().length).toBeGreaterThan(0);
    }
  });

  it('has a unique id per entry', () => {
    const ids = DUAS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the lavatory and garment categories — #34', () => {
  it('are in the list the screen reads', () => {
    expect(DUA_CATEGORIES).toContain('lavatory');
    expect(DUA_CATEGORIES).toContain('garment');
  });

  it('are not empty, which is what a category in that list promises', () => {
    expect(duasByCategory('lavatory').length).toBeGreaterThanOrEqual(2);
    expect(duasByCategory('garment').length).toBeGreaterThanOrEqual(4);
  });

  it('cite the collection rather than the dataset they were checked against', () => {
    // The Arabic is quotation of hadith; the mirrors that carry it have no
    // licence and nothing to license. Citing one of them instead of the
    // collection would credit the wrong thing.
    for (const d of [...duasByCategory('lavatory'), ...duasByCategory('garment')]) {
      expect(d.source).toMatch(
        /Bukhari|Muslim|Abi Dawud|Tirmidhi|Ibn Majah|Nasa|Baghawi/,
      );
      expect(d.source).not.toMatch(/github|json|hisn_almuslim/i);
    }
  });

  it('is named in every one of the thirteen languages', () => {
    // A category the picker lists and cannot name shows a raw key.
    for (const l of LOCALES) {
      const cat = localeFile(l).duas.cat;
      for (const key of ['lavatory', 'garment']) {
        expect(typeof cat[key]).toBe('string');
        expect(cat[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every new dua a title in every language', () => {
    const ids = [...duasByCategory('lavatory'), ...duasByCategory('garment')].map(
      d => d.id,
    );
    for (const l of LOCALES) {
      const duas = localeFile(l).duas;
      for (const id of ids) {
        expect(duas[id]?.title).toBeTruthy();
      }
    }
  });
});
