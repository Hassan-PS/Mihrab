/**
 * How much of the screen the software keyboard is currently covering.
 *
 * ── WHY THIS HAD TO EXIST ─────────────────────────────────────────────
 *
 * The app had no keyboard handling at all. Not a `KeyboardAvoidingView`,
 * not a listener, not one `automaticallyAdjustKeyboardInsets` — verified
 * by grep across `src/`, which returned nothing, and the three reasons
 * it seemed to survive that all turn out to be wrong:
 *
 *  • The Android manifest sets `adjustResize`, which LOOKS like it
 *    covers the platform and does not: the app draws edge to edge, and
 *    `setDecorFitsSystemWindows(window, false)` stops the framework
 *    resizing for the IME altogether. Verified on a device — the
 *    keyboard opens over the focused field and nothing behind it moves.
 *    `useKeyboardAwareScroll` is what closes that hole on scrollers.
 *  • A React Native `Modal` on Android is a Dialog with its own window,
 *    and that window does not inherit the activity's soft-input mode. So
 *    every bottom sheet in the app — the colour picker, the reminder
 *    editor, the reciter search — had the keyboard open straight over
 *    the field being typed into.
 *  • On iOS nothing resizes anything, ever. The keyboard is an overlay,
 *    and without an inset the bottom of every screen is simply buried.
 *
 * ── WHY A LISTENER AND NOT `KeyboardAvoidingView` ─────────────────────
 *
 * `KeyboardAvoidingView` needs a different `behavior` per platform, a
 * `keyboardVerticalOffset` that depends on the header height of whatever
 * is above it, and it fights any parent that is already `flex: 1`. It
 * works beautifully in exactly one layout and is a source of mystery
 * padding in every other. A number is easier to place correctly: the
 * caller decides what to do with it, because lifting a bottom sheet and
 * insetting a scroll view are not the same act.
 *
 * ── THE EVENTS, AND WHY THEY DIFFER BY PLATFORM ───────────────────────
 *
 * iOS fires `keyboardWillShow` before the animation, so a sheet lifted on
 * it travels WITH the keyboard rather than after it. Android has no
 * `will` events at all — they never fire — so it takes `keyboardDidShow`
 * and the sheet arrives a frame late, which is the platform's own
 * behaviour and what every Android app does.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * The keyboard's height in points, or 0 when it is closed.
 *
 * Safe to call unconditionally: it is two listeners and a number, and it
 * returns 0 on a device with a hardware keyboard, which is the right
 * answer rather than a special case.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // `will` on iOS so the lift rides the keyboard's own animation;
    // `did` on Android, where the `will` events do not exist.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, e => {
      setInset(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
