/**
 * Phone mushaf reader — both orientations, one component
 * (docs/mushaf-reader-split-plan.md, step 2).
 *
 * Grown from `MushafPhoneLandscape`'s FlatList: portrait and landscape are
 * the SAME tree, so rotation never remounts — it only re-derives the page
 * geometry from `useWindowDimensions` (see `phonePageGeometry.ts`):
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
 *
 * ── WHAT A PAGE IS ALLOWED TO RE-RENDER FOR ───────────────────────────
 *
 * The list re-renders for every reason the reader does — a turn, a recited
 * ayah, the chrome coming or going, the player appearing — and each of
 * those used to reach every mounted page: `renderItem` closed over the
 * whole core and the current page, so it was a new function every render,
 * and a page's props carried things that belonged to other pages (the
 * playing ayah, the selection) and so changed when THEY changed.
 *
 * A page is a memoised component now, and it is handed only what is its
 * own: the settled geometry, the marks, and the selection, the playing
 * ayah and the finish pill only when they are on it. Everything else on
 * the screen can re-render and the page does not notice.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  InteractionManager,
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
import type { AyahRef } from './MushafTextPage';
import {
  MushafJumpModal,
  MushafPageFooter,
  MushafPageHeader,
  useMushafReaderCore,
  type AyahMarkProps,
  type KhatmahFinish,
  type MushafReaderProps,
} from './mushafReaderCore';
import { AyahActionSheet } from './mushaf/AyahActionSheet';
import { MushafPageScrubber } from './MushafPageScrubber';
import { MiniPlayer } from './audio/MiniPlayer';
import { ActiveWordProbe } from './audio/ActiveWordProbe';
import { useRegisterKeyPaging } from './useKeyPaging';
import { useMushafPager } from './useMushafPager';
import { warmAround } from './useMushafPageFont';
import { findPageForAyah } from './pages';
import { riwayahById, type RiwayahId } from './riwayat';
import type { MushafTone } from './mushafTone';
import {
  phonePageGeometry,
  phonePageWidth,
  useSettledGeometry,
  type PhonePageGeometry,
} from './phonePageGeometry';

/** Index per page: the FlatList index IS the page, less one. */
const pageIndex = (page: number) => page - 1;
const indexPage = (index: number) => index + 1;

/** Floating mini-player card: 3px track + row (~54) + 10 bottom margin. */
const PLAYER_RESERVE = 68;

/** Pages either side of the one being read whose fonts are registered ahead. */
const WARM_RADIUS = 2;

/**
 * The list's render window while the reader is opening, and after.
 *
 * Three pages — the one being read and a neighbour either side — is right
 * for swiping: the next page is already drawn when the finger moves. It is
 * wrong for OPENING: the first page's font and fifteen lines of text were
 * sharing the thread with two more pages' worth, under the push
 * transition, and the page the reader came for was the one that waited.
 * So the window is one page until the transition has finished, then three.
 */
const WINDOW_OPENING = 1;
const WINDOW_READING = 3;

type PageItemProps = {
  page: number;
  /** Live: the FlatList item has to be exactly one viewport wide. */
  pageWidth: number;
  /** Settled: what the text is laid out against. Null before the first
   *  measurement, and the page draws nothing in its box. */
  geometry: PhonePageGeometry | null;
  /** Live: keeps the page chrome below iOS's floating header. */
  navPad: number;
  isFullscreen: boolean;
  tone: MushafTone;
  ornament: string;
  riwayah: RiwayahId;
  pageBg: string;
  accent: string;
  marks: AyahMarkProps;
  /** Only ever set on the page they are on — null on every other page,
   *  which is what lets those pages ignore a recited ayah or a selection
   *  happening somewhere else. */
  selected: AyahRef | null;
  playing: AyahRef | null;
  finish: KhatmahFinish | null;
  onToggleFullscreen: () => void;
  onWordPress: (ref: AyahRef, page: number) => void;
  onOpenJump: () => void;
};

const PhonePageItem = React.memo(function PhonePageItem({
  page,
  pageWidth,
  geometry,
  navPad,
  isFullscreen,
  tone,
  ornament,
  riwayah,
  pageBg,
  accent,
  marks,
  selected,
  playing,
  finish,
  onToggleFullscreen,
  onWordPress,
  onOpenJump,
}: PageItemProps) {
  // Portrait: the page spans the width and is height-fitted — the surface
  // fills the box it is given, so the whole page is on screen with nothing
  // to scroll. Landscape: a READING zoom (1.6× the portrait width), so the
  // page is taller than the window and its column scrolls vertically.
  const pageBoxH = geometry
    ? mushafPageColumnHeight({
        page,
        riwayah,
        textWidth: geometry.textWidth,
        viewportHeight: geometry.viewportH,
        scrolling: geometry.scrolling,
        playerReserve: geometry.playerReserve,
      })
    : 0;

  return (
    <View style={[styles.item, { width: pageWidth, backgroundColor: pageBg }]}>
      {/* The header strip toggles fullscreen too — with a tap on a word now
          opening the ayah, the strip and the margins are where the chrome
          is put away and brought back.

          `accessible={false}`, or the strip becomes ONE element to
          VoiceOver and swallows the tone pill inside it: a Pressable is
          accessible by default, and an accessible parent hides its
          children. Seen on the Mac — the pill's label read out, the press
          landed on the strip. */}
      <Pressable
        accessible={false}
        onPress={onToggleFullscreen}
        style={{ paddingTop: navPad }}>
        <MushafPageHeader
          page={page}
          isFullscreen={isFullscreen}
          tone={tone}
          ornament={ornament}
          riwayah={riwayah}
        />
      </Pressable>
      {geometry ? (
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
              width={geometry.textWidth}
              height={pageBoxH}
              riwayah={riwayah}
              tone={tone}
              accentColor={accent}
              {...marks}
              selected={selected}
              playing={playing}
              // A TAP ON A WORD OPENS ITS AYAH; the margins, the header
              // strip and the ⛶ in the navigation bar are where fullscreen
              // lives — see the same line in MushafSpreadReader for why
              // this changed, and for why it is the handler itself and not
              // an arrow around it.
              onWordPress={onWordPress}
              onWordLongPress={onWordPress}
            />
          </Pressable>
          <MushafPageFooter
            page={page}
            ornament={ornament}
            onPress={onOpenJump}
            finish={
              finish
                ? {
                    day: finish.day,
                    when: finish.when,
                    onPress: finishKhatmahPortion,
                  }
                : null
            }
          />
        </ScrollView>
      ) : null}
    </View>
  );
});

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
    tone,
    pageBg,
    ornament,
    currentPage,
    setCurrentPage,
  } = core;

  const listRef = useRef<FlatList<number>>(null);
  // Measured list viewport (excludes the fullscreen top inset padding).
  // Raw: the geometry it feeds is what settles, not this on its own.
  const [listH, setListH] = useState(0);

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
  const pageWidth = phonePageWidth(width, sideInset);
  // iOS floats a translucent nav header over the content; keep the page
  // chrome below it (0 on Android's opaque header, 0 in fullscreen).
  const navPad = !isFullscreen && Platform.OS === 'ios' ? headerHeight : 0;
  const playerReserve = playback.active ? PLAYER_RESERVE : 0;

  // Every input that decides a page's box, folded into one value and
  // published once it has stopped moving — see phonePageGeometry.ts for the
  // three layouts per rotation this replaces.
  const geometry = useSettledGeometry(
    phonePageGeometry({
      width,
      height,
      sideInset,
      navPad,
      listH,
      playerReserve,
    }),
  );

  const data = useMemo(
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

  /**
   * The same pager the spread reader drives, with an index per page. It
   * used to be a hand-rolled copy of the mechanics — a settled ref, two
   * effects, a momentum handler — with none of the guard against settling
   * its own scrolls and none of the tests. One pager, two layouts.
   */
  const { commitPageTurn } = core;
  const onTurn = useCallback(
    (page: number, prevPage: number) => {
      commitPageTurn(page, prevPage);
      setCurrentPage(page);
    },
    [commitPageTurn, setCurrentPage],
  );
  const { handlers: pagerHandlers, turnPage } = useMushafPager({
    list: listRef,
    itemCount: totalPages,
    pageWidth,
    currentPage,
    indexForPage: pageIndex,
    pageForIndex: indexPage,
    onTurn,
    onTurnStart: core.suspendFollow,
    onSettleNoop: core.resumeFollow,
  });

  /**
   * A phone with a hardware keyboard attached is rare but real, and this
   * reader is also what an iPhone-idiom window shows, so it publishes its
   * turn like the spread reader does. Where there is no keyboard the
   * native module is absent and the binding never fires.
   */
  useRegisterKeyPaging(props.keyTurn, turnPage);

  // The neighbours' fonts, registered ahead of the swipe — from here, once
  // per turn, rather than as a per-page prop that changed on two pages
  // every turn and re-rendered both. A bundled riwayah has no page fonts.
  useEffect(() => {
    if (riwayahById(riwayah).render === 'unicode') return;
    warmAround(currentPage, WARM_RADIUS);
  }, [currentPage, riwayah]);

  // One page while opening, three once the transition is out of the way.
  const [windowSize, setWindowSize] = useState(WINDOW_OPENING);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() =>
      setWindowSize(WINDOW_READING),
    );
    return () => task.cancel();
  }, []);

  // Which page each of the per-page things is on, so every other page can
  // be handed null and stay put.
  const selectedPage =
    core.sheetVisible && core.selected ? core.selected.page : 0;
  const playingPage = useMemo(
    () =>
      playback.active && playback.playing
        ? findPageForAyah(playback.active.surah, playback.active.ayah, riwayah)
        : 0,
    [playback.active, playback.playing, riwayah],
  );
  const finishPage = core.finish?.page ?? 0;

  const { marks, finish, selected, openSelection, openJump } = core;
  const accent = palette.accentSolid;
  const playingRef = playback.active;
  const renderItem = useCallback(
    ({ item: page }: { item: number }) => (
      <PhonePageItem
        page={page}
        pageWidth={pageWidth}
        geometry={geometry}
        navPad={navPad}
        isFullscreen={isFullscreen}
        tone={tone}
        ornament={ornament}
        riwayah={riwayah}
        pageBg={pageBg}
        accent={accent}
        marks={marks}
        selected={selectedPage === page ? selected : null}
        playing={playingPage === page ? playingRef : null}
        finish={finishPage === page ? finish : null}
        onToggleFullscreen={onToggleFullscreen}
        onWordPress={openSelection}
        onOpenJump={openJump}
      />
    ),
    [
      pageWidth,
      geometry,
      navPad,
      isFullscreen,
      tone,
      ornament,
      riwayah,
      pageBg,
      accent,
      marks,
      selectedPage,
      selected,
      playingPage,
      playingRef,
      finishPage,
      finish,
      onToggleFullscreen,
      openSelection,
      openJump,
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
          onMomentumScrollEnd={pagerHandlers.onMomentumScrollEnd}
          onScroll={pagerHandlers.onScroll}
          scrollEventThrottle={16}
          onScrollToIndexFailed={pagerHandlers.onScrollToIndexFailed}
          onScrollBeginDrag={pagerHandlers.onScrollBeginDrag}
          // A page is a typeface plus ~150 text nodes, so a small window
          // is plenty and keeps swiping instant — see WINDOW_READING.
          windowSize={windowSize}
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
      {/* Publishes the recited word for the lines to follow — see the
          store for why it is a probe and not a prop. Mounted only while
          something plays: the hook behind it polls playback four times a
          second for as long as it is mounted, playing or not. */}
      {playback.active && playback.playing ? <ActiveWordProbe /> : null}

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
