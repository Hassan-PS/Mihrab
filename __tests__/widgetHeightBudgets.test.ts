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
