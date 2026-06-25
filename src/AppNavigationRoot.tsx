import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useMemo, useRef } from 'react';
import {
  Appearance,
  AppState,
  Platform,
  StatusBar,
  View,
} from 'react-native';
import { usePrayerSettings } from './context/PrayerSettingsContext';
import { useSystemColorScheme } from './hooks/useSystemColorScheme';
import { RootNavigator } from './navigation/RootNavigator';
import {
  restartApp as nativeRestartApp,
  setNavigationBarStyle,
} from './native/SystemTheme';
import {
  resolveAppPalette,
  resolveEffectiveDark,
} from './theme/appPalette';
import { buildNavigationTheme } from './theme/navigationTheme';
import { useSyncWidgetUiHints } from './widget/syncWidgetUiHints';
import { getPrayerLiveActivityModule } from './native/PrayerLiveActivity';

export function AppNavigationRoot() {
  const { settings } = usePrayerSettings();
  const systemScheme = useSystemColorScheme();

  useSyncWidgetUiHints();

  // iOS: re-show the Live Activity if the user dismissed it (swipe / "Clear
  // all") while the feature is still enabled. iOS forbids starting one from the
  // background and can't prevent dismissal, so we revive it on every foreground
  // — the closest to "always shown while enabled". The native side no-ops when
  // the feature is off, a card is already showing, or there's no next prayer
  // today. (HomeScreen still re-syncs on focus; this also covers other screens.)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const reassert = () => {
      getPrayerLiveActivityModule()?.reassert?.().catch(() => {});
    };
    reassert();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') reassert();
    });
    return () => sub.remove();
  }, []);

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

  // iOS: force the window's userInterfaceStyle to the app's chosen appearance
  // so native chrome follows the in-app theme, not the system one, when they
  // differ. Without this the navigation-bar Liquid Glass / blur material behind
  // the header location-pin + Settings-gear chip resolves against the device
  // trait collection (system light/dark) while the chip's own glyphs/text use
  // the app palette — so a light-app-on-dark-system (or vice-versa) device gets
  // a mismatched header. `Appearance.setColorScheme` sets the key window's
  // overrideUserInterfaceStyle; 'system' clears the override. iOS-only: Android
  // theming already flows through the palette + native nav-bar style + the
  // dynamic-colour restart path above, and an override there would fight it.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    Appearance.setColorScheme(
      settings.appearance === 'system' ? 'unspecified' : settings.appearance,
    );
  }, [settings.appearance]);

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
        appAccentId: settings.appAccentId,
        appAccentCustomHex: settings.appAccentCustomHex,
      }),
    [
      settings.appearance,
      settings.useSystemDynamicTheme,
      settings.pureBlackDark,
      settings.appAccentId,
      settings.appAccentCustomHex,
      systemScheme,
    ],
  );

  const navTheme = useMemo(
    () => buildNavigationTheme(palette, isDark),
    [palette, isDark],
  );

  // Keep the Android system navigation bar in step with the app theme.
  // Re-applied whenever dark/light flips and again when the app returns
  // to the foreground (the OS can reset the inset controller across some
  // backgrounding paths). No-op on iOS.
  useEffect(() => {
    setNavigationBarStyle(isDark);
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setNavigationBarStyle(isDark);
    });
    return () => sub.remove();
  }, [isDark]);

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
