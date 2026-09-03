/**
 * The muṣḥaf pager's mechanics — every way the list moves, and how a
 * movement becomes a page. Both readers drive their FlatList through
 * this: the spread reader with an index per pair of pages, the phone
 * reader with an index per page.
 *
 * ── WHY THIS IS NOT INSIDE THE COMPONENT ──────────────────────────
 *
 * `MushafSpreadReader` used to do all of this inline, and the two bugs
 * that took the longest to find this year lived here: a settle that fired
 * in the middle of a trackpad swipe and fought it, and a settle that could
 * not tell its own corrective scroll from the user's and swung between two
 * pages until the app fell over. Both were pinned, afterwards, by tests
 * that grep the component's source for the shape of the fix — which is
 * what you do when the logic cannot be run without a FlatList.
 *
 * So the logic runs without a FlatList. `createMushafPager` is a plain
 * closure over plain state: feed it scroll offsets and it tells a list
 * where to go and a reader which page it is on. A test drives it with fake
 * offsets and fake timers. The hook below is the thin React wrapper that
 * points it at a real list and keeps its inputs current.
 *
 * ── THE TWO RULES ─────────────────────────────────────────────────
 *
 * 1. Nothing settles a scroll this pager started. `scrollingTo` marks the
 *    index it asked for, and every settle skips until the list arrives
 *    there. A timer lifts the mark when an animation is interrupted and
 *    never lands, because a mark that never lifts is a reader that stops
 *    responding.
 * 2. A user's scroll settles when the scrolling STOPS, not when a gesture
 *    ends. A trackpad swipe raises no drag end and no momentum — macOS
 *    delivers it as wheel phases — so silence is the only thing that marks
 *    its end. A finger is unaffected: its momentum end cancels the timer.
 * 3. A page the pager was SENT to is not negotiable. A jump that never
 *    lands is re-issued, not forgotten: when its mark lifts by timeout and
 *    the list has reported an offset that is not the one asked for, the
 *    same scroll goes out again. Without this a rotation on page 589 read
 *    as page 272 — see `guardExpired` for the mechanics — and the settle
 *    that followed made it official.
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** What the pager needs from a list — the two FlatList methods it calls. */
export type PagerList = {
  scrollToIndex(params: { index: number; animated: boolean }): void;
  scrollToOffset(params: { offset: number; animated: boolean }): void;
};

/**
 * How far off a page boundary the list may rest before it is nudged, dp.
 *
 * Not zero, and not one. A page width can be fractional — a Mac window is
 * resized to whatever the pointer left it at — so the offset a healthy
 * snap lands on differs from `index × width` by a rounding error, and a
 * one-pixel tolerance reads that as adrift and animates a "correction"
 * that lands in the same place. Two pixels is below noticing and above
 * the arithmetic.
 */
export const SNAP_SLACK = 2;

/**
 * Silence that counts as the end of a scroll, ms. Long enough that a
 * swipe's own gaps do not trip it, short enough that the snap still feels
 * like part of the gesture.
 */
export const SCROLL_IDLE_MS = 140;

/** How long a scroll we started may take to arrive before its mark lifts. */
export const GUARD_ANIMATED_MS = 700;
export const GUARD_INSTANT_MS = 250;

/**
 * How many times an instant scroll that landed somewhere else is sent
 * again before the pager gives up and believes the list. Each try waits a
 * full guard, so this is also a bound on how long a list can be argued
 * with — one is enough in practice, the rest is margin.
 */
export const REANCHOR_RETRIES = 3;

export type MushafPagerInput = {
  /** The list, read at call time — it mounts after the pager is made. */
  list: () => PagerList | null;
  itemCount: () => number;
  pageWidth: () => number;
  indexForPage: (page: number) => number;
  pageForIndex: (index: number) => number;
  /** The page the pager starts on. */
  initialPage: number;
  /** A page was turned to — by gesture, key, or chevron. */
  onTurn: (page: number, prevPage: number) => void;
  /** A turn is beginning by key or chevron (a gesture reports its own). */
  onTurnStart: () => void;
  /**
   * A gesture came to rest on the page it started from. Nothing was
   * navigated to, so whatever the gesture's start suspended can resume.
   */
  onSettleNoop: () => void;
};

export type MushafPager = {
  /** Every scroll event, at `scrollEventThrottle` cadence. */
  onScroll: (offsetX: number) => void;
  /** The list's own momentum has ended (touch). */
  onMomentumEnd: (offsetX: number) => void;
  /** FlatList could not place the index; land on the offset instead. */
  onScrollToIndexFailed: (index: number) => void;
  /**
   * A finger (or a mouse) has taken hold of the list. Whatever scroll the
   * pager had in flight is over — the user is steering now, and their
   * settle must count the moment they let go.
   */
  onDragStart: () => void;
  /**
   * The list's content was laid out at a new size — a resize, a
   * re-pairing, another muṣḥaf. The settled page is re-anchored against
   * the geometry that is now actually on screen.
   */
  onContentResized: () => void;
  /** Turn one item in READING direction: +1 = next. */
  turnPage: (dir: 1 | -1) => void;
  /** An outside change (jump, khatmah, recitation follow) named a page. */
  followPage: (page: number) => void;
  /** The geometry changed (resize, re-pair): re-anchor the settled page. */
  reanchor: () => void;
  /** The index the pager considers current. */
  settledIndex: () => number;
  /** The page the pager considers current. */
  settledPage: () => number;
  /** Cancel timers; the pager is going away. */
  dispose: () => void;
};

export function createMushafPager(input: MushafPagerInput): MushafPager {
  let settledPage = input.initialPage;
  let settledIndex = input.indexForPage(input.initialPage);
  let scrollingTo: number | null = null;
  /** Whether the scroll in flight was asked for with animation. */
  let scrollingAnimated = false;
  /** Has the list reported ANY offset since the scroll in flight began? */
  let reportedSince = false;
  /** Instant scrolls re-issued for the same target, so far. */
  let retries = 0;
  let guardTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastOffset = 0;

  const clearGuard = () => {
    if (guardTimer) clearTimeout(guardTimer);
    guardTimer = null;
  };
  const clearIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  const clampIndex = (idx: number) =>
    Math.max(0, Math.min(input.itemCount() - 1, idx));

  /**
   * The mark's timer ran out: the list never reported arriving.
   *
   * ── WHY THE SCROLL IS SENT AGAIN ──────────────────────────────────
   *
   * On Android a scroll command is executed BEFORE the layout it was
   * computed against is on screen: Fabric runs view commands ahead of the
   * mount items in the same batch. A rotation re-anchors with
   * `scrollToIndex(588)` at the new width while the list's content is
   * still the old width, and `HorizontalScrollView.scrollTo` clamps the
   * offset to the content it has — so on a phone turned to landscape on
   * page 589, the pager asked for 588 × 914 dp and the list stopped at the
   * end of a 604 × 411 dp strip, which the new layout then read as page
   * 272. The mark lifted, an idle settle read the offset, and page 272
   * became the page. Turning back made it permanent.
   *
   * So an instant scroll that the list has reported landing somewhere
   * else is simply issued again, now that the layout is settled. Animated
   * scrolls are left alone: they are turns on a stable layout, and a
   * trackpad swipe that interrupted one must not be fought (rule 2).
   */
  const guardExpired = () => {
    guardTimer = null;
    const idx = scrollingTo;
    scrollingTo = null;
    if (idx == null) return;
    const adrift = Math.abs(lastOffset - idx * input.pageWidth()) > SNAP_SLACK;
    if (
      !scrollingAnimated &&
      reportedSince &&
      adrift &&
      retries < REANCHOR_RETRIES
    ) {
      retries += 1;
      scrollTo(idx, false, true);
      return;
    }
    retries = 0;
  };

  /** The one way the list is moved, so the mark cannot be forgotten. */
  const scrollTo = (idx: number, animated: boolean, retry = false) => {
    scrollingTo = idx;
    scrollingAnimated = animated;
    reportedSince = false;
    if (!retry) retries = 0;
    clearGuard();
    guardTimer = setTimeout(
      guardExpired,
      animated ? GUARD_ANIMATED_MS : GUARD_INSTANT_MS,
    );
    input.list()?.scrollToIndex({ index: idx, animated });
  };

  const commit = (idx: number) => {
    const prevPage = settledPage;
    const page = input.pageForIndex(idx);
    settledIndex = idx;
    settledPage = page;
    input.onTurn(page, prevPage);
  };

  /** Where a scroll came to rest, and the page it means. */
  const settleAt = (offsetX: number) => {
    const w = input.pageWidth();
    if (scrollingTo != null) {
      // Our own scroll, still travelling. Arriving lifts the mark; nothing
      // else about this event means anything.
      if (Math.abs(offsetX - scrollingTo * w) <= SNAP_SLACK) {
        scrollingTo = null;
        retries = 0;
        clearGuard();
      }
      return;
    }
    const idx = clampIndex(Math.round(offsetX / w));
    const adrift = Math.abs(offsetX - idx * w) > SNAP_SLACK;
    if (idx === settledIndex) {
      if (adrift) scrollTo(idx, true);
      input.onSettleNoop();
      return;
    }
    commit(idx);
    if (adrift) scrollTo(idx, true);
  };

  return {
    onScroll: offsetX => {
      lastOffset = offsetX;
      reportedSince = true;
      clearIdle();
      idleTimer = setTimeout(() => {
        idleTimer = null;
        settleAt(lastOffset);
      }, SCROLL_IDLE_MS);
    },
    onMomentumEnd: offsetX => {
      lastOffset = offsetX;
      reportedSince = true;
      clearIdle();
      settleAt(offsetX);
    },
    onScrollToIndexFailed: index => {
      scrollingTo = null;
      retries = 0;
      clearGuard();
      input
        .list()
        ?.scrollToOffset({ offset: index * input.pageWidth(), animated: false });
    },
    onDragStart: () => {
      // The user is steering: a scroll we had in flight is not going to
      // land, and must not be re-issued over their gesture either.
      scrollingTo = null;
      retries = 0;
      clearGuard();
      input.onTurnStart();
    },
    onContentResized: () => {
      // The authoritative re-anchor. The effect-driven one runs when the
      // width CHANGES, which on Android is before the list has that width;
      // this one runs when the list HAS it. On the other platforms it is
      // an instant scroll to where the list already is, which is a no-op.
      const idx = input.indexForPage(settledPage);
      settledIndex = idx;
      scrollTo(idx, false);
    },
    turnPage: dir => {
      const idx = clampIndex(settledIndex + dir);
      if (idx === settledIndex) return;
      input.onTurnStart();
      commit(idx);
      scrollTo(idx, true);
    },
    followPage: page => {
      // Within a spread the index does not move, so following the playing
      // ayah across the facing page does not scroll.
      settledPage = page;
      const idx = input.indexForPage(page);
      if (idx === settledIndex) return;
      // The NEXT page turns; anything further jumps. Recitation follow and
      // the khatmah's step are always the adjacent page, and a reciter
      // crossing a page used to be a hard cut where every other turn was
      // a slide. A jump from the index to page 400, though, would animate
      // through two hundred spreads — and take as long as it sounds.
      const adjacent = Math.abs(idx - settledIndex) === 1;
      settledIndex = idx;
      scrollTo(idx, adjacent);
    },
    reanchor: () => {
      const idx = input.indexForPage(settledPage);
      settledIndex = idx;
      scrollTo(idx, false);
    },
    settledIndex: () => settledIndex,
    settledPage: () => settledPage,
    dispose: () => {
      clearGuard();
      clearIdle();
    },
  };
}

type ScrollEvent = { nativeEvent: { contentOffset: { x: number } } };

/**
 * The pager, pointed at a real list.
 *
 * The controller is made once and reads every input through `latest`, so
 * a re-render changes what it sees without remaking it — the handlers it
 * returns are stable, which is what a FlatList and the key-paging
 * registration both want.
 */
export function useMushafPager(opts: {
  list: RefObject<PagerList | null>;
  itemCount: number;
  pageWidth: number;
  currentPage: number;
  indexForPage: (page: number) => number;
  pageForIndex: (index: number) => number;
  onTurn: (page: number, prevPage: number) => void;
  onTurnStart: () => void;
  onSettleNoop: () => void;
}): {
  handlers: {
    onScroll: (e: ScrollEvent) => void;
    onMomentumScrollEnd: (e: ScrollEvent) => void;
    onScrollToIndexFailed: (info: { index: number }) => void;
    onScrollBeginDrag: () => void;
    onContentSizeChange: (width: number, height: number) => void;
  };
  turnPage: (dir: 1 | -1) => void;
  settledIndex: number;
} {
  const latest = useRef(opts);
  latest.current = opts;

  const pager = useRef<MushafPager | null>(null);
  if (pager.current == null) {
    pager.current = createMushafPager({
      list: () => latest.current.list.current,
      itemCount: () => latest.current.itemCount,
      pageWidth: () => latest.current.pageWidth,
      indexForPage: page => latest.current.indexForPage(page),
      pageForIndex: index => latest.current.pageForIndex(index),
      initialPage: opts.currentPage,
      onTurn: (page, prev) => latest.current.onTurn(page, prev),
      onTurnStart: () => latest.current.onTurnStart(),
      onSettleNoop: () => latest.current.onSettleNoop(),
    });
  }
  const p = pager.current;

  // Follow an outside change (jump, khatmah, recitation follow).
  const { currentPage, indexForPage, pageWidth } = opts;
  useEffect(() => {
    p.followPage(currentPage);
  }, [p, currentPage, indexForPage]);

  // Window resize / re-pair (Catalyst, iPad rotation): item offsets are
  // width-multiples and the pairing may flip, so re-anchor the settled
  // page against the new geometry without losing it. This is the prompt
  // re-anchor; `onContentSizeChange` below re-anchors again once the list
  // has actually laid its content out at the new width, which on Android
  // is AFTER this scroll has been executed — see `guardExpired`.
  useEffect(() => {
    p.reanchor();
  }, [p, pageWidth, indexForPage]);

  useEffect(() => () => p.dispose(), [p]);

  const handlers = useRef({
    onScroll: (e: ScrollEvent) => p.onScroll(e.nativeEvent.contentOffset.x),
    onMomentumScrollEnd: (e: ScrollEvent) =>
      p.onMomentumEnd(e.nativeEvent.contentOffset.x),
    onScrollToIndexFailed: (info: { index: number }) =>
      p.onScrollToIndexFailed(info.index),
    onScrollBeginDrag: () => p.onDragStart(),
    onContentSizeChange: () => p.onContentResized(),
  }).current;
  const turnPage = useCallback((dir: 1 | -1) => p.turnPage(dir), [p]);

  return { handlers, turnPage, settledIndex: p.settledIndex() };
}
