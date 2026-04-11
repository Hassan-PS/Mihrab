import { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';

type PrayerWidgetNative = {
  setUiHints?: (style: string, oledBackground: boolean) => Promise<void>;
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

/** iOS: sync whether the widget uses system accent for the highlighted row. Android widget is configured from the widget’s own settings UI. */
export function useSyncWidgetUiHints(): void {
  const { hydrated, settings } = usePrayerSettings();
  const dynamicHl = useDynamicHighlightForWidget(settings);

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
