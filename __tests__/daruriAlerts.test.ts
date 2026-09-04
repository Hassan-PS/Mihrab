/**
 * The Mālikī second-time alerts — issue #19.
 *
 * The thing being defended here is restraint. Five boundaries is five
 * more notifications a day on top of the prayers, the advance reminders
 * and whichever of Sunrise and the night marks are on; an app that
 * started firing all of them because one switch was flipped would be
 * teaching people to swipe its notifications away, which costs more than
 * these are worth. So: nothing fires unless it was asked for, by name.
 *
 * The other half is that a boundary is not a prayer. It never carries the
 * adhan, whatever adhan the user has chosen for the five.
 */
jest.unmock('adhan');

import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import { buildDaruriAlertEvents, coerceDaruriAlerts } from '../src/prayer/daruriTimes';
import type { TimingsMap } from '../src/types/prayer';

const ORIGINAL_OS = Platform.OS;
const NOW = new Date(2026, 5, 14, 10, 0, 0);

/** A day with all five boundaries already injected, as the card carries them. */
const today: TimingsMap = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
  FajrDaruri: '06:05',
  DhuhrDaruri: '15:00',
  AsrDaruri: '17:20',
  MaghribDaruri: '20:00',
  IshaDaruri: '21:40',
};

const calls = () =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls.map(c => c[0]);
const daruriCalls = () =>
  calls().filter(n => String(n.id).includes('daruri-'));

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

describe('nothing fires unless it was asked for', () => {
  it('schedules no second-time alert by default', async () => {
    await sync();
    expect(daruriCalls()).toHaveLength(0);
  });

  it('schedules none when the list is empty', async () => {
    await sync({ daruriAlerts: [], daruriAlertMinutes: 15 });
    expect(daruriCalls()).toHaveLength(0);
  });

  /** One chosen boundary is one alert, not five. */
  it('schedules only the boundary that was chosen', async () => {
    await sync({ daruriAlerts: ['AsrDaruri'], daruriAlertMinutes: 15 });
    const fired = daruriCalls();
    expect(fired).toHaveLength(2); // today and tomorrow
    for (const n of fired) expect(String(n.id)).toContain('AsrDaruri');
  });

  it('ignores a stored key that is not one of the five', async () => {
    await sync({ daruriAlerts: ['NotAThing', 'AsrDaruri'], daruriAlertMinutes: 15 });
    expect(daruriCalls().every(n => String(n.id).includes('AsrDaruri'))).toBe(true);
  });
});

describe('a boundary is not a prayer', () => {
  /**
   * The whole point of `isNonPrayerEvent` applied to a new kind of event:
   * the call to prayer belongs to the five, and a deadline about one is
   * not one. A user with Makkah adhan selected must not hear it twice.
   */
  it('never carries the adhan, whatever the user chose for the five', async () => {
    await sync({ daruriAlerts: ['FajrDaruri', 'AsrDaruri'], daruriAlertMinutes: 15 });
    const fired = daruriCalls();
    expect(fired.length).toBeGreaterThan(0);
    for (const n of fired) {
      expect(n.android.channelId).not.toContain('adhan');
      expect(String(n.ios?.sound ?? '')).not.toContain('adhan');
    }
    // …while the prayers themselves still do.
    const prayerAlert = calls().find(
      n => String(n.id).endsWith('-Dhuhr') && !String(n.id).includes('daruri-'),
    );
    expect(prayerAlert.android.channelId).toContain('adhan');
  });

  it('offers no log action or snooze on one', async () => {
    await sync({ daruriAlerts: ['AsrDaruri'], daruriAlertMinutes: 15 });
    for (const n of daruriCalls()) {
      expect(n.android.actions ?? []).toHaveLength(0);
    }
  });
});

describe('when it fires, and what it says', () => {
  it('fires the chosen number of minutes before the boundary', async () => {
    await sync({ daruriAlerts: ['AsrDaruri'], daruriAlertMinutes: 15 });
    const at = Number(String(daruriCalls()[0].id).split('daruri-')[1].split('-')[0]);
    const d = new Date(at);
    // ʿAṣr's boundary is 17:20; fifteen minutes earlier is 17:05.
    expect(d.getHours()).toBe(17);
    expect(d.getMinutes()).toBe(5);
  });

  it('names the prayer, not the key', async () => {
    await sync({ daruriAlerts: ['AsrDaruri'], daruriAlertMinutes: 15 });
    expect(daruriCalls()[0].title).toBe('Asr');
  });

  it('says when the window closes, in the user’s clock', async () => {
    await sync({ daruriAlerts: ['AsrDaruri'], daruriAlertMinutes: 15, hour12: true });
    expect(daruriCalls()[0].body).toContain('5:20 PM');
  });

  it('fires at the boundary itself when no warning was asked for', async () => {
    await sync({ daruriAlerts: ['AsrDaruri'], daruriAlertMinutes: 0 });
    const at = Number(String(daruriCalls()[0].id).split('daruri-')[1].split('-')[0]);
    expect(new Date(at).getHours()).toBe(17);
    expect(new Date(at).getMinutes()).toBe(20);
  });
});

describe('the event builder', () => {
  /**
   * Ishāʾ's boundary is a third of the way into the night that BEGINS on
   * its day, so at a long summer latitude it lands after local midnight
   * and belongs to tomorrow's date. The same rule `eventAt` applies to
   * `Firstthird`, which is the same instant under its other name — and
   * without it the alert would be pinned nearly a day early.
   */
  it('carries a past-midnight Ishāʾ boundary onto the next day', () => {
    const late: TimingsMap = { Maghrib: '23:10', IshaDaruri: '00:23' };
    const [ev] = buildDaruriAlertEvents(
      [late],
      new Date(2026, 5, 14, 12),
      ['IshaDaruri'],
      0,
      new Date(2026, 5, 14, 10),
    );
    expect(ev.at.getDate()).toBe(15);
    expect(ev.at.getHours()).toBe(0);
    expect(ev.at.getMinutes()).toBe(23);
  });

  it('drops anything already past', () => {
    const events = buildDaruriAlertEvents(
      [today],
      new Date(2026, 5, 14, 12),
      ['FajrDaruri', 'AsrDaruri'],
      0,
      new Date(2026, 5, 14, 12, 0, 0), // noon: Fajr's 06:05 is gone
    );
    expect(events.map(e => e.name)).toEqual(['AsrDaruri']);
  });

  it('returns them in the order they will happen', () => {
    const events = buildDaruriAlertEvents(
      [today, today],
      new Date(2026, 5, 14, 12),
      ['FajrDaruri', 'AsrDaruri', 'IshaDaruri'],
      0,
      new Date(2026, 5, 14, 0, 30),
    );
    const times = events.map(e => e.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('does not schedule the same instant twice', () => {
    const events = buildDaruriAlertEvents(
      [today, today, today],
      new Date(2026, 5, 14, 12),
      ['AsrDaruri'],
      0,
      new Date(2026, 5, 14, 0, 30),
    );
    expect(new Set(events.map(e => e.at.getTime())).size).toBe(events.length);
  });

  it('is empty when nothing was chosen', () => {
    expect(buildDaruriAlertEvents([today], NOW, [], 0, NOW)).toEqual([]);
  });
});

describe('the stored list', () => {
  it('keeps only the five, in a stable order', () => {
    expect(coerceDaruriAlerts(['AsrDaruri', 'FajrDaruri'])).toEqual([
      'FajrDaruri',
      'AsrDaruri',
    ]);
    // Same set, other order in the blob — same result, so a settings
    // write does not look like a change when it is not.
    expect(coerceDaruriAlerts(['FajrDaruri', 'AsrDaruri'])).toEqual([
      'FajrDaruri',
      'AsrDaruri',
    ]);
  });

  it('throws nothing away quietly except what it must', () => {
    expect(coerceDaruriAlerts(undefined)).toEqual([]);
    expect(coerceDaruriAlerts('AsrDaruri')).toEqual([]);
    expect(coerceDaruriAlerts([1, null, 'Asr'])).toEqual([]);
  });
});
