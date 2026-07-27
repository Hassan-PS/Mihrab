/**
 * Ayah of the day — random draw + edition resolution (v2.7.27).
 */
import {
  randomAyahRef,
  resolveEditionForNotification,
} from '../src/notifications/ayahOfDay';
import { SURAHS } from '../src/quran/quran';

describe('randomAyahRef', () => {
  it('maps rand=0 to the first ayah of the Quran', () => {
    expect(randomAyahRef(() => 0)).toEqual({ surah: 1, ayah: 1 });
  });

  it('maps rand→1 to the last ayah of the last surah', () => {
    const ref = randomAyahRef(() => 0.999999999);
    expect(ref.surah).toBe(114);
    expect(ref.ayah).toBe(6);
  });

  it('always returns a valid reference within the surah ayah count', () => {
    for (let i = 0; i < 500; i++) {
      const ref = randomAyahRef();
      const meta = SURAHS.find(s => s.number === ref.surah);
      expect(meta).toBeDefined();
      expect(ref.ayah).toBeGreaterThanOrEqual(1);
      expect(ref.ayah).toBeLessThanOrEqual(meta!.ayahCount);
    }
  });

  it('crosses surah boundaries correctly (Al-Fatihah → Al-Baqarah)', () => {
    const total = SURAHS.reduce((sum, s) => sum + s.ayahCount, 0);
    // rand chosen to land exactly on index 7 (0-based) = first ayah of surah 2.
    const ref = randomAyahRef(() => 7 / total);
    expect(ref).toEqual({ surah: 2, ayah: 1 });
  });
});

describe('resolveEditionForNotification', () => {
  it('honors an explicit edition matching the app language', () => {
    expect(resolveEditionForNotification('en.pickthall', 'en')).toBe(
      'en.pickthall',
    );
  });

  it('honors an explicit cross-language pick (v2.7.40 — no silent revert)', () => {
    expect(resolveEditionForNotification('en.pickthall', 'sv')).toBe(
      'en.pickthall',
    );
  });

  it('falls back to the locale default for unknown ids', () => {
    // 'ar.muyassar' was removed from the translation registry (it is a
    // tafsir, not a translation) — stored picks of it fall back.
    expect(resolveEditionForNotification('ar.muyassar', 'sv')).toBe(
      'sv.bernstrom',
    );
  });

  it('falls back to en.sahih for locales without a bundled edition', () => {
    expect(resolveEditionForNotification('', 'xx')).toBe('en.sahih');
  });
});
