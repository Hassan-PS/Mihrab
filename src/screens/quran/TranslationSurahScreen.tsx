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
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { TilawahIcon } from '../../quran/audio/PlaybackIcons';
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
  const insets = useSafeAreaInsets();
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
            {/* Drawn, not typed. `♪` is the system font's glyph: its
                size, weight and vertical placement are the platform's,
                and the "gap" after it was a space character. It is the
                same note the player's own controls carry. */}
            <View style={audioMark.row}>
              <TilawahIcon color={String(palette.accentSolid)} size={desktopSize(15)} />
              <Text
                style={{
                  color: palette.accentSolid,
                  fontSize: desktopSize(15),
                  fontWeight: '700',
                }}>
                {t('quran.audioButton', 'Audio')}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.switchToMushaf', 'Switch to mushaf view')}
            onPress={toggleMushaf}
            hitSlop={10}
            style={{ paddingHorizontal: SPACING.xs }}>
            <Text
              style={{
                color: palette.accentSolid,
                fontSize: desktopSize(15),
                fontWeight: '700',
              }}>
              {t('quran.viewToggleMushaf', 'Mushaf')}
            </Text>
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

  // ── Landing on an ayah — issue #41 ───────────────────────────────────
  //
  // "Continue" opened the surah and left the reader at the top, for any
  // ayah past the first screen. Two faults, one symptom: the rows load
  // after the list has mounted, so `initialScrollIndex` — honoured at
  // mount only — was always undefined when it mattered; and the rows are
  // dynamic in height, so the one retry the failure handler made scrolled
  // as far as the list had measured (eight rows) and stopped there. And a
  // third, quieter one: the viewability handler fired for ayah 1 before
  // any scroll had happened and wrote it over the place being returned to.
  //
  // So the landing is driven from here once the rows exist, asked for
  // again each time the list says it has not measured that far, and the
  // marker is not written until the reader has actually arrived — or the
  // list has been asked as often as is reasonable and left where it got to.
  const listRef = useRef<FlatList<AyahRow>>(null);
  const landingIndex = useRef<number | null>(null);
  const landingTries = useRef(0);
  const landed = useRef(!scrollToAyah);
  // The reader has taken the list: from here on the landing is theirs to
  // move, and nothing below re-asserts it.
  const readerScrolled = useRef(false);
  /**
   * How long the landing keeps re-asserting itself as the rows settle.
   *
   * The translations arrive after the Arabic and make every row above the
   * landing taller — each one, as it is measured — which pushes the ayah
   * down the screen after it has been put at the top. So for a moment
   * after the landing begins, every change in the list's content size is
   * answered by landing again; after that, or the moment the reader
   * scrolls, the page is theirs.
   */
  const landingUntil = useRef(0);
  const LANDING_SETTLE_MS = 2500;
  const tryLand = useCallback(() => {
    const index = landingIndex.current;
    if (index == null || readerScrolled.current) return;
    listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.06 });
  }, []);
  useEffect(() => {
    landingTries.current = 0;
    readerScrolled.current = false;
    if (!rows) return undefined;
    if (!scrollToAyah || scrollToAyah <= 1 || scrollToAyah > rows.length) {
      landingIndex.current = null;
      landed.current = true;
      return undefined;
    }
    landed.current = false;
    landingIndex.current = scrollToAyah - 1;
    landingUntil.current = Date.now() + LANDING_SETTLE_MS;
    // After the first batch has mounted, never in the same frame.
    const id = setTimeout(tryLand, 0);
    return () => clearTimeout(id);
  }, [rows, scrollToAyah, tryLand]);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onContentSizeChange = useCallback(() => {
    if (landingIndex.current == null || readerScrolled.current) return;
    if (Date.now() > landingUntil.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(tryLand, 40);
  }, [tryLand]);
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

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
        const target = landingIndex.current;
        if (
          target != null &&
          visible.some(v => (v.item as AyahRow)?.ayah === target + 1)
        ) {
          landed.current = true;
        }
        return;
      }
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
    lastAutoScrolled.current = idx;
    listRef.current?.scrollToIndex({
      index: idx,
      viewPosition: 0.3,
      animated: true,
    });
  }, [playback.active, playback.playing, surahNumber]);

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
          <Text style={[styles.ayahTranslation, { color: palette.muted }]}>
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
      <FlatList
        ref={listRef}
        data={rows ?? []}
        keyExtractor={r => String(r.ayah)}
        renderItem={renderAyah}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View
            style={[
              styles.comingSoon,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <Text style={[styles.comingSoonText, { color: palette.muted }]}>
              {rows == null ? t('quran.loading', 'Loading…') : t('quran.comingSoon')}
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
          // Dynamic row heights: the list has not measured that far. Go as
          // far as it has, let it mount the next window, and ask again —
          // each round reaches further. A dozen rounds covers Al-Baqarah;
          // after that the reader is left where the list got to, and the
          // marker is theirs to move again.
          const reach = Math.min(info.index, info.highestMeasuredFrameIndex);
          listRef.current?.scrollToIndex({ index: reach, animated: false });
          landingTries.current += 1;
          if (landingTries.current < 14 && landingIndex.current != null) {
            setTimeout(tryLand, 50);
          } else {
            landed.current = true;
          }
        }}
        viewabilityConfig={viewabilityConfig.current}
        onViewableItemsChanged={onViewableItemsChanged.current}
        onContentSizeChange={onContentSizeChange}
        onScrollBeginDrag={() => {
          readerScrolled.current = true;
          // Whatever the landing had left to do, the reader has taken over.
          landed.current = true;
        }}
      />
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
      <Text style={[styles.ayahTranslation, { color: palette.muted }]}>
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


/** The mark and the word it labels, on one baseline. */
const audioMark = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
});
