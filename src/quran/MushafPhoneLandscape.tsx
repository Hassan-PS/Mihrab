/**
 * Phone landscape mushaf — v2.8.0.
 *
 * A view of its own, rather than the portrait reader bent into landscape. It
 * carries none of the machinery that made landscape fragile:
 *
 * - **No zoom arithmetic.** The page is simply the width of the screen. The
 *   old path computed a zoom factor, clamped it against the image render
 *   cache, and sized the visible page differently from its neighbours. Text
 *   has no resolution to run out of, so there is nothing to compute.
 * - **No absolute 604-page strip, and no moving anchor.** That strip is what
 *   made pages skip: offsets were measured from the highest mounted page, so
 *   the anchor shifted every time you turned a page and the momentum handler
 *   could resolve the landing against the previous one. A FlatList owns its
 *   own offsets, and `getItemLayout` makes them exact.
 * - **No layout-mode branching.** This component is only ever mounted for a
 *   phone in landscape; it never asks how wide the screen is or whether a
 *   spread would fit.
 *
 * A page is taller than a landscape screen, so each one scrolls vertically
 * inside its column. That is the whole interaction model: swipe sideways to
 * turn, scroll up and down to read.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import MushafTextPageSurface from './MushafTextPageSurface';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import { getPageLayout } from './mushafLayout';
import { MUSHAF_LINE_HEIGHT_EM } from './MushafTextPage';
import type { AyahRef } from './MushafTextPage';

/** Breathing room either side of the page inside its column. */
const H_PADDING = 10;

/**
 * How much bigger the text is than in portrait. The landscape screen's short
 * side IS the portrait page width, so this is a direct multiple of it.
 */
const LANDSCAPE_ZOOM = 1.6;

export type MushafPhoneLandscapeProps = {
  currentPage: number;
  onPageChange: (page: number) => void;
  nightMode: boolean;
  accentColor: string;
  pageBg: string;
  ornament: string;
  selected?: (AyahRef & { page: number }) | null;
  playing?: AyahRef | null;
  onAyahLongPress: (ref: AyahRef, page: number) => void;
  onToggleFullscreen: () => void;
  /** Rendered above the page — the reader's own header row. */
  renderChrome?: (page: number) => React.ReactNode;
};

export default function MushafPhoneLandscape({
  currentPage,
  onPageChange,
  nightMode,
  accentColor,
  pageBg,
  ornament,
  selected,
  playing,
  onAyahLongPress,
  onToggleFullscreen,
  renderChrome,
}: MushafPhoneLandscapeProps) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<number>>(null);
  const settled = useRef(currentPage);

  // Pages are 1…604; the list is inverted so index 0 sits on the right, which
  // is how a mushaf turns.
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

  // Follow an outside change (jump-to-page, khatmah, a rotation that arrives
  // with a different page). Skip the one we just reported ourselves, or the
  // list fights the user's own swipe.
  useEffect(() => {
    if (currentPage === settled.current) return;
    settled.current = currentPage;
    listRef.current?.scrollToIndex({
      index: currentPage - 1,
      animated: false,
    });
  }, [currentPage]);

  const onMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / width);
      const page = Math.min(MUSHAF_TOTAL_PAGES, Math.max(1, index + 1));
      if (page === settled.current) return;
      settled.current = page;
      onPageChange(page);
    },
    [onPageChange, width],
  );

  const renderItem = useCallback(
    ({ item: page }: { item: number }) => {
      const layout = getPageLayout(page);
      const lineCount = layout?.lines.length ?? 15;
      // Landscape is a READING zoom, not "fill the width". A landscape phone
      // is about twice as wide as it is tall, so sizing the page to the full
      // width doubles the text against portrait — two lines on screen and
      // eight screens of scrolling for one page. The short side (here the
      // height) is the portrait page width, so this is a fixed 1.6× of what
      // portrait shows: bigger, still a page you can read down.
      const textWidth = Math.min(width - H_PADDING * 2, height * LANDSCAPE_ZOOM);
      // Height follows the text: font size is the width over the page's
      // measure, and a line is a fixed multiple of that. No fitting, no
      // stretching, no letterboxing — the column scrolls if it overflows.
      const fontSize = layout ? textWidth / layout.measure : 0;
      const pageHeight = Math.max(
        height,
        fontSize * MUSHAF_LINE_HEIGHT_EM * lineCount,
      );

      return (
        <View style={{ width, backgroundColor: pageBg }}>
          {renderChrome?.(page)}
          <ScrollView
            style={styles.column}
            contentContainerStyle={styles.columnContent}
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              onPress={onToggleFullscreen}
              style={[styles.pageWrap, { width }]}
            >
              <MushafTextPageSurface
                page={page}
                width={textWidth}
                height={pageHeight}
                nightMode={nightMode}
                accentColor={accentColor}
                selected={selected?.page === page ? selected : null}
                playing={playing}
                prefetchRadius={page === currentPage ? 2 : 0}
                // Single tap anywhere on the page → fullscreen toggle;
                // long press on an ayah → the ayah panel (tafsir, audio).
                onWordPress={() => onToggleFullscreen()}
                onWordLongPress={onAyahLongPress}
              />
            </Pressable>
            <View style={styles.footer}>
              <Text style={[styles.pageNumber, { color: ornament }]}>
                {String(page).replace(/\d/g, d =>
                  String.fromCharCode(0x0660 + Number(d)),
                )}
              </Text>
            </View>
          </ScrollView>
        </View>
      );
    },
    [
      accentColor,
      currentPage,
      height,
      nightMode,
      onAyahLongPress,
      onToggleFullscreen,
      ornament,
      pageBg,
      playing,
      renderChrome,
      selected,
      width,
    ],
  );

  return (
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
      // A page is a font plus text nodes, so a small window is plenty and
      // keeps swiping instant.
      windowSize={3}
      maxToRenderPerBatch={2}
      initialNumToRender={1}
      removeClippedSubviews
      // `direction: 'ltr'` — the app tree is RTL in Arabic, and a horizontal
      // list under RTL measures its offset from the right, which parks this
      // one past the end of 604 pages and shows a blank page. Right-to-left
      // page turning comes from `inverted`, not from the UI language.
      style={{ backgroundColor: pageBg, direction: 'ltr' }}
    />
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  pageWrap: { alignItems: 'center' },
  columnContent: { paddingBottom: 24 },
  footer: { alignItems: 'center', paddingTop: 6 },
  pageNumber: { fontSize: 13, fontVariant: ['tabular-nums'] },
});
