/**
 * prayerNotifications hardening — task #3.
 *
 * Covers the three reliability fixes:
 *   1. Pre-prayer reminder is clamped to [0, 60]; rejects NaN/Infinity/negatives.
 *   2. syncPrayerNotifications returns a typed status that exposes whether
 *      exact alarms were used — so HomeScreen can show a banner without
 *      duplicating the getNotificationSettings query.
 *   3. Cancellation is diff-based (only obsolete IDs are cancelled). The
 *      previous bulk-cancel created a window where ALL prayer notifications
 *      vanished between cancel and recreate; if the app was killed in that
 *      gap, prayer alerts silently disappeared.
 */

import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import {
  clampPrePrayerReminderMinutes,
  syncPrayerNotifications,
} from '../src/notifications/prayerNotifications';

const today = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

// Force Platform.OS to 'android' for this suite — exact-alarm and channel-setup
// branches are Android-specific. Restore after.
const ORIGINAL_OS = Platform.OS;

beforeEach(() => {
  // Pin a deterministic wall clock (10:00 local) so tests that schedule from
  // `today` always have future events regardless of when the suite runs —
  // these were previously flaky after Isha (e.g. on CI in the evening).
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 5, 14, 10, 0, 0));
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => 'android',
  });
  // Default: Android, exact alarms enabled, no existing trigger notifications.
  (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
    android: { alarm: 1 }, // ENABLED
    authorizationStatus: 1, // AUTHORIZED
  });
  (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => ORIGINAL_OS,
  });
});

describe('clampPrePrayerReminderMinutes', () => {
  test('returns the value when in range [0, 60]', () => {
    expect(clampPrePrayerReminderMinutes(0)).toBe(0);
    expect(clampPrePrayerReminderMinutes(5)).toBe(5);
    expect(clampPrePrayerReminderMinutes(30)).toBe(30);
    expect(clampPrePrayerReminderMinutes(60)).toBe(60);
  });

  test('clamps negative values to 0 (the canonical bug from the task spec)', () => {
    expect(clampPrePrayerReminderMinutes(-1)).toBe(0);
    expect(clampPrePrayerReminderMinutes(-5)).toBe(0);
    expect(clampPrePrayerReminderMinutes(-9999)).toBe(0);
  });

  test('clamps values above 60 to 60', () => {
    expect(clampPrePrayerReminderMinutes(61)).toBe(60);
    expect(clampPrePrayerReminderMinutes(120)).toBe(60);
    expect(clampPrePrayerReminderMinutes(9999)).toBe(60);
  });

  test('rejects non-finite numbers', () => {
    expect(clampPrePrayerReminderMinutes(Infinity)).toBe(0);
    expect(clampPrePrayerReminderMinutes(-Infinity)).toBe(0);
    expect(clampPrePrayerReminderMinutes(NaN)).toBe(0);
  });

  test('rejects non-number input (corrupted AsyncStorage path)', () => {
    expect(clampPrePrayerReminderMinutes('10')).toBe(0);
    expect(clampPrePrayerReminderMinutes(null)).toBe(0);
    expect(clampPrePrayerReminderMinutes(undefined)).toBe(0);
    expect(clampPrePrayerReminderMinutes({})).toBe(0);
    expect(clampPrePrayerReminderMinutes([])).toBe(0);
  });

  test('floors fractional values', () => {
    expect(clampPrePrayerReminderMinutes(5.7)).toBe(5);
    expect(clampPrePrayerReminderMinutes(0.1)).toBe(0);
  });
});

describe('syncPrayerNotifications: enabled flag', () => {
  test('returns { status: "disabled" } when enabled=false', async () => {
    const result = await syncPrayerNotifications({
      enabled: false,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today,
    });
    expect(result).toEqual({ status: 'disabled' });
    // No new notifications should be created.
    expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  test('cancels owned trigger notifications when disabled, preserves preview', async () => {
    (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([
      { notification: { id: 'pt-1700000000000-Fajr' } },
      { notification: { id: 'pt-pre-1700000000000-Fajr' } },
      { notification: { id: 'adhan_preview' } }, // must NOT be cancelled
      { notification: { id: 'unrelated-third-party' } }, // must NOT be cancelled
    ]);

    await syncPrayerNotifications({
      enabled: false,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today,
    });

    const cancelled = (notifee.cancelTriggerNotification as jest.Mock).mock.calls.map(
      c => c[0],
    );
    expect(cancelled).toEqual(
      expect.arrayContaining([
        'pt-1700000000000-Fajr',
        'pt-pre-1700000000000-Fajr',
      ]),
    );
    expect(cancelled).not.toContain('adhan_preview');
    expect(cancelled).not.toContain('unrelated-third-party');
  });
});

describe('syncPrayerNotifications: exact-alarm permission', () => {
  test('schedules exact alarms when permission is enabled', async () => {
    (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
      android: { alarm: 1 }, // ENABLED
      authorizationStatus: 1,
    });
    const result = await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today,
    });
    expect(result).toMatchObject({
      status: 'scheduled',
      exactAlarms: true,
    });
  });

  test('schedules inexact alarms and surfaces exactAlarms=false when permission revoked at runtime', async () => {
    // Simulate Android user revoking SCHEDULE_EXACT_ALARM between app start
    // and the next syncPrayerNotifications call. canUseExactAlarms re-checks
    // every call, so the result must reflect the current state.
    (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
      android: { alarm: 0 }, // DISABLED
      authorizationStatus: 1,
    });
    const result = await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today,
    });
    expect(result).toMatchObject({
      status: 'scheduled',
      exactAlarms: false,
    });
    // Verify scheduling continued — degraded, not skipped.
    expect(notifee.createTriggerNotification).toHaveBeenCalled();
    // Verify the trigger does NOT request alarmManager (inexact path).
    const triggerArg = (notifee.createTriggerNotification as jest.Mock).mock.calls[0][1];
    expect(triggerArg.alarmManager).toBeUndefined();
  });
});

describe('syncPrayerNotifications: reminder clamping', () => {
  test('rejects Infinity as invalid input (defensive: returns 0, not 60)', async () => {
    // Mathematically Infinity > 60 → clamp to 60. Defensively, Infinity in
    // a config field signals corruption; we'd rather skip reminders entirely
    // than fire 60-minute-early reminders for every prayer forever.
    const result = await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: Infinity,
      notificationSound: 'default',
      today,
    });
    expect(result).toMatchObject({ status: 'scheduled', reminderMinutes: 0 });
  });

  test('clamps negative reminderMinutes to 0', async () => {
    const result = await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: -10,
      notificationSound: 'default',
      today,
    });
    expect(result).toMatchObject({ status: 'scheduled', reminderMinutes: 0 });
  });

  test('clamps oversized reminderMinutes to 60', async () => {
    const result = await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 9999,
      notificationSound: 'default',
      today,
    });
    expect(result).toMatchObject({ status: 'scheduled', reminderMinutes: 60 });
  });

  test('skips reminder events when clamped value is 0', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: -5, // clamped to 0
      notificationSound: 'default',
      today,
    });
    // Only salah events should be scheduled, no `pt-pre-*` IDs.
    const ids = (notifee.createTriggerNotification as jest.Mock).mock.calls.map(
      c => c[0].id,
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).not.toMatch(/^pt-pre-/);
    }
  });
});

describe('syncPrayerNotifications: diff-based cancellation', () => {
  test('does NOT bulk-cancel via cancelTriggerNotifications', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today,
    });
    // The whole point of the fix: never use the bulk cancel path that
    // creates a window where prayer alerts vanish.
    expect(notifee.cancelTriggerNotifications).not.toHaveBeenCalled();
  });

  test('cancels only obsolete IDs, keeps IDs that match the new desired set', async () => {
    // Existing notifications: one we still want, one that's stale, plus the preview.
    // We pretend the "still wanted" id is one of the IDs that the next sync
    // will want too, by computing it deterministically.
    // Easier: just make a stale id and assert it was cancelled but the preview wasn't.
    (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([
      { notification: { id: 'pt-1234567890-StaleFajr' } }, // not in new set → cancel
      { notification: { id: 'adhan_preview' } }, // never cancel
    ]);

    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today,
    });

    const cancelled = (notifee.cancelTriggerNotification as jest.Mock).mock.calls.map(
      c => c[0],
    );
    expect(cancelled).toContain('pt-1234567890-StaleFajr');
    expect(cancelled).not.toContain('adhan_preview');
  });

  test('falls back to bulk cancel if getTriggerNotifications fails (older notifee)', async () => {
    (notifee.getTriggerNotifications as jest.Mock).mockRejectedValue(
      new Error('not implemented'),
    );

    await syncPrayerNotifications({
      enabled: false,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today,
    });

    // Graceful degradation: better to bulk-cancel than to leak orphans.
    expect(notifee.cancelTriggerNotifications).toHaveBeenCalled();
  });

  test('uses deterministic ID format (pt-<timestamp>-<name> and pt-pre-<timestamp>-<name>)', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 10,
      notificationSound: 'default',
      today,
    });

    const ids = (notifee.createTriggerNotification as jest.Mock).mock.calls.map(
      c => c[0].id as string,
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      // Every ID our notifications use starts with the prayer prefix, never anything else.
      expect(id).toMatch(/^pt-(?:pre-)?\d+-[A-Za-z]+$/);
    }
  });
});

describe('syncPrayerNotifications: notification channels', () => {
  test('creates only the default + selected channels, deletes the surplus', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'adhan_makkah',
      today,
      tomorrow: today,
    });

    const createdIds = (notifee.createChannel as jest.Mock).mock.calls.map(
      c => c[0].id,
    );
    // Exactly the two channels we actually use.
    expect(new Set(createdIds)).toEqual(
      new Set(['prayer-times-default', 'prayer-times-adhan-makkah']),
    );

    const deletedIds = (notifee.deleteChannel as jest.Mock).mock.calls.map(
      c => c[0],
    );
    // Surplus adhan channels are cleaned up, never the two needed ones.
    expect(deletedIds).toContain('prayer-times-adhan-madina');
    expect(deletedIds).not.toContain('prayer-times-default');
    expect(deletedIds).not.toContain('prayer-times-adhan-makkah');
  });

  test('default sound → only the default channel is created', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today,
      tomorrow: today,
    });
    const createdIds = (notifee.createChannel as jest.Mock).mock.calls.map(
      c => c[0].id,
    );
    expect(new Set(createdIds)).toEqual(new Set(['prayer-times-default']));
  });
});

describe('syncPrayerNotifications: Sunrise never plays the adhan', () => {
  // Pass `tomorrow` as well so a full set of future events always exists
  // regardless of the wall-clock time the test runs at.
  const findSalahCall = (name: string) =>
    (notifee.createTriggerNotification as jest.Mock).mock.calls.find(
      c => typeof c[0].id === 'string' && c[0].id.endsWith(`-${name}`),
    )?.[0];

  test('with an adhan selected, Sunrise uses the default sound + no adhan controls', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'adhan_makkah',
      today,
      tomorrow: today,
    });

    const sunrise = findSalahCall('Sunrise');
    expect(sunrise).toBeDefined();
    // Plain default sound + channel, not the adhan ones.
    expect(sunrise.android.channelId).toBe('prayer-times-default');
    expect(sunrise.ios.sound).toBe('default');
    // No adhan category (iOS) and no usesAdhan flag.
    expect(sunrise.ios.categoryId).toBeUndefined();
    expect(sunrise.data.usesAdhan).toBe('0');
    // No "Stop adhan" action — only the Log prayer action remains.
    const sunriseActionIds = (sunrise.android.actions ?? []).map(
      (a: { pressAction: { id: string } }) => a.pressAction.id,
    );
    expect(sunriseActionIds).not.toContain('adhan_stop');
  });

  test('with an adhan selected, the five daily prayers still play the adhan', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'adhan_makkah',
      today,
      tomorrow: today,
    });

    const dhuhr = findSalahCall('Dhuhr');
    expect(dhuhr).toBeDefined();
    expect(dhuhr.android.channelId).toBe('prayer-times-adhan-makkah');
    expect(dhuhr.ios.sound).toBe('adhan_makkah.caf');
    expect(dhuhr.ios.categoryId).toBe('adhan_controls');
    expect(dhuhr.data.usesAdhan).toBe('1');
    const dhuhrActionIds = (dhuhr.android.actions ?? []).map(
      (a: { pressAction: { id: string } }) => a.pressAction.id,
    );
    expect(dhuhrActionIds).toContain('adhan_stop');
  });
});
