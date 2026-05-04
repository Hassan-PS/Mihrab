import AsyncStorage from '@react-native-async-storage/async-storage';
import { coerceNotificationSoundId } from '../notifications/notificationSounds';
import { coercePrePrayerReminderMinutes } from './prePrayerReminder';
import {
  extractSecureFields,
  hasSecureFields,
  loadSecureSettings,
  saveSecureSettings,
  stripSecureFields,
  type SecureSettings,
} from './secureStorage';
import {
  DEFAULT_SETTINGS,
  type AppLanguage,
  type PrayerAppSettings,
  type WidgetHighlightId,
} from './types';

const KEY = 'prayerapp.settings.v1';

const LANGUAGES: AppLanguage[] = ['en', 'sv', 'ar', 'bn', 'ur', 'hi', 'fr', 'es', 'de', 'tr', 'id', 'ru', 'zh'];

const WIDGET_HIGHLIGHT_IDS: WidgetHighlightId[] = [
  'dynamic',
  'green',
  'teal',
  'blue',
  'amber',
  'custom',
];

function coerceLanguage(value: unknown): AppLanguage {
  if (typeof value === 'string' && LANGUAGES.includes(value as AppLanguage)) {
    return value as AppLanguage;
  }
  return DEFAULT_SETTINGS.language;
}

function coerceWidgetHighlightId(value: unknown): WidgetHighlightId {
  if (
    typeof value === 'string' &&
    WIDGET_HIGHLIGHT_IDS.includes(value as WidgetHighlightId)
  ) {
    return value as WidgetHighlightId;
  }
  return DEFAULT_SETTINGS.widgetHighlightId;
}

function coerceWidgetHighlightHex(value: unknown): string {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim())) {
    return value.trim();
  }
  return DEFAULT_SETTINGS.widgetHighlightCustomHex;
}

function coerceWidgetOpacity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(Math.min(100, Math.max(0, value)));
  }
  return DEFAULT_SETTINGS.androidWidgetBackgroundOpacity;
}

/**
 * Load settings — task #16.
 *
 * Settings live in TWO stores:
 *   • Plaintext AsyncStorage (`prayerapp.settings.v1`): theme, language,
 *     notifications, calculation method, widget appearance — non-sensitive.
 *   • Encrypted Keychain/Keystore (`prayerapp.location.v1`): coordinates and
 *     manual-location label — PII, never plaintext on disk.
 *
 * Migration: if an old plaintext blob still contains coordinate fields
 * (a pre-task-#16 install), this function copies them to the encrypted
 * store and re-saves the plaintext blob WITHOUT them. The migration runs
 * inline on every `loadSettings()` call but is idempotent — once the
 * plaintext blob no longer carries coordinates, subsequent loads no-op.
 */
export async function loadSettings(): Promise<PrayerAppSettings> {
  let plaintextRaw: string | null = null;
  try {
    plaintextRaw = await AsyncStorage.getItem(KEY);
  } catch {
    return DEFAULT_SETTINGS;
  }

  let secure: SecureSettings = {};
  try {
    secure = await loadSecureSettings();
  } catch {
    // Already logged inside loadSecureSettings. Fall through with empty.
  }

  if (!plaintextRaw) {
    // First-ever launch (no plaintext blob). Encrypted store may still
    // hold coordinates from a partially-completed prior session — merge.
    return { ...DEFAULT_SETTINGS, ...secure };
  }

  let parsed: Partial<PrayerAppSettings> & Record<string, unknown>;
  try {
    parsed = JSON.parse(plaintextRaw) as Partial<PrayerAppSettings> &
      Record<string, unknown>;
  } catch {
    return { ...DEFAULT_SETTINGS, ...secure };
  }

  // Migration: if the plaintext blob still has coordinate fields, this is a
  // pre-task-#16 install. Copy them into the encrypted store, then strip
  // them from the plaintext blob and re-save.
  if (hasSecureFields(parsed)) {
    const fromPlain = extractSecureFields(parsed);
    // Encrypted store wins on overlap (it's the newer, authoritative source
    // for sensitive fields if the user already migrated partially).
    const migrated: SecureSettings = { ...fromPlain, ...secure };
    try {
      await saveSecureSettings(migrated);
      const stripped = stripSecureFields(parsed);
      await AsyncStorage.setItem(KEY, JSON.stringify(stripped));
      secure = migrated;
      parsed = stripped as Partial<PrayerAppSettings> & Record<string, unknown>;
    } catch (e) {
      // Migration failed (e.g., Keychain locked). Don't strip plaintext —
      // we'd lose the user's coordinates. Try again next launch.
      console.warn('Settings migration to encrypted storage failed:', e);
    }
  }

  const merged: PrayerAppSettings = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    ...secure,
  };
  merged.language = coerceLanguage(parsed.language);
  if (!('locationOnboardingComplete' in parsed)) {
    merged.locationOnboardingComplete = true;
  }
  if (!('dataProviderAuto' in parsed)) {
    merged.dataProviderAuto = false;
  }
  if (!('appearance' in parsed)) {
    merged.appearance = 'system';
  }
  if (!('pureBlackDark' in parsed)) {
    merged.pureBlackDark = false;
  }
  if (!('useSystemDynamicTheme' in parsed)) {
    merged.useSystemDynamicTheme = false;
  }
  // App accent (#127). Older installs persisted no `appAccentId`; fall
  // back to the brand green default and a valid 6-char hex so the
  // palette resolver always has something concrete to work with.
  const validAccentIds: ReadonlyArray<string> = ['green', 'teal', 'blue', 'amber', 'custom'];
  if (
    typeof parsed.appAccentId !== 'string' ||
    !validAccentIds.includes(parsed.appAccentId)
  ) {
    merged.appAccentId = DEFAULT_SETTINGS.appAccentId;
  }
  if (
    typeof parsed.appAccentCustomHex !== 'string' ||
    !/^#[0-9A-Fa-f]{6}$/.test(parsed.appAccentCustomHex)
  ) {
    merged.appAccentCustomHex = DEFAULT_SETTINGS.appAccentCustomHex;
  }
  merged.androidWidgetBackgroundOpacity = coerceWidgetOpacity(
    parsed.androidWidgetBackgroundOpacity,
  );
  merged.widgetHighlightId = coerceWidgetHighlightId(parsed.widgetHighlightId);
  merged.widgetHighlightCustomHex = coerceWidgetHighlightHex(
    parsed.widgetHighlightCustomHex,
  );
  merged.prePrayerReminderMinutes = coercePrePrayerReminderMinutes(
    parsed.prePrayerReminderMinutes,
  );
  merged.notificationSound = coerceNotificationSoundId(parsed.notificationSound);
  // Migrate locationMode: 'gps' was renamed to 'automatic' in v1.5.52+
  if ((merged.locationMode as string) === 'gps') {
    merged.locationMode = 'automatic';
  }
  // Task #18: location presets always present (default empty array). Active
  // preset id is preserved if it points at an existing preset, dropped otherwise
  // (defends against a deleted-preset reference surviving in plaintext storage).
  if (!Array.isArray(merged.locationPresets)) {
    merged.locationPresets = [];
  }
  if (
    merged.activeLocationPresetId !== undefined &&
    !merged.locationPresets.some(p => p.id === merged.activeLocationPresetId)
  ) {
    merged.activeLocationPresetId = undefined;
  }
  return merged;
}

/**
 * Save settings — splits sensitive fields off to encrypted storage.
 *
 * The plaintext AsyncStorage blob is GUARANTEED to never contain
 * coordinates after this call. The regression test
 * `__tests__/secureStorage.migration.test.ts` confirms this invariant.
 */
export async function saveSettings(settings: PrayerAppSettings): Promise<void> {
  const secure = extractSecureFields(settings as unknown as Record<string, unknown>);
  const plaintext = stripSecureFields(
    settings as unknown as Record<string, unknown>,
  );
  // Encrypted save first — if it fails, we don't strip the plaintext, so the
  // user's coordinates aren't lost. saveSecureSettings throws on failure.
  await saveSecureSettings(secure);
  await AsyncStorage.setItem(KEY, JSON.stringify(plaintext));
}

/**
 * Hard reset — task #85.
 *
 * Wipes EVERY persisted store the app owns:
 *   • Plaintext settings blob (`prayerapp.settings.v1`)
 *   • Encrypted location store (`prayerapp.location.v1`)
 *   • Encrypted journal entries (`prayerapp.journal.v1`)
 *   • Encrypted fasting entries (`prayerapp.fasting.v1`)
 *   • Prayer-times cache and any miscellaneous AsyncStorage keys we wrote
 *
 * Used by the "Show onboarding again" entry in Settings, which is now a
 * destructive reset gated behind a confirmation Alert. After this call
 * returns, the next `loadSettings()` will see a virgin state and the
 * onboarding flow will run from scratch.
 */
export async function resetAppData(): Promise<void> {
  // Plaintext: clear EVERYTHING we own. AsyncStorage.clear() is too broad
  // (it would also nuke other libraries' storage), so we enumerate keys
  // we authored.
  const asyncKeys = [
    'prayerapp.settings.v1',
    'prayerapp.prayer.v1',
    // Mushaf one-time-download flag — task #130. Clearing forces the
    // download prompt to re-appear on first mushaf open after reset.
    'mushaf.assets.v1.complete',
    'mushaf.assets.v2.complete',
  ];
  try {
    await AsyncStorage.multiRemove(asyncKeys);
  } catch (e) {
    console.warn('AsyncStorage reset failed:', e);
  }

  // Encrypted: wipe the three known keys. Use dynamic require so test
  // environments without the native module don't blow up.
  try {
    const EncryptedStorage =
      require('react-native-encrypted-storage').default ||
      require('react-native-encrypted-storage');
    const secureKeys = [
      'prayerapp.location.v1',
      'prayerapp.journal.v1',
      'prayerapp.fasting.v1',
    ];
    for (const k of secureKeys) {
      try {
        await EncryptedStorage.removeItem(k);
      } catch {
        // missing keys throw on some platforms — non-fatal
      }
    }
  } catch (e) {
    console.warn('EncryptedStorage reset failed:', e);
  }
}
