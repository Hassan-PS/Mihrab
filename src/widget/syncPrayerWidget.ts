import { Platform } from 'react-native';
import type { TimingsMap } from '../types/prayer';
import {
  buildWidgetPayload,
  type WidgetCoords,
  type WidgetSeasonalFlags,
} from './buildWidgetPayload';
import { getPrayerWidgetModule } from '../native/PrayerWidget';

/**
 * Updates home-screen widget data (Android + iOS when native module is linked).
 *
 * @param coords Optional. When provided and both lat and lng are exactly 0,
 * `buildWidgetPayload` throws — this is the (0, 0) gate. Callers with coords
 * SHOULD pass them; the gate is the only thing standing between a corrupted
 * coord pipeline and Ghana-coast prayer times reaching the user's home screen.
 */
export async function syncPrayerWidget(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date = new Date(),
  locationName?: string,
  coords?: WidgetCoords,
  seasonal?: WidgetSeasonalFlags,
): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }
  const mod = getPrayerWidgetModule();
  if (!mod) {
    return;
  }
  const payload = buildWidgetPayload(
    today,
    tomorrow,
    now,
    locationName,
    coords,
    seasonal,
  );
  try {
    await mod.setData(JSON.stringify(payload));
  } catch {
    /* widget is best-effort */
  }
}
