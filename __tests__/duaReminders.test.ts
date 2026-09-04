/**
 * The adhkār reminders, and the arithmetic that decides they are honest.
 *
 * These two notifications name their own window — "after Fajr, before
 * sunrise" and "after ʿAṣr, before sunset" — so one arriving outside it
 * is not a slightly-off reminder, it is a false statement. Which makes
 * the interesting cases the ones where the window is small or absent:
 * a Norwegian June has minutes between Fajr and sunrise, and a day with
 * no true dawn reports times that cross over each other entirely.
 */
import {
  clockMinutes,
  reminderMinute,
  reminderAt,
  OFFSET_MINUTES,
} from '../src/notifications/duaReminders';
import type { TimingsMap } from '../src/types/prayer';

const hm = (h: number, m: number) => h * 60 + m;

describe('reading a time off the timings map', () => {
  it('takes the clock and ignores whatever follows it', () => {
    expect(clockMinutes('05:12')).toBe(hm(5, 12));
    expect(clockMinutes('05:12 (CEST)')).toBe(hm(5, 12));
    expect(clockMinutes(' 5:07')).toBe(hm(5, 7));
  });

  it('refuses anything it cannot read rather than guessing', () => {
    // A reminder at the wrong hour is worse than no reminder.
    expect(clockMinutes(undefined)).toBeNull();
    expect(clockMinutes('')).toBeNull();
    expect(clockMinutes('soon')).toBeNull();
    expect(clockMinutes('25:00')).toBeNull();
    expect(clockMinutes('05:99')).toBeNull();
  });
});

describe('where in the window the reminder lands', () => {
  it('sits the offset past the opening prayer on an ordinary day', () => {
    // Fajr 04:30, sunrise 06:10 — an hour and forty of room.
    expect(reminderMinute(hm(4, 30), hm(6, 10))).toBe(
      hm(4, 30) + OFFSET_MINUTES,
    );
  });

  it('gives way to the window when the window is the smaller number', () => {
    // 60° north in June: Fajr 01:40, sunrise 01:55. The fixed offset would
    // put "before sunrise" fifteen minutes after sunrise.
    const at = reminderMinute(hm(1, 40), hm(1, 55));
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThan(hm(1, 40));
    expect(at!).toBeLessThan(hm(1, 55));
  });

  it('says nothing at all when nothing fits', () => {
    // Four minutes of window: any reminder is either during the prayer
    // or after the window shuts.
    expect(reminderMinute(hm(2, 0), hm(2, 4))).toBeNull();
  });

  it('refuses a window that closes before it opens', () => {
    // Real, at high latitude: a day with no true dawn.
    expect(reminderMinute(hm(6, 0), hm(5, 0))).toBeNull();
    expect(reminderMinute(hm(6, 0), hm(6, 0))).toBeNull();
  });

  it('refuses a window with a missing end', () => {
    expect(reminderMinute(hm(4, 30), null)).toBeNull();
    expect(reminderMinute(null, hm(6, 10))).toBeNull();
  });
});

describe('the two windows come from the right prayers', () => {
  const day = new Date(2026, 8, 4);
  const timings = {
    Fajr: '04:30',
    Sunrise: '06:10',
    Dhuhr: '13:00',
    Asr: '16:30',
    Maghrib: '19:50',
    Isha: '21:53',
  } as unknown as TimingsMap;

  it('morning runs Fajr → sunrise', () => {
    const at = reminderAt('morning', day, timings);
    expect(at).not.toBeNull();
    expect(at!.getHours()).toBe(4);
    expect(at!.getMinutes()).toBe(50);
    expect(at!.getDate()).toBe(4);
  });

  it('evening runs Asr → Maghrib, which is sunset', () => {
    const at = reminderAt('evening', day, timings);
    expect(at).not.toBeNull();
    expect(at!.getHours()).toBe(16);
    expect(at!.getMinutes()).toBe(50);
  });

  it('lands on the day it was asked about', () => {
    const later = new Date(2026, 8, 9);
    expect(reminderAt('morning', later, timings)!.getDate()).toBe(9);
  });

  it('gives nothing for a day with no times', () => {
    expect(reminderAt('morning', day, undefined)).toBeNull();
    expect(
      reminderAt('evening', day, { Fajr: '04:30' } as unknown as TimingsMap),
    ).toBeNull();
  });
});

describe('the reminder is inside its own window, always', () => {
  it('holds across every window length worth having', () => {
    // The property the feature rests on, checked rather than reasoned:
    // whenever a time is produced, it is strictly inside the window.
    for (let open = 0; open < 24 * 60; open += 37) {
      for (const width of [1, 3, 5, 6, 9, 12, 20, 21, 45, 90, 200]) {
        const close = open + width;
        const at = reminderMinute(open, close);
        if (at == null) continue;
        expect(at).toBeGreaterThan(open);
        expect(at).toBeLessThan(close);
      }
    }
  });
});
