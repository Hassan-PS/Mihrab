/**
 * The bottom of the reader: the mini player, and the system bar under it.
 *
 * Two bugs reported against the v2.9 builds, both about the same few
 * dozen points at the foot of the window:
 *
 *   • a void between the page medallion and the mini player, on both
 *     platforms — the player's height was reserved twice;
 *   • the Android navigation bar staying app-coloured under a sepia or a
 *     night page.
 */
import fs from 'fs';
import path from 'path';

import {
  geometryKey,
  phonePageGeometry,
  HEADER_RESERVE,
  FOOTER_GAP,
  FOOTER_RESERVE,
} from '../src/quran/phonePageGeometry';
import {
  resetSystemBarSurface,
  setSystemBarSurface,
} from '../src/navigation/systemBarSurface';

const read = (p: string) =>
  fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const portrait = {
  width: 390,
  height: 844,
  sideInset: 0,
  navPad: 0,
  listH: 720,
  footerDrawn: true,
};

describe('the mini player is reserved once, by the layout', () => {
  // The player is a flex sibling BELOW the pager, so the list is measured
  // shorter the moment it mounts. The geometry must take the measurement
  // at its word: an extra `playerReserve` subtracted 68dp that was never
  // in the viewport, and the page ended 68dp above the player.
  it('gives the page the whole measured viewport, less its own chrome', () => {
    const g = phonePageGeometry(portrait)!;
    expect(g.viewportH).toBe(720 - HEADER_RESERVE - FOOTER_RESERVE);
  });

  it('shrinks by exactly what the player took from the list', () => {
    const without = phonePageGeometry(portrait)!;
    const withPlayer = phonePageGeometry({ ...portrait, listH: 720 - 68 })!;
    expect(without.viewportH - withPlayer.viewportH).toBe(68);
  });

  it('has no player in its identity', () => {
    expect(geometryKey(phonePageGeometry(portrait))).not.toMatch(/68/);
  });

  it('gives the medallion room back to the text when it stands down', () => {
    // While the player is up it names the page, so the medallion is not
    // drawn. Reserving its room anyway did not leave the page as it was —
    // it opened a band of nothing between the last line and the player.
    const drawn = phonePageGeometry(portrait)!;
    const standDown = phonePageGeometry({ ...portrait, footerDrawn: false })!;
    expect(standDown.viewportH - drawn.viewportH).toBe(
      FOOTER_RESERVE - FOOTER_GAP,
    );
  });

  it('still reserves the header, which never stands down', () => {
    const standDown = phonePageGeometry({ ...portrait, footerDrawn: false })!;
    expect(standDown.viewportH).toBe(720 - HEADER_RESERVE - FOOTER_GAP);
  });

  it('leaves the last line room to breathe above the player', () => {
    // Reclaiming the medallion's WHOLE room put the last ayah hard
    // against the card, which reads as the text running underneath it.
    const standDown = phonePageGeometry({ ...portrait, footerDrawn: false })!;
    expect(720 - HEADER_RESERVE - standDown.viewportH).toBe(FOOTER_GAP);
    expect(FOOTER_GAP).toBeGreaterThan(0);
    expect(FOOTER_GAP).toBeLessThan(FOOTER_RESERVE);
  });

  it('changes the page identity, so a settled geometry is replaced', () => {
    // The reclaimed room changes viewportH, which the key already carries
    // — otherwise the page would keep drawing at the old height.
    expect(geometryKey(phonePageGeometry(portrait))).not.toBe(
      geometryKey(phonePageGeometry({ ...portrait, footerDrawn: false })),
    );
  });

  it.each([
    'src/quran/MushafPhoneReader.tsx',
    'src/quran/MushafSpreadReader.tsx',
  ])('%s reserves nothing for the player', file => {
    expect(read(file)).not.toMatch(/PLAYER_RESERVE|playerReserve/);
  });

  // The 24dp tail is for the LANDSCAPE column, which scrolls. A fitted
  // portrait column is exactly the viewport, and padding it pushed the
  // medallion off the bottom of a page with nothing to scroll.
  it('pads the column only where the column scrolls', () => {
    expect(read('src/quran/MushafPhoneReader.tsx')).toContain(
      'geometry.scrolling ? styles.columnContent : undefined',
    );
  });
});

describe('the Android navigation bar takes the page colour', () => {
  afterEach(resetSystemBarSurface);

  it('the theme stops painting the bar itself', () => {
    const styles = read('android/app/src/main/res/values/styles.xml');
    expect(styles).toContain(
      '<item name="android:navigationBarColor">@android:color/transparent</item>',
    );
  });

  // It was believed above API 35 that the platform owned this band, and
  // the band the app drew was skipped there. What owns it is the theme's
  // navigationBarColor, which the theme now gives up.
  it('the app draws the band on every version', () => {
    const scrim = read('src/navigation/SystemNavigationScrim.tsx');
    expect(scrim).not.toMatch(/Platform\.Version.*>=\s*35/);
    expect(scrim).toContain('useSystemBarSurface');
  });

  it('a claimed surface is published, and handed back on release', () => {
    const release = setSystemBarSurface({ color: '#F3EBDB', isDark: false });
    const scrim = read('src/navigation/SystemNavigationScrim.tsx');
    expect(scrim).toContain('surface.color');
    release();
  });

  // The reader claims it, so the glyphs follow the PAGE: a night page in
  // a light app theme wants light back/home/recents.
  it('the reader claims it, and the root reads it for the glyphs', () => {
    expect(read('src/quran/mushafReaderCore.tsx')).toContain(
      'setSystemBarSurface({',
    );
    expect(read('src/AppNavigationRoot.tsx')).toContain(
      'setNavigationBarStyle(barIsDark)',
    );
  });
});
