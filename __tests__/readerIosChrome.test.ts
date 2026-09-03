/**
 * Two iOS-only reports from the v2.9 build, both about a floating chrome
 * the platform draws over the app:
 *
 *   • the download strip appeared UNDER the navigation header;
 *   • an ayah could not be selected in fullscreen.
 *
 * Source-pinned, because both are layout and presentation contracts that
 * no unit can observe — see the same idiom in the widget tests.
 */
import fs from 'fs';
import path from 'path';

import { MODAL_ORIENTATIONS } from '../src/components/modalOrientations';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the download strip clears the floating header', () => {
  const source = read('src/quran/MushafReader.tsx');

  it('pads itself past the header, or the cutout in fullscreen', () => {
    expect(source).toContain(
      "Platform.OS !== 'ios' ? 0 : props.isFullscreen ? insets.top : headerHeight",
    );
    expect(source).toContain('paddingTop: stripTop + STRIP_PADDING_TOP');
  });

  // And the reader below must not clear the SAME header a second time, or
  // the page starts two headers down.
  it('tells the reader the header is already cleared', () => {
    expect(source).toContain('chromeCleared: strip != null');
    for (const reader of [
      'src/quran/MushafPhoneReader.tsx',
      'src/quran/MushafSpreadReader.tsx',
    ]) {
      expect(read(reader)).toContain('!props.chromeCleared');
    }
  });
});

describe('a modal in the reader can open in landscape', () => {
  // RN defaults `supportedOrientations` to portrait only, and on iOS that
  // is a rule UIKit enforces: from a landscape muṣḥaf the presentation is
  // refused and the tap does nothing at all.
  it('offers both orientations, and not upside down', () => {
    expect(MODAL_ORIENTATIONS).toEqual(['portrait', 'landscape']);
  });

  it.each([
    'src/quran/mushaf/AyahActionSheet.tsx',
    'src/quran/mushaf/ShareAyahModal.tsx',
    'src/quran/RiwayahPicker.tsx',
    'src/quran/audio/ReciterPickerSheet.tsx',
    'src/quran/CompanionTextControls.tsx',
  ])('%s declares them', file => {
    expect(read(file)).toContain(
      'supportedOrientations={MODAL_ORIENTATIONS}',
    );
  });
});
