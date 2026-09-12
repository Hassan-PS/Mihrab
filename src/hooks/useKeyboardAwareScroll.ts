/**
 * A scroll container that keeps the field being typed into visible.
 *
 * ── WHY THE OBVIOUS THINGS DO NOT WORK HERE ───────────────────────────
 *
 * `automaticallyAdjustKeyboardInsets` is an iOS-only prop. It is still
 * set on every scroller that takes this hook, and it does its job there.
 * It does nothing at all on Android.
 *
 * The Android manifest sets `android:windowSoftInputMode="adjustResize"`,
 * which looks like it covers the other platform — and it would, except
 * this app draws edge to edge. `SystemThemeModule` calls
 * `WindowCompat.setDecorFitsSystemWindows(window, false)`, and once the
 * decor stops fitting system windows the framework stops resizing for
 * the IME: the keyboard becomes an inset the app is expected to consume
 * itself, and `adjustResize` is dead letter. Verified on a device — the
 * keyboard opened straight over the focused field and the page behind it
 * did not move a pixel. Android's own `ScrollView.onSizeChanged`, which
 * is the thing that normally drags a focused child back into view, never
 * runs either: nothing changed size.
 *
 * ── THE TRAP: TWO COORDINATE SPACES ───────────────────────────────────
 *
 * The obvious implementation — measure the field with `measureInWindow`,
 * compare it against `keyboardDidShow`'s `screenY`, scroll by the
 * difference — is wrong, and wrong in a way that looks right. Logged off
 * a device, with the keyboard's true top edge at 577.9:
 *
 *     screenY (from the event) ........ 577.9   ← screen coordinates
 *     field, measureInWindow .......... 672.4   ← 51.8 short of screen
 *     scroller frame, measureInWindow .  56.0   ← ditto; really at 107.8
 *
 * `measureInWindow` answers in the root view's space, which sits below
 * the status bar, while the keyboard event answers in the screen's. Mix
 * them and every scroll lands a status bar's height too low — far enough
 * to leave the field under the keyboard, close enough to look like a
 * rounding bug. React Native's own
 * `scrollResponderScrollNativeHandleToKeyboard` mixes exactly these two,
 * which is why it is not used here either.
 *
 * So nothing below compares the two spaces. Everything is worked out
 * inside the SCROLLER's own geometry: where the field sits in the
 * content (`measureLayout`), how tall the viewport is, and how much of
 * it the keyboard covers.
 *
 * ── SO THE HOOK DOES BOTH HALVES ITSELF ───────────────────────────────
 *
 *  1. ROOM. Without a resize the scroller still spans the whole screen,
 *     so its last field can never scroll higher than the screen's bottom
 *     edge — which is under the keyboard. `contentPadding` adds the
 *     keyboard's height to the content, so there is somewhere to go.
 *     Android only: on iOS the automatic inset already added it, and
 *     adding it twice leaves a keyboard-sized hole.
 *
 *  2. THE SCROLL. See `scrollFocusedFieldIntoView`.
 */
import { useContext, useEffect, useMemo, useRef } from 'react';
import type { ViewStyle } from 'react-native';
import { Keyboard, Platform, TextInput } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { SPACING } from '../theme/tokens';
import { useKeyboardInset } from './useKeyboardInset';

/** Breathing room left between the focused field and the keyboard. */
const FOCUS_MARGIN = SPACING.md;

/**
 * Android needs a beat: the padding from `contentPadding` is React state,
 * so the extra room does not exist until the re-render it causes has
 * laid out. Measured on a device, everything has settled well inside
 * this.
 */
const SETTLE_MS = 60;

type Rect = { y: number; height: number };

type Measurable = {
  measureInWindow?: (
    cb: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  /**
   * `never` for `relativeTo` on purpose: React Native types it as
   * `number | ReactNativeElement`, and a structural type that named
   * `unknown` there would stop a real host instance being assignable to
   * this one at all. The call site casts instead.
   */
  measureLayout?: (
    relativeTo: never,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail?: () => void,
  ) => void;
};

/** The bits of `ScrollView` this needs, without importing its class. */
type ScrollViewLike = {
  getNativeScrollRef?: () => Measurable | null;
  getInnerViewRef?: () => Measurable | null;
  scrollTo?: (options: { y: number; animated?: boolean }) => void;
};

type KeyboardScrollable = ScrollViewLike & {
  getScrollResponder?: () => ScrollViewLike | null;
};

/**
 * Structural, not `RefObject`: a screen that already holds a list ref
 * hands it straight in, whichever of React's ref types its own
 * `useRef` happens to produce.
 */
export type ScrollRef<T> = { current: T | null };

export type KeyboardAwareScroll<T> = {
  /** Goes on the scroll container's `ref`. */
  ref: ScrollRef<T>;
  /**
   * Goes last in the container's `contentContainerStyle`. It is `null`
   * while the keyboard is closed rather than `{paddingBottom: 0}`, so it
   * never flattens the padding the screen set for itself.
   */
  contentPadding: ViewStyle | null;
  /** The keyboard's height, for a caller that needs the raw number. */
  inset: number;
};

/** `measureInWindow` as a promise, so several measurements read as several. */
function measureFrame(target: Measurable | null | undefined): Promise<Rect | null> {
  return new Promise(resolve => {
    if (!target?.measureInWindow) {
      resolve(null);
      return;
    }
    target.measureInWindow((_x, y, _width, height) => {
      // A node unmounted between the keyboard event and this callback
      // answers with nothing rather than erroring.
      resolve(Number.isFinite(y) && Number.isFinite(height) ? { y, height } : null);
    });
  });
}

/**
 * Where `target` sits inside `content`, or null.
 *
 * Null is meaningful and load-bearing: `measureLayout` fails when the
 * two nodes are in different trees, which is exactly what happens when a
 * navigator keeps the previous screen mounted and its scroller answers
 * the same keyboard event. The failure is how the wrong scroller is told
 * apart from the right one, so both no longer scroll.
 */
function measureInContent(
  target: Measurable | null | undefined,
  content: Measurable | null | undefined,
): Promise<Rect | null> {
  return new Promise(resolve => {
    if (!target?.measureLayout || !content) {
      resolve(null);
      return;
    }
    try {
      target.measureLayout(
        content as never,
        (_x, y, _width, height) =>
          resolve(
            Number.isFinite(y) && Number.isFinite(height) ? { y, height } : null,
          ),
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * The `ScrollView` inside whatever the screen handed over. A `FlatList`
 * is a `VirtualizedList` around one and answers `getScrollResponder`;
 * a `ScrollView` already is one.
 */
function scrollViewOf(scroller: KeyboardScrollable): ScrollViewLike | null {
  if (typeof scroller.getInnerViewRef === 'function') {
    return scroller;
  }
  const inner = scroller.getScrollResponder?.();
  return typeof inner?.getInnerViewRef === 'function' ? inner : null;
}

/**
 * Scroll `scroller` so the focused field clears the keyboard.
 *
 * `keyboardHeight` is what `keyboardDidShow` reports, which on Android
 * is net of the system bars; `barInset` is the bar it leaves out. Both
 * are heights, not positions, so neither drags the screen coordinate
 * space in with it — see the header.
 *
 * The arithmetic, all of it inside the scroller:
 *
 *     visible = frameHeight - keyboardHeight - barInset
 *     target  = fieldBottomInContent + FOCUS_MARGIN - visible
 *
 * `target` is an absolute content offset, so it does not need to know
 * where the page is scrolled to now. The guard above it does, and gets
 * it the only other way that stays in one space: the field's frame and
 * the scroller's frame both come from `measureInWindow`, so their
 * difference is honest even though neither number is a screen position.
 *
 * This assumes the scroller runs to the bottom of the window, which
 * every screen using it does. A shorter one is over-served rather than
 * under-served: the field ends up higher than it had to, never hidden.
 *
 * Exported for the test — the offsets here are the whole fix.
 */
export async function scrollFocusedFieldIntoView(
  scroller: KeyboardScrollable,
  field: Measurable,
  keyboardHeight: number,
  barInset: number,
): Promise<number | null> {
  const view = scrollViewOf(scroller);
  if (!view?.scrollTo) {
    return null;
  }
  const content = view.getInnerViewRef?.();
  const [inContent, fieldFrame, viewport] = await Promise.all([
    measureInContent(field, content),
    measureFrame(field),
    measureFrame(view.getNativeScrollRef?.()),
  ]);
  // No `inContent` means this scroller does not contain this field.
  if (!inContent || !fieldFrame || !viewport) {
    return null;
  }

  // The keyboard's top edge, in the same space the two frames came from.
  const keyboardTop = viewport.y + viewport.height - keyboardHeight;
  // Already clear of it: leave the page where the reader put it rather
  // than yanking it about for no visible reason.
  if (fieldFrame.y + fieldFrame.height + FOCUS_MARGIN <= keyboardTop) {
    return null;
  }

  const visible = viewport.height - keyboardHeight - barInset;
  const target = Math.max(
    0,
    inContent.y + inContent.height + FOCUS_MARGIN - visible,
  );
  view.scrollTo({ y: target, animated: true });
  return target;
}

/**
 * Wire a scroll container so the focused text field stays above the
 * keyboard.
 *
 * ```tsx
 * const kb = useKeyboardAwareScroll<ScrollView>();
 * <ScrollView
 *   ref={kb.ref}
 *   automaticallyAdjustKeyboardInsets
 *   contentContainerStyle={[styles.content, kb.contentPadding]}
 * />
 * ```
 *
 * Pass `external` when the screen already keeps a ref to the list for
 * its own reasons — the Qur'an index scrolls itself to a sūrah — rather
 * than hanging a second ref off the same element.
 */
export function useKeyboardAwareScroll<T>(
  external?: ScrollRef<T>,
): KeyboardAwareScroll<T> {
  const own = useRef<T | null>(null);
  const ref = external ?? own;
  const inset = useKeyboardInset();
  // Android reports the IME's height NET of the system bars
  // (`imeInsets.bottom - barInsets.bottom`), so the keyboard really
  // covers a navigation bar more of the screen than it says. This is
  // that bar.
  //
  // The CONTEXT, not `useSafeAreaInsets`: that hook throws when no
  // provider is above it, and a hook this low down should not be able to
  // take a screen out over a 24-point correction. App puts a
  // `SafeAreaProvider` at the root, so the null branch is for a test
  // harness mounting a screen on its own — where zero is simply a
  // slightly less generous scroll.
  const barInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const barRef = useRef(barInset);
  barRef.current = barInset;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sub = Keyboard.addListener('keyboardDidShow', e => {
      const height = e.endCoordinates?.height ?? 0;

      timer = setTimeout(() => {
        const scroller = ref.current as KeyboardScrollable | null;
        const field: Measurable | null = TextInput.State.currentlyFocusedInput();
        if (!scroller || !field) {
          return;
        }
        void scrollFocusedFieldIntoView(
          scroller,
          field,
          height,
          // iOS reports the full covered height already, so there is no
          // bar to add back there.
          Platform.OS === 'android' ? barRef.current : 0,
        );
      }, SETTLE_MS);
    });

    return () => {
      sub.remove();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [ref]);

  // iOS already inset the content itself; a second helping of padding
  // there leaves a keyboard-sized gap under the last row. The bar rides
  // along so there is room to scroll the whole way up.
  const padding =
    Platform.OS === 'android' && inset > 0 ? inset + barInset : 0;
  const contentPadding = useMemo(
    () => (padding > 0 ? { paddingBottom: padding } : null),
    [padding],
  );

  return { ref, contentPadding, inset };
}
