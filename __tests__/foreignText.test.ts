/**
 * Text that does not run the way the layout does.
 *
 * The one combination this is for is a reader in Urdu — mirrored layout —
 * looking at Latin script, which is what a dua's pronunciation always is
 * and what its meaning and a release note are for every language with no
 * translation of its own. Seen on a device before any of this was
 * written: the paragraph hugged the right edge with a ragged left one and
 * its full stop came out at the start of the line.
 *
 * The value that needs a test more than the others is the alignment. It
 * is `right`, for LEFT-to-right text, and every instinct says `left` —
 * so the reasoning lives in the module's header and the answer is pinned
 * here, in both directions.
 */
import {
  ALIGN_TO_OWN_SIDE,
  foreignText,
  LRI,
  PDI,
  RLI,
} from '../src/i18n/foreignText';

describe('when the text and the layout agree', () => {
  it('does nothing at all', () => {
    for (const [text, reader] of [
      ['en', 'en'],
      ['en', 'sv'],
      ['sv', 'de'],
      ['ar', 'ur'],
      ['ur', 'ar'],
    ]) {
      const f = foreignText(text, reader);
      expect(f).toEqual({
        mismatched: false,
        style: null,
        open: '',
        close: '',
      });
    }
  });

  it('compares directions, not languages', () => {
    // An English note read in Swedish is not foreign in the sense that
    // matters here, and giving it an isolate would be noise in the tree.
    expect(foreignText('en', 'fr').mismatched).toBe(false);
  });
});

describe('when they disagree', () => {
  const englishInUrdu = foreignText('en', 'ur');
  const arabicInEnglish = foreignText('ar', 'en');

  it('says so', () => {
    expect(englishInUrdu.mismatched).toBe(true);
    expect(arabicInEnglish.mismatched).toBe(true);
  });

  it('sets the direction the TEXT runs, not the layout', () => {
    expect(englishInUrdu.style?.writingDirection).toBe('ltr');
    expect(arabicInEnglish.style?.writingDirection).toBe('rtl');
  });

  it('aligns to `right` — both ways round', () => {
    // Not a typo, and not symmetric-looking by accident. Neither
    // platform treats left/right as physical once a layout is mirrored;
    // iOS mirrors the word against the layout, Android against the text
    // when the two disagree, and in THIS case both send `right` to the
    // text's own starting edge. `left` goes the other way on both.
    expect(ALIGN_TO_OWN_SIDE).toBe('right');
    expect(englishInUrdu.style?.textAlign).toBe('right');
    expect(arabicInEnglish.style?.textAlign).toBe('right');
  });

  it('isolates the run in its own direction', () => {
    expect(englishInUrdu.open).toBe(LRI);
    expect(arabicInEnglish.open).toBe(RLI);
    expect(englishInUrdu.close).toBe(PDI);
    expect(arabicInEnglish.close).toBe(PDI);
  });

  it('uses the isolate characters and not the embedding ones', () => {
    // LRE/RLE (202A/202B) leak into the surrounding paragraph; the
    // isolates do not, which is the whole reason to prefer them.
    expect(LRI.charCodeAt(0)).toBe(0x2066);
    expect(RLI.charCodeAt(0)).toBe(0x2067);
    expect(PDI.charCodeAt(0)).toBe(0x2069);
  });
});

describe('nonsense in', () => {
  it('is treated as left-to-right, like the rest of the app', () => {
    expect(foreignText(undefined, undefined).mismatched).toBe(false);
    expect(foreignText('', 'en').mismatched).toBe(false);
    expect(foreignText('en', null).mismatched).toBe(false);
    expect(foreignText(null, 'ur').mismatched).toBe(true);
  });

  it('reads a regional code by its language', () => {
    expect(foreignText('en-US', 'ur-PK').mismatched).toBe(true);
    expect(foreignText('en-GB', 'en-US').mismatched).toBe(false);
  });
});
