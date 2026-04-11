import { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';

type PrayerWidgetNative = {
  setUiHints?: (style: string, oledBackground: boolean) => Promise<void>;
};

/**
 * Widget theme is fixed (green family); still call native so timelines reload after install.
 */
export function useSyncWidgetUiHints(): void {
  const { hydrated } = usePrayerSettings();

  useEffect(() => {
    if (!hydrated || (Platform.OS !== 'ios' && Platform.OS !== 'android')) {
      return;
    }
    const mod = NativeModules.PrayerWidget as PrayerWidgetNative | undefined;
    if (!mod?.setUiHints) {
      return;
    }
    void mod.setUiHints('fixed', false);
  }, [hydrated]);
}
