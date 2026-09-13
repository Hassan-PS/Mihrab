/**
 * Typography Arabic-text helper tests — task #69, updated for the
 * look-and-feel upgrade (fonts actually bundled + applied).
 *
 * Locks in the family-name contract that the iOS Info.plist UIAppFonts
 * entries and the Android assets/fonts/ filenames must match. If any
 * future renaming drifts these apart, the corresponding font silently
 * falls back to the system face — this test catches that drift.
 *
 * Canonical contract:
 *   • body  → "Amiri"        (iOS family name; Android file Amiri.ttf)
 *   • quran → "Amiri Quran"  on iOS (internal family name of
 *              AmiriQuran.ttf) / "AmiriQuran" on Android (asset filename).
 * Jest runs with Platform.OS === 'ios', so the iOS names are asserted.
 */

import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

import { FONTS, arabicTextStyle } from '../src/theme/typography';

const ANDROID_FONTS = path.join(
  __dirname,
  '..',
  'android/app/src/main/assets/fonts',
);

describe('FONTS', () => {
  test('exposes the canonical Arabic family names', () => {
    expect(FONTS.arabicBody).toBe('Amiri');
    // Platform.select resolves the iOS branch under Jest's default platform.
    expect(FONTS.arabicQuran).toBe('Amiri Quran');
  });

  test('primary Latin face is undefined (system default)', () => {
    expect(FONTS.primary).toBeUndefined();
  });
});

describe('arabicTextStyle', () => {
  test('quran kind picks the Amiri Quran face', () => {
    expect(arabicTextStyle('quran')).toEqual({ fontFamily: 'Amiri Quran' });
  });

  test('body kind picks the Amiri face', () => {
    expect(arabicTextStyle('body')).toEqual({ fontFamily: 'Amiri' });
  });

  test('default is body (the more common use case)', () => {
    expect(arabicTextStyle()).toEqual({ fontFamily: 'Amiri' });
  });
});

/**
 * Android resolves a custom font by its asset FILENAME, so every face
 * the app asks for has to sit here under exactly that name — and every
 * byte in this directory is paid for on every Android download.
 *
 * Both halves of that sentence matter. The directory carried a
 * byte-identical `Amiri-Regular.ttf` beside `Amiri.ttf` for months —
 * 431 KB on every install — because `SalamScreen` hardcoded the iOS
 * filename behind a `Platform.select` instead of asking `FONTS`. The
 * duplicate cost nothing visible, which is why it survived: a font that
 * resolves looks exactly like a font that resolves twice.
 */
describe('the Android font assets', () => {
  const files = readdirSync(ANDROID_FONTS)
    .filter(name => name.endsWith('.ttf') || name.endsWith('.otf'))
    .sort();

  test('are exactly the three bundled faces', () => {
    expect(files).toEqual(['Amiri.ttf', 'AmiriQuran.ttf', 'SurahNames.ttf']);
  });

  test('hold no two copies of the same font', () => {
    const byHash = new Map<string, string>();
    for (const name of files) {
      const hash = createHash('sha256')
        .update(readFileSync(path.join(ANDROID_FONTS, name)))
        .digest('hex');
      const seen = byHash.get(hash);
      // A named expectation beats a bare `toBeUndefined()` — the failure
      // should say which two files, not just "expected undefined".
      expect(seen ? `${name} duplicates ${seen}` : name).toBe(name);
      byHash.set(hash, name);
    }
  });

  test('include the face FONTS.arabicBody asks for by filename', () => {
    // Jest reports Platform.OS === 'ios', where the family name happens
    // to equal the Android filename for this one face. That coincidence
    // is what makes the assertion cheap; `scripts/font-check.js` holds
    // the general per-platform mapping.
    expect(files).toContain(`${FONTS.arabicBody}.ttf`);
  });
});
