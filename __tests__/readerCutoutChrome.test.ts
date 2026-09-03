/**
 * The Dynamic Island is a hole in the window, and both orientations of the
 * muṣḥaf had to give it room the wrong way.
 *
 * PORTRAIT: the reader padded the whole window down by the top inset, so a
 * 59pt strip of page colour carried a black pill in the middle of it, and
 * the page header row — a surah name at one end, a tone pill at the other —
 * sat below that. The island is in the MIDDLE; the row's two ends never
 * wanted those points.
 *
 * LANDSCAPE: the cutout moves to one end of the long edge, straight over
 * the ayah sheet's text and controls.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the page header shares the cutout band', () => {
  const reader = read('src/quran/MushafPhoneReader.tsx');

  it('does not pad the window down by the top inset', () => {
    expect(reader).not.toMatch(/paddingTop: isFullscreen \? insets\.top/);
  });

  // Centred on the island rather than under it, and only in fullscreen —
  // out of fullscreen the navigator's own header holds that room.
  it('centres the row on the cutout in fullscreen only', () => {
    expect(reader).toContain('const islandPad = isFullscreen');
    expect(reader).toContain(
      'insets.top / 2 - PAGE_HEADER_CONTENT_H / 2 - PAGE_HEADER_PAD_TOP',
    );
  });

  // Whatever is above the page inside an item is chrome the geometry has to
  // take off the viewport, or the fitted page overflows by that much.
  it('tells the geometry about it', () => {
    expect(reader).toContain('const navPad = chromePad + islandPad;');
  });

  // A long surah name must not run under the cutout: the label gets the
  // near half of the window and no more.
  it('caps the label at the near half of the row', () => {
    const core = read('src/quran/mushafReaderCore.tsx');
    expect(core).toContain('isFullscreen && styles.pageHeaderTextIsland');
    expect(core).toContain("pageHeaderTextIsland: { maxWidth: '38%' }");
  });
});

describe('the ayah sheet clears the cutout in landscape', () => {
  const sheet = read('src/quran/mushaf/AyahActionSheet.tsx');

  it('takes the side insets on itself, symmetrically', () => {
    expect(sheet).toContain(
      'const sideInset = Math.max(insets.left, insets.right);',
    );
    expect(sheet).toContain('paddingStart: SHEET_H_PADDING + sideInset');
    expect(sheet).toContain('paddingEnd: SHEET_H_PADDING + sideInset');
  });

  it('and the bottom inset under its actions', () => {
    expect(sheet).toContain(
      'paddingBottom: SHEET_BOTTOM_PADDING + insets.bottom',
    );
  });
});
