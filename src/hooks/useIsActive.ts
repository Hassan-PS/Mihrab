/**
 * "Is this screen actually in front of a human right now?" — v2.10.2.
 *
 * Three timers in this app asked that question and each got a different,
 * wrong answer, so it is one hook now.
 *
 * `useIsFocused()` alone is NOT the answer, and that is the trap all three
 * fell into. It reports NAVIGATION focus: whether this screen is the one the
 * navigator would show. Background the app from the Today tab and the Today
 * tab is still the focused route — so a `useIsFocused()`-gated `setInterval`
 * keeps firing in the user's pocket. The Home countdown did exactly that,
 * once a second, indefinitely (audit: docs/design/background-power.md).
 *
 * `AppState` alone is not the answer either: it says the app is in front, not
 * which screen is. A per-second timer on a screen five levels down the stack
 * is just as wasted.
 *
 * The answer is both, and the useful property of "both" is that it is a
 * single boolean an effect can depend on: when it goes false the effect tears
 * the timer down, and when it comes back true the effect re-runs and can
 * refresh whatever went stale while it was away.
 *
 * Note `enableFreeze(false)` in index.js: react-native-screens is NOT
 * suspending off-screen screens for us (deliberately — see the comment
 * there), so nothing else is going to stop these timers.
 */
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** True only while the app is foregrounded AND this screen is focused. */
export function useIsActive(): boolean {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    () => AppState.currentState !== 'background',
  );

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      // Only a real 'background' stops the clock. 'inactive' is iOS's
      // transitional state — the app switcher, a permission sheet, a
      // notification pulled halfway down — and treating it as background
      // would stop and restart the countdown every time someone glanced at
      // Control Centre. Leaving the app for real passes through 'inactive'
      // to 'background' anyway, so nothing keeps running that shouldn't.
      setForeground(state !== 'background');
    };
    const sub = AppState.addEventListener('change', onChange);
    // The state can have changed between the initial render and this effect.
    onChange(AppState.currentState);
    return () => sub.remove();
  }, []);

  return focused && foreground;
}
