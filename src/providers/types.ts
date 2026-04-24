import type { TimingsMap } from '../types/prayer';
import type { PrayerDataProviderId } from '../settings/types';

export type PrayerTimesResult = {
  timings: TimingsMap;
  timezone?: string;
};

export type UnifiedFetchParams = {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
  date: Date;
  calculationMethod: number | 'auto';
  school: number;
};
