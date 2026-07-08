/**
 * Cross-border correctness: someone in Sweden travelling abroad, and someone
 * abroad arriving in Sweden. The prayer-time provider must switch with the
 * coordinate and must never serve Swedish dataset times to a non-Swedish spot.
 */
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { getNearestIslamiskaForbundetCityWithDistance } from '../src/providers/islamiskaForbundetNearest';
import { getIslamiskaForbundetDatasetTimes } from '../src/providers/islamiskaForbundetDataset';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const MECCA = { latitude: 21.4225, longitude: 39.8262 };
const GOTHENBURG = { latitude: 57.7089, longitude: 11.9746 };

describe('getEffectiveDataProvider — travel', () => {
  it('automatic: Sweden → islamiska_forbundet', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', STOCKHOLM)).toBe(
      'islamiska_forbundet',
    );
    expect(getEffectiveDataProvider(true, 'aladhan', GOTHENBURG)).toBe(
      'islamiska_forbundet',
    );
  });

  it('automatic: abroad → global default (not Swedish times)', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', LONDON)).not.toBe(
      'islamiska_forbundet',
    );
    expect(getEffectiveDataProvider(true, 'aladhan', MECCA)).not.toBe(
      'islamiska_forbundet',
    );
  });

  it('manual islamiska_forbundet pinned, but moved abroad → falls back', () => {
    // Traveler from Sweden with IFiS pinned lands in London: must not keep
    // serving Swedish times.
    expect(
      getEffectiveDataProvider(false, 'islamiska_forbundet', LONDON),
    ).not.toBe('islamiska_forbundet');
    // Back in Sweden, the pin is honoured.
    expect(
      getEffectiveDataProvider(false, 'islamiska_forbundet', STOCKHOLM),
    ).toBe('islamiska_forbundet');
  });
});

describe('IFiS dataset distance cap', () => {
  it('nearest Swedish city is near for Swedish coords, far for abroad', () => {
    expect(
      getNearestIslamiskaForbundetCityWithDistance(
        STOCKHOLM.latitude,
        STOCKHOLM.longitude,
      ).distanceKm,
    ).toBeLessThan(30);
    expect(
      getNearestIslamiskaForbundetCityWithDistance(
        LONDON.latitude,
        LONDON.longitude,
      ).distanceKm,
    ).toBeGreaterThan(250);
  });

  it('dataset MISSES (throws) for coords far from any Swedish city', async () => {
    await expect(
      getIslamiskaForbundetDatasetTimes({
        latitude: LONDON.latitude,
        longitude: LONDON.longitude,
        date: new Date('2026-07-08T12:00:00Z'),
      }),
    ).rejects.toBeTruthy();
  });
});
