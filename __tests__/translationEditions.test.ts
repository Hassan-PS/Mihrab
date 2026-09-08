/**
 * What is actually inside each translation asset — issue #37.
 *
 * `translationLoader.test.ts` already checks that every registered
 * edition has a FILE. That is not the same as having a translation.
 * `es.garcia` was assembled here from GitHub mirrors rather than
 * downloaded whole from Tanzil (tanzil.net is not reachable from this
 * environment — docs/data-sources.md records the whole chain), and the
 * failure mode of assembling a corpus by hand is not a missing file. It
 * is a file that parses, loads, opens fine on Al-Fatiha, and is missing
 * the last forty ayahs of Al-Baqarah.
 *
 * So this reads every edition the app ships and demands the whole
 * Qur'an of it, shaped like the Qur'an: 114 surahs, 6,236 ayahs, the
 * right number in each surah, and no blanks.
 */
import {
  QURAN_TRANSLATIONS,
  loadTranslation,
  defaultEditionForLocale,
  _clearTranslationCache,
  type QuranTranslationId,
} from '../src/quran/translations';
import { SURAHS } from '../src/quran/quran';

beforeEach(() => _clearTranslationCache());

describe('every shipped edition carries the whole Qur’an', () => {
  it.each(QURAN_TRANSLATIONS.map(e => [e.id, e.label] as const))(
    '%s (%s)',
    async (id: string) => {
      const map = await loadTranslation(id as QuranTranslationId);
      expect(Object.keys(map)).toHaveLength(114);

      let total = 0;
      const short: string[] = [];
      const blank: string[] = [];
      for (const surah of SURAHS) {
        const ayahs = map[String(surah.number)] ?? {};
        const got = Object.keys(ayahs).length;
        total += got;
        if (got !== surah.ayahCount) {
          short.push(`${surah.number}: ${got} of ${surah.ayahCount}`);
        }
        for (let v = 1; v <= surah.ayahCount; v++) {
          if (!String(ayahs[String(v)] ?? '').trim()) {
            blank.push(`${surah.number}:${v}`);
          }
        }
      }
      expect(short).toEqual([]);
      expect(blank.slice(0, 10)).toEqual([]);
      expect(total).toBe(6236);
    },
    20000,
  );
});

describe('the second Spanish edition sits beside the first, not on top of it', () => {
  // Issue #37 asked for Isa García because a reader preferred it. It did
  // not ask for Cortés to be taken away from everyone who has been
  // reading it since v2.7.40 — and a Spanish reader who has never opened
  // the picker has no stored pick, so whatever `defaultEditionForLocale`
  // returns is what they see. That makes the ORDER of two entries in an
  // array the whole of the promise, which is exactly the kind of thing
  // that gets tidied alphabetically one day by someone being helpful.
  const spanish = QURAN_TRANSLATIONS.filter(e => e.locale === 'es');

  it('offers both', () => {
    expect(spanish.map(e => e.id)).toEqual(['es.cortes', 'es.garcia']);
  });

  it('still opens Cortés for a reader who has never chosen', () => {
    expect(defaultEditionForLocale('es')).toBe('es.cortes');
  });

  it('names them by translator, so the picker can tell them apart', () => {
    // Both land under one "Spanish" heading in the edition list; the
    // label is the only thing distinguishing the rows.
    const labels = spanish.map(e => e.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(2);
  });

  it('is a different translation, not a second copy of the same one', async () => {
    // The mirrors this was built from also carry Cortés. Fetching the
    // wrong file is a one-character mistake and produces an app that
    // looks entirely correct.
    const cortes = await loadTranslation('es.cortes' as QuranTranslationId);
    const garcia = await loadTranslation('es.garcia' as QuranTranslationId);
    let same = 0;
    for (const surah of SURAHS) {
      for (let v = 1; v <= surah.ayahCount; v++) {
        const a = cortes[String(surah.number)]?.[String(v)];
        const b = garcia[String(surah.number)]?.[String(v)];
        if (a && a === b) same++;
      }
    }
    expect(same).toBeLessThan(100);
  }, 20000);

  it('reads as García, not as Cortés', async () => {
    // The one line every Spanish reader knows by heart, and the clearest
    // single difference between the two: Cortés keeps "Alá", García
    // translates it "Dios".
    const garcia = await loadTranslation('es.garcia' as QuranTranslationId);
    expect(garcia['1']['1']).toContain('Dios');
    expect(garcia['1']['1']).not.toContain('Alá');
  });
});
