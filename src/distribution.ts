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
 * There is no `showDonationsUi` any more.
 *
 * The tip jar is gone — the in-app purchase, the About-card section, the
 * `react-native-iap` dependency and the Play Billing override with it. What
 * remains of the flavor split is the thing it was always really for: F-Droid
 * ships without Google Play Services, so `rateApp` has no Play Store to open.
 */
