/**
 * Lock-screen widget payload + Friday Jumu'ah accent — task #23 (JS layer).
 *
 * iOS lock-screen widgets (accessoryRectangular / accessoryCircular /
 * accessoryInline) and the StandBy mode all consume the same JSON payload
 * that the home-screen widget already receives via `syncPrayerWidget`. This
 * module computes a minimal, layout-friendly subset suitable for the
 * smaller surfaces, plus the Jumu'ah flag the iOS Swift layer reads to
 * tint the Dhuhr row on Fridays.
 *
 * Native Swift WidgetKit work (declaring the new families in
 * `PrayerWidgetExtension.swift`) is outside this MVP — the JS payload is
 * ready when the iOS extension consumes it.
 */

import type { TimingsMap } from '../types/prayer';
import { computeNextSalah, formatDisplayTime, formatLocalTime } from '../utils/prayerTimes';

export type LockScreenPayload = {
  /** Short next-prayer name (e.g. "Maghrib"). */
  nextName: string | null;
  /** HH:MM. */
  nextTime: string | null;
  /** "Friday" greeting flag — true Fridays before Maghrib. */
  isJumuah: boolean;
  /** "Ramadan" mode flag — caller passes whether today is in Ramadan
   *  (computed via the Hijri events module to keep this file pure). */
  isRamadan: boolean;
};

/**
 * Build the lock-screen payload from today's timings.
 *
 * `isRamadan` is passed in (rather than computed here) so this module
 * stays pure and Hijri-conversion-free; the caller wires
 * `useTodaysIslamicEvent`'s flag through.
 */
export function buildLockScreenPayload(
  today: TimingsMap,
  now: Date,
  isRamadan: boolean,
): LockScreenPayload {
  const next = computeNextSalah(today, now);
  return {
    nextName: next ? next.name : null,
    nextTime: next ? formatLocalTime(next.at) : null,
    isJumuah: isFridayBeforeMaghrib(today, now),
    isRamadan,
  };
}

/** True on Friday after midnight and before today's Maghrib. */
export function isFridayBeforeMaghrib(today: TimingsMap, now: Date): boolean {
  if (now.getDay() !== 5) return false;
  const maghrib = today.Maghrib;
  if (!maghrib) return true;
  // Cheap string comparison: HH:MM lexicographic order matches time order.
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return nowHHMM < formatDisplayTime(maghrib);
}
