/**
 * The advance reminder covers the alternative times too.
 *
 * Sunrise and the three night marks are not prayers: they never carry the
 * adhan, a log action or a snooze. That is a rule about what the alert
 * SOUNDS like, not about whether it exists — a reader who turned on the
 * Last Third to be woken for it wants the same "in 15 minutes" warning
 * the five salāh get, and the alert at the time itself is no use to
 * someone who needs to be at the sink before it.
 */
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';

const today = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
  Firstthird: '22:00',
  Midnight: '23:30',
  Lastthird: '02:30',
};

const ORIGINAL_OS = Platform.OS;

/** Every id the sync asked notifee to schedule. */
const scheduledIds = () =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls.map(
    c => c[0].id as string,
  );

/** The advance reminder scheduled for `key`. */
const pre = (key: string) =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls
    .map(c => c[0])
    .find(
      n => String(n.id).includes('pre-') && String(n.id).endsWith(`-${key}`),
    );

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 5, 14, 10, 0, 0));
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => 'android',
  });
  (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
    android: { alarm: 1 },
    authorizationStatus: 1,
  });
  (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([]);
});

afterEach(() => jest.useRealTimers());

afterAll(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => ORIGINAL_OS,
  });
});

describe('advance reminders for the alternative times', () => {
  const sync = () =>
    syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 15,
      notificationSound: 'adhan_makkah',
      today,
      // Sunrise and the Last Third have already passed at 10:00, so without
      // tomorrow's map there is nothing left of them today to warn about.
      tomorrow: today,
      baseDate: new Date(2026, 5, 14, 10, 0, 0),
    });

  it('warns ahead of every enabled night mark, and of Sunrise', async () => {
    await sync();
    const ids = scheduledIds();
    for (const key of ['Firstthird', 'Midnight', 'Lastthird', 'Sunrise']) {
      expect(ids.some(id => id.includes('pre-') && id.endsWith(key))).toBe(
        true,
      );
    }
  });

  it('puts the reminder the full offset before the time itself', async () => {
    await sync();
    const at = Number(String(pre('Firstthird').id).split('pre-')[1].split('-')[0]);
    expect(new Date(at).getHours()).toBe(21);
    expect(new Date(at).getMinutes()).toBe(45);
  });

  it('says the clock time rather than calling a night mark a prayer', async () => {
    await sync();
    expect(pre('Firstthird').body).toContain('22:00');
    expect(pre('Lastthird').body).toContain('02:30');
  });

  /**
   * The alert is read on a lock screen, next to the system clock. Issue
   * #18 let the user choose how they read one, and this copy is the only
   * place a notification prints a time — so it follows that choice
   * rather than being the one surface that ignores it.
   */
  it('writes that time the way the user reads a clock', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 15,
      notificationSound: 'adhan_makkah',
      today,
      tomorrow: today,
      baseDate: new Date(2026, 5, 14, 10, 0, 0),
      hour12: true,
    });
    expect(pre('Firstthird').body).toContain('10:00 PM');
    expect(pre('Lastthird').body).toContain('2:30 AM');
    // And the salāh copy is untouched — it never printed a time.
    expect(pre('Dhuhr').body).toBe('Starts in 15 min');
  });

  it('leaves the five salāh saying what they always said', async () => {
    await sync();
    expect(pre('Dhuhr').body).toBe('Starts in 15 min');
  });

  it('never gives one the adhan, at the time or before it', async () => {
    await sync();
    const atTime = (notifee.createTriggerNotification as jest.Mock).mock.calls
      .map(c => c[0])
      .filter(n => !String(n.id).includes('pre-'))
      .find(n => String(n.id).endsWith('Firstthird'));
    expect(atTime.data.usesAdhan).toBe('0');
    expect(atTime.android.actions).toEqual([]);
  });

  it('schedules nothing extra when the reminder is turned off', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today,
      baseDate: new Date(2026, 5, 14, 10, 0, 0),
    });
    expect(scheduledIds().some(id => id.includes('pre-'))).toBe(false);
  });
});
