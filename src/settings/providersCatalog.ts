import i18n from '../i18n';
import type { PrayerDataProviderId } from './types';

export type ProviderOption = {
  id: PrayerDataProviderId;
  /** English fallback name. */
  name: string;
  /** English fallback description. */
  description: string;
  /** i18next key for the localized name. */
  nameKey: string;
  /** i18next key for the localized description. */
  descriptionKey: string;
};

/** Widely used global APIs and on-device calculation (not tied to one country). */
export const MAINSTREAM_PRAYER_PROVIDERS: ProviderOption[] = [
  {
    id: 'aladhan',
    name: 'AlAdhan',
    description:
      'api.aladhan.com — large method list, coordinates worldwide; very widely used.',
    nameKey: 'providers.aladhan.name',
    descriptionKey: 'providers.aladhan.desc',
  },
  {
    id: 'prayertimes_dev',
    name: 'PrayTimes.dev',
    description:
      'Independent API — UK-style angles & offsets; Hanafi/Shafi; global coordinates.',
    nameKey: 'providers.prayertimes_dev.name',
    descriptionKey: 'providers.prayertimes_dev.desc',
  },
  {
    id: 'local_adhan',
    name: 'On-device (Adhan JS)',
    description:
      'Calculated on your phone with Batoul Adhan — no network prayer API.',
    nameKey: 'providers.local_adhan.name',
    descriptionKey: 'providers.local_adhan.desc',
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
    nameKey: 'providers.islamiska_forbundet.name',
    descriptionKey: 'providers.islamiska_forbundet.desc',
  },
];

/** Full list for lookups, settings copy, and labels (order: mainstream then regional). */
export const PRAYER_DATA_PROVIDERS: ProviderOption[] = [
  ...MAINSTREAM_PRAYER_PROVIDERS,
  ...REGIONAL_PRAYER_PROVIDERS,
];

/**
 * Resolve the localized name of a provider. Reads through i18next so the
 * label tracks the active app language; falls back to the English name
 * if no translation is registered.
 */
export function getProviderLabel(id: PrayerDataProviderId): string {
  const found = PRAYER_DATA_PROVIDERS.find(p => p.id === id);
  if (!found) return id;
  return i18n.t(found.nameKey, { defaultValue: found.name });
}

/** Resolve the localized description of a provider. */
export function getProviderDescription(id: PrayerDataProviderId): string {
  const found = PRAYER_DATA_PROVIDERS.find(p => p.id === id);
  if (!found) return '';
  return i18n.t(found.descriptionKey, { defaultValue: found.description });
}
