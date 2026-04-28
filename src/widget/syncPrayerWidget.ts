import { Platform } from 'react-native';
import type { TimingsMap } from '../types/prayer';
import { buildWidgetPayload } from './buildWidgetPayload';
import { getPrayerWidgetModule } from '../native/PrayerWidget';

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
  const mod = getPrayerWidgetModule();
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
