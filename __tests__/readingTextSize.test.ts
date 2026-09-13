/**
 * The reader's text size — the ladder, and what it is allowed to touch.
 *
 * The arithmetic is small enough to look right and still be wrong in the
 * two ways that matter on a phone: a scale that rounds the font size and
 * the line height apart (text that crowds itself at one rung and gapes at
 * the next), and a stored value between rungs that leaves `+` jumping to
 * somewhere the reader did not ask for.
 *
 * The last describe is the one that would fail a careless future edit: it
 * reads the source of every surface that draws this text and asserts that
 * the Arabic, the compact cards and the shared image are still NOT wired
 * to it. Those exclusions are the design, and nothing else records them.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  canGrowReading,
  canShrinkReading,
  clampReadingScale,
  DEFAULT_READING_SCALE,
  MAX_READING_SCALE,
  MIN_READING_SCALE,
  READING_BASE,
  READING_BASE_UNLEADED,
  READING_SCALES,
  readingTextStyle,
  stepReadingScale,
} from '../src/theme/readingText';
import { DEFAULT_SETTINGS } from '../src/settings/types';

const SRC = path.join(__dirname, '..', 'src');
const read = (...p: string[]) => readFileSync(path.join(SRC, ...p), 'utf8');

describe('the ladder', () => {
  it('ascends, with the shipped size on it', () => {
    expect([...READING_SCALES]).toEqual([...READING_SCALES].sort((a, b) => a - b));
    expect(READING_SCALES).toContain(DEFAULT_READING_SCALE);
    expect(MIN_READING_SCALE).toBeLessThan(DEFAULT_READING_SCALE);
    expect(MAX_READING_SCALE).toBeGreaterThan(DEFAULT_READING_SCALE);
  });

  it('is what a fresh install starts on', () => {
    expect(DEFAULT_SETTINGS.readingTextScale).toBe(DEFAULT_READING_SCALE);
  });

  it('changes something visible at every rung', () => {
    // A rung that rounds to the same font size as the one below it is a
    // tap that does nothing, which reads as a broken button.
    const sizes = READING_SCALES.map(
      s => readingTextStyle(READING_BASE, s).fontSize,
    );
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });

  it('is crossed in a handful of taps, not twenty', () => {
    expect(READING_SCALES.length).toBeLessThanOrEqual(8);
  });
});

describe('stepping', () => {
  it('moves one rung at a time', () => {
    expect(stepReadingScale(1, 1)).toBe(1.15);
    expect(stepReadingScale(1.15, -1)).toBe(1);
  });

  it('stops at both ends rather than wrapping', () => {
    expect(stepReadingScale(MAX_READING_SCALE, 1)).toBe(MAX_READING_SCALE);
    expect(stepReadingScale(MIN_READING_SCALE, -1)).toBe(MIN_READING_SCALE);
    expect(canGrowReading(MAX_READING_SCALE)).toBe(false);
    expect(canShrinkReading(MIN_READING_SCALE)).toBe(false);
    expect(canGrowReading(DEFAULT_READING_SCALE)).toBe(true);
    expect(canShrinkReading(DEFAULT_READING_SCALE)).toBe(true);
  });

  it('walks the whole ladder and back without losing a rung', () => {
    let at: number = MIN_READING_SCALE;
    const up: number[] = [at];
    while (canGrowReading(at)) {
      at = stepReadingScale(at, 1);
      up.push(at);
    }
    expect(up).toEqual([...READING_SCALES]);
    const down: number[] = [at];
    while (canShrinkReading(at)) {
      at = stepReadingScale(at, -1);
      down.push(at);
    }
    expect(down).toEqual([...READING_SCALES].reverse());
  });

  it('steps from a value that is not on the ladder to a rung that is', () => {
    // A restored backup, an older ladder, a hand-edited blob.
    expect(READING_SCALES).toContain(stepReadingScale(1.21, 1));
    expect(READING_SCALES).toContain(stepReadingScale(1.21, -1));
  });
});

describe('what a stored value is taken to mean', () => {
  it('is itself when it is a rung', () => {
    for (const rung of READING_SCALES) expect(clampReadingScale(rung)).toBe(rung);
  });

  it('is the nearest rung when it is between two', () => {
    expect(clampReadingScale(1.2)).toBe(1.15);
    expect(clampReadingScale(1.26)).toBe(1.3);
  });

  it('is the shipped size when it is not a number at all', () => {
    for (const junk of [undefined, null, '1.3', NaN, Infinity, {}, []]) {
      expect(clampReadingScale(junk)).toBe(DEFAULT_READING_SCALE);
    }
  });

  it('is inside the ladder for anything out of range', () => {
    expect(clampReadingScale(-4)).toBe(MIN_READING_SCALE);
    expect(clampReadingScale(99)).toBe(MAX_READING_SCALE);
  });
});

describe('the style it produces', () => {
  it('is the base itself at the shipped size', () => {
    expect(readingTextStyle(READING_BASE, DEFAULT_READING_SCALE)).toEqual(
      READING_BASE,
    );
  });

  it('is whole points, both of them', () => {
    for (const rung of READING_SCALES) {
      const style = readingTextStyle(READING_BASE, rung);
      expect(Number.isInteger(style.fontSize)).toBe(true);
      expect(Number.isInteger(style.lineHeight)).toBe(true);
    }
  });

  it('keeps the leading in proportion at every rung', () => {
    // The failure this prevents: rounding the two independently, so the
    // ratio drifts and one rung crowds while the next gapes.
    const ratio = READING_BASE.lineHeight! / READING_BASE.fontSize;
    for (const rung of READING_SCALES) {
      const style = readingTextStyle(READING_BASE, rung);
      expect(style.lineHeight! / style.fontSize).toBeCloseTo(ratio, 1);
      expect(style.lineHeight!).toBeGreaterThan(style.fontSize);
    }
  });

  it('leaves a base with no leading without one', () => {
    // The dua's transliteration is set without a line height. Inventing
    // one would re-space a paragraph at the size the reader already had,
    // which is not what a size control is for.
    expect(READING_BASE_UNLEADED.lineHeight).toBeUndefined();
    for (const rung of READING_SCALES) {
      expect(
        readingTextStyle(READING_BASE_UNLEADED, rung).lineHeight,
      ).toBeUndefined();
    }
  });

  it('grows and shrinks in the direction it says', () => {
    const base = readingTextStyle(READING_BASE, DEFAULT_READING_SCALE).fontSize;
    expect(readingTextStyle(READING_BASE, MAX_READING_SCALE).fontSize)
      .toBeGreaterThan(base);
    expect(readingTextStyle(READING_BASE, MIN_READING_SCALE).fontSize)
      .toBeLessThan(base);
  });
});

describe('the surfaces it reaches, and the ones it must not', () => {
  const wired = [
    ['screens/quran/TranslationSurahScreen.tsx', 'the surah reader'],
    ['quran/mushaf/AyahActionSheet.tsx', 'the ayah sheet'],
    ['screens/DuasScreen.tsx', 'the dua cards'],
  ] as const;

  for (const [file, what] of wired) {
    it(`${what} draws its long-form text at the reader's size`, () => {
      const src = read(...file.split('/'));
      expect(src).toContain('useReadingText');
      expect(src).toMatch(/readingText\.style\(READING_BASE/);
    });
  }

  it('reaches both of the dua aids, not just the meaning', () => {
    const src = read('screens', 'DuasScreen.tsx');
    expect(src).toContain('readingText.style(READING_BASE_UNLEADED)');
    expect(src).toContain('readingText.style(READING_BASE)');
  });

  it('leaves the Arabic alone', () => {
    // An ayah is typeset, not styled: `arabicTextStyle` hand-pairs every
    // size with a line height that keeps a fatha or kasra cluster
    // unclipped, and none of that follows from a multiplier.
    for (const [file] of wired) {
      const src = read(...file.split('/'));
      for (const line of src.split('\n')) {
        if (!line.includes('readingText.style')) continue;
        expect(line).not.toMatch(/arabic/i);
      }
    }
    const surah = read('screens', 'quran', 'TranslationSurahScreen.tsx');
    expect(surah).toMatch(/styles\.ayahArabic, \{ color: palette\.text \}\]/);
  });

  it('leaves the shared ayah image alone', () => {
    // It is a PNG made on one phone and read on another. Its whole point
    // is being identical wherever it was made from.
    expect(read('quran', 'mushaf', 'ShareAyahModal.tsx')).not.toContain(
      'useReadingText',
    );
  });

  it('leaves the glanced-at cards alone', () => {
    // Verse of the day and search results live in fixed boxes behind
    // `numberOfLines`; growing the text there hides it rather than
    // showing more of it.
    expect(read('screens', 'QuranScreen.tsx')).not.toContain('useReadingText');
  });
});
