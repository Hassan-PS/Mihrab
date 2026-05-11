/**
 * Typed wrapper for the PrayerLiveActivity native module (iOS only).
 *
 * On Android the Live Activity is implemented entirely in JS via notifee
 * (see `src/notifications/liveActivity.ts`) — the module returned here
 * is always `null` and callers must skip into the notifee path.
 *
 * On iOS the module will (in a follow-up — task #129) bridge into
 * ActivityKit so the user gets a Lock-Screen Live Activity and Dynamic
 * Island treatment. Until that lands the native module is unavailable
 * and `getPrayerLiveActivityModule()` returns null, so the orchestrator
 * silently no-ops on iOS.
 */
import { NativeModules, TurboModuleRegistry } from 'react-native';

export type PrayerLiveActivityContent = {
  /** Localised app-language code, e.g. 'en' | 'ar' — drives Activity layout direction. */
  locale: string;
  /** Stable identifier for the upcoming prayer, e.g. 'Fajr' (matches WIDGET_ROW_KEYS). */
  nextKey: string;
  /** Already-localised label, e.g. 'Fajr' or 'الفجر'. */
  nextLabel: string;
  /** Wall-clock string for the next prayer, e.g. '05:14'. */
  nextTime: string;
  /** Seconds-since-epoch of the next prayer — matches Swift ContentState.nextEpochSeconds.
   *  Convert from ms: nextPrayerTimestamp / 1000. */
  nextEpochSeconds: number;
  /** Same row list the home-screen widget uses (Fajr, Dhuhr, Asr, Maghrib, Isha). */
  rows: { key: string; abbr: string; time: string }[];
  /** Sunrise row when the user opted to show it. */
  sunriseRow?: { key: string; abbr: string; time: string };
  /** Optional caption lines — pass empty strings to omit. */
  hijriLabel: string;
  locationLabel: string;
  /** Display knobs — the widget reads these to decide what to show. */
  compactMode: boolean;
  showSunrise: boolean;
  showHijri: boolean;
  showLocation: boolean;
};

export interface PrayerLiveActivityInterface {
  /** Start a new Live Activity. Idempotent: if one is already running for
   *  the same content, the implementation should `update` it in place. */
  start(json: string): Promise<void>;
  /** Push fresh content to the existing activity. */
  update(json: string): Promise<void>;
  /** End any running Live Activity. */
  stop(): Promise<void>;
  /** True when the OS supports Live Activities and the user hasn't disabled them. */
  isAvailable(): Promise<boolean>;
}

export function getPrayerLiveActivityModule(): PrayerLiveActivityInterface | null {
  const legacy = NativeModules.PrayerLiveActivity as
    | PrayerLiveActivityInterface
    | undefined;
  if (legacy?.start) return legacy;
  try {
    const turbo = TurboModuleRegistry.get(
      'PrayerLiveActivity',
    ) as PrayerLiveActivityInterface | null;
    if (turbo) return turbo;
  } catch {
    // TurboModuleRegistry throws when the module isn't registered.
  }
  return null;
}
