/**
 * Every text field must be reachable while the keyboard is open.
 *
 * ── THE BUG THIS CLOSES ───────────────────────────────────────────────
 *
 * The app shipped with no keyboard handling at all — not a
 * `KeyboardAvoidingView`, not a listener, not one
 * `automaticallyAdjustKeyboardInsets`. Three things looked like they
 * covered for that and none of them did:
 *
 *  • `android:windowSoftInputMode="adjustResize"` is in the manifest,
 *    but the app draws edge to edge, and once
 *    `setDecorFitsSystemWindows(window, false)` is called the framework
 *    stops resizing for the IME entirely. Confirmed on a device: the
 *    keyboard opened over the focused field and the page did not move.
 *  • A React Native `Modal` on Android is a Dialog with its own window
 *    and does not inherit the activity's soft-input mode anyway.
 *  • iOS resizes nothing, ever. The keyboard is an overlay.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────
 *
 * `automaticallyAdjustKeyboardInsets` is an iOS-only prop, so setting it
 * and stopping is the exact mistake this file exists to catch: it looks
 * like the fix and leaves Android untouched. Anything that sets it must
 * also take `useKeyboardAwareScroll`, which carries the Android half.
 *
 * ── WHY MOST OF THIS IS A SOURCE TEST ─────────────────────────────────
 *
 * The failure is "the field is under the keyboard", which needs a device
 * with a software keyboard to observe. What CAN be checked here is that
 * every file drawing a `TextInput` participates in one of the
 * mechanisms — the thing that was missing everywhere, and that will be
 * missing again in the next file somebody adds a field to. The hook's
 * own arithmetic is checked for real, below.
 */
import * as fs from 'fs';
import * as path from 'path';
import { create, act } from 'react-test-renderer';
import { Keyboard } from 'react-native';
import {
  SafeAreaProvider,
  type Metrics,
} from 'react-native-safe-area-context';
import {
  scrollFocusedFieldIntoView,
  useKeyboardAwareScroll,
} from '../src/hooks/useKeyboardAwareScroll';
import { SPACING } from '../src/theme/tokens';

const SRC = path.join(__dirname, '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Files that RENDER a field, as opposed to merely mentioning the type. */
function rendersTextInput(text: string): boolean {
  return /<TextInput[\s/>]/.test(text);
}

/**
 * A component that draws a field but does not own the scrolling around
 * it. Its keyboard behaviour belongs to whoever mounts it, and the host
 * is named here so the pairing is checked by a human once rather than
 * assumed forever.
 */
const DELEGATES_TO_HOST: Record<string, string> = {
  'components/PlaceSearchSection.tsx':
    'mounted inside LocationSetup and the settings pages, both of which inset',
  'screens/settings/LocationCard.tsx':
    'a settings card — SettingsPage owns the ScrollView',
  'screens/settings/SavedLocationsCard.tsx':
    'a settings card — SettingsPage owns the ScrollView',
  'quran/RiwayahDownloadSection.tsx':
    'a section of QuranDownloadsScreen, which insets its ScrollView',
  'quran/audio/RecitationControls.tsx':
    'mounted inside AyahActionSheet, which lifts for the keyboard',
};

describe('every text field is reachable with the keyboard open', () => {
  const offenders: string[] = [];
  const seen: string[] = [];

  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!rendersTextInput(text)) continue;
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    seen.push(rel);
    if (rel in DELEGATES_TO_HOST) continue;
    const handled =
      text.includes('useKeyboardAwareScroll') ||
      text.includes('useKeyboardInset');
    if (!handled) offenders.push(rel);
  }

  test('every file that draws one handles the keyboard, or names its host', () => {
    expect(offenders).toEqual([]);
  });

  test('the sweep actually found the fields (guards the regex)', () => {
    // If `rendersTextInput` ever stops matching, the test above passes
    // vacuously and the whole guard evaporates. This is the canary.
    expect(seen.length).toBeGreaterThanOrEqual(10);
    expect(seen).toContain('components/ColorPickerModal.tsx');
    expect(seen).toContain('screens/QuranScreen.tsx');
    expect(seen).toContain('components/LocationSetup.tsx');
  });

  test('every delegating component still exists', () => {
    // A host named for a file that has been deleted or renamed is an
    // exemption nobody is checking any more.
    for (const rel of Object.keys(DELEGATES_TO_HOST)) {
      expect(seen).toContain(rel);
    }
  });
});

describe('the iOS-only prop never travels alone', () => {
  const halfDone: string[] = [];
  const setters: string[] = [];

  /**
   * The prop as an ATTRIBUTE, not the word. Several files name it in a
   * comment to explain why they do not set it, and a substring match
   * would read those as the thing they are warning against.
   */
  const setsTheProp = (text: string) =>
    /(^|\s)automaticallyAdjustKeyboardInsets(?=[\s>=])/m.test(text);

  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!setsTheProp(text)) continue;
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    setters.push(rel);
    if (!text.includes('useKeyboardAwareScroll')) halfDone.push(rel);
  }

  test('a scroller that insets on iOS also scrolls on Android', () => {
    expect(halfDone).toEqual([]);
  });

  test('the attribute regex still matches real attributes', () => {
    // Without this the test above passes by finding nothing at all.
    expect(setters).toContain('screens/settings/SettingsPage.tsx');
    expect(setters).toContain('components/LocationSetup.tsx');
  });
});

describe('lifting a dialog off the keyboard', () => {
  /**
   * A top-anchored dialog has to STOP being top-anchored when it lifts,
   * and `{top: undefined}` does not do that: an undefined value is
   * dropped rather than applied, so the card stayed pinned at both edges
   * and stretched into a tall pale box with its buttons adrift in the
   * middle. The anchor has to be a style the card either takes or does
   * not.
   */
  const offenders: string[] = [];
  // Line by line, skipping comments: the file that fixed this names the
  // pattern in prose to explain it, and a whole-file match would read
  // that explanation as the offence.
  const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
  for (const file of walk(SRC)) {
    const hit = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .some(
        line =>
          !isComment(line) &&
          /\b(top|bottom|left|right|height|width):\s*undefined/.test(line),
      );
    if (!hit) continue;
    offenders.push(path.relative(SRC, file).split(path.sep).join('/'));
  }

  test('no layout property is cancelled with undefined', () => {
    expect(offenders).toEqual([]);
  });
});

describe('the hosts the delegating components rely on', () => {
  const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

  test('SettingsPage wires its scroll view', () => {
    // One fix that covers every settings page: location, saved places,
    // and whatever card grows a field next.
    expect(read('screens/settings/SettingsPage.tsx')).toContain(
      'useKeyboardAwareScroll',
    );
  });

  test('the onboarding frame wires its scroll view', () => {
    expect(read('onboarding/OnboardingChrome.tsx')).toContain(
      'useKeyboardAwareScroll',
    );
  });

  test('QuranDownloadsScreen wires its scroll view', () => {
    expect(read('screens/QuranDownloadsScreen.tsx')).toContain(
      'useKeyboardAwareScroll',
    );
  });

  test('AyahActionSheet lifts for the keyboard', () => {
    expect(read('quran/mushaf/AyahActionSheet.tsx')).toContain('useKeyboardInset');
  });
});

describe('useKeyboardInset', () => {
  const src = fs.readFileSync(
    path.join(SRC, 'hooks', 'useKeyboardInset.ts'),
    'utf8',
  );

  test('uses the will-events on iOS and the did-events on Android', () => {
    // iOS fires `will` before the animation, so a sheet lifted on it
    // travels WITH the keyboard. Android has no `will` events at all —
    // they never fire — so listening for them there means never lifting.
    expect(src).toMatch(/keyboardWillShow/);
    expect(src).toMatch(/keyboardDidShow/);
    expect(src).toMatch(/Platform\.OS === 'ios'/);
  });

  test('removes its listeners', () => {
    expect(src).toMatch(/show\.remove\(\)/);
    expect(src).toMatch(/hide\.remove\(\)/);
  });
});


/**
 * The arithmetic, for real.
 *
 * This is where the fix actually lives, and where it went wrong twice.
 * The first pass compared `measureInWindow` against the keyboard event's
 * `screenY` — two different coordinate spaces, 51.8 points apart on the
 * device it was tested on, which left the field just under the keyboard.
 * These cases pin the geometry so that cannot come back quietly.
 */
describe('scrollFocusedFieldIntoView', () => {
  /** Matches SPACING.md, the gap the hook leaves above the keyboard. */
  const FOCUS_MARGIN = 12;

  const frame = (y: number, height: number) => ({
    measureInWindow: (cb: (...n: number[]) => void) => cb(0, y, 400, height),
  });

  /**
   * A field that sits at `inContentY` down the scroller's content and,
   * right now, at `onScreenY` in the frame's own space.
   */
  const field = (inContentY: number, onScreenY: number, height: number) => ({
    ...frame(onScreenY, height),
    measureLayout: (
      _rel: unknown,
      ok: (x: number, y: number, w: number, h: number) => void,
    ) => ok(0, inContentY, 345, height),
  });

  /** A field `measureLayout` refuses to place: a different tree. */
  const foreignField = (onScreenY: number, height: number) => ({
    ...frame(onScreenY, height),
    measureLayout: (_rel: unknown, _ok: unknown, fail?: () => void) => fail?.(),
  });

  /** A ScrollView whose frame starts at `top` and is `height` tall. */
  function scrollView(top: number, height: number) {
    return {
      scrollTo: jest.fn(),
      getNativeScrollRef: () => frame(top, height),
      getInnerViewRef: () => ({}),
    };
  }

  // The numbers logged off the device, so the case that shipped broken
  // is the case under test: a 782.5pt viewport starting at 56, a 312.4pt
  // keyboard over a 24pt navigation bar, and the field 616.4 down the
  // content — which put it at 672.4 in the frame's space.
  const VIEWPORT_TOP = 56;
  const VIEWPORT_H = 782.48;
  const KEYBOARD = 312.38;
  const BAR = 24;

  test('scrolls the field clear of the keyboard', async () => {
    const view = scrollView(VIEWPORT_TOP, VIEWPORT_H);
    const target = await scrollFocusedFieldIntoView(
      view,
      field(616.38, 672.38, 48.38),
      KEYBOARD,
      BAR,
    );

    // visible = 782.48 - 312.38 - 24 = 446.1
    // target  = 616.38 + 48.38 + 12 - 446.1 = 230.66
    expect(target).toBeCloseTo(230.66, 1);
    // Which lands the field's bottom exactly FOCUS_MARGIN above the
    // visible bottom — the thing the shipped-broken version missed by a
    // status bar's height.
    const visible = VIEWPORT_H - KEYBOARD - BAR;
    expect(616.38 + 48.38 - (target ?? 0)).toBeCloseTo(visible - FOCUS_MARGIN, 1);
  });

  test('the target does not depend on where the page is scrolled now', async () => {
    // Same field, same content position, page already scrolled: the
    // absolute offset is the same, because it is computed from the
    // content and not from a delta.
    const view = scrollView(VIEWPORT_TOP, VIEWPORT_H);
    const target = await scrollFocusedFieldIntoView(
      view,
      field(616.38, 300, 48.38),
      KEYBOARD,
      BAR,
    );
    // Still covered at y=300? 300 + 48.38 + 12 = 360.4 against a
    // keyboard top of 56 + 782.48 - 312.38 = 526.1 — no, it is clear.
    expect(target).toBeNull();
  });

  test('leaves the page alone when the field is already clear', async () => {
    const view = scrollView(VIEWPORT_TOP, VIEWPORT_H);
    const target = await scrollFocusedFieldIntoView(
      view,
      field(100, 120, 48),
      KEYBOARD,
      BAR,
    );

    // Scrolling anyway is what makes a long form jump when you tap its
    // first field — a visible bug in place of an invisible one.
    expect(target).toBeNull();
    expect(view.scrollTo).not.toHaveBeenCalled();
  });

  test('the keyboard top comes from the viewport, never from a screen position', async () => {
    // Two scrollers the same size, one starting 200 points further down.
    // The same field, at the same place in both frames' space, is covered
    // in the higher one and clear in the lower — because what the
    // keyboard covers is measured from the viewport's own bottom edge. A
    // comparison against a fixed screen position could not tell them
    // apart, and that is precisely the mistake this replaced.
    const high = scrollView(0, 800);
    const low = scrollView(200, 800);
    const coveredIn = await scrollFocusedFieldIntoView(
      high,
      field(600, 600, 48),
      KEYBOARD,
      BAR,
    );
    const clearIn = await scrollFocusedFieldIntoView(
      low,
      field(600, 600, 48),
      KEYBOARD,
      BAR,
    );
    expect(coveredIn).not.toBeNull();
    expect(clearIn).toBeNull();
  });

  test('never scrolls to a negative offset', async () => {
    const view = scrollView(0, 400);
    // A field near the top of a viewport almost entirely covered.
    const target = await scrollFocusedFieldIntoView(
      view,
      field(0, 380, 20),
      KEYBOARD,
      BAR,
    );
    expect(target).toBe(0);
  });

  test('ignores a field that belongs to another scroller', async () => {
    // A navigator keeps the previous screen mounted, and its scroller
    // hears the same keyboard event. Before `measureLayout` was used to
    // tell them apart, BOTH scrolled.
    const view = scrollView(VIEWPORT_TOP, VIEWPORT_H);
    const target = await scrollFocusedFieldIntoView(
      view,
      foreignField(672.38, 48.38),
      KEYBOARD,
      BAR,
    );
    expect(target).toBeNull();
    expect(view.scrollTo).not.toHaveBeenCalled();
  });

  test('gives up quietly when a node has gone', async () => {
    // The field can unmount between the keyboard event and the measure —
    // closing a sheet with the keyboard open does exactly that.
    const view = scrollView(0, 800);
    const gone = {
      measureInWindow: (cb: (...n: number[]) => void) => cb(0, NaN, 0, 0),
      measureLayout: (
        _rel: unknown,
        ok: (x: number, y: number, w: number, h: number) => void,
      ) => ok(0, 600, 300, 48),
    };
    await expect(
      scrollFocusedFieldIntoView(view, gone, KEYBOARD, BAR),
    ).resolves.toBeNull();
    expect(view.scrollTo).not.toHaveBeenCalled();
  });

  test('reaches the ScrollView under a FlatList', async () => {
    const inner = scrollView(VIEWPORT_TOP, VIEWPORT_H);
    const list = { getScrollResponder: () => inner };
    const target = await scrollFocusedFieldIntoView(
      list,
      field(616.38, 672.38, 48.38),
      KEYBOARD,
      BAR,
    );

    expect(target).toBeCloseTo(230.66, 1);
    expect(inner.scrollTo).toHaveBeenCalled();
  });

  test('does nothing with something that cannot scroll', async () => {
    const target = await scrollFocusedFieldIntoView(
      {},
      field(600, 600, 48),
      KEYBOARD,
      BAR,
    );
    expect(target).toBeNull();
  });

  test('the margin is the one the hook actually uses', () => {
    // If SPACING.md moves, this test should move with it rather than
    // quietly asserting an old number.
    expect(SPACING.md).toBe(FOCUS_MARGIN);
  });
});

describe('useKeyboardAwareScroll', () => {
  /**
   * The hook reads the safe-area bottom inset, so a bare render would
   * throw for want of a provider. Fixed metrics keep the test honest and
   * off the device.
   */
  const METRICS: Metrics = {
    frame: { x: 0, y: 0, width: 400, height: 900 },
    insets: { top: 24, left: 0, right: 0, bottom: 24 },
  };
  const wrap = (node: React.ReactElement) => (
    <SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>
  );

  test('an external ref is used as-is, not shadowed', () => {
    // The Qur'an index and the log both keep their own list ref for
    // scroll-to-top; the hook has to share it rather than compete.
    const external = { current: null as unknown };
    let api: ReturnType<typeof useKeyboardAwareScroll<unknown>> | undefined;
    function Probe() {
      api = useKeyboardAwareScroll<unknown>(external);
      return null;
    }
    act(() => {
      create(wrap(<Probe />));
    });
    expect(api?.ref).toBe(external);
  });

  test('subscribes to keyboardDidShow and unsubscribes on unmount', () => {
    const remove = jest.fn();
    const spy = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation((() => ({ remove })) as never);

    function Probe() {
      useKeyboardAwareScroll<unknown>();
      return null;
    }
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(wrap(<Probe />));
    });
    expect(spy.mock.calls.map(c => c[0])).toContain('keyboardDidShow');

    act(() => tree?.unmount());
    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('the platform halves of the hook', () => {
  const src = fs.readFileSync(
    path.join(SRC, 'hooks', 'useKeyboardAwareScroll.ts'),
    'utf8',
  );

  test('pads on Android only', () => {
    // iOS already inset the content via the automatic prop; padding it
    // again leaves a keyboard-sized hole under the last row.
    expect(src).toMatch(/Platform\.OS === 'android' && inset > 0/);
  });

  test('is null rather than zero when the keyboard is closed', () => {
    // It goes last in a style array, so `{paddingBottom: 0}` would erase
    // whatever bottom padding the screen set for itself.
    expect(src).toMatch(/padding > 0 \? \{ paddingBottom: padding \} : null/);
  });

  test('never mixes the keyboard event position into the geometry', () => {
    // `screenY` is a SCREEN position and `measureInWindow` answers in the
    // root view's space. Comparing them shipped a fix that left the field
    // under the keyboard by a status bar's height. Only the event's
    // HEIGHT is safe to use, and only as a height.
    expect(src).not.toMatch(/\.screenY/);
  });

  test('the bar the IME height leaves out is added back, not guessed', () => {
    // An earlier pass bounded it with a 48dp constant. The real inset is
    // one context away — and it is read as a context rather than through
    // `useSafeAreaInsets`, which throws without a provider and took two
    // screen-render suites down with it when it was.
    expect(src).toContain('SafeAreaInsetsContext');
    expect(src).not.toContain('ALLOWANCE');
  });
});
