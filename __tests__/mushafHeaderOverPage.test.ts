/**
 * The muṣḥaf's navigation bar on a Mac (v2.24.1), reported together:
 * "it is different colour than the mushaf and the surah name is off
 * centre".
 *
 * Both are the same mistake in two places — chrome that models the window
 * instead of the page. Catalyst is `Platform.OS === 'ios'`, so the bar
 * took the iPhone's blur branch and drew as a system material over cream
 * paper; and the bar spans the whole window while the page it titles
 * starts after the index sidebar, so a centred title sat half a sidebar
 * to the left of the thing it names.
 *
 * Source-pinned: a navigation-bar appearance and a centred titleView are
 * UIKit's to lay out, and nothing a renderer here can observe.
 */
import fs from 'fs';
import path from 'path';

import { SIDEBAR_WIDTH, SIDEBAR_MIN_READER, sidebarFits, sidebarShown } from '../src/quran/MushafIndexSidebar';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('one rule for whether the sidebar is up', () => {
  it('needs the sidebar and a real reader beside it', () => {
    expect(sidebarFits(SIDEBAR_WIDTH + SIDEBAR_MIN_READER)).toBe(true);
    expect(sidebarFits(SIDEBAR_WIDTH + SIDEBAR_MIN_READER - 1)).toBe(false);
    // A phone-shaped window is not a close call.
    expect(sidebarFits(430)).toBe(false);
  });

  it('is asked by the reader and by the header, never re-derived', () => {
    const reader = read('src/quran/MushafSpreadReader.tsx');
    expect(reader).toContain('sidebarShown(boxW)');
    // The old inline arithmetic is gone from both callers.
    expect(reader).not.toMatch(/SIDEBAR_WIDTH\s*\+\s*620/);
    const screen = read('src/screens/quran/MushafSurahScreen.tsx');
    expect(screen).toContain('sidebarShown(headerW)');
    expect(screen).not.toMatch(/sidebarFits\(headerW\)/);
    expect(screen).not.toMatch(/SIDEBAR_WIDTH\s*\+\s*620/);
  });

  /**
   * Reported from a phone in landscape: the surah name sat well right of
   * centre. The window was wide enough for a sidebar, so the header moved
   * the title half a sidebar along — but the phone reader never draws
   * one. Room is not the same question as presence.
   */
  it('is never up on a phone, however wide the window turns', () => {
    jest.isolateModules(() => {
      jest.doMock('../src/responsive/deviceClass', () => ({ DEVICE_CLASS: 'phone' }));
      const phone = require('../src/quran/MushafIndexSidebar') as typeof import('../src/quran/MushafIndexSidebar');
      const wide = phone.SIDEBAR_WIDTH + phone.SIDEBAR_MIN_READER + 200;
      expect(phone.sidebarFits(wide)).toBe(true); // room, yes …
      expect(phone.sidebarShown(wide)).toBe(false); // … but no index to put in it
      expect(phone.sidebarShown(2000)).toBe(false);
    });
  });

  it('and is up on a large device exactly when it fits', () => {
    // Jest's screen is 750×1334, which `deviceClass` reads as large.
    expect(sidebarShown(SIDEBAR_WIDTH + SIDEBAR_MIN_READER)).toBe(true);
    expect(sidebarShown(SIDEBAR_WIDTH + SIDEBAR_MIN_READER - 1)).toBe(false);
  });
});

describe('the bar is the page, on every platform', () => {
  const screen = read('src/screens/quran/MushafSurahScreen.tsx');

  it('PAINTS the Mac bar, because a translucent one ignores the colour', () => {
    // Verified on the Mac: a build with the bar set to flat red and the
    // blur off came out identical to one without it — the root
    // navigator's `headerTransparent` makes Catalyst ignore
    // `headerStyle.backgroundColor` outright. A `headerBackground` view
    // is what actually reaches the strip.
    expect(screen).toMatch(/isMacCatalyst\s*\n?\s*\?\s*\{[\s\S]{0,120}headerBackground: \(\) => \(/);
    expect(screen).toMatch(
      /headerBackground[\s\S]{0,120}backgroundColor: TONE_PAGE_BG\[tone\]/,
    );
    // And not by asking, which is what did not work.
    expect(screen).not.toMatch(/\n\s*headerBlurEffect: 'none'/);
  });

  it('leaves the strip over the index looking like the index', () => {
    // The bar spans the window; the window is two surfaces. Physical
    // side, like the title shift — `left`/`right`, not `start`/`end`.
    expect(screen).toMatch(
      /sidebarUp \?[\s\S]{0,260}width: SIDEBAR_WIDTH,[\s\S]{0,80}backgroundColor: palette\.bg/,
    );
    expect(screen).toMatch(/isRtl \? \{ right: 0 \} : \{ left: 0 \}/);
  });

  it('still blurs on a real iOS device, and floats painted the page colour on Android', () => {
    expect(screen).toMatch(
      /:\s*isIOS\s*\n?\s*\?\s*\{\s*headerBlurEffect:\s*\(dark \? 'dark' : 'light'\)/,
    );
    // Floating, not in the flow: hiding an in-flow header resized the
    // content and flashed the navigator's background for a frame at the
    // bottom of the window on the way into fullscreen.
    expect(screen).toMatch(
      /headerTransparent:\s*true,\s*\n\s*headerStyle:\s*\{\s*backgroundColor:\s*TONE_PAGE_BG\[tone\]\s*\},?\s*\n\s*\};/,
    );
  });
});

describe('the title is centred over the page', () => {
  const screen = read('src/screens/quran/MushafSurahScreen.tsx');

  it('moves by exactly half the sidebar, and only when it is there', () => {
    expect(screen).toContain('(SIDEBAR_WIDTH / 2)');
    expect(screen).toMatch(/titleShift\s*=\s*sidebarUp/);
    expect(screen).toMatch(/titleShift !== 0 \? \{ transform: \[\{ translateX: titleShift \}\] \}/);
  });

  it('chooses the direction by the layout, so Urdu moves with Arabic', () => {
    expect(screen).toContain('isRtlLanguage(i18n.language)');
    // …and a language change re-issues the header.
    expect(screen).toMatch(/i18n\.language,/);
  });
});
