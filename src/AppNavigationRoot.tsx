import { NavigationContainer } from '@react-navigation/native';
import { useMemo } from 'react';
import { StatusBar, useColorScheme, View } from 'react-native';
import { usePrayerSettings } from './context/PrayerSettingsContext';
import { RootNavigator } from './navigation/RootNavigator';
import {
  buildAppPalette,
  resolveEffectiveDark,
} from './theme/appPalette';
import { buildNavigationTheme } from './theme/navigationTheme';

export function AppNavigationRoot() {
  const { settings } = usePrayerSettings();
  const systemScheme = useColorScheme();

  const isDark = useMemo(
    () => resolveEffectiveDark(settings.appearance, systemScheme),
    [settings.appearance, systemScheme],
  );

  const palette = useMemo(
    () => buildAppPalette(isDark, settings.pureBlackDark),
    [isDark, settings.pureBlackDark],
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
