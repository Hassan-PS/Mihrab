import { useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import {
  resolveAppPalette,
  resolveEffectiveDark,
  type AppPalette,
} from '../theme/appPalette';

export type { AppPalette };

/**
 * Palette + isDark hook with belt-and-suspenders Appearance subscription
 * — task #90 follow-up.
 *
 * `useColorScheme()` from RN should fire whenever the system scheme
 * flips, but on Android with `configChanges="uiMode"` and the Material
 * You dynamic palette, some devices (Pixel 8 / 10 in particular) emit
 * the appearance event without invalidating PlatformColor's cached
 * attribute resolution. The result: the user toggles dark mode from
 * the notification panel, the JS scheme updates, but the colorSurface
 * attribute stays resolved against the previous theme.
 *
 * Subscribing manually to `Appearance` here gives us a second wakeup
 * signal independent of `useColorScheme()`. The `bump` counter is
 * included as a useMemo dep so the palette object identity changes on
 * every appearance event, forcing every consumer of the palette
 * (which spreads it into View `style` props) to re-render — and that
 * re-render is what causes RN's ViewManager to re-resolve the
 * PlatformColor attribute references against the now-current theme.
 */
export function useAppPalette(): {
  palette: AppPalette;
  isDark: boolean;
} {
  const { settings } = usePrayerSettings();
  const systemScheme = useColorScheme();

  // Wake-up counter that increments on every Appearance event. We don't
  // care about the value, only that it changes — that's what forces the
  // useMemo below to recompute and pushes new style objects to consumers.
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = Appearance.addChangeListener(() => {
      setBump(n => n + 1);
    });
    return () => {
      sub.remove();
    };
  }, []);

  const isDark = useMemo(
    () => resolveEffectiveDark(settings.appearance, systemScheme),
    [settings.appearance, systemScheme],
  );

  const palette = useMemo(
    () =>
      resolveAppPalette({
        appearance: settings.appearance,
        useSystemDynamicTheme: settings.useSystemDynamicTheme,
        systemScheme,
        pureBlackDark: settings.pureBlackDark,
      }),
    // `bump` is included so a manual Appearance event re-runs this even
    // when systemScheme appears unchanged from React's perspective.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      settings.appearance,
      settings.useSystemDynamicTheme,
      settings.pureBlackDark,
      systemScheme,
      bump,
    ],
  );

  return { palette, isDark };
}
