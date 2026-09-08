/**
 * Al-Kahf on Friday, Al-Mulk at night — issue #36.
 *
 * The scheduling is the part worth testing without a notification system:
 * a trigger in the past is delivered the instant it is created, so a
 * resync that included "today at 09:00" at 10:00 would re-deliver the
 * reminder somebody read an hour ago; and a weekly reminder that skips
 * today's Friday because the hour has not come yet is a week of silence.
 */
import {
  KAHF,
  MULK,
  reminderTimes,
  SURAH_REMINDER_CHANNEL_ID,
} from '../src/notifications/surahReminders';
import {
  notificationRoute,
  ROUTE_SURAH,
} from '../src/notifications/notificationRoute';

jest.mock('../src/quran/quranState', () => ({
  hydrateQuranState: jest.fn(async () => {}),
  getQuranState: jest.fn(() => ({ lastRead: { mode: mockMode } })),
  activeKhatmah: jest.fn(() => null),
}));
let mockMode = 'withTranslation';

/** A Wednesday, so "the next Friday" is two days out and unambiguous. */
const WED_10AM = new Date(2026, 8, 9, 10, 0, 0);

describe('the Friday reminder', () => {
  it('lands on Fridays and nothing else', () => {
    const times = reminderTimes({
      now: WED_10AM,
      hour: 9,
      minute: 0,
      weekly: true,
      count: 4,
    });
    expect(times).toHaveLength(4);
    for (const t of times) expect(t.getDay()).toBe(5);
    // A week apart, every time.
    for (let i = 1; i < times.length; i++) {
      const days = Math.round(
        (times[i].getTime() - times[i - 1].getTime()) / 86400000,
      );
      expect(days).toBe(7);
    }
  });

  it('keeps today’s Friday while the hour is still ahead', () => {
    const fridayMorning = new Date(2026, 8, 11, 7, 0, 0);
    const [first] = reminderTimes({
      now: fridayMorning,
      hour: 9,
      minute: 0,
      weekly: true,
      count: 2,
    });
    expect(first.getDate()).toBe(11);
    expect(first.getHours()).toBe(9);
  });

  it('drops today’s Friday once the hour has passed', () => {
    // Otherwise the resync re-delivers a reminder already read.
    const fridayEvening = new Date(2026, 8, 11, 21, 0, 0);
    const [first] = reminderTimes({
      now: fridayEvening,
      hour: 9,
      minute: 0,
      weekly: true,
      count: 2,
    });
    expect(first.getDate()).toBe(18);
  });
});

describe('the nightly reminder', () => {
  it('is every day, starting with the next one still ahead', () => {
    const times = reminderTimes({
      now: WED_10AM,
      hour: 22,
      minute: 0,
      weekly: false,
      count: 14,
    });
    expect(times).toHaveLength(14);
    expect(times[0].getDate()).toBe(9);
    expect(times[0].getHours()).toBe(22);
    for (let i = 1; i < times.length; i++) {
      const days = Math.round(
        (times[i].getTime() - times[i - 1].getTime()) / 86400000,
      );
      expect(days).toBe(1);
    }
  });

  it('starts tomorrow when tonight is already gone', () => {
    const lateNight = new Date(2026, 8, 9, 23, 30, 0);
    const [first] = reminderTimes({
      now: lateNight,
      hour: 22,
      minute: 0,
      weekly: false,
      count: 3,
    });
    expect(first.getDate()).toBe(10);
  });

  it('never returns a moment in the past', () => {
    for (const hour of [0, 9, 10, 22, 23]) {
      for (const weekly of [true, false]) {
        for (const t of reminderTimes({
          now: WED_10AM,
          hour,
          minute: 0,
          weekly,
          count: 5,
        })) {
          expect(t.getTime()).toBeGreaterThan(WED_10AM.getTime());
        }
      }
    }
  });
});

describe('tapping one opens the surah', () => {
  afterEach(() => {
    mockMode = 'withTranslation';
  });

  it('opens Al-Kahf and Al-Mulk at their first ayah', async () => {
    expect(
      await notificationRoute({
        data: { route: ROUTE_SURAH, surah: String(KAHF) },
      } as never),
    ).toBe('mihrab://read/18?scrollToAyah=1');
    expect(
      await notificationRoute({
        data: { route: ROUTE_SURAH, surah: String(MULK) },
      } as never),
    ).toBe('mihrab://read/67?scrollToAyah=1');
  });

  it('opens the muṣḥaf at the page the surah begins on', async () => {
    // Most surahs start partway down a page — Al-Kahf begins two thirds
    // of the way down 293 — so this is a lookup, not a page whose start
    // names the surah.
    mockMode = 'mushaf';
    const url = await notificationRoute({
      data: { route: ROUTE_SURAH, surah: String(KAHF) },
    } as never);
    expect(url).toMatch(/^mihrab:\/\/read\/18\?initialPage=\d+$/);
    expect(url).not.toContain('initialPage=1&');
    expect(url).toBe('mihrab://read/18?initialPage=293');
  });

  it('has a channel of its own, not the adhan’s', () => {
    // These are reading reminders. Arriving in the adhan's channel would
    // put them on the adhan's sound and the adhan's importance.
    expect(SURAH_REMINDER_CHANNEL_ID).not.toContain('adhan');
    expect(SURAH_REMINDER_CHANNEL_ID).toBe('prayer_app_surah_reminders');
  });
});
