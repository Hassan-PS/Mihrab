import { getOrFetchPrayerTimes } from './prayerStorage';
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
  calculationMethod: number | 'auto';
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
        try {
          const timings = await getOrFetchPrayerTimes({
            provider: base.provider,
            latitude: base.latitude,
            longitude: base.longitude,
            date,
            calculationMethod: base.calculationMethod,
            school: base.school,
          });
          return { date, timings };
        } catch (e) {
          // One day must not cost the month. `getOrFetchPrayerTimes` now ends
          // in an on-device computation that cannot fail, so reaching here
          // means something genuinely unexpected — but a table with 30 rows
          // and one gap is still a usable table, whereas a rejected
          // `Promise.all` turns the whole screen into an error message.
          // That was the visible bug when browsing to a month past a
          // dataset's published window while offline.
          console.warn('Month row failed', date, e);
          return null;
        }
      }),
    );
    for (const item of batchResult) {
      if (item) out.push(item);
    }
  }
  return out;
}
