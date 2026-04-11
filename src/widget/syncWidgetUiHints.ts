import { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';

type PrayerWidgetNative = {
  setUiHints?: (style: string, oledBackground: boolean) => Promise<void>;
  setAndroidWidgetAppearance?: (
    backgroundOpacityPercent: number,
    highlightId: string,
  ) => Promise<void>;
};

/**
 * Pushes widget appearance to native: Android uses configurable neutral shell +
 * highlight; iOS reloads timelines once after settings hydrate.
 */
export function useSyncWidgetUiHints(): void {
  const { hydrated, settings } = usePrayerSettings();

  useEffect(() => {
    if (!hydrated || Platform.OS !== 'android') {
      return;
    }
    const mod = NativeModules.PrayerWidget as PrayerWidgetNative | undefined;
    if (!mod?.setAndroidWidgetAppearance) {
      return;
    }
    void mod.setAndroidWidgetAppearance(
      settings.androidWidgetBackgroundOpacity,
      settings.androidWidgetHighlight,
    );
  }, [
    hydrated,
    settings.androidWidgetBackgroundOpacity,
    settings.androidWidgetHighlight,
  ]);

  useEffect(() => {
    if (!hydrated || Platform.OS !== 'ios') {
      return;
    }
    const mod = NativeModules.PrayerWidget as PrayerWidgetNative | undefined;
    if (!mod?.setUiHints) {
      return;
    }
    void mod.setUiHints('fixed', false);
  }, [hydrated]);
}
