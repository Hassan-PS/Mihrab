import type { PrayerTimesResult, UnifiedFetchParams } from './types';
import { fetchAladhanTimes } from './aladhan';
import { fetchPrayTimesDev } from './praytimesDev';
import { fetchIslamiskaForbundetTimes } from './islamiskaForbundet';
import { getIslamiskaForbundetDatasetTimes } from './islamiskaForbundetDataset';
import { getHabousDatasetTimes } from './habousDataset';
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
      result.source = 'aladhan';
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
      // 0. Prepared dataset FIRST (v2.7.x): a scheduled server-side job mirrors
      // the bönetider times into a static CDN file (+ a bundled seed), so the
      // normal path has NO live dependency on the flaky origin. A miss (date
      // beyond the dataset / unknown city) falls through to the live chain.
      try {
        result = await getIslamiskaForbundetDatasetTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
        });
        break;
      } catch {
        /* dataset miss — try the live sources below */
      }
      // The Swedish scraper origin regularly times out. After 3
      // consecutive failures it enters a 12 h cooldown during which we
      // silently serve AlAdhan for the same coordinates instead of
      // hammering (and warn-spamming about) a dead origin. Cached days
      // remain authoritative either way (see prayerStorage). The live
      // scrape now acts as a FALLBACK rung behind the dataset above.
      if (await isProviderCoolingDown('islamiska_forbundet')) {
        result = await fetchAladhanTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
          method: p.calculationMethod,
          school: p.school,
        });
        result.source = 'aladhan';
        break;
      }
      try {
        result = await fetchIslamiskaForbundetTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
        });
        result.source = 'scrape';
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
          result.source = 'aladhan';
          break;
        } catch {
          throw e;
        }
      }
      break;
    }
    case 'habous': {
      // The Ministry of Habous's own published tables, from the prepared
      // dataset. There is no live rung behind it: the ministry serves one
      // Hijri month at a time and its endpoint is unreliable enough that
      // scraping it per device would be worse than not, so a miss goes
      // straight to AlAdhan — which auto-selects the Morocco method — and
      // then to the caller's on-device last resort, where the Morocco
      // parameters now sit within a minute of the ministry.
      try {
        result = await getHabousDatasetTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
        });
        break;
      } catch {
        /* outside coverage, or past the published window */
      }
      result = await fetchAladhanTimes({
        latitude: p.latitude,
        longitude: p.longitude,
        date: p.date,
        method: p.calculationMethod,
        school: p.school,
      });
      result.source = 'aladhan';
      break;
    }
    case 'local_adhan':
      // On-device calculation — skip network validation, it always produces valid output.
      return {
        ...computeLocalAdhanTimes({
          latitude: p.latitude,
          longitude: p.longitude,
          date: p.date,
          calculationMethod: p.calculationMethod,
          school: p.school,
        }),
        source: 'local',
      };
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
