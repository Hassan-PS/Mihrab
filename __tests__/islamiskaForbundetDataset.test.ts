/**
 * Prepared-dataset source for Sweden (islamiskaForbundetDataset.ts).
 *
 * Verifies the runtime lookup order (cached CDN mirror → bundled seed → miss)
 * and the slug contract shared with the dataset builder.
 */

// Inject a deterministic bundled seed.
jest.mock('../src/providers/data/ifisSeed.json', () => ({
  version: 1,
  builtAt: '2026-07-01T00:00:00Z',
  timezone: 'Europe/Stockholm',
  cities: {
    stockholm: {
      '2099-01-01': ['01:00', '02:00', '03:00', '12:00', '15:00', '18:00', '20:00'],
    },
  },
}));

// Never hit the network during the opportunistic refresh.
jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn().mockRejectedValue(new Error('no network in test')),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getIslamiskaForbundetDatasetTimes,
  _resetDatasetMemoForTests,
} from '../src/providers/islamiskaForbundetDataset';
import { citySlug } from '../src/providers/islamiskaForbundetParser';
import coords from '../src/providers/islamiskaForbundetCoords.json';
import { ProviderError } from '../src/providers/errors';

// Stockholm — nearest city resolves to "Stockholm" (slug "stockholm").
const STHLM = { latitude: 59.3293, longitude: 18.0686 };

beforeEach(async () => {
  _resetDatasetMemoForTests();
  await AsyncStorage.clear();
});

describe('getIslamiskaForbundetDatasetTimes', () => {
  it('serves times from the bundled seed', async () => {
    const res = await getIslamiskaForbundetDatasetTimes({
      ...STHLM,
      date: new Date('2099-01-01T10:00:00Z'),
    });
    expect(res.timings.Fajr).toBe('02:00');
    expect(res.timings.Isha).toBe('20:00');
    expect(res.timings.Imsak).toBe('01:00');
    expect(res.timezone).toBe('Europe/Stockholm');
  });

  it('prefers a fresh cached CDN mirror over the seed', async () => {
    await AsyncStorage.setItem(
      'ifis.dataset.v1.city.stockholm',
      JSON.stringify({
        fetchedAt: Date.now(),
        timezone: 'Europe/Stockholm',
        days: {
          '2099-01-01': ['01:11', '02:22', '03:33', '12:44', '15:55', '18:11', '20:22'],
        },
      }),
    );
    const res = await getIslamiskaForbundetDatasetTimes({
      ...STHLM,
      date: new Date('2099-01-01T10:00:00Z'),
    });
    expect(res.timings.Fajr).toBe('02:22'); // cached, not the seed's 02:00
  });

  it('throws ProviderError when neither cache nor seed cover the date', async () => {
    await expect(
      getIslamiskaForbundetDatasetTimes({
        ...STHLM,
        date: new Date('2099-12-31T10:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('citySlug contract', () => {
  it('produces a unique slug for every Swedish city (builder relies on this)', () => {
    const names = Object.keys(coords as Record<string, unknown>);
    const slugs = names.map(citySlug);
    expect(new Set(slugs).size).toBe(names.length);
  });

  it('slugs are ASCII [a-z0-9-] only', () => {
    for (const name of Object.keys(coords as Record<string, unknown>)) {
      expect(citySlug(name)).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('transliterates Swedish letters', () => {
    expect(citySlug('Alingsås')).toBe('alingsas');
    expect(citySlug('Örebro')).toBe('orebro');
    expect(citySlug('Växjö')).toBe('vaxjo');
  });
});
