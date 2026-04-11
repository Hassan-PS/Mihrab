import { NativeModules, Platform } from 'react-native';

type PrayerBuildInfoNative = {
  distribution?: string;
};

/**
 * Google Play / default Android build — includes optional in-app tips (IAP).
 * F-Droid build omits Play Billing and must not show donation UI.
 */
export function getAndroidDistribution(): 'play' | 'fdroid' {
  if (Platform.OS !== 'android') {
    return 'play';
  }
  const m = NativeModules.PrayerBuildInfo as PrayerBuildInfoNative | undefined;
  return m?.distribution === 'fdroid' ? 'fdroid' : 'play';
}

export function showDonationsUi(): boolean {
  return getAndroidDistribution() !== 'fdroid';
}
