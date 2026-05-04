import type { PrePrayerReminderMinutes } from './prePrayerReminder';
import type { NotificationSoundId } from '../notifications/notificationSounds';
import type { PrayerOffsetMinutes } from './prayerOffsets';

export type LocationMode = 'automatic' | 'manual';

export type PrayerDataProviderId =
  | 'aladhan'
  | 'prayertimes_dev'
  | 'islamiska_forbundet'
  | 'local_adhan';

export type AppearancePreference = 'system' | 'light' | 'dark';

export type AppLanguage = 'en' | 'sv' | 'ar' | 'bn' | 'ur' | 'hi' | 'fr' | 'es' | 'de' | 'tr' | 'id' | 'ru' | 'zh';

/** Next-prayer row color on the home screen widget (preset, dynamic, or custom hex). */
export type WidgetHighlightId =
  | 'dynamic'
  | 'green'
  | 'teal'
  | 'blue'
  | 'amber'
  | 'custom';

/**
 * A user-saved location preset — task #18.
 *
 * Lets the user keep "Home", "Work", "Trip to Mecca" etc. as named snapshots
 * and switch between them with one tap. Coordinates are PII so the entire
 * preset list lives in encrypted storage (see `secureStorage.ts`).
 *
 * The active preset's coordinates are also copied into `manualLatitude` /
 * `manualLongitude` / `manualLocationLabel` so the rest of the app keeps
 * reading those fields without needing to know about presets — the preset
 * system is purely additive.
 */
export type LocationPreset = {
  /** Stable opaque id (uuid-like string). */
  id: string;
  /** User-given name, e.g. "Home", "Office". */
  name: string;
  latitude: number;
  longitude: number;
  /** Optional place-name label captured at save time, e.g. "Stockholm, Sweden". */
  label?: string;
};

export type PrayerAppSettings = {
  /** Follow OS light/dark, or force one mode. */
  appearance: AppearancePreference;
  /**
   * When theme is System, use platform semantic colors (iOS system colors,
   * Android Material / dynamic color). Ignored when appearance is not system.
   */
  useSystemDynamicTheme: boolean;
  /** When dark, use #000 background (OLED); ignored in light mode. */
  pureBlackDark: boolean;
  dataProvider: PrayerDataProviderId;
  /**
   * When true, coordinates in Sweden use Sweden (city-list) prayer times; outside Sweden, AlAdhan.
   * Choosing a provider from the list sets this to false.
   */
  dataProviderAuto: boolean;
  calculationMethod: number | 'auto';
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
  /**
   * Extra notification this many minutes before each prayer (0 = off).
   * Only applies when `notificationsEnabled` is true.
   */
  prePrayerReminderMinutes: PrePrayerReminderMinutes;
  /** Notification sound profile for prayer alerts/reminders. */
  notificationSound: NotificationSoundId;
  /** Android: widget background opacity 0–100. */
  androidWidgetBackgroundOpacity: number;
  /** Highlight style for the widget next-prayer row. */
  widgetHighlightId: WidgetHighlightId;
  /** When `widgetHighlightId` is `custom`, #RRGGBB (e.g. #6BC98A). */
  widgetHighlightCustomHex: string;
  /**
   * User's saved location presets — task #18. Always-present (never
   * undefined); empty array means no presets saved yet.
   */
  locationPresets: LocationPreset[];
  /**
   * Id of the preset currently in use. When set, `manualLatitude` /
   * `manualLongitude` / `manualLocationLabel` mirror the matching preset's
   * fields (the rest of the app still reads from `manual*`). When the user
   * edits coords directly or picks a new place, this is cleared.
   */
  activeLocationPresetId?: string;
  /**
   * Per-prayer offsets in minutes — task #22. Allows the user to nudge
   * each prayer ±N minutes to match a local mosque schedule. Empty object
   * (default) means no offsets are applied. See `applyOffsets()` in
   * `src/settings/prayerOffsets.ts` for the math; the values are applied
   * AFTER provider validation but BEFORE caching/widget push so a buggy
   * offset never poisons the cache.
   */
  prayerOffsets: PrayerOffsetMinutes;
  /**
   * Onboarding flow completion flag — task #30 + follow-up #60.
   *
   * False on first launch; flipped true when the user completes (or
   * skips) the OnboardingScreen flow. Distinct from
   * `locationOnboardingComplete` which gates only the location step —
   * this gates the wider welcome / notifications / exact-alarms flow.
   */
  onboardingComplete: boolean;
};

export const DEFAULT_SETTINGS: PrayerAppSettings = {
  appearance: 'system',
  useSystemDynamicTheme: false,
  pureBlackDark: false,
  dataProvider: 'aladhan',
  dataProviderAuto: true,
  calculationMethod: 'auto',
  school: 0,
  // Default to GPS so first-run users in Sweden (or anywhere) don't get
  // stuck on a hardcoded "manual" placeholder if they skip onboarding.
  // Onboarding's manual-entry path explicitly switches this to 'manual'
  // when the user picks a city / coordinates.
  locationMode: 'automatic',
  // 0/0 is intentionally an "unset" sentinel — every consumer gates on
  // `locationOnboardingComplete` and falls back to GPS in automatic mode,
  // so these values are only ever read after the user has explicitly
  // chosen a manual location.
  manualLatitude: 0,
  manualLongitude: 0,
  locationOnboardingComplete: false,
  language: 'en',
  notificationsEnabled: false,
  prePrayerReminderMinutes: 0,
  notificationSound: 'default',
  androidWidgetBackgroundOpacity: 88,
  widgetHighlightId: 'green',
  widgetHighlightCustomHex: '#6BC98A',
  locationPresets: [],
  prayerOffsets: {},
  onboardingComplete: false,
};
