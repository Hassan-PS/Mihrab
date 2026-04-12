import { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import type { PrayerAppSettings } from '../settings/types';

type PrayerWidgetNative = {
  setUiHints?: (style: string, oledBackground: boolean) => Promise<void>;
  setWidgetHighlightDynamic?: (enabled: boolean) => Promise<void>;
  setAndroidWidgetAppearance?: (
    opacity: number,
    highlightId: string,
    highlightHex: string | null,
    highlightDynamic: boolean,
  ) => Promise<void>;
  setIosWidgetHighlightAppearance?: (
    highlightId: string,
    highlightHex: string | null,
    highlightDynamic: boolean,
  ) => Promise<void>;
};

function useDynamicHighlightForWidget(settings: PrayerAppSettings): boolean {
  return (
    Platform.OS === 'android' &&
    settings.appearance === 'system' &&
    settings.useSystemDynamicTheme
  );
}

function syncNativeWidgetAppearance(
  settings: PrayerAppSettings,
  dynamicHl: boolean,
): void {
  const mod = NativeModules.PrayerWidget as PrayerWidgetNative | undefined;
  const hex =
    settings.widgetHighlightId === 'custom'
      ? settings.widgetHighlightCustomHex
      : null;

  if (Platform.OS === 'android' && mod?.setAndroidWidgetAppearance) {
    void mod.setAndroidWidgetAppearance(
      settings.androidWidgetBackgroundOpacity,
      settings.widgetHighlightId,
      hex,
      dynamicHl,
    );
    return;
  }

  if (Platform.OS === 'ios' && mod?.setIosWidgetHighlightAppearance) {
    void mod.setIosWidgetHighlightAppearance(
      settings.widgetHighlightId,
      hex,
      dynamicHl,
    );
  } else if (Platform.OS === 'ios' && mod?.setWidgetHighlightDynamic) {
    void mod.setWidgetHighlightDynamic(dynamicHl);
  }

  if (Platform.OS === 'ios' && mod?.setUiHints) {
    void mod.setUiHints('fixed', false);
  }
}

/** Syncs widget highlight / Android opacity with app settings (and Theme → System colors for dynamic accent). */
export function useSyncWidgetUiHints(): void {
  const { hydrated, settings } = usePrayerSettings();
  const dynamicHl = useDynamicHighlightForWidget(settings);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    syncNativeWidgetAppearance(settings, dynamicHl);
  }, [
    hydrated,
    dynamicHl,
    settings.androidWidgetBackgroundOpacity,
    settings.widgetHighlightId,
    settings.widgetHighlightCustomHex,
    settings.appearance,
    settings.useSystemDynamicTheme,
  ]);
}
