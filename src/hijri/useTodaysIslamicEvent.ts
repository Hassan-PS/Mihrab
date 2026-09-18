import { useMemo } from 'react';
import { gregorianToHijri } from './convert';
import { islamicCivilDate } from './islamicDay';
import {
  findEventOnHijri,
  isLaylatAlQadrCandidate,
  isRamadan,
  type IslamicEvent,
} from './events';

/**
 * Returns the Islamic event (if any) for today's Hijri date, plus the
 * Ramadan / Laylat al-Qadr flags consumed by other features (#21 Ramadan
 * countdown, #41 seasonal treatment).
 *
 * Pure derivation from `now` — no React state, no side effects.
 */
export function useTodaysIslamicEvent(now: Date = new Date()): {
  event: IslamicEvent | null;
  hijri: ReturnType<typeof gregorianToHijri>;
  isRamadan: boolean;
  isLaylatAlQadrCandidate: boolean;
} {
  return useMemo(() => {
    // Today's event, and today begins at maghrib: Laylat al-Qadr is a
    // NIGHT, so an odd night of the last ten that only became "today" at
    // midnight would light up five hours after it began.
    const hijri = gregorianToHijri(islamicCivilDate(now));
    return {
      event: findEventOnHijri(hijri),
      hijri,
      isRamadan: isRamadan(hijri),
      isLaylatAlQadrCandidate: isLaylatAlQadrCandidate(hijri),
    };
  }, [now]);
}
