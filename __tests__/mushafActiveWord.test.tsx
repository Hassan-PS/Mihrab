/**
 * The word being recited lights up on the muṣḥaf page — and only the line
 * carrying it repaints.
 *
 * The translation view has followed the reciter word by word for a while;
 * the muṣḥaf had the data (`MushafWord.position` was built to match the
 * timing) and an `activeWord` prop nobody passed. Passing it would have
 * cost every mounted line a render four times a second. So the word goes
 * through a store, and each line asks it one question as a number.
 */
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

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

import MushafTextPage from '../src/quran/MushafTextPage';
import { getPageLayout } from '../src/quran/mushafLayout';
import {
  _resetActiveWordForTests,
  activeWordOn,
  publishActiveWord,
  wordCode,
} from '../src/quran/audio/activeWordStore';

const WORD = 'rgba(46,107,79,0.42)';
const colors = {
  text: '#111',
  accent: '#2E6B4F',
  heading: '#2E6B4F',
  selection: 'rgba(0,0,0,0.06)',
  muted: '#666',
  word: WORD,
};
const onWordPress = () => {};
const onWordLongPress = () => {};
const PAGE = 600;
const layout = getPageLayout(PAGE)!;
const ayahLines = layout.lines.filter(l => l.kind === 'ayah');
const firstLine = ayahLines[0];
const firstWord = firstLine.kind === 'ayah' ? firstLine.words[0] : (null as never);

const litWords = (root: ReactTestRenderer) =>
  root.root
    .findAllByType(Text)
    .filter(t => {
      const style = t.props.style as { backgroundColor?: string } | undefined;
      return style?.backgroundColor === WORD;
    })
    .map(t => t.props.children as string);

beforeEach(() => {
  _resetActiveWordForTests();
  mockCounts.text = 0;
});

describe('activeWordOn', () => {
  it('maps the timing index (0-based) onto the QPC position (1-based)', () => {
    const w = { surah: firstWord.surah, ayah: firstWord.ayah, wordIndex: firstWord.position - 1 };
    expect(activeWordOn(firstLine, w)).toBe(
      wordCode(firstWord.surah, firstWord.ayah, firstWord.position),
    );
  });

  it('answers -1 for a line that does not carry the word', () => {
    const other = ayahLines.find(
      l => l.kind === 'ayah' && !l.words.some(w => w.ayah === firstWord.ayah),
    )!;
    const w = { surah: firstWord.surah, ayah: firstWord.ayah, wordIndex: 0 };
    expect(activeWordOn(other, w)).toBe(-1);
  });

  it('answers -1 when nothing is being recited', () => {
    expect(activeWordOn(firstLine, null)).toBe(-1);
  });
});

describe('on the page', () => {
  let root!: ReactTestRenderer;
  beforeEach(() => {
    act(() => {
      root = create(
        <MushafTextPage
          page={PAGE}
          width={360}
          colors={colors}
          fontFamily="MihrabMushaf0"
          onWordPress={onWordPress}
          onWordLongPress={onWordLongPress}
        />,
      );
    });
    mockCounts.text = 0;
  });

  it('lights the recited word and nothing else', () => {
    act(() => {
      publishActiveWord({
        surah: firstWord.surah,
        ayah: firstWord.ayah,
        wordIndex: firstWord.position - 1,
      });
    });
    expect(litWords(root)).toEqual([firstWord.text]);
  });

  it('repaints one line for it, not the page', () => {
    act(() => {
      publishActiveWord({
        surah: firstWord.surah,
        ayah: firstWord.ayah,
        wordIndex: firstWord.position - 1,
      });
    });
    const oneLine = mockCounts.text;
    expect(oneLine).toBeGreaterThan(0);
    // A line is a paragraph plus its gaps — a couple of dozen pieces at
    // most, against the ~150 of the page.
    expect(oneLine).toBeLessThan(40);
  });

  it('moving to the next word on the same line stays on that line', () => {
    const second = firstLine.kind === 'ayah' ? firstLine.words[1] : (null as never);
    act(() => {
      publishActiveWord({ surah: firstWord.surah, ayah: firstWord.ayah, wordIndex: firstWord.position - 1 });
    });
    mockCounts.text = 0;
    act(() => {
      publishActiveWord({ surah: second.surah, ayah: second.ayah, wordIndex: second.position - 1 });
    });
    expect(litWords(root)).toEqual([second.text]);
    expect(mockCounts.text).toBeLessThan(40);
  });

  it('publishing the same word again wakes nothing', () => {
    const w = { surah: firstWord.surah, ayah: firstWord.ayah, wordIndex: firstWord.position - 1 };
    act(() => publishActiveWord(w));
    mockCounts.text = 0;
    act(() => publishActiveWord({ ...w }));
    expect(mockCounts.text).toBe(0);
  });

  it('goes dark when playback stops', () => {
    act(() => {
      publishActiveWord({ surah: firstWord.surah, ayah: firstWord.ayah, wordIndex: firstWord.position - 1 });
    });
    act(() => publishActiveWord(null));
    expect(litWords(root)).toEqual([]);
  });
});
