/**
 * The practice graph carries two facts per square (design review 2c):
 * prayers as fill depth, the fast as a ring. The grid itself has to be
 * right before either channel means anything — thirteen weeks, weekday
 * rows, ending in the week that contains today, and nothing invented for
 * days that have not happened yet.
 */
import { buildHeatmap, HEATMAP_WEEKS } from '../src/practice/PracticeHeatmap';
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

  it('carries the prayer count and the fast independently', () => {
    const today = dayKey(NOW);
    const rows = buildHeatmap(
      new Map([[today, 4]]),
      new Set([today]),
      NOW,
    );
    const cell = rows[3][HEATMAP_WEEKS - 1];
    expect(cell.prayers).toBe(4);
    expect(cell.fasted).toBe(true);
  });

  it('reads a fast on a day with no prayers logged', () => {
    // The two channels are independent: an amber ring with an empty fill
    // is a legitimate square, not a contradiction.
    const monday = dayKey(new Date(2026, 7, 3));
    const rows = buildHeatmap(new Map(), new Set([monday]), NOW);
    const cell = rows[0][HEATMAP_WEEKS - 1];
    expect(cell.prayers).toBe(0);
    expect(cell.fasted).toBe(true);
  });

  it('covers exactly 13 weeks back from the current week', () => {
    const rows = buildHeatmap(new Map(), new Set(), NOW);
    const first = rows[0][0].key;
    const expected = new Date(2026, 7, 3);
    expected.setDate(expected.getDate() - (HEATMAP_WEEKS - 1) * 7);
    expect(first).toBe(dayKey(expected));
  });
});
