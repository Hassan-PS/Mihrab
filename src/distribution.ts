import { NativeModules, Platform } from 'react-native';

type PrayerBuildInfoNative = {
  distribution?: string;
};

export type AndroidDistribution = 'play' | 'fdroid' | 'github';

/**
 * Android: which store (or none) the running APK came from — `play`,
 * `fdroid`, or `github` (the Releases APK Obtainium installs). iOS reports
 * `play`, which nothing on iOS reads.
 */
export function getAndroidDistribution(): AndroidDistribution {
  if (Platform.OS !== 'android') {
    return 'play';
  }
  const m = NativeModules.PrayerBuildInfo as PrayerBuildInfoNative | undefined;
  const d = m?.distribution;
  return d === 'fdroid' || d === 'github' ? d : 'play';
}

/**
 * There is no `showDonationsUi` any more.
 *
 * The tip jar is gone — the in-app purchase, the About-card section, the
 * `react-native-iap` dependency and the Play Billing override with it. What
 * remains of the flavor split is the thing it was always really for: F-Droid
 * ships without Google Play Services, so `rateApp` has no Play Store to open.
 */
