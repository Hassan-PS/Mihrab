import type { PrayerTimesResult, UnifiedFetchParams } from './types';
import { fetchAladhanTimes } from './aladhan';
import { fetchPrayTimesDev } from './praytimesDev';
import { fetchIslamiskaForbundetTimes } from './islamiskaForbundet';
import { computeLocalAdhanTimes } from './localAdhan';
import { validateTimings } from './validateTimings';

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
    case 'islamiska_forbundet':
      result = await fetchIslamiskaForbundetTimes({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
      });
      break;
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
  // Throw early if the provider returned a structurally invalid response so
  // callers can fall through to the local-adhan fallback instead of caching garbage.
  validateTimings(result.timings);
  return result;
}
