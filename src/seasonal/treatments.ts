/**
 * Seasonal & contextual visual treatments — task #41.
 *
 * The "magical in simplicity" principle (CLAUDE.md): the app's mood softly
 * shifts with the calendar — Friday Jumu'ah accent, Ramadan crescent, Eid
 * greeting, Laylat al-Qadr deepening, Tahajjud window awareness — felt,
 * not announced.
 *
 * Pure derivation from `now`, today's prayer times, and the Hijri date.
 * UI surfaces (HomeScreen, status bar, dynamic icon) consume the resulting
 * `Treatment` record. ALL treatments are opt-out-able via Settings →
 * Display → "Seasonal touches" (default ON) — the consumer applies the
 * `enabled` gate.
 */

import { gregorianToHijri } from '../hijri/convert';
import {
  findEventOnHijri,
  isLaylatAlQadrCandidate,
  isRamadan,
  type IslamicEvent,
} from '../hijri/events';
import type { TimingsMap } from '../types/prayer';
import { isFridayBeforeMaghrib } from '../widget/lockScreenPayload';
import {
  combineLocalDateAndTime,
  startOfLocalDay,
} from '../utils/prayerTimes';

export type SeasonalTreatment = {
  /** True on Fridays until Maghrib — gentle accent on the Dhuhr row. */
  jumuah: boolean;
  /** True throughout Ramadan — crescent glyph in HomeScreen header,
   *  surface tone shifts ~1-2 % warmer. */
  ramadan: boolean;
  /** True on the odd nights of the last 10 of Ramadan — dark theme deepens
   *  slightly, optional Quran 97:3 caption near the bottom. */
  laylatAlQadrCandidate: boolean;
  /** Eid al-Fitr or Eid al-Adha — full-screen greeting on first launch
   *  of the day. */
  eid: 'fitr' | 'adha' | null;
  /** True between Isha + 1/3 of remaining-night and Fajr — Tahajjud window.
   *  UI may dim screen brightness slightly when opened in this range. */
  tahajjudWindow: boolean;
  /** The Islamic event for today (1 Muharram, Mawlid, Ashura, etc.) — null
   *  outside event dates. Used by the HomeScreen banner. */
  event: IslamicEvent | null;
};

/** Pure derivation of all seasonal flags. */
export function computeSeasonalTreatment(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
): SeasonalTreatment {
  const hijri = gregorianToHijri(now);
  const event = findEventOnHijri(hijri);
  let eid: 'fitr' | 'adha' | null = null;
  if (event?.id === 'eidAlFitr') eid = 'fitr';
  else if (event?.id === 'eidAlAdha') eid = 'adha';
  return {
    jumuah: isFridayBeforeMaghrib(today, now),
    ramadan: isRamadan(hijri),
    laylatAlQadrCandidate: isLaylatAlQadrCandidate(hijri),
    eid,
    tahajjudWindow: isInTahajjudWindow(today, tomorrow, now),
    event,
  };
}

/**
 * Tahajjud window = the LAST THIRD of the night, conventionally defined
 * as the period from `(Maghrib + 2*(Fajr+24h - Maghrib)/3)` to next-day Fajr.
 * Approximation: from 1/3 of the night after Isha until Fajr.
 *
 * For the MVP we use a simpler heuristic: between (Isha + 60 min) and
 * Fajr. This catches roughly the "deep night" window without needing the
 * full last-third math.
 */
export function isInTahajjudWindow(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
): boolean {
  const isha = today.Isha;
  if (!isha) return false;
  const dayStart = startOfLocalDay(now);
  const ishaAt = combineLocalDateAndTime(dayStart, isha);
  const ishaPlusOne = new Date(ishaAt.getTime() + 60 * 60_000);
  // Fajr — use tomorrow's if today's has already passed.
  const fajrToday = today.Fajr ? combineLocalDateAndTime(dayStart, today.Fajr) : null;
  if (fajrToday && now < fajrToday) {
    // Pre-dawn — already past midnight; treat as "after isha" if we're
    // before fajr.
    return now > new Date(dayStart.getTime() - 24 * 60 * 60_000 + 60 * 60_000);
  }
  if (now < ishaPlusOne) return false;
  // After (Isha + 60 min). Need to be before tomorrow's Fajr.
  if (!tomorrow?.Fajr) return true;
  const tomorrowDay = new Date(dayStart);
  tomorrowDay.setDate(tomorrowDay.getDate() + 1);
  const fajrTomorrow = combineLocalDateAndTime(tomorrowDay, tomorrow.Fajr);
  return now < fajrTomorrow;
}
