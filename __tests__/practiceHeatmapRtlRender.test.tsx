/**
 * The graph, mounted under an RTL locale.
 *
 * `heatmapScrollRtl.test.ts` pins the arithmetic. This pins the wiring — that
 * the component actually asks it, rather than calling `scrollToEnd` and
 * landing on the oldest week it has, which is what Arabic got.
 */
import * as React from 'react';
import { I18nManager, ScrollView } from 'react-native';
import { create } from 'react-test-renderer';
import { act } from 'react';
import { buildHeatmap, PracticeHeatmap } from '../src/practice/PracticeHeatmap';

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
const LABELS = ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'];
/** Wide enough to scroll: 78 columns of 19 dp inside a 300 dp card. */
const CONTENT = 78 * 19;
const VIEWPORT = 300;
const MAX = CONTENT - VIEWPORT;

type Renderer = ReturnType<typeof create>;

/** Mount, feed it a layout and a content size, and collect every scrollTo. */
async function mountAndMeasure(rtl: boolean, props: Record<string, unknown> = {}) {
  // A plain data property on the RN mock, not a getter — assign it.
  const was = I18nManager.isRTL;
  (I18nManager as { isRTL: boolean }).isRTL = rtl;
  const restore = () => {
    (I18nManager as { isRTL: boolean }).isRTL = was;
  };
  const scrollTo = jest.fn();
  const rows = buildHeatmap(new Map(), new Set(), NOW, 78);
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <PracticeHeatmap rows={rows} weekdayLabels={LABELS} {...props} />,
    );
  });
  const scroller = tree.root.findByType(ScrollView);
  // The component holds the ScrollView by ref; stand in for the native one.
  scroller.instance.scrollTo = scrollTo;
  await act(async () => {
    scroller.props.onLayout({ nativeEvent: { layout: { width: VIEWPORT } } });
    scroller.props.onContentSizeChange(CONTENT, 120);
  });
  return { tree, scroller, scrollTo, restore };
}

const scrollEvent = (x: number) => ({
  nativeEvent: {
    contentOffset: { x, y: 0 },
    contentSize: { width: CONTENT, height: 120 },
    layoutMeasurement: { width: VIEWPORT, height: 120 },
  },
});

afterEach(() => jest.restoreAllMocks());

describe('the graph opens on today', () => {
  it('scrolls to the far end in Latin', async () => {
    const { scrollTo, restore } = await mountAndMeasure(false);
    expect(scrollTo).toHaveBeenCalledWith({ x: MAX, animated: false });
    restore();
  });

  it('scrolls to zero in Arabic — the same week, the other end', async () => {
    const { scrollTo, restore } = await mountAndMeasure(true);
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, animated: false });
    restore();
  });
});

describe('the graph asks for more history', () => {
  it('asks at x=0 in Latin and not at the far end', async () => {
    const onReachOldest = jest.fn();
    const { scroller, restore } = await mountAndMeasure(false, { onReachOldest });

    await act(async () => scroller.props.onScroll(scrollEvent(MAX)));
    expect(onReachOldest).not.toHaveBeenCalled();

    await act(async () => scroller.props.onScroll(scrollEvent(0)));
    expect(onReachOldest).toHaveBeenCalledTimes(1);
    restore();
  });

  it('asks at the far end in Arabic and not at x=0', async () => {
    const onReachOldest = jest.fn();
    const { scroller, restore } = await mountAndMeasure(true, { onReachOldest });

    // Where the Arabic graph parks. It used to read as "the oldest week" and
    // fire a load-more the instant the screen appeared.
    await act(async () => scroller.props.onScroll(scrollEvent(0)));
    expect(onReachOldest).not.toHaveBeenCalled();

    await act(async () => scroller.props.onScroll(scrollEvent(MAX)));
    expect(onReachOldest).toHaveBeenCalledTimes(1);
    restore();
  });

  it('asks only once until the columns it asked for arrive', async () => {
    const onReachOldest = jest.fn();
    const { scroller, restore } = await mountAndMeasure(true, { onReachOldest });
    await act(async () => {
      scroller.props.onScroll(scrollEvent(MAX));
      scroller.props.onScroll(scrollEvent(MAX));
      scroller.props.onScroll(scrollEvent(MAX - 1));
    });
    expect(onReachOldest).toHaveBeenCalledTimes(1);
    restore();
  });
});
