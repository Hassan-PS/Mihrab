/**
 * The native line view, and the space it gives back to the page.
 *
 * A line drawn by `<Text>` needs half an em of slack in its box (Android
 * breaks a line a hair too wide for it and loses a word) and room in its
 * view for the ink that overshoots its ends (the view clips). A line
 * drawn by the native view needs neither of the first and only the
 * second: its box is the run, its pen never breaks, and the page is set
 * larger for it. The inset a page keeps either side is now in ems of its
 * own font, sized to hold that overshoot, rather than a share of the
 * width that shrank the font it was meant to be measured in.
 *
 * The measurements the constants rest on are from
 * `scripts/mushaf/measure_ink_overshoot.py` over all 604 fonts.
 */
import React from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react';
import { Text } from 'react-native';

jest.mock('../src/quran/native/MushafLineNativeComponent', () => ({
  __esModule: true,
  default: 'MushafLine',
}));

import MushafTextPage from '../src/quran/MushafTextPage';
import { pageFontSize, pageInset } from '../src/quran/MushafTextPageSurface';
import {
  MUSHAF_INK_LEFT_EM,
  MUSHAF_INK_RIGHT_EM,
  MUSHAF_LINE_BOX_SLACK_EM,
  MUSHAF_PAGE_INSET_EM,
  getPageLayout,
  lineBoxSlackEm,
  lineGapCount,
  lineInkSidePadding,
  lineSpaceEm,
  pageBlockEm,
  pageMeasureEm,
} from '../src/quran/mushafLayout';
import { setNativeMushafLineAvailableForTests } from '../src/quran/native/MushafLineView';
import { wordAtPoint } from '../src/quran/mushafHitTest';
import {
  _resetActiveWordForTests,
  publishActiveWord,
} from '../src/quran/audio/activeWordStore';
import { processColor } from 'react-native';

// The worst line ends over the 604 fonts, in ems (measure_ink_overshoot.py).
const MEASURED_RIGHT = 0.3504; // page 146
const MEASURED_LEFT = 0.1956; // page 12

const colors = {
  text: '#111',
  accent: '#2E6B4F',
  heading: '#2E6B4F',
  selection: 'rgba(0,0,0,0.06)',
  muted: '#666',
  word: 'rgba(46,107,79,0.42)',
};
const onWord = () => {};

afterEach(() => setNativeMushafLineAvailableForTests(null));

describe('the room the ink needs at the line ends', () => {
  it('is at least what the fonts were measured to overshoot', () => {
    expect(MUSHAF_INK_RIGHT_EM).toBeGreaterThanOrEqual(MEASURED_RIGHT);
    expect(MUSHAF_INK_LEFT_EM).toBeGreaterThanOrEqual(MEASURED_LEFT);
    // But not so much that it is a margin of its own.
    expect(MUSHAF_INK_RIGHT_EM).toBeLessThan(MEASURED_RIGHT + 0.05);
    expect(MUSHAF_INK_LEFT_EM).toBeLessThan(MEASURED_LEFT + 0.05);
  });

  it('is more than the old box slack gave a side', () => {
    // Half the slack was the only room the ends had. Page 146's first
    // word overshoots by more than that, and lost the tail of its swash.
    expect(MEASURED_RIGHT).toBeGreaterThan(MUSHAF_LINE_BOX_SLACK_EM / 2);
  });

  it('is padded into the view in whole dp', () => {
    const side = lineInkSidePadding(20);
    expect(side.right).toBe(Math.ceil(MUSHAF_INK_RIGHT_EM * 20));
    expect(side.left).toBe(Math.ceil(MUSHAF_INK_LEFT_EM * 20));
    expect(lineInkSidePadding(0)).toEqual({ left: 0, right: 0 });
  });

  it('fits inside the page inset, so the block never clips it', () => {
    expect(MUSHAF_PAGE_INSET_EM).toBeGreaterThan(MUSHAF_INK_RIGHT_EM);
    expect(MUSHAF_PAGE_INSET_EM).toBeGreaterThan(MUSHAF_INK_LEFT_EM);
  });
});

describe('the slack the box carries', () => {
  it('is half an em for <Text>, nothing for the native view', () => {
    setNativeMushafLineAvailableForTests(false);
    expect(lineBoxSlackEm()).toBe(MUSHAF_LINE_BOX_SLACK_EM);
    setNativeMushafLineAvailableForTests(true);
    expect(lineBoxSlackEm()).toBe(0);
  });

  it('is what the page block reserves over the measure', () => {
    const layout = getPageLayout(125)!;
    setNativeMushafLineAvailableForTests(true);
    expect(pageBlockEm(layout)).toBe(pageMeasureEm(layout));
    setNativeMushafLineAvailableForTests(false);
    expect(pageBlockEm(layout)).toBe(pageMeasureEm(layout) + MUSHAF_LINE_BOX_SLACK_EM);
  });
});

describe('the page inset', () => {
  const layout = getPageLayout(125)!;
  const width = 358;

  it('is in ems of the page font', () => {
    setNativeMushafLineAvailableForTests(true);
    const fontSize = pageFontSize(125, width, layout);
    expect(pageInset(125, width, layout)).toBeCloseTo(MUSHAF_PAGE_INSET_EM * fontSize, 6);
  });

  it('and the block together fill the width exactly', () => {
    setNativeMushafLineAvailableForTests(true);
    const fontSize = pageFontSize(125, width, layout);
    const inset = pageInset(125, width, layout);
    expect(fontSize * pageBlockEm(layout) + 2 * inset).toBeCloseTo(width, 6);
  });

  it('sets the text a quarter larger than the old geometry did', () => {
    // On a 366dp phone the old geometry spent 10dp of column padding a
    // side, 3.5% of the block, the half-em slack, AND a quarter em between
    // every pair of words on the widest line (the measure was
    // `max(natural + 0.25 × gaps)`, not the print's advances). 4dp, ems,
    // no slack and the print's own measure set the font about a quarter
    // larger, which is the difference the comparison app showed.
    setNativeMushafLineAvailableForTests(true);
    const screen = 366;
    const now = pageFontSize(125, screen - 2 * 4, layout);
    let oldMeasure = 0;
    for (const line of layout.lines) {
      if (line.kind !== 'ayah') continue;
      oldMeasure = Math.max(oldMeasure, line.natural + 0.25 * lineGapCount(line));
    }
    const before =
      ((screen - 2 * 10) * (1 - 2 * 0.035)) / (oldMeasure + MUSHAF_LINE_BOX_SLACK_EM);
    expect(now / before).toBeGreaterThan(1.2);
    expect(now / before).toBeLessThan(1.3);
    // And the ink spans nine tenths of the screen.
    expect((now * pageMeasureEm(layout)) / screen).toBeGreaterThan(0.92);
  });

  it('keeps the plates and the Unicode pages on their old rule', () => {
    expect(pageInset(1, width, getPageLayout(1)!)).toBeCloseTo(width * 0.08, 6);
    expect(pageInset(125, width, null)).toBeCloseTo(width * 0.035, 6);
  });
});

function findAll(root: ReactTestRenderer, type: unknown) {
  return root.root.findAll(n => n.type === type);
}

describe('a page drawn by the native view', () => {
  const page = 125;
  const width = 340;
  const layout = getPageLayout(page)!;
  let root: ReactTestRenderer;

  const renderPage = (
    tint?: (s: number, a: number) => string | null,
    endInk?: (s: number, a: number) => string | null,
  ) => {
    act(() => {
      root = create(
        <MushafTextPage
          page={page}
          width={width}
          colors={colors}
          fontFamily="MihrabMushaf0"
          tint={tint}
          endInk={endInk}
          onWordPress={onWord}
          onWordLongPress={onWord}
        />,
      );
    });
  };

  beforeEach(() => setNativeMushafLineAvailableForTests(true));
  afterEach(() => act(() => root?.unmount()));

  it('draws every ayah line natively and no line as <Text>', () => {
    renderPage();
    const ayahLines = layout.lines.filter(l => l.kind === 'ayah').length;
    expect(findAll(root, 'MushafLine')).toHaveLength(ayahLines);
    // The band and basmalah rows keep their own text; no LINE is a paragraph.
    const texts = findAll(root, Text);
    for (const t of texts) expect(t.props.fontFamily).not.toBe('MihrabMushaf0');
  });

  it('gives each line its run, its gaps and the font', () => {
    renderPage();
    const fontSize = width / pageBlockEm(layout);
    const measureEm = pageMeasureEm(layout);
    const lines = findAll(root, 'MushafLine');
    layout.lines
      .filter(l => l.kind === 'ayah')
      .forEach((line, i) => {
        const props = lines[i].props;
        expect(props.fontFamily).toBe('MihrabMushaf0');
        expect(props.fontSize).toBeCloseTo(fontSize, 6);
        expect(props.color).toBe(colors.text);
        const glyphs = props.runs.filter((r: { t?: string }) => r.t != null);
        const gaps = props.runs.filter((r: { g?: number }) => r.g != null);
        if (line.kind !== 'ayah') return;
        expect(glyphs.map((r: { t: string }) => r.t).join('')).toBe(
          line.words.map(w => w.text.replace(/ /g, '')).join(''),
        );
        const space = lineSpaceEm(line, measureEm) * fontSize;
        const between = gaps.filter((r: { g: number }) => Math.abs(r.g - space) < 1e-6);
        expect(between.length).toBeGreaterThanOrEqual(lineGapCount(line));
      });
  });

  it('sizes the view for the ink and puts the run inside that room', () => {
    renderPage();
    const fontSize = width / pageBlockEm(layout);
    const measureEm = pageMeasureEm(layout);
    const side = lineInkSidePadding(fontSize);
    const lines = findAll(root, 'MushafLine');
    const first = layout.lines.find(l => l.kind === 'ayah')!;
    if (first.kind !== 'ayah') return;
    const lineWidth =
      first.natural * fontSize + lineSpaceEm(first, measureEm) * fontSize * lineGapCount(first);
    const props = lines[0].props;
    // No slack: the box is the run, and the run's right edge sits just
    // inside the room kept for its overshoot.
    expect(props.penRight).toBeCloseTo(side.left + lineWidth, 4);
    expect(props.style.width).toBeCloseTo(lineWidth + side.left + side.right, 4);
    expect(props.style.marginLeft).toBe(-side.left);
    expect(props.style.marginRight).toBe(-side.right);
    // The room is transparent view, not layout: the box the line sits in
    // is still the run's width, so nothing about the page moves.
    const box = lines[0].parent!;
    expect(box.props.style.width).toBeCloseTo(lineWidth, 4);
    // And the widest line spans the page's whole block.
    const widest = Math.max(...lines.map(l => l.parent!.props.style.width as number));
    expect(widest).toBeCloseTo(width, 2);
  });

  it('puts the baseline where the platform text view put it', () => {
    renderPage();
    const fontSize = width / pageBlockEm(layout);
    const props = findAll(root, 'MushafLine')[0].props;
    const leading = props.boxHeight - 1.8 * fontSize;
    expect(props.penBaseline).toBeCloseTo(props.boxTop + leading / 2 + 1.2 * fontSize, 6);
  });

  it('washes a marked ayah, its gaps included, and inks its medallion', () => {
    const at = layout.lines.findIndex(
      l => l.kind === 'ayah' && l.words.some(w => w.isEnd),
    );
    const line = layout.lines[at];
    if (line.kind !== 'ayah') return;
    const end = line.words.find(w => w.isEnd)!;
    renderPage(
      (s, a) => (s === end.surah && a === end.ayah ? '#ffeeee' : null),
      (s, a) => (s === end.surah && a === end.ayah ? '#123456' : null),
    );
    const ayahLinesBefore = layout.lines.slice(0, at).filter(l => l.kind === 'ayah').length;
    const props = findAll(root, 'MushafLine')[ayahLinesBefore].props;
    const runs = props.runs as { t?: string; g?: number; w?: number; i?: number }[];
    const inAyah = line.words.filter(w => w.surah === end.surah && w.ayah === end.ayah);
    const washed = runs.filter(r => r.t != null && r.w != null);
    expect(washed).toHaveLength(inAyah.length);
    // A gap between two washed words is washed too — the wash is one run.
    const washedGaps = runs.filter(r => r.g != null && r.w != null);
    expect(washedGaps.length).toBeGreaterThanOrEqual(inAyah.length - 1);
    // Only the medallion carries ink, and as a number the view can read.
    const inked = runs.filter(r => r.i != null);
    expect(inked).toHaveLength(1);
    expect(inked[0].t).toBe(end.text);
    expect(typeof inked[0].i).toBe('number');
    expect(typeof washed[0].w).toBe('number');
    // Unmarked words carry neither key at all.
    const bare = runs.find(r => r.t != null && r.w == null)!;
    expect('w' in bare).toBe(false);
  });

  it('lights the recited word, and only it, in the line that carries it', () => {
    _resetActiveWordForTests();
    renderPage();
    const first = layout.lines.find(l => l.kind === 'ayah')!;
    if (first.kind !== 'ayah') return;
    const word = first.words.find(w => !w.isEnd)!;
    act(() => {
      publishActiveWord({ surah: word.surah, ayah: word.ayah, wordIndex: word.position - 1 });
    });
    const lines = findAll(root, 'MushafLine');
    const lit = lines.flatMap(l =>
      (l.props.runs as { t?: string; w?: number }[]).filter(
        r => r.t != null && r.w === processColor(colors.word),
      ),
    );
    expect(lit.map(r => r.t)).toEqual([word.text]);
    act(() => publishActiveWord(null));
    const after = findAll(root, 'MushafLine').flatMap(l =>
      (l.props.runs as { w?: number }[]).filter(r => r.w != null),
    );
    expect(after).toHaveLength(0);
    _resetActiveWordForTests();
  });

  it('answers a tap from the same geometry the hit-test uses', () => {
    renderPage();
    const fontSize = width / pageBlockEm(layout);
    const lineHeight = findAll(root, 'MushafLine')[0].props.boxHeight;
    const first = layout.lines.findIndex(l => l.kind === 'ayah');
    const line = layout.lines[first];
    if (line.kind !== 'ayah') return;
    const geometry = {
      width,
      fontSize,
      lineHeight,
      measureEm: pageMeasureEm(layout),
      framed: false,
    };
    // Just inside the right edge of the first line: the first word.
    const word = wordAtPoint(layout, width - 1, first * lineHeight + 1, geometry);
    expect(word).toBe(line.words[0]);
  });
});

describe('a page drawn by <Text> when the view is missing', () => {
  it('still pads the line views sideways for the ink', () => {
    setNativeMushafLineAvailableForTests(false);
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <MushafTextPage
          page={125}
          width={340}
          colors={colors}
          fontFamily="MihrabMushaf0"
          onWordPress={onWord}
          onWordLongPress={onWord}
        />,
      );
    });
    expect(findAll(root, 'MushafLine')).toHaveLength(0);
    const line = root.root.findAll(
      n => n.type === Text && n.props.style?.some?.((s: { fontFamily?: string }) => s?.fontFamily === 'MihrabMushaf0'),
    )[0];
    const style = Object.assign({}, ...line.props.style);
    expect(style.paddingLeft).toBeGreaterThan(0);
    expect(style.paddingRight).toBeGreaterThan(style.paddingLeft);
    expect(style.marginLeft).toBe(-style.paddingLeft);
    expect(style.marginRight).toBe(-style.paddingRight);
    act(() => root.unmount());
  });
});
