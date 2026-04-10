import type { PrayerTimesResult, UnifiedFetchParams } from './types';
import { fetchAladhanTimes } from './aladhan';
import { fetchPrayTimesDev } from './praytimesDev';
import { fetchIslamiskaForbundetTimes } from './islamiskaForbundet';
import { computeLocalAdhanTimes } from './localAdhan';

export async function fetchPrayerTimesUnified(
  p: UnifiedFetchParams,
): Promise<PrayerTimesResult> {
  switch (p.provider) {
    case 'aladhan':
      return fetchAladhanTimes({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        method: p.calculationMethod,
        school: p.school,
      });
    case 'prayertimes_dev':
      return fetchPrayTimesDev({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        school: p.school,
      });
    case 'islamiska_forbundet':
      return fetchIslamiskaForbundetTimes({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
      });
    case 'local_adhan':
      return Promise.resolve(
        computeLocalAdhanTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
          calculationMethod: p.calculationMethod,
          school: p.school,
        }),
      );
    default:
      throw new Error(`Unknown prayer data provider: ${String(p.provider)}`);
  }
}
