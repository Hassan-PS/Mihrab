/**
 * The practice graph fills the card it is drawn on, and reads in order.
 *
 * Reported with a screenshot: on a 4x4 the graph stopped about eighty
 * pixels short of the right-hand edge that the divider, the date and the
 * "0 of 5 logged" line all reach — which reads as a graph being clipped,
 * not as a graph that chose to be narrower.
 *
 * The cause was an estimate. The column count came from a cell size
 * derived from the box's HEIGHT — a number the caller can only guess at,
 * since it is the launcher's report for the host view less whatever chrome
 * the card thinks it draws — and the cell was then drawn at a different
 * size again. Two shapes with no reason to agree, and when they disagreed
 * `fitStart` scaled the bitmap to whichever axis bound first and left the
 * remainder against one edge.
 *
 * It is answered from the WIDTH now, which the caller does know: the
 * columns are however many readable cells fit across it and the cell is
 * that width divided exactly among them. The height only decides how many
 * rows there is room for, rounded down, because a row too few is a band of
 * empty card and a row too many is the whole graph shrunk away from its
 * edge.
 */
import { readFileSync } from 'fs';
import path from 'path';

const JAVA = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'prayer_times',
);
const src = (name: string) => readFileSync(path.join(JAVA, `${name}.kt`), 'utf8');
const GRID = src('PracticeGridBitmap');
const layoutXml = (name: string) =>
  readFileSync(
    path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'layout', `${name}.xml`),
    'utf8',
  );

const numberOf = (name: string) => {
  const m = new RegExp(`${name} = ([0-9_.]+)f?`).exec(GRID);
  if (!m) throw new Error(`${name} is gone from PracticeGridBitmap.kt`);
  return Number(m[1].replace(/_/g, ''));
};

const GAP_DP = numberOf('GAP_DP');
const TARGET_CELL_DP = numberOf('TARGET_CELL_DP');
const MAX_ROWS = numberOf('MAX_ROWS');
const MIN_COLUMNS = numberOf('MIN_COLUMNS');
const MAX_CELL_DP = numberOf('MAX_CELL_DP');

/** A mirror of `layoutFor`'s geometry, built from the Kotlin's own numbers. */
function layoutFor(boxW: number, boxH: number, maxDays: number) {
  const columns = Math.max(
    MIN_COLUMNS,
    Math.round((boxW + GAP_DP) / (TARGET_CELL_DP + GAP_DP)),
  );
  const cell = Math.min(
    MAX_CELL_DP,
    Math.max(3, (boxW - (columns - 1) * GAP_DP) / columns),
  );
  const rows = Math.min(
    Math.max(1, Math.round((boxH + GAP_DP) / (cell + GAP_DP))),
    MAX_ROWS,
    Math.max(1, Math.floor(maxDays / columns)),
  );
  return { rows, columns, cell };
}

const gridW = (l: { columns: number; cell: number }) =>
  l.columns * l.cell + (l.columns - 1) * GAP_DP;
const gridH = (l: { rows: number; cell: number }) =>
  l.rows * l.cell + (l.rows - 1) * GAP_DP;

/** Grid boxes measured off real cards, in dp. */
const BOXES: Array<[string, number, number]> = [
  ['the 4x4 that was reported', 318, 127],
  ['a taller card', 318, 200],
  ['a 4x2, where the graph now appears at all', 318, 40],
  ['the narrow column beside the streak number', 150, 90],
];

describe('the graph spans its box, whatever the height turns out to be', () => {
  it.each(BOXES)('%s reaches both edges', (_label, boxW, boxH) => {
    const l = layoutFor(boxW, boxH, 210);
    // Within a rounding error of the box's own width — no remainder can
    // pile up against one edge, because the cell IS the width divided.
    expect(Math.abs(gridW(l) - boxW)).toBeLessThan(1);
  });

  it.each(BOXES)('%s is never taller than its box', (_label, boxW, boxH) => {
    // Taller than the box is the failure that shrinks the whole graph and
    // stands it away from the right-hand edge. Shorter is a band of card.
    expect(gridH(layoutFor(boxW, boxH, 210))).toBeLessThanOrEqual(boxH);
  });

  it('drops a row rather than shrinking when the card gets shorter', () => {
    const tall = layoutFor(318, 127, 210);
    const short = layoutFor(318, 60, 210);
    expect(short.rows).toBeLessThan(tall.rows);
    // The cell is the same size: a shorter card shows fewer days, not
    // smaller ones. That is the difference between a shorter widget and a
    // smaller one.
    expect(short.cell).toBeCloseTo(tall.cell, 5);
  });

  it('keeps the cells square', () => {
    // A day drawn half again as wide as it is tall does not read as a day.
    expect(GRID).toContain('val cellHDp = cellDp');
    expect(GRID).toContain('val cellWDp = cellDp');
  });

  it('never asks for more history than the payload carries', () => {
    for (const [, w, h] of BOXES) {
      const l = layoutFor(w, h, 210);
      expect(l.rows * l.columns).toBeLessThanOrEqual(210);
    }
  });
});

describe('the run of days reads in order, and ends today', () => {
  it('fills a row at a time, left to right', () => {
    // Row-major, like text. The old grid was seven rows of week-columns,
    // which is the in-app heatmap's shape and needs a legend this surface
    // does not have.
    expect(GRID).toMatch(
      /for \(row in 0 until rows\) \{\s*\n\s*for \(col in 0 until columns\)/,
    );
  });

  it('starts as far back as it has to for today to be the last cell', () => {
    expect(GRID).toContain('add(Calendar.DAY_OF_YEAR, -(rows * columns - 1))');
    expect(GRID).toContain('cursor.add(Calendar.DAY_OF_YEAR, 1)');
  });
});

describe('an edge cell is a whole cell', () => {
  it('keeps a margin inside the bitmap for the rings that overhang', () => {
    // Every ring is centred on a cell boundary and today's is drawn on a
    // rect outset by half a stroke, so the outer half of both fell off a
    // bitmap whose first cell started at x=0.
    expect(GRID).toContain('val pad = padFor(ringUnit)');
    expect(GRID).toContain('+ 2 * pad');
    expect(GRID).toContain('val left = (pad + col * (cellWPx + gapPx)).toFloat()');
    expect(GRID).toContain('val top = (pad + row * (cellHPx + gapPx)).toFloat()');
  });

  it('sizes that margin by the widest stroke it draws', () => {
    expect(GRID).toMatch(/padFor\(cellPx: Int\): Int =\s*Math\.ceil\(ringWidth\(cellPx\)/);
    expect(GRID).toContain('paint.strokeWidth = ringWidth(ringUnit)');
  });

  it('draws at the device’s own resolution unless the budget says no', () => {
    // A bitmap drawn at a third of the pixels it is shown at is a blur with
    // rounded corners.
    expect(GRID).toContain('var scale = density');
    expect(GRID).toMatch(/if \(area > MAX_BITMAP_PX\)/);
  });
});

/**
 * The other thing the 12-hour clock made longer.
 *
 * The strip's six time columns were declared at 17sp with an
 * `autoSizeTextType` under them, and AppWidget hosts do not reliably honour
 * auto-sizing: on the ones that ignore it the text draws at the size it was
 * given and spills into its neighbour. "05:36" fit; "5:36 AM" did not, and
 * the top of the card became one run of digits.
 */
describe('the times row fits its own columns', () => {
  const strip = src('PrayerWidgetProvider');

  it('sets the size it measured, on every column', () => {
    expect(strip).toContain('val timeSizeSp = stripTimeSizeSp(');
    expect(strip).toMatch(
      /setTextViewTextSize\(\s*COL_TIMES\[i\],[\s\S]{0,120}timeSizeSp,/,
    );
  });

  it('finds one size that every time in the row fits', () => {
    expect(strip).toMatch(/times\.all \{ measureTimePx\(paint, it, sp/);
  });

  it('measures the string it will actually draw', () => {
    // The meridiem is set small, so a search that measured the whole time
    // at one size would fit a string nobody draws — and settle on type
    // smaller than it had to be.
    expect(strip).toContain('paint.textSize = sp * MERIDIEM_SCALE * scaledDensity');
    expect(strip).toContain('views.setTextViewText(COL_TIMES[i], styledTime(time))');
  });

  it('keeps the meridiem where the language puts it', () => {
    // Chinese writes 上午5:36. The span goes on whatever falls outside the
    // digits, either side of them, rather than on a trailing suffix.
    expect(strip).toMatch(/if \(core\.first > 0\) \{[\s\S]{0,200}RelativeSizeSpan/);
    expect(strip).toMatch(
      /if \(core\.last < time\.length - 1\) \{[\s\S]{0,200}RelativeSizeSpan/,
    );
  });

  it('shrinks the meridiem on the Log card too', () => {
    expect(src('PrayerWidgetLogProvider')).toContain(
      'PrayerWidgetProvider.styledTime(',
    );
  });

  it('leaves a gutter, so fitting is not the same as touching', () => {
    expect(strip).toMatch(/TIME_GUTTER_DP = ([1-9]\d*)f/);
    expect(strip).toContain('(columnDp - TIME_GUTTER_DP)');
  });

  it('stops declaring an auto-size the host may ignore', () => {
    for (const layout of ['prayer_widget_strip', 'prayer_widget']) {
      expect(layoutXml(layout)).not.toContain('autoSizeTextType');
    }
  });
});

/**
 * One band between the times and the graph, and the same one on both cards.
 */
describe('the streak sits on the line with what is next', () => {
  it.each([
    ['prayer_widget_strip', 'widget_practice_streak', 'widget_next_row'],
    ['prayer_widget_log', 'widget_log_streak', 'widget_log_footer'],
  ])('%s carries it on the row that already existed', (layout, streakId, rowId) => {
    const xml = layoutXml(layout);
    const row = xml.slice(xml.indexOf(rowId));
    const streakAt = row.indexOf(streakId);
    const rowEnd = row.indexOf('</LinearLayout>');
    expect(streakAt).toBeGreaterThan(-1);
    expect(streakAt).toBeLessThan(rowEnd);
  });

  it.each([
    ['prayer_widget_strip', 'widget_practice_row'],
    ['prayer_widget_log', 'widget_log_practice_row'],
  ])('%s keeps the old row as an empty shell', (layout, rowId) => {
    // The binder is shared, and a RemoteViews action against an id a layout
    // does not have takes the whole widget down rather than being skipped.
    const xml = layoutXml(layout);
    const at = xml.indexOf(`@+id/${rowId}`);
    expect(at).toBeGreaterThan(-1);
    expect(xml.slice(at - 200, at)).toContain('FrameLayout');
  });

  it('is one line on the prayer card, as it is on the Log card', () => {
    // The night times used to sit UNDER the streak line, which made the
    // band between the times and the graph two lines on one card and one
    // on the other. They belong to the times, so they are above the rule
    // now and the band itself is a single line on both.
    const xml = layoutXml('prayer_widget_strip');
    expect(xml.indexOf('@+id/widget_night_row')).toBeLessThan(
      xml.indexOf('@+id/widget_strip_divider'),
    );
    expect(xml.indexOf('@+id/widget_strip_divider')).toBeLessThan(
      xml.indexOf('@+id/widget_next_row'),
    );
  });

  it('rules itself off the same way on both cards', () => {
    const ruleOf = (layout: string, id: string) => {
      const xml = layoutXml(layout);
      const at = xml.indexOf(`@+id/${id}`);
      return /android:background="(#[0-9A-F]+)"/.exec(xml.slice(at, at + 400))?.[1];
    };
    expect(ruleOf('prayer_widget_strip', 'widget_strip_divider')).toBe(
      ruleOf('prayer_widget_log', 'widget_log_divider') ??
        ruleOf('prayer_widget_log', 'widget_log_grid_divider'),
    );
  });

  it('reads at the same size on both cards', () => {
    const sizeOf = (layout: string, id: string) => {
      const xml = layoutXml(layout);
      const at = xml.indexOf(`@+id/${id}`);
      const m = /android:textSize="(\d+)sp"/.exec(xml.slice(at, at + 400));
      return m ? Number(m[1]) : null;
    };
    expect(sizeOf('prayer_widget_strip', 'widget_practice_streak')).toBe(
      sizeOf('prayer_widget_log', 'widget_log_streak'),
    );
    expect(sizeOf('prayer_widget_strip', 'widget_practice_second')).toBe(
      sizeOf('prayer_widget_log', 'widget_log_practice_second'),
    );
  });
});
