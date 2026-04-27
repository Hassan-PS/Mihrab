import { TurboModuleRegistry, NativeModules, Platform } from 'react-native';
import type { TimingsMap } from '../types/prayer';
import { buildWidgetPayload } from './buildWidgetPayload';

type NativePrayerWidget = {
  setData: (json: string) => Promise<void>;
};

function getNativeModule(): NativePrayerWidget | null {
  // TurboModuleRegistry is required in New Architecture (RN 0.76+)
  const turbo = TurboModuleRegistry.get<NativePrayerWidget>('PrayerWidget');
  if (turbo?.setData) return turbo;
  const legacy = NativeModules.PrayerWidget as NativePrayerWidget | undefined;
  return legacy?.setData ? legacy : null;
}

/**
 * Updates home-screen widget data (Android + iOS when native module is linked).
 */
export async function syncPrayerWidget(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date = new Date(),
  locationName?: string,
): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }
  const mod = getNativeModule();
  if (!mod) {
    return;
  }
  const payload = buildWidgetPayload(today, tomorrow, now, locationName);
  try {
    await mod.setData(JSON.stringify(payload));
  } catch {
    /* widget is best-effort */
  }
}
