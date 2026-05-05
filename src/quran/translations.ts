/**
 * Quran translation registry — task #96.
 *
 * Multiple Tanzil-derived translation editions are bundled so the user
 * can pick the one that matches their preferred language. Default
 * follows the active app locale (see `defaultEditionForLocale`).
 *
 * Each edition's text lives at `./data/translations/{id}.json` as a
 * chapter-keyed object: `{ "1": { "1": "In the name…", … }, … }`.
 * Metro requires literal require paths so we enumerate explicitly.
 *
 * Source: alquran.cloud (Tanzil corpus). License notes:
 *   - Sahih International: public domain
 *   - Pickthall: public domain
 *   - Tanzil-distributed editions: respective translator licenses,
 *     redistributed under CC BY 3.0 by Tanzil.
 */

export type QuranTranslationEdition = {
  /** Stable id, also the data file name. */
  id: string;
  /** Translator / edition name. */
  label: string;
  /** ISO-style language label. */
  language: string;
  /** App locale code (en/ar/…) — used for default selection. */
  locale: string;
};

export const QURAN_TRANSLATIONS: ReadonlyArray<QuranTranslationEdition> = [
  { id: 'en.sahih', label: 'Sahih International', language: 'English', locale: 'en' },
  { id: 'en.pickthall', label: 'Pickthall', language: 'English', locale: 'en' },
  { id: 'ar.muyassar', label: 'Tafsir al-Muyassar', language: 'Arabic', locale: 'ar' },
  { id: 'sv.bernstrom', label: 'Bernström', language: 'Swedish', locale: 'sv' },
  { id: 'bn.bengali', label: 'Mujibur Rahman', language: 'Bengali', locale: 'bn' },
  { id: 'ur.jalandhry', label: 'Fateh Muhammad Jalandhry', language: 'Urdu', locale: 'ur' },
  { id: 'hi.hindi', label: 'Suhel Farooq Khan', language: 'Hindi', locale: 'hi' },
  { id: 'fr.hamidullah', label: 'Hamidullah', language: 'French', locale: 'fr' },
  { id: 'es.cortes', label: 'Cortés', language: 'Spanish', locale: 'es' },
  { id: 'de.bubenheim', label: 'Bubenheim & Elyas', language: 'German', locale: 'de' },
  { id: 'tr.diyanet', label: 'Diyanet İşleri', language: 'Turkish', locale: 'tr' },
  { id: 'id.indonesian', label: 'Indonesian Ministry', language: 'Indonesian', locale: 'id' },
  { id: 'ru.kuliev', label: 'Kuliev', language: 'Russian', locale: 'ru' },
  { id: 'zh.jian', label: 'Ma Jian', language: 'Chinese', locale: 'zh' },
] as const;

export type QuranTranslationId = (typeof QURAN_TRANSLATIONS)[number]['id'];

/** Pick the best default edition for an app locale. Falls back to en.sahih. */
export function defaultEditionForLocale(locale: string): QuranTranslationId {
  const exact = QURAN_TRANSLATIONS.find(e => e.locale === locale);
  if (exact) return exact.id as QuranTranslationId;
  return 'en.sahih';
}

/**
 * Is this saved edition still appropriate for the current app language?
 * Returns false when:
 *   - the id isn't in our registry (data shape changed), or
 *   - the saved edition belongs to a different locale than the active app
 *     language (user switched languages after picking).
 *
 * Used by QuranSurahScreen so a stale `en.sahih` choice doesn't override
 * the locale-appropriate default after the user changes the app language.
 */
export function editionMatchesLocale(
  edition: string | undefined | null,
  locale: string,
): boolean {
  if (!edition) return false;
  const found = QURAN_TRANSLATIONS.find(e => e.id === edition);
  if (!found) return false;
  return found.locale === locale;
}

type ChapterMap = { [chapter: string]: { [ayah: string]: string } };

/**
 * Synchronously load all 6,236 ayahs of a translation edition into a
 * lookup map. Each call returns the bundled JSON object (Metro caches
 * the require). Adds ~1–2 MB to the JS bundle per edition selected at
 * runtime; we keep them all in tree-shake-friendly switch branches.
 */
export function loadTranslation(edition: QuranTranslationId): ChapterMap {
  switch (edition) {
    case 'en.sahih':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/en.sahih.json');
    case 'en.pickthall':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/en.pickthall.json');
    case 'ar.muyassar':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/ar.muyassar.json');
    case 'sv.bernstrom':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/sv.bernstrom.json');
    case 'bn.bengali':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/bn.bengali.json');
    case 'ur.jalandhry':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/ur.jalandhry.json');
    case 'hi.hindi':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/hi.hindi.json');
    case 'fr.hamidullah':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/fr.hamidullah.json');
    case 'es.cortes':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/es.cortes.json');
    case 'de.bubenheim':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/de.bubenheim.json');
    case 'tr.diyanet':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/tr.diyanet.json');
    case 'id.indonesian':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/id.indonesian.json');
    case 'ru.kuliev':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/ru.kuliev.json');
    case 'zh.jian':
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/zh.jian.json');
    default:
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./data/translations/en.sahih.json');
  }
}

/** Fetch a single ayah's translation. Returns empty string if missing. */
export function getAyahTranslation(
  edition: QuranTranslationId,
  surah: number,
  ayah: number,
): string {
  const map = loadTranslation(edition);
  return map[String(surah)]?.[String(ayah)] ?? '';
}

/** Fetch the whole surah's translation as an ordered ayah array. */
export function getSurahTranslation(
  edition: QuranTranslationId,
  surah: number,
): string[] {
  const map = loadTranslation(edition);
  const ayahs = map[String(surah)] ?? {};
  const keys = Object.keys(ayahs)
    .map(k => Number(k))
    .sort((a, b) => a - b);
  return keys.map(k => ayahs[String(k)]);
}
