/**
 * Spread mushaf reader — large screens only: iPad, Mac Catalyst, large
 * foldables (docs/mushaf-reader-split-plan.md, step 3).
 *
 * Each FlatList ITEM is a whole spread — pages paired RTL, odd page on the
 * right, even on the left, (1,2) forming the decorative opening spread
 * exactly as the printed Madinah mushaf does (see `spreadForPage` in
 * mushafSpread.ts). Because the pair IS the item, "skips a page" cannot be
 * expressed: the FlatList index is the spread index, and a `pagingEnabled`
 * snap lands on nothing else.
 *
 * No zoom concept: a spread is width-fit, height-capped, centred. The one
 * internal branch: a portrait window (iPad portrait) shows a single
 * centred page per item instead of a pair. A Catalyst window resize
 * re-derives everything from `useWindowDimensions` — and re-pairs —
 * without losing the current page.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import MushafTextPageSurface from './MushafTextPageSurface';
import { spreadCount, spreadForPage } from './mushafSpread';
import {
  MushafJumpModal,
  MushafPageFooter,
  MushafPageHeader,
  useMushafReaderCore,
  type MushafReaderProps,
  useSettledMeasure,
} from './mushafReaderCore';
import { AyahActionSheet } from './mushaf/AyahActionSheet';
import { MushafIndexSidebar, SIDEBAR_WIDTH } from './MushafIndexSidebar';
import { MushafPageScrubber } from './MushafPageScrubber';
import { MiniPlayer } from './audio/MiniPlayer';
import { useRegisterKeyPaging } from './useKeyPaging';

/** KFGQPC source page ratio — the printed page's width over height. */
const PAGE_ASPECT = 2600 / 4206;

/** Breathing room either side of a page inside its column. */
const H_PADDING = 4;

/** Estimated header-row / footer-medallion heights, dp. */
const HEADER_RESERVE = 34;
const FOOTER_RESERVE = 42;
/** Floating mini-player card: 3px track + row (~54) + 10 bottom margin. */
const PLAYER_RESERVE = 68;

export function MushafSpreadReader(props: MushafReaderProps) {
  const { isFullscreen, onToggleFullscreen } = props;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { palette } = useAppPalette();
  const { width, height } = useWindowDimensions();
  const core = useMushafReaderCore(props);
  const {
    playback,
    riwayah,
    totalPages,
    nightMode,
    pageBg,
    ornament,
    currentPage,
    setCurrentPage,
  } = core;

  /**
   * Display cutout / rounded corners (v2.8.2). `insets.left`/`insets.right`
   * are PHYSICAL edges — they never flip with the UI language — and a spread
   * must stay centred, so the reader reserves the LARGER of the two on BOTH
   * sides: the pages only narrow, they never shift off centre
   * (docs/mushaf-fidelity-rules.md). The inset sits on the container, which
   * is painted `pageBg`, so the page colour still reaches the screen edge.
   */
  const sideInset = Math.max(insets.left, insets.right);
  /**
   * The index is what the extra width is FOR (design review 2d) — but only
   * when there is width to spare and the reader is not in fullscreen,
   * which means "the page, nothing else". Portrait collapses it away: an
   * iPad portrait cannot hold a spread and a sidebar at a readable size.
   */
  const showSidebar = !isFullscreen && width >= SIDEBAR_WIDTH + 620;
  /**
   * One pager item = the list viewport, after the cutout inset AND after
   * the sidebar (v2.8.5). The sidebar is a SIBLING in the row, so it takes
   * its width out of the reader — an item sized to the whole window is
   * that much too wide, and since the list is `inverted` the overflow
   * lands on the leading edge: the left-hand page of every spread ran
   * under the sidebar and was clipped mid-line.
   */
  const pageWidth =
    width - sideInset * 2 - (showSidebar ? SIDEBAR_WIDTH : 0);

  // The one internal branch: portrait window → single centred page per
  // item; landscape → a facing pair per item.
  const paired = width > height;
  const itemCount = paired ? spreadCount(totalPages) : totalPages;

  const indexForPage = useCallback(
    (page: number) => (paired ? spreadForPage(page, totalPages).index : page - 1),
    [paired, totalPages],
  );
  // The spread's right-hand (odd) page is "current" — the first one read
  // in RTL (same convention as pageFromScroll).
  const pageForIndex = useCallback(
    (index: number) => (paired ? index * 2 + 1 : index + 1),
    [paired],
  );

  const listRef = useRef<FlatList<number>>(null);
  const settledPage = useRef(currentPage);
  const settledIndex = useRef(indexForPage(currentPage));
  const [listHRaw, setListH] = useState(0);
  // Settled — see `useSettledMeasure`.
  const listH = useSettledMeasure(listHRaw);

  const navPad = !isFullscreen && Platform.OS === 'ios' ? headerHeight : 0;
  const playerReserve = playback.active ? PLAYER_RESERVE : 0;

  const data = React.useMemo(
    () => Array.from({ length: itemCount }, (_, i) => i),
    [itemCount],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  // Follow an outside change (jump, khatmah, recitation follow). Within a
  // spread the index doesn't move, so following the playing ayah across
  // the facing page doesn't scroll.
  useEffect(() => {
    settledPage.current = currentPage;
    const idx = indexForPage(currentPage);
    if (idx === settledIndex.current) return;
    settledIndex.current = idx;
    listRef.current?.scrollToIndex({ index: idx, animated: false });
  }, [currentPage, indexForPage]);

  // Window resize / re-pair (Catalyst, iPad rotation): item offsets are
  // width-multiples and the pairing may flip, so re-anchor the settled
  // page against the new geometry without losing it.
  useEffect(() => {
    const idx = indexForPage(settledPage.current);
    settledIndex.current = idx;
    listRef.current?.scrollToIndex({ index: idx, animated: false });
  }, [pageWidth, indexForPage]);

  const onMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const idx = Math.max(
        0,
        Math.min(
          itemCount - 1,
          Math.round(e.nativeEvent.contentOffset.x / pageWidth),
        ),
      );
      if (idx === settledIndex.current) {
        // Dragged and came back. Nothing was navigated to, so lift the
        // suspension armed at drag begin rather than leaving recitation
        // follow off for thirty seconds after a gesture that did nothing.
        core.resumeFollow();
        return;
      }
      const prevPage = settledPage.current;
      const page = pageForIndex(idx);
      settledIndex.current = idx;
      settledPage.current = page;
      core.commitPageTurn(page, prevPage);
      setCurrentPage(page);
    },
    [core, itemCount, pageForIndex, pageWidth, setCurrentPage],
  );

  /** Chevron/pointer page turn. `dir` is READING direction: +1 = next
   *  (visually the LEFT neighbour — the mushaf advances right-to-left). */
  const turnPage = useCallback(
    (dir: 1 | -1) => {
      const idx = Math.max(
        0,
        Math.min(itemCount - 1, settledIndex.current + dir),
      );
      if (idx === settledIndex.current) return;
      core.suspendFollow();
      const prevPage = settledPage.current;
      const page = pageForIndex(idx);
      settledIndex.current = idx;
      settledPage.current = page;
      core.commitPageTurn(page, prevPage);
      setCurrentPage(page);
      listRef.current?.scrollToIndex({ index: idx, animated: true });
    },
    [core, itemCount, pageForIndex, setCurrentPage],
  );

  // THIS is the reader Mac and iPad render in text mode — `MushafReader`
  // returns into it before reaching its own pager. The keyboard is bound
  // once, up there; this is how the pages it can see say where they are.
  useRegisterKeyPaging(props.keyTurn, turnPage);

  /** One page column: header chrome, centred width-fit height-capped
   *  page, page-number footer. */
  const renderColumn = useCallback(
    (page: number | null, colW: number, chrome: 'both' | 'label' | 'pill') => {
      if (page == null || page < 1 || page > totalPages) {
        return <View style={{ width: colW }} />;
      }
      // Whole dp — a sub-pixel wobble in the measured viewport must not fork
      // the page's layout. See the same rounding in MushafPhoneReader.
      const availH = Math.round(
        Math.max(
          120,
          (listH || height) -
            navPad -
            HEADER_RESERVE -
            FOOTER_RESERVE -
            playerReserve,
        ),
      );
      // Width-fit, height-capped, centred — no zoom concept.
      let pageW = colW - H_PADDING * 2;
      let pageH = pageW / PAGE_ASPECT;
      if (pageH > availH) {
        pageH = availH;
        pageW = pageH * PAGE_ASPECT;
      }
      return (
        <View style={[styles.column, { width: colW }]}>
          <View style={{ paddingTop: navPad }}>
            <MushafPageHeader
              page={page}
              isFullscreen={isFullscreen}
              nightMode={nightMode}
              ornament={ornament}
              riwayah={riwayah}
              show={chrome}
            />
          </View>
          <View style={styles.pageBox}>
            <Pressable onPress={onToggleFullscreen}>
              <MushafTextPageSurface
                page={page}
                width={pageW}
                height={pageH}
                riwayah={riwayah}
                nightMode={nightMode}
                accentColor={palette.accentSolid}
                selected={
                  core.sheetVisible && core.selected?.page === page
                    ? core.selected
                    : null
                }
                playing={
                  playback.active && playback.playing ? playback.active : null
                }
                // Only the spread being read warms its neighbours' fonts.
                prefetchRadius={page === currentPage ? 2 : 0}
                // Single tap anywhere on the page — word included — toggles
                // fullscreen; the ayah panel (tafsir, "play from here") is
                // a long press on the ayah.
                onWordPress={() => onToggleFullscreen()}
                onWordLongPress={core.openSelection}
              />
            </Pressable>
          </View>
          <MushafPageFooter
            page={page}
            ornament={ornament}
            onPress={core.openJump}
          />
        </View>
      );
    },
    [
      core,
      currentPage,
      height,
      isFullscreen,
      listH,
      navPad,
      nightMode,
      onToggleFullscreen,
      ornament,
      palette.accentSolid,
      playback.active,
      playback.playing,
      playerReserve,
      riwayah,
      totalPages,
    ],
  );

  const renderItem = useCallback(
    ({ item: index }: { item: number }) => {
      if (!paired) {
        // Portrait: one centred page fills the item.
        return (
          <View style={[styles.item, { width: pageWidth, backgroundColor: pageBg }]}>
            {renderColumn(index + 1, pageWidth, 'both')}
          </View>
        );
      }
      const spread = spreadForPage(index * 2 + 1, totalPages);
      // The item lays out physically LTR (the app drives RTL via text, not
      // I18nManager): even page on the left half, odd page on the right.
      // Chrome splits across the spread's outer corners — label at the
      // outer right, night pill at the outer left.
      return (
        <View
          style={[
            styles.item,
            styles.spreadRow,
            { width: pageWidth, backgroundColor: pageBg },
          ]}>
          {renderColumn(spread.left, pageWidth / 2, 'pill')}
          {renderColumn(spread.right, pageWidth / 2, 'label')}
        </View>
      );
    },
    [pageBg, pageWidth, paired, renderColumn, totalPages],
  );

  // Pointer environments (iPad trackpad, Catalyst): wheel scroll doesn't
  // drive a pagingEnabled list, so keep the edge chevrons. The mushaf
  // advances right-to-left: LEFT chevron = next, right = previous.
  const showChevrons = Platform.OS === 'ios';
  const currentIndex = indexForPage(currentPage);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: pageBg,
          paddingTop: isFullscreen ? insets.top : 0,
          // Cutout on both sides (symmetric — see `sideInset`) and the
          // system navigation bar below. The container is the page colour,
          // so this clears the obstruction without opening a seam.
          paddingHorizontal: sideInset,
          paddingBottom: insets.bottom,
        },
      ]}>
      <StatusBar hidden={isFullscreen} animated />
      <View style={styles.body}>
      {showSidebar ? (
        <MushafIndexSidebar
          currentPage={currentPage}
          riwayah={riwayah}
          onSelectPage={core.jumpToPage}
          // The navigation bar floats over the reader on iOS, and on Mac
          // Catalyst the window's traffic lights sit in the title-bar drag
          // region above it. The page columns already clear both with
          // `navPad`; without the same inset the sidebar's tab row started
          // underneath them — the Surah/Juz/Marks chips sat behind the
          // close/minimise/zoom buttons on Mac and behind the floating
          // back pill on iPad.
          topInset={Math.max(navPad, insets.top)}
        />
      ) : null}
      <View style={styles.reader}>
      <View
        style={styles.listWrap}
        onLayout={e => setListH(e.nativeEvent.layout.height)}>
        <FlatList
          ref={listRef}
          data={data}
          inverted
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={indexForPage(currentPage)}
          getItemLayout={getItemLayout}
          keyExtractor={i => (paired ? `s${i}` : `p${i}`)}
          renderItem={renderItem}
          onMomentumScrollEnd={onMomentumEnd}
          onScrollBeginDrag={core.suspendFollow}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          removeClippedSubviews
          style={{ backgroundColor: pageBg }}
        />
      </View>

      {showChevrons ? (
        <>
          {currentIndex < itemCount - 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.nextPage', 'Next page')}
              hitSlop={8}
              onPress={() => turnPage(1)}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.chevron,
                styles.chevronLeft,
                {
                  backgroundColor: nightMode ? '#1d1d1d' : '#f4efe4',
                  opacity: hovered ? 0.95 : 0.4,
                },
              ]}>
              <Text style={[styles.chevronGlyph, { color: ornament }]}>‹</Text>
            </Pressable>
          ) : null}
          {currentIndex > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.prevPage', 'Previous page')}
              hitSlop={8}
              onPress={() => turnPage(-1)}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.chevron,
                styles.chevronRight,
                {
                  backgroundColor: nightMode ? '#1d1d1d' : '#f4efe4',
                  opacity: hovered ? 0.95 : 0.4,
                },
              ]}>
              <Text style={[styles.chevronGlyph, { color: ornament }]}>›</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {/* 604 pages is too many for ‹ ›. A rail states where you are and
          takes you anywhere in one drag. */}
      {showSidebar ? (
        <MushafPageScrubber
          page={currentPage}
          riwayah={riwayah}
          onSelectPage={core.jumpToPage}
          onOpenJump={core.openJump}
        />
      ) : null}
      </View>
      </View>

      {core.selected ? (
        <AyahActionSheet
          visible={core.sheetVisible}
          onClose={core.closeSheet}
          surah={core.selected.surah}
          ayah={core.selected.ayah}
          page={core.selected.page}
          scrollToAudio={core.sheetScrollAudio}
        />
      ) : null}

      <MiniPlayer />

      <MushafJumpModal
        visible={core.jumpVisible}
        onClose={core.closeJump}
        onJump={core.jumpToPage}
        totalPages={totalPages}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Sidebar beside the reader; both fill the height.
  body: { flex: 1, flexDirection: 'row' },
  reader: { flex: 1 },
  /**
   * The pager is laid out LTR even when the app is (v2.8.4).
   *
   * `AppNavigationRoot` puts `direction: 'rtl'` on the whole tree for Arabic.
   * A horizontal ScrollView under RTL measures its content offset from the
   * RIGHT — so this list, whose `getItemLayout`, `initialScrollIndex` and
   * momentum-end index are all plain left-to-right multiples of the page
   * width, opened parked at x = contentSize (604 pages past the end). The
   * page, the juz label and the page medallion were all laid out correctly
   * and painted where nobody could see them: the mushaf was simply BLANK in
   * Arabic, and no amount of swiping brought it back.
   *
   * Right-to-left page turning is already handled — by `inverted`, which is
   * the mushaf's own reading order and has nothing to do with the UI
   * language. Two flips are one too many. The direction is pinned on the
   * pager only, so the ayah sheet and the mini player below still lay out
   * in the app's own direction.
   */
  listWrap: { flex: 1, direction: 'ltr' },
  item: { height: '100%' },
  spreadRow: { flexDirection: 'row' },
  column: { height: '100%' },
  pageBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Physical left/right on purpose: the mushaf's page order is physical
  // (page 1 rightmost) regardless of UI locale direction.
  chevron: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 40,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronLeft: { left: 8 },
  chevronRight: { right: 8 },
  chevronGlyph: { fontSize: 30, fontWeight: '600', lineHeight: 34 },
});
