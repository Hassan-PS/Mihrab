export type LocationMode = 'gps' | 'manual';

export type PrayerDataProviderId =
  | 'aladhan'
  | 'prayertimes_dev'
  | 'islamiska_forbundet'
  | 'local_adhan';

export type AppearancePreference = 'system' | 'light' | 'dark';

export type AppLanguage = 'en' | 'sv' | 'ar';

export type PrayerAppSettings = {
  /** Follow OS light/dark, or force one mode. */
  appearance: AppearancePreference;
  /** When dark, use #000 background (OLED); ignored in light mode. */
  pureBlackDark: boolean;
  dataProvider: PrayerDataProviderId;
  /**
   * When true, coordinates in Sweden use Sweden (city-list) prayer times; outside Sweden, AlAdhan.
   * Choosing a provider from the list sets this to false.
   */
  dataProviderAuto: boolean;
  calculationMethod: number;
  school: number;
  locationMode: LocationMode;
  manualLatitude: number;
  manualLongitude: number;
  /** Set when the user picks a place from search (optional). */
  manualLocationLabel?: string;
  /** False until the user picks GPS or manual setup on first launch. */
  locationOnboardingComplete: boolean;
  /** UI language (English, Swedish, Arabic). */
  language: AppLanguage;
  /** Last coordinates used for API/GPS (for month view when GPS). */
  lastFetchedLatitude?: number;
  lastFetchedLongitude?: number;
  notificationsEnabled: boolean;
};

export const DEFAULT_SETTINGS: PrayerAppSettings = {
  appearance: 'system',
  pureBlackDark: false,
  dataProvider: 'aladhan',
  dataProviderAuto: true,
  calculationMethod: 2,
  school: 0,
  locationMode: 'manual',
  manualLatitude: 51.5074,
  manualLongitude: -0.1278,
  locationOnboardingComplete: false,
  language: 'en',
  notificationsEnabled: false,
};
