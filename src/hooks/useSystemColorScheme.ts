import { useEffect, useState } from 'react';
import {
  Appearance,
  AppState,
  useColorScheme,
  type ColorSchemeName,
} from 'react-native';
import { getNativeColorScheme } from '../native/SystemTheme';

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
/**
 * The best answer available on this platform, right now.
 *
 * On Android, `Appearance.getColorScheme()` resolves through React Native's
 * `AppearanceModule`, which reads the configuration off the APPLICATION
 * context. The app declares `android:configChanges="uiMode"`, so a theme
 * change is delivered to the Activity and the Activity alone — nothing
 * recreates it and nothing guarantees the application's configuration is
 * refreshed in step. The Activity's own configuration is the closer source,
 * and the value handed to `onConfigurationChanged` is closer still, so
 * `SystemTheme.getColorScheme()` prefers them in that order and this falls
 * back to React Native only when the native module has nothing to say.
 */
function authoritativeColorScheme(): ColorSchemeName | null | undefined {
  return getNativeColorScheme() ?? Appearance.getColorScheme();
}

export function useSystemColorScheme(): ColorSchemeName | null | undefined {
  const hookScheme = useColorScheme();
  const [scheme, setScheme] = useState<ColorSchemeName | null | undefined>(
    authoritativeColorScheme,
  );

  // Mirror the built-in hook's updates (covers the normal in-foreground flip).
  useEffect(() => {
    setScheme(authoritativeColorScheme());
  }, [hookScheme]);

  // Authoritative re-read on appearance change + on foreground, catching the
  // cases where the hook itself lags (notably background → active on iOS).
  useEffect(() => {
    const reread = () => setScheme(authoritativeColorScheme());
    /**
     * TRUST THE EVENT'S OWN PAYLOAD FIRST — the previous version threw it
     * away and re-queried, which defeated the workaround sitting in
     * `MainActivity`.
     *
     * `MainActivity.onConfigurationChanged` goes to real trouble to read the
     * night bit out of `newConfig` — the one value Android guarantees is
     * current — precisely because the configuration reachable from the
     * context can lag behind it. It then emits that correct scheme to JS.
     * This listener answered by calling `Appearance.getColorScheme()`, which
     * asks the lagging source again, so the correct value was computed,
     * emitted, and immediately discarded.
     */
    const appearanceSub = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme ?? authoritativeColorScheme());
    });
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
