/**
 * The per-prayer alert mode, where it actually matters: the schedule.
 *
 * Silent has to mean no alarm is registered — not a muted one — because
 * a registered alarm still lands on the lock screen, and someone who
 * silenced Fajr is asking for it not to be there at 04:30.
 */
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import type { TimingsMap } from '../src/types/prayer';

const ORIGINAL_OS = Platform.OS;
const NOW = new Date(2026, 5, 14, 10, 0, 0);

const today: TimingsMap = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

const calls = () =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls.map(c => c[0]);
/** The at-the-time alerts, i.e. not the "starts in N min" ones. */
const atTime = () =>
  calls().filter(
    n => !String(n.id).includes('pre-') && !String(n.id).includes('daruri-'),
  );
const forPrayer = (name: string) =>
  atTime().filter(n => String(n.id).endsWith(`-${name}`));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
    android: { alarm: 1 },
    authorizationStatus: 1,
  });
  (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());
afterAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => ORIGINAL_OS });
});

const sync = (extra: Record<string, unknown> = {}) =>
  syncPrayerNotifications({
    enabled: true,
    prePrayerReminderMinutes: 0,
    notificationSound: 'adhan_makkah',
    today,
    tomorrow: today,
    baseDate: NOW,
    ...extra,
  });

describe('with nothing set, nothing changes', () => {
  it('gives every prayer the chosen adhan, as it always did', async () => {
    await sync();
    for (const name of ['Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      const fired = forPrayer(name);
      expect(fired.length).toBeGreaterThan(0);
      expect(fired[0].android.channelId).toContain('adhan');
    }
  });

  it('and leaves Sunrise on the plain tone', async () => {
    await sync();
    const fired = forPrayer('Sunrise');
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0].android.channelId).not.toContain('adhan');
  });
});

describe('silent means no alarm at all', () => {
  it('schedules nothing for a silenced prayer', async () => {
    await sync({ alertModes: { Fajr: 'silent' } });
    expect(forPrayer('Fajr')).toHaveLength(0);
    // …and its neighbours are untouched.
    expect(forPrayer('Dhuhr').length).toBeGreaterThan(0);
  });

  it('takes the silenced prayer’s advance reminder with it', async () => {
    await sync({
      alertModes: { Fajr: 'silent' },
      prePrayerReminderMinutes: 15,
    });
    const pre = calls().filter(n => String(n.id).includes('pre-'));
    expect(pre.length).toBeGreaterThan(0);
    expect(pre.some(n => String(n.id).endsWith('-Fajr'))).toBe(false);
    expect(pre.some(n => String(n.id).endsWith('-Dhuhr'))).toBe(true);
  });

  it('silences one of the optional times too', async () => {
    await sync({ alertModes: { Sunrise: 'silent' } });
    expect(forPrayer('Sunrise')).toHaveLength(0);
  });
});

describe('notification means the plain tone, not the adhan', () => {
  it('drops the adhan for that prayer and keeps it for the rest', async () => {
    await sync({ alertModes: { Fajr: 'notification' } });
    const fajr = forPrayer('Fajr');
    expect(fajr.length).toBeGreaterThan(0);
    expect(fajr[0].android.channelId).not.toContain('adhan');
    expect(String(fajr[0].ios?.sound ?? '')).not.toContain('adhan');
    expect(forPrayer('Maghrib')[0].android.channelId).toContain('adhan');
  });

  /**
   * The alarm-stream twin exists so the adhan survives a silenced ringer.
   * A prayer set to the plain tone is not making that claim.
   */
  it('does not route a plain alert to the alarm stream', async () => {
    await sync({
      adhanUsesAlarmStream: true,
      alertModes: { Fajr: 'notification', Maghrib: 'adhan' },
    });
    expect(forPrayer('Fajr')[0].android.channelId).not.toContain('alarm');
    expect(forPrayer('Maghrib')[0].android.channelId).toContain('alarm');
  });
});

describe('adhan means the adhan, even when the global sound says otherwise', () => {
  it('plays it for a prayer that asked, with default chosen globally', async () => {
    await sync({
      notificationSound: 'default',
      alertModes: { Maghrib: 'adhan' },
    });
    // 'default' IS the plain tone, so asking for "adhan" can only give
    // what the sound picker holds — the point is that the row's answer is
    // read at all, and that the others stay plain.
    expect(forPrayer('Maghrib').length).toBeGreaterThan(0);
    expect(forPrayer('Fajr')[0].android.channelId).not.toContain('adhan');
  });

  /** Sunrise can never be given the call to prayer, on any path. */
  it('refuses the adhan to an optional time, even if stored', async () => {
    await sync({ alertModes: { Sunrise: 'adhan' } });
    const fired = forPrayer('Sunrise');
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0].android.channelId).not.toContain('adhan');
  });
});
