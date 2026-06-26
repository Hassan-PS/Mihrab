/**
 * Shared Hijri date label, e.g. "12 Dhul-Qa'dah 1447".
 *
 * Uses the tabular Umm al-Qura conversion (`gregorianToHijri`) and localises the
 * month name through i18n (`hijri.month_<n>`), falling back to the English table
 * when a locale is missing the key. One source of truth for the home cards and
 * the Live Activity.
 */
import i18n from '../i18n';
import { gregorianToHijri } from './convert';

const HIJRI_MONTHS_EN = [
  'Muharram',
  'Safar',
  'Rabi I',
  'Rabi II',
  'Jumada I',
  'Jumada II',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhul-Qa'dah",
  'Dhul-Hijjah',
] as const;

export function formatHijriLabel(d: Date): string {
  const h = gregorianToHijri(d);
  const monthKey = `hijri.month_${h.month}`;
  const month = i18n.exists(monthKey)
    ? i18n.t(monthKey)
    : HIJRI_MONTHS_EN[h.month - 1];
  return `${h.day} ${month} ${h.year}`;
}
