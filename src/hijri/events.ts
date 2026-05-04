/**
 * Islamic events on the Hijri calendar — task #20.
 *
 * Pure data + lookup. The Hijri month/day conventions used here follow the
 * Umm al-Qura tabular calendar; actual moon-sighting may shift any specific
 * date by ±1 day — consumers should treat events as advisory.
 *
 * Event ids are stable (locale-independent) so other modules (notifications,
 * widget, fasting tracker) can key behavior off them. Localized labels live
 * in `src/i18n/locales/*.json` under the `events.<id>` namespace.
 */

export type IslamicEvent = {
  /** Stable opaque id used as the i18n key suffix (events.<id>). */
  id: string;
  /** Hijri month (1 = Muharram … 12 = Dhul Hijjah). */
  hijriMonth: number;
  /** Hijri day-of-month (1–30). */
  hijriDay: number;
  /** Free-form English fallback — rendered when the locale key is missing. */
  englishLabel: string;
  /** When true, the day is a major celebration (Eid) — use stronger UI accent. */
  major?: boolean;
};

/**
 * The events the app surfaces on the HomeScreen banner and in the
 * eventual month overlay (task #41 visual treatment).
 */
export const ISLAMIC_EVENTS: ReadonlyArray<IslamicEvent> = [
  { id: 'islamicNewYear', hijriMonth: 1, hijriDay: 1, englishLabel: 'Islamic New Year' },
  { id: 'ashura', hijriMonth: 1, hijriDay: 10, englishLabel: 'Day of Ashura' },
  { id: 'mawlid', hijriMonth: 3, hijriDay: 12, englishLabel: 'Mawlid an-Nabi' },
  { id: 'isra', hijriMonth: 7, hijriDay: 27, englishLabel: 'Isra and Mi’raj' },
  { id: 'midShaban', hijriMonth: 8, hijriDay: 15, englishLabel: 'Mid-Sha’ban' },
  { id: 'ramadanBegins', hijriMonth: 9, hijriDay: 1, englishLabel: 'Ramadan begins', major: true },
  { id: 'laylatAlQadr', hijriMonth: 9, hijriDay: 27, englishLabel: 'Laylat al-Qadr (observed)', major: true },
  { id: 'eidAlFitr', hijriMonth: 10, hijriDay: 1, englishLabel: 'Eid al-Fitr', major: true },
  { id: 'arafah', hijriMonth: 12, hijriDay: 9, englishLabel: 'Day of Arafah', major: true },
  { id: 'eidAlAdha', hijriMonth: 12, hijriDay: 10, englishLabel: 'Eid al-Adha', major: true },
] as const;

export type HijriDate = { year: number; month: number; day: number };

/** Returns the event matching the given Hijri date, or null. */
export function findEventOnHijri(date: HijriDate): IslamicEvent | null {
  for (const e of ISLAMIC_EVENTS) {
    if (e.hijriMonth === date.month && e.hijriDay === date.day) return e;
  }
  return null;
}

/** Returns true if the given Hijri date falls within Ramadan. */
export function isRamadan(date: HijriDate): boolean {
  return date.month === 9;
}

/** Returns true if the given Hijri date is one of the odd nights of the
 *  last 10 of Ramadan (21st, 23rd, 25th, 27th, 29th — when Laylat al-Qadr
 *  is most often sought). */
export function isLaylatAlQadrCandidate(date: HijriDate): boolean {
  if (date.month !== 9) return false;
  return [21, 23, 25, 27, 29].includes(date.day);
}
