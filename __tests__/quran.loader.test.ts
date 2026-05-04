/**
 * Quran loader + index tests — task #68.
 *
 * Verifies:
 *   • The 114-surah index is complete and well-formed (every surah has
 *     a romanized + Arabic name, ayah count > 0, juz' in 1..30).
 *   • Aggregate ayah count matches the canonical 6,236 ayahs of the
 *     Madinah mushaf — guards against typos in the index when surahs
 *     are added piecemeal.
 *   • `loadSurah(1)` returns the inline-bundled Surah al-Fatihah text
 *     and translation.
 *   • `loadSurah(n)` for n in 2..114 returns the index-only placeholder
 *     until the Tanzil corpus is imported (no crash, no exception).
 *   • Out-of-range surah numbers return null.
 *   • The QURAN_ATTRIBUTION constant is non-empty and mentions Tanzil
 *     + Sahih International (license compliance).
 */

import {
  loadSurah,
  findSurah,
  QURAN_ATTRIBUTION,
  SURAHS,
  type SurahIndex,
} from '../src/quran/quran';

describe('SURAHS index', () => {
  test('contains all 114 surahs in order', () => {
    expect(SURAHS).toHaveLength(114);
    SURAHS.forEach((s, i) => {
      expect(s.number).toBe(i + 1);
    });
  });

  test('every surah has the required fields', () => {
    for (const s of SURAHS) {
      expect(typeof s.romanized).toBe('string');
      expect(s.romanized.length).toBeGreaterThan(0);
      expect(typeof s.arabic).toBe('string');
      expect(s.arabic.length).toBeGreaterThan(0);
      expect(typeof s.english).toBe('string');
      expect(s.english.length).toBeGreaterThan(0);
      expect(s.ayahCount).toBeGreaterThan(0);
      expect(['meccan', 'medinan']).toContain(s.type);
      expect(s.juz).toBeGreaterThanOrEqual(1);
      expect(s.juz).toBeLessThanOrEqual(30);
    }
  });

  test('aggregate ayah count matches canonical 6,236', () => {
    const total = SURAHS.reduce(
      (sum: number, s: SurahIndex) => sum + s.ayahCount,
      0,
    );
    expect(total).toBe(6236);
  });

  test('juz anchors are non-decreasing — no surah starts before its predecessor', () => {
    for (let i = 1; i < SURAHS.length; i += 1) {
      expect(SURAHS[i].juz).toBeGreaterThanOrEqual(SURAHS[i - 1].juz);
    }
  });
});

describe('findSurah', () => {
  test('returns the index entry for a valid number', () => {
    const s = findSurah(1);
    expect(s).toBeDefined();
    expect(s?.romanized).toBe('Al-Fatihah');
    expect(s?.ayahCount).toBe(7);
  });

  test('returns undefined for out-of-range numbers', () => {
    expect(findSurah(0)).toBeUndefined();
    expect(findSurah(115)).toBeUndefined();
    expect(findSurah(-1)).toBeUndefined();
  });
});

describe('loadSurah', () => {
  test('returns inline-bundled Surah al-Fatihah with 7 ayahs + translation', async () => {
    const s = await loadSurah(1);
    expect(s).not.toBeNull();
    expect(s?.index.romanized).toBe('Al-Fatihah');
    expect(s?.arabic).toHaveLength(7);
    expect(s?.translation).toHaveLength(7);
    // First ayah is the basmalah.
    expect(s?.arabic[0]).toMatch(/^بِسْمِ ٱللَّهِ/);
    expect(s?.translation[0]).toMatch(/^In the name of Allah/);
  });

  test('returns index-only placeholder for surahs awaiting import', async () => {
    // Pick a few different surahs to confirm the fallback path is uniform.
    for (const n of [2, 36, 67, 112, 114]) {
      const s = await loadSurah(n);
      expect(s).not.toBeNull();
      expect(s?.index.number).toBe(n);
      expect(s?.arabic).toEqual([]);
      expect(s?.translation).toEqual([]);
    }
  });

  test('returns null for out-of-range numbers', async () => {
    expect(await loadSurah(0)).toBeNull();
    expect(await loadSurah(115)).toBeNull();
  });
});

describe('QURAN_ATTRIBUTION', () => {
  test('mentions both Tanzil and Sahih International (license compliance)', () => {
    expect(QURAN_ATTRIBUTION).toMatch(/Tanzil/i);
    expect(QURAN_ATTRIBUTION).toMatch(/Sahih International/i);
    // The CC BY 3.0 license requires explicit attribution to the source.
    expect(QURAN_ATTRIBUTION).toMatch(/Creative Commons|CC BY/i);
  });
});
