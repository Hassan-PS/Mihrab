/**
 * The graph, mounted under an RTL locale.
 *
 * `heatmapScrollRtl.test.ts` pins the arithmetic. This pins the wiring — that
 * the component actually asks it, rather than calling `scrollToEnd` and
 * landing on the oldest week it has, which is what Arabic got.
 */
/**
 * DIRECTION COMES FROM THE APP LANGUAGE, NOT FROM `I18nManager`.
 *
 * This file used to set `I18nManager.isRTL` and was green while the shipped
 * app was wrong: the app mirrors itself with a Yoga `direction` rather than
 * `forceRTL`, so that flag follows the phone's locale. An English phone with
 * the app set to Arabic left it `false` — the graph parked on the oldest
 * week and asked for more history at the end it was already standing on,
 * and no test could see it because the test was setting the wrong switch.
 */
let mockLang = 'en';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown) =>
      typeof second === 'string' ? second : key,
    i18n: { language: mockLang },
  }),
}));

import * as React from 'react';
import { ScrollView } from 'react-native';
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
  // Arabic is the app's RTL locale; `ar` is what reaches `isRtlLanguage`.
  mockLang = rtl ? 'ar' : 'en';
  const restore = () => {
    mockLang = 'en';
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
    await act(async () => scroller.props.onScrollBeginDrag());

    await act(async () => scroller.props.onScroll(scrollEvent(MAX)));
    expect(onReachOldest).not.toHaveBeenCalled();

    await act(async () => scroller.props.onScroll(scrollEvent(0)));
    expect(onReachOldest).toHaveBeenCalledTimes(1);
    restore();
  });

  it('asks at the far end in Arabic and not at x=0', async () => {
    const onReachOldest = jest.fn();
    const { scroller, restore } = await mountAndMeasure(true, { onReachOldest });
    await act(async () => scroller.props.onScrollBeginDrag());

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
    await act(async () => scroller.props.onScrollBeginDrag());
    await act(async () => {
      scroller.props.onScroll(scrollEvent(MAX));
      scroller.props.onScroll(scrollEvent(MAX));
      scroller.props.onScroll(scrollEvent(MAX - 1));
    });
    expect(onReachOldest).toHaveBeenCalledTimes(1);
    restore();
  });

  /**
   * The Arabic bug this file exists for, in its final form.
   *
   * Android re-anchors a right-to-left scroll view to its own edge whenever
   * the content changes size, and on this screen the content changes size
   * two or three times while the encrypted journal decrypts. Each re-anchor
   * arrives as an ordinary `onScroll` sitting on the oldest column — which
   * loaded twenty-six more weeks, which changed the content size, which
   * re-anchored. The graph opened somewhere in 2025 with every square
   * empty, and no amount of getting the direction right could have helped:
   * the scroll was never the user's.
   */
  it('ignores a scroll no finger made, however far into the past', async () => {
    const onReachOldest = jest.fn();
    const { scroller, restore } = await mountAndMeasure(true, { onReachOldest });

    await act(async () => {
      scroller.props.onScroll(scrollEvent(MAX));
      scroller.props.onScroll(scrollEvent(MAX));
    });
    expect(onReachOldest).not.toHaveBeenCalled();

    // ...and starts listening the moment one does.
    await act(async () => {
      scroller.props.onScrollBeginDrag();
      scroller.props.onScroll(scrollEvent(MAX));
    });
    expect(onReachOldest).toHaveBeenCalledTimes(1);
    restore();
  });
});

describe('a graph that fits its card grows until it can be dragged', () => {
  /** Same harness, but with content narrower than the viewport. */
  async function mountFitting(onReachOldest: jest.Mock) {
    mockLang = 'en';
    const rows = buildHeatmap(new Map(), new Set(), NOW, 13);
    let tree!: Renderer;
    await act(async () => {
      tree = create(
        <PracticeHeatmap
          rows={rows}
          weekdayLabels={LABELS}
          onReachOldest={onReachOldest}
        />,
      );
    });
    const scroller = tree.root.findByType(ScrollView);
    scroller.instance.scrollTo = jest.fn();
    await act(async () => {
      scroller.props.onLayout({ nativeEvent: { layout: { width: 320 } } });
      // Thirteen columns of 22dp: 286 inside a 320 card, with room to spare.
      scroller.props.onContentSizeChange(13 * 22, 120);
    });
    return scroller;
  }

  it('asks for more weeks when there is nothing to scroll', async () => {
    // Without this the graph is inert: the load-more threshold is measured
    // in scroll offset, so a history shorter than the card can never reach
    // its own oldest column and the drag does nothing at all.
    const onReachOldest = jest.fn();
    await mountFitting(onReachOldest);
    expect(onReachOldest).toHaveBeenCalled();
  });

  it('stops as soon as the content overflows', async () => {
    const onReachOldest = jest.fn();
    const scroller = await mountFitting(onReachOldest);
    const asked = onReachOldest.mock.calls.length;
    await act(async () => scroller.props.onContentSizeChange(39 * 22, 120));
    expect(onReachOldest).toHaveBeenCalledTimes(asked);
  });
});
