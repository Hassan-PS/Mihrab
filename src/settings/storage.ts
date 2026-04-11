import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SETTINGS,
  type AndroidWidgetHighlightId,
  type AppLanguage,
  type PrayerAppSettings,
} from './types';

const KEY = 'prayerapp.settings.v1';

const LANGUAGES: AppLanguage[] = ['en', 'sv', 'ar'];

const WIDGET_HIGHLIGHTS: AndroidWidgetHighlightId[] = [
  'green',
  'teal',
  'blue',
  'amber',
];

function coerceLanguage(value: unknown): AppLanguage {
  if (typeof value === 'string' && LANGUAGES.includes(value as AppLanguage)) {
    return value as AppLanguage;
  }
  return DEFAULT_SETTINGS.language;
}

function coerceWidgetHighlight(value: unknown): AndroidWidgetHighlightId {
  if (
    typeof value === 'string' &&
    WIDGET_HIGHLIGHTS.includes(value as AndroidWidgetHighlightId)
  ) {
    return value as AndroidWidgetHighlightId;
  }
  return DEFAULT_SETTINGS.androidWidgetHighlight;
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
    if (!('androidWidgetBackgroundOpacity' in parsed)) {
      merged.androidWidgetBackgroundOpacity =
        DEFAULT_SETTINGS.androidWidgetBackgroundOpacity;
    } else {
      const o = Number(parsed.androidWidgetBackgroundOpacity);
      merged.androidWidgetBackgroundOpacity = Number.isFinite(o)
        ? Math.min(100, Math.max(0, Math.round(o)))
        : DEFAULT_SETTINGS.androidWidgetBackgroundOpacity;
    }
    merged.androidWidgetHighlight = coerceWidgetHighlight(
      parsed.androidWidgetHighlight,
    );
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: PrayerAppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
