import type { PrayerTimesResult, UnifiedFetchParams } from './types';
import { fetchAladhanTimes } from './aladhan';
import { fetchPrayTimesDev } from './praytimesDev';
import { fetchIslamiskaForbundetTimes } from './islamiskaForbundet';
import { computeLocalAdhanTimes } from './localAdhan';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';
import { validateTimings } from './validateTimings';
import {
  isProviderCoolingDown,
  recordProviderResult,
} from './providerHealth';

export async function fetchPrayerTimesUnified(
  p: UnifiedFetchParams,
): Promise<PrayerTimesResult> {
  let result: PrayerTimesResult;
  switch (p.provider) {
    case 'aladhan':
      result = await fetchAladhanTimes({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        method: p.calculationMethod,
        school: p.school,
      });
      break;
    case 'prayertimes_dev':
      result = await fetchPrayTimesDev({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        school: p.school,
      });
      break;
    case 'islamiska_forbundet': {
      // The Swedish scraper origin regularly times out. After 3
      // consecutive failures it enters a 12 h cooldown during which we
      // silently serve AlAdhan for the same coordinates instead of
      // hammering (and warn-spamming about) a dead origin. Cached days
      // remain authoritative either way (see prayerStorage).
      if (await isProviderCoolingDown('islamiska_forbundet')) {
        result = await fetchAladhanTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
          method: p.calculationMethod,
          school: p.school,
        });
        break;
      }
      try {
        result = await fetchIslamiskaForbundetTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
        });
        void recordProviderResult('islamiska_forbundet', true);
      } catch (e) {
        void recordProviderResult('islamiska_forbundet', false);
        // Same-request failover (v2.7.30): don't make the caller wait
        // for 3 failed sessions before the cooldown kicks in — serve
        // AlAdhan for THIS request too. Only if the fallback also
        // fails does the original scraper error propagate (so the
        // caller's local-adhan last resort still applies).
        try {
          result = await fetchAladhanTimes({
            latitude: p.latitude,
            longitude: p.longitude,
            date: p.date,
            method: p.calculationMethod,
            school: p.school,
          });
          break;
        } catch {
          throw e;
        }
      }
      break;
    }
    case 'local_adhan':
      // On-device calculation — skip network validation, it always produces valid output.
      return computeLocalAdhanTimes({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        calculationMethod: p.calculationMethod,
        school: p.school,
      });
    default:
      throw new Error(`Unknown prayer data provider: ${String(p.provider)}`);
  }
  // Post-process: guarantee Imsak is present. AlAdhan returns it; the other
  // network providers compute a fallback in their normalisers; this is the
  // belt-and-suspenders pass that ensures consumers (widget, fasting tracker,
  // Suhoor countdown) never see a missing Imsak regardless of provider.
  if (!result.timings.Imsak && result.timings.Fajr) {
    result = {
      ...result,
      timings: {
        ...result.timings,
        Imsak: computeImsak(result.timings.Fajr, DEFAULT_IMSAK_OFFSET_MINUTES),
      },
    };
  }
  // Throw early if the provider returned a structurally invalid response so
  // callers can fall through to the local-adhan fallback instead of caching garbage.
  validateTimings(result.timings);
  return result;
}
