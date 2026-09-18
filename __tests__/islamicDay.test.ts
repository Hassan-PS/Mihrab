/**
 * The day begins at maghrib — one definition, for the five that were.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  __resetQuranStateForTests,
  activeKhatmah,
  getQuranState,
  recordKhatmahPageTurn,
  startKhatmah,
} from '../src/quran/quranState';
import { pagesReadToday } from '../src/quran/quranCardState';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import {
  _resetIslamicDay,
  civilDayKey,
  islamicCivilDateAt,
  islamicDayKey,
  islamicDayKeyAt,
  setTodaysMaghrib,
  islamicDayVersion,
  subscribeIslamicDay,
  todaysMaghrib,
} from '../src/hijri/islamicDay';

const at = (iso: string) => new Date(iso);
/** Maghrib on the 18th, local time. */
const maghrib18 = at('2026-09-18T18:45:00');

beforeEach(() => _resetIslamicDay());

describe('which civil date the Islamic day is keyed by', () => {
  it('is today, before maghrib', () => {
    expect(islamicDayKeyAt(at('2026-09-18T12:00:00'), maghrib18)).toBe('2026-09-18');
  });

  it('and tomorrow, after it — tonight belongs to the day beginning', () => {
    // Tarawih at 21:00 and tomorrow's fajr are one Islamic day, which is
    // the whole reason for having the boundary.
    expect(islamicDayKeyAt(at('2026-09-18T21:00:00'), maghrib18)).toBe('2026-09-19');
  });

  it('the boundary is maghrib itself, inclusive', () => {
    expect(islamicDayKeyAt(at('2026-09-18T18:44:59'), maghrib18)).toBe('2026-09-18');
    expect(islamicDayKeyAt(at('2026-09-18T18:45:00'), maghrib18)).toBe('2026-09-19');
  });

  it('and the small hours are the back half of the day that began last night', () => {
    // 01:00 on the 19th: maghrib on the 19th has not passed, so no shift —
    // and the key is the 19th, which is the same day the tarawih before
    // midnight was keyed to. One sitting, one key, across midnight.
    const maghrib19 = at('2026-09-19T18:43:00');
    expect(islamicDayKeyAt(at('2026-09-19T01:00:00'), maghrib19)).toBe('2026-09-19');
    expect(islamicDayKeyAt(at('2026-09-18T21:00:00'), maghrib18)).toBe('2026-09-19');
  });

  it('crosses a month and a year without special-casing either', () => {
    expect(islamicDayKeyAt(at('2026-09-30T20:00:00'), at('2026-09-30T18:20:00')))
      .toBe('2026-10-01');
    expect(islamicDayKeyAt(at('2026-12-31T20:00:00'), at('2026-12-31T15:30:00')))
      .toBe('2027-01-01');
  });
});

describe('when maghrib is not known', () => {
  it('the answer is the civil date — exactly what every caller did before', () => {
    expect(islamicDayKeyAt(at('2026-09-18T21:00:00'), null)).toBe('2026-09-18');
  });

  it('and a maghrib for another day is declined, not applied to this one', () => {
    // A stale publication — the app left open across midnight, say —
    // must not shift a day it cannot speak for.
    expect(islamicDayKeyAt(at('2026-09-19T21:00:00'), maghrib18)).toBe('2026-09-19');
  });

  it('so the fallback is always the old behaviour, never a guess', () => {
    const noon = at('2026-09-18T12:00:00');
    expect(islamicDayKeyAt(noon, null)).toBe(civilDayKey(noon));
  });
});

describe('the published instant', () => {
  it('is nothing until somebody knows it', () => {
    expect(todaysMaghrib()).toBeNull();
    expect(islamicDayKey(at('2026-09-18T21:00:00'))).toBe('2026-09-18');
  });

  it('and shifts the day once it is set', () => {
    setTodaysMaghrib(maghrib18);
    expect(islamicDayKey(at('2026-09-18T21:00:00'))).toBe('2026-09-19');
  });

  it('tells its subscribers only when it actually changes', () => {
    let calls = 0;
    const off = subscribeIslamicDay(() => (calls += 1));
    setTodaysMaghrib(maghrib18);
    expect(calls).toBe(1);
    setTodaysMaghrib(new Date(maghrib18)); // same instant, new object
    expect(calls).toBe(1);
    setTodaysMaghrib(null);
    expect(calls).toBe(2);
    off();
  });

  it('keeps its own copy, so a caller mutating the date cannot move the day', () => {
    const mutable = new Date(maghrib18);
    setTodaysMaghrib(mutable);
    mutable.setHours(2);
    expect(islamicDayKey(at('2026-09-18T21:00:00'))).toBe('2026-09-19');
  });
});

describe('the civil date a Hijri label should convert', () => {
  it('moves with the boundary, so the date on screen turns at sunset', () => {
    expect(civilDayKey(islamicCivilDateAt(at('2026-09-18T12:00:00'), maghrib18)))
      .toBe('2026-09-18');
    expect(civilDayKey(islamicCivilDateAt(at('2026-09-18T20:00:00'), maghrib18)))
      .toBe('2026-09-19');
  });

  it('and never mutates what it was given', () => {
    const noon = at('2026-09-18T12:00:00');
    islamicCivilDateAt(noon, maghrib18);
    expect(noon.toISOString()).toBe(at('2026-09-18T12:00:00').toISOString());
  });
});

describe('the khatmah day follows the boundary', () => {
  it('a tarawih sitting that crosses midnight is ONE day', () => {
    // The bug that has nothing to do with the calendar: the card said
    // "today's reading done" at 23:59 and offered a fresh empty portion at
    // 00:01, in the middle of the same sitting.
    setTodaysMaghrib(maghrib18);
    const nineteen = islamicDayKey(at('2026-09-18T21:00:00'));
    setTodaysMaghrib(at('2026-09-19T18:43:00'));
    const afterMidnight = islamicDayKey(at('2026-09-19T01:00:00'));
    expect(afterMidnight).toBe(nineteen);
  });

  it('and the evening is the day beginning, not the one ending', () => {
    setTodaysMaghrib(maghrib18);
    expect(islamicDayKey(at('2026-09-18T17:00:00'))).toBe('2026-09-18');
    expect(islamicDayKey(at('2026-09-18T19:30:00'))).toBe('2026-09-19');
  });

  it('the Qur’an store asks this file and nothing else', () => {
    // It had its own copy of the day, as four other places did. The store
    // stays pure — no location, no timings — because the boundary is
    // published to it rather than computed in it.
    const src = readFileSync(
      join(__dirname, '..', 'src', 'quran', 'quranState.ts'),
      'utf8',
    );
    expect(src).toMatch(/return islamicDayKey\(new Date\(now\)\)/);
    expect(src).not.toMatch(/String\(d\.getMonth\(\) \+ 1\)/);
    const card = readFileSync(
      join(__dirname, '..', 'src', 'quran', 'quranCardState.ts'),
      'utf8',
    );
    expect(card).toMatch(/return islamicDayKey\(new Date\(now\)\)/);
  });

  it('and somebody at app root publishes it', () => {
    // Not a screen: the bottom tabs are lazy, so a publisher on Today
    // would leave the boundary unset until Today had been opened.
    const root = readFileSync(
      join(__dirname, '..', 'src', 'widget', 'republishWidgetPayload.ts'),
      'utf8',
    );
    expect(root).toMatch(/setTodaysMaghrib\(/);
    expect(root).toMatch(/combineLocalDateAndTime\(now, window\[0\]\.Maghrib\)/);
  });
});

describe('what the boundary deliberately does NOT move', () => {
  it('the prayer table still turns after the last time of the day', () => {
    // Isha, or the First Third when it is on — `dayRollover`, untouched.
    // The table is not a "what day is it" question and must not be made
    // into one: tomorrow's times after maghrib would be four hours early.
    const card = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'home', 'TodayCard.tsx'),
      'utf8',
    );
    expect(card).toMatch(/lastTimeOfDay\(week\[0\] \?\? \{\}, startOfLocalDay\(new Date\(\)\)\)/);
    const rollover = readFileSync(
      join(__dirname, '..', 'src', 'prayer', 'dayRollover.ts'),
      'utf8',
    );
    expect(rollover).not.toMatch(/islamicDay/);
  });

  it('and the heading over it names the card\u2019s day, all three parts alike', () => {
    /**
     * The one that bit: shifting the Hijri part at maghrib made it
     * disagree with the weekday beside it, and then DOUBLE-COUNT once the
     * table turned — the same `dayOffset` feeds all three, so a shifted
     * base plus an offset of one read two days ahead of the times below.
     */
    const home = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'HomeScreen.tsx'),
      'utf8',
    );
    expect(home).toMatch(/formatHijriLabel\(addDays\(new Date\(\), dayOffset\)\)/);
    expect(home).not.toMatch(/islamicCivilDate/);
  });

  it('nor the widget, which sits over the same day\u2019s times', () => {
    const extras = readFileSync(
      join(__dirname, '..', 'src', 'widget', 'collectWidgetExtras.ts'),
      'utf8',
    );
    expect(extras).toMatch(/buildHijriBlock\(now\)/);
  });

  it('nor the Log, nor anything it writes', () => {
    // Prayers, fasting and the sunnah log are keyed to EVENTS — "Isha,
    // Sep 18" is unambiguous however days are counted — and the screen is
    // built on that keying: the day swipe, the month grids, the streak
    // walk, and the notification's own targetDate.
    for (const f of [
      'src/screens/LogScreen.tsx',
      'src/journal/sunnah.ts',
      'src/journal/journal.ts',
      'src/practice/practiceStore.ts',
      'src/screens/FastingScreen.tsx',
    ]) {
      expect(readFileSync(join(__dirname, '..', f), 'utf8')).not.toMatch(
        /islamicDay/,
      );
    }
  });

  it('but an Islamic EVENT is about now, and Laylat al-Qadr is a night', () => {
    // An odd night of the last ten that only became "today" at midnight
    // would light up five hours after it began.
    const hook = readFileSync(
      join(__dirname, '..', 'src', 'hijri', 'useTodaysIslamicEvent.ts'),
      'utf8',
    );
    expect(hook).toMatch(/gregorianToHijri\(islamicCivilDate\(now\)\)/);
  });
});

describe('the boundary can fail, and nothing else may fail with it', () => {
  it('an unreadable maghrib is no maghrib, not a boundary that never matches', () => {
    setTodaysMaghrib(new Date('not a time'));
    expect(todaysMaghrib()).toBeNull();
    expect(islamicDayKey(at('2026-09-18T21:00:00'))).toBe('2026-09-18');
  });

  it('and it wakes nobody by being unequal to itself', () => {
    let calls = 0;
    const off = subscribeIslamicDay(() => (calls += 1));
    setTodaysMaghrib(new Date('not a time'));
    setTodaysMaghrib(new Date('not a time'));
    expect(calls).toBe(0);
    off();
  });

  it('publishing is wrapped where it runs, so it cannot take the widget down', () => {
    // `extractClock` THROWS on a clock it cannot read, and this call sits
    // on the path that keeps every widget current — inside a try whose
    // catch returns false and logs. A day boundary is worth having and not
    // worth silently stopping the widget for.
    const root = readFileSync(
      join(__dirname, '..', 'src', 'widget', 'republishWidgetPayload.ts'),
      'utf8',
    );
    expect(root).toMatch(
      /try \{\s*setTodaysMaghrib\([\s\S]*?\} catch \{[\s\S]*?setTodaysMaghrib\(null\);/,
    );
  });
});

describe('a night of Ramadan, end to end', () => {
  const AT = (iso: string) => new Date(iso).getTime();
  const plan = () => activeKhatmah(getQuranState())!;

  afterEach(() => {
    if (jest.isMockFunction(Date.now)) (Date.now as jest.Mock).mockRestore();
  });

  it('afternoon, tarawih and qiyam: two days, and the sitting is not split', () => {
    __resetQuranStateForTests();
    setTodaysMaghrib(at('2026-09-18T18:45:00'));

    // Afternoon of the 18th — the Islamic day that began last night.
    jest.spyOn(Date, 'now').mockReturnValue(AT('2026-09-18T15:00:00'));
    startKhatmah(30);
    recordKhatmahPageTurn(1, 4);
    expect(plan().dayStartDate).toBe('2026-09-18');
    expect(pagesReadToday(plan(), AT('2026-09-18T15:00:00'))).toBe(3);

    // Tarawih, same calendar day, AFTER maghrib: a new Islamic day, so the
    // afternoon's pages are yesterday's and today starts again.
    jest.spyOn(Date, 'now').mockReturnValue(AT('2026-09-18T21:00:00'));
    recordKhatmahPageTurn(4, 7);
    expect(plan().dayStartDate).toBe('2026-09-19');
    expect(pagesReadToday(plan(), AT('2026-09-18T21:00:00'))).toBe(3);

    // Qiyam, past midnight, STILL the same Islamic day. This is the bug
    // that had nothing to do with the calendar: the day used to turn here,
    // in the middle of the sitting, and the six pages read since maghrib
    // became three.
    setTodaysMaghrib(at('2026-09-19T18:43:00'));
    jest.spyOn(Date, 'now').mockReturnValue(AT('2026-09-19T01:00:00'));
    recordKhatmahPageTurn(7, 10);
    expect(plan().dayStartDate).toBe('2026-09-19');
    expect(pagesReadToday(plan(), AT('2026-09-19T01:00:00'))).toBe(6);
  });

  it('and with no maghrib published it behaves exactly as it always did', () => {
    _resetIslamicDay();
    __resetQuranStateForTests();
    jest.spyOn(Date, 'now').mockReturnValue(AT('2026-09-18T21:00:00'));
    startKhatmah(30);
    recordKhatmahPageTurn(1, 4);
    expect(plan().dayStartDate).toBe('2026-09-18'); // the civil day
  });
});

describe('opt-in, and off by default', () => {
  it('the setting exists and ships off', () => {
    const types = readFileSync(
      join(__dirname, '..', 'src', 'settings', 'types.ts'),
      'utf8',
    );
    expect(types).toMatch(/islamicDayFromMaghrib: boolean;/);
    expect(types).toMatch(/islamicDayFromMaghrib: false,/);
    expect(DEFAULT_SETTINGS.islamicDayFromMaghrib).toBe(false);
  });

  it('one gate, at the only place that publishes the boundary', () => {
    // Off is not a code path — it is the absence of one. Every consumer
    // already treats an absent maghrib as "use the calendar day", because
    // that is the fallback for a device with no prayer times, so the
    // setting needs no second reading anywhere else.
    const root = readFileSync(
      join(__dirname, '..', 'src', 'widget', 'republishWidgetPayload.ts'),
      'utf8',
    );
    expect(root).toMatch(/settings\.islamicDayFromMaghrib && window\[0\]\.Maghrib/);
    // And nothing else in the app reads the setting, or there would be two
    // answers to one question.
    const readers = [
      'src/quran/quranState.ts',
      'src/quran/quranCardState.ts',
      'src/hijri/islamicDay.ts',
      'src/hijri/useTodaysIslamicEvent.ts',
    ];
    for (const f of readers) {
      expect(readFileSync(join(__dirname, '..', f), 'utf8')).not.toMatch(
        /islamicDayFromMaghrib/,
      );
    }
  });

  it('and with it off the khatmah day is the calendar day', () => {
    // Which is the same thing as nothing being published — proved above
    // in "with no maghrib published it behaves exactly as it always did".
    _resetIslamicDay();
    expect(islamicDayKey(at('2026-09-18T21:00:00'))).toBe('2026-09-18');
  });

  it('and the switch is in Settings → Quran, where the khatmah is', () => {
    const card = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'settings', 'QuranCard.tsx'),
      'utf8',
    );
    expect(card).toContain('testID="settings-islamic-day"');
    expect(card).toMatch(/updateSettings\(\{ islamicDayFromMaghrib: next \}\)/);
  });
});

describe('waking at the boundary', () => {
  /**
   * The defect this covers, found on a simulator: with the setting on
   * and the app left open on the Qur'an tab, maghrib passed and the card
   * still read "day 5 — today's reading done". The key was right; the
   * glass had simply never been told, because the stored maghrib does
   * not change when maghrib arrives.
   */
  beforeEach(() => {
    jest.useFakeTimers();
    _resetIslamicDay();
  });
  afterEach(() => {
    _resetIslamicDay();
    jest.useRealTimers();
  });

  it('wakes listeners when the published maghrib passes', () => {
    jest.setSystemTime(new Date('2026-09-18T12:00:00'));
    let calls = 0;
    const off = subscribeIslamicDay(() => (calls += 1));

    setTodaysMaghrib(new Date('2026-09-18T18:23:00'));
    expect(calls).toBe(1); // the publish itself
    expect(islamicDayKey()).toBe('2026-09-18');

    // A minute before: nothing has happened yet.
    jest.setSystemTime(new Date('2026-09-18T18:22:00'));
    jest.advanceTimersByTime(6 * 60 * 60 * 1000 + 22 * 60 * 1000);
    expect(calls).toBe(1);

    // And the instant it passes.
    jest.setSystemTime(new Date('2026-09-18T18:23:01'));
    jest.advanceTimersByTime(61 * 1000);
    expect(calls).toBe(2);
    expect(islamicDayKey()).toBe('2026-09-19');

    off();
  });

  it('bumps the version so a screen can re-render on it', () => {
    jest.setSystemTime(new Date('2026-09-18T12:00:00'));
    const before = islamicDayVersion();
    setTodaysMaghrib(new Date('2026-09-18T18:23:00'));
    expect(islamicDayVersion()).toBe(before + 1);
    jest.setSystemTime(new Date('2026-09-18T18:23:01'));
    jest.advanceTimersByTime(7 * 60 * 60 * 1000);
    expect(islamicDayVersion()).toBe(before + 2);
  });

  it('schedules nothing for a maghrib already past', () => {
    jest.setSystemTime(new Date('2026-09-18T20:00:00'));
    let calls = 0;
    const off = subscribeIslamicDay(() => (calls += 1));
    setTodaysMaghrib(new Date('2026-09-18T18:23:00'));
    expect(calls).toBe(1);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(calls).toBe(1); // no second wake invented
    off();
  });

  it('replaces the pending wake when a new maghrib is published', () => {
    jest.setSystemTime(new Date('2026-09-18T12:00:00'));
    let calls = 0;
    const off = subscribeIslamicDay(() => (calls += 1));
    setTodaysMaghrib(new Date('2026-09-18T18:23:00'));
    setTodaysMaghrib(new Date('2026-09-18T19:00:00'));
    expect(calls).toBe(2); // two publishes

    // The first instant must no longer fire: one timer, not a pile.
    jest.setSystemTime(new Date('2026-09-18T18:30:00'));
    jest.advanceTimersByTime(6 * 60 * 60 * 1000 + 30 * 60 * 1000);
    expect(calls).toBe(2);

    jest.setSystemTime(new Date('2026-09-18T19:00:01'));
    jest.advanceTimersByTime(31 * 60 * 1000);
    expect(calls).toBe(3);
    off();
  });

  it('clears the wake when the boundary is switched off', () => {
    jest.setSystemTime(new Date('2026-09-18T12:00:00'));
    let calls = 0;
    const off = subscribeIslamicDay(() => (calls += 1));
    setTodaysMaghrib(new Date('2026-09-18T18:23:00'));
    setTodaysMaghrib(null); // the user turned the setting off
    expect(calls).toBe(2);
    jest.setSystemTime(new Date('2026-09-18T19:00:00'));
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(calls).toBe(2);
    off();
  });
});
