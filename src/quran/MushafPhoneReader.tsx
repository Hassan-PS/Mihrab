/**
 * Phone mushaf reader — both orientations, one component
 * (docs/mushaf-reader-split-plan.md, step 2).
 *
 * Grown from `MushafPhoneLandscape`'s FlatList: portrait and landscape are
 * the SAME tree, so rotation never remounts — it only re-derives three
 * numbers from `useWindowDimensions`:
 *
 * - `pageWidth` = window width (both orientations)
 * - `textWidth` = portrait: width − padding · landscape:
 *   `min(width − padding, height × 1.6)` (the reading zoom — the short
 *   side IS the portrait page width)
 * - the page column scrolls vertically only when the page is taller than
 *   the window (portrait: never — the page is height-fitted so
 *   `lineHeight = available height / lineCount`; landscape: always).
 *
 * The FlatList keeps its index across rotation; `getItemLayout` recomputes
 * from the new width. No zoom clamps, no windowed strip, no image-cache
 * math — this component is only ever mounted on a phone (DEVICE_CLASS,
 * answered once at module scope) in text mode.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAppPalette } from '../hooks/useAppPalette';
import { finishKhatmahPortion } from './quranState';
import MushafTextPageSurface, {
  mushafPageColumnHeight,
} from './MushafTextPageSurface';
import {
  MushafJumpModal,
  MushafPageFooter,
  MushafPageHeader,
  useMushafReaderCore,
  type MushafReaderProps,
  useSettledMeasure,
} from './mushafReaderCore';
import { AyahActionSheet } from './mushaf/AyahActionSheet';
import { MushafPageScrubber } from './MushafPageScrubber';
import { MiniPlayer } from './audio/MiniPlayer';
import { useRegisterKeyPaging } from './useKeyPaging';

/** Breathing room either side of the page inside its column. */
const H_PADDING = 10;

/**
 * How much bigger the landscape text is than portrait. The landscape
 * screen's short side IS the portrait page width, so this is a direct
 * multiple of it (see MushafPhoneLandscape for the full rationale).
 */
const LANDSCAPE_ZOOM = 1.6;

/** Estimated header-row / footer-medallion heights, dp — the chrome that
 *  brackets the page inside each column. */
const HEADER_RESERVE = 34;
const FOOTER_RESERVE = 42;
/** Floating mini-player card: 3px track + row (~54) + 10 bottom margin. */
const PLAYER_RESERVE = 68;

export function MushafPhoneReader(props: MushafReaderProps) {
  const { isFullscreen, onToggleFullscreen } = props;
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

  const listRef = useRef<FlatList<number>>(null);
  const settled = useRef(currentPage);
  // Measured list viewport (excludes the fullscreen top inset padding);
  // window height is a fine estimate for the first frame.
  const [listHRaw, setListH] = useState(0);
  // Settled, so a fullscreen toggle lays the page out once instead of at every
  // intermediate height the chrome passes through on its way out.
  const listH = useSettledMeasure(listHRaw);

  const isLandscape = width > height;
  /**
   * Display cutout / rounded corners (v2.8.2). `insets.left` and
   * `insets.right` are PHYSICAL edges — unlike padding they never flip with
   * the UI language — and the page must stay centred, so the reader reserves
   * the LARGER of the two on BOTH sides. The block only narrows; it never
   * shifts off centre, and no word moves line (docs/mushaf-fidelity-rules.md).
   *
   * The inset lives on the reader container, which is painted `pageBg`, so
   * the page colour still bleeds to the physical screen edge — an inset on
   * the navigator's theme-coloured content view is what left a strip of app
   * background beside the page.
   */
  const sideInset = Math.max(insets.left, insets.right);
  /**
   * One pager item = the list viewport. Everything that pages by a frame —
   * `getItemLayout`, the momentum-end index, the page column — measures in
   * this, never the raw window width, or the snap drifts off the page.
   */
  const pageWidth = width - sideInset * 2;
  // iOS floats a translucent nav header over the content; keep the page
  // chrome below it (0 on Android's opaque header, 0 in fullscreen).
  const navPad = !isFullscreen && Platform.OS === 'ios' ? headerHeight : 0;
  const playerReserve = playback.active ? PLAYER_RESERVE : 0;

  const data = React.useMemo(
    () => Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  // Follow an outside change (jump-to-page, khatmah, recitation follow).
  // Skip the one we just reported ourselves, or the list fights the
  // user's own swipe.
  useEffect(() => {
    if (currentPage === settled.current) return;
    settled.current = currentPage;
    listRef.current?.scrollToIndex({
      index: currentPage - 1,
      animated: false,
    });
  }, [currentPage]);

  // Rotation: offsets are width-multiples, so re-anchor the settled page
  // against the new width. The tree itself never remounts.
  useEffect(() => {
    listRef.current?.scrollToIndex({
      index: settled.current - 1,
      animated: false,
    });
  }, [pageWidth]);

  const onMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      const page = Math.min(totalPages, Math.max(1, index + 1));
      if (page === settled.current) {
        // Dragged and came back. Nothing was navigated to, so lift the
        // suspension armed at drag begin rather than leaving recitation
        // follow off for thirty seconds after a gesture that did nothing.
        core.resumeFollow();
        return;
      }
      const prev = settled.current;
      settled.current = page;
      core.commitPageTurn(page, prev);
      setCurrentPage(page);
    },
    [core, pageWidth, setCurrentPage, totalPages],
  );

  /**
   * Page turn by something other than a swipe. `dir` is READING direction:
   * +1 = the next page of the book (the mushaf advances right-to-left,
   * which the list already lays out; the index here IS the page number, so
   * it moves with `dir` either way).
   *
   * A phone with a hardware keyboard attached is rare but real, and this
   * reader is also what an iPhone-idiom window shows, so it publishes its
   * turn like the spread reader does. Where there is no keyboard the
   * native module is absent and the binding never fires.
   */
  const turnPage = useCallback(
    (dir: 1 | -1) => {
      const page = Math.min(totalPages, Math.max(1, settled.current + dir));
      if (page === settled.current) return;
      core.suspendFollow();
      const prev = settled.current;
      settled.current = page;
      core.commitPageTurn(page, prev);
      setCurrentPage(page);
      listRef.current?.scrollToIndex({ index: page - 1, animated: true });
    },
    [core, setCurrentPage, totalPages],
  );

  useRegisterKeyPaging(props.keyTurn, turnPage);

  const renderItem = useCallback(
    ({ item: page }: { item: number }) => {
      // Portrait: the page spans the width and is height-fitted — the
      // surface fills the box it is given, so the whole page is on screen
      // with nothing to scroll. Landscape: a READING zoom (1.6× the
      // portrait width), so the page is taller than the window and its
      // column scrolls vertically.
      const chromeH = navPad + HEADER_RESERVE + FOOTER_RESERVE;
      // Whole dp. The measured viewport is a float, and a sub-pixel wobble in
      // it is enough to give the page a different box, which re-lays out all
      // fifteen lines to produce a page nobody could tell apart from the one
      // already on screen.
      const viewportH = Math.round((listH || height) - chromeH);
      const textWidth = isLandscape
        ? Math.min(pageWidth - H_PADDING * 2, height * LANDSCAPE_ZOOM)
        : pageWidth - H_PADDING * 2;
      const pageBoxH = mushafPageColumnHeight({
        page,
        riwayah,
        textWidth,
        viewportHeight: viewportH,
        scrolling: isLandscape,
        playerReserve,
      });

      return (
        <View style={[styles.item, { width: pageWidth, backgroundColor: pageBg }]}>
          <View style={{ paddingTop: navPad }}>
            <MushafPageHeader
              page={page}
              isFullscreen={isFullscreen}
              nightMode={nightMode}
              ornament={ornament}
              riwayah={riwayah}
            />
          </View>
          <ScrollView
            style={styles.column}
            contentContainerStyle={styles.columnContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled>
            <Pressable
              onPress={onToggleFullscreen}
              style={[styles.pageWrap, { width: pageWidth }]}>
              <MushafTextPageSurface
                page={page}
                width={textWidth}
                height={pageBoxH}
                riwayah={riwayah}
                nightMode={nightMode}
                accentColor={palette.accentSolid}
                {...core.marks}
                selected={
                  core.sheetVisible && core.selected?.page === page
                    ? core.selected
                    : null
                }
                playing={
                  playback.active && playback.playing ? playback.active : null
                }
                // Only the page being read warms its neighbours' fonts.
                prefetchRadius={page === currentPage ? 2 : 0}
                // A SINGLE TAP anywhere on the page — word, margin or the
                // gap between lines — toggles fullscreen. Reading is the
                // common act; opening a panel is the rare one, and a reader
                // who taps to clear the chrome should not be interrupted by
                // a sheet because the tap landed on a word. The ayah panel
                // (tafsir, "play from here") is a LONG PRESS on the ayah.
                //
                // The handler itself, not an arrow around it — see the same
                // line in MushafSpreadReader for what the arrow cost.
                onWordPress={onToggleFullscreen}
                onWordLongPress={core.openSelection}
              />
            </Pressable>
            <MushafPageFooter
              page={page}
              ornament={ornament}
              onPress={core.openJump}
              finish={
                core.finish?.page === page
                  ? {
                    day: core.finish.day,
                    when: core.finish.when,
                    onPress: finishKhatmahPortion,
                  }
                  : null
              }
            />
          </ScrollView>
        </View>
      );
    },
    [
      core,
      currentPage,
      height,
      isFullscreen,
      isLandscape,
      listH,
      navPad,
      nightMode,
      onToggleFullscreen,
      ornament,
      pageBg,
      pageWidth,
      palette.accentSolid,
      playback.active,
      playback.playing,
      playerReserve,
      riwayah,
    ],
  );

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
          initialScrollIndex={currentPage - 1}
          getItemLayout={getItemLayout}
          keyExtractor={p => String(p)}
          renderItem={renderItem}
          onMomentumScrollEnd={onMomentumEnd}
          onScrollBeginDrag={core.suspendFollow}
          // A page is a typeface plus ~150 text nodes, so a small window
          // is plenty and keeps swiping instant.
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          removeClippedSubviews
          style={{ backgroundColor: pageBg }}
        />
      </View>

      {/* The rail was iPad/Mac-only (design review 2d) on the theory that a
          phone has the swipe. But swiping is a page at a time: getting from
          juz 1 to juz 20 is three hundred swipes, and the reader who wants
          Yaseen has no way to ask for it. The rail costs 32pt and answers
          both — and it retires with the rest of the chrome in fullscreen. */}
      {!isFullscreen ? (
        <MushafPageScrubber
          page={currentPage}
          riwayah={riwayah}
          onSelectPage={core.jumpToPage}
          onOpenJump={core.openJump}
        />
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
        totalPages={totalPages}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  column: { flex: 1 },
  columnContent: { paddingBottom: 24 },
  pageWrap: { alignItems: 'center' },
});
