import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import {
  resolveAppPalette,
  resolveEffectiveDark,
  type AppPalette,
} from '../theme/appPalette';

export type { AppPalette };

export function useAppPalette(): {
  palette: AppPalette;
  isDark: boolean;
} {
  const { settings } = usePrayerSettings();
  const systemScheme = useColorScheme();

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

  return { palette, isDark };
}
