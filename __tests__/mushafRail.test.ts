/**
 * The page rail's drag, run without a finger.
 *
 * The rail used to be a `jumpToPage` per touch sample, which is the whole
 * reader re-rendering sixty times a second. What replaced it is a number
 * that moves — and a rule for how fast it moves that depends on the OTHER
 * axis, so that a 604-page rail across a phone can still pick one page.
 */
import fs from 'fs';
import path from 'path';

import {
  createRailDrag,
  fractionForPage,
  GRAB_RADIUS,
  juzTickFractions,
  pageForFraction,
  SCRUB_TIERS,
  scrubTier,
  TIER_HYSTERESIS,
} from '../src/quran/mushafRail';

const TOTAL = 604;
const W = 300;

describe('the rail runs right to left', () => {
  it('puts page 1 at the right end and the last page at the left', () => {
    expect(fractionForPage(1, TOTAL)).toBe(1);
    expect(fractionForPage(TOTAL, TOTAL)).toBe(0);
    expect(pageForFraction(1, TOTAL)).toBe(1);
    expect(pageForFraction(0, TOTAL)).toBe(TOTAL);
  });

  it('inverts exactly', () => {
    for (let p = 1; p <= TOTAL; p += 7) {
      expect(pageForFraction(fractionForPage(p, TOTAL), TOTAL)).toBe(p);
    }
  });
});

describe('a grab', () => {
  it('away from the knob puts the page under the finger', () => {
    // Page 1 → knob at the right end. A touch in the middle is page ~302.
    const d = createRailDrag({ total: TOTAL, width: W, page: 1, grabX: W / 2 });
    expect(d.page()).toBe(pageForFraction(0.5, TOTAL));
  });

  it('on the knob picks it up where it is', () => {
    const at = 300;
    const knobX = fractionForPage(at, TOTAL) * W;
    const d = createRailDrag({
      total: TOTAL,
      width: W,
      page: at,
      grabX: knobX + GRAB_RADIUS - 1,
    });
    expect(d.page()).toBe(at);
  });

  it('just past the knob is a jump, not a pick-up', () => {
    const at = 300;
    const knobX = fractionForPage(at, TOTAL) * W;
    const d = createRailDrag({
      total: TOTAL,
      width: W,
      page: at,
      grabX: knobX + GRAB_RADIUS + 6,
    });
    expect(d.page()).not.toBe(at);
  });
});

describe('a move at full speed', () => {
  it('keeps the page exactly under the finger', () => {
    const d = createRailDrag({ total: TOTAL, width: W, page: 1, grabX: W });
    for (const x of [280, 220, 150, 75, 0]) {
      expect(d.move(x - W, 0).page).toBe(pageForFraction(x / W, TOTAL));
    }
  });

  it('goes back towards page 1 when moving right', () => {
    const d = createRailDrag({ total: TOTAL, width: W, page: 300, grabX: 0 });
    const start = d.page();
    expect(d.move(40, 0).page).toBeLessThan(start);
  });

  it('is clamped at both ends', () => {
    const d = createRailDrag({ total: TOTAL, width: W, page: 300, grabX: W / 2 });
    expect(d.move(5000, 0).page).toBe(1);
    expect(d.move(-5000, 0).page).toBe(TOTAL);
  });
});

describe('sliding away from the rail', () => {
  it('halves the speed in the second band', () => {
    const full = createRailDrag({ total: TOTAL, width: W, page: 302, grabX: W / 2 });
    const half = createRailDrag({ total: TOTAL, width: W, page: 302, grabX: W / 2 });
    const from = full.page();
    const dy = SCRUB_TIERS[1].from + TIER_HYSTERESIS;
    const a = full.move(-60, 0).page - from;
    const b = half.move(-60, dy).page - from;
    expect(Math.abs(b - a / 2)).toBeLessThanOrEqual(1);
  });

  it('reaches a tenth of the speed at the far band — one page per few points', () => {
    const d = createRailDrag({ total: TOTAL, width: W, page: 302, grabX: W / 2 });
    const from = d.page();
    d.move(0, 400); // reach out first, without travelling
    const moved = d.move(-20, 400).page - from;
    // 20 dp at full speed is ~40 pages; at a tenth it is ~4.
    expect(Math.abs(moved)).toBeLessThanOrEqual(5);
    expect(Math.abs(moved)).toBeGreaterThanOrEqual(3);
  });

  it('changes the speed of what FOLLOWS, never the page already under the finger', () => {
    const d = createRailDrag({ total: TOTAL, width: W, page: 302, grabX: W / 2 });
    const there = d.move(-50, 0).page;
    // Reaching up with no sideways travel must not move the page.
    expect(d.move(-50, 300).page).toBe(there);
    expect(d.tier()).toBe(SCRUB_TIERS.length - 1);
  });

  it('is symmetric — below the rail counts the same as above', () => {
    expect(scrubTier(200, 0)).toBe(scrubTier(-200, 0));
  });
});

describe('the tier boundary has hysteresis', () => {
  const edge = SCRUB_TIERS[1].from;
  it('is not crossed by a thumb resting on it', () => {
    expect(scrubTier(edge, 0)).toBe(0);
    expect(scrubTier(edge + TIER_HYSTERESIS - 1, 0)).toBe(0);
    expect(scrubTier(edge + TIER_HYSTERESIS, 0)).toBe(1);
  });
  it('is held once entered until the finger has clearly come back', () => {
    expect(scrubTier(edge, 1)).toBe(1);
    expect(scrubTier(edge - TIER_HYSTERESIS + 1, 1)).toBe(1);
    expect(scrubTier(edge - TIER_HYSTERESIS - 1, 1)).toBe(0);
  });
  it('can skip bands in one reach', () => {
    expect(scrubTier(1000, 0)).toBe(SCRUB_TIERS.length - 1);
    expect(scrubTier(0, SCRUB_TIERS.length - 1)).toBe(0);
  });
});

describe('the tick marks', () => {
  it('are the twenty-nine juz boundaries after the first, right to left', () => {
    const ticks = juzTickFractions();
    expect(ticks).toHaveLength(29);
    for (const f of ticks) {
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1);
    }
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeLessThan(ticks[i - 1]);
    }
  });
});

describe('the component keeps the reader out of the drag', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src/quran/MushafPageScrubber.tsx'),
    'utf8',
  );
  it('commits on release, and only on release', () => {
    expect(source).toContain('onPanResponderRelease: finish');
    expect(source).toContain('onPanResponderTerminate: finish');
    const move = source.slice(
      source.indexOf('onPanResponderMove'),
      source.indexOf('onPanResponderRelease'),
    );
    expect(move).not.toContain('onSelectPage');
  });
  it('is not given up to the pager while the finger reaches for a slower speed', () => {
    expect(source).toContain('onPanResponderTerminationRequest: () => false');
  });
});
