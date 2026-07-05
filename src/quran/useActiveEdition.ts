/**
 * Resolve the active translation edition — extracted from
 * QuranSurahScreen (#124) so the mushaf action sheet (QR-9) and the
 * translation view share one resolution rule:
 *
 *   explicit user choice, but only while it still matches the app
 *   language; otherwise the locale-appropriate default.
 */
import { useMemo } from 'react';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import {
  defaultEditionForLocale,
  editionMatchesLocale,
  type QuranTranslationId,
} from './translations';

export function useActiveEdition(): QuranTranslationId {
  const { settings } = usePrayerSettings();
  return useMemo(() => {
    if (
      settings.quranTranslationEdition &&
      editionMatchesLocale(settings.quranTranslationEdition, settings.language)
    ) {
      return settings.quranTranslationEdition as QuranTranslationId;
    }
    return defaultEditionForLocale(settings.language);
  }, [settings.quranTranslationEdition, settings.language]);
}
