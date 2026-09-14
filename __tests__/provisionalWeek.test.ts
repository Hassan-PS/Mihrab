/**
 * The on-device week that fills the moment after a location change.
 *
 * Switching to a saved place used to blank the screen until all seven days
 * had come back from the cache or the network. `buildProvisionalWeek` is
 * what `loadTimes` now paints at once instead, before the provider answers.
 * Like the offline-fallback recipe it is pure, so it is tested as such: it
 * must yield a full, valid week through the SAME offset and night-time
 * pipeline as the real data, or the swap to the provider's times would
 * visibly jump.
 */
import { buildProvisionalWeek } from '../src/hooks/usePrayerDay';
import { validateTimings } from '../src/providers/validateTimings';

const STOCKHOLM = { latitude: 59.33, longitude: 18.07 };
const NOW = new Date(2026, 8, 14);

describe('buildProvisionalWeek', () => {
  test('yields a full valid week for real coordinates', () => {
    const week = buildProvisionalWeek({
      ...STOCKHOLM,
      calculationMethod: 'auto',
      school: 0,
      prayerOffsets: undefined,
      now: NOW,
    });
    expect(week).not.toBeNull();
    expect(week).toHaveLength(7);
    for (const day of week!) {
      // Same gate every provider response passes through.
      expect(() => validateTimings(day)).not.toThrow();
    }
  });

  test('applies the user\'s per-prayer offsets, like the real pipeline', () => {
    const plain = buildProvisionalWeek({
      ...STOCKHOLM,
      calculationMethod: 'auto',
      school: 0,
      prayerOffsets: undefined,
      now: NOW,
    })!;
    const nudged = buildProvisionalWeek({
      ...STOCKHOLM,
      calculationMethod: 'auto',
      school: 0,
      prayerOffsets: { Fajr: 5 },
      now: NOW,
    })!;
    // A nudged Fajr must differ from the plain one; the untouched prayers
    // must not. If this ever fails the provisional paint and the provider's
    // times would disagree by the offset and jump on the swap.
    expect(nudged[0].Fajr).not.toBe(plain[0].Fajr);
    expect(nudged[0].Dhuhr).toBe(plain[0].Dhuhr);
  });

  test('carries the derived night marks the real week has', () => {
    const week = buildProvisionalWeek({
      ...STOCKHOLM,
      calculationMethod: 'auto',
      school: 0,
      prayerOffsets: undefined,
      now: NOW,
    })!;
    // `injectNightTimes` adds these from Maghrib/Fajr; the real pipeline
    // runs it too, so the provisional card shows the same rows.
    const keys = Object.keys(week[0]);
    expect(keys.some(k => /midnight/i.test(k))).toBe(true);
  });
});
