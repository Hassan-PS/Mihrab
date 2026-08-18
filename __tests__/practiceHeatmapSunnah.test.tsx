/**
 * The gold line round a square, and the two dots that must stay clear of it.
 *
 * `sunnah.test.ts` proves `ringSegments` returns the right four numbers. This
 * proves the square actually DRAWS them — and, more importantly, pins the
 * geometry, which is the part no unit test of arithmetic can see and no
 * screenshot review reliably catches:
 *
 *   1. The line is drawn INCREMENTALLY round the square. A day one sunnah in
 *      shows a stub on one side, not a faint ring on all four — the whole
 *      reason it stopped being an opacity ramp.
 *   2. It sits INSIDE the fasting border and never touches it, so a day that
 *      was both fasted and prayed reads as two rings rather than one thick
 *      smeared rim.
 *   3. Both corner dots clear BOTH lines. They used to sit under the fast
 *      border and across the gold, which on a day carrying all three marks
 *      made it impossible to tell which was which.
 */
import * as React from 'react';
import { create } from 'react-test-renderer';
import { act } from 'react';
import { buildHeatmap, PracticeHeatmap } from '../src/practice/PracticeHeatmap';
import { dayKey } from '../src/practice/practiceStore';
import type { SunnahDay, SunnahLog } from '../src/journal/sunnah';
import { EMPTY_DAY } from '../src/journal/sunnah';

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      isDark: false,
      accentSolid: '#0F5132',
      muted: '#6B7280',
      controlBg: '#F3EFE7',
      text: '#111111',
      danger: '#B91C1C',
    },
  }),
}));

const NOW = new Date(2026, 7, 6, 12, 0, 0);
const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY = dayKey(new Date(2026, 6, 15));

/** The square is 18pt; the fast border is 2pt, drawn inside it by RN. */
const SQUARE = 18;
const FAST_BORDER = 2;

const full: SunnahDay = {
  fajr: 1,
  dhuhr: 2,
  maghrib: 1,
  isha: 2,
  witr: true,
  qiyam: 0,
};

type Renderer = ReturnType<typeof create>;

async function render(
  day: Partial<SunnahDay>,
  opts: { fasted?: boolean; missed?: number } = {},
) {
  const log: SunnahLog = { [DAY]: { ...EMPTY_DAY, ...day } };
  const rows = buildHeatmap(
    new Map([
      [DAY, { kept: 0, logged: opts.missed ?? 0, missed: opts.missed ?? 0 }],
    ]),
    opts.fasted ? new Set([DAY]) : new Set<string>(),
    NOW,
    13,
    log,
  );
  let tree!: Renderer;
  await act(async () => {
    tree = create(<PracticeHeatmap rows={rows} weekdayLabels={LABELS} />);
  });
  return tree;
}

/** Flattened styles of every child drawn inside the square for `DAY`. */
function marks(tree: Renderer): Array<Record<string, number | string>> {
  const square = tree.root.findAll(
    n =>
      typeof n.type === 'string' &&
      n.props?.testID === DAY &&
      typeof n.props?.accessibilityState?.selected === 'boolean',
  )[0];
  return (square.props.children as unknown[])
    .flat(3)
    .filter(
      (c): c is { props: { style: unknown } } =>
        c != null && typeof c === 'object' && 'props' in c,
    )
    .map(c => Object.assign({}, ...[c.props.style].flat(3).filter(Boolean)));
}

/** The gold segments: absolutely-positioned children with a background. */
function segments(tree: Renderer) {
  return marks(tree).filter(
    s => s.backgroundColor === '#9A7B1F' && s.position === 'absolute',
  );
}

describe('the sunnah line is drawn round the square, not faded in', () => {
  it('draws nothing at all on a day with no sunnah', async () => {
    expect(segments(await render({}))).toHaveLength(0);
  });

  it('draws ONE short side for a day that is one sunnah in', async () => {
    // 1 of 7 is under a quarter, so the whole line lives on the top edge.
    const drawn = segments(await render({ fajr: 1 }));
    expect(drawn).toHaveLength(1);
    // A stub, not the whole side — this is the part an opacity ramp lost.
    expect(drawn[0].width).toBeGreaterThan(0);
    expect(drawn[0].width).toBeLessThan(SQUARE / 2);
    expect(drawn[0].height).toBe(1.5);
  });

  it('grows strictly as the day fills, never jumping to the far side', async () => {
    const covered = async (day: Partial<SunnahDay>) =>
      segments(await render(day)).reduce(
        (a, s) => a + Math.max(Number(s.width), Number(s.height)),
        0,
      );
    const one = await covered({ fajr: 1 });
    const three = await covered({ fajr: 1, dhuhr: 2 });
    const six = await covered({ fajr: 1, dhuhr: 2, maghrib: 1, isha: 2 });
    expect(three).toBeGreaterThan(one);
    expect(six).toBeGreaterThan(three);
  });

  it('closes into a single ring — not four segments — on a complete day', async () => {
    const tree = await render(full);
    expect(segments(tree)).toHaveLength(0);
    const ring = marks(tree).filter(s => s.borderColor === '#9A7B1F');
    expect(ring).toHaveLength(1);
    expect(ring[0].borderWidth).toBe(1.5);
  });
});

describe('the line stays inside the fasting ring', () => {
  it('never overlaps the fast border, however full the day is', async () => {
    const tree = await render(full, { fasted: true });
    const ring = marks(tree).filter(s => s.borderColor === '#9A7B1F')[0];
    // The fast border occupies 0…2 on every edge. The gold starts past it.
    for (const edge of ['top', 'left', 'right', 'bottom'] as const) {
      expect(Number(ring[edge])).toBeGreaterThan(FAST_BORDER);
    }
  });

  it('is thinner than the fast ring, so the yes/no stays the louder mark', async () => {
    const drawn = segments(await render({ fajr: 1 }));
    expect(drawn[0].height).toBeLessThan(FAST_BORDER);
  });
});

describe('the dots sit clear of both lines', () => {
  it('keeps the night-prayer dot off the gold and off the fast border', async () => {
    const tree = await render({ ...full, qiyam: 3 }, { fasted: true });
    const dot = marks(tree).filter(s => s.backgroundColor === '#FFFFFF')[0];
    expect(dot).toBeDefined();
    // Inside the gold line, which ends at 2.5 + 1.5 = 4.
    expect(Number(dot.bottom)).toBeGreaterThanOrEqual(4);
    expect(Number(dot.insetInlineStart)).toBeGreaterThanOrEqual(4);
    // And small enough that the far side of it does not reach the middle.
    expect(Number(dot.width) + Number(dot.bottom)).toBeLessThan(SQUARE / 2);
  });

  it('keeps the missed dot off them too, in the opposite corner', async () => {
    const tree = await render(
      { ...full, qiyam: 3 },
      { fasted: true, missed: 2 },
    );
    const dot = marks(tree).filter(s => s.backgroundColor === '#B91C1C')[0];
    expect(dot).toBeDefined();
    expect(Number(dot.top)).toBeGreaterThanOrEqual(4);
    expect(Number(dot.insetInlineEnd)).toBeGreaterThanOrEqual(4);
    // Opposite corners, so a day holding both is two marks not one smudge.
    const white = marks(tree).filter(s => s.backgroundColor === '#FFFFFF');
    for (const w of white) {
      expect(w.bottom).toBeDefined();
      expect(w.top).toBeUndefined();
    }
  });
});
