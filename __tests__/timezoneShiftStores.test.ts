/**
 * THE TWO STORES THAT HELD THE WRONG HOUR — issue #56.
 *
 * `timezoneShift.test.ts` pins the noticing; this pins what is noticed
 * ABOUT, at the level of the stores themselves: the monthly prayer cache,
 * which records the offset its rows were written under, and the published
 * dataset file, which for Morocco is read BEFORE the cache and so decides
 * everything.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  dropStoredMonths,
  getCachedPrayerTimes,
  getStoredPrayerData,
  monthKeyOf,
  refetchStoredMonths,
  saveStoredPrayerData,
} from '../src/prayer/prayerStorage';

const CASABLANCA = {
  provider: 'habous' as const,
  latitude: 33.57,
  longitude: -7.59,
  calculationMethod: 21,
  school: 0,
};
const FAJR_UNDER_GMT_PLUS_ONE = { Fajr: '05:49', Dhuhr: '13:30' } as never;

const stored = (day: string) => ({
  ...CASABLANCA,
  months: { [day.slice(0, 7)]: { [day]: FAJR_UNDER_GMT_PLUS_ONE } },
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('the cache records the rule its rows were written under', () => {
  it('stamps the device offset on what it stores', async () => {
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-60);
    await saveStoredPrayerData(stored('2026-09-20'));
    const raw = await AsyncStorage.getItem('prayer_times_cache.v2');
    jest.restoreAllMocks();
    // Every entry the app writes carries it; without that there is no
    // difference between a table from before the change and one from
    // after — they are the same strings, the same age, and an hour apart.
    expect(raw).toContain('utcOffsetMinutes');
  });
});

describe('dropping one location', () => {
  it('empties its months and leaves the location itself', async () => {
    await saveStoredPrayerData(stored('2026-09-20'));
    expect(
      await getCachedPrayerTimes({ ...CASABLANCA, date: new Date(2026, 8, 20) }),
    ).toBeTruthy();

    expect(await dropStoredMonths(CASABLANCA)).toBe(true);

    expect(
      await getCachedPrayerTimes({ ...CASABLANCA, date: new Date(2026, 8, 20) }),
    ).toBeNull();
    // The slot survives: it is still a place the reader has been, and the
    // next load refills it under the rule now in force.
    const after = await getStoredPrayerData();
    expect(after?.latitude).toBeCloseTo(CASABLANCA.latitude, 2);
  });

  it('leaves every other location alone', async () => {
    const stockholm = {
      ...CASABLANCA,
      provider: 'islamiska_forbundet' as const,
      latitude: 59.33,
      longitude: 18.07,
    };
    await saveStoredPrayerData(stored('2026-09-20'));
    await saveStoredPrayerData({
      ...stockholm,
      months: { '2026-09': { '2026-09-20': FAJR_UNDER_GMT_PLUS_ONE } },
    });

    await dropStoredMonths(CASABLANCA);

    // Stockholm's table is in Stockholm's clock and nothing about it
    // changed when this device landed in Morocco.
    expect(
      await getCachedPrayerTimes({ ...stockholm, date: new Date(2026, 8, 20) }),
    ).toBeTruthy();
  });

  it('says whether there was anything to drop', async () => {
    expect(await dropStoredMonths(CASABLANCA)).toBe(false);
  });
});

describe('re-fetching a month somebody asked to repair', () => {
  it('removes the stored days so the fill cannot skip them', async () => {
    // `refreshPrayerDataCache` skips every day it already has, which is
    // right for a pre-fill and useless for a table that is wrong.
    await saveStoredPrayerData(stored('2026-09-20'));
    await refetchStoredMonths(CASABLANCA, [monthKeyOf(new Date(2026, 8, 20))]);
    expect(
      await getCachedPrayerTimes({ ...CASABLANCA, date: new Date(2026, 8, 20) }),
    ).toBeNull();
  });

  it('and only the months named', async () => {
    await saveStoredPrayerData({
      ...CASABLANCA,
      months: {
        '2026-09': { '2026-09-20': FAJR_UNDER_GMT_PLUS_ONE },
        '2026-10': { '2026-10-05': FAJR_UNDER_GMT_PLUS_ONE },
      },
    });
    await refetchStoredMonths(CASABLANCA, ['2026-09']);
    expect(
      await getCachedPrayerTimes({ ...CASABLANCA, date: new Date(2026, 9, 5) }),
    ).toBeTruthy();
  });
});
