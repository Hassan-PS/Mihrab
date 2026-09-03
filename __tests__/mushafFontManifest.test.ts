/**
 * A page font is the right font only when its size is the manifest's.
 *
 * Twenty fonts on the release were cut short of their pages, and a device
 * that had fetched them held them at the right name and a plausible size
 * for ever (2026-09-03: "له مج مح مخ" at the foot of page 564). The manifest
 * is what lets a store tell the font it has from the font it should have.
 */
import {
  MIN_FONT_BYTES,
  expectedFontBytes,
  fontFileState,
  pageOfFileName,
} from '../src/quran/mushafFontStore';
import manifest from '../src/quran/data/mushafFontManifest.json';
import { MUSHAF_TOTAL_PAGES } from '../src/quran/mushafImages';

jest.mock('../src/native/MushafFont', () => ({
  isValidFontFile: jest.fn(async () => true),
}));

describe('the manifest', () => {
  it('names the release the fonts come from', () => {
    expect(manifest.release).toBe('mushaf-fonts-v2');
  });

  it('has a plausible size for every page', () => {
    expect(manifest.bytes).toHaveLength(MUSHAF_TOTAL_PAGES);
    for (const bytes of manifest.bytes) {
      expect(bytes).toBeGreaterThanOrEqual(MIN_FONT_BYTES);
      expect(Number.isInteger(bytes)).toBe(true);
    }
  });

  it('is read by page number, clamped to the muṣḥaf', () => {
    expect(expectedFontBytes(1)).toBe(manifest.bytes[0]);
    expect(expectedFontBytes(564)).toBe(manifest.bytes[563]);
    expect(expectedFontBytes(0)).toBe(manifest.bytes[0]);
    expect(expectedFontBytes(9_999)).toBe(manifest.bytes[MUSHAF_TOTAL_PAGES - 1]);
  });
});

describe('a font on disk', () => {
  it('is ok at exactly the manifest size', () => {
    expect(fontFileState(expectedFontBytes(564), 564)).toBe('ok');
  });

  it('is stale at any other plausible size — the twenty bad fonts were large enough', () => {
    // The release's old page 564: 284 752 bytes, a font with four words missing.
    expect(fontFileState(284_752, 564)).toBe('stale');
    expect(fontFileState(expectedFontBytes(564) + 1, 564)).toBe('stale');
  });

  it('is missing when too small to be a font at all', () => {
    expect(fontFileState(0, 564)).toBe('missing');
    expect(fontFileState(MIN_FONT_BYTES - 1, 564)).toBe('missing');
    expect(fontFileState(Number.NaN, 564)).toBe('missing');
  });
});

describe('the store directory listing', () => {
  it('maps a font file to its page and ignores everything else', () => {
    expect(pageOfFileName('QCF2564.ttf')).toBe(564);
    expect(pageOfFileName('QCF2001.ttf')).toBe(1);
    expect(pageOfFileName('QCF2604.ttf')).toBe(604);
    expect(pageOfFileName('QCF2605.ttf')).toBeNull();
    expect(pageOfFileName('QCF2300.ttf.1000.ttf')).toBeNull();
    expect(pageOfFileName('QCF2564.ttf.part')).toBeNull();
    expect(pageOfFileName('.DS_Store')).toBeNull();
  });
});
