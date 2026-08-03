/**
 * The graph is scrollable and its squares open a day.
 *
 * `practiceHeatmap.test.ts` pins the arithmetic — how many columns, which
 * ones carry a month label. This pins the two things the arithmetic cannot
 * see, and that no screenshot of a fresh install can show either, because a
 * fresh install has thirteen weeks and nothing to scroll:
 *
 *   1. A grid wider than the card is inside a HORIZONTAL ScrollView. Without
 *      it the extra columns are laid out and then clipped — the data reaches
 *      back three years and the user still sees one quarter.
 *   2. Every past square is a button that reports its day. That is the only
 *      way to reach an old day in one gesture; the arrows are one day per
 *      tap, which is fine for yesterday and useless for last March.
 */
import * as React from 'react';
import { ScrollView } from 'react-native';
import { create } from 'react-test-renderer';
import { act } from 'react';
import {
  buildHeatmap,
  PracticeHeatmap,
} from '../src/practice/PracticeHeatmap';
import { dayKey } from '../src/practice/practiceStore';

// The palette hook reaches for the settings context, which is a whole app's
// worth of providers for a component that only wants five colours.
jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    isDark: false,
    palette: {
      isDark: false,
      accentSolid: '#0F5132',
      muted: '#6B7280',
      controlBg: '#F3EFE7',
      text: '#111111',
    },
  }),
}));

const NOW = new Date(2026, 7, 6, 12, 0, 0);
const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Renderer = ReturnType<typeof create>;

async function renderGraph(weeks: number, props: Record<string, unknown> = {}) {
  const rows = buildHeatmap(new Map(), new Set(), NOW, weeks);
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <PracticeHeatmap rows={rows} weekdayLabels={LABELS} {...props} />,
    );
  });
  return { tree, rows };
}

/**
 * Every square, in render order — the host view each Pressable renders.
 *
 * Host-only on purpose: `Pressable` is a memo around a forwardRef, so
 * matching the composite returns the same square two or three times over,
 * and every count below would be a multiple of the truth.
 */
function squares(tree: Renderer) {
  return tree.root.findAll(
    n =>
      typeof n.type === 'string' &&
      typeof n.props?.accessibilityState?.selected === 'boolean',
  );
}

/** The host square for one day — addressed by its `testID`, which is the day. */
function squareFor(tree: Renderer, key: string) {
  return squares(tree).find(n => n.props.testID === key);
}

/** The pressable behind one square, for firing its handler. */
function pressableFor(tree: Renderer, key: string) {
  return tree.root.findAll(
    n =>
      typeof n.type !== 'string' &&
      n.props?.testID === key &&
      typeof n.props?.onPress === 'function',
  )[0];
}

describe('PracticeHeatmap', () => {
  it('puts the grid in a horizontal scroll view', async () => {
    const { tree } = await renderGraph(40);
    const scrolls = tree.root.findAllByType(ScrollView);
    expect(scrolls.length).toBeGreaterThan(0);
    expect(scrolls.some(s => s.props.horizontal === true)).toBe(true);
  });

  it('renders a cell for every day it was given, not just a quarter', async () => {
    const { tree } = await renderGraph(40);
    expect(squares(tree)).toHaveLength(7 * 40);
  });

  it('reports the day behind the square that was tapped', async () => {
    const seen: string[] = [];
    const { tree, rows } = await renderGraph(20, {
      onSelectDay: (k: string) => seen.push(k),
    });
    // Row 0 is Monday; column 0 is the oldest week on the graph — the square
    // furthest from today, and the whole point of the change.
    const oldestMonday = rows[0][0].key;
    const cell = pressableFor(tree, oldestMonday);
    expect(cell).toBeDefined();
    await act(async () => {
      cell.props.onPress();
    });
    expect(seen).toEqual([oldestMonday]);
  });

  it('marks the selected day and nothing else', async () => {
    const selectedKey = dayKey(new Date(2026, 6, 15));
    const { tree } = await renderGraph(20, { selectedKey });
    const selected = squares(tree).filter(
      n => n.props.accessibilityState.selected,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].props.testID).toBe(selectedKey);
  });

  it('will not open a day that has not happened', async () => {
    const { tree, rows } = await renderGraph(13, { onSelectDay: () => {} });
    // Saturday of the current week, with today a Thursday.
    const future = rows[5][12];
    expect(future.future).toBe(true);
    expect(squareFor(tree, future.key)!.props.accessibilityState.disabled).toBe(
      true,
    );
    // And a day that HAS happened stays open.
    expect(
      squareFor(tree, rows[0][0].key)!.props.accessibilityState.disabled,
    ).toBe(false);
  });

  it('is read-only when no handler is passed', async () => {
    const { tree } = await renderGraph(13);
    for (const cell of squares(tree)) {
      expect(cell.props.accessibilityState.disabled).toBe(true);
    }
  });
});
