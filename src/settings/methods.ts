import i18n from '../i18n';

export type CalculationMethodOption = {
  id: number | 'auto';
  /** English fallback name (used when no translation key resolves). */
  name: string;
  /** i18next key path under `methods.<id>` — translated name. */
  nameKey: string;
};

export const CALCULATION_METHODS: CalculationMethodOption[] = [
  { id: 'auto', name: 'Automatic (by location)', nameKey: 'methods.auto' },
  { id: 0, name: 'Shia — Ithna Ashari', nameKey: 'methods.0' },
  { id: 1, name: 'University of Islamic Sciences, Karachi', nameKey: 'methods.1' },
  { id: 2, name: 'Islamic Society of North America (ISNA)', nameKey: 'methods.2' },
  { id: 3, name: 'Muslim World League', nameKey: 'methods.3' },
  { id: 4, name: 'Umm Al-Qura University, Makkah', nameKey: 'methods.4' },
  { id: 5, name: 'Egyptian General Authority of Survey', nameKey: 'methods.5' },
  { id: 7, name: 'Institute of Geophysics, University of Tehran', nameKey: 'methods.7' },
  { id: 8, name: 'Gulf Region', nameKey: 'methods.8' },
  { id: 9, name: 'Kuwait', nameKey: 'methods.9' },
  { id: 10, name: 'Qatar', nameKey: 'methods.10' },
  { id: 11, name: 'Singapore', nameKey: 'methods.11' },
  { id: 12, name: 'France', nameKey: 'methods.12' },
  { id: 13, name: 'Turkey', nameKey: 'methods.13' },
  { id: 14, name: 'Russia', nameKey: 'methods.14' },
  { id: 15, name: 'Moonsighting Committee Worldwide', nameKey: 'methods.15' },
];

/**
 * Resolve the localized name of a calculation method. Reads through
 * i18next so the label tracks the active app language; falls back to
 * the English name if no translation is registered.
 */
export function getMethodLabel(id: number | 'auto'): string {
  const found = CALCULATION_METHODS.find(m => m.id === id);
  if (!found) return `Method ${id}`;
  return i18n.t(found.nameKey, { defaultValue: found.name });
}
