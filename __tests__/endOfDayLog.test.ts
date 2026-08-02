/**
 * The end-of-day "log all as complete" prompt (v2.8.5).
 *
 * Two things about it are easy to get wrong and impossible to see:
 *
 *  1. WHICH DAY it writes to. The prompt lands ten minutes after Isha,
 *     which in a Swedish summer is near midnight. People sleep through it
 *     and answer in the morning — and a handler that logged "today" would
 *     credit the wrong day and leave the real one blank, which is exactly
 *     the gap the reminder exists to close.
 *  2. What it OVERWRITES. "Log all as complete" has to mean "the rest went
 *     fine", not "erase what I already told you" — a prayer recorded as
 *     missed is a deliberate record, not an omission.
 */
import { fillDayOnTime, ishaTriggerAt } from '../src/notifications/endOfDayLog';
import type { JournalEntry } from '../src/journal/journal';
import type { TimingsMap } from '../src/types/prayer';

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

function entry(
  date: string,
  prayer: (typeof PRAYERS)[number],
  status: JournalEntry['status'],
): JournalEntry {
  return { date, prayer, status, loggedAt: '2026-08-01T12:00:00.000Z' };
}

describe('ishaTriggerAt', () => {
  const day = new Date(2026, 7, 2); // 2 Aug 2026, local

  it('fires ten minutes after Isha', () => {
    const at = ishaTriggerAt(day, { Isha: '21:40' } as TimingsMap);
    expect(at).not.toBeNull();
    expect(at!.getHours()).toBe(21);
    expect(at!.getMinutes()).toBe(50);
    expect(at!.getDate()).toBe(2);
  });

  it('rolls into the next day when Isha is late enough', () => {
    // Stockholm in June: Isha near midnight, so +10 lands tomorrow.
    const at = ishaTriggerAt(day, { Isha: '23:55' } as TimingsMap);
    expect(at!.getDate()).toBe(3);
    expect(at!.getHours()).toBe(0);
    expect(at!.getMinutes()).toBe(5);
  });

  it('ignores a timezone suffix, which the API sometimes appends', () => {
    const at = ishaTriggerAt(day, { Isha: '22:39 (CEST)' } as TimingsMap);
    expect(at!.getHours()).toBe(22);
    expect(at!.getMinutes()).toBe(49);
  });

  it('returns null rather than guessing at nonsense', () => {
    expect(ishaTriggerAt(day, undefined)).toBeNull();
    expect(ishaTriggerAt(day, {} as TimingsMap)).toBeNull();
    expect(ishaTriggerAt(day, { Isha: '' } as TimingsMap)).toBeNull();
    expect(ishaTriggerAt(day, { Isha: 'soon' } as TimingsMap)).toBeNull();
    expect(ishaTriggerAt(day, { Isha: '99:99' } as TimingsMap)).toBeNull();
  });
});

describe('fillDayOnTime', () => {
  it('logs all five for an untouched day', () => {
    const next = fillDayOnTime([], '2026-08-02');
    expect(next).toHaveLength(5);
    expect(next.every(e => e.date === '2026-08-02')).toBe(true);
    expect(next.every(e => e.status === 'on-time')).toBe(true);
    expect(next.map(e => e.prayer).sort()).toEqual(
      [...PRAYERS].sort(),
    );
  });

  it('writes the day it was asked for, not the day it was asked on', () => {
    // The whole point: yesterday's prompt, answered this morning.
    const next = fillDayOnTime([], '2026-08-01');
    expect(next.every(e => e.date === '2026-08-01')).toBe(true);
  });

  it('leaves a deliberate record alone', () => {
    const before = [entry('2026-08-02', 'Asr', 'missed')];
    const next = fillDayOnTime(before, '2026-08-02');
    expect(next).toHaveLength(5);
    const asr = next.find(e => e.prayer === 'Asr');
    expect(asr?.status).toBe('missed');
    expect(next.filter(e => e.status === 'on-time')).toHaveLength(4);
  });

  it('does not touch other days', () => {
    const before = [entry('2026-07-31', 'Fajr', 'late')];
    const next = fillDayOnTime(before, '2026-08-02');
    expect(next.filter(e => e.date === '2026-07-31')).toEqual(before);
    expect(next.filter(e => e.date === '2026-08-02')).toHaveLength(5);
  });

  it('returns the same array when the day is already complete, so the caller can skip the write', () => {
    const before = PRAYERS.map(p => entry('2026-08-02', p, 'on-time'));
    expect(fillDayOnTime(before, '2026-08-02')).toBe(before);
  });

  it('is idempotent — a double tap adds nothing', () => {
    const once = fillDayOnTime([], '2026-08-02');
    const twice = fillDayOnTime(once, '2026-08-02');
    expect(twice).toBe(once);
  });
});
