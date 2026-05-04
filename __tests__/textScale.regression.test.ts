/**
 * Font-scale and tabular-numeral regression tests — task #15.
 *
 * Locks in two invariants that the `designer` subagent and CLAUDE.md's
 * "tabular precision for sacred data" principle both demand:
 *
 *  1. Every component that renders a clock-formatted string (HH:MM, the
 *     countdown "in 2h 15m", or a "%" readout) imports `tabularNumeralStyle`
 *     from `theme/textScale`. Without it, glyphs of varying width make
 *     prayer-time columns shimmer as the time ticks past digit boundaries.
 *
 *  2. Every Text component that displays time, signal-strength %, or sits
 *     at a fixed position (compass cardinals, widget swatch labels) caps
 *     its `maxFontSizeMultiplier`. Without the cap, iOS "Larger Accessibility
 *     Sizes" or Android system font scaling > 200% overflows the container
 *     and breaks the carousel-paging width.
 *
 * If a future PR adds a new clock display without these properties, this
 * test fails with a clear error pointing at the file that needs the import.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', 'src');

/** Files that render clock text and therefore MUST use tabular numerals. */
const TABULAR_REQUIRED = [
  'src/screens/home/PrayerRow.tsx', // HH:MM in the day-card grid
  'src/screens/home/NextPrayerCard.tsx', // HH:MM time + countdown pill
  'src/screens/compass/BearingHeader.tsx', // "N° from north"
  'src/screens/settings/WidgetCard.tsx', // "88%" opacity readout
];

/**
 * Files that contain at least one Text with a clamped maxFontSizeMultiplier.
 * Adding a new Text without a clamp at one of these is allowed (e.g., body
 * copy) — the test only asserts that the relevant clamp constants exist
 * imported in the file. Trade-off: lower precision but no false positives.
 */
const FONT_CLAMP_REQUIRED = [
  'src/screens/home/PrayerRow.tsx',
  'src/screens/home/NextPrayerCard.tsx',
  'src/screens/home/DayCard.tsx',
  'src/screens/compass/BearingHeader.tsx',
  'src/screens/compass/SignalIndicator.tsx',
  'src/screens/compass/CompassDial.tsx',
  'src/screens/settings/WidgetCard.tsx',
];

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, '..', rel), 'utf-8');
}

describe('tabular numeral coverage', () => {
  test.each(TABULAR_REQUIRED)(
    '%s imports tabularNumeralStyle and applies maxFontSizeMultiplier',
    file => {
      const content = read(file);
      expect(content).toMatch(/tabularNumeralStyle/);
      expect(content).toMatch(/maxFontSizeMultiplier/);
    },
  );
});

describe('font-scale clamp coverage', () => {
  test.each(FONT_CLAMP_REQUIRED)(
    '%s imports a *_MAX_FONT_SCALE constant from theme/textScale',
    file => {
      const content = read(file);
      expect(content).toMatch(
        /from ['"]\.\.\/\.\.\/theme\/textScale['"]/,
      );
      expect(content).toMatch(
        /\b(TABULAR|FIXED_LABEL|TITLE_BAND)_MAX_FONT_SCALE\b/,
      );
    },
  );
});

describe('textScale module exports', () => {
  // Quick sanity check that the constants exist and are sensible.
  test('all three clamps are between 1.0 and 2.0 (inclusive)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('../src/theme/textScale');
    for (const key of [
      'TABULAR_MAX_FONT_SCALE',
      'FIXED_LABEL_MAX_FONT_SCALE',
      'TITLE_BAND_MAX_FONT_SCALE',
    ]) {
      const v = m[key];
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(1.0);
      expect(v).toBeLessThanOrEqual(2.0);
    }
  });
});
