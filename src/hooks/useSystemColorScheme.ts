import { useEffect, useState } from 'react';
import {
  Appearance,
  AppState,
  useColorScheme,
  type ColorSchemeName,
} from 'react-native';

/**
 * Reliable system light/dark scheme.
 *
 * RN's `useColorScheme()` can return a STALE value — most reproducibly on iOS
 * when the OS light/dark setting changes while the app is backgrounded: on
 * return the hook sometimes stays on the previous (now-opposite) scheme until
 * some unrelated state change forces a re-render, so the app's "System" theme
 * gets stuck on the wrong appearance. `Appearance.setColorScheme()` (used to
 * pin an explicit Light/Dark) can also leave the hook briefly stale when
 * clearing back to system.
 *
 * `Appearance.getColorScheme()` always reports the authoritative current value,
 * so we re-read it on every Appearance change event AND whenever the app
 * becomes active again. That guarantees "System" tracks the OS without lag,
 * independent of whatever value the `useColorScheme()` subscription is holding.
 */
export function useSystemColorScheme(): ColorSchemeName | null | undefined {
  const hookScheme = useColorScheme();
  const [scheme, setScheme] = useState<ColorSchemeName | null | undefined>(() =>
    Appearance.getColorScheme(),
  );

  // Mirror the built-in hook's updates (covers the normal in-foreground flip).
  useEffect(() => {
    setScheme(Appearance.getColorScheme());
  }, [hookScheme]);

  // Authoritative re-read on appearance change + on foreground, catching the
  // cases where the hook itself lags (notably background → active on iOS).
  useEffect(() => {
    const reread = () => setScheme(Appearance.getColorScheme());
    const appearanceSub = Appearance.addChangeListener(reread);
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') reread();
    });
    return () => {
      appearanceSub.remove();
      appStateSub.remove();
    };
  }, []);

  return scheme;
}
