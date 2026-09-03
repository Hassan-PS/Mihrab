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
  path.join(__dirname, '..', 'src', 'screens', 'quran', 'MushafSurahScreen.tsx'),
  'utf8',
);
const translation = readFileSync(
  path.join(
    __dirname,
    '..',
    'src',
    'screens',
    'quran',
    'TranslationSurahScreen.tsx',
  ),
  'utf8',
);
const spread = readFileSync(
  path.join(__dirname, '..', 'src', 'quran', 'MushafSpreadReader.tsx'),
  'utf8',
);
const pagerSrc = readFileSync(
  path.join(__dirname, '..', 'src', 'quran', 'useMushafPager.ts'),
  'utf8',
);

describe('the back swipe gets out of the page swipe’s way', () => {
  it('is off in the mushaf on the Mac', () => {
    // The muṣḥaf has its own screen now, so the guard is the platform
    // alone — there is no translation branch left in here to exclude.
    expect(screen).toMatch(/const gestureEnabled = !isMacCatalyst;/);
  });

  it('and set on both the windowed and the fullscreen reader', () => {
    // Fullscreen hides the header, so the option has to be carried into
    // that branch too — its own setOptions call is a separate object.
    expect(screen.match(/^\s+gestureEnabled,$/gm) ?? []).toHaveLength(2);
  });

  it('but nowhere else — the tafsir reader has no page swipe to lose', () => {
    // Taking the back gesture away from a screen that has nothing else
    // competing for it, on a platform where it is the only way back short
    // of the header, would be the same mistake the other way round.
    expect(translation).not.toMatch(/gestureEnabled/);
  });
});

describe('and the swipe it makes room for still lands on a page', () => {
  // The mechanics themselves — the settle-on-silence, the guard against
  // settling our own scrolls, the slack for a fractional width — run for
  // real in mushafPager.test.ts. What is pinned here is the wiring: that
  // the component hands the list to the pager and nothing else moves it.
  it('the component defers every scroll to the pager', () => {
    expect(spread).toMatch(/onScroll=\{pagerHandlers\.onScroll\}/);
    expect(spread).toMatch(/scrollEventThrottle=\{16\}/);
    expect(spread).toMatch(
      /onMomentumScrollEnd=\{pagerHandlers\.onMomentumScrollEnd\}/,
    );
    expect(spread).toMatch(
      /onScrollToIndexFailed=\{pagerHandlers\.onScrollToIndexFailed\}/,
    );
    expect(spread).not.toMatch(/onScrollEndDrag=/);
  });

  it('with no way to move the list that bypasses the pager', () => {
    // One call site, in the pager, so the mark cannot be forgotten at a
    // new one.
    expect(spread).not.toMatch(/scrollToIndex\(/);
    expect(spread).not.toMatch(/scrollToOffset\(/);
    // (The type declaration is the other match.)
    expect(pagerSrc.match(/\?\.scrollToIndex\(/g) ?? []).toHaveLength(1);
  });

  it('and the arrows turn through the same pager', () => {
    expect(spread).toMatch(/useRegisterKeyPaging\(props\.keyTurn, turnPage\)/);
    expect(spread).toMatch(/const \{ handlers: pagerHandlers, turnPage \} = useMushafPager\(/);
  });

  it('and so does the phone reader — one pager, two layouts', () => {
    // It carried a hand-rolled copy of the mechanics: a settled ref, two
    // effects, a momentum handler, and none of the guard or the tests.
    const phone = readFileSync(
      path.join(__dirname, '..', 'src', 'quran', 'MushafPhoneReader.tsx'),
      'utf8',
    );
    expect(phone).toMatch(/useMushafPager\(\{/);
    expect(phone).toMatch(/onScroll=\{pagerHandlers\.onScroll\}/);
    expect(phone).not.toMatch(/scrollToIndex\(/);
    expect(phone).not.toMatch(/const settled = useRef/);
  });
});
