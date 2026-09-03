/**
 * Guards the work the mushaf reader does NOT do.
 *
 * Measured on an emulator: one fullscreen toggle used to lay every mounted
 * page out four times, at four different heights. Two causes, both here.
 *
 * 1. The chrome leaves in stages — nav header, status bar, safe-area insets —
 *    and the list re-measured after each, publishing a viewport that was on
 *    its way somewhere else. `useSettledMeasure` waits for it to stop.
 * 2. `onToggleFullscreen` was an inline arrow on the screen. A tap anywhere on
 *    a page toggles fullscreen, so that one function reached all fifteen lines
 *    of every mounted page through three components, changing identity on
 *    every render of the screen — no memo in the chain could hold.
 *
 * Eight page layouts per toggle became two.
 */
import React, { act, useState } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import {
  getPageLayout,
  lineTokenStream,
  pageBlockEm,
  pageMeasureEm,
  _resetLayoutCache,
} from '../src/quran/mushafLayout';

// ── Size-independent layout is derived once ──────────────────────────────

describe('page layout is derived once, not per render', () => {
  beforeEach(() => {
    _resetLayoutCache();
  });

  test('a line hands back the same decomposition every time', () => {
    const layout = getPageLayout(49);
    expect(layout).not.toBeNull();
    const line = layout!.lines.find(l => l.kind === 'ayah')!;
    const first = lineTokenStream(line);
    expect(first.length).toBeGreaterThan(0);
    // Identity, not just equality: this is what lets React skip the subtree.
    expect(lineTokenStream(line)).toBe(first);
  });

  test('the measure and the block are computed once per page', () => {
    const layout = getPageLayout(49)!;
    const measure = pageMeasureEm(layout);
    expect(measure).toBeGreaterThan(0);
    expect(pageMeasureEm(layout)).toBe(measure);
    expect(pageBlockEm(layout)).toBeCloseTo(measure + 0.5, 10);
  });

  test('the cache is per line, not shared between pages', () => {
    const lineA = getPageLayout(49)!.lines.find(l => l.kind === 'ayah')!;
    const lineB = getPageLayout(50)!.lines.find(l => l.kind === 'ayah')!;
    expect(lineTokenStream(lineA)).not.toBe(lineTokenStream(lineB));
  });
});

// ── A settled measurement ────────────────────────────────────────────────

import { useSettledMeasure } from '../src/quran/mushafReaderCore';

function SettleProbe({
  value,
  onValue,
}: {
  value: number;
  onValue: (v: number) => void;
}) {
  onValue(useSettledMeasure(value, 100));
  return null;
}

describe('useSettledMeasure', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function mount(initial: number) {
    const seen: number[] = [];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <SettleProbe value={initial} onValue={v => seen.push(v)} />,
      );
    });
    const set = (v: number) =>
      act(() => {
        root.update(<SettleProbe value={v} onValue={x => seen.push(x)} />);
      });
    return { seen, set };
  }

  test('takes the first real measurement immediately', () => {
    const { seen, set } = mount(0);
    set(800);
    expect(seen[seen.length - 1]).toBe(800);
  });

  test('a burst of intermediate sizes publishes only the last', () => {
    const { seen, set } = mount(0);
    set(800);
    const published = seen.length;
    // The shape a real fullscreen toggle produced: 780, 790, then 900,
    // 32-65 ms apart.
    for (const [v, gap] of [
      [780, 32],
      [790, 65],
    ] as Array<[number, number]>) {
      set(v);
      act(() => {
        jest.advanceTimersByTime(gap);
      });
      expect(seen[seen.length - 1]).toBe(800); // nothing mid-burst
    }
    set(900);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(seen[seen.length - 1]).toBe(900);
    // 780 and 790 never reached the page at all.
    expect(seen.slice(published)).not.toContain(780);
    expect(seen.slice(published)).not.toContain(790);
  });
});

// ── The page body is not rebuilt for an unrelated render ─────────────────

const pageRenders: Array<Record<string, unknown>> = [];

jest.mock('../src/quran/MushafTextPage', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    pageRenders.push(props);
    return null;
  },
}));

jest.mock('../src/quran/useMushafPageFont', () => ({
  useMushafPageFont: () => ({ family: 'MihrabMushaf0', failed: false }),
}));

import MushafTextPageSurface from '../src/quran/MushafTextPageSurface';

function Harness({ onWordPress }: { onWordPress: () => void }) {
  const [, bump] = useState(0);
  return (
    <>
      <MushafTextPageSurface
        page={49}
        width={360}
        height={700}
        tone="paper"
        accentColor="#2E6B4F"
        selected={null}
        playing={null}
        onWordPress={onWordPress}
      />
      {/* Stands in for everything else on the screen that re-renders. */}
      <TriggerRerender bump={bump} />
    </>
  );
}

let triggerRerender: (() => void) | null = null;
function TriggerRerender({ bump }: { bump: (f: (n: number) => number) => void }) {
  triggerRerender = () => bump(n => n + 1);
  return null;
}

describe('a mushaf page survives a re-render of the screen around it', () => {
  beforeEach(() => {
    pageRenders.length = 0;
  });

  test('does not rebuild when the parent re-renders with stable props', () => {
    const stable = () => {};
    act(() => {
      create(<Harness onWordPress={stable} />);
    });
    expect(pageRenders).toHaveLength(1);

    act(() => {
      triggerRerender?.();
    });
    // The page's props did not change, so its ~260 drawn pieces are not
    // rebuilt — this is the memo the inline arrow used to defeat.
    expect(pageRenders).toHaveLength(1);
  });

  test('an unstable handler is what breaks it', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<Harness onWordPress={() => {}} />);
    });
    expect(pageRenders).toHaveLength(1);
    // A fresh arrow, exactly as the screen used to pass on every render.
    act(() => {
      root.update(<Harness onWordPress={() => {}} />);
    });
    expect(pageRenders).toHaveLength(2);
  });

  test('the page is bound to the handler, so the reader can pass one callback', () => {
    const longPress = jest.fn();
    act(() => {
      create(
        <MushafTextPageSurface
          page={49}
          width={360}
          height={700}
          tone="paper"
          accentColor="#2E6B4F"
          onWordLongPress={longPress}
        />,
      );
    });
    const handler = pageRenders[0].onWordLongPress as (
      ref: { surah: number; ayah: number },
    ) => void;
    handler({ surah: 3, ayah: 5 });
    expect(longPress).toHaveBeenCalledWith({ surah: 3, ayah: 5 }, 49);
  });
});

// ── The readers do not reintroduce it one level down ─────────────────────

describe('the readers hand the page a handler, not an arrow around one', () => {
  // The screen learned this (above) and both split readers then wrote
  // `onWordPress={() => onToggleFullscreen()}` — a new function on every
  // render of the list, reaching all fifteen lines of every mounted page
  // through three memos. Every page turn and every recited ayah rebuilt
  // ~250 pieces per page.
  const read = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('fs').readFileSync(require('path').join(__dirname, '..', p), 'utf8') as string;

  it.each(['MushafSpreadReader.tsx', 'MushafPhoneReader.tsx'])('%s', file => {
    const src = read(`src/quran/${file}`);
    expect(src).not.toMatch(/onWordPress=\{\(\)\s*=>/);
    expect(src).not.toMatch(/onWordLongPress=\{\(/);
  });

  it('and the marks are keyed on what they read, not on the whole state', () => {
    // Every page turn writes `lastRead`, which is a new state object; with
    // the state as the key the marks — and the tint every line memoises on
    // — were rebuilt on the turn that should have touched nothing.
    const core = read('src/quran/mushafReaderCore.tsx');
    expect(core).toMatch(/\[quran\.bookmarks, plan\],?\s*\n\s*\);/);
    expect(core).not.toMatch(/\}, \[quran\]\);/);
  });
});
