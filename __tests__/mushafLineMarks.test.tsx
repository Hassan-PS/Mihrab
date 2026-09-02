/**
 * A line re-renders when ITS marks change, and for nothing else.
 *
 * The tint used to reach every line as a function. A function has no
 * value to compare, so each new one — every recited ayah, every bookmark,
 * every time the selection moved — failed the memo on all fifteen lines of
 * every mounted page: on a spread, ninety lines re-shaped for a change
 * that touched two. The marks now arrive as one string per line, and a
 * line whose string is the same as last time is the same as last time.
 *
 * Counted, not timed: the number of <Text> elements built during an
 * update is the number of pieces the lines rebuilt.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

const mockCounts = { text: 0 };
jest.mock('react/jsx-runtime', () => {
  const actual = jest.requireActual('react/jsx-runtime');
  const isText = (type: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    type === require('react-native').Text;
  const wrap =
    (fn: (...a: unknown[]) => unknown) =>
    (type: unknown, ...rest: unknown[]) => {
      if (isText(type)) mockCounts.text += 1;
      return fn(type, ...rest);
    };
  return { ...actual, jsx: wrap(actual.jsx), jsxs: wrap(actual.jsxs) };
});

import MushafTextPage, { lineMarks } from '../src/quran/MushafTextPage';
import { getPageLayout, type MushafWord } from '../src/quran/mushafLayout';

const colors = {
  text: '#111',
  accent: '#2E6B4F',
  heading: '#2E6B4F',
  selection: 'rgba(0,0,0,0.06)',
  muted: '#666',
};

const marking =
  (surah: number, ayah: number, colour = '#fee') =>
  (s: number, a: number) =>
    s === surah && a === ayah ? colour : null;

// Stable, as the readers now pass them — an arrow here would be the other
// memo defeat, the one mushafRenderChurn.test covers.
const onWordPress = () => {};
const onWordLongPress = () => {};

const PAGE = 600;

function render(tint: (s: number, a: number) => string | null) {
  return (
    <MushafTextPage
      page={PAGE}
      width={360}
      colors={colors}
      fontFamily="MihrabMushaf0"
      tint={tint}
      onWordPress={onWordPress}
      onWordLongPress={onWordLongPress}
    />
  );
}

describe('lineMarks', () => {
  const layout = getPageLayout(49)!;
  const line = layout.lines.find(l => l.kind === 'ayah')!;
  const first = line.kind === 'ayah' ? line.words[0] : (null as never);

  it('is the empty string for an unmarked line', () => {
    expect(lineMarks(line, () => null)).toBe('');
  });

  it('is one colour per word, by value', () => {
    const tintA = (w: MushafWord) => (w === first ? '#fee' : null);
    const tintB = (w: MushafWord) => (w === first ? '#fee' : null);
    expect(lineMarks(line, tintA)).toBe(lineMarks(line, tintB));
    expect(lineMarks(line, tintA).split('|')[0]).toBe('#fee');
  });

  it('is nothing at all for a band or a basmalah', () => {
    const band = layout.lines.find(l => l.kind !== 'ayah');
    if (band) expect(lineMarks(band, () => '#fee')).toBe('');
  });
});

describe('a page under a changing tint', () => {
  let root!: ReactTestRenderer;
  let mountCost = 0;
  // Two ayahs that are actually on the page, from the page itself.
  // A page of short ayahs, so two of them are a few lines and not most of
  // the page — the first ayah on it and the last.
  const words = getPageLayout(PAGE)!
    .lines.flatMap(l => (l.kind === 'ayah' ? l.words : []));
  const a = words[0];
  const b = words[words.length - 1];

  beforeEach(() => {
    mockCounts.text = 0;
    act(() => {
      root = create(render(marking(a.surah, a.ayah)));
    });
    mountCost = mockCounts.text;
    mockCounts.text = 0;
  });

  it('builds over a hundred pieces on mount — the number worth not repeating', () => {
    expect(mountCost).toBeGreaterThan(100);
  });

  it('rebuilds nothing when the tint is a new function with the same answer', () => {
    // Every recited ayah used to be exactly this: same marks, new function.
    act(() => {
      root.update(render(marking(a.surah, a.ayah)));
    });
    expect(mockCounts.text).toBe(0);
  });

  it('rebuilds only the lines whose marks moved', () => {
    act(() => {
      root.update(render(marking(b.surah, b.ayah)));
    });
    // The lines that carried the first ayah and the lines that carry the
    // second — a handful of pieces each — and not the rest of the page.
    expect(mockCounts.text).toBeGreaterThan(0);
    expect(mockCounts.text).toBeLessThan(mountCost / 3);
  });

  it('rebuilds nothing when nothing is marked either time', () => {
    act(() => {
      root.update(render(() => null));
    });
    mockCounts.text = 0;
    act(() => {
      root.update(render(() => null));
    });
    expect(mockCounts.text).toBe(0);
  });
});
