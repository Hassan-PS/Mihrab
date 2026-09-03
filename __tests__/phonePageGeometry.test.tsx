/**
 * A phone page is laid out once per size, not once per input.
 *
 * Rotation used to cost three layouts of every mounted page and the
 * fullscreen toggle two — see the head of phonePageGeometry.ts. The inputs
 * that decide the page's box arrive on different frames, and each one was
 * fed straight to the text engine. They are one value now, and it is that
 * value that settles.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import {
  geometryKey,
  phonePageGeometry,
  phonePageWidth,
  useSettledGeometry,
  type PhonePageGeometry,
  type PhonePageInputs,
} from '../src/quran/phonePageGeometry';

const portrait: PhonePageInputs = {
  width: 390,
  height: 844,
  sideInset: 0,
  navPad: 96,
  listH: 720,
};

describe('phonePageGeometry', () => {
  it('has no answer before the list is measured', () => {
    expect(phonePageGeometry({ ...portrait, listH: 0 })).toBeNull();
  });

  it('fits the page to the viewport in portrait', () => {
    const g = phonePageGeometry(portrait)!;
    expect(g.scrolling).toBe(false);
    expect(g.textWidth).toBe(390 - 20);
    expect(g.viewportH).toBe(720 - 96 - 34 - 42);
  });

  it('zooms and scrolls in landscape', () => {
    const g = phonePageGeometry({
      ...portrait,
      width: 844,
      height: 390,
      sideInset: 44,
      listH: 300,
    })!;
    expect(g.scrolling).toBe(true);
    // The short side is the portrait page width, zoomed.
    expect(g.textWidth).toBe(Math.round(390 * 1.6));
    expect(phonePageWidth(844, 44)).toBe(844 - 88);
  });

  it('rounds to whole dp, so a sub-pixel wobble is not a new page', () => {
    const a = phonePageGeometry({ ...portrait, listH: 720.4 });
    const b = phonePageGeometry({ ...portrait, listH: 719.6 });
    expect(geometryKey(a)).toBe(geometryKey(b));
  });
});

// ── The settle ───────────────────────────────────────────────────────────

function Probe({
  input,
  onValue,
}: {
  input: PhonePageInputs;
  onValue: (g: PhonePageGeometry | null) => void;
}) {
  onValue(useSettledGeometry(phonePageGeometry(input)));
  return null;
}

/** Distinct geometries that reached the page, in order. */
function published(seen: Array<PhonePageGeometry | null>): string[] {
  const out: string[] = [];
  for (const g of seen) {
    const k = geometryKey(g);
    if (out[out.length - 1] !== k) out.push(k);
  }
  return out;
}

describe('useSettledGeometry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function mount(initial: PhonePageInputs) {
    const seen: Array<PhonePageGeometry | null> = [];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<Probe input={initial} onValue={g => seen.push(g)} />);
    });
    const set = (input: PhonePageInputs) =>
      act(() => {
        root.update(<Probe input={input} onValue={g => seen.push(g)} />);
      });
    const wait = (ms: number) =>
      act(() => {
        jest.advanceTimersByTime(ms);
      });
    return { seen, set, wait };
  }

  it('publishes nothing until the list is measured', () => {
    const { seen } = mount({ ...portrait, listH: 0 });
    expect(seen.every(g => g == null)).toBe(true);
  });

  it('opens with one geometry, after the inputs have held still', () => {
    const { seen, set, wait } = mount({ ...portrait, listH: 0 });
    set(portrait);
    // iOS reports the header's estimate first and its measured height a
    // frame later; a page laid out against the estimate was a second
    // layout waiting to happen.
    wait(16);
    set({ ...portrait, navPad: 100 });
    wait(100);
    expect(published(seen)).toEqual([
      '',
      geometryKey(phonePageGeometry({ ...portrait, navPad: 100 })),
    ]);
  });

  it('a rotation publishes ONE geometry, not three', () => {
    const { seen, set, wait } = mount(portrait);
    wait(100);
    const before = published(seen).length;
    // The shape a real rotation has: the window swaps at once, the notch
    // moves to a side a render later, and the list re-measures after that
    // — each of which used to be a layout of every mounted page.
    set({ ...portrait, width: 844, height: 390 });
    wait(16);
    set({ ...portrait, width: 844, height: 390, sideInset: 44 });
    wait(16);
    set({ ...portrait, width: 844, height: 390, sideInset: 44, listH: 300 });
    wait(100);
    const after = published(seen).slice(before);
    expect(after).toEqual([
      geometryKey(
        phonePageGeometry({
          ...portrait,
          width: 844,
          height: 390,
          sideInset: 44,
          listH: 300,
        }),
      ),
    ]);
  });

  it('holds the page it has through the burst, rather than blanking it', () => {
    const { seen, set, wait } = mount(portrait);
    wait(100);
    const settled = seen[seen.length - 1];
    set({ ...portrait, width: 844, height: 390 });
    wait(16);
    // Mid-burst the page is still drawn at its old size — the platform is
    // animating the rotation over it anyway.
    expect(seen[seen.length - 1]).toBe(settled);
  });

  it('a fullscreen toggle on iOS publishes once', () => {
    const { seen, set, wait } = mount(portrait);
    wait(100);
    const before = published(seen).length;
    // The floating header's height leaves the box immediately; the list
    // re-measures when the top inset is applied, a couple of frames later.
    set({ ...portrait, navPad: 0 });
    wait(32);
    set({ ...portrait, navPad: 0, listH: 760 });
    wait(100);
    expect(published(seen).slice(before)).toHaveLength(1);
  });

  it('an identical geometry from a fresh object does not re-arm the wait', () => {
    const { seen, set, wait } = mount(portrait);
    wait(100);
    const count = seen.length;
    // The reader builds a fresh input object on every render; a render
    // that changes nothing about the box must not push the publication
    // out — or a reader re-rendering on every recited ayah would never
    // settle at all.
    set({ ...portrait });
    set({ ...portrait });
    wait(100);
    expect(published(seen.slice(count))).toEqual([geometryKey(seen[count - 1])]);
  });
});
