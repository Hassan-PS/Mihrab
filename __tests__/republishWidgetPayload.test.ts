/**
 * The widget payload can be rebuilt with no screen mounted.
 *
 * This is the regression test for the structural bug behind every stale-widget
 * report: the payload used to have exactly one writer, and it lived inside
 * HomeScreen. The tabs are lazy, so every deep link the widgets themselves
 * fire — `mihrab://log`, `mihrab://tasbih`, `mihrab://quran` — opened the app
 * on a screen that could not refresh them, and a prayer logged there reached
 * the journal but never the home screen.
 *
 * These pin the contract that makes that impossible: given settings and a
 * cache, a plain async call produces a payload and pushes it. No renderer, no
 * navigation, no hook.
 */
import { Platform } from 'react-native';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import type { TimingsMap } from '../src/types/prayer';

jest.mock('../src/native/PrayerWidget', () => ({
  getPrayerWidgetModule: jest.fn(),
}));
jest.mock('../src/settings/storage', () => ({ loadSettings: jest.fn() }));
jest.mock('../src/prayer/prayerStorage', () => ({
  getCachedPrayerTimes: jest.fn(),
}));
jest.mock('../src/widget/collectWidgetExtras', () => ({
  collectWidgetExtras: jest.fn(async () => ({})),
}));

import { republishWidgetPayload } from '../src/widget/republishWidgetPayload';
import { getPrayerWidgetModule } from '../src/native/PrayerWidget';
import { loadSettings } from '../src/settings/storage';
import { getCachedPrayerTimes } from '../src/prayer/prayerStorage';

const NOW = new Date(2026, 7, 18, 14, 0, 0);

/** A day whose times drift a minute per day, so days are distinguishable. */
function day(i: number): TimingsMap {
  const mm = (base: number) => String(base + i).padStart(2, '0');
  return {
    Fajr: `05:${mm(0)}`,
    Sunrise: `06:${mm(10)}`,
    Dhuhr: `12:${mm(0)}`,
    Asr: `15:${mm(0)}`,
    Maghrib: `18:${mm(0)}`,
    Isha: `19:${mm(0)}`,
  };
}

const setData = jest.fn(async (_json: string) => {});

/** The payload as the native module received it. */
function pushed(): Record<string, unknown> {
  expect(setData).toHaveBeenCalledTimes(1);
  return JSON.parse(setData.mock.calls[0][0]);
}

function settingsWith(over: Partial<typeof DEFAULT_SETTINGS> = {}) {
  return {
    ...DEFAULT_SETTINGS,
    locationMode: 'manual' as const,
    manualLatitude: 59.33,
    manualLongitude: 18.06,
    manualLocationLabel: 'Stockholm',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  (getPrayerWidgetModule as jest.Mock).mockReturnValue({ setData });
  (loadSettings as jest.Mock).mockResolvedValue(settingsWith());
  let i = -1;
  (getCachedPrayerTimes as jest.Mock).mockImplementation(async () => {
    i += 1;
    return day(i);
  });
});

describe('republishWidgetPayload', () => {
  test('builds and pushes the whole window from the cache, with no screen', async () => {
    await expect(republishWidgetPayload('launch', NOW)).resolves.toBe(true);

    const payload = pushed();
    expect((payload.days as unknown[]).length).toBe(30);
    expect(payload.locationName).toBe('Stockholm');
    // Day 0 is today's; the drift proves the days did not all come from one
    // cached read.
    expect((payload.rows as { key: string; time: string }[])[0].time).toBe('05:00');
    expect(
      ((payload.days as { rows: { time: string }[] }[])[1].rows[0]).time,
    ).toBe('05:01');
  });

  test('refuses the (0, 0) sentinel rather than publishing the coast of Ghana', async () => {
    (loadSettings as jest.Mock).mockResolvedValue(
      settingsWith({ manualLatitude: 0, manualLongitude: 0 }),
    );
    await expect(republishWidgetPayload('launch', NOW)).resolves.toBe(false);
    expect(setData).not.toHaveBeenCalled();
  });

  test('publishes nothing when no location has ever been set', async () => {
    (loadSettings as jest.Mock).mockResolvedValue(
      settingsWith({
        locationMode: 'automatic',
        lastFetchedLatitude: undefined,
        lastFetchedLongitude: undefined,
      }),
    );
    await expect(republishWidgetPayload('launch', NOW)).resolves.toBe(false);
    expect(setData).not.toHaveBeenCalled();
  });

  test('falls back to on-device times when the cache is cold', async () => {
    // A fresh install, or a city the user has only just moved to. The window
    // is computed locally rather than left empty, because "no cache yet" is
    // not the same as "no prayer times exist" — and this path must never
    // reach the network.
    (getCachedPrayerTimes as jest.Mock).mockResolvedValue(null);

    await expect(republishWidgetPayload('launch', NOW)).resolves.toBe(true);
    const payload = pushed();
    expect((payload.days as unknown[]).length).toBe(30);
    const fajr = (payload.rows as { key: string; time: string }[]).find(
      r => r.key === 'Fajr',
    );
    expect(fajr?.time).toMatch(/^\d{2}:\d{2}$/);
  });

  test('a store that throws costs the push, not the caller', async () => {
    (loadSettings as jest.Mock).mockRejectedValue(new Error('disk gone'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(republishWidgetPayload('practice', NOW)).resolves.toBe(false);
    expect(setData).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
