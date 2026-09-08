/**
 * Phase 5 of docs/design/redesign-plan.md — the two screens the plan
 * singles out: the Qibla as one instrument, and the immersive reader.
 *
 * Source-text tests, the repo's convention: each one was verified by
 * breaking the thing it watches and seeing it fail.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  HEADER_RESERVE,
  PAGE_TOP_GAP,
  FOOTER_GAP,
  phonePageGeometry,
} from '../src/quran/phonePageGeometry';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('the Qibla is one instrument', () => {
  const dial = read('src/screens/compass/CompassDial.tsx');
  const screen = read('src/screens/CompassScreen.tsx');

  it('draws the dial as one SVG, not nested views', () => {
    expect(dial).toMatch(/<Svg /);
    // Ticks, cardinals and the needle all live in the same picture.
    expect(dial).toMatch(/rotate\(\$\{needleDeg\}/);
    expect(dial).toMatch(/strokeDasharray/); // the signal arc
    expect(dial).not.toMatch(/🕋/); // no emoji Kaaba
  });

  it('keeps the needle tip inside the numeral ring', () => {
    // Numerals sit at R − 24; the Kaaba must not cover the figure it points at.
    const numerals = /polar\(R - (\d+), deg\)/.exec(dial);
    const tip = /const tip = polar\(R - (\d+), 0\)/.exec(dial);
    expect(numerals && tip).toBeTruthy();
    expect(Number(tip![1])).toBeGreaterThan(Number(numerals![1]) + 8);
  });

  it('shows the bearing first, the dial under it, and the rest as lines', () => {
    const order = ['<BearingHeader', '<CompassDial', '<SignalIndicator', '<StatusBanners'].map(s =>
      screen.indexOf(s),
    );
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(read('src/screens/compass/SignalIndicator.tsx')).toMatch(/InfoButton/);
    expect(read('src/screens/compass/StatusBanners.tsx')).toMatch(/InfoButton/);
  });
});

describe('the immersive reader', () => {
  const screen = read('src/screens/quran/MushafSurahScreen.tsx');
  const phone = read('src/quran/MushafPhoneReader.tsx');
  const scrubber = read('src/quran/MushafPageScrubber.tsx');

  it('paints the header in the page tone on Android as well as iOS', () => {
    expect(screen).toMatch(/headerStyle: \{ backgroundColor: TONE_PAGE_BG\[tone\] \}/);
    expect(screen).toMatch(/headerTintColor: ink/);
    // No longer gated on iOS.
    expect(screen).not.toMatch(/const pageChrome =\s*\n?\s*isIOS && quranHydrated/);
  });

  it('gives the status bar the page ink in both readers', () => {
    for (const f of ['src/quran/MushafPhoneReader.tsx', 'src/quran/MushafSpreadReader.tsx']) {
      expect(read(f)).toMatch(/barStyle=\{toneIsDark\(tone\) \? 'light-content' : 'dark-content'\}/);
    }
  });

  it('has icons, not words, for audio and translation in the header', () => {
    expect(screen).not.toMatch(/quran\.audioButton/);
    expect(screen).not.toMatch(/quran\.viewToggleTranslation/);
    expect(screen).toMatch(/<TilawahIcon color=\{ink\}/);
    expect(screen).toMatch(/<TranslationIcon color=\{ink\}/);
    // The words survive where they matter.
    expect(screen).toMatch(/accessibilityLabel=\{t\('quran\.playbackSettings'/);
    expect(screen).toMatch(/'quran\.switchToTranslation'/);
  });

  it('puts juz and tone in the page bar, and drops the row above the page', () => {
    expect(scrubber).toMatch(/showJuz/);
    expect(scrubber).toMatch(/\{trailing\}/);
    expect(phone).toMatch(/showJuz\s*\n(\s*chrome=\{[^}]*\}\n)?\s*trailing=\{\s*\n?\s*<MushafToneButton/);
    // Out of fullscreen there is no page-header row — only a gap.
    expect(phone).toMatch(
      /isFullscreen \? \(\s*<MushafPageHeader[\s\S]*?show="label"[\s\S]*?\) : \(\s*<View style=\{styles\.pageTopGap\} \/>/,
    );
  });

  it('colours the page bar from the page tone, not the app palette', () => {
    // A dark app theme on a paper page put near-black boxes on white.
    expect(scrubber).toMatch(/const c: ToneChrome = chrome \?\? \{/);
    expect(scrubber).not.toMatch(/backgroundColor: palette\./);
    expect(scrubber).not.toMatch(/color: palette\./);
    for (const f of ['src/quran/MushafPhoneReader.tsx', 'src/quran/MushafSpreadReader.tsx']) {
      expect(read(f)).toMatch(/chrome=\{TONE_CHROME\[tone\]\}/);
    }
    // Ink on ground, in every tone: the night chrome is light on dark.
    const { TONE_CHROME, TONE_PAGE_BG } = require('../src/quran/mushafTone');
    expect(TONE_CHROME.night.ink).toMatch(/^#f/i);
    expect(TONE_CHROME.paper.ink).toMatch(/^#1/i);
    expect(TONE_CHROME.paper.card).toBe(TONE_PAGE_BG.paper);
  });

  it('hands the row’s height back to the page out of fullscreen', () => {
    const base = { width: 393, height: 852, sideInset: 0, navPad: 0, listH: 720 };
    const out = phonePageGeometry({ ...base, headerReserve: PAGE_TOP_GAP })!;
    const full = phonePageGeometry({ ...base, headerReserve: HEADER_RESERVE })!;
    expect(full.viewportH).toBe(720 - HEADER_RESERVE - FOOTER_GAP);
    expect(out.viewportH - full.viewportH).toBe(HEADER_RESERVE - PAGE_TOP_GAP);
    expect(PAGE_TOP_GAP).toBeGreaterThan(0);
    expect(PAGE_TOP_GAP).toBeLessThan(HEADER_RESERVE);
    // And the reader chooses by mode.
    expect(phone).toMatch(/headerReserve: isFullscreen \? HEADER_RESERVE : PAGE_TOP_GAP/);
  });
});
