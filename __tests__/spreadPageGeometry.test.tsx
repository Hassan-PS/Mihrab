/**
 * The spread reader lays a page out once per size — and never against a
 * geometry from before the rotation.
 *
 * Rotating an iPad re-pairs the list, so the items are new; the size each
 * page was laid out at was then assembled from a live window height, a
 * live header height and a list height not yet re-measured, and every new
 * item was laid out at that guess before being laid out again at the
 * truth. The geometry carries the shape it was computed for now, and a
 * column draws no page until the two agree.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import {
  FOOTER_RESERVE,
  H_PADDING,
  HEADER_RESERVE,
  PAGE_ASPECT,
  spreadColumn,
  spreadGeometry,
  spreadGeometryFits,
  spreadGeometryKey,
  spreadPageWidth,
  useSettledSpreadGeometry,
  type SpreadGeometry,
  type SpreadInputs,
} from '../src/quran/spreadPageGeometry';

// iPad landscape, sidebar shown, chrome up.
const landscape: SpreadInputs = {
  width: 1180,
  height: 820,
  sideInset: 0,
  sidebarWidth: 240,
  navPad: 0,
  listH: 760,
};
const portrait: SpreadInputs = {
  ...landscape,
  width: 820,
  height: 1180,
  sidebarWidth: 0,
  listH: 1120,
};

describe('spreadGeometry', () => {
  it('has no answer before the list is measured', () => {
    expect(spreadGeometry({ ...landscape, listH: 0 })).toBeNull();
  });

  it('pairs pages in landscape and not in portrait', () => {
    expect(spreadGeometry(landscape)!.paired).toBe(true);
    expect(spreadGeometry(portrait)!.paired).toBe(false);
  });

  it('takes the sidebar and the cutout out of the item width', () => {
    expect(spreadPageWidth(1180, 20, 240)).toBe(1180 - 40 - 240);
    expect(spreadGeometry(landscape)!.pageWidth).toBe(940);
  });

  it('leaves the page the viewport less its own chrome', () => {
    const g = spreadGeometry({ ...landscape, navPad: 50 })!;
    expect(g.availH).toBe(760 - 50 - HEADER_RESERVE - FOOTER_RESERVE);
  });

  // The mini player is a flex sibling BELOW the pager: when it mounts the
  // list is re-measured shorter by its own height. Subtracting it again
  // reserved the same 68dp twice and opened a void above the player card.
  it('does not reserve the mini player twice', () => {
    const withPlayer = spreadGeometry({ ...landscape, listH: 760 - 68 })!;
    expect(withPlayer.availH).toBe(
      760 - 68 - HEADER_RESERVE - FOOTER_RESERVE,
    );
  });

  it('rounds to whole dp', () => {
    expect(spreadGeometryKey(spreadGeometry({ ...landscape, listH: 760.4 }))).toBe(
      spreadGeometryKey(spreadGeometry({ ...landscape, listH: 759.6 })),
    );
  });
});

describe('spreadGeometryFits', () => {
  it('accepts the geometry of the list on screen', () => {
    const g = spreadGeometry(landscape)!;
    expect(spreadGeometryFits(g, 940, true)).toBe(true);
  });

  it('rejects one from before a rotation, by width or by pairing', () => {
    const g = spreadGeometry(landscape)!;
    expect(spreadGeometryFits(g, 820, false)).toBe(false);
    expect(spreadGeometryFits(g, 940, false)).toBe(false);
    expect(spreadGeometryFits(null, 940, true)).toBe(false);
  });
});

describe('spreadColumn', () => {
  it('is width-fit when the column is narrow', () => {
    const { pageW, pageH } = spreadColumn(2000, 400, true);
    expect(pageW).toBe(400 - H_PADDING * 2);
    expect(pageH).toBeCloseTo(pageW / PAGE_ASPECT, 6);
  });

  it('is height-capped when the column is wide, keeping the print’s aspect', () => {
    const { pageW, pageH } = spreadColumn(600, 800, true);
    expect(pageH).toBe(600);
    expect(pageW).toBeCloseTo(600 * PAGE_ASPECT, 6);
  });

  it('divides a spread’s slack into three equal gaps', () => {
    // Height-capped, so there is slack to divide: outer, gutter, outer.
    const colW = 800;
    const { pageW, margin } = spreadColumn(600, colW, true);
    expect(margin).toBeCloseTo((colW * 2 - pageW * 2) / 3, 6);
  });

  it('centres a single page in its column', () => {
    const colW = 800;
    const { pageW, margin } = spreadColumn(600, colW, false);
    expect(margin).toBeCloseTo((colW - pageW) / 2, 6);
  });
});

// ── The settle, across a rotation ────────────────────────────────────────

function Probe({
  input,
  onValue,
}: {
  input: SpreadInputs;
  onValue: (g: SpreadGeometry | null) => void;
}) {
  onValue(useSettledSpreadGeometry(spreadGeometry(input)));
  return null;
}

function published(seen: Array<SpreadGeometry | null>): string[] {
  const out: string[] = [];
  for (const g of seen) {
    const k = spreadGeometryKey(g);
    if (out[out.length - 1] !== k) out.push(k);
  }
  return out;
}

describe('an iPad rotation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function mount(initial: SpreadInputs) {
    const seen: Array<SpreadGeometry | null> = [];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<Probe input={initial} onValue={g => seen.push(g)} />);
    });
    const set = (input: SpreadInputs) =>
      act(() => {
        root.update(<Probe input={input} onValue={g => seen.push(g)} />);
      });
    const wait = (ms: number) =>
      act(() => {
        jest.advanceTimersByTime(ms);
      });
    return { seen, set, wait };
  }

  it('publishes one geometry for the new shape', () => {
    const { seen, set, wait } = mount(landscape);
    wait(100);
    const before = published(seen).length;
    // Window swaps; the sidebar collapses (portrait cannot hold it); the
    // list re-measures — three renders, one page size.
    set({ ...landscape, width: 820, height: 1180 });
    wait(16);
    set({ ...landscape, width: 820, height: 1180, sidebarWidth: 0 });
    wait(16);
    set(portrait);
    wait(100);
    expect(published(seen).slice(before)).toEqual([
      spreadGeometryKey(spreadGeometry(portrait)),
    ]);
  });

  it('and mid-burst the old geometry does not fit the new list, so no page is laid out against it', () => {
    const { seen, set, wait } = mount(landscape);
    wait(100);
    set(portrait);
    wait(16);
    const held = seen[seen.length - 1];
    // Still the landscape geometry — held, not blanked.
    expect(held).not.toBeNull();
    expect(held!.paired).toBe(true);
    // But the reader is showing portrait items now, and this one names the
    // landscape width and pairing: it is not to be laid out against.
    expect(spreadGeometryFits(held, 820, false)).toBe(false);
    wait(100);
    expect(spreadGeometryFits(seen[seen.length - 1], 820, false)).toBe(true);
  });
});
