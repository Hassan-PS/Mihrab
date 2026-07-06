import type { TimingsMap } from '../types/prayer';
import type { PrayerDataProviderId } from '../settings/types';

/**
 * Which rung of the fetch chain actually produced a result. Surfaced in the
 * Settings → data statistics panel so users can see where today's times came
 * from. `cdn`/`seed` are the Sweden prepared-dataset sources.
 */
export type DataSource =
  | 'cdn' // cached CDN mirror of the prepared Sweden dataset
  | 'seed' // bundled offline seed
  | 'scrape' // live Islamiska Förbundet widget scrape
  | 'aladhan' // AlAdhan API
  | 'local'; // on-device calculation

export type PrayerTimesResult = {
  timings: TimingsMap;
  timezone?: string;
  /** Which source produced these timings (set by the fetch chain). */
  source?: DataSource;
};

export type UnifiedFetchParams = {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
  date: Date;
  calculationMethod: number | 'auto';
  school: number;
};
