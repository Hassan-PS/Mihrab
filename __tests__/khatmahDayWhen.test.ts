/**
 * "Finish day 5" says nothing about when day 5 is.
 *
 * A plan's day numbers only mean something beside a calendar, so the
 * button now carries the answer in parentheses. These hold what each of
 * those answers is.
 */
import { daysAway, khatmahDayWhen, formatDayWhen } from '../src/quran/khatmahDayWhen';
import { setTodaysMaghrib, _resetIslamicDay } from '../src/hijri/islamicDay';
import { khatmahBehindBy } from '../src/quran/quranState';

const t = (_k: string, o: { defaultValue: string }) => o.defaultValue;
const at = (y: number, m: number, d: number, h = 12) =>
  new Date(y, m, d, h).getTime();

describe('when a khatmah day falls due', () => {
  const started = at(2026, 8, 1); // Tue 1 Sep 2026

  it('calls the day in hand today', () => {
    expect(khatmahDayWhen(started, 1, at(2026, 8, 1))).toEqual({ kind: 'today' });
  });

  it('calls anything overdue today too, not the day it slipped', () => {
    // A reader a week behind is not helped by being told "Monday".
    expect(khatmahDayWhen(started, 1, at(2026, 8, 9))).toEqual({ kind: 'today' });
    expect(khatmahDayWhen(started, 3, at(2026, 8, 20))).toEqual({ kind: 'today' });
  });

  it('gives tomorrow its own word', () => {
    expect(khatmahDayWhen(started, 2, at(2026, 8, 1))).toEqual({
      kind: 'tomorrow',
    });
  });

  it('names the weekday for the rest of the week ahead', () => {
    const w = khatmahDayWhen(started, 5, at(2026, 8, 1));
    expect(w.kind).toBe('weekday');
    expect(formatDayWhen(w, t, 'en-GB')).toBe('Saturday');
  });

  it('falls back to a date once a weekday would not place it', () => {
    const w = khatmahDayWhen(started, 20, at(2026, 8, 1));
    expect(w.kind).toBe('date');
    // The month's own short form, whatever the platform's CLDR calls it.
    expect(formatDayWhen(w, t, 'en-GB')).toMatch(/^20 Sept?$/);
  });

  it('counts days, not hours — 23:59 and 00:01 are different days', () => {
    expect(daysAway(at(2026, 8, 2, 0), at(2026, 8, 1, 23))).toBe(1);
    expect(daysAway(at(2026, 8, 1, 23), at(2026, 8, 1, 0))).toBe(0);
  });

  it('says today and tomorrow in words, not as dates', () => {
    expect(formatDayWhen({ kind: 'today' }, t, 'en-GB')).toBe('today');
    expect(formatDayWhen({ kind: 'tomorrow' }, t, 'en-GB')).toBe('tomorrow');
  });
});

/**
 * ONE TODAY, NOT TWO (2026-09-20, groundwork for the deadline plan).
 *
 * The khatmah's own day rolls at maghrib for a reader who asked for that,
 * and every function that decides WHICH portion is today's goes through
 * that key. This file decided what to CALL the due date and used civil
 * midnight, so for the hours between maghrib and midnight the card
 * offered to "finish day 9 (tomorrow)" for the day the rest of the app
 * had already begun.
 */
describe('after maghrib, today is the day the rest of the app is on', () => {
  const evening = at(2026, 8, 18, 20); // Fri 18 Sep 2026, 20:00
  const maghrib = new Date(at(2026, 8, 18, 19)); // an hour earlier
  const started = at(2026, 8, 10, 9);

  afterEach(() => {
    setTodaysMaghrib(null);
    _resetIslamicDay();
  });

  it('calls the civil tomorrow "today" once maghrib has passed', () => {
    setTodaysMaghrib(maghrib);
    // Day 10 of a plan begun on the 10th falls on the 19th by the
    // calendar — and it is the day in hand from maghrib on the 18th.
    expect(khatmahDayWhen(started, 10, evening)).toEqual({ kind: 'today' });
    expect(daysAway(at(2026, 8, 19, 12), evening)).toBe(0);
  });

  it('and the civil today is already behind, which reads as today as well', () => {
    setTodaysMaghrib(maghrib);
    expect(khatmahDayWhen(started, 9, evening)).toEqual({ kind: 'today' });
  });

  it('leaves the rest of the week where the calendar has it', () => {
    setTodaysMaghrib(maghrib);
    expect(khatmahDayWhen(started, 11, evening)).toEqual({ kind: 'tomorrow' });
    expect(khatmahDayWhen(started, 12, evening).kind).toBe('weekday');
  });

  it('and with no maghrib published, nothing moves', () => {
    expect(khatmahDayWhen(started, 10, evening)).toEqual({ kind: 'tomorrow' });
    expect(daysAway(at(2026, 8, 19, 12), evening)).toBe(1);
  });
});

/**
 * AND THE SAME TODAY FOR "BEHIND BY" (issue #53's first half).
 *
 * `khatmahBehindBy` counted a rolling twenty-four hours from the instant
 * the plan was created — a boundary used nowhere else in the app. A plan
 * begun at 23:00 gained a day at 23:00 each night: an hour before the day
 * pill, and hours after maghrib for a reader whose day starts there.
 */
describe('being behind is counted in days, not in rolling hours', () => {
  const start = at(2026, 8, 1, 23); // begun at 23:00 on 1 Sep
  const plan = {
    id: 'k',
    startedAt: start,
    targetDays: 30,
    pagesRead: 0,
    completedAt: null,
  };

  it('is not behind an hour after it was made, even past midnight', () => {
    expect(khatmahBehindBy(plan, at(2026, 8, 1, 23) + 30 * 60_000, 'hafs')).toBe(0);
    // 00:30 the next night used to be "a day elapsed"; it is the same day
    // to everything else in the app, and now to this as well… but the
    // calendar day HAS turned, so one day has passed. What must not
    // happen is the jump at 23:00 the night before.
    expect(khatmahBehindBy(plan, at(2026, 8, 2, 22), 'hafs')).toBe(
      khatmahBehindBy(plan, at(2026, 8, 2, 23) + 60_000, 'hafs'),
    );
  });

  it('counts one day per calendar day, whatever hour it is', () => {
    const oneDay = khatmahBehindBy(plan, at(2026, 8, 2, 9), 'hafs');
    const sameDayLater = khatmahBehindBy(plan, at(2026, 8, 2, 21), 'hafs');
    expect(sameDayLater).toBe(oneDay);
    expect(khatmahBehindBy(plan, at(2026, 8, 3, 9), 'hafs')).toBeGreaterThan(oneDay);
  });
});
