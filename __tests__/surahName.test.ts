/**
 * Surah names follow the app language (v2.8.4).
 *
 * The reader header, its fullscreen label and the screen title all showed
 * the English name unconditionally — an Arabic UI got "Al-Fatihah" (and, in
 * fullscreen, "The Opening") over a page of Arabic script.
 */
import { mushafSurahName, surahName, usesArabicScript } from '../src/quran/surahName';

const mushafMeta = { name: 'الفاتحة', englishName: 'Al-Faatiha' };
const catalogMeta = { arabic: 'الفاتحة', romanized: 'Al-Fatihah' };

describe('usesArabicScript', () => {
  it('is true for the Arabic-script UI languages we ship', () => {
    expect(usesArabicScript('ar')).toBe(true);
    expect(usesArabicScript('ur')).toBe(true);
    expect(usesArabicScript('ar-EG')).toBe(true);
  });

  it('is false for the Latin/Indic/CJK ones', () => {
    for (const lang of ['en', 'sv', 'fr', 'de', 'tr', 'id', 'ru', 'zh', 'hi', 'bn']) {
      expect(usesArabicScript(lang)).toBe(false);
    }
  });
});

describe('surah names', () => {
  it('gives the Arabic name to an Arabic-script UI', () => {
    expect(mushafSurahName(mushafMeta, 'ar')).toBe('الفاتحة');
    expect(surahName(catalogMeta, 'ur')).toBe('الفاتحة');
  });

  it('gives the Latin name to everyone else', () => {
    expect(mushafSurahName(mushafMeta, 'sv')).toBe('Al-Faatiha');
    expect(surahName(catalogMeta, 'en')).toBe('Al-Fatihah');
    expect(surahName(catalogMeta, 'zh')).toBe('Al-Fatihah');
  });
});
