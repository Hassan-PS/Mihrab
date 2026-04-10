import { fetchPrayerTimesUnified } from '../providers/fetchPrayerTimes';
import type { PrayerDataProviderId } from '../settings/types';
import type { TimingsMap } from '../types/prayer';

export type MonthDayEntry = {
  date: Date;
  timings: TimingsMap;
};

type BaseParams = {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
  calculationMethod: number;
  school: number;
};

const DEFAULT_CONCURRENCY = 4;

export async function loadMonthPrayerTimes(
  year: number,
  monthIndex: number,
  base: BaseParams,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<MonthDayEntry[]> {
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  const dates: Date[] = [];
  for (let d = 1; d <= dim; d++) {
    dates.push(new Date(year, monthIndex, d));
  }

  const out: MonthDayEntry[] = [];
  for (let i = 0; i < dates.length; i += concurrency) {
    const batch = dates.slice(i, i + concurrency);
    const batchResult = await Promise.all(
      batch.map(async date => {
        const { timings } = await fetchPrayerTimesUnified({
          provider: base.provider,
          latitude: base.latitude,
          longitude: base.longitude,
          date,
          calculationMethod: base.calculationMethod,
          school: base.school,
        });
        return { date, timings };
      }),
    );
    out.push(...batchResult);
  }
  return out;
}
