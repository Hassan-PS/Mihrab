/**
 * Typography Arabic-text helper tests — task #69.
 *
 * Locks in the family-name contract that the iOS Info.plist UIAppFonts
 * entries and the Android assets/fonts/ filenames must match. If any
 * future renaming drifts these apart, the corresponding font silently
 * falls back to the system face — this test catches that drift.
 */

import { FONTS, arabicTextStyle } from '../src/theme/typography';

describe('FONTS', () => {
  test('exposes the canonical Arabic family names', () => {
    // These strings MUST match:
    //   - The PostScript family name in the .ttf files.
    //   - The `UIAppFonts` entries in ios/PrayerApp/Info.plist.
    //   - The filenames documented in android/app/src/main/assets/fonts/README.md.
    expect(FONTS.arabicQuran).toBe('Amiri');
    expect(FONTS.arabicBody).toBe('Scheherazade New');
  });

  test('primary Latin face is undefined (system default)', () => {
    expect(FONTS.primary).toBeUndefined();
  });
});

describe('arabicTextStyle', () => {
  test('quran kind picks the Amiri Naskh face', () => {
    expect(arabicTextStyle('quran')).toEqual({ fontFamily: 'Amiri' });
  });

  test('body kind picks the Scheherazade New face', () => {
    expect(arabicTextStyle('body')).toEqual({ fontFamily: 'Scheherazade New' });
  });

  test('default is body (the more common use case)', () => {
    expect(arabicTextStyle()).toEqual({ fontFamily: 'Scheherazade New' });
  });
});
