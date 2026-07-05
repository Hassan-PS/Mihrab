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

import { FONTS, arabicTextStyle } from '../src/theme/typography';

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
