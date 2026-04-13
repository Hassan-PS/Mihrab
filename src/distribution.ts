import { NativeModules, Platform } from 'react-native';

type PrayerBuildInfoNative = {
  distribution?: string;
};

/**
 * Android: `play` vs `fdroid` (F-Droid omits billing). iOS is not `android`.
 */
export function getAndroidDistribution(): 'play' | 'fdroid' {
  if (Platform.OS !== 'android') {
    return 'play';
  }
  const m = NativeModules.PrayerBuildInfo as PrayerBuildInfoNative | undefined;
  return m?.distribution === 'fdroid' ? 'fdroid' : 'play';
}

/**
 * Optional tips (IAP) — **Android Play flavor only**.
 * iOS build omits this UI so review does not require IAP products until they are configured in App Store Connect.
 */
export function showDonationsUi(): boolean {
  return Platform.OS === 'android' && getAndroidDistribution() !== 'fdroid';
}
