/**
 * Sunrise is not a prayer, and must never be given the adhan.
 *
 * Reported live: "the sunrise now plays adhan". The scheduler has had the
 * rule for a long time — NON_PRAYER_EVENTS, `isNonPrayer`, the plain
 * default sound — but nothing ever ran it. The tests in this area check
 * `resolveSoundTargets` in isolation, which is the one piece that was
 * never wrong, so the rule was one bad `if` away from disappearing without
 * a single failure.
 *
 * This drives the real `syncPrayerNotifications` and reads back what each
 * event was actually handed: the Android channel, the iOS sound, and the
 * `usesAdhan` / `adhanSound` pair the in-app player keys off. Three doors,
 * because the adhan can reach a notification through any of them and
 * closing one is not closing the others.
 */
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import { adhanMuteToggleTask } from '../src/notifications/adhanMute';

const TIMINGS = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
  Midnight: '00:34',
  Lastthird: '02:22',
};

const ORIGINAL_OS = Platform.OS;

beforeEach(() => {
  jest.useFakeTimers();
  // 01:00, so every event of the day is still ahead — including the night
  // times, which are the first two entries of NEXT_SALAH_ORDER.
  jest.setSystemTime(new Date(2026, 5, 14, 1, 0, 0));
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

async function schedule(overrides: Record<string, unknown> = {}) {
  await syncPrayerNotifications({
    enabled: true,
    prePrayerReminderMinutes: 0,
    notificationSound: 'adhan_makkah',
    today: TIMINGS,
    tomorrow: TIMINGS,
    ...overrides,
  } as Parameters<typeof syncPrayerNotifications>[0]);
}

/** Every notification scheduled for one event key. */
function forEvent(key: string): any[] {
  return (notifee.createTriggerNotification as jest.Mock).mock.calls
    .map(c => c[0] as any)
    .filter(n => String(n.id).endsWith(`-${key}`));
}

describe('sunrise, through the scheduler that actually runs', () => {
  it('is scheduled at all', async () => {
    await schedule();
    expect(forEvent('Sunrise').length).toBeGreaterThan(0);
  });

  it('never lands on an adhan channel', async () => {
    await schedule();
    for (const n of forEvent('Sunrise')) {
      expect(n.android.channelId).toBe('prayer-times-default');
    }
  });

  it('never lands on the alarm-stream twin either', async () => {
    // The ringer-proof channel is for the call to prayer. Sunrise on it
    // would be the same bug, louder: it would override a silenced phone.
    await schedule({ adhanUsesAlarmStream: true });
    for (const n of forEvent('Sunrise')) {
      expect(n.android.channelId).toBe('prayer-times-default');
      expect(String(n.android.channelId)).not.toMatch(/-alarm$/);
    }
  });

  it('carries no iOS adhan sound', async () => {
    await schedule();
    for (const n of forEvent('Sunrise')) {
      expect(n.ios?.sound ?? 'default').toBe('default');
    }
  });

  it('tells the in-app player not to play', async () => {
    // iOS caps a notification's own sound at 30s, so the full adhan is
    // played in-app from these two fields. They are the third door.
    await schedule();
    for (const n of forEvent('Sunrise')) {
      expect(n.data.usesAdhan).toBe('0');
      expect(n.data.adhanSound).toBe('default');
    }
  });

  it('gets no prayer actions to log or snooze', async () => {
    await schedule();
    for (const n of forEvent('Sunrise')) {
      expect(n.android.actions ?? []).toHaveLength(0);
      expect(n.ios?.categoryId).toBeUndefined();
    }
  });

  it('treats the night times the same way', async () => {
    await schedule({ adhanUsesAlarmStream: true });
    for (const key of ['Midnight', 'Lastthird']) {
      for (const n of forEvent(key)) {
        expect(n.android.channelId).toBe('prayer-times-default');
        expect(n.data.usesAdhan).toBe('0');
      }
    }
  });

  it('and the five prayers still get the adhan', async () => {
    // The control. A suite that only proves silence would pass just as
    // happily with the adhan switched off everywhere.
    await schedule();
    const dhuhr = forEvent('Dhuhr');
    expect(dhuhr.length).toBeGreaterThan(0);
    for (const n of dhuhr) {
      expect(n.android.channelId).toBe('prayer-times-adhan-makkah');
      expect(n.data.usesAdhan).toBe('1');
    }
  });

  it('and the alarm twin is theirs alone', async () => {
    await schedule({ adhanUsesAlarmStream: true });
    for (const n of forEvent('Dhuhr')) {
      expect(n.android.channelId).toBe('prayer-times-adhan-makkah-alarm');
    }
  });
});

describe('the door that was actually open: "Mute next adhan"', () => {
  // The scheduler was never wrong. This task is the other way a scheduled
  // alert gets re-created, it runs headless from data that crossed a
  // process boundary, and it did what it was told: un-muting put the name
  // it was handed on the adhan channel with usesAdhan '1'.
  //
  // It can be handed Sunrise. The Live Activity advances itself natively
  // when a time passes and injects Sunrise into that walk on purpose, while
  // `adhanActionEnabled` — computed in JS at sync time — does not get
  // recomputed, so the button survives the hop pointing at Sunrise.
  it('un-muting a prayer restores the adhan channel', async () => {
    await adhanMuteToggleTask({
      epoch: Date.now() + 60_000,
      name: 'Dhuhr',
      muted: false,
      adhanChannelId: 'prayer-times-adhan-makkah',
      adhanSoundId: 'adhan_makkah',
      defaultChannelId: 'prayer-times-default',
    });
    const n = (notifee.createTriggerNotification as jest.Mock).mock
      .calls[0][0] as any;
    expect(n.android.channelId).toBe('prayer-times-adhan-makkah');
    expect(n.data.usesAdhan).toBe('1');
  });

  it.each(['Sunrise', 'Midnight', 'Lastthird'])(
    'un-muting %s does not, whatever it was handed',
    async name => {
      await adhanMuteToggleTask({
        epoch: Date.now() + 60_000,
        name,
        muted: false,
        // Exactly what the receiver sends: the adhan channel and sound of
        // the moment, with nothing about them saying "not for this one".
        adhanChannelId: 'prayer-times-adhan-makkah',
        adhanSoundId: 'adhan_makkah',
        defaultChannelId: 'prayer-times-default',
      });
      const n = (notifee.createTriggerNotification as jest.Mock).mock
        .calls[0][0] as any;
      expect(n.android.channelId).toBe('prayer-times-default');
      expect(n.data.usesAdhan).toBe('0');
      expect(n.data.adhanSound).toBe('default');
    },
  );
});
