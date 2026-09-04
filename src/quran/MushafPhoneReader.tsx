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
import { ayahLineBox, followOffset } from './mushafFollowScroll';
import { riwayahById, type RiwayahId } from './riwayat';
import type { MushafTone } from './mushafTone';
import {
  FOOTER_GAP,
  FOOTER_RESERVE,
  phoneGeometryFits,
  phonePageGeometry,
  phonePageWidth,
  useSettledGeometry,
  type PhonePageGeometry,
} from './phonePageGeometry';

/** Index per page: the FlatList index IS the page, less one. */
const pageIndex = (page: number) => page - 1;
const indexPage = (index: number) => index + 1;

/** Pages either side of the one being read whose fonts are registered ahead. */
const WARM_RADIUS = 2;

/**
 * The page header row, as `MushafPageHeader` builds it: 10pt above a row of
 * ~21pt. Only the fullscreen island offset needs these, and only to put the
 * row's middle where the cutout's middle is.
 */
const PAGE_HEADER_PAD_TOP = 10;
const PAGE_HEADER_CONTENT_H = 21;

/**
 * The list's render window: ONE page at rest, three while it is being
 * touched.
 *
 * ── WHY A PHONE MUṢḤAF MUST NOT HOLD A NEIGHBOUR AT REST ──────────────
 *
 * The window used to widen to three once the push transition was over —
 * the page being read and a neighbour either side — so the next page was
 * already drawn when the finger moved. Those neighbours are laid out at
 * ±one viewport, just outside the window.
 *
 * Then the phone is turned. The native view is resized to the landscape
 * width in the platform's own layout pass, LONG before React Native has
 * re-rendered anything: the pager's viewport is suddenly twice as wide,
 * its children are still portrait-wide, and its scroll offset is still a
 * multiple of the portrait width. The frame the platform then shows —
 * under its own rotation cross-fade, so it is on screen for the length of
 * that animation — is the current page and its neighbour, side by side.
 * On a phone. Reported, exactly, as looking fragile and unstable.
 *
 * Nothing in JavaScript can beat that frame: it is composed before any of
 * our code runs. What can be done is to make sure there is no second page
 * mounted to reveal. So the window is one at rest, and widens the moment a
 * finger lands on the pager — `onTouchStart`, not the scroll, so the
 * neighbours are drawn during the gap between touching and moving — then
 * narrows again once the reader has been still for a while.
 *
 * (It is also right for OPENING, which is what it was first written for:
 * the first page's font and fifteen lines of text should not share the
 * thread with two more pages' worth under the push transition.)
 */
const WINDOW_RESTING = 1;
const WINDOW_MOVING = 3;

/** How long the pager stays wide after it has stopped being touched. */
const WINDOW_IDLE_MS = 2500;

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
  /**
   * The one page that still has a footer pays for it here, not in the
   * shared geometry.
   *
   * `phonePageGeometry` reserves the same small gap under every page now
   * that the medallion is gone. A khatmah portion ends on exactly one
   * page, and that page carries the "finish" pill — so it takes the
   * difference out of its own column. Reserving it globally would shorten
   * six hundred and three pages for a button on one of them, and letting
   * it overflow would make that page scroll in portrait, where a page is
   * supposed to be a page.
   */
  const pageBoxH = geometry
    ? mushafPageColumnHeight({
        page,
        riwayah,
        textWidth: geometry.textWidth,
        viewportHeight:
          geometry.viewportH - (finish ? FOOTER_RESERVE - FOOTER_GAP : 0),
        scrolling: geometry.scrolling,
      })
    : 0;

  /**
   * The scrolling column follows the recitation — see `mushafFollowScroll`
   * for why the unit is the line and not the word. Portrait never scrolls,
   * so there is nothing to follow there; a page that is not the one being
   * recited is handed `playing: null` and never runs this.
   */
  const columnRef = useRef<ScrollView>(null);
  const playingSurah = playing?.surah ?? 0;
  const playingAyah = playing?.ayah ?? 0;
  useEffect(() => {
    if (!geometry?.scrolling || !playingAyah) return;
    const box = ayahLineBox(page, geometry.textWidth, playingSurah, playingAyah);
    if (!box) return;
    columnRef.current?.scrollTo({
      y: followOffset(box, geometry.viewportH, pageBoxH),
      animated: true,
    });
  }, [page, geometry, playingSurah, playingAyah, pageBoxH]);

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
          ref={columnRef}
          style={styles.column}
          contentContainerStyle={
            geometry.scrolling ? styles.columnContent : undefined
          }
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
          {/* THE MEDALLION IS GONE FROM THE PHONE.

              It was a page number in a nicer frame, at the bottom of
              every page, on a screen that already says the page twice:
              the scrubber's readout carries it always, and the player
              carries it while it is up — pinned, as it happens, over
              exactly where the medallion sat. Giving the room back to
              the text is worth more than the ornament.

              What is left is the page a khatmah portion ends on. That
              footer carries the "mark it done" button, which is not
              decoration and has nowhere else to go: a text page is one
              shaped paragraph per line, so nothing can sit inline with
              it and anything floated over it covers the words it points
              at. It comes without the medallion. */}
          {finish ? (
            <MushafPageFooter
              page={page}
              ornament={ornament}
              onPress={onOpenJump}
              showPageNumber={false}
              finish={{
                day: finish.day,
                when: finish.when,
                onPress: finishKhatmahPortion,
              }}
            />
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
});

/**
 * Memoised on its props. The gate in front of it re-renders on every
 * percent of a background font download and on every write to the Qur'an
 * state; the reader subscribes to what it needs itself, and the rest of
 * those renders were reaching the list for nothing.
 */
export const MushafPhoneReader = React.memo(function MushafPhoneReader(
  props: MushafReaderProps,
) {
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
  const chromePad =
    !isFullscreen && Platform.OS === 'ios' && !props.chromeCleared
      ? headerHeight
      : 0;
  /**
   * FULLSCREEN PUTS THE PAGE HEADER BESIDE THE CUTOUT, NOT BELOW IT.
   *
   * The reader used to pad the whole window down by the top inset in
   * fullscreen, which on a Dynamic Island phone spends about 59pt of a
   * 874pt window on a strip of page colour with a black pill floating in
   * it — and then spends another 34 on the header row underneath. But the
   * row is a surah name at one end and a tone pill at the other, and the
   * island is in the MIDDLE: the two things never wanted the same points.
   *
   * So the row is drawn ACROSS the inset band, centred on the island, and
   * the page begins where the row ends. The label is capped at the near
   * half of the window so a long surah name cannot run under the cutout
   * (`pageHeaderTextIsland`). Zero where there is no inset to share —
   * Android with the status bar hidden, and every phone without a cutout.
   */
  const islandPad = isFullscreen
    ? Math.max(
        0,
        insets.top / 2 - PAGE_HEADER_CONTENT_H / 2 - PAGE_HEADER_PAD_TOP,
      )
    : 0;
  // What sits above the page inside each item — and therefore what the
  // geometry has to take off the viewport.
  const navPad = chromePad + islandPad;

  /**
   * TWO BARS DO NOT FIT ACROSS A PHONE'S SHORT SIDE.
   *
   * Landscape leaves the reader about 300dp of height, and the page rail
   * and the mini player are ~48 and ~50 of it — stacked under a page that
   * is already a reading zoom. Both were drawn, the column was squeezed
   * between them, and the player itself ran off the bottom of the window
   * with its title and its buttons cut in half.
   *
   * While something is playing the player is the one that matters: it is
   * the transport, it names the ayah, and the rail's job — getting to a
   * distant page — is not what anyone is doing mid-recitation. Portrait
   * has room for both and keeps both.
   */
  const railYieldsToPlayer = width > height && playback.active != null;
  // Every input that decides a page's box, folded into one value and
  // published once it has stopped moving — see phonePageGeometry.ts for the
  // three layouts per rotation this replaces.
  const settled = useSettledGeometry(
    phonePageGeometry({
      width,
      height,
      sideInset,
      navPad,
      listH,
    }),
  );
  /**
   * A settled geometry from before a rotation describes a viewport that is
   * no longer on screen — and the pager's offset is a multiple of ITS
   * width, so for the frames before `reanchor` lands the window shows two
   * pages sliding into one. The pages stop drawing, and the cover below
   * hides the pager entirely, until the two agree again.
   */
  const geometry = phoneGeometryFits(settled, pageWidth) ? settled : null;

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

  // One page at rest, three while the pager is being used — see the note on
  // WINDOW_RESTING for the rotation this is really about.
  const [windowSize, setWindowSize] = useState(WINDOW_RESTING);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
  }, []);
  const widenWindow = useCallback(() => {
    clearIdle();
    setWindowSize(WINDOW_MOVING);
  }, [clearIdle]);
  const narrowWindowSoon = useCallback(() => {
    clearIdle();
    idleTimer.current = setTimeout(
      () => setWindowSize(WINDOW_RESTING),
      WINDOW_IDLE_MS,
    );
  }, [clearIdle]);
  useEffect(() => clearIdle, [clearIdle]);

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
      // The turn is over: let the neighbours go again after a pause.
      narrowWindowSoon();
    },
    [commitPageTurn, setCurrentPage, narrowWindowSoon],
  );
  const { handlers: pagerHandlers, turnPage } = useMushafPager({
    list: listRef,
    itemCount: totalPages,
    pageWidth,
    currentPage,
    indexForPage: pageIndex,
    pageForIndex: indexPage,
    onTurn,
    onTurnStart: () => {
      // A drag has begun: draw the neighbours if a touch has not already.
      widenWindow();
      core.suspendFollow();
    },
    onSettleNoop: () => {
      narrowWindowSoon();
      core.resumeFollow();
    },
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
          // NO TOP INSET, in fullscreen or out of it: out of fullscreen the
          // navigator's header holds that room, and in fullscreen the page
          // header row is drawn across the band either side of the cutout —
          // see `islandPad`.
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
        // A finger on the pager means a page turn is coming: draw the
        // neighbours now, in the gap before the drag starts. See
        // WINDOW_RESTING.
        onTouchStart={widenWindow}
        // And let them go again once the reader has been still for a while
        // — the turn's own animation is far shorter than that.
        onTouchEnd={narrowWindowSoon}
        onTouchCancel={narrowWindowSoon}
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
          // The content has been laid out at a new width (a rotation, a
          // resize, another muṣḥaf): re-anchor the settled page against
          // it. The re-anchor that runs when the width CHANGES is executed
          // on Android before the list has that width, and is clamped to
          // the old one — see `guardExpired` in useMushafPager.
          onContentSizeChange={pagerHandlers.onContentSizeChange}
          // A page is a typeface plus ~150 text nodes, so a small window
          // is plenty and keeps swiping instant — see WINDOW_RESTING.
          windowSize={windowSize}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          removeClippedSubviews
          style={{ backgroundColor: pageBg }}
        />
        {/* The rotation cover — see `phoneGeometryFits`. A plain sheet of
            the page colour over the pager while its offset and its item
            width disagree, so the reader never shows two pages sliding
            into one. `pointerEvents="none"`: it is not a modal, and a
            swipe that starts under it should still turn the page. */}
        {geometry ? null : (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: pageBg }]}
          />
        )}
      </View>

      {/* The rail was iPad/Mac-only (design review 2d) on the theory that a
          phone has the swipe. But swiping is a page at a time: getting from
          juz 1 to juz 20 is three hundred swipes, and the reader who wants
          Yaseen has no way to ask for it. The rail costs 32pt and answers
          both — and it retires with the rest of the chrome in fullscreen. */}
      {!isFullscreen && !railYieldsToPlayer ? (
        <MushafPageScrubber
          page={currentPage}
          riwayah={riwayah}
          onSelectPage={core.jumpToPage}
          onPeekPage={core.peekPage}
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

      {/* The player takes the page number over from the page — see the
          footer in PhonePageItem for why it is worth the trade. */}
      <MiniPlayer page={currentPage} onPressPage={openJump} />
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
});

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
  /**
   * Landscape only. The fitted portrait column is exactly the viewport,
   * and padding it pushed the medallion off the bottom of a page that had
   * nothing to scroll.
   */
  columnContent: { paddingBottom: 24 },
  pageWrap: { alignItems: 'center' },
});
