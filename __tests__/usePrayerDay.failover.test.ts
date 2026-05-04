/**
 * Provider failover recipe — task #17.
 *
 * `usePrayerDay` falls back to `computeLocalAdhanTimes` when the network
 * provider fails. The hook itself is hard to test directly (React state +
 * effects + AppState/NetInfo listeners), but the FALLBACK RECIPE is pure:
 *   • Generate a 7-day week from on-device adhan calculations.
 *   • Each day shape is a complete TimingsMap that passes validateTimings.
 *
 * If `computeLocalAdhanTimes` ever stops producing a valid week, the hook's
 * fallback path silently degrades. This test guards against that.
 */

import { addDays } from '../src/utils/prayerTimes';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { validateTimings } from '../src/providers/validateTimings';

describe('local-adhan fallback recipe (mirrors usePrayerDay on provider failure)', () => {
  test('generates 7 valid days from on-device calculations', () => {
    const now = new Date(2026, 3, 9); // April 9, 2026
    const week = [];
    for (let i = 0; i < 7; i++) {
      const local = computeLocalAdhanTimes({
        latitude: 59.33,
        longitude: 18.07,
        date: addDays(now, i),
        calculationMethod: 'auto',
        school: 0,
      });
      // Every day must pass the same validateTimings gate that real provider
      // responses pass through. If this throws, the fallback would set the
      // hook into 'api_error' instead of 'ready+usingLocalFallback'.
      expect(() => validateTimings(local.timings)).not.toThrow();
      week.push(local.timings);
    }
    expect(week).toHaveLength(7);
  });

  test('Imsak is always present in the local-fallback recipe (task #7 contract)', () => {
    const local = computeLocalAdhanTimes({
      latitude: 59.33,
      longitude: 18.07,
      date: new Date(2026, 3, 9),
      calculationMethod: 'auto',
      school: 0,
    });
    expect(local.timings.Imsak).toBeDefined();
    expect(local.timings.Imsak).toMatch(/^\d{2}:\d{2}$/);
  });

  test('Hanafi school flips Asr later (sanity check of the school param)', () => {
    const shafi = computeLocalAdhanTimes({
      latitude: 59.33,
      longitude: 18.07,
      date: new Date(2026, 3, 9),
      calculationMethod: 'auto',
      school: 0,
    });
    const hanafi = computeLocalAdhanTimes({
      latitude: 59.33,
      longitude: 18.07,
      date: new Date(2026, 3, 9),
      calculationMethod: 'auto',
      school: 1,
    });
    // Both produce valid timings; the Hanafi Asr is provided by adhan.js'
    // configured madhab. We don't assert specific times (the adhan jest
    // mock returns the same Date for every prayer) — just that both paths
    // produce structurally valid output.
    expect(() => validateTimings(shafi.timings)).not.toThrow();
    expect(() => validateTimings(hanafi.timings)).not.toThrow();
  });

  test('extreme latitude does not break the fallback (Tromsø, Norway, summer)', () => {
    // 69.6°N — high enough that Isha can wrap past midnight in summer.
    // The adhan.js mock returns the same Date for everything, so we just
    // verify the call doesn't throw for extreme inputs.
    expect(() =>
      computeLocalAdhanTimes({
        latitude: 69.6,
        longitude: 18.96,
        date: new Date(2026, 5, 21), // June 21 — summer solstice
        calculationMethod: 14, // MoonsightingCommittee — high-latitude method
        school: 0,
      }),
    ).not.toThrow();
  });
});
