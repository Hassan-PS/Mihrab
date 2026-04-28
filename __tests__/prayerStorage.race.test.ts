/**
 * Verifies that concurrent calls to getOrFetchPrayerTimes don't clobber each
 * other's cache writes.  The write-mutex in prayerStorage serialises all
 * setItem calls so the second write always merges on top of the first rather
 * than overwriting it.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => { delete store[key]; }),
    __reset: () => { store = {}; },
  };
});

jest.mock('../src/providers/fetchPrayerTimes', () => ({
  fetchPrayerTimesUnified: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getOrFetchPrayerTimes, getStoredPrayerData } from '../src/prayer/prayerStorage';

const mockFetch = fetchPrayerTimesUnified as jest.Mock;
const mockStorage = AsyncStorage as unknown as { __reset: () => void };

const BASE = {
  provider: 'aladhan' as const,
  latitude: 59.33,
  longitude: 18.07,
  calculationMethod: 3 as const,
  school: 0,
};

function makeTimings(h: string) {
  return {
    Fajr:    `0${h}:00`,
    Sunrise: `0${h}:10`,
    Dhuhr:   `1${h}:00`,
    Asr:     `1${h}:30`,
    Maghrib: `1${h}:50`,
    Isha:    `2${h}:00`,
  };
}

beforeEach(() => {
  mockStorage.__reset();
  mockFetch.mockReset();
});

// Wait for the fire-and-forget write chain to flush.
const flush = () => new Promise<void>(r => setTimeout(r, 50));

describe('prayerStorage concurrent write safety', () => {
  it('preserves both months when two fetches land simultaneously', async () => {
    const timingsA = makeTimings('5');
    const timingsB = makeTimings('6');

    mockFetch
      .mockResolvedValueOnce({ timings: timingsA })
      .mockResolvedValueOnce({ timings: timingsB });

    const dateA = new Date(2026, 3, 1); // April 1
    const dateB = new Date(2026, 4, 1); // May 1

    const [resA, resB] = await Promise.all([
      getOrFetchPrayerTimes({ ...BASE, date: dateA }),
      getOrFetchPrayerTimes({ ...BASE, date: dateB }),
    ]);

    expect(resA).toEqual(timingsA);
    expect(resB).toEqual(timingsB);

    await flush();

    const stored = await getStoredPrayerData();
    expect(stored).not.toBeNull();
    // Both months must survive — neither write clobbered the other.
    expect(stored?.months['2026-04']?.['2026-04-01']).toEqual(timingsA);
    expect(stored?.months['2026-05']?.['2026-05-01']).toEqual(timingsB);
  });

  it('returns cached data on second call without fetching again', async () => {
    const timings = makeTimings('5');
    mockFetch.mockResolvedValueOnce({ timings });

    const date = new Date(2026, 3, 1);
    const first = await getOrFetchPrayerTimes({ ...BASE, date });
    await flush();

    const second = await getOrFetchPrayerTimes({ ...BASE, date });
    expect(first).toEqual(timings);
    expect(second).toEqual(timings);
    // Network should only have been hit once.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('three concurrent fetches for different days all persist', async () => {
    const t1 = makeTimings('1');
    const t2 = makeTimings('2');
    const t3 = makeTimings('3');
    mockFetch
      .mockResolvedValueOnce({ timings: t1 })
      .mockResolvedValueOnce({ timings: t2 })
      .mockResolvedValueOnce({ timings: t3 });

    const [r1, r2, r3] = await Promise.all([
      getOrFetchPrayerTimes({ ...BASE, date: new Date(2026, 3, 1) }),
      getOrFetchPrayerTimes({ ...BASE, date: new Date(2026, 3, 2) }),
      getOrFetchPrayerTimes({ ...BASE, date: new Date(2026, 3, 3) }),
    ]);

    expect(r1).toEqual(t1);
    expect(r2).toEqual(t2);
    expect(r3).toEqual(t3);

    await flush();

    const stored = await getStoredPrayerData();
    const apr = stored?.months['2026-04'];
    expect(apr?.['2026-04-01']).toEqual(t1);
    expect(apr?.['2026-04-02']).toEqual(t2);
    expect(apr?.['2026-04-03']).toEqual(t3);
  });
});
