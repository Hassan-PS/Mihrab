/**
 * The evening prompt must not ask a question the record has already
 * answered.
 */
import { dayIsFullyLogged } from '../src/notifications/endOfDayLog';
import { upsertEntry, type JournalEntry } from '../src/journal/journal';

const NOW = new Date(2026, 7, 10, 21, 0, 0);
const ALL = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

function fill(
  date: string,
  prayers: readonly (typeof ALL)[number][],
  status: 'on-time' | 'missed' | 'late' | 'qadha' = 'on-time',
): JournalEntry[] {
  let entries: JournalEntry[] = [];
  for (const p of prayers) entries = upsertEntry(entries, date, p, status, NOW);
  return entries;
}

describe('dayIsFullyLogged', () => {
  test('true once all five are recorded', () => {
    expect(dayIsFullyLogged(fill('2026-08-10', ALL), '2026-08-10')).toBe(true);
  });

  test('false while one is still missing', () => {
    const four = fill('2026-08-10', ['Fajr', 'Dhuhr', 'Asr', 'Maghrib']);
    expect(dayIsFullyLogged(four, '2026-08-10')).toBe(false);
  });

  test('a day of five missed counts as answered', () => {
    // The prompt exists to save bookkeeping, not to grade the day. Asking
    // someone to re-log a day they have already called a write-off would be
    // the app arguing with them.
    expect(
      dayIsFullyLogged(fill('2026-08-10', ALL, 'missed'), '2026-08-10'),
    ).toBe(true);
  });

  test('mixed statuses still count as answered', () => {
    let entries = fill('2026-08-10', ['Fajr', 'Dhuhr'], 'on-time');
    entries = upsertEntry(entries, '2026-08-10', 'Asr', 'late', NOW);
    entries = upsertEntry(entries, '2026-08-10', 'Maghrib', 'qadha', NOW);
    entries = upsertEntry(entries, '2026-08-10', 'Isha', 'missed', NOW);
    expect(dayIsFullyLogged(entries, '2026-08-10')).toBe(true);
  });

  test('another day being complete says nothing about this one', () => {
    expect(dayIsFullyLogged(fill('2026-08-09', ALL), '2026-08-10')).toBe(false);
  });

  test('an empty journal is not a complete day', () => {
    expect(dayIsFullyLogged([], '2026-08-10')).toBe(false);
  });
});
