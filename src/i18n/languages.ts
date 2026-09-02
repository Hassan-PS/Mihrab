import type { AppLanguage } from '../settings/types';

/**
 * The languages Mihrab ships, each named in itself.
 *
 * A list in one place because there are now two pickers reading it: the
 * app's own language in Settings, and the language of the shared month
 * sheet, which is a different question with a different answer — the
 * person sending the sheet and the people pinning it up need not read the
 * same language, and often do not.
 *
 * Named in the language itself, never translated. Someone looking for
 * their own language is looking for the word they would write it with.
 */
export const APP_LANGUAGES: { id: AppLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'sv', label: 'Svenska' },
  { id: 'ar', label: 'العربية' },
  { id: 'bn', label: 'বাংলা' },
  { id: 'ur', label: 'اردو' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Español' },
  { id: 'de', label: 'Deutsch' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'id', label: 'Bahasa Indonesia' },
  { id: 'ru', label: 'Русский' },
  { id: 'zh', label: '中文' },
];

/** What to call a language, for a picker row or a caption. */
export function languageLabel(id: string): string {
  const two = id.slice(0, 2).toLowerCase();
  return APP_LANGUAGES.find(l => l.id === two)?.label ?? id;
}
