/**
 * syncLiveActivity orchestrator coverage.
 *
 *  1. computePrevPrayerEpochMs — the progress-bar start anchor (the previous
 *     prayer at/before now), including the before-Fajr / after-midnight
 *     fall-back to the prior day's Isha.
 *  2. The iOS content build — verifies the ActivityKit payload carries
 *     prevEpochSeconds + accentHex and the correct next prayer, via a mocked
 *     native module.
 */

import { Platform } from 'react-native';

jest.mock('../src/native/PrayerLiveActivity', () => ({
  getPrayerLiveActivityModule: jest.fn(),
}));
jest.mock('../src/native/MihrabLiveActivity', () => ({
  getMihrabLiveActivityModule: jest.fn(() => null),
}));

import {
  syncLiveActivity,
  computePrevPrayerEpochMs,
} from '../src/liveActivity/syncLiveActivity';
import { getPrayerLiveActivityModule } from '../src/native/PrayerLiveActivity';

const today = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

describe('computePrevPrayerEpochMs', () => {
  const at = (h: number, m: number) => new Date(2026, 5, 14, h, m, 0, 0);

  test('returns the most recent prayer earlier today (mid-afternoon)', () => {
    const prev = computePrevPrayerEpochMs(today, at(14, 0));
    expect(prev).toBe(at(12, 0).getTime()); // Dhuhr
  });

  test('returns Fajr shortly after Fajr', () => {
    expect(computePrevPrayerEpochMs(today, at(5, 30))).toBe(at(5, 0).getTime());
  });

  test('returns Isha after Isha', () => {
    expect(computePrevPrayerEpochMs(today, at(21, 0))).toBe(at(20, 0).getTime());
  });

  test('before Fajr → falls back to the previous day\'s Isha', () => {
    const prev = computePrevPrayerEpochMs(today, at(4, 0));
    const yesterdayIsha = new Date(2026, 5, 13, 20, 0, 0, 0).getTime();
    expect(prev).toBe(yesterdayIsha);
  });

  test('just after midnight → previous day\'s Isha', () => {
    const prev = computePrevPrayerEpochMs(today, at(0, 30));
    const yesterdayIsha = new Date(2026, 5, 13, 20, 0, 0, 0).getTime();
    expect(prev).toBe(yesterdayIsha);
  });

  test('returns null when no timings are usable', () => {
    expect(computePrevPrayerEpochMs({}, at(14, 0))).toBeNull();
  });
});

describe('syncLiveActivity → iOS content', () => {
  const ORIGINAL_OS = Platform.OS;
  let startMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    startMock = jest.fn(() => Promise.resolve());
    (getPrayerLiveActivityModule as jest.Mock).mockReturnValue({
      start: startMock,
      update: jest.fn(() => Promise.resolve()),
      stop: jest.fn(() => Promise.resolve()),
      isAvailable: jest.fn(() => Promise.resolve(true)),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => ORIGINAL_OS });
    jest.clearAllMocks();
  });

  test('sends prevEpochSeconds, accentHex and the correct next prayer', async () => {
    const now = new Date(2026, 5, 14, 14, 0, 0, 0); // 14:00 → next is Asr 15:00
    const p = syncLiveActivity({
      options: { enabled: true },
      today,
      now,
      accentHex: '#2563eb',
    });
    await jest.advanceTimersByTimeAsync(900); // flush the 800ms debounce
    await p;

    expect(startMock).toHaveBeenCalledTimes(1);
    const content = JSON.parse(startMock.mock.calls[0][0]);
    expect(content.accentHex).toBe('#2563eb');
    expect(content.nextKey).toBe('Asr');
    expect(content.nextTime).toBe('15:00');
    // next = Asr 15:00, prev = Dhuhr 12:00
    expect(content.nextEpochSeconds).toBe(
      new Date(2026, 5, 14, 15, 0, 0, 0).getTime() / 1000,
    );
    expect(content.prevEpochSeconds).toBe(
      new Date(2026, 5, 14, 12, 0, 0, 0).getTime() / 1000,
    );
    // Brand-accent path → not system tinted.
    expect(content.systemTinted).toBe(false);
  });

  test('systemTinted flag is forwarded to the iOS content', async () => {
    const now = new Date(2026, 5, 14, 14, 0, 0, 0);
    const p = syncLiveActivity({
      options: { enabled: true },
      today,
      now,
      accentHex: '#22c55e',
      systemTinted: true,
    });
    await jest.advanceTimersByTimeAsync(900);
    await p;

    const content = JSON.parse(startMock.mock.calls[0][0]);
    expect(content.systemTinted).toBe(true);
  });

  test('disabled → ends the activity, does not start one', async () => {
    const stopMock = jest.fn(() => Promise.resolve());
    (getPrayerLiveActivityModule as jest.Mock).mockReturnValue({
      start: startMock,
      update: jest.fn(() => Promise.resolve()),
      stop: stopMock,
      isAvailable: jest.fn(() => Promise.resolve(true)),
    });
    const p = syncLiveActivity({
      options: { enabled: false },
      today,
      now: new Date(2026, 5, 14, 14, 0, 0, 0),
    });
    await jest.advanceTimersByTimeAsync(900);
    await p;

    expect(startMock).not.toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalled();
  });
});
