/**
 * Emphasis — the graph's answer to "which days do I owe?".
 *
 * The missed dot is 4pt on an 18pt square, and a day that went four-of-five
 * is a strong green square that camouflages it. Telling someone they owe
 * three prayers and leaving them to find three dots among ninety-one squares
 * is most of a feature. So instead of a seventh permanent encoding, the grid
 * gains a MODE: everything that is not being looked for drops back, and the
 * days that are stay lit.
 *
 * The three things worth pinning, because each is a way the mode could be
 * subtly wrong on a device and still look fine in a screenshot:
 *
 *   1. Off by default. `emphasise` unset must dim nothing at all — the Home
 *      card renders this same component and never asks for a mode.
 *   2. The named days keep full strength; every other PAST day drops.
 *   3. Future days never dim. They are already transparent, so dimming them
 *      does nothing visible but does say "these were considered and rejected",
 *      which is a claim about days that have not happened.
 */
import * as React from 'react';
import { create } from 'react-test-renderer';
import { act } from 'react';
import { buildHeatmap, PracticeHeatmap } from '../src/practice/PracticeHeatmap';
import { dayKey } from '../src/practice/practiceStore';

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

/** A Thursday, so the same week still has three days of future in it. */
const NOW = new Date(2026, 7, 6, 12, 0, 0);
const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const OWED = dayKey(new Date(2026, 6, 15));
const CLEAR = dayKey(new Date(2026, 6, 16));
const FUTURE = dayKey(new Date(2026, 7, 8));

type Renderer = ReturnType<typeof create>;

async function render(emphasise?: Set<string>, selectedKey?: string) {
  const rows = buildHeatmap(
    new Map([
      // One day owing a prayer, one day that went perfectly. Both have marks,
      // so neither can be dimmed by accident through the empty-day path.
      [OWED, { kept: 4, logged: 5, missed: 1 }],
      [CLEAR, { kept: 5, logged: 5, missed: 0 }],
    ]),
    new Set<string>(),
    NOW,
    13,
    {},
  );
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <PracticeHeatmap
        rows={rows}
        weekdayLabels={LABELS}
        emphasise={emphasise}
        selectedKey={selectedKey}
      />,
    );
  });
  return tree;
}

/** The filled square inside a day's Pressable, by date. */
function squareOf(tree: Renderer, key: string) {
  const cell = tree.root.find(
    n =>
      typeof n.type === 'string' &&
      n.props?.testID === key &&
      typeof n.props?.accessibilityState?.selected === 'boolean',
  );
  return cell.findAll(
    n => typeof n.type === 'string' && Array.isArray(n.props?.style),
    { deep: false },
  )[0];
}

/**
 * Whether a square has been dropped back.
 *
 * Read as "is there an opacity below 1 anywhere in the flattened style",
 * rather than "does it equal 0.16" — the assertion is about the day being
 * de-emphasised, not about the exact step, which is a design value that may
 * move without the behaviour changing.
 */
function dimmed(node: ReturnType<typeof squareOf>): boolean {
  const flat = (node.props.style as unknown[]).flat(4).filter(Boolean);
  return flat.some(
    s =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as { opacity?: number }).opacity === 'number' &&
      (s as { opacity: number }).opacity < 1,
  );
}

describe('emphasis is a mode, not a permanent encoding', () => {
  it('dims nothing when no set is given', async () => {
    const tree = await render(undefined);
    for (const key of [OWED, CLEAR, FUTURE]) {
      expect(dimmed(squareOf(tree, key))).toBe(false);
    }
  });

  it('keeps the named days lit and drops every other past day', async () => {
    const tree = await render(new Set([OWED]));
    expect(dimmed(squareOf(tree, OWED))).toBe(false);
    expect(dimmed(squareOf(tree, CLEAR))).toBe(true);
  });

  it('never dims a day that has not happened', async () => {
    const tree = await render(new Set([OWED]));
    expect(dimmed(squareOf(tree, FUTURE))).toBe(false);
  });

  it('never dims the day the screen is showing', async () => {
    // The selected square is not data, it is where you are. Dimming it
    // removes the only fixed point on the grid at exactly the moment the
    // rest of it has gone quiet — the mode then looks like a bug.
    const tree = await render(new Set([OWED]), CLEAR);
    expect(dimmed(squareOf(tree, CLEAR))).toBe(false);
  });

  it('dims everything past when the set is empty', async () => {
    // An empty set is a real state — the owed list can drain to nothing
    // while the mode is still open — and it must not be mistaken for
    // "unset". `undefined` means no mode; empty means nothing matched.
    const tree = await render(new Set<string>());
    expect(dimmed(squareOf(tree, OWED))).toBe(true);
    expect(dimmed(squareOf(tree, CLEAR))).toBe(true);
    expect(dimmed(squareOf(tree, FUTURE))).toBe(false);
  });
});
