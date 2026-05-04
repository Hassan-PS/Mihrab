/**
 * loadMonthPrayerTimes concurrency + ordering — task #17.
 *
 * The month view (`MonthTimesScreen`) loads up to 31 days of prayer times in
 * parallel batches. This test locks in the documented behavior:
 *   1. Returns one entry per day in calendar order, regardless of which
 *      batch resolved first.
 *   2. Respects the `concurrency` cap so we don't fan out 31 simultaneous
 *      fetches against the upstream provider.
 *   3. Throws on the first batch failure (rather than returning partial
 *      results) — caller can surface a "couldn't load month" error.
 */

jest.mock('../src/prayer/prayerStorage', () => ({
  getOrFetchPrayerTimes: jest.fn(),
}));

import { getOrFetchPrayerTimes } from '../src/prayer/prayerStorage';
import { loadMonthPrayerTimes } from '../src/prayer/loadMonthPrayerTimes';

const mockFetch = getOrFetchPrayerTimes as jest.Mock;

const BASE = {
  provider: 'aladhan' as const,
  latitude: 59.33,
  longitude: 18.07,
  calculationMethod: 3 as const,
  school: 0,
};

function makeTimings(day: number) {
  const hh = String(5 + (day % 3)).padStart(2, '0');
  return {
    Fajr: `${hh}:00`,
    Sunrise: `0${(parseInt(hh, 10) + 1) % 10}:30`,
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib: '18:00',
    Isha: '20:00',
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('loadMonthPrayerTimes', () => {
  test('returns one entry per calendar day in chronological order', async () => {
    mockFetch.mockImplementation(async (params: { date: Date }) =>
      makeTimings(params.date.getDate()),
    );

    // April 2026 has 30 days.
    const result = await loadMonthPrayerTimes(2026, 3, BASE, 4);

    expect(result).toHaveLength(30);
    for (let i = 0; i < 30; i++) {
      expect(result[i].date.getDate()).toBe(i + 1);
      expect(result[i].date.getMonth()).toBe(3);
      expect(result[i].date.getFullYear()).toBe(2026);
    }
  });

  test('respects the concurrency cap — never more than N inflight', async () => {
    let inflight = 0;
    let maxInflight = 0;
    mockFetch.mockImplementation(async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      // Yield to the event loop so siblings in the same batch start before
      // we resolve.
      await new Promise(r => setImmediate(r));
      inflight -= 1;
      return makeTimings(1);
    });

    await loadMonthPrayerTimes(2026, 3, BASE, 4);
    expect(maxInflight).toBeLessThanOrEqual(4);
    expect(maxInflight).toBeGreaterThan(1); // confirm we're actually parallelising
  });

  test('handles a 28-day month correctly (Feb 2026)', async () => {
    mockFetch.mockImplementation(async (params: { date: Date }) =>
      makeTimings(params.date.getDate()),
    );
    const result = await loadMonthPrayerTimes(2026, 1, BASE, 4);
    expect(result).toHaveLength(28);
  });

  test('handles a 29-day leap February (Feb 2024)', async () => {
    mockFetch.mockImplementation(async (params: { date: Date }) =>
      makeTimings(params.date.getDate()),
    );
    const result = await loadMonthPrayerTimes(2024, 1, BASE, 4);
    expect(result).toHaveLength(29);
  });

  test('throws on the first batch failure (no partial results returned)', async () => {
    mockFetch.mockImplementation(async (params: { date: Date }) => {
      // Day 5 fails; all others succeed.
      if (params.date.getDate() === 5) {
        throw new Error('Network unreachable');
      }
      return makeTimings(params.date.getDate());
    });

    await expect(loadMonthPrayerTimes(2026, 3, BASE, 4)).rejects.toThrow(
      /Network unreachable/,
    );
  });

  test('forwards provider/coords/method/school to every fetch', async () => {
    mockFetch.mockImplementation(async () => makeTimings(1));

    await loadMonthPrayerTimes(2026, 3, BASE, 4);

    // Every call has the same provider/coords/method/school as `BASE`.
    for (const call of mockFetch.mock.calls) {
      expect(call[0].provider).toBe(BASE.provider);
      expect(call[0].latitude).toBe(BASE.latitude);
      expect(call[0].longitude).toBe(BASE.longitude);
      expect(call[0].calculationMethod).toBe(BASE.calculationMethod);
      expect(call[0].school).toBe(BASE.school);
    }
  });
});
