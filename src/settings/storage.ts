import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SETTINGS,
  type AppLanguage,
  type PrayerAppSettings,
  type WidgetHighlightId,
} from './types';

const KEY = 'prayerapp.settings.v1';

const LANGUAGES: AppLanguage[] = ['en', 'sv', 'ar'];

const WIDGET_HIGHLIGHT_IDS: WidgetHighlightId[] = [
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
    return Math.round(Math.min(100, Math.max(20, value)));
  }
  return DEFAULT_SETTINGS.androidWidgetBackgroundOpacity;
}

export async function loadSettings(): Promise<PrayerAppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<PrayerAppSettings> &
      Record<string, unknown>;
    const merged: PrayerAppSettings = { ...DEFAULT_SETTINGS, ...parsed };
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
    merged.androidWidgetBackgroundOpacity = coerceWidgetOpacity(
      parsed.androidWidgetBackgroundOpacity,
    );
    merged.widgetHighlightId = coerceWidgetHighlightId(parsed.widgetHighlightId);
    merged.widgetHighlightCustomHex = coerceWidgetHighlightHex(
      parsed.widgetHighlightCustomHex,
    );
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: PrayerAppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
