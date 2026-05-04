import {
  CalculationMethod,
  Coordinates,
  Madhab,
  PrayerTimes,
} from 'adhan';
import type { PrayerTimesResult } from './types';
import { formatLocalTime } from '../utils/prayerTimes';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';

function parametersForMethod(methodId: number) {
  switch (methodId) {
    case 0:
      return CalculationMethod.Tehran();
    case 1:
      return CalculationMethod.Karachi();
    case 2:
      return CalculationMethod.NorthAmerica();
    case 3:
      return CalculationMethod.MuslimWorldLeague();
    case 4:
      return CalculationMethod.UmmAlQura();
    case 5:
      return CalculationMethod.Egyptian();
    case 7:
      return CalculationMethod.Tehran();
    case 8:
      return CalculationMethod.Dubai();
    case 9:
      return CalculationMethod.Kuwait();
    case 10:
      return CalculationMethod.Qatar();
    case 11:
      return CalculationMethod.Singapore();
    case 12:
      return CalculationMethod.MuslimWorldLeague();
    case 13:
      return CalculationMethod.Turkey();
    case 14:
      return CalculationMethod.MoonsightingCommittee();
    case 15:
      return CalculationMethod.MoonsightingCommittee();
    default:
      return CalculationMethod.MuslimWorldLeague();
  }
}

export function computeLocalAdhanTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  calculationMethod: number | 'auto';
  school: number;
  /** Minutes before Fajr that Imsak fires. Defaults to the canonical 10. */
  imsakOffsetMinutes?: number;
}): PrayerTimesResult {
  const y = params.date.getFullYear();
  const m = params.date.getMonth();
  const day = params.date.getDate();
  const dayDate = new Date(y, m, day);
  const coords = new Coordinates(params.latitude, params.longitude);
  
  // If auto, default to MWL for local calculation (since we can't easily auto-detect)
  const methodId = params.calculationMethod === 'auto' ? 3 : params.calculationMethod;
  const calc = parametersForMethod(methodId);
  
  calc.madhab = params.school === 1 ? Madhab.Hanafi : Madhab.Shafi;
  const pt = new PrayerTimes(coords, dayDate, calc);
  const fajrStr = formatLocalTime(pt.fajr);
  // Imsak is computed locally (adhan.js does not expose it). Default offset
  // is the most-common 10 minutes; will become user-configurable via task #21.
  const imsakOffset =
    params.imsakOffsetMinutes ?? DEFAULT_IMSAK_OFFSET_MINUTES;
  return {
    timings: {
      Fajr: fajrStr,
      Sunrise: formatLocalTime(pt.sunrise),
      Dhuhr: formatLocalTime(pt.dhuhr),
      Asr: formatLocalTime(pt.asr),
      Maghrib: formatLocalTime(pt.maghrib),
      Isha: formatLocalTime(pt.isha),
      Imsak: computeImsak(fajrStr, imsakOffset),
    },
  };
}
