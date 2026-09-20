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

  // A long surah name must not run under the cutout. Where the cutout's
  // position is known (Android, `DisplayCutout`) the label is capped where
  // the lens begins and put on the side away from it; where it is not
  // (iOS's centred island) it keeps the near half of the window and no more.
  it('caps the label short of the camera', () => {
    const core = read('src/quran/mushafReaderCore.tsx');
    expect(core).toContain('island && labelMaxWidth == null && styles.pageHeaderTextIsland');
    expect(core).toContain('labelMaxWidth != null && { maxWidth: labelMaxWidth }');
    expect(core).toContain("pageHeaderTextIsland: { maxWidth: '38%' }");
    const phone = read('src/quran/MushafPhoneReader.tsx');
    expect(phone).toMatch(/classifyTopCutout\(cutout, width\)/);
  });

  /**
   * ── AND ONLY WHERE THERE IS A CAMERA IN THE MIDDLE ──────────────────
   *
   * The cap used to apply wherever no exact `labelMaxWidth` was given,
   * which is every call the SPREAD reader makes. An iPad has no Dynamic
   * Island and a Mac has no notch over the muṣḥaf, so on the Mac in
   * fullscreen the rule was taking 62% off a name for a hole that was not
   * there — and with the session dot and the page mark added to the row
   * in v2.24.0, the name came out as a letter and an ellipsis.
   *
   * `island` is the phone saying it has one. The spread reader does not
   * pass it.
   */
  it('is a phone rule: only the phone asks for it', () => {
    const phone = read('src/quran/MushafPhoneReader.tsx');
    expect(phone).toMatch(/labelMaxWidth=\{label\.maxWidth\}[\s\S]{0,400}\n\s+island\n/);
    const spread = read('src/quran/MushafSpreadReader.tsx');
    expect(spread).not.toMatch(/\bisland\b/);
  });

  /**
   * A percentage is a fraction OF something. The row is the flex child of
   * a header that is one column wide; the Text sits inside a row that
   * shrinks to its own content, so a percentage there was a fraction of
   * whatever the text measured — which is the text asking itself how wide
   * it is allowed to be.
   */
  it('caps the row, which has a width, not the text, which does not', () => {
    const core = read('src/quran/mushafReaderCore.tsx');
    const row = core.indexOf('styles.pageHeaderLabelRow,');
    const island = core.indexOf('island && labelMaxWidth == null');
    const text = core.indexOf('styles.pageHeaderText,');
    expect(row).toBeGreaterThan(-1);
    expect(island).toBeGreaterThan(row);
    expect(island).toBeLessThan(text);
    expect(core).toContain('pageHeaderTextFlex: { flexShrink: 1 }');
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
