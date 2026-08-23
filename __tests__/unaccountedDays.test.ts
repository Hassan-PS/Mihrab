/**
 * The mark for a day inside the record that never got filled in.
 *
 * The rule has three edges, and each one is somebody's day:
 *
 *   • Before the first logged prayer there is nothing to be missing. A
 *     graph that opened with two years of marks would be reproaching
 *     someone for the time before they installed the app.
 *   • Today is exempt while it is still being lived — a mark that appears
 *     at Fajr for the Isha you have not prayed yet is nagging.
 *   • A day with four of five accounted for still counts. "Any prayer not
 *     logged" is the ask, not "no prayer logged".
 *
 * The fast is deliberately not part of it: someone who logged a Ramadan two
 * years ago and started logging prayers last week must not find the two
 * years in between marked.
 */
import { buildHeatmap, type HeatmapDay } from '../src/practice/PracticeHeatmap';
import { scoreByDay, type JournalEntry } from '../src/journal/journal';
import { buildPracticeBlock } from '../src/widget/widgetBlocks';

const NOW = new Date(2026, 7, 23, 13, 0, 0); // Sunday 23 August 2026

function entry(date: string, prayer: string): JournalEntry {
  return {
    date,
    prayer: prayer as JournalEntry['prayer'],
    status: 'on-time',
    at: `${date}T05:00:00.000Z`,
  } as JournalEntry;
}

/** A full day, so it is accounted for. */
function fullDay(date: string): JournalEntry[] {
  return ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(p => entry(date, p));
}

function dayFor(rows: HeatmapDay[][], key: string): HeatmapDay | undefined {
  return rows.flat().find(d => d.key === key);
}

function heatmap(entries: JournalEntry[], since: string | null) {
  return buildHeatmap(scoreByDay(entries), new Set(), NOW, 4, {}, since);
}

describe('the unaccounted mark', () => {
  const entries = [
    ...fullDay('2026-08-17'),
    entry('2026-08-19', 'Fajr'),
    ...fullDay('2026-08-22'),
    entry('2026-08-23', 'Fajr'),
  ];

  it('marks a day that is short of five', () => {
    // One of five: the record started, and this day has a hole in it.
    expect(dayFor(heatmap(entries, '2026-08-17'), '2026-08-19')?.unaccounted).toBe(
      true,
    );
  });

  it('marks a day with nothing at all, once the record has started', () => {
    expect(dayFor(heatmap(entries, '2026-08-17'), '2026-08-20')?.unaccounted).toBe(
      true,
    );
  });

  it('leaves a complete day alone', () => {
    expect(dayFor(heatmap(entries, '2026-08-17'), '2026-08-22')?.unaccounted).toBe(
      false,
    );
  });

  it('says nothing about the days before the record began', () => {
    expect(dayFor(heatmap(entries, '2026-08-17'), '2026-08-16')?.unaccounted).toBe(
      false,
    );
  });

  it('leaves today alone while it is still being lived', () => {
    // One prayer logged of five, and four still ahead of the clock.
    expect(dayFor(heatmap(entries, '2026-08-17'), '2026-08-23')?.unaccounted).toBe(
      false,
    );
  });

  it('marks nothing at all when the journal is empty', () => {
    const rows = heatmap([], null);
    expect(rows.flat().some(d => d.unaccounted)).toBe(false);
  });
});

describe('what the widget is told', () => {
  it('carries the first logged day, so the renderer can draw the same marks', () => {
    const block = buildPracticeBlock({
      journal: [...fullDay('2026-08-17'), entry('2026-08-19', 'Fajr')],
      fasts: [],
      sunnah: {},
      streak: 1,
      bestStreak: 1,
      now: NOW,
    });
    expect(block.since).toBe('2026-08-17');
  });

  it('sends no start day when nothing has been logged', () => {
    const block = buildPracticeBlock({
      journal: [],
      fasts: [{ date: '2024-03-11', completed: true }],
      sunnah: {},
      streak: 0,
      bestStreak: 0,
      now: NOW,
    });
    // A fast is not a prayer log: the renderer must not mark every day
    // since a Ramadan two years ago.
    expect(block.since).toBeUndefined();
  });
});
