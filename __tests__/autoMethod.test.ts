/**
 * What "Automatic" computes to when the network is not there to decide.
 *
 * The on-device rung is no longer a rarity — it sits underneath every
 * provider as the one that cannot fail — so "Automatic" answering MWL in a
 * country with its own published parameters is a visible error rather than a
 * theoretical one.
 */
jest.unmock('adhan');

import {
  DEFAULT_AUTO_METHOD,
  autoMethodForCoords,
} from '../src/providers/autoMethod';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';

describe('autoMethodForCoords', () => {
  test('Moroccan coordinates resolve to the Morocco method', () => {
    // Casablanca, Marrakech, Oujda, Dakhla — coast to desert, north to south.
    expect(autoMethodForCoords(33.5731, -7.5898)).toBe(21);
    expect(autoMethodForCoords(31.6295, -7.9811)).toBe(21);
    expect(autoMethodForCoords(34.6814, -1.9086)).toBe(21);
    expect(autoMethodForCoords(23.6848, -15.957)).toBe(21);
  });

  test('everywhere else stays on the global default', () => {
    expect(autoMethodForCoords(59.33, 18.07)).toBe(DEFAULT_AUTO_METHOD); // Stockholm
    expect(autoMethodForCoords(21.4225, 39.8262)).toBe(DEFAULT_AUTO_METHOD); // Makkah
    expect(autoMethodForCoords(36.75, 3.06)).toBe(DEFAULT_AUTO_METHOD); // Algiers
    expect(autoMethodForCoords(0, 0)).toBe(DEFAULT_AUTO_METHOD);
  });
});

describe('the computation actually uses it', () => {
  const DAY = new Date(2026, 7, 30);
  const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 };

  test('"auto" in Morocco equals asking for method 21 by name', () => {
    const auto = computeLocalAdhanTimes({
      ...CASABLANCA,
      date: DAY,
      calculationMethod: 'auto',
      school: 0,
    });
    const explicit = computeLocalAdhanTimes({
      ...CASABLANCA,
      date: DAY,
      calculationMethod: 21,
      school: 0,
    });
    expect(auto.timings).toEqual(explicit.timings);
  });

  test('and no longer equals MWL, which is what it used to answer', () => {
    const auto = computeLocalAdhanTimes({
      ...CASABLANCA,
      date: DAY,
      calculationMethod: 'auto',
      school: 0,
    });
    const mwl = computeLocalAdhanTimes({
      ...CASABLANCA,
      date: DAY,
      calculationMethod: 3,
      school: 0,
    });
    expect(auto.timings).not.toEqual(mwl.timings);
  });

  test('outside Morocco "auto" is still MWL', () => {
    const STOCKHOLM = { latitude: 59.33, longitude: 18.07 };
    const auto = computeLocalAdhanTimes({
      ...STOCKHOLM,
      date: DAY,
      calculationMethod: 'auto',
      school: 0,
    });
    const mwl = computeLocalAdhanTimes({
      ...STOCKHOLM,
      date: DAY,
      calculationMethod: 3,
      school: 0,
    });
    expect(auto.timings).toEqual(mwl.timings);
  });
});
