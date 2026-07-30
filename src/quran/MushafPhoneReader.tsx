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
import MushafTextPageSurface from './MushafTextPageSurface';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import { getPageLayout } from './mushafLayout';
import { MUSHAF_LINE_HEIGHT_EM } from './MushafTextPage';
import {
  MushafJumpModal,
  MushafPageFooter,
  MushafPageHeader,
  useMushafReaderCore,
  type MushafReaderProps,
} from './mushafReaderCore';
import { AyahActionSheet } from './mushaf/AyahActionSheet';
import { MiniPlayer } from './audio/MiniPlayer';

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
  const [listH, setListH] = useState(0);

  const isLandscape = width > height;
  // iOS floats a translucent nav header over the content; keep the page
  // chrome below it (0 on Android's opaque header, 0 in fullscreen).
  const navPad = !isFullscreen && Platform.OS === 'ios' ? headerHeight : 0;
  const playerReserve = playback.active ? PLAYER_RESERVE : 0;

  const data = React.useMemo(
    () => Array.from({ length: MUSHAF_TOTAL_PAGES }, (_, i) => i + 1),
    [],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width],
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
  }, [width]);

  const onMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / width);
      const page = Math.min(MUSHAF_TOTAL_PAGES, Math.max(1, index + 1));
      if (page === settled.current) return;
      const prev = settled.current;
      settled.current = page;
      core.commitPageTurn(page, prev);
      setCurrentPage(page);
    },
    [core, setCurrentPage, width],
  );

  const renderItem = useCallback(
    ({ item: page }: { item: number }) => {
      const layout = getPageLayout(page);
      const lineCount = layout?.lines.length ?? 15;
      // Portrait: the page spans the width and is height-fitted — the
      // surface divides the box height evenly into lines, so the whole
      // page is on screen with nothing to scroll. Landscape: a READING
      // zoom (1.6× the portrait width), so the page is taller than the
      // window and its column scrolls vertically.
      const chromeH = navPad + HEADER_RESERVE + FOOTER_RESERVE;
      const viewportH = (listH || height) - chromeH;
      const textWidth = isLandscape
        ? Math.min(width - H_PADDING * 2, height * LANDSCAPE_ZOOM)
        : width - H_PADDING * 2;
      let pageBoxH: number;
      if (isLandscape) {
        // Height follows the text: font size is the width over the page's
        // measure, and a line is a fixed multiple of that. The column
        // scrolls whatever overflows.
        const fontSize = layout ? textWidth / layout.measure : 0;
        pageBoxH = Math.max(
          viewportH,
          fontSize * MUSHAF_LINE_HEIGHT_EM * lineCount,
        );
      } else {
        pageBoxH = Math.max(120, viewportH - playerReserve);
      }

      return (
        <View style={[styles.item, { width, backgroundColor: pageBg }]}>
          <View style={{ paddingTop: navPad }}>
            <MushafPageHeader
              page={page}
              isFullscreen={isFullscreen}
              nightMode={nightMode}
              ornament={ornament}
            />
          </View>
          <ScrollView
            style={styles.column}
            contentContainerStyle={styles.columnContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled>
            <Pressable
              onPress={onToggleFullscreen}
              style={[styles.pageWrap, { width }]}>
              <MushafTextPageSurface
                page={page}
                width={textWidth}
                height={pageBoxH}
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
                // Only the page being read warms its neighbours' fonts.
                prefetchRadius={page === currentPage ? 2 : 0}
                onWordPress={onToggleFullscreen}
                onWordLongPress={ref => core.openSelection(ref, page)}
              />
            </Pressable>
            <MushafPageFooter
              page={page}
              ornament={ornament}
              onPress={core.openJump}
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
      palette.accentSolid,
      playback.active,
      playback.playing,
      playerReserve,
      width,
    ],
  );

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
  column: { flex: 1 },
  columnContent: { paddingBottom: 24 },
  pageWrap: { alignItems: 'center' },
});
