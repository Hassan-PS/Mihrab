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
import { finishKhatmahPortion } from './quranState';
import MushafTextPageSurface from './MushafTextPageSurface';
import type { AyahRef } from './MushafTextPage';
import { spreadCount, spreadForPage } from './mushafSpread';
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
import { MushafIndexSidebar, SIDEBAR_WIDTH } from './MushafIndexSidebar';
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
  spreadColumn,
  spreadGeometry,
  spreadGeometryFits,
  spreadPageWidth,
  useSettledSpreadGeometry,
} from './spreadPageGeometry';

/**
 * Pages either side of the one being read whose fonts are registered
 * ahead. Three, not two: the pager steps by a spread, so the next item
 * starts two pages on and its far page is three.
 */
const WARM_RADIUS = 3;

/** One item while opening, three once the transition is over — see the
 *  same pair in MushafPhoneReader. */
const WINDOW_OPENING = 1;
const WINDOW_READING = 3;

type ColumnProps = {
  page: number;
  colW: number;
  chrome: 'both' | 'label' | 'pill';
  /** Which half of a spread this is; 'single' when there is no pair. */
  side: 'left' | 'right' | 'single';
  /** The column's page size and margin, or null while the geometry does
   *  not yet belong to the list on screen — the chrome draws, the page
   *  waits. */
  fit: { pageW: number; pageH: number; margin: number } | null;
  navPad: number;
  isFullscreen: boolean;
  tone: MushafTone;
  ornament: string;
  riwayah: RiwayahId;
  accent: string;
  marks: AyahMarkProps;
  /** Only ever set on the page they are on — see MushafPhoneReader. */
  selected: AyahRef | null;
  playing: AyahRef | null;
  finish: KhatmahFinish | null;
  onToggleFullscreen: () => void;
  onWordPress: (ref: AyahRef, page: number) => void;
  onOpenJump: () => void;
};

/**
 * One page column: header chrome, page placed to its margin, footer.
 *
 * Memoised, and handed only what is its own, for the reasons set out at
 * the head of MushafPhoneReader: the reader re-renders for every recited
 * ayah and every turn, and a column whose props have not changed should
 * not notice.
 */
const SpreadColumn = React.memo(function SpreadColumn({
  page,
  colW,
  chrome,
  side,
  fit,
  navPad,
  isFullscreen,
  tone,
  ornament,
  riwayah,
  accent,
  marks,
  selected,
  playing,
  finish,
  onToggleFullscreen,
  onWordPress,
  onOpenJump,
}: ColumnProps) {
  // Outer edge gets the full margin, the gutter side gets half of one —
  // the two halves together make a gutter equal to the outer margins.
  // rtl-safe: physical left/right on purpose. A muṣḥaf's spread is
  // physically ordered — page 1 is the rightmost sheet — and the list
  // itself is pinned `direction: 'ltr'` for the same reason (see
  // `listWrap`). Start/End here would mirror the gutter into the outer
  // margin in Arabic and Urdu.
  const margin = fit?.margin ?? 0;
  const pad =
    side === 'left'
      ? { paddingLeft: margin, paddingRight: margin / 2 } // rtl-safe: physical, like the pager itself — see above.
      : side === 'right'
        ? { paddingLeft: margin / 2, paddingRight: margin } // rtl-safe: physical, like the pager itself — see above.
        : { paddingHorizontal: margin };
  return (
    <View style={[styles.column, { width: colW }]}>
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
          show={chrome}
        />
      </Pressable>
      <View style={[styles.pageBox, pad]}>
        {fit ? (
          <Pressable onPress={onToggleFullscreen}>
            <MushafTextPageSurface
              page={page}
              width={fit.pageW}
              height={fit.pageH}
              riwayah={riwayah}
              tone={tone}
              accentColor={accent}
              {...marks}
              selected={selected}
              playing={playing}
              // A TAP ON A WORD OPENS ITS AYAH — tafsir, "play from here",
              // bookmark, share. It used to toggle fullscreen, on the
              // reasoning that reading is the common act and a panel the
              // rare one; in practice a tap on the words is what everyone
              // tries first when they want the ayah, and a long press is
              // what nobody guesses. Fullscreen moved to where the words are
              // not: the margins, the header strip, the ⛶ in the navigation
              // bar. A long press still opens the ayah, for hands that
              // learned it that way.
              //
              // The handler itself, not an arrow around it. An arrow is a
              // new function on every render of this list, and it reaches
              // all fifteen lines of every mounted page through three memos
              // — every one of which compared unequal and rebuilt ~250
              // pieces on each page turn and each recited ayah. The screen
              // learned this once (mushafRenderChurn.test) and the readers
              // reintroduced it one level down.
              onWordPress={onWordPress}
              onWordLongPress={onWordPress}
            />
          </Pressable>
        ) : null}
      </View>
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
    </View>
  );
});

/** Memoised on its props — see the same note on MushafPhoneReader. */
export const MushafSpreadReader = React.memo(function MushafSpreadReader(
  props: MushafReaderProps,
) {
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
    tone,
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
  const pageWidth = spreadPageWidth(
    width,
    sideInset,
    showSidebar ? SIDEBAR_WIDTH : 0,
  );

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
  // Raw: the geometry it feeds is what settles, not this on its own.
  const [listH, setListH] = useState(0);

  const navPad =
    !isFullscreen && Platform.OS === 'ios' && !props.chromeCleared
      ? headerHeight
      : 0;

  // Every input that decides a page's size, folded into one value and
  // published once it has stopped moving — see spreadPageGeometry.ts.
  const geometry = useSettledSpreadGeometry(
    spreadGeometry({
      width,
      height,
      sideInset,
      sidebarWidth: showSidebar ? SIDEBAR_WIDTH : 0,
      navPad,
      listH,
    }),
  );
  // A settled geometry from before a rotation names the old width and the
  // old pairing; the new items must not lay their pages out against it.
  const availH = spreadGeometryFits(geometry, pageWidth, paired)
    ? geometry.availH
    : null;

  const data = useMemo(
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

  /**
   * How the list moves and how a movement becomes a page — the settle,
   * the guard against settling our own scrolls, the arrows, the re-anchor
   * on resize. All of it lives in `useMushafPager`, where it runs without
   * a FlatList and is tested with fake offsets and fake timers; this
   * component only points it at the list and says what a turn means.
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
    itemCount,
    pageWidth,
    currentPage,
    indexForPage,
    pageForIndex,
    onTurn,
    // A drag beginning, an arrow, a chevron: recitation follow steps aside
    // for whatever the reader is about to do by hand.
    onTurnStart: core.suspendFollow,
    // Dragged and came back. Nothing was navigated to, so lift the
    // suspension armed at drag begin rather than leaving recitation
    // follow off for thirty seconds after a gesture that did nothing.
    onSettleNoop: core.resumeFollow,
  });

  // THIS is the reader Mac and iPad render in text mode — `MushafReader`
  // is the gate in front of it. The keyboard is bound once, up there;
  // this is how the pages it can see say where they are.
  useRegisterKeyPaging(props.keyTurn, turnPage);

  // The neighbours' fonts, registered ahead of the turn — from here, once
  // per turn, rather than as a per-page prop. A bundled riwayah has none.
  useEffect(() => {
    if (riwayahById(riwayah).render === 'unicode') return;
    warmAround(currentPage, WARM_RADIUS);
  }, [currentPage, riwayah]);

  // One item while opening, three once the transition is out of the way.
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

  /** One page column, or an empty one for the blank half of a spread. */
  const renderColumn = useCallback(
    (
      page: number | null,
      colW: number,
      chrome: 'both' | 'label' | 'pill',
      side: 'left' | 'right' | 'single' = 'single',
    ) => {
      if (page == null || page < 1 || page > totalPages) {
        return <View style={{ width: colW }} />;
      }
      return (
        <SpreadColumn
          page={page}
          colW={colW}
          chrome={chrome}
          side={side}
          fit={availH != null ? spreadColumn(availH, colW, side !== 'single') : null}
          navPad={navPad}
          isFullscreen={isFullscreen}
          tone={tone}
          ornament={ornament}
          riwayah={riwayah}
          accent={accent}
          marks={marks}
          selected={selectedPage === page ? selected : null}
          playing={playingPage === page ? playingRef : null}
          finish={finishPage === page ? finish : null}
          onToggleFullscreen={onToggleFullscreen}
          onWordPress={openSelection}
          onOpenJump={openJump}
        />
      );
    },
    [
      totalPages,
      availH,
      navPad,
      isFullscreen,
      tone,
      ornament,
      riwayah,
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
          {renderColumn(spread.left, pageWidth / 2, 'pill', 'left')}
          {renderColumn(spread.right, pageWidth / 2, 'label', 'right')}
          {/* The gutter's own line. A printed muṣḥaf has a fold here and
              the eye uses it: without one, two pages of the same text at
              the same size read as a single wide column. Hairline and
              faint — a fold is not a rule. */}
          <View
            pointerEvents="none"
            style={[styles.gutter, { backgroundColor: ornament, opacity: 0.18 }]}
          />
        </View>
      );
    },
    [ornament, pageBg, pageWidth, paired, renderColumn, totalPages],
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
          windowSize={windowSize}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          removeClippedSubviews
          style={{ backgroundColor: pageBg }}
        />
        {/* The rotation cover, as on the phone — see `phoneGeometryFits`.
            An iPad turned on its side re-pairs the list AND changes the
            item width, and the offset is corrected a frame later; without
            this the reader shows a spread mid-slide. */}
        {availH == null ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: pageBg }]}
          />
        ) : null}
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
          onPeekPage={core.peekPage}
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
  // Centred in the middle gap, which the three-way split above makes
  // exactly as wide as the margins at the window's edges.
  gutter: {
    position: 'absolute',
    top: '18%',
    bottom: '18%',
    left: '50%',
    width: StyleSheet.hairlineWidth,
  },
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
