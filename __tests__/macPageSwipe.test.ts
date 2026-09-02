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
  it('settles when the scrolling stops, not when a gesture ends', () => {
    // A trackpad swipe raises no drag end and no momentum — macOS
    // delivers it as wheel phases, so `onScrollEndDrag` fired in the
    // MIDDLE of one, while the fingers were still moving, and each
    // corrective animation fought the scroll still arriving. That was
    // the stall halfway across the screen.
    expect(spread).toMatch(/onScroll=\{onScroll\}/);
    expect(spread).toMatch(/scrollEventThrottle=\{16\}/);
    expect(spread).not.toMatch(/onScrollEndDrag=/);
  });

  it('but a finger still settles the moment it lands', () => {
    // The momentum end cancels the idle timer instead of queueing
    // behind it, so touch keeps the timing it has always had.
    expect(spread).toMatch(/onMomentumScrollEnd=\{onMomentumEnd\}/);
    expect(spread).toMatch(
      /if \(idleTimer\.current\) clearTimeout\(idleTimer\.current\);\s*\n\s*settleAt\(/,
    );
  });

  it('never settles a scroll it started itself', () => {
    // The loop the user found: an arrow press on a list resting
    // off-centre scrolled, the scroll settled to an index that did not
    // match, settling scrolled again, and the reader swung between two
    // pages until it crashed.
    expect(spread).toMatch(/const target = scrollingTo\.current;/);
    expect(spread).toMatch(/if \(target != null\) \{/);
  });

  it('with no way to move the list that bypasses the guard', () => {
    // One call site, so the mark cannot be forgotten at a new one.
    expect(spread.match(/scrollToIndex\(/g) ?? []).toHaveLength(1);
    expect(spread).toMatch(/scrollingTo\.current = idx;/);
  });

  it('and lifts the guard even when the scroll never arrives', () => {
    // An animation can be interrupted by another swipe or a resize and
    // never reach its target. A guard that never lifts is a reader that
    // stops responding to the trackpad entirely.
    expect(spread).toMatch(/guardTimer\.current = setTimeout\(/);
  });

  it('tolerates the rounding a fractional page width leaves behind', () => {
    // A Mac window is whatever width the pointer left it at, so a
    // healthy snap lands a fraction off `index × width`. At one pixel
    // of tolerance that reads as adrift and animates a correction to
    // the place it is already in.
    expect(spread).toMatch(/const SNAP_SLACK = 2;/);
  });
});
