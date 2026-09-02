/**
 * "Finish day 5" says nothing about when day 5 is.
 *
 * A plan's day numbers only mean something beside a calendar, so the
 * button now carries the answer in parentheses. These hold what each of
 * those answers is.
 */
import { daysAway, khatmahDayWhen, formatDayWhen } from '../src/quran/khatmahDayWhen';

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
