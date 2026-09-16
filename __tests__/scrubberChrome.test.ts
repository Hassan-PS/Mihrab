/**
 * The mushaf page bar takes the selected theme in the PAGE's mode, not the
 * app's. A night page under a light app used to get the deep light-mode
 * accent (invisible on dark) and unthemed surfaces — the surah bubble's
 * colours fell apart at exactly that mismatch.
 */
import { resolveThemePaletteForMode } from '../src/theme/appPalette';
import { hexToOklch } from '../src/theme/oklch';
import { scrubberChrome, TONE_CHROME, toneIsDark } from '../src/quran/mushafTone';

const verdantGreen = {
  appearance: 'light' as const,
  useSystemDynamicTheme: false,
  pureBlackDark: false,
  appAccentId: 'green' as const,
  appAccentCustomHex: '#22c55e',
  tintedSurfaces: true,
};

describe('scrubber chrome follows the page mode, not the app mode', () => {
  it('night page under a LIGHT app takes the dark accent and dark themed surfaces', () => {
    const page = resolveThemePaletteForMode(verdantGreen, toneIsDark('night'));
    const c = scrubberChrome('night', page);
    expect(c.accent).toBe('#46A081'); // the lifted dark accent, not #1F5F4A
    expect(c.card).not.toBe(TONE_CHROME.night.card); // themed, not the plain tone
    // And themed in the accent's hue.
    const diff = Math.abs(((hexToOklch(c.card).h - hexToOklch('#46A081').h + 540) % 360) - 180);
    expect(diff).toBeLessThanOrEqual(12);
  });

  it('paper page takes the light accent over the tone\'s own chrome', () => {
    const page = resolveThemePaletteForMode(verdantGreen, toneIsDark('paper'));
    const c = scrubberChrome('paper', page);
    expect(c.accent).toBe('#1F5F4A');
    expect(c.card).toBe(TONE_CHROME.paper.card);
    expect(c.ink).toBe(TONE_CHROME.paper.ink);
  });

  it('classic (no colour theme) on a night page: dark accent, plain night chrome', () => {
    const page = resolveThemePaletteForMode({ ...verdantGreen, tintedSurfaces: false }, true);
    const c = scrubberChrome('night', page);
    expect(c.accent).toBe('#46A081');
    expect(c.card).toBe(TONE_CHROME.night.card);
  });

  it('every preset keeps AA ink on its themed night surfaces', () => {
    for (const id of ['green', 'teal', 'blue', 'amber', 'rose', 'violet'] as const) {
      const page = resolveThemePaletteForMode({ ...verdantGreen, appAccentId: id }, true);
      const c = scrubberChrome('night', page);
      expect(c.ink).toBe(page.textSolid);
      expect(c.control).toBe(String(page.controlBg));
    }
  });
});

describe('the page ornament follows the same rule', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pageOrnament, TONE_ORNAMENT: ORN } = require('../src/quran/mushafTone');

  it('themed night page: the surah band takes the dark accent', () => {
    const page = resolveThemePaletteForMode(verdantGreen, true);
    expect(pageOrnament('night', page)).toBe('#46A081');
  });

  it('paper page keeps the print\'s own gold, theme or not', () => {
    const page = resolveThemePaletteForMode(verdantGreen, false);
    expect(pageOrnament('paper', page)).toBe(ORN.paper);
  });

  it('classic night page keeps the night gold', () => {
    const page = resolveThemePaletteForMode({ ...verdantGreen, tintedSurfaces: false }, true);
    expect(pageOrnament('night', page)).toBe(ORN.night);
  });

  it('ornament and scrubber knob agree on a themed night page, every preset', () => {
    for (const id of ['green', 'teal', 'blue', 'amber', 'rose', 'violet'] as const) {
      const page = resolveThemePaletteForMode({ ...verdantGreen, appAccentId: id }, true);
      expect(pageOrnament('night', page)).toBe(scrubberChrome('night', page).accent);
    }
  });
});
