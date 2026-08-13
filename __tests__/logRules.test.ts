/**
 * The two rules the Log screen must not get wrong, tested away from it.
 *
 * 1. WHAT A DAY IS WORTH. The graph used to darken by the NUMBER of
 *    entries, so a day marked missed five times drew the darkest green on
 *    the chart — the app congratulating someone for a day they had just
 *    told it went badly. Reported as "despite what I enter it still gives
 *    the same colour, which is misleading".
 * 2. WHAT CANNOT BE LOGGED YET. Chips grey out for prayers whose time has
 *    not come, and "Mark all on time" has to obey the same rule instead of
 *    being the loophole around it.
 */
import {
  scoreByDay,
  STATUS_WEIGHT,
  type JournalEntry,
} from '../src/journal/journal';
import { minutesOfDay, upcomingPrayers } from '../src/journal/upcoming';

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

function entry(
  date: string,
  prayer: (typeof PRAYERS)[number],
  status: JournalEntry['status'],
): JournalEntry {
  return { date, prayer, status, loggedAt: `${date}T12:00:00.000Z` };
}

describe('scoreByDay', () => {
  it('gives a missed prayer no weight at all', () => {
    const day = scoreByDay([
      entry('2026-08-01', 'Fajr', 'missed'),
      entry('2026-08-01', 'Dhuhr', 'missed'),
    ]).get('2026-08-01');
    expect(day).toEqual({ kept: 0, logged: 2, missed: 2 });
  });

  it('separates "recorded" from "kept", so a bad day is not a blank one', () => {
    // The graph draws these two states differently: blank paper for a day
    // nobody opened, a mark for a day that was recorded and went badly.
    const missed = scoreByDay([entry('2026-08-01', 'Fajr', 'missed')]);
    expect(missed.get('2026-08-01')!.logged).toBe(1);
    expect(missed.get('2026-08-01')!.kept).toBe(0);
    expect(missed.get('2026-08-02')).toBeUndefined();
  });

  it('ranks on-time above late above qadha above missed', () => {
    expect(STATUS_WEIGHT['on-time']).toBeGreaterThan(STATUS_WEIGHT.late);
    expect(STATUS_WEIGHT.late).toBeGreaterThan(STATUS_WEIGHT.qadha);
    expect(STATUS_WEIGHT.qadha).toBeGreaterThan(STATUS_WEIGHT.missed);
    expect(STATUS_WEIGHT.missed).toBe(0);
  });

  it('still credits a prayer that was prayed late or made up', () => {
    // Flattening these to zero would tell a traveller who made up Dhuhr on
    // the road that the day was a write-off.
    const day = scoreByDay([
      entry('2026-08-01', 'Fajr', 'late'),
      entry('2026-08-01', 'Dhuhr', 'qadha'),
    ]).get('2026-08-01')!;
    expect(day.kept).toBeGreaterThan(0);
    expect(day.kept).toBeLessThan(2);
  });

  it('a full day on time is the top of the ramp', () => {
    const all = PRAYERS.map(p => entry('2026-08-01', p, 'on-time'));
    expect(scoreByDay(all).get('2026-08-01')).toEqual({
      kept: 5,
      logged: 5,
      missed: 0,
    });
  });

  it('never mixes two days together', () => {
    const scores = scoreByDay([
      entry('2026-08-01', 'Fajr', 'on-time'),
      entry('2026-08-02', 'Fajr', 'missed'),
    ]);
    expect(scores.get('2026-08-01')!.kept).toBe(1);
    expect(scores.get('2026-08-02')!.kept).toBe(0);
  });
});

describe('minutesOfDay', () => {
  it('reads a clock time, with or without a trailing zone', () => {
    expect(minutesOfDay('05:12')).toBe(312);
    expect(minutesOfDay('05:12 (CEST)')).toBe(312);
    expect(minutesOfDay('5:12')).toBe(312);
  });

  it('refuses anything that is not one', () => {
    expect(minutesOfDay(undefined)).toBeNull();
    expect(minutesOfDay('')).toBeNull();
    expect(minutesOfDay('soon')).toBeNull();
    expect(minutesOfDay('99:99')).toBeNull();
  });
});

describe('upcomingPrayers', () => {
  const TIMES = {
    Fajr: '03:00',
    Dhuhr: '13:00',
    Asr: '17:00',
    Maghrib: '21:00',
    Isha: '22:30',
  };
  const at = (h: number, m = 0) => new Date(2026, 7, 3, h, m, 0, 0);

  it('greys out only what has not happened yet', () => {
    expect([...upcomingPrayers(PRAYERS, TIMES, at(14), true)]).toEqual([
      'Asr',
      'Maghrib',
      'Isha',
    ]);
  });

  it('opens a prayer the minute its time arrives', () => {
    expect(upcomingPrayers(PRAYERS, TIMES, at(16, 59), true).has('Asr')).toBe(
      true,
    );
    expect(upcomingPrayers(PRAYERS, TIMES, at(17, 0), true).has('Asr')).toBe(
      false,
    );
  });

  it('greys out nothing on a day that is already over', () => {
    // A past day happened in full — every prayer on it is loggable.
    expect(upcomingPrayers(PRAYERS, TIMES, at(3), false).size).toBe(0);
  });

  it('greys out nothing when the timetable is missing', () => {
    // Older than the local cache, or logged in another city. The app's own
    // gap must not become a refusal to record the user's prayer.
    expect(upcomingPrayers(PRAYERS, undefined, at(3), true).size).toBe(0);
    expect(upcomingPrayers(PRAYERS, {}, at(3), true).size).toBe(0);
  });

  it('is everything before Fajr and nothing after Isha', () => {
    expect(upcomingPrayers(PRAYERS, TIMES, at(1), true).size).toBe(5);
    expect(upcomingPrayers(PRAYERS, TIMES, at(23), true).size).toBe(0);
  });
});
