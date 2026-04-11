import { NavigationContainer } from '@react-navigation/native';
import { useMemo } from 'react';
import { StatusBar, useColorScheme, View } from 'react-native';
import { usePrayerSettings } from './context/PrayerSettingsContext';
import { RootNavigator } from './navigation/RootNavigator';
import {
  resolveAppPalette,
  resolveEffectiveDark,
} from './theme/appPalette';
import { buildNavigationTheme } from './theme/navigationTheme';
import { useSyncWidgetUiHints } from './widget/syncWidgetUiHints';

export function AppNavigationRoot() {
  const { settings } = usePrayerSettings();
  const systemScheme = useColorScheme();

  useSyncWidgetUiHints(systemScheme);

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
