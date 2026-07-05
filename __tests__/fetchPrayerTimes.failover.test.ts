/**
 * Same-request AlAdhan failover for the Swedish scraper (v2.7.30).
 *
 * Before, an islamiska_forbundet failure threw all the way up and the
 * caller fell back to on-device adhan — for THREE separate sessions —
 * until the cooldown finally routed to AlAdhan. Now the very request
 * that observed the failure retries against AlAdhan directly.
 */
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { __resetProviderHealthForTests } from '../src/providers/providerHealth';
import { ProviderError } from '../src/providers/errors';

jest.mock('../src/providers/islamiskaForbundet', () => ({
  fetchIslamiskaForbundetTimes: jest.fn(),
}));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(),
}));

import { fetchIslamiskaForbundetTimes } from '../src/providers/islamiskaForbundet';
import { fetchAladhanTimes } from '../src/providers/aladhan';

const GOOD = {
  timings: {
    Imsak: '02:10',
    Fajr: '02:20',
    Sunrise: '03:40',
    Dhuhr: '12:55',
    Asr: '17:30',
    Maghrib: '22:05',
    Isha: '23:35',
  },
  timezone: 'Europe/Stockholm',
};

const PARAMS = {
  provider: 'islamiska_forbundet' as const,
  latitude: 59.33,
  longitude: 18.06,
  date: new Date(2026, 6, 6),
  calculationMethod: 3 as const,
  school: 0,
};

describe('islamiska_forbundet same-request failover', () => {
  beforeEach(() => {
    __resetProviderHealthForTests();
    jest.clearAllMocks();
  });

  it('serves AlAdhan in the SAME call when the scraper fails', async () => {
    (fetchIslamiskaForbundetTimes as jest.Mock).mockRejectedValue(
      new ProviderError('islamiska_forbundet', 'timeout', 'origin down'),
    );
    (fetchAladhanTimes as jest.Mock).mockResolvedValue(GOOD);

    const res = await fetchPrayerTimesUnified(PARAMS);
    expect(res.timings.Fajr).toBe('02:20');
    expect(fetchAladhanTimes).toHaveBeenCalledTimes(1);
  });

  it('propagates the ORIGINAL scraper error when AlAdhan also fails', async () => {
    const original = new ProviderError(
      'islamiska_forbundet',
      'timeout',
      'origin down',
    );
    (fetchIslamiskaForbundetTimes as jest.Mock).mockRejectedValue(original);
    (fetchAladhanTimes as jest.Mock).mockRejectedValue(
      new Error('aladhan down too'),
    );

    await expect(fetchPrayerTimesUnified(PARAMS)).rejects.toBe(original);
  });

  it('still uses the scraper result when it succeeds', async () => {
    (fetchIslamiskaForbundetTimes as jest.Mock).mockResolvedValue(GOOD);
    const res = await fetchPrayerTimesUnified(PARAMS);
    expect(res.timings.Isha).toBe('23:35');
    expect(fetchAladhanTimes).not.toHaveBeenCalled();
  });
});
