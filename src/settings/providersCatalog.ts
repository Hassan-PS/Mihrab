import type { PrayerDataProviderId } from './types';

export type ProviderOption = {
  id: PrayerDataProviderId;
  name: string;
  description: string;
};

/** Widely used global APIs and on-device calculation (not tied to one country). */
export const MAINSTREAM_PRAYER_PROVIDERS: ProviderOption[] = [
  {
    id: 'aladhan',
    name: 'AlAdhan',
    description:
      'api.aladhan.com — large method list, coordinates worldwide; very widely used.',
  },
  {
    id: 'prayertimes_dev',
    name: 'PrayTimes.dev',
    description:
      'Independent API — UK-style angles & offsets; Hanafi/Shafi; global coordinates.',
  },
  {
    id: 'local_adhan',
    name: 'On-device (Adhan JS)',
    description:
      'Calculated on your phone with Batoul Adhan — no network prayer API.',
  },
];

/**
 * Official or national-style tables where the app integrates a dedicated source.
 * Extend this list as more country-specific providers are added.
 */
export const REGIONAL_PRAYER_PROVIDERS: ProviderOption[] = [
  {
    id: 'islamiska_forbundet',
    name: 'Sweden',
    description:
      'Prayer times for listed Swedish cities; your location is matched to the nearest city in the list.',
  },
];

/** Full list for lookups, settings copy, and labels (order: mainstream then regional). */
export const PRAYER_DATA_PROVIDERS: ProviderOption[] = [
  ...MAINSTREAM_PRAYER_PROVIDERS,
  ...REGIONAL_PRAYER_PROVIDERS,
];

export function getProviderLabel(id: PrayerDataProviderId): string {
  return PRAYER_DATA_PROVIDERS.find(p => p.id === id)?.name ?? id;
}
