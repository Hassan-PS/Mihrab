/**
 * On a Mac, turning the page and going back are the same gesture.
 *
 * A two-finger trackpad swipe across the muṣḥaf closed it: UIKit routes
 * that swipe to the navigation controller's interactive pop, the pop takes
 * it first, and the reader — which had just been taught to settle a
 * trackpad scroll onto the nearest page — never saw a scroll at all. The
 * screen went back to the surah list mid-āyah.
 *
 * A touch device tells the two apart by where the finger starts: the pop is
 * an edge pan. A trackpad has no edges, so inside a reader the gesture has
 * to mean the page.
 */
import { readFileSync } from 'fs';
import path from 'path';

const screen = readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'QuranSurahScreen.tsx'),
  'utf8',
);
const spread = readFileSync(
  path.join(__dirname, '..', 'src', 'quran', 'MushafSpreadReader.tsx'),
  'utf8',
);

describe('the back swipe gets out of the page swipe’s way', () => {
  it('is off in the mushaf on the Mac', () => {
    expect(screen).toMatch(
      /const gestureEnabled = !\(isMacCatalyst && isMushaf\)/,
    );
  });

  it('and set on both the windowed and the fullscreen reader', () => {
    // Fullscreen hides the header, so the option has to be carried into
    // that branch too — its own setOptions call is a separate object.
    expect(screen.match(/^\s+gestureEnabled,$/gm) ?? []).toHaveLength(2);
  });

  it('but nowhere else — the tafsir reader has no page swipe to lose', () => {
    // The guard is the conjunction. Dropping either half would take the
    // back gesture away from a screen that has nothing else competing for
    // it, on a platform where it is the only way back short of the header.
    expect(screen).not.toMatch(/gestureEnabled: false/);
  });
});

describe('and the swipe it makes room for still lands on a page', () => {
  it('the drag end settles, because a trackpad swipe has no momentum', () => {
    expect(spread).toMatch(/onScrollEndDrag=\{onScrollEndDrag\}/);
    expect(spread).toMatch(/onMomentumScrollEnd=\{onMomentumEnd\}/);
  });

  it('snapping the rest position rather than trusting pagingEnabled', () => {
    // UIKit does not apply paging to an INDIRECT scroll, which is what a
    // trackpad swipe and a mouse wheel are.
    expect(spread).toMatch(/scrollToIndex\(\{ index: idx, animated: true \}\)/);
  });
});
