/**
 * What the line under a prayer says as the evening goes on — issue #38 (2).
 *
 * The reporter's case, in his words: Maghrib not logged inside its
 * preferred window; the window lapses; "no secondary countdown timer
 * appears beneath the Maghrib entry to show the remaining time until the
 * final window cutoff". The line stayed on "First time until 21:06" all
 * night. `daruriRowState` is the one function that decides the line, so
 * the whole evening is walked here.
 */
import { daruriRowState } from '../src/prayer/daruriTimes';
import type { TimingsMap } from '../src/types/prayer';

const today = {
  Fajr: '05:39',
  Sunrise: '07:05',
  Dhuhr: '13:33',
  Asr: '17:02',
  Maghrib: '19:51',
  Isha: '21:06',
  FajrDaruri: '06:20',
  DhuhrDaruri: '17:02',
  AsrDaruri: '18:55',
  MaghribDaruri: '21:06',
  IshaDaruri: '00:44',
} as unknown as TimingsMap;
const tomorrow = { ...today, Fajr: '05:40' } as unknown as TimingsMap;
const week = [today, tomorrow];
const day = new Date(2026, 8, 8);
const at = (h: number, m: number) => new Date(2026, 8, 8, h, m);
const nextDay = (h: number, m: number) => new Date(2026, 8, 9, h, m);

describe('Maghrib, unlogged', () => {
  it('names the first window while it is open', () => {
    expect(daruriRowState(week, day, 'MaghribDaruri', at(20, 0), false)).toEqual({
      phase: 'first',
      at: '21:06',
      approx: false,
    });
  });

  it('turns to the second window the moment the first closes', () => {
    expect(daruriRowState(week, day, 'MaghribDaruri', at(21, 6), false)).toEqual({
      phase: 'second',
      at: '05:40', // TOMORROW's Fajr, not today's
      approx: false,
    });
    expect(daruriRowState(week, day, 'MaghribDaruri', at(23, 59), false)?.phase).toBe(
      'second',
    );
  });

  it('goes back to stating the first boundary once the second window has closed too', () => {
    // Never null: the row keeps its line, and its height, all day.
    expect(daruriRowState(week, day, 'MaghribDaruri', nextDay(5, 40), false)).toEqual({
      phase: 'first',
      at: '21:06',
      approx: false,
    });
  });

  it('will not guess the end when tomorrow is not loaded', () => {
    expect(daruriRowState([today], day, 'MaghribDaruri', at(21, 6), false)?.phase).toBe(
      'first',
    );
    // ...but still says where the first window closes.
    expect(daruriRowState([today], day, 'MaghribDaruri', at(20, 0), false)?.phase).toBe(
      'first',
    );
  });
});

describe('a logged prayer', () => {
  it('states the first boundary all day — never the second, never nothing', () => {
    // The void under the table by evening came from rows that dropped
    // their line as they were logged; the line stays, the words are the
    // first boundary as a fact of the day.
    expect(daruriRowState(week, day, 'MaghribDaruri', at(20, 0), true)?.phase).toBe('first');
    expect(daruriRowState(week, day, 'MaghribDaruri', at(22, 0), true)).toEqual({
      phase: 'first',
      at: '21:06',
      approx: false,
    });
  });
});

describe('the other four', () => {
  it('Fajr: approx. for the first window, exact (sunrise) for the second', () => {
    expect(daruriRowState(week, day, 'FajrDaruri', at(6, 0), false)).toEqual({
      phase: 'first',
      at: '06:20',
      approx: true,
    });
    expect(daruriRowState(week, day, 'FajrDaruri', at(6, 30), false)).toEqual({
      phase: 'second',
      at: '07:05',
      approx: false,
    });
    expect(daruriRowState(week, day, 'FajrDaruri', at(7, 5), false)).toEqual({
      phase: 'first',
      at: '06:20',
      approx: true,
    });
  });

  it('Ẓuhr and ʿAṣr both end at Maghrib', () => {
    expect(daruriRowState(week, day, 'DhuhrDaruri', at(17, 30), false)?.at).toBe('19:51');
    expect(daruriRowState(week, day, 'AsrDaruri', at(19, 0), false)?.at).toBe('19:51');
    expect(daruriRowState(week, day, 'AsrDaruri', at(19, 51), false)?.phase).toBe('first');
  });

  it('Ishāʾ: a boundary past midnight is tomorrow’s, and the window ends at tomorrow’s Fajr', () => {
    // IshaDaruri is 00:44 — a third of the night, after midnight. At
    // 23:00 that is still ahead, not fifteen hours behind.
    expect(daruriRowState(week, day, 'IshaDaruri', at(23, 0), false)?.phase).toBe('first');
    expect(daruriRowState(week, day, 'IshaDaruri', nextDay(0, 50), false)).toEqual({
      phase: 'second',
      at: '05:40',
      approx: false,
    });
    // ...and never guessed past the loaded week.
    expect(daruriRowState([today], day, 'IshaDaruri', nextDay(0, 50), false)?.phase).toBe(
      'first',
    );
  });

  it('is null where the sky produced no boundary', () => {
    const noFajr = [{ ...today, FajrDaruri: undefined }, tomorrow] as unknown as TimingsMap[];
    expect(daruriRowState(noFajr, day, 'FajrDaruri', at(6, 0), false)).toBeNull();
  });
});
