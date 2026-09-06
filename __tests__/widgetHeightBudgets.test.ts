/**
 * The height budgets the Android cards size themselves against.
 *
 * These exist because of a bug that survived three rounds of "fix the
 * clipping": the prayer-times strip and the Log Today card both drew their
 * full-height variant into a card too short to hold it, and the last row —
 * the next-prayer line on one, the countdown footer on the other — came out
 * as a few points of clipped text.
 *
 * The cause was not the layouts. `widget_card_inset` gave every widget a 6dp
 * gutter on all four sides in August, a week after the height constants were
 * measured; the constants describe the CARD and the launcher reports the HOST
 * VIEW, so from that commit on every budget was 12dp too generous. That is
 * invisible until a launcher row happens to land in the gap it opens — one
 * row on a 480dpi phone is ~147dp, which is exactly there — and then it is a
 * clipped line that no amount of staring at the XML explains.
 *
 * Two invariants, then, and they are what this file pins:
 *
 *  1. Every budget is host-view relative, so it carries the inset twice over
 *     on top of the card content measured from a real `dumpsys` hierarchy.
 *  2. The budget that CHOOSES a variant is the budget the slack is measured
 *     against. The old code picked the layout on one number (145) and filled
 *     it from another (132), and the difference went into padding that
 *     pushed the footer off the bottom.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const JAVA = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

const src = (name: string) => readFileSync(path.join(JAVA, `${name}.kt`), 'utf8');
const strip = src('PrayerWidgetProvider');
const log = src('PrayerWidgetLogProvider');

const constOf = (file: string, name: string) => {
  const m = new RegExp(`val ${name} = (\\d+)`).exec(file);
  if (!m) throw new Error(`${name} is gone — the budgets moved, so this test has to move too`);
  return Number(m[1]);
};

/** The gutter between the host view and the card, from the resource itself. */
const INSET = Number(
  /name="widget_card_inset">\s*(\d+)dp/.exec(
    readFileSync(path.join(RES, 'values', 'dimens.xml'), 'utf8'),
  )?.[1],
);

/**
 * What each variant's content measures INSIDE the card, in dp, read off a
 * `dumpsys activity com.android.launcher3` view hierarchy on a 480dpi phone
 * (font scale 1.0) with both cards placed at one and at two launcher rows.
 *
 * Re-measure rather than adjust these: they are observations, not knobs.
 */
const MEASURED_CARD_DP = {
  STRIP_ROOMY_CONTENT_DP: 136, // 28 padding + header 19 + columns 40 + rule 10 + next 19 + night margin 4
  STRIP_TIGHT_CONTENT_DP: 110, // the same without the rule and on 6dp ends
  STRIP_BARE_CONTENT_DP: 83, //  and without the date line
  LOG_ROOMY_CONTENT_DP: 143, //  20 padding + date 15 + chips 75 + rule 13 + footer 16
  LOG_TIGHT_CONTENT_DP: 120, //  no rule, 6dp padding, 30dp chips
  LOG_BARE_CONTENT_DP: 99, //    and no date line
};

describe('every card budget leaves room for the card inset', () => {
  it.each(Object.entries(MEASURED_CARD_DP))('%s', (name, cardDp) => {
    const file = name.startsWith('STRIP') ? strip : log;
    // The launcher measures the host view; the layout gets the card. A
    // budget that forgets the difference is the whole bug.
    expect(constOf(file, name)).toBeGreaterThanOrEqual(cardDp + 2 * INSET);
  });
});

describe('the budgets stay in order', () => {
  it('the strip spends more on each thing it puts back', () => {
    expect(constOf(strip, 'STRIP_ROOMY_CONTENT_DP')).toBeGreaterThan(
      constOf(strip, 'STRIP_TIGHT_CONTENT_DP'),
    );
    expect(constOf(strip, 'STRIP_TIGHT_CONTENT_DP')).toBeGreaterThan(
      constOf(strip, 'STRIP_BARE_CONTENT_DP'),
    );
  });

  it('and so does the log card', () => {
    expect(constOf(log, 'LOG_ROOMY_CONTENT_DP')).toBeGreaterThan(
      constOf(log, 'LOG_TIGHT_CONTENT_DP'),
    );
    expect(constOf(log, 'LOG_TIGHT_CONTENT_DP')).toBeGreaterThan(
      constOf(log, 'LOG_BARE_CONTENT_DP'),
    );
  });
});

describe('a variant is filled against the budget that chose it', () => {
  it('the strip picks its variant on the budgets and nothing else', () => {
    expect(strip).toContain('val oneRow = heightDp in 1 until STRIP_TIGHT_CONTENT_DP');
    expect(strip).toContain('val tight = heightDp in 1 until STRIP_ROOMY_CONTENT_DP');
  });

  it('the log card picks its three the same way', () => {
    expect(log).toContain('val tight = heightDp in 1 until LOG_ROOMY_CONTENT_DP');
    expect(log).toContain('val bare = heightDp in 1 until LOG_TIGHT_CONTENT_DP');
  });

  it.each([
    ['the strip', strip, 'STRIP'],
    ['the log card', log, 'LOG'],
  ])('%s measures its slack against that same budget', (_label, file, prefix) => {
    // `budget` is assigned from the same three constants the flags above
    // read, and the slack subtracts `budget` — never a fourth number.
    const assign = new RegExp(
      `val budget =[\\s\\S]{0,200}?${prefix}_ROOMY_CONTENT_DP`,
    );
    expect(file).toMatch(assign);
    expect(file).toContain('((heightDp - budget) / 2)');
    // No bare numeral may creep back into the slack arithmetic.
    expect(file).not.toMatch(/\(heightDp - \d+\) \/ 2/);
  });
});

/**
 * The graph's two numbers describe the SAME card, or the graph is wrong.
 *
 * `GRID_MIN_HEIGHT_DP` is the height at which the graph first appears and
 * `*_CHROME_DP` is what everything else on the card costs, so the first has
 * to be the second plus a row of squares. Drift between them shows up as one
 * of the two failures reported here: quote the chrome too high and a card
 * with a row of space going spare draws nothing; quote it too low and the
 * grid asks for a box taller than it has, which `fitCenter` answers by
 * scaling every square down instead of dropping a row.
 *
 * The Log card's chrome is measured WITHOUT its date-and-count line, because
 * that line is hidden at exactly `GRID_MIN_HEIGHT_DP` — it is what pays for
 * the first row.
 */
describe('the graph appears exactly when a row of it fits', () => {
  const gridNum = (file: string, name: string) => {
    const m = new RegExp(`val ${name} = (\\d+)`).exec(file);
    if (!m) throw new Error(`${name} is gone`);
    return Number(m[1]);
  };
  const gridSrc = src('PracticeGridBitmap');
  const f = (name: string) =>
    Number(new RegExp(`${name} = ([0-9.]+)f?`).exec(gridSrc)![1]);
  /** One row of squares, plus the gap and ring margin that come with it. */
  const oneRow = f('TARGET_CELL_DP') + f('GAP_DP');

  it.each([
    ['the strip', strip, 'STRIP_CHROME_DP'],
    ['the log card', log, 'LOG_CHROME_DP'],
  ])('%s turns the graph on within a row of its own chrome', (_l, file, chrome) => {
    const gate = gridNum(file, 'GRID_MIN_HEIGHT_DP');
    const over = gate - gridNum(file, chrome);
    // At least a row — below that the graph appears with nowhere to draw —
    // and no more than two, which is a row of card going spare.
    expect(over).toBeGreaterThanOrEqual(oneRow * 0.9);
    expect(over).toBeLessThan(oneRow * 2);
  });

  it('drops the log card’s date line when the graph takes its place', () => {
    // Both facts on that line are said again once the graph is drawn, and
    // the 22dp it costs is most of a row of history.
    expect(log).toContain('val graph = heightDp >= GRID_MIN_HEIGHT_DP');
    expect(log).toMatch(
      /widget_log_header_row,\s*\n\s*if \(bare \|\| graph\) View\.GONE/,
    );
  });
});

/**
 * The box the graph is TOLD it has is the box the card HANDS it.
 *
 * Reported as "the graph in the widget is better but has too much void space
 * above and under", with a screenshot of a 4x4: a six-row graph floating in
 * the middle of the card with a band of nothing at each end.
 *
 * The rows and the cell come out of a box the provider works out by
 * subtracting what it believes the rest of the card costs. The strip did not
 * subtract — it took the remainder and multiplied it by two thirds, standing
 * in for "the times row takes the other third". No layout ever behaved that
 * way: the graph's ImageView is the ONLY weighted child of the content
 * column, so the times row takes its own height and the ImageView is handed
 * everything that is left. Measured on a 432dp host: the ImageView got 233dp
 * and the arithmetic asked for 178, so a graph built for two thirds of its
 * box was centred in it and the missing third became the void, split above
 * and below by `fitCenter`.
 *
 * The arithmetic is now a subtraction of named, measured constants, and the
 * layout fact it rests on is pinned below — because a weighted sibling added
 * to either column would break the arithmetic silently, and the only symptom
 * would be a graph that had shrunk.
 */
describe('the graph is sized for the space it is actually given', () => {
  const layoutXml = (name: string) =>
    readFileSync(path.join(RES, 'layout', `${name}.xml`), 'utf8');

  /**
   * The direct children of one element, by id — a real walk rather than a
   * regex, because "weighted sibling" is a question about depth.
   */
  const childrenOf = (xml: string, id: string): string[] => {
    const body = xml.replace(/<!--[\s\S]*?-->/g, '');
    const tag = /<(\/?)([A-Za-z][\w.]*)((?:[^<>"]|"[^"]*")*?)(\/?)>/g;
    const stack: string[] = [];
    const kids: string[] = [];
    let m: RegExpExecArray | null;
    let depth = -1;
    while ((m = tag.exec(body))) {
      const [, closing, name, attrs, selfClosing] = m;
      if (closing) {
        if (stack.length - 1 === depth) depth = -1;
        stack.pop();
        continue;
      }
      const open = `<${name}${attrs}>`;
      if (depth >= 0 && stack.length === depth + 1) kids.push(open);
      if (!selfClosing) {
        stack.push(name);
        if (attrs.includes(`@+id/${id}"`) && depth < 0) depth = stack.length - 1;
      } else if (depth >= 0 && stack.length === depth + 1) {
        // already counted above
      }
    }
    return kids;
  };

  it.each([
    ['prayer_widget_strip', 'widget_content', 'widget_practice_grid'],
    ['prayer_widget_log', 'widget_content', 'widget_log_grid'],
  ])('%s gives the whole remainder to the graph alone', (layout, parent, gridId) => {
    const kids = childrenOf(layoutXml(layout), parent);
    expect(kids.length).toBeGreaterThan(3);
    const weighted = kids.filter((k) => k.includes('android:layout_weight'));
    expect(weighted).toHaveLength(1);
    expect(weighted[0]).toContain(`@+id/${gridId}"`);
  });

  it('the strip subtracts what the card costs instead of taking a fraction', () => {
    const at = strip.indexOf('private fun gridBoxHeight(');
    expect(at).toBeGreaterThan(-1);
    const box = strip.slice(at, at + 400);
    const branches = /if \(wide\) \{([\s\S]*?)\} else \{([\s\S]*?)\n      \}/.exec(box);
    expect(branches).not.toBeNull();
    const [, wide, tall] = branches!;
    // The strip's own branch: a subtraction of named constants, no fraction.
    expect(wide).toContain('heightDp - STRIP_CHROME_DP -');
    expect(wide).toContain('STRIP_FOOT_DP');
    expect(wide).not.toMatch(/[*\/]\s*\d/);
    // The tall card's stays a share, and the comment above says why: its
    // graph sits in a wrap_content row, so the bitmap sets the row's height
    // instead of being scaled into it, and asking for too much pushes the
    // footer off the card rather than shrinking the squares.
    expect(tall).toMatch(/\* 2\) \/ 3/);
  });

  it('the log card subtracts its own, and neither scales the answer', () => {
    expect(log).toContain('val boxHeight = heightDp - LOG_CHROME_DP');
  });

  /**
   * Both numbers are measurements of the same two cards, taken the same way,
   * so they cannot drift far apart: the Log card carries one fewer band
   * above its graph than the strip does, and no month footer under it.
   */
  it('the two chromes stay within a band of each other', () => {
    const stripChrome = constOf(strip, 'STRIP_CHROME_DP');
    const logChrome = constOf(log, 'LOG_CHROME_DP');
    expect(Math.abs(stripChrome - logChrome)).toBeLessThan(40);
    // And both are big enough to be a real card's chrome rather than a
    // guess left over from a smaller layout.
    expect(stripChrome).toBeGreaterThan(160);
    expect(logChrome).toBeGreaterThan(160);
  });
});
