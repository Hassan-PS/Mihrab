import { useMemo } from 'react';
import { gregorianToHijri } from './convert';
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
    const hijri = gregorianToHijri(now);
    return {
      event: findEventOnHijri(hijri),
      hijri,
      isRamadan: isRamadan(hijri),
      isLaylatAlQadrCandidate: isLaylatAlQadrCandidate(hijri),
    };
  }, [now]);
}
