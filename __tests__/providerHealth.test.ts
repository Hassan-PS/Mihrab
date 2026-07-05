/**
 * Provider failure cooldown (v2.7.28) — the Swedish scraper stops being
 * retried after consecutive failures.
 */
import {
  __resetProviderHealthForTests,
  isProviderCoolingDown,
  recordProviderResult,
  COOLDOWN_MS,
  FAILURE_THRESHOLD,
} from '../src/providers/providerHealth';

const P = 'islamiska_forbundet';

describe('providerHealth cooldown', () => {
  beforeEach(() => {
    __resetProviderHealthForTests();
  });

  it('no cooldown below the failure threshold', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      await recordProviderResult(P, false, 1000);
    }
    expect(await isProviderCoolingDown(P, 1000)).toBe(false);
  });

  it('enters cooldown after N consecutive failures', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await recordProviderResult(P, false, 1000);
    }
    expect(await isProviderCoolingDown(P, 1000)).toBe(true);
    // …and exits once the window has passed.
    expect(await isProviderCoolingDown(P, 1000 + COOLDOWN_MS + 1)).toBe(false);
  });

  it('a success resets the failure count', async () => {
    await recordProviderResult(P, false, 1000);
    await recordProviderResult(P, false, 1000);
    await recordProviderResult(P, true, 1000);
    await recordProviderResult(P, false, 1000);
    await recordProviderResult(P, false, 1000);
    expect(await isProviderCoolingDown(P, 1000)).toBe(false);
  });
});
