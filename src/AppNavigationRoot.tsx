import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useMemo, useRef } from 'react';
import { Platform, StatusBar, useColorScheme, View } from 'react-native';
import { usePrayerSettings } from './context/PrayerSettingsContext';
import { RootNavigator } from './navigation/RootNavigator';
import { restartApp as nativeRestartApp } from './native/SystemTheme';
import {
  resolveAppPalette,
  resolveEffectiveDark,
} from './theme/appPalette';
import { buildNavigationTheme } from './theme/navigationTheme';
import { useSyncWidgetUiHints } from './widget/syncWidgetUiHints';

export function AppNavigationRoot() {
  const { settings } = usePrayerSettings();
  const systemScheme = useColorScheme();

  useSyncWidgetUiHints();

  // Auto-restart on a system dark/light flip when dynamic colors are
  // active — task #118. Material You's PlatformColor refs resolve at
  // view-attach time, so a mid-session theme flip leaves stale tints
  // on already-rendered surfaces. The user opted into Material You so
  // they expect colour changes to be reflected; we trigger a clean
  // native restart instead of trying to reconcile the half-themed UI.
  // The previous-scheme ref prevents the effect from firing on initial
  // mount (when systemScheme transitions undefined → 'light'/'dark').
  const prevSchemeRef = useRef<typeof systemScheme | undefined>(undefined);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const prev = prevSchemeRef.current;
    prevSchemeRef.current = systemScheme;
    // Skip if this is the first time we see a real value, or if dynamic
    // colors aren't active, or if the user is forcing light/dark
    // explicitly (system follow is off).
    if (prev === undefined) return;
    if (!systemScheme) return;
    if (prev === systemScheme) return;
    if (settings.appearance !== 'system') return;
    if (!settings.useSystemDynamicTheme) return;
    nativeRestartApp();
  }, [systemScheme, settings.appearance, settings.useSystemDynamicTheme]);

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
    [
      settings.appearance,
      settings.useSystemDynamicTheme,
      settings.pureBlackDark,
      systemScheme,
    ],
  );

  const navTheme = useMemo(
    () => buildNavigationTheme(palette, isDark),
    [palette, isDark],
  );

  const layoutDir = settings.language === 'ar' ? 'rtl' : 'ltr';

  return (
    <View style={{ flex: 1, direction: layoutDir }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    </View>
  );
}
