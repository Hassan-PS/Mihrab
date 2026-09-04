/**
 * A rotation must never show two pages.
 *
 * The pager's items are exactly one viewport wide and its scroll offset is
 * a multiple of that width. A rotation changes the width at once and the
 * offset a frame later (`reanchor`, in an effect), so in between a
 * landscape-wide window was showing an offset computed for a portrait-wide
 * item: two pages side by side, sliding into one. Reported as the reader
 * looking fragile, and it is — nothing about a phone muṣḥaf should ever
 * show a spread.
 */
import fs from 'fs';
import path from 'path';

import {
  phoneGeometryFits,
  phonePageGeometry,
  geometryKey,
} from '../src/quran/phonePageGeometry';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const portrait = {
  width: 390,
  height: 844,
  sideInset: 0,
  navPad: 0,
  listH: 720,
};
const landscape = { ...portrait, width: 844, height: 390, listH: 300 };

describe('a geometry knows which window it was computed for', () => {
  it('carries the item width', () => {
    expect(phonePageGeometry(portrait)!.pageWidth).toBe(390);
    expect(phonePageGeometry(landscape)!.pageWidth).toBe(844);
  });

  it('fits the window it came from, and no other', () => {
    const g = phonePageGeometry(portrait);
    expect(phoneGeometryFits(g, 390)).toBe(true);
    expect(phoneGeometryFits(g, 844)).toBe(false);
    expect(phoneGeometryFits(null, 390)).toBe(false);
  });

  // Two windows can want the same text width — landscape caps it at the
  // short side's zoom — so the width has to be part of the identity or a
  // stale geometry could pass for a fresh one.
  it('is part of what makes two geometries different', () => {
    expect(geometryKey(phonePageGeometry(portrait))).not.toBe(
      geometryKey(phonePageGeometry(landscape)),
    );
  });
});

describe('the pager is covered while the two disagree', () => {
  it.each([
    'src/quran/MushafPhoneReader.tsx',
    'src/quran/MushafSpreadReader.tsx',
  ])('%s covers it in the page colour', file => {
    const source = read(file);
    expect(source).toContain('pointerEvents="none"');
    expect(source).toMatch(
      /StyleSheet\.absoluteFill, \{ backgroundColor: pageBg \}/,
    );
  });
});
