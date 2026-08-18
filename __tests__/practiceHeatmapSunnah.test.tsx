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
 *
 * EVERY ASSERTION HERE IS ABOUT THE DISTANCE FROM THE SQUARE'S OUTER EDGE,
 * never about the raw style number. Those are not the same thing: an
 * absolutely-positioned child is laid out against its parent's padding box,
 * so on a bordered square `top: 2.5` puts the mark 4.5 from the edge and a
 * 13pt side runs off the end of a 14pt box. The first version of this file
 * asserted the raw numbers, passed, and shipped a line that overflowed every
 * fasted and every selected day. `edge()` below adds the border back.
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

/** The one square under test, as the host node the Pressable renders. */
function squareOf(tree: Renderer) {
  return tree.root.findAll(
    n =>
      typeof n.type === 'string' &&
      n.props?.testID === DAY &&
      typeof n.props?.accessibilityState?.selected === 'boolean',
  )[0];
}

/** The border the square is actually carrying — 0, or 2 if fasted/selected. */
function borderOf(tree: Renderer): number {
  const style = Object.assign(
    {},
    ...[squareOf(tree).props.style].flat(3).filter(Boolean),
  );
  return Number(style.borderWidth ?? 0);
}

/**
 * How far a mark's edge really is from the square's OUTER edge.
 *
 * The whole point of this file: the style says one thing, the parent's border
 * shifts it, and only the sum of the two is what a user sees.
 */
function edge(tree: Renderer, value: unknown): number {
  return Number(value) + borderOf(tree);
}

/** Flattened styles of every child drawn inside the square for `DAY`. */
function marks(tree: Renderer): Array<Record<string, number | string>> {
  const square = squareOf(tree);
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
  it('is thinner than the fast ring, so the yes/no stays the louder mark', async () => {
    const drawn = segments(await render({ fajr: 1 }));
    expect(drawn[0].height).toBeLessThan(FAST_BORDER);
  });

  // The bug this file exists for. A bordered square lays its children out
  // against its padding box, so the SAME style number means two different
  // distances depending on whether the day was fasted or selected. Every
  // case below is asserted at the same distance from the OUTER edge.
  for (const [name, opts] of [
    ['a plain day', {}],
    ['a fasted day', { fasted: true }],
  ] as const) {
    it(`starts the line 2.5pt from the outer edge on ${name}`, async () => {
      const tree = await render({ fajr: 1 }, opts);
      const seg = segments(tree)[0];
      expect(edge(tree, seg.top)).toBeCloseTo(2.5);
      expect(edge(tree, seg.left)).toBeCloseTo(2.5);
      // Clear of the fast border, which occupies 0…2 on every edge.
      expect(edge(tree, seg.top)).toBeGreaterThan(FAST_BORDER);
    });

    it(`closes the ring 2.5pt from the outer edge on ${name}`, async () => {
      const tree = await render(full, opts);
      const ring = marks(tree).filter(s => s.borderColor === '#9A7B1F')[0];
      for (const side of ['top', 'left', 'right', 'bottom'] as const) {
        expect(edge(tree, ring[side])).toBeCloseTo(2.5);
      }
    });

    it(`fits the whole 13pt side inside the square on ${name}`, async () => {
      // The overflow that shipped: 13pt starting 4.5 in runs to 17.5 of a
      // square whose children only have 14pt to live in.
      const tree = await render({ fajr: 1, dhuhr: 2, maghrib: 1 }, opts);
      const top = segments(tree).find(s => Number(s.height) === 1.5)!;
      const inset = edge(tree, top.top);
      expect(inset + Number(top.width)).toBeLessThanOrEqual(SQUARE - inset);
    });
  }
});

describe('the dots sit clear of both lines', () => {
  for (const [name, opts] of [
    ['a plain day', { missed: 2 }],
    ['a fasted day', { fasted: true, missed: 2 }],
  ] as const) {
    it(`keeps both dots off the gold and off the fast border on ${name}`, async () => {
      const tree = await render({ ...full, qiyam: 3 }, opts);
      const night = marks(tree).filter(s => s.backgroundColor === '#FFFFFF')[0];
      const owed = marks(tree).filter(s => s.backgroundColor === '#B91C1C')[0];
      expect(night).toBeDefined();
      expect(owed).toBeDefined();
      // The gold ends at 2.5 + 1.5 = 4 from the outer edge. Both dots start
      // past it, so neither is ever drawn over a line.
      for (const [dot, sides] of [
        [night, ['bottom', 'insetInlineStart']],
        [owed, ['top', 'insetInlineEnd']],
      ] as const) {
        for (const side of sides) {
          expect(edge(tree, dot[side])).toBeGreaterThanOrEqual(4);
        }
      }
      // Opposite corners, so a day holding both is two marks not one smudge.
      expect(night.bottom).toBeDefined();
      expect(night.top).toBeUndefined();
      expect(owed.top).toBeDefined();
      expect(owed.bottom).toBeUndefined();
      // And small enough that neither reaches the middle.
      expect(edge(tree, night.bottom) + Number(night.width)).toBeLessThan(
        SQUARE / 2,
      );
    });
  }
});
