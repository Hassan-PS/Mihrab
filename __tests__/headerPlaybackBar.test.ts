/**
 * The recitation follows the reader, and appears exactly once.
 *
 * Playback outlives the page it was started from: begin a surah in
 * Tilāwah, go and look at tomorrow's Fajr, and the only way to pause used
 * to be the notification shade. The bar under the title bar is the fix,
 * and the two ways it can go wrong are both structural — a screen that
 * forgot to include it, and a screen that includes it twice.
 *
 * So it is wired in at the navigators rather than per screen, and it
 * decides for itself which routes it stays off.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const BAR = read('src/quran/audio/HeaderPlaybackBar.tsx');
const TABS = read('src/navigation/MainTabs.tsx');
const ROOT = read('src/navigation/RootNavigator.tsx');

describe('where the bar is wired in', () => {
  /**
   * `screenLayout` wraps every screen of a navigator, so a new tab or a
   * new pushed page carries the bar without anyone remembering to add it.
   */
  it('wraps every tab and every pushed screen', () => {
    expect(TABS).toMatch(/screenLayout=\{\(\{ children \}\) =>/);
    expect(TABS).toMatch(/<HeaderPlaybackBar surface=/);
    expect(ROOT).toMatch(/screenLayout=\{\(\{ children \}\) =>/);
    expect(ROOT).toMatch(/<HeaderPlaybackBar\s+surface=/);
    expect(ROOT).toMatch(/underTransparentHeader/);
  });

  /**
   * The two navigators do not agree on their header colour — the tabs
   * take the theme's `card`, the root stack sets its own `headerStyle` to
   * `background` — and the bar had `card` hardcoded. On every pushed
   * screen that made it a paler strip stuck under a darker title bar
   * rather than part of it. Each navigator hands the bar the very value
   * it gave its own header.
   */
  it('takes the colour of the header it hangs under', () => {
    expect(BAR).toMatch(/backgroundColor: surface,/);
    expect(BAR).not.toMatch(/backgroundColor: palette\.card/);
    expect(TABS).toContain('<HeaderPlaybackBar surface={palette.card} />');
    expect(ROOT).toContain('surface={theme.colors.background}');
  });
});

describe('the routes it stays off', () => {
  const off = [
    ...BAR.matchAll(/^\s*'(\w+)',$/gm),
  ].map(m => m[1]);

  it('are the two that already show the recitation, plus the tab host', () => {
    // Tilawah IS the player; the reader carries the MiniPlayer over the
    // page; and `Home` hosts the tab navigator, which draws its own copy
    // inside the tab headers — without that exclusion the root-stack
    // wrapper would put a second bar ABOVE the tab titles.
    expect(off).toEqual(
      expect.arrayContaining(['QuranListen', 'QuranSurah', 'Home']),
    );
  });

  it('is checked against the route the bar is actually on', () => {
    expect(BAR).toMatch(/const route = useRoute\(\)/);
    expect(BAR).toMatch(/OWN_PLAYER\.has\(route\.name\)/);
  });
});

describe('what it shows', () => {
  it('is nothing at all when nothing is playing, or off screen', () => {
    expect(BAR).toMatch(
      /if \(!active \|\| !focused \|\| OWN_PLAYER\.has\(route\.name\)\) return null;/,
    );
  });

  /**
   * The wrapper is mounted on every screen of both navigators — the six
   * tabs never unmount — and `useProgress` is a timeout loop against the
   * native player for as long as it is mounted. Read in the wrapper, it
   * had an idle app making seven native calls every half-second to draw
   * nothing. So the wrapper is a gate on the playback store, and the
   * poller lives in the inner component that exists on one screen.
   */
  it('polls the player only where it is actually drawing', () => {
    const gate = BAR.slice(
      BAR.indexOf('export function HeaderPlaybackBar'),
      BAR.indexOf('function LiveBar'),
    );
    expect(gate).not.toMatch(/useProgress/);
    expect(gate).toMatch(/usePlaybackStatus\(\)/);
    // Foreground AND focus — `useIsFocused` alone keeps a bar polling in
    // a pocket, since backgrounding the app leaves its route focused.
    expect(gate).toMatch(/useIsActive\(\)/);
    expect(gate).toMatch(/return <LiveBar \{\.\.\.props\} \/>;/);
    const live = BAR.slice(BAR.indexOf('function LiveBar'));
    expect(live).toMatch(/useProgressWhileActive\(500\)/);
  });

  /**
   * An ayah is six seconds. A hairline that fills and empties every six
   * seconds is a flicker, not a progress bar — so the line measures the
   * SURAH, in ayahs, refined by how far into the current one we are.
   */
  it('measures the surah, not the ayah', () => {
    expect(BAR).toMatch(/\(active\.ayah - 1 \+ withinAyah\) \/ surah\.ayahCount/);
  });

  it('draws its controls rather than typing them', () => {
    // Glyphs like ▶︎ and ✕ land at a different size, weight and colour on
    // every platform, and cannot take the accent.
    for (const icon of ['PlayIcon', 'PauseIcon', 'CloseIcon', 'TilawahIcon', 'ReaderIcon']) {
      expect(BAR).toContain(icon);
    }
    expect(BAR).not.toMatch(/[▶✕❚⏮⏭]/);
  });

  /**
   * The book opens the muṣḥaf at the ayah being recited, on the page
   * the current riwayah puts it on. It replaced the Qur'an page's own
   * now-playing row, which was the only other place that offered this.
   */
  it('opens the reader at the recited ayah', () => {
    expect(BAR).toMatch(
      /navigation\.navigate\('QuranSurah', \{\s*surahNumber: active\.surah,\s*initialPage: findPageForAyah\(active\.surah, active\.ayah, riwayah\),\s*scrollToAyah: active\.ayah,\s*\}\)/,
    );
  });

  it('reads the header height from the context, not the hook', () => {
    // `useHeaderHeight()` throws where no header is mounted, and this
    // component renders on every screen.
    expect(BAR).toMatch(/useContext\(HeaderHeightContext\) \?\? 0/);
  });
});

describe('the Quran page', () => {
  const quran = read('src/screens/QuranScreen.tsx');

  /**
   * It had a "now playing" row of its own, forty points under a bar
   * saying the same surah and ayah. The one thing the row had that the
   * bar did not — the book — is on the bar now, on every screen.
   */
  it('no longer carries its own now-playing row', () => {
    expect(quran).not.toMatch(/nowPlaying/);
    expect(quran).not.toMatch(/usePlaybackStatus/);
  });
});
