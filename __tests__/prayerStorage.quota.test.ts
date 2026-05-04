/**
 * Cache hardening — task #5.
 *
 * Covers three reliability fixes in src/prayer/prayerStorage.ts:
 *   1. Quota-exceeded errors trigger eviction-and-retry instead of silently
 *      swallowing the failure. Returns a typed SaveResult so callers can
 *      surface a "couldn't save" toast.
 *   2. The write mutex is wrapped in a 10s timeout so a hung AsyncStorage
 *      write can never block all subsequent writes indefinitely.
 *   3. getCacheStatus surfaces per-day completeness (`daysMissingThisMonth`,
 *      `totalDaysCached`) so callers can fetch missing days instead of
 *      re-fetching the whole month.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  let nextSetItemError: Error | null = null;
  let setItemHangMs: number | null = null;
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      if (setItemHangMs !== null) {
        // Hang for the configured duration to simulate stuck native module.
        await new Promise(r => setTimeout(r, setItemHangMs as number));
      }
      if (nextSetItemError) {
        const e = nextSetItemError;
        nextSetItemError = null;
        throw e;
      }
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    __reset: () => {
      store = {};
      nextSetItemError = null;
      setItemHangMs = null;
    },
    __failNextSetItem: (e: Error) => {
      nextSetItemError = e;
    },
    __hangSetItem: (ms: number | null) => {
      setItemHangMs = ms;
    },
    __peek: () => store,
  };
});

jest.mock('../src/providers/fetchPrayerTimes', () => ({
  fetchPrayerTimesUnified: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import {
  getCacheStatus,
  getOrFetchPrayerTimes,
  getStoredPrayerData,
  isQuotaError,
  saveStoredPrayerData,
  type StoredPrayerData,
} from '../src/prayer/prayerStorage';

const mockFetch = fetchPrayerTimesUnified as jest.Mock;
const mockStorage = AsyncStorage as unknown as {
  __reset: () => void;
  __failNextSetItem: (e: Error) => void;
  __hangSetItem: (ms: number | null) => void;
  __peek: () => Record<string, string>;
};

const BASE = {
  provider: 'aladhan' as const,
  latitude: 59.33,
  longitude: 18.07,
  calculationMethod: 3 as const,
  school: 0,
};

const TIMINGS = {
  Fajr: '05:00',
  Sunrise: '06:10',
  Dhuhr: '12:00',
  Asr: '15:30',
  Maghrib: '18:00',
  Isha: '20:00',
};

beforeEach(() => {
  mockStorage.__reset();
  mockFetch.mockReset();
});

describe('isQuotaError detection', () => {
  test('matches QuotaExceededError', () => {
    const e = new Error('Operation failed');
    e.name = 'QuotaExceededError';
    expect(isQuotaError(e)).toBe(true);
  });

  test('matches Android SQLiteFullException by message', () => {
    expect(
      isQuotaError(new Error('android.database.sqlite.SQLiteFullException')),
    ).toBe(true);
  });

  test('matches "database or disk is full"', () => {
    expect(isQuotaError(new Error('database or disk is full (code 13)'))).toBe(
      true,
    );
  });

  test('matches iOS-style "no space" / "disk full"', () => {
    expect(isQuotaError(new Error('Cannot allocate memory: disk full'))).toBe(
      true,
    );
    expect(isQuotaError(new Error('NSFileWriteOutOfSpaceError: no space'))).toBe(
      true,
    );
  });

  test('does not match unrelated errors', () => {
    expect(isQuotaError(new Error('Network request failed'))).toBe(false);
    expect(isQuotaError(new Error('Invalid JSON'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
    expect(isQuotaError({})).toBe(false);
  });
});

describe('saveStoredPrayerData: quota handling', () => {
  function makeData(monthKeys: string[]): StoredPrayerData {
    const months: StoredPrayerData['months'] = {};
    for (const k of monthKeys) {
      months[k] = {};
      // Add a dummy day so the month isn't empty
      months[k][`${k}-01`] = TIMINGS;
    }
    return {
      ...BASE,
      months,
    };
  }

  test('returns { ok: true } on a clean save', async () => {
    const result = await saveStoredPrayerData(makeData(['2026-04']));
    expect(result).toEqual({ ok: true });
  });

  test('on quota error, evicts oldest month and retries successfully', async () => {
    const data = makeData(['2026-01', '2026-02', '2026-03', '2026-04']);

    // First setItem throws quota; second (after eviction) succeeds.
    const quotaErr = new Error('database or disk is full');
    mockStorage.__failNextSetItem(quotaErr);

    const result = await saveStoredPrayerData(data);
    expect(result).toEqual({ ok: true });

    // The persisted data must have the OLDEST month evicted.
    const stored = await getStoredPrayerData();
    expect(stored).not.toBeNull();
    expect(Object.keys(stored!.months).sort()).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
    expect(stored!.months['2026-01']).toBeUndefined();
  });

  test('on non-quota error, does not evict, returns { ok: false, reason: "unknown" }', async () => {
    const data = makeData(['2026-01', '2026-02']);
    const networkErr = new Error('Network unreachable');
    mockStorage.__failNextSetItem(networkErr);

    const result = await saveStoredPrayerData(data);
    expect(result).toEqual({
      ok: false,
      reason: 'unknown',
      error: networkErr,
    });

    // Cache untouched (no partial save).
    const stored = await getStoredPrayerData();
    expect(stored).toBeNull();
  });

  test('on quota error with no months to evict, returns { ok: false, reason: "quota" }', async () => {
    const data: StoredPrayerData = { ...BASE, months: {} };
    mockStorage.__failNextSetItem(new Error('disk full'));

    const result = await saveStoredPrayerData(data);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toBe('quota');
  });

  test('eviction picks lexicographically smallest key (chronologically oldest)', async () => {
    // Mix order to verify it doesn't depend on insertion order.
    const data = makeData(['2026-12', '2025-01', '2026-06', '2025-12']);
    mockStorage.__failNextSetItem(new Error('quota_exceeded'));

    await saveStoredPrayerData(data);

    const stored = await getStoredPrayerData();
    // 2025-01 is the oldest and should be the one evicted.
    expect(stored!.months['2025-01']).toBeUndefined();
    expect(Object.keys(stored!.months).sort()).toEqual([
      '2025-12',
      '2026-06',
      '2026-12',
    ]);
  });
});

describe('mutex timeout — hung writes do not block subsequent writes forever', () => {
  test('a hanging cache write does not prevent subsequent saves from completing', async () => {
    // Make AsyncStorage hang for longer than the 10s mutex timeout, so the
    // first chained write times out. The mutex chain MUST recover and let
    // the second save complete.
    //
    // We test the mutex-timeout path indirectly via getOrFetchPrayerTimes,
    // which is what actually puts work on the mutex chain.
    mockFetch
      .mockResolvedValueOnce({ timings: TIMINGS })
      .mockResolvedValueOnce({ timings: { ...TIMINGS, Fajr: '04:55' } });

    // First call: hang setItem so the mutex'd write times out.
    mockStorage.__hangSetItem(11_000); // longer than MUTEX_TIMEOUT_MS (10s)
    const first = await getOrFetchPrayerTimes({
      ...BASE,
      date: new Date(2026, 3, 1),
    });
    expect(first).toEqual(TIMINGS);
    // Restore normal behavior for the second call.
    mockStorage.__hangSetItem(null);

    // Wait long enough for the timeout path to fire and the mutex to release.
    // We deliberately wait > MUTEX_TIMEOUT_MS so the test reflects real flow.
    await new Promise(r => setTimeout(r, 11_500));

    // Second call: should not be blocked by the hung first write.
    const second = await getOrFetchPrayerTimes({
      ...BASE,
      date: new Date(2026, 3, 2),
    });
    expect(second.Fajr).toBe('04:55');

    // Allow the mutex's promise chain to flush.
    await new Promise(r => setTimeout(r, 100));
  }, 20_000); // Per-test timeout: longer than MUTEX_TIMEOUT_MS so the test can observe the recovery
});

describe('getCacheStatus: per-day completeness', () => {
  // April 2026 has 30 days
  const APRIL_2026 = new Date(2026, 3, 15);

  test('reports zero state when nothing is cached', async () => {
    const status = await getCacheStatus(BASE, APRIL_2026);
    expect(status).toEqual({
      monthsStored: 0,
      isExpired: true,
      daysMissingThisMonth: 30, // April has 30 days
      totalDaysCached: 0,
    });
  });

  test('reports daysMissingThisMonth correctly when partially filled', async () => {
    // Pre-populate the cache with 5 days of April.
    const data: StoredPrayerData = {
      ...BASE,
      months: {
        '2026-04': {
          '2026-04-01': TIMINGS,
          '2026-04-02': TIMINGS,
          '2026-04-03': TIMINGS,
          '2026-04-04': TIMINGS,
          '2026-04-05': TIMINGS,
        },
      },
    };
    await saveStoredPrayerData(data);

    const status = await getCacheStatus(BASE, APRIL_2026);
    expect(status.daysMissingThisMonth).toBe(25); // 30 - 5
    expect(status.isExpired).toBe(true); // any missing → expired (back-compat)
    expect(status.totalDaysCached).toBe(5);
    expect(status.monthsStored).toBe(0); // April is incomplete → not counted
  });

  test('reports daysMissingThisMonth=0 when current month is fully filled', async () => {
    const months: StoredPrayerData['months'] = { '2026-04': {} };
    for (let d = 1; d <= 30; d++) {
      const dayKey = `2026-04-${String(d).padStart(2, '0')}`;
      months['2026-04'][dayKey] = TIMINGS;
    }
    await saveStoredPrayerData({ ...BASE, months });

    const status = await getCacheStatus(BASE, APRIL_2026);
    expect(status.daysMissingThisMonth).toBe(0);
    expect(status.isExpired).toBe(false);
    expect(status.monthsStored).toBe(1);
    expect(status.totalDaysCached).toBe(30);
  });

  test('totalDaysCached counts across all stored months', async () => {
    const months: StoredPrayerData['months'] = {
      '2026-04': { '2026-04-01': TIMINGS, '2026-04-02': TIMINGS },
      '2026-05': { '2026-05-01': TIMINGS },
      '2026-06': { '2026-06-15': TIMINGS, '2026-06-16': TIMINGS, '2026-06-17': TIMINGS },
    };
    await saveStoredPrayerData({ ...BASE, months });

    const status = await getCacheStatus(BASE, APRIL_2026);
    expect(status.totalDaysCached).toBe(6); // 2 + 1 + 3
  });
});
