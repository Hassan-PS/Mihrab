/**
 * Two promises the cache now makes, and the reason each exists.
 *
 * 1. A LOCATION NEVER HOLDS LESS THAN A MONTH. The Wi-Fi fill can be told to
 *    stop (it has no business grinding in someone's pocket), and it used to
 *    take that instruction at the first opportunity — which is how a freshly
 *    switched location could sit at "2 days stored" while the user looked at
 *    it. A month ahead is not opportunistic prefetching; it is the app
 *    working tomorrow, on a plane. So the first month is not interruptible.
 *
 * 2. A PROVIDER MISS COSTS A MINUTE, NOT A DAY. Every network rung can miss,
 *    and for a dataset country a miss past the published window is ORDINARY
 *    rather than a fault (Morocco's ministry serves one Hijri month at a
 *    time). The day used to just not be stored. It is now computed on
 *    device, which cannot fail, and upgraded later when the dataset reaches
 *    that date.
 *
 * Dates are taken from the real clock rather than a frozen one: the
 * ordering rule is "relative to today", and a test that only holds on one
 * chosen day is not testing the rule.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    __reset: () => {
      store = {};
    },
  };
});

jest.mock('../src/providers/fetchPrayerTimes', () => ({
  fetchPrayerTimesUnified: jest.fn(),
}));

jest.mock('../src/providers/habousDataset', () => ({
  getHabousDatasetTimes: jest.fn(),
}));

jest.mock('../src/providers/islamiskaForbundetDataset', () => ({
  getIslamiskaForbundetDatasetTimes: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getHabousDatasetTimes } from '../src/providers/habousDataset';
import {
  MIN_GUARANTEED_DAYS,
  getCacheStatus,
  getOrFetchPrayerTimes,
  refreshPrayerDataCache,
} from '../src/prayer/prayerStorage';
import { formatLocalDate } from '../src/utils/date';

const mockFetch = fetchPrayerTimesUnified as jest.Mock;
const mockHabous = getHabousDatasetTimes as jest.Mock;
const mockStorage = AsyncStorage as unknown as { __reset: () => void };

const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 };

const BASE = {
  provider: 'habous' as const,
  ...CASABLANCA,
  calculationMethod: 'auto' as const,
  school: 0,
};

function timings(tag: string) {
  return {
    Fajr: '05:31',
    Sunrise: '07:00',
    Dhuhr: '13:36',
    Asr: '17:09',
    Maghrib: '20:03',
    Isha: '21:20',
    Imsak: tag,
  };
}

/** Local midnight today — the anchor every ordering claim below is about. */
function today(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function daysFromToday(n: number): Date {
  const d = today();
  d.setDate(d.getDate() + n);
  return d;
}

beforeEach(() => {
  mockStorage.__reset();
  mockFetch.mockReset();
  mockHabous.mockReset();
  mockHabous.mockRejectedValue(new Error('no dataset entry'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fill order', () => {
  test('today comes first, and every future day precedes every past one', async () => {
    const asked: Date[] = [];
    mockFetch.mockImplementation(async (p: { date: Date }) => {
      asked.push(p.date);
      return { timings: timings('x') };
    });

    await refreshPrayerDataCache(BASE, 1);

    expect(asked.length).toBeGreaterThan(0);
    expect(formatLocalDate(asked[0])).toBe(formatLocalDate(today()));

    // The past days of the current month are still fetched — just last.
    const firstPastIndex = asked.findIndex(d => d < today());
    if (firstPastIndex !== -1) {
      const tail = asked.slice(firstPastIndex);
      expect(tail.every(d => d < today())).toBe(true);
    }
  });

  test('a day already stored is not re-fetched', async () => {
    mockFetch.mockImplementation(async () => ({ timings: timings('x') }));
    await refreshPrayerDataCache(BASE, 1);
    const firstPass = mockFetch.mock.calls.length;

    mockFetch.mockClear();
    await refreshPrayerDataCache(BASE, 1);

    expect(firstPass).toBeGreaterThan(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('the one-month floor', () => {
  test('a fill told to stop immediately still stores a month forward', async () => {
    mockFetch.mockImplementation(async () => ({ timings: timings('x') }));

    // The most hostile caller possible: "stop" every single time it is asked.
    await refreshPrayerDataCache(BASE, 2, undefined, () => false);

    const status = await getCacheStatus(BASE);
    expect(status.totalDaysCached).toBeGreaterThanOrEqual(MIN_GUARANTEED_DAYS);

    const stored = new Set(
      mockFetch.mock.calls.map((c: [{ date: Date }]) =>
        formatLocalDate(c[0].date),
      ),
    );
    for (let i = 0; i < MIN_GUARANTEED_DAYS; i++) {
      expect(stored.has(formatLocalDate(daysFromToday(i)))).toBe(true);
    }
  });

  test('past the floor, a stop is honoured — it does not run the year', async () => {
    mockFetch.mockImplementation(async () => ({ timings: timings('x') }));

    await refreshPrayerDataCache(BASE, 12, undefined, () => false);

    const status = await getCacheStatus(BASE);
    expect(status.totalDaysCached).toBeGreaterThanOrEqual(MIN_GUARANTEED_DAYS);
    // A full year is ~365; stopping at the floor should be nowhere near it.
    expect(status.totalDaysCached).toBeLessThan(120);
  });

  test('the floor holds when every network rung is down', async () => {
    // No dataset entry, no network: the on-device rung is all that is left.
    mockFetch.mockRejectedValue(new Error('Network unreachable'));

    await refreshPrayerDataCache(BASE, 2, undefined, () => false);

    const status = await getCacheStatus(BASE);
    expect(status.totalDaysCached).toBeGreaterThanOrEqual(MIN_GUARANTEED_DAYS);
  });
});

describe('the rung that cannot fail', () => {
  test('a provider miss still yields times, and stores them', async () => {
    mockFetch.mockRejectedValue(new Error('past the published window'));

    const date = daysFromToday(200);
    const got = await getOrFetchPrayerTimes({ ...BASE, date });

    expect(got.Fajr).toMatch(/^\d{2}:\d{2}$/);
    expect(got.Maghrib).toMatch(/^\d{2}:\d{2}$/);

    // And it is cached, so the next read is offline-clean.
    await new Promise<void>(r => setTimeout(r, 50));
    const status = await getCacheStatus(BASE);
    expect(status.totalDaysCached).toBeGreaterThanOrEqual(1);
  });

  test("local_adhan's own failure is not swallowed", async () => {
    mockFetch.mockRejectedValue(new Error('bad coordinates'));

    await expect(
      getOrFetchPrayerTimes({
        ...BASE,
        provider: 'local_adhan',
        date: daysFromToday(1),
      }),
    ).rejects.toThrow(/bad coordinates/);
  });
});

describe('dataset-first, so a fallback day upgrades', () => {
  test('Morocco reads the dataset before the cache', async () => {
    // Day 1: no dataset entry, so the day is cached from the network rung.
    mockFetch.mockResolvedValue({ timings: timings('from-network') });
    const date = daysFromToday(3);
    const first = await getOrFetchPrayerTimes({ ...BASE, date });
    expect(first.Imsak).toBe('from-network');
    await new Promise<void>(r => setTimeout(r, 50));

    // Day 2: the ministry's window has reached that date. The cached day
    // must not win — the published table is the whole point.
    mockHabous.mockReset();
    mockHabous.mockResolvedValue({
      timings: timings('from-ministry'),
      source: 'seed',
    });
    const second = await getOrFetchPrayerTimes({ ...BASE, date });
    expect(second.Imsak).toBe('from-ministry');
  });

  test('a dataset miss falls through to the cache rather than refetching', async () => {
    mockFetch.mockResolvedValue({ timings: timings('from-network') });
    const date = daysFromToday(4);
    await getOrFetchPrayerTimes({ ...BASE, date });
    await new Promise<void>(r => setTimeout(r, 50));

    mockFetch.mockClear();
    const again = await getOrFetchPrayerTimes({ ...BASE, date });

    expect(again.Imsak).toBe('from-network');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
