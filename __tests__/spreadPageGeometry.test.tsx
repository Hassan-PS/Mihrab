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
import { readFileSync } from 'fs';
import path from 'path';

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

// iPad landscape, sidebar shown, chrome up. Every box is MEASURED: the
// content row is the window less its cutout inset, and the list is that
// row less the 240dp sidebar beside it.
const landscape: SpreadInputs = {
  listW: 940,
  listH: 760,
  boxW: 1180,
  boxH: 820,
  navPad: 0,
};
const portrait: SpreadInputs = {
  ...landscape,
  listW: 820,
  listH: 1120,
  boxW: 820,
  boxH: 1180,
};

describe('spreadGeometry', () => {
  it('has no answer before the list is measured', () => {
    expect(spreadGeometry({ ...landscape, listH: 0 })).toBeNull();
    expect(spreadGeometry({ ...landscape, listW: 0 })).toBeNull();
    expect(spreadGeometry({ ...landscape, boxW: 0 })).toBeNull();
  });

  it('pairs pages in landscape and not in portrait', () => {
    expect(spreadGeometry(landscape)!.paired).toBe(true);
    expect(spreadGeometry(portrait)!.paired).toBe(false);
  });

  /**
   * The item is the measured viewport and nothing else — no window size,
   * no sidebar term, no cutout term. Those were an arithmetic model of
   * this number, and on Mac Catalyst the window size the model started
   * from went stale the moment the window moved to another display: the
   * reader laid a wide landscape window out as a portrait one, a third
   * page crept in past the two on screen, and the leftmost ran under the
   * sidebar. A measured viewport cannot disagree with itself.
   */
  it('is the measured viewport, whatever the window says', () => {
    expect(spreadPageWidth(940)).toBe(940);
    expect(spreadGeometry(landscape)!.pageWidth).toBe(940);
  });

  it('pairs on the content row, not on the list beside the sidebar', () => {
    // A window with room for a spread AND a sidebar: the list alone is
    // taller than it is wide, and pairing off that would collapse a
    // spread the window has the room for.
    const g = spreadGeometry({
      ...landscape,
      boxW: 1180,
      boxH: 820,
      listW: 700,
      listH: 760,
    })!;
    expect(g.paired).toBe(true);
    expect(g.pageWidth).toBe(700);
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
    // The width too, and rounded inside `spreadPageWidth` so the live
    // value and the settled one round identically — `spreadGeometryFits`
    // compares them for equality.
    expect(spreadGeometryKey(spreadGeometry({ ...landscape, listW: 940.4 }))).toBe(
      spreadGeometryKey(spreadGeometry({ ...landscape, listW: 939.6 })),
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
    // The content row re-measures; the sidebar collapses (portrait cannot
    // hold it) so the list gets the width back; then the list itself
    // re-measures — three renders, one page size.
    set({ ...landscape, boxW: 820, boxH: 1180 });
    wait(16);
    set({ ...landscape, boxW: 820, boxH: 1180, listW: 820 });
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


/**
 * ── THE READER MUST NOT GO BACK TO ASKING THE WINDOW ──────────────────
 *
 * Reported on the Mac (2026-09-20): opening the khatmah, and swiping to
 * the muṣḥaf from another full-screen Space, drew THREE page columns in a
 * two-page window — the leftmost running under the index sidebar — with a
 * full set of chrome on each, before the reader corrected itself.
 *
 * The item width was `window.width - sideInset * 2 - sidebarWidth`, an
 * arithmetic model of the list's viewport. `useWindowDimensions` is the
 * first term, and on Catalyst it lags a Space switch and a move between
 * displays — so the model described a window that was not on screen: too
 * narrow, so items no longer filled the viewport and the neighbouring
 * spread showed past them, and portrait-shaped, so the pairing came out
 * single-page and every column drew both the juz label and the night
 * pill.
 *
 * `readerChromeStaysLive` is the same family of fault from six weeks
 * earlier: a view holding the layout it was given at the old width
 * because nothing in its inputs changed when the window did. The answer
 * there was to key on the settled size; the answer here is to stop
 * modelling the box at all and measure it.
 *
 * Asserted against the source, in the idiom of `mushafRenderChurn`: the
 * property is about where a number COMES FROM, which a rendered tree
 * cannot show once the number is correct either way.
 */
describe('the spread reader measures its box', () => {
  const src = readFileSync(
    path.join(__dirname, '..', 'src', 'quran', 'MushafSpreadReader.tsx'),
    'utf8',
  );

  it('takes the item width from the measured list, not the window', () => {
    expect(src).toMatch(/spreadPageWidth\(\s*list\.w \|\|/);
    // The old shape, in any spelling: the window's width with the sidebar
    // and the cutout subtracted off it.
    expect(src).not.toMatch(/spreadPageWidth\(\s*width,/);
  });

  it('pairs and shows the sidebar off the measured content row', () => {
    expect(src).toMatch(/const paired = boxW > boxH;/);
    // The width rule itself lives with the sidebar now — the muṣḥaf's
    // header asks it too, to centre its title over the page rather than
    // the window (mushafHeaderOverPage.test.ts).
    expect(src).toMatch(/showSidebar =[\s\S]{0,40}sidebarShown\(boxW\)/);
    expect(src).not.toMatch(/const paired = width > height;/);
  });

  it('feeds the geometry the measured boxes', () => {
    expect(src).toMatch(/listW: list\.w,[\s\S]{0,80}boxW: box\.w,/);
  });

  /**
   * `onLayout` fires on every re-layout, not only on a change. Writing
   * state unconditionally from it is a render loop with a long fuse — it
   * only shows up once something else re-renders the reader on a timer.
   */
  it('writes the measured boxes only when they actually change', () => {
    const guards = src.match(/prev\.w === w && prev\.h === h \? prev :/g) ?? [];
    expect(guards).toHaveLength(2);
  });
});
