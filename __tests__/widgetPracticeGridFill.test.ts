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

const RING_RATIO = numberOf('RING_RATIO');

/** The margin the bitmap keeps for the rings that overhang a cell. */
const marginOf = (cell: number) => 2 * Math.max(1.5, cell * RING_RATIO);

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
  const usableH = Math.max(cell, boxH - marginOf(cell));
  const rows = Math.min(
    Math.max(1, Math.floor((usableH + GAP_DP) / (cell + GAP_DP))),
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
    const l = layoutFor(boxW, boxH, 210);
    expect(gridH(l) + marginOf(l.cell)).toBeLessThanOrEqual(boxH);
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

  it('never lets the height be the axis that binds, at ANY height', () => {
    // The one that matters, and the one four hand-picked boxes kept
    // missing. `fitStart` scales by whichever axis binds first: while the
    // bitmap is no taller than its box the WIDTH binds, the scale is the
    // same at every height, and the cell is the size the width chose. Let
    // the grid come out half a cell too tall — which round-to-nearest did,
    // for a third of all heights — and the height binds instead, so
    // dragging the card shorter shrinks every square on it instead of
    // dropping a row. Rounding down is what makes a resize a row count.
    // From one row's worth of box upward. Below that the grid still returns
    // a single row rather than none — a graph that is drawn at all has at
    // least one row in it — and it is the providers' `GRID_MIN_HEIGHT_DP`
    // that keeps a box this short from ever being handed over.
    const oneRow = (() => {
      const { cell } = layoutFor(318, 400, 210);
      return Math.ceil(cell + marginOf(cell));
    })();
    const over: Array<{ boxH: number; by: number }> = [];
    for (let boxH = oneRow; boxH <= 400; boxH += 1) {
      const l = layoutFor(318, boxH, 210);
      const tall = gridH(l) + marginOf(l.cell);
      if (tall > boxH) over.push({ boxH, by: Math.round(tall - boxH) });
    }
    expect(over).toEqual([]);
  });

  it('is monotonic: taller card, never fewer rows', () => {
    // A dial, not a lottery. Every extra dp either buys a row or buys
    // nothing; none of them may cost one.
    let last = 0;
    for (let boxH = 20; boxH <= 400; boxH += 1) {
      const { rows } = layoutFor(318, boxH, 210);
      expect(rows).toBeGreaterThanOrEqual(last);
      last = rows;
    }
  });

  it('goes all the way down to one row, and keeps the cell', () => {
    // "It should be able to go from one row up to however many it can fit."
    // The floor is one row of full-size squares, not a smaller graph and
    // not an empty band where the graph was.
    const one = layoutFor(318, 34, 210);
    const many = layoutFor(318, 400, 210);
    expect(one.rows).toBe(1);
    expect(many.rows).toBeGreaterThan(6);
    expect(one.cell).toBeCloseTo(many.cell, 5);
    expect(one.columns).toBe(many.columns);
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
  it('fills a column at a time, top to bottom', () => {
    // Column-major, because the Log screen's heatmap is: days run down a
    // column, a column is a week, the newest week is on the right. It was
    // row-major for a while — the days were the same days in the same
    // order, but laid along rows, and reading the widget after reading the
    // Log screen meant re-learning which square was which. Two pictures of
    // one record should not need two reading directions.
    expect(GRID).toMatch(
      /for \(col in 0 until columns\) \{\s*\n\s*for \(row in 0 until rows\)/,
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

  /**
   * The band is what sits between the rule under the times and the rule
   * over the graph. Reported as "the middle segment in both of the widgets
   * is not centered between the top and the bottom line", and measured off
   * the screenshot: the prayer card had 6+8dp above the line against 10
   * below, so it sat low in a 43dp band; the Log card had 6 above against
   * 8 below, so it sat high in a band 10dp shorter. Two cards on one home
   * screen, two different answers.
   */
  /** The id, and only that id — `widget_log_grid` is a prefix of its divider. */
  const tagOf = (layout: string, id: string) => {
    const xml = layoutXml(layout);
    const at = xml.indexOf(`@+id/${id}"`);
    expect(at).toBeGreaterThan(-1);
    return xml.slice(at, xml.indexOf('/>', at));
  };

  const marginsOf = (layout: string, id: string) => {
    const tag = tagOf(layout, id);
    const dp = (attr: string) =>
      Number(new RegExp(`android:layout_${attr}="(\\d+)dp"`).exec(tag)?.[1] ?? 0);
    return { top: dp('marginTop'), bottom: dp('marginBottom') };
  };

  it.each([
    ['prayer_widget_strip', 'widget_strip_divider', 'widget_next_row', 'widget_practice_divider'],
    ['prayer_widget_log', 'widget_log_divider', 'widget_log_footer', 'widget_log_grid_divider'],
  ])('%s centres the band between its two rules', (layout, above, row, below) => {
    const space = {
      above: marginsOf(layout, above).bottom + marginsOf(layout, row).top,
      below: marginsOf(layout, row).bottom + marginsOf(layout, below).top,
    };
    expect(space.above).toBe(space.below);
  });

  it('gives both cards the same band, not just a symmetric one', () => {
    // Symmetric on each card and different between them would still read as
    // two designs; the number has to be the same number.
    expect(marginsOf('prayer_widget_strip', 'widget_strip_divider').bottom).toBe(
      marginsOf('prayer_widget_log', 'widget_log_divider').bottom,
    );
    expect(marginsOf('prayer_widget_strip', 'widget_practice_divider').top).toBe(
      marginsOf('prayer_widget_log', 'widget_log_grid_divider').top,
    );
  });

  it.each([
    ['prayer_widget_strip', 'widget_practice_grid'],
    ['prayer_widget_log', 'widget_log_grid'],
  ])('%s centres the graph in whatever slack is left', (layout, id) => {
    // The row count quantises, so up to a row's worth of the box goes
    // unspent. fitStart piled all of it under the last row — a void that
    // came out a different size on each card, because the two have
    // different chrome above the graph. fitCenter splits it.
    expect(tagOf(layout, id)).toContain('android:scaleType="fitCenter"');
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
