/**
 * The reader's chrome keeps answering the mouse.
 *
 * Reported on the Mac: the Audio / Tafsir / riwayah chips at the top go
 * dead — most reliably after the window is resized, also around a trip
 * through fullscreen and after tapping about. Two things behind it, and
 * both are about a view outliving the layout it was given.
 *
 * 1. Those chips are a React tree hosted inside the NATIVE navigation bar.
 *    Nothing in the header effect's inputs changes when a window is
 *    dragged wider, so the row was never re-rendered and kept the frames
 *    it was laid out with at the old width — drawn in the right place by
 *    UIKit, answering clicks somewhere else.
 *
 * 2. A <Modal> that is dismissed but still mounted is, on Mac Catalyst, a
 *    presentation the window is still holding. The ayah sheet stayed
 *    mounted from the first tap on an ayah until the reader was left, and
 *    the riwayah picker for the whole life of the screen.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { act, create } from 'react-test-renderer';

// The picker is rendered for real here — the point of the test is whether
// it puts a <Modal> in the tree — so its two context reads are stubbed
// rather than wrapped in providers it does not otherwise need.
jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: {
      card: '#fff',
      text: '#000',
      muted: '#888',
      accent: '#0a0',
      accentBg: '#efe',
      accentSolid: '#0a0',
      border: '#ddd',
      bg: '#fff',
      overlay: '#0008',
    },
  }),
}));

import { RiwayahPicker } from '../src/quran/RiwayahPicker';

const ROOT = path.join(__dirname, '..');
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), 'utf8');

const mushaf = read('src', 'screens', 'quran', 'MushafSurahScreen.tsx');
const translation = read('src', 'screens', 'quran', 'TranslationSurahScreen.tsx');
const core = read('src', 'quran', 'mushafReaderCore.tsx');

describe('the header row is rebuilt when the window changes size', () => {
  for (const [name, src] of [
    ['the muṣḥaf', mushaf],
    ['the translation reader', translation],
  ] as const) {
    it(`${name} keys its chips on the settled window size`, () => {
      expect(src).toMatch(/key=\{`chips-\$\{headerW\}x\$\{headerH\}`\}/);
    });

    it(`${name} re-issues the header when that size changes`, () => {
      // In the effect's dependency list, or the key never gets the chance
      // to change: setOptions is what hands the header to the navigator.
      const deps = src.slice(src.indexOf('headerRight: () => ('));
      expect(deps).toMatch(/\n\s*headerW,\n\s*headerH,\n\s*\]\);/);
    });

    it(`${name} settles the size rather than following every frame`, () => {
      // A drag is a hundred widths; only the last one is worth a rebuild.
      expect(src).toMatch(/useSettledMeasure\(Math\.round\(win\.width\)\)/);
      expect(src).toMatch(/useSettledMeasure\(Math\.round\(win\.height\)\)/);
    });
  }
});

describe('dismissed sheets do not stay mounted', () => {
  const picker = (visible: boolean) => {
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <RiwayahPicker
          visible={visible}
          current="hafs"
          onClose={() => {}}
          onPick={() => {}}
        />,
      );
    });
    return tree!.toJSON();
  };

  it('the riwayah picker renders nothing while it is closed', () => {
    expect(picker(false)).toBeNull();
  });

  it('the riwayah picker renders once it is open', () => {
    expect(picker(true)).not.toBeNull();
  });

  it('the ayah sheet is let go once it has finished leaving', () => {
    // `selected` is what keeps the Modal mounted; closing only ever
    // cleared `sheetVisible`.
    expect(core).toMatch(/if \(sheetVisible \|\| selected == null\) return;/);
    expect(core).toMatch(/setTimeout\(\(\) => setSelected\(null\), 400\)/);
  });
});
