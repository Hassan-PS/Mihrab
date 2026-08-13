/**
 * The practice graph carries two facts per square (design review 2c):
 * prayers as fill depth, the fast as a ring. The grid itself has to be
 * right before either channel means anything — thirteen weeks, weekday
 * rows, ending in the week that contains today, and nothing invented for
 * days that have not happened yet.
 */
import {
  buildHeatmap,
  HEATMAP_WEEKS,
  monthLabelsFor,
  weeksToCover,
} from '../src/practice/PracticeHeatmap';
import { dayKey } from '../src/practice/practiceStore';

// A Thursday, so "today" sits mid-week and the trailing days are future.
const NOW = new Date(2026, 7, 6, 12, 0, 0);

describe('buildHeatmap', () => {
  it('is seven weekday rows of thirteen weeks', () => {
    const rows = buildHeatmap(new Map(), new Set(), NOW);
    expect(rows).toHaveLength(7);
    for (const row of rows) expect(row).toHaveLength(HEATMAP_WEEKS);
  });

  it('starts each row on a Monday and ends in the current week', () => {
    const rows = buildHeatmap(new Map(), new Set(), NOW);
    // Row 0 is Monday; its last column is the Monday of this week.
    expect(rows[0][HEATMAP_WEEKS - 1].key).toBe(dayKey(new Date(2026, 7, 3)));
    // Row 3 is Thursday — today.
    expect(rows[3][HEATMAP_WEEKS - 1].key).toBe(dayKey(NOW));
  });

  it('marks days after today as future rather than as zeroes', () => {
    const rows = buildHeatmap(new Map(), new Set(), NOW);
    // Friday and Saturday of the current week have not happened.
    expect(rows[4][HEATMAP_WEEKS - 1].future).toBe(true);
    expect(rows[5][HEATMAP_WEEKS - 1].future).toBe(true);
    expect(rows[3][HEATMAP_WEEKS - 1].future).toBe(false);
  });

  it('carries the day score and the fast independently', () => {
    const today = dayKey(NOW);
    const rows = buildHeatmap(
      new Map([[today, { kept: 4, logged: 4, missed: 0 }]]),
      new Set([today]),
      NOW,
    );
    const cell = rows[3][HEATMAP_WEEKS - 1];
    expect(cell.kept).toBe(4);
    expect(cell.logged).toBe(4);
    expect(cell.fasted).toBe(true);
  });

  it('reads a fast on a day with no prayers logged', () => {
    // The two channels are independent: an amber ring with an empty fill
    // is a legitimate square, not a contradiction.
    const monday = dayKey(new Date(2026, 7, 3));
    const rows = buildHeatmap(new Map(), new Set([monday]), NOW);
    const cell = rows[0][HEATMAP_WEEKS - 1];
    expect(cell.kept).toBe(0);
    expect(cell.logged).toBe(0);
    expect(cell.fasted).toBe(true);
  });

  it('covers exactly 13 weeks back from the current week by default', () => {
    const rows = buildHeatmap(new Map(), new Set(), NOW);
    const first = rows[0][0].key;
    const expected = new Date(2026, 7, 3);
    expected.setDate(expected.getDate() - (HEATMAP_WEEKS - 1) * 7);
    expect(first).toBe(dayKey(expected));
  });

  it('draws as many weeks as it is asked for, still ending on today', () => {
    const rows = buildHeatmap(new Map(), new Set(), NOW, 60);
    for (const row of rows) expect(row).toHaveLength(60);
    expect(rows[3][59].key).toBe(dayKey(NOW));
    const expected = new Date(2026, 7, 3);
    expected.setDate(expected.getDate() - 59 * 7);
    expect(rows[0][0].key).toBe(dayKey(expected));
  });
});

/**
 * The span used to be a constant, which quietly deleted every square older
 * than a quarter. These pin the replacement: the graph reaches the first
 * logged day, however far back that is.
 */
describe('weeksToCover', () => {
  it('falls back to the minimum with nothing logged', () => {
    expect(weeksToCover(null, NOW)).toBe(HEATMAP_WEEKS);
    expect(weeksToCover(undefined, NOW)).toBe(HEATMAP_WEEKS);
  });

  it('never shrinks below the minimum for a recent first entry', () => {
    expect(weeksToCover('2026-08-01', NOW)).toBe(HEATMAP_WEEKS);
  });

  it('counts whole weeks back to the first entry', () => {
    // Monday 13 weeks before this week's Monday — the boundary case.
    expect(weeksToCover('2026-05-11', NOW)).toBe(13);
    // One week further back is one more column.
    expect(weeksToCover('2026-05-04', NOW)).toBe(14);
  });

  it('reaches years back, not just a quarter', () => {
    // 2 Aug 2023 → 3 Aug 2026 is 157 weeks of Mondays, inclusive.
    expect(weeksToCover('2023-08-02', NOW)).toBe(158);
  });

  it('survives a key it cannot parse rather than sizing a grid on NaN', () => {
    expect(weeksToCover('not-a-date', NOW)).toBe(HEATMAP_WEEKS);
    expect(weeksToCover('', NOW)).toBe(HEATMAP_WEEKS);
  });

  it('is unaffected by the DST change between the two dates', () => {
    // Europe/Stockholm springs forward on 29 March 2026. Counting in raw
    // milliseconds without a noon anchor loses an hour and rounds short.
    expect(weeksToCover('2026-03-23', NOW)).toBe(20);
  });
});

describe('monthLabelsFor', () => {
  it('labels only the column that opens a new month', () => {
    const rows = buildHeatmap(new Map(), new Set(), NOW, 13);
    const labels = monthLabelsFor(rows, 'en-GB');
    expect(labels).toHaveLength(13);
    // Exactly one label per month boundary in the window — never one per
    // column, which would be an unreadable stripe of text.
    expect(labels.filter(Boolean).length).toBeGreaterThan(1);
    expect(labels.filter(Boolean).length).toBeLessThan(6);
  });

  it('leaves the first column blank — its week is mostly the month before', () => {
    const rows = buildHeatmap(new Map(), new Set(), NOW, 13);
    expect(monthLabelsFor(rows, 'en-GB')[0]).toBe('');
  });

  it('carries the year on January, so scrolling back stays legible', () => {
    // Long enough to cross a new year.
    const rows = buildHeatmap(new Map(), new Set(), NOW, 60);
    const january = monthLabelsFor(rows, 'en-GB').find(l => /\d{4}/.test(l));
    expect(january).toMatch(/2026/);
  });
});
