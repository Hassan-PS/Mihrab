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
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import { spreadCount, spreadForPage } from './mushafSpread';
import {
  MushafJumpModal,
  MushafPageFooter,
  MushafPageHeader,
  useMushafReaderCore,
  type MushafReaderProps,
} from './mushafReaderCore';
import { AyahActionSheet } from './mushaf/AyahActionSheet';
import { MiniPlayer } from './audio/MiniPlayer';

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
    nightMode,
    pageBg,
    ornament,
    currentPage,
    setCurrentPage,
  } = core;

  // The one internal branch: portrait window → single centred page per
  // item; landscape → a facing pair per item.
  const paired = width > height;
  const itemCount = paired ? spreadCount(MUSHAF_TOTAL_PAGES) : MUSHAF_TOTAL_PAGES;

  const indexForPage = useCallback(
    (page: number) =>
      paired ? spreadForPage(page, MUSHAF_TOTAL_PAGES).index : page - 1,
    [paired],
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
  const [listH, setListH] = useState(0);

  const navPad = !isFullscreen && Platform.OS === 'ios' ? headerHeight : 0;
  const playerReserve = playback.active ? PLAYER_RESERVE : 0;

  const data = React.useMemo(
    () => Array.from({ length: itemCount }, (_, i) => i),
    [itemCount],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width],
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
  }, [width, indexForPage]);

  const onMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const idx = Math.max(
        0,
        Math.min(itemCount - 1, Math.round(e.nativeEvent.contentOffset.x / width)),
      );
      if (idx === settledIndex.current) return;
      const prevPage = settledPage.current;
      const page = pageForIndex(idx);
      settledIndex.current = idx;
      settledPage.current = page;
      core.commitPageTurn(page, prevPage);
      setCurrentPage(page);
    },
    [core, itemCount, pageForIndex, setCurrentPage, width],
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

  /** One page column: header chrome, centred width-fit height-capped
   *  page, page-number footer. */
  const renderColumn = useCallback(
    (page: number | null, colW: number, chrome: 'both' | 'label' | 'pill') => {
      if (page == null || page < 1 || page > MUSHAF_TOTAL_PAGES) {
        return <View style={{ width: colW }} />;
      }
      const availH = Math.max(
        120,
        (listH || height) -
          navPad -
          HEADER_RESERVE -
          FOOTER_RESERVE -
          playerReserve,
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
              show={chrome}
            />
          </View>
          <View style={styles.pageBox}>
            <Pressable onPress={onToggleFullscreen}>
              <MushafTextPageSurface
                page={page}
                width={pageW}
                height={pageH}
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
                onWordPress={onToggleFullscreen}
                onWordLongPress={ref => core.openSelection(ref, page)}
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
    ],
  );

  const renderItem = useCallback(
    ({ item: index }: { item: number }) => {
      if (!paired) {
        // Portrait: one centred page fills the item.
        return (
          <View style={[styles.item, { width, backgroundColor: pageBg }]}>
            {renderColumn(index + 1, width, 'both')}
          </View>
        );
      }
      const spread = spreadForPage(index * 2 + 1, MUSHAF_TOTAL_PAGES);
      // The item lays out physically LTR (the app drives RTL via text, not
      // I18nManager): even page on the left half, odd page on the right.
      // Chrome splits across the spread's outer corners — label at the
      // outer right, night pill at the outer left.
      return (
        <View style={[styles.item, styles.spreadRow, { width, backgroundColor: pageBg }]}>
          {renderColumn(spread.left, width / 2, 'pill')}
          {renderColumn(spread.right, width / 2, 'label')}
        </View>
      );
    },
    [pageBg, paired, renderColumn, width],
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
        { backgroundColor: pageBg, paddingTop: isFullscreen ? insets.top : 0 },
      ]}>
      <StatusBar hidden={isFullscreen} animated />
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listWrap: { flex: 1 },
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
