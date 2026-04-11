import { useEffect } from 'react';
import { NativeModules, Platform, type ColorSchemeName } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import {
  resolveEffectiveDark,
  shouldUseDynamicSystemColors,
} from '../theme/appPalette';

type PrayerWidgetNative = {
  setUiHints?: (style: string, oledBackground: boolean) => Promise<void>;
};

/**
 * Keeps home-screen widget chrome in sync with appearance settings (dynamic vs fixed, OLED).
 * Does not depend on prayer payload; safe to run on every settings change.
 */
export function useSyncWidgetUiHints(
  systemScheme: ColorSchemeName | null | undefined,
): void {
  const { settings, hydrated } = usePrayerSettings();

  useEffect(() => {
    if (!hydrated || (Platform.OS !== 'ios' && Platform.OS !== 'android')) {
      return;
    }
    const mod = NativeModules.PrayerWidget as PrayerWidgetNative | undefined;
    if (!mod?.setUiHints) {
      return;
    }
    const dynamic = shouldUseDynamicSystemColors(
      settings.appearance,
      settings.useSystemDynamicTheme,
    );
    const isDark = resolveEffectiveDark(settings.appearance, systemScheme);
    const oled = settings.pureBlackDark && isDark;
    void mod.setUiHints(dynamic ? 'dynamic' : 'fixed', oled);
  }, [
    hydrated,
    settings.appearance,
    settings.useSystemDynamicTheme,
    settings.pureBlackDark,
    systemScheme,
  ]);
}
