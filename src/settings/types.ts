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
 * App accent color id — task #127.
 *
 * Drives the in-app accent (`palette.accent`) AND, when dynamic colors
 * are OFF, also drives the widget highlight (so the user picks a color
 * once and both follow). Dynamic colors flips both to OS Material You /
 * iOS dynamic; the picker is hidden in that mode.
 *
 * Note: 'dynamic' is intentionally absent here — the unified
 * dynamic-color toggle on AppearanceCard handles that case.
 */
export type AppAccentId = 'green' | 'teal' | 'blue' | 'amber' | 'custom';

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
  /**
   * Active Quran translation edition — task #96.
   *
   * Empty string means "follow app language" (the default). When set,
   * the QuranSurahScreen reads from `src/quran/data/translations/{id}.json`
   * regardless of locale. See `src/quran/translations.ts` for the
   * registry.
   */
  quranTranslationEdition: string;
  /**
   * Reading mode for the QuranSurahScreen — task #97.
   *
   * `withTranslation` (default) shows ayah-by-ayah cards with Arabic +
   * translation. `mushaf` is a continuous Arabic-only reading view
   * styled like a printed mushaf page.
   */
  quranReadingMode: 'withTranslation' | 'mushaf';
  /**
   * Day-before fasting reminder — task #98.
   *
   * When true, schedules a notifee notification the evening before
   * each Monday, Thursday, and curated special day (Ashura, Arafah,
   * White Days, 6 of Shawwal, 1 Ramadan).
   */
  fastingRemindersEnabled: boolean;
  /** Hour of the day (0-23) the day-before fasting reminder fires. */
  fastingReminderHour: number;
  /**
   * Journal log-from-notification — task #99.
   *
   * When true, the prayer-time notification gets a "Log prayer" action
   * that opens the journal pre-targeted to today's row for that prayer.
   */
  journalNotificationActionsEnabled: boolean;
  /**
   * App accent color id — task #127. Drives the in-app accent and (when
   * `useSystemDynamicTheme` is off) also the widget highlight via the
   * sync logic in `syncWidgetUiHints.ts`. When `useSystemDynamicTheme`
   * is on, this is ignored and both app + widget use Material You.
   */
  appAccentId: AppAccentId;
  /** When `appAccentId` is 'custom', the user-typed #RRGGBB hex. */
  appAccentCustomHex: string;
  /**
   * Live Activity / persistent prayer-countdown notification — task #128.
   *
   * When ON, the app pins an ongoing notification (Android) or starts an
   * ActivityKit Live Activity (iOS 16.1+) showing the countdown to the
   * next prayer plus the rest of the day's times. Off by default so
   * notifications don't surprise upgraders.
   */
  liveActivityEnabled: boolean;
  // ── Retained-but-unused (since v2.1.0-beta.5) ──────────────────────────
  // These Live Activity display knobs were removed from the UI: Sunrise is
  // always shown and the Hijri/location captions are always omitted. The
  // fields are kept because the settings schema is additive-only (removing a
  // field breaks upgraders, see CLAUDE.md §12). Nothing reads them anymore.
  liveActivityCompactMode: boolean;
  liveActivityShowSunrise: boolean;
  liveActivityShowHijri: boolean;
  liveActivityShowLocation: boolean;
  /**
   * Visual style for the Android Live Activity. Both preserve the Android 16
   * status-bar chip + the always-on ongoing notification.
   *   'timeline'  — the full prayer-day ProgressStyle timeline with a marker at
   *                 each prayer and an inline countdown in the title (default).
   *   'countdown' — countdown-focused: the live countdown is the prominent title,
   *                 with the next prayer's name + clock time beneath it.
   * Android only; ignored on iOS.
   */
  liveActivityDesign: 'timeline' | 'countdown';
  /**
   * Non-prayer time toggles. Each gates one optional entry across the prayer
   * table, notifications, home-screen widget, and Live Activity. All three use
   * the default notification sound (never the adhan).
   *
   *  - `sunriseEnabled` — kill-switch for Sunrise (defaults ON: existing
   *    behaviour). When off, Sunrise disappears everywhere.
   *  - `islamicMidnightEnabled` — Islamic Midnight, the midpoint of the night
   *    (Maghrib → Fajr). Defaults OFF.
   *  - `lastThirdEnabled` — start of the last third of the night (Qiyām
   *    al-Layl). Defaults OFF.
   */
  sunriseEnabled: boolean;
  islamicMidnightEnabled: boolean;
  lastThirdEnabled: boolean;
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
  // Empty string = follow app language (resolved at read time via
  // `defaultEditionForLocale`).
  quranTranslationEdition: '',
  quranReadingMode: 'withTranslation',
  fastingRemindersEnabled: false,
  // 8 PM by default — late enough to land after isha, early enough that
  // the user notices before sleeping.
  fastingReminderHour: 20,
  journalNotificationActionsEnabled: false,
  // App accent defaults to brand green (matches the historical hardcoded
  // accent so users on existing installs see no visual diff after the
  // upgrade).
  appAccentId: 'green',
  appAccentCustomHex: '#22c55e',
  // Live Activity defaults: OFF; when enabled, the detail-rich layout
  // (full list + hijri + location) is the default — it's the more
  // useful version on the lock screen / shade. Sunrise included because
  // it's the most-requested data point not in the headline countdown.
  liveActivityEnabled: false,
  liveActivityCompactMode: false,
  liveActivityShowSunrise: true,
  liveActivityShowHijri: true,
  liveActivityShowLocation: true,
  liveActivityDesign: 'timeline',
  // Sunrise on by default (unchanged behaviour); the two night times off by
  // default so existing users see no new rows/notifications until they opt in.
  sunriseEnabled: true,
  islamicMidnightEnabled: false,
  lastThirdEnabled: false,
};
