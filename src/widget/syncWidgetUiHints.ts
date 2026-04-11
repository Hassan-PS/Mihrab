import { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';

type PrayerWidgetNative = {
  setUiHints?: (style: string, oledBackground: boolean) => Promise<void>;
  setAndroidWidgetAppearance?: (
    backgroundOpacityPercent: number,
    highlightId: string,
    useDynamicHighlight: boolean,
  ) => Promise<void>;
  setWidgetHighlightDynamic?: (enabled: boolean) => Promise<void>;
};

function useDynamicHighlightForWidget(settings: {
  appearance: string;
  useSystemDynamicTheme: boolean;
}): boolean {
  return (
    settings.appearance === 'system' && settings.useSystemDynamicTheme
  );
}

/**
 * Pushes widget appearance to native: Android uses configurable neutral shell +
 * highlight (system accent for highlight only when dynamic theme is on).
 */
export function useSyncWidgetUiHints(): void {
  const { hydrated, settings } = usePrayerSettings();
  const dynamicHl = useDynamicHighlightForWidget(settings);

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
      dynamicHl,
    );
  }, [
    hydrated,
    dynamicHl,
    settings.androidWidgetBackgroundOpacity,
    settings.androidWidgetHighlight,
  ]);

  useEffect(() => {
    if (!hydrated || Platform.OS !== 'ios') {
      return;
    }
    const mod = NativeModules.PrayerWidget as PrayerWidgetNative | undefined;
    if (mod?.setWidgetHighlightDynamic) {
      void mod.setWidgetHighlightDynamic(dynamicHl);
    } else if (mod?.setUiHints) {
      void mod.setUiHints('fixed', false);
    }
  }, [hydrated, dynamicHl]);
}
