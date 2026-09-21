/**
 * The night page is the OLED black — `PALETTE_OLED`'s ground, whatever
 * the app's own "pure black" switch says. The page is the thing a reader
 * stares at longest in the dark; #101010 in a #000000 app was a grey slab
 * in a black frame, and in a #141210 app it still kept every pixel lit.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { TONE_CHROME, TONE_PAGE_BG, toneIsDark } from '../src/quran/mushafTone';
import { PALETTE_OLED } from '../src/theme/tokens';
import { resolveThemePaletteForMode } from '../src/theme/appPalette';

const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the night page on an OLED', () => {
  it('is the OLED palette\'s ground, absolute black', () => {
    expect(PALETTE_OLED.bg).toBe('#000000');
    expect(TONE_PAGE_BG.night).toBe(PALETTE_OLED.bg);
    expect(toneIsDark('night')).toBe(true);
    // The two light tones are untouched.
    expect(TONE_PAGE_BG.paper).toBe('#ffffff');
    expect(TONE_PAGE_BG.sepia).toBe('#F3EBDB');
  });

  it('stands its chrome on that palette\'s lifted surface, with the print\'s own ink', () => {
    expect(TONE_CHROME.night.card).toBe(PALETTE_OLED.surface);
    // A control has to read against black AND against the card.
    expect(TONE_CHROME.night.control).not.toBe(PALETTE_OLED.bg);
    expect(TONE_CHROME.night.control).not.toBe(TONE_CHROME.night.card);
    expect(TONE_CHROME.night.ink).toMatch(/^#f/i);
  });

  it('renders the theme for a night page as the pure-black one, whatever the app is set to', () => {
    const src = read('src/quran/useScrubberChrome.ts');
    expect(src).toMatch(/pureBlackDark: pureBlackDark \|\| toneIsDark\(tone\)/);
    // And that theme really is a black-grounded one — the standard dark
    // theme without the switch is not.
    const base = { appearance: 'dark' as const, useSystemDynamicTheme: false, appAccentId: 'green' as const, appAccentCustomHex: '#22c55e' };
    expect(String(resolveThemePaletteForMode({ ...base, pureBlackDark: true }, true).bg)).toBe('#000000');
    expect(String(resolveThemePaletteForMode({ ...base, pureBlackDark: false }, true).bg)).not.toBe('#000000');
  });
});
