/**
 * The surah read with its translation (or tafsir) under each āyah — a
 * virtualized list, one card per āyah (docs/quran-reader-plan.md,
 * QR-1/2/17/20).
 *
 *   • VIRTUALIZED: Al-Baqarah does not mount 286 cards at once (QR-1).
 *   • Arabic renders word-by-word so recitation can highlight the live
 *     word (QR-17); memorization hide/reveal masks Arabic or translation
 *     per āyah (QR-20).
 *   • Translation text loads asynchronously after first paint (QR-2) — the
 *     1–2 MB edition JSON no longer blocks the navigation transition.
 *
 * This and the muṣḥaf were one screen until 2 September, switching on
 * `isMushaf` in a shared header effect, content style and render. They
 * share a route and a toggle; `QuranSurahScreen` is the route now, and this
 * is the translation reader on its own.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useHeaderHeight } from '@react-navigation/elements';
import { TilawahIcon } from '../../quran/audio/PlaybackIcons';
import { QuranBookIcon } from '../../theme/icons';
import {
  QuranDownloadStripView,
  useQuranDownloadRun,
} from '../../quran/QuranDownloadStrip';
import { desktopSize } from '../../responsive/desktop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../../hooks/useAppPalette';
import { loadSurah, type SurahIndex } from '../../quran/quran';
import { getSurahTranslation } from '../../quran/translations';
import { useActiveEdition } from '../../quran/useActiveEdition';
import { loadTafsir, resolveTafsirEdition } from '../../quran/tafsir';
import {
  CompanionTextSheet,
  useCompanionChoice,
} from '../../quran/CompanionTextControls';
import {
  useOverlayDismissGuard,
  useSettledMeasure,
} from '../../quran/mushafReaderCore';
import { findPageForAyah } from '../../quran/pages';
import { surahName } from '../../quran/surahName';
import {
  activeKhatmah,
  drawnReadingPosition,
  findBookmark,
  isStarred,
  recordReading,
  useQuranState,
  BOOKMARK_COLORS,
  KHATMAH_COLOR,
  READING_COLOR,
} from '../../quran/quranState';
import { usePlaybackStatus } from '../../quran/audio/playback';
import { useActiveWordIndex } from '../../quran/audio/useWordTiming';
import { countedWordIndices } from '../../quran/audio/countedWords';
import { AyahActionSheet } from '../../quran/mushaf/AyahActionSheet';
import { MiniPlayer } from '../../quran/audio/MiniPlayer';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import type { RootStackParamList } from '../../navigation/types';
import { cardEdgeStyle } from '../../theme/chrome';
import { TYPE, arabicTextStyle } from '../../theme/typography';
import { READING_BASE } from '../../theme/readingText';
import { useReadingText } from '../../hooks/useReadingText';
import { TextSizeStepper } from '../../components/ui';
import { TabBackButton } from '../../navigation/TabBackButton';
import { RADIUS, SPACING } from '../../theme/tokens';

type AyahRow = {
  ayah: number; // 1-based
  arabic: string;
};

type Props = {
  surah: SurahIndex;
  surahNumber: number;
  /** Scroll to this āyah on open (deep links from bookmarks and search). */
  scrollToAyah?: number;
  /** Switch to the muṣḥaf. */
  onToggleMode: () => void;
};

export function TranslationSurahScreen({
  surah,
  surahNumber,
  scrollToAyah,
  onToggleMode,
}: Props) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const { palette } = useAppPalette();
  const readingText = useReadingText();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  /** Whatever the app is downloading — drawn as the strip, see below. */
  const download = useQuranDownloadRun();
  const { settings } = usePrayerSettings();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const quran = useQuranState();
  const playback = usePlaybackStatus();
  // Header closures read playback via a ref so the nav header doesn't
  // rebuild on every ayah change.
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const activeWord = useActiveWordIndex();
  // The window's settled size, so the header row is rebuilt after a Mac
  // resize instead of answering the mouse where it used to be.
  const win = useWindowDimensions();
  const headerW = useSettledMeasure(Math.round(win.width));
  const headerH = useSettledMeasure(Math.round(win.height));
  const edition = useActiveEdition();
  // Current companion choice caption (mode + edition) for the header row.
  const companionChoice = useCompanionChoice();

  // ── Async data: Arabic + translation (QR-2) ─────────────────────────
  const [rows, setRows] = useState<AyahRow[] | null>(null);
  const [translations, setTranslations] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    void loadSurah(surahNumber).then(loaded => {
      if (cancelled || !loaded) return;
      setRows(
        loaded.arabic.map((arabic, i) => ({ ayah: i + 1, arabic })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [surahNumber]);

  useEffect(() => {
    let cancelled = false;
    setTranslations(null);
    // Defer the (potentially first-time) 1–2 MB edition read until after
    // the transition/paint. The timeout stays now that the read is off
    // the bundle and onto the disk: it is what keeps the first frame of
    // the screen from waiting on it at all.
    const timer = setTimeout(() => {
      if (cancelled) return;
      getSurahTranslation(edition, surahNumber)
        .then(texts => {
          if (!cancelled) setTranslations(texts);
        })
        .catch(() => {
          if (!cancelled) setTranslations([]);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [edition, surahNumber]);

  // ── Selection / sheets ──────────────────────────────────────────────
  const [selectedAyah, setSelectedAyah] = useState<number | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetScrollAudio, setSheetScrollAudio] = useState(false);
  const [editionPickerVisible, setEditionPickerVisible] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Reset per-surah reveal state when hide mode or surah changes.
    setRevealed(new Set());
  }, [quran.prefs.hideMode, surahNumber]);

  const toggleMushaf = useCallback(() => {
    // The toggle swaps the ENTIRE screen (translation list ⇄ mushaf
    // reader), which would take any open <Modal> down with it while it is
    // still presented — an orphaned activity-window dialog that eats every
    // touch app-wide. Close the sheets first, then switch.
    setSheetVisible(false);
    setEditionPickerVisible(false);
    onToggleMode();
  }, [onToggleMode]);

  // ── Header ──────────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      // Only the muṣḥaf rotates; everything else in the app stays portrait.
      orientation: 'portrait',
      // The navigator pads every screen's content by the bottom safe area
      // in the theme background (RootNavigator `contentStyle`); this list
      // is drawn on that background, so the pad is right here.
      contentStyle: { paddingBottom: insets.bottom, backgroundColor: palette.bg },
      // THE APP'S CHROME, NOT THE PAGE'S. This screen and the muṣḥaf share
      // one route and swap on the toggle, and `setOptions` accumulates:
      // the muṣḥaf paints the header in its paper/sepia/night tone, and
      // without these the translation reader inherited that tint over its
      // own app-coloured list — a sepia bar on a dark page. The muṣḥaf
      // tone is the muṣḥaf's; this reader is the app.
      ...(Platform.OS === 'ios'
        ? { headerBlurEffect: (palette.isDark ? 'dark' : 'light') as 'dark' | 'light' }
        : { headerStyle: { backgroundColor: String(palette.bg) } }),
      headerTintColor: String(palette.text),
      // writingDirection is a valid TextStyle prop that react-navigation's
      // narrower title-style type omits — the same cast RootNavigator makes.
      headerTitleStyle: {
        color: palette.text,
        writingDirection: isArabic ? 'rtl' : 'ltr',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      headerLargeTitleStyle: {
        color: palette.text,
        writingDirection: isArabic ? 'rtl' : 'ltr',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // The NAME follows the app language.
      title: surahName(surah),
      /**
       * THE SIZE CONTROL LIVES IN THE BAR, NOT IN THE SURAH'S HEADER.
       *
       * It used to sit under the surah's name, which is the first thing in
       * the list — so a reader forty ayahs into al-Baqarah who wanted the
       * translation a size larger had to scroll all the way back to the
       * top of the surah to reach it, change it, and scroll back down to
       * where they were reading. The one control whose whole purpose is
       * "this text is hard to read" was the one you had to read your way
       * back to.
       *
       * In the bar it is in reach from anywhere in the surah, which is
       * where a reader actually is when the thought occurs.
       *
       * ── WHY IT REPLACES THE SYSTEM BACK BUTTON ────────────────────────
       *
       * A native stack draws its own back control, and `headerLeft` takes
       * that slot rather than sharing it — so putting anything beside the
       * arrow means drawing the arrow. `TabBackButton` is the app's own,
       * already matched to the navigator's glyph and inset for exactly
       * this reason (a tab's header has no back control either), and it
       * takes an `onPress`, so here it pops instead of going to Today.
       * The swipe-back gesture and Android's hardware back are untouched:
       * neither goes through this button.
       *
       * Only when there IS somewhere to go back to. A deep link from a
       * widget opens this screen with nothing beneath it, and the system
       * would draw no arrow there — so neither does this.
       */
      headerLeft: () => (
        <View
          // Keyed on the settled window size for the same reason the right
          // side is — see the note there.
          key={`size-${headerW}x${headerH}`}
          style={[
            headerSide.row,
            // The arrow carries the navigator's own leading inset; without
            // it the pill would sit flush against the edge of the screen.
            navigation.canGoBack() ? null : headerSide.padStart,
          ]}>
          {navigation.canGoBack() ? (
            <TabBackButton onPress={() => navigation.goBack()} />
          ) : null}
          <TextSizeStepper />
        </View>
      ),
      headerRight: () => (
        // Wider gaps on the Mac: these are pointer targets on a desktop,
        // not thumb targets on a tablet, and Catalyst has already scaled
        // the whole row down (responsive/desktop.ts).
        <View
          // Keyed on the settled window size, and the size is in this
          // effect's inputs — a native header subview that RN laid out for
          // one window width answers the mouse at that width for ever. See
          // the long note in MushafSurahScreen; this row is the same row.
          key={`chips-${headerW}x${headerH}`}
          style={{
            flexDirection: 'row',
            gap: desktopSize(14),
            alignItems: 'center',
          }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.playbackSettings', 'Recitation')}
            onPress={() => {
              // Unified sheet (v2.7.28): open the ayah panel scrolled to
              // the recitation controls — everything lives in one place.
              const active = playbackRef.current.active;
              setSelectedAyah(
                active?.surah === surahNumber ? active.ayah : 1,
              );
              setSheetScrollAudio(true);
              setSheetVisible(true);
            }}
            hitSlop={10}
            style={{ paddingHorizontal: SPACING.xs }}>
            {/* THE MARK ALONE, AS THE MUṢḤAF'S HEADER ALREADY DRAWS IT.
                This carried the word "Audio" beside the note and the
                toggle carried "Mushaf" — two labels in the header of a
                reader, which is the same pair the muṣḥaf dropped to icons
                and for the same reason: they are the player's own marks
                and are known by the time anyone looks for them here.
                It matters more now than it did there. This bar also holds
                the size control, and at 1.5× system text the two words
                left the sūrah's name as "Al-…" — the one thing the bar is
                for. The words live on in the accessibility labels, where
                a screen reader still says them in full. */}
            <TilawahIcon
              color={String(palette.accentSolid)}
              size={desktopSize(22)}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.switchToMushaf', 'Switch to mushaf view')}
            onPress={toggleMushaf}
            hitSlop={10}
            style={{ paddingHorizontal: SPACING.xs }}>
            {/* The open muṣḥaf, which is where this goes — the mirror of
                the muṣḥaf reader's own toggle, which draws the
                translation's mark to come back here. */}
            <QuranBookIcon
              color={String(palette.accentSolid)}
              size={desktopSize(22)}
            />
          </Pressable>
        </View>
      ),
    });
  }, [
    navigation,
    surah,
    surahNumber,
    isArabic,
    palette.accentSolid,
    palette.bg,
    palette.text,
    palette.isDark,
    insets.bottom,
    t,
    toggleMushaf,
    headerW,
    headerH,
  ]);

  // Translation mode owns its own two <Modal>s (ayah sheet + companion-text
  // sheet). Same rule as the reader's: they must be dismissed before the
  // screen is popped, never with it — see `useOverlayDismissGuard`.
  const closeSheets = useCallback(() => {
    setSheetVisible(false);
    setEditionPickerVisible(false);
  }, []);
  useOverlayDismissGuard(sheetVisible || editionPickerVisible, closeSheets);

  // ── Landing on an ayah — issue #41, and the walk that fix left behind ─
  //
  // "Continue" opened the surah and left the reader at the top for any
  // ayah past the first screen. The first fix reached for
  // `initialScrollIndex`, found that it is honoured at mount only — and
  // the rows arrive AFTER the list has mounted, so it was always
  // undefined when it mattered — and fell back to asking `scrollToIndex`
  // again each time the list reported it had not measured that far.
  //
  // That walk is what this replaces. With dynamic row heights each round
  // mounted another batch, measured it, scrolled to the end of what was
  // measured and asked again, up to fourteen times — while the arriving
  // translations grew every row and set the whole thing going once more,
  // for four seconds. Deep in al-Baqarah it did not merely stutter:
  // opening at ayah 250 on an emulator moved the list at every sample for
  // three seconds and finished on BLANK SPACE, scrolled to an offset
  // computed from half-measured frames with no rows rendered there.
  //
  // `initialScrollIndex` looks like the answer and is not, for a reason
  // worth writing down so nobody spends the afternoon on it twice. It is
  // honoured at mount only — so the list has to wait for the rows, which
  // is fixable — but it also tells VirtualizedList to render its first
  // batch AT that index and never mount the rows above it, and without
  // `getItemLayout` there is nothing to give those unmounted rows a
  // height. The leading space collapses to nothing. Measured: the reader
  // lands on ayah 250 correctly and then cannot scroll back to 249,
  // because as far as the list is concerned 249 occupies no space and the
  // surah header is directly above. Trading a slow landing for 249
  // unreachable ayahs is not a fix.
  //
  // So the landing is not a scroll at all. The list is handed a WINDOW of
  // the surah that BEGINS at the ayah asked for, and opens at its top —
  // which is the ayah, with no scrolling, no measuring and no retries.
  // Reading backwards prepends the rows above a chunk at a time
  // (`onStartReached`), and `maintainVisibleContentPosition` keeps the
  // page still while they arrive, so scrolling up costs what scrolling
  // down costs. Nothing is ever unreachable and nothing is ever walked.
  //
  // The marker is still not written until the READER scrolls. Not "until
  // the ayah is on screen": a bookmark or a search result lands here too,
  // and a landing is a jump, which moves nothing (see `recordReading`).
  // Reading does.
  const listRef = useRef<FlatList<AyahRow>>(null);
  /** The absolute row index the reader asked for, or undefined for the top. */
  const landingIndex =
    rows && scrollToAyah && scrollToAyah > 1 && scrollToAyah <= rows.length
      ? scrollToAyah - 1
      : undefined;
  /** The ayah asked for has been seen. */
  const landed = useRef(landingIndex == null);
  /** Same value, for the callbacks that are built once. */
  const landingIndexRef = useRef<number | undefined>(landingIndex);
  landingIndexRef.current = landingIndex;
  /**
   * The reader has taken the list. Set by a drag, or by any scroll once
   * the landing's settle window has closed — a wheel on a Mac begins no
   * drag. From here on the rows the reader passes are theirs to record.
   */
  const readerScrolled = useRef(false);
  /**
   * How long a scroll still counts as the landing rather than as reading.
   *
   * Two things move the list on their own: the single automatic scroll
   * VirtualizedList performs once its content has laid out, and the
   * translations arriving and growing the rows. Neither is somebody
   * reading. Short, because there is no longer a walk to wait out — it
   * used to be four seconds, which is how long the walk took.
   */
  const landingUntil = useRef(0);
  const LANDING_SETTLE_MS = 1500;
  const MOUNT_SETTLE_MS = 600;

  /**
   * How many rows above the landing have been prepended so far, and how
   * many to add each time the reader reaches the top of the window.
   *
   * Zero at a landing: the window begins AT the ayah, so it is on screen
   * in the list's first batch without anything being scrolled. A surah
   * opened normally has no landing and no window — `windowStart` is 0 and
   * this is the whole surah, exactly as before.
   */
  const [leadRows, setLeadRows] = useState(0);
  const LEAD_CHUNK = 40;
  const windowStart =
    landingIndex == null ? 0 : Math.max(0, landingIndex - leadRows);
  const windowed = useMemo(
    () => (rows == null ? null : windowStart > 0 ? rows.slice(windowStart) : rows),
    [rows, windowStart],
  );
  const readEarlier = useCallback(() => {
    if (windowStart > 0) setLeadRows(n => n + LEAD_CHUNK);
  }, [windowStart]);

  useEffect(() => {
    readerScrolled.current = false;
    landed.current = landingIndex == null;
    setLeadRows(0);
    landingUntil.current =
      Date.now() + (landingIndex == null ? MOUNT_SETTLE_MS : LANDING_SETTLE_MS);
  }, [rows, landingIndex]);
  const takeOver = useCallback(() => {
    readerScrolled.current = true;
    // Wherever the landing put them, the reader has taken over.
    landed.current = true;
  }, []);
  const onScroll = useCallback(() => {
    if (readerScrolled.current) return;
    if (Date.now() > landingUntil.current) takeOver();
  }, [takeOver]);

  // ── Last-read for translation mode (QR-10) ──────────────────────────
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(
    (info: { viewableItems: Array<{ item: unknown; isViewable: boolean }> }) => {
      const visible = info.viewableItems.filter(v => v.isViewable);
      const first = visible[0];
      if (!first) return;
      if (!landed.current) {
        // Still on the way to the ayah asked for: this is the list passing
        // rows on the way there, not the reader reading them.
        const target = landingIndexRef.current;
        if (
          target != null &&
          visible.some(v => (v.item as AyahRow)?.ayah === target + 1)
        ) {
          landed.current = true;
        }
        return;
      }
      // Rows becoming visible without the reader's hand on the list — the
      // mount, the landing, the rows settling — are not reading.
      if (!readerScrolled.current) return;
      const row = first.item as AyahRow;
      if (typeof row?.ayah !== 'number') return;
      recordReading({
        surah: surahNumberRef.current,
        ayah: row.ayah,
        page: findPageForAyah(surahNumberRef.current, row.ayah),
        mode: 'withTranslation',
      });
    },
  );
  const surahNumberRef = useRef(surahNumber);
  surahNumberRef.current = surahNumber;

  // ── Auto-scroll to the playing ayah ─────────────────────────────────
  const lastAutoScrolled = useRef<number>(0);
  useEffect(() => {
    if (!playback.active || !playback.playing) return;
    if (playback.active.surah !== surahNumber) return;
    const idx = playback.active.ayah - 1;
    if (idx === lastAutoScrolled.current) return;
    // The list may hold a WINDOW of the surah rather than all of it (see
    // the landing), so its indices are offset. An ayah above the window
    // is not in the list at all — reciting from before where the reader
    // came in pulls the earlier rows in first, and the next ayah scrolls.
    const row = idx - windowStart;
    if (row < 0) {
      readEarlier();
      return;
    }
    lastAutoScrolled.current = idx;
    listRef.current?.scrollToIndex({
      index: row,
      viewPosition: 0.3,
      animated: true,
    });
  }, [playback.active, playback.playing, surahNumber, windowStart, readEarlier]);

  // ── Translation mode ────────────────────────────────────────────────
  const hideMode = quran.prefs.hideMode;
  // App-wide companion mode (v2.7.40): translation ⇄ tafsir under each ayah.
  const companionMode = quran.prefs.companionMode;
  const tafsirEdition = resolveTafsirEdition(
    quran.prefs.tafsirEditionId,
    settings.language,
  );

  // The two trails' markers, drawn beside the ayah number the way a
  // bookmark's bar is (#41): the reading marker when the reader pinned it,
  // the khatmah's when the plan is pinned here. Both, when both — they are
  // different promises and can share an ayah.
  const readingMark = drawnReadingPosition(quran);
  const khatmahMark = activeKhatmah(quran)?.position ?? null;

  const renderAyah = ({ item }: { item: AyahRow }) => {
    const { ayah, arabic } = item;
    const starred = isStarred(quran, surahNumber, ayah);
    const bookmark = findBookmark(quran, surahNumber, ayah);
    const readingHere =
      readingMark?.surah === surahNumber && readingMark.ayah === ayah;
    const khatmahHere =
      khatmahMark?.surah === surahNumber && khatmahMark.ayah === ayah;
    const isPlayingThis =
      playback.active?.surah === surahNumber &&
      playback.active?.ayah === ayah &&
      playback.playing;
    const wordIdx =
      activeWord &&
      activeWord.surah === surahNumber &&
      activeWord.ayah === ayah
        ? activeWord.wordIndex
        : -1;
    const translation = translations?.[ayah - 1] ?? '';
    const isRevealed = revealed.has(ayah);
    const maskArabic = hideMode === 'arabic' && !isRevealed;
    const maskTranslation = hideMode === 'translation' && !isRevealed;

    const words = arabic.split(' ');
    // The timing counts QPC's words; the text is Tanzil's. Map one onto
    // the other, or the lit word drifts by one past every pause mark and
    // the basmalah lights on every first ayah — see `countedWords.ts`.
    const litIndex =
      wordIdx >= 0
        ? (countedWordIndices(surahNumber, ayah, words)[wordIdx] ?? -1)
        : -1;

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('quran.ayahA11y', {
          defaultValue: 'Ayah {{ayah}} — tap for actions',
          ayah,
        })}
        onPress={() => {
          if (hideMode !== 'none' && !isRevealed) {
            setRevealed(prev => new Set(prev).add(ayah));
            return;
          }
          setSelectedAyah(ayah);
          setSheetScrollAudio(false);
          setSheetVisible(true);
        }}
        style={[
          styles.ayahCard,
          {
            backgroundColor: isPlayingThis ? palette.accentBg : palette.card,
            ...cardEdgeStyle(palette),
          },
        ]}>
        <View style={styles.ayahMetaRow}>
          {bookmark ? (
            <View
              style={[
                styles.bookmarkBar,
                { backgroundColor: BOOKMARK_COLORS[bookmark.color] },
              ]}
            />
          ) : null}
          {khatmahHere ? (
            <View style={[styles.markerPill, { borderColor: KHATMAH_COLOR }]}>
              <View style={[styles.markerDot, { backgroundColor: KHATMAH_COLOR }]} />
              <Text style={[styles.markerLabel, { color: KHATMAH_COLOR }]}>
                {t('quran.khatmahMarkerLabel', 'Khatmah')}
              </Text>
            </View>
          ) : null}
          {readingHere ? (
            <View style={[styles.markerPill, { borderColor: READING_COLOR }]}>
              <View style={[styles.markerDot, { backgroundColor: READING_COLOR }]} />
              <Text style={[styles.markerLabel, { color: READING_COLOR }]}>
                {t('quran.readingMarkerLabel', 'Reading')}
              </Text>
            </View>
          ) : null}
          {starred ? (
            <Text style={{ color: palette.accentSolid, fontSize: TYPE.footnote.fontSize }}>★</Text>
          ) : null}
          <Text style={[styles.ayahNumber, { color: palette.accent }]}>
            {ayah}
          </Text>
        </View>
        {maskArabic ? (
          <Text style={[styles.masked, { color: palette.muted }]}>
            {t('quran.tapToReveal', 'Tap to reveal')}
          </Text>
        ) : (
          <Text
            style={[styles.ayahArabic, { color: palette.text }]}
            accessibilityLabel={arabic}>
            {litIndex >= 0
              ? words.map((w, i) => (
                  <Text
                    key={i}
                    style={
                      i === litIndex
                        ? {
                            color: palette.accentSolid,
                            backgroundColor: palette.accentBg,
                          }
                        : undefined
                    }>
                    {w}
                    {i < words.length - 1 ? ' ' : ''}
                  </Text>
                ))
              : arabic}
          </Text>
        )}
        {companionMode === 'tafsir' ? (
          maskTranslation ? (
            <Text style={[styles.masked, { color: palette.muted }]}>
              {t('quran.tapToReveal', 'Tap to reveal')}
            </Text>
          ) : (
            <TafsirRowText
              surah={surahNumber}
              ayah={ayah}
              editionId={tafsirEdition.id}
              rtl={tafsirEdition.rtl}
            />
          )
        ) : translations == null ? (
          <View
            style={[styles.skeleton, { backgroundColor: palette.accentBg }]}
          />
        ) : maskTranslation && translation ? (
          <Text style={[styles.masked, { color: palette.muted }]}>
            {t('quran.tapToReveal', 'Tap to reveal')}
          </Text>
        ) : translation ? (
          <Text
            style={[
              styles.ayahTranslation,
              readingText.style(READING_BASE),
              { color: palette.muted },
            ]}>
            {translation}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const header = (
    <View
      style={[
        styles.header,
        { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
      ]}>
      <Text style={[styles.surahArabic, { color: palette.text }]}>
        {surah.arabic}
      </Text>
      {!isArabic ? (
        <Text style={[styles.surahRomanized, { color: palette.text }]}>
          {surah.romanized}
        </Text>
      ) : null}
      <Text style={[styles.surahMeta, { color: palette.muted }]}>
        {isArabic ? '' : `${surah.english} · `}
        {t('quran.ayahCount', { count: surah.ayahCount })}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('quran.companionTitle', 'Under each verse')}
        onPress={() => setEditionPickerVisible(true)}
        style={styles.editionRow}>
        <Text style={[styles.editionLabel, { color: palette.muted }]}>
          {/* Mode + edition, e.g. "Tafsir: Ibn Kathir (abridged)" — the
              app-wide companion choice (v2.7.40). */}
          {`${
            companionChoice.mode === 'tafsir'
              ? t('quran.tafsir', 'Tafsir')
              : t('quran.viewToggleTranslation', 'Translation')
          }: ${companionChoice.editionLabel}`}
        </Text>
        <Text style={[styles.editionHint, { color: palette.accent }]}>
          {t('quran.tapToPick', 'choose')}
        </Text>
      </Pressable>
      {hideMode !== 'none' ? (
        <Text style={[styles.hideHint, { color: palette.accentSolid }]}>
          {t('quran.hideModeActive', {
            defaultValue: 'Memorization mode: {{what}} hidden — tap an ayah to reveal',
            what:
              hideMode === 'arabic'
                ? t('quran.hideArabic', 'Arabic')
                : t('quran.hideTranslation', 'Translation'),
          })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* The download strip — the ayah sheet below starts the per-surah
          tilāwah download and then closes, so this is where it can be
          watched from. iOS floats its header over the content, so the
          strip clears it; Android's is opaque and in flow. */}
      {download.running ? (
        <QuranDownloadStripView
          run={download}
          top={Platform.OS === 'ios' ? headerHeight : 0}
        />
      ) : null}
      {rows == null ? (
        // The list is NOT mounted yet, and that is the fix rather than an
        // oversight: `initialScrollIndex` is read at mount and never
        // again, so a list mounted against an empty array can only ever
        // open at the top. The header and the same card the empty state
        // used, so nothing about this moment looks different.
        <View style={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          {header}
          <View
            style={[
              styles.comingSoon,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <Text style={[styles.comingSoonText, { color: palette.muted }]}>
              {t('quran.loading', 'Loading…')}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={windowed ?? rows}
          keyExtractor={r => String(r.ayah)}
          renderItem={renderAyah}
          // Only once the window reaches the top of the surah. Drawn above
          // ayah 250 it would be a lie about where the reader is.
          ListHeaderComponent={windowStart === 0 ? header : null}
          // Reading backwards: the rows above arrive a chunk at a time and
          // this is what stops them shoving the page down as they land.
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          onStartReached={readEarlier}
          onStartReachedThreshold={0.6}
          ListEmptyComponent={
            <View
              style={[
                styles.comingSoon,
                { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
              ]}>
              <Text style={[styles.comingSoonText, { color: palette.muted }]}>
                {t('quran.comingSoon')}
              </Text>
            </View>
          }
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 24 },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={9}
          onScrollToIndexFailed={info => {
            // Only recitation's auto-scroll can reach here — the landing
            // does not scroll at all any more. Without `getItemLayout`,
            // `scrollToIndex` refuses any index above the highest cell it
            // has measured, so go as far as the list HAS measured and
            // leave it: a listener whose ayah is off past unmeasured rows
            // is better served by the list catching up on the next ayah
            // than by a retry loop chasing this one. The loop that used
            // to live here is what made opening a surah cost three
            // seconds of walking.
            const reach = Math.max(
              0,
              Math.min(info.index, info.highestMeasuredFrameIndex),
            );
            listRef.current?.scrollToIndex({ index: reach, animated: false });
          }}
          viewabilityConfig={viewabilityConfig.current}
          onViewableItemsChanged={onViewableItemsChanged.current}
          onScrollBeginDrag={takeOver}
          onScroll={onScroll}
          scrollEventThrottle={200}
        />
      )}
      <MiniPlayer />

      {selectedAyah != null ? (
        <AyahActionSheet
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          surah={surahNumber}
          ayah={selectedAyah}
          page={findPageForAyah(surahNumber, selectedAyah)}
          scrollToAudio={sheetScrollAudio}
        />
      ) : null}

      {/* App-wide companion-text picker (v2.7.40, replaces the
          translation-only picker from task #124): mode + edition, shared
          with the Quran index page and Settings. */}
      <CompanionTextSheet
        visible={editionPickerVisible}
        onClose={() => setEditionPickerVisible(false)}
      />
    </View>
  );
}

/**
 * Per-row tafsir text (v2.7.40) — lazy: fetched (or read from the offline
 * cache) when the row mounts, so long surahs only load what scrolls into
 * view. Long tafsir collapses to a few lines with a Show-more expand.
 */
function TafsirRowText({
  surah,
  ayah,
  editionId,
  rtl,
}: {
  surah: number;
  ayah: number;
  editionId: string;
  rtl: boolean;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const readingText = useReadingText();
  // undefined = loading, null = unavailable (offline + uncached).
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setText(undefined);
    setExpanded(false);
    void loadTafsir(editionId, surah, ayah).then(loaded => {
      if (!cancelled) setText(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [editionId, surah, ayah]);

  if (text === undefined) {
    return (
      <View style={[styles.skeleton, { backgroundColor: palette.accentBg }]} />
    );
  }
  if (text === null) {
    return (
      <Text
        style={[
          styles.ayahTranslation,
          readingText.style(READING_BASE),
          { color: palette.muted },
        ]}>
        {t(
          'quran.tafsirUnavailable',
          'Tafsir unavailable — connect to the internet once to download it.',
        )}
      </Text>
    );
  }
  const long = text.length > 420;
  return (
    <>
      <Text
        numberOfLines={expanded ? undefined : 6}
        style={[
          styles.ayahTranslation,
          readingText.style(READING_BASE),
          { color: palette.muted },
          rtl && { writingDirection: 'rtl', textAlign: 'right' },
        ]}>
        {text}
      </Text>
      {long ? (
        // Own Pressable — claims the touch so the row's action-sheet press
        // doesn't also fire when expanding the tafsir.
        <Pressable
          hitSlop={6}
          accessibilityRole="button"
          onPress={() => setExpanded(v => !v)}>
          <Text
            style={{
              color: palette.accentSolid,
              fontSize: TYPE.label.fontSize,
              fontWeight: '700',
              marginTop: SPACING.xs,
            }}>
            {expanded
              ? t('quran.showLess', 'Show less')
              : t('quran.showMore', 'Show more')}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}


/**
 * The header's leading slot: the back arrow and the size control, as one
 * row. Its own sheet rather than a line in `styles` below, because this
 * is header chrome handed to the navigator — it is not laid out with the
 * list, and it is built inside a `setOptions` effect that must not reach
 * for anything that re-renders.
 */
const headerSide = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  padStart: { paddingStart: SPACING.sm },
});

const styles = StyleSheet.create({
  scroll: { padding: SPACING.lg, gap: SPACING.md },
  header: {
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  surahArabic: { fontSize: 32, lineHeight: 62, ...arabicTextStyle('body') }, // tokens-ok-line: display or Arabic scale, sized by hand
  surahRomanized: { fontSize: TYPE.title3.fontSize, fontWeight: '700' },
  surahMeta: { fontSize: TYPE.label.fontSize },
  editionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Wraps rather than squeezes. "Tafsir: التفسير الميسر" next to the
    // CHOOSE hint overruns a narrow header, and a row that cannot wrap
    // fits itself by shrinking its children — which truncated the
    // edition's name away and left the bare word "Tafsir". Same fault
    // as the chips in AyahActionSheet, same fix.
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingTop: SPACING.xs,
  },
  editionLabel: { fontSize: TYPE.label.fontSize, flexShrink: 0 },
  editionHint: {
    fontSize: TYPE.label.fontSize,
    flexShrink: 0,
    fontWeight: '600',
  },
  hideHint: { fontSize: TYPE.label.fontSize, fontWeight: '600', textAlign: 'center', marginTop: SPACING.sm },
  ayahCard: { padding: SPACING.lg, borderRadius: RADIUS.md, gap: SPACING.md, marginTop: SPACING.md },
  ayahMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  bookmarkBar: { width: 18, height: 5, borderRadius: RADIUS.xs },
  markerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  markerDot: { width: 6, height: 6, borderRadius: RADIUS.full },
  markerLabel: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  ayahNumber: { fontSize: TYPE.footnote.fontSize, fontWeight: '700', fontVariant: ['tabular-nums'] },
  ayahArabic: {
    fontSize: TYPE.title2.fontSize,
    // Amiri Quran carries tall stacked diacritics — ~2.2× line height
    // keeps fatha/kasra clusters unclipped (see arabicTextStyle docs).
    lineHeight: 54,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  ayahTranslation: { fontSize: TYPE.callout.fontSize, lineHeight: 22 },
  masked: {
    fontSize: TYPE.callout.fontSize,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  skeleton: { height: 14, borderRadius: RADIUS.sm, opacity: 0.5, marginTop: SPACING.xs },
  comingSoon: { padding: SPACING.xl, borderRadius: RADIUS.md, alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  comingSoonText: { fontSize: TYPE.callout.fontSize, textAlign: 'center', fontWeight: '600' },
});


