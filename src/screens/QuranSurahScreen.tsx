/**
 * Surah reading screen — Quran Reader v2
 * (docs/quran-reader-plan.md, QR-1/2/8/17/20).
 *
 * Two reading modes (gated by `settings.quranReadingMode`):
 *   • `withTranslation` — VIRTUALIZED ayah-by-ayah list (QR-1: Al-Baqarah
 *     no longer mounts 286 cards at once). Arabic renders word-by-word so
 *     recitation can highlight the live word (QR-17); memorization
 *     hide/reveal masks Arabic or translation per ayah (QR-20).
 *   • `mushaf` — the interactive page reader (MushafReader).
 *
 * Translation text loads asynchronously after first paint (QR-2) — the
 * 1–2 MB edition JSON no longer blocks the navigation transition.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { findSurah, loadSurah } from '../quran/quran';
import { getSurahTranslation } from '../quran/translations';
import { useActiveEdition } from '../quran/useActiveEdition';
import { loadTafsir, resolveTafsirEdition } from '../quran/tafsir';
import {
  CompanionTextSheet,
  useCompanionChoice,
} from '../quran/CompanionTextControls';
import { MushafReader } from '../quran/MushafReader';
import { useOverlayDismissGuard } from '../quran/mushafReaderCore';
import { findPageForAyah } from '../quran/pages';
import {
  findBookmark,
  hydrateQuranState,
  isStarred,
  setLastRead,
  useQuranState,
  useQuranHydrated,
  BOOKMARK_COLORS,
} from '../quran/quranState';
import { usePlaybackStatus } from '../quran/audio/playback';
import { useActiveWordIndex } from '../quran/audio/useWordTiming';
import { AyahActionSheet } from '../quran/mushaf/AyahActionSheet';
import { MiniPlayer } from '../quran/audio/MiniPlayer';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import type { RootStackParamList } from '../navigation/types';
import { cardEdgeStyle } from '../theme/chrome';
import { arabicTextStyle } from '../theme/typography';

const isIOS = Platform.OS === 'ios';

type AyahRow = {
  ayah: number; // 1-based
  arabic: string;
};

export function QuranSurahScreen() {
  useBreakpoint();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = usePrayerSettings();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'QuranSurah'>>();
  const { surahNumber, initialPage, scrollToAyah } = route.params;
  useAndroidSubScreenBack();

  const surah = findSurah(surahNumber);
  const quran = useQuranState();
  const quranHydrated = useQuranHydrated();
  const playback = usePlaybackStatus();
  // Header closures read playback via a ref so the nav header doesn't
  // rebuild on every ayah change.
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const activeWord = useActiveWordIndex();
  const edition = useActiveEdition();
  // Current companion choice caption (mode + edition) for the header row.
  const companionChoice = useCompanionChoice();

  useEffect(() => {
    void hydrateQuranState();
  }, []);

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
    // Defer the (potentially first-time) 1–2 MB edition require until
    // after the transition/paint.
    const timer = setTimeout(() => {
      if (cancelled) return;
      setTranslations(getSurahTranslation(edition, surahNumber));
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
  // Mushaf mode: incrementing signal → MushafReader opens the unified
  // sheet scrolled to the recitation section.
  const [audioSheetSignal, setAudioSheetSignal] = useState(0);
  const [editionPickerVisible, setEditionPickerVisible] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Reset per-surah reveal state when hide mode or surah changes.
    setRevealed(new Set());
  }, [quran.prefs.hideMode, surahNumber]);

  // ── Mode toggle + header controls ───────────────────────────────────
  const isMushaf = settings.quranReadingMode === 'mushaf';
  const toggleMushaf = useCallback(() => {
    // The toggle swaps the ENTIRE subtree (mushaf reader ⇄ translation
    // list), which would take any open <Modal> down with it while it is
    // still presented — an orphaned activity-window dialog that eats every
    // touch app-wide. Close the sheets first, then switch.
    setSheetVisible(false);
    setEditionPickerVisible(false);
    updateSettings({
      quranReadingMode: isMushaf ? 'withTranslation' : 'mushaf',
    });
  }, [isMushaf, updateSettings]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  /**
   * Stable. This one function reaches every mushaf page — a tap anywhere on
   * the page toggles fullscreen — so when it was an inline arrow it changed
   * identity on every render of this screen, and with it the callback each
   * page hands to each of its fifteen lines. That is what defeated the memo
   * the whole way down: a page laid itself out again for a screen re-render
   * that had nothing to do with it.
   */
  const toggleFullscreen = useCallback(() => setIsFullscreen(f => !f), []);

  /**
   * Header title for mushaf mode — the surah the visible PAGE starts with,
   * which drifts away from the route's surah as the reader is paged.
   *
   * Held as state (rather than the reader calling `navigation.setOptions`
   * directly) so this screen stays the single writer of the title. With
   * two writers the header effect below — which re-runs on fullscreen
   * toggles, palette and night-mode changes — kept clobbering the reader's
   * value with the route's static `surah.romanized`.
   */
  const [readerTitle, setReaderTitle] = useState<string | null>(null);
  const handleReaderTitleChange = useCallback((title: string) => {
    setReaderTitle(title);
  }, []);
  // A different surah means the reader's page title no longer applies.
  useEffect(() => {
    setReaderTitle(null);
  }, [surahNumber]);

  useEffect(() => {
    if (!surah) return;
    /**
     * Screen container inset (v2.8.2). The navigator pads every screen's
     * content by the bottom safe area in the THEME background colour
     * (RootNavigator `contentStyle`). Under the mushaf, whose page is white
     * (or near-black at night), that pad reads as a strip of app background
     * along the screen edge where the page should reach it. The reader
     * paints its own page colour edge to edge and applies the safe-area
     * insets — cutout included — itself, so here it just gets the window.
     *
     * Only the FONT-rendered readers do that. The legacy image reader has no
     * inset handling of its own, so it keeps the navigator's padding.
     */
    const ownsItsInsets =
      isMushaf && quran.prefs.mushafRenderer !== 'image';
    // Before the stored blob is read, `mushafNightMode` is its default of
    // false, so this would paint the screen pure white and then flip to
    // #101010 a moment later when the real preference arrives. Hold the app's
    // own background until we actually know — it is the colour already on
    // screen, so waiting shows as nothing at all, where guessing shows as a
    // full-window white flash on a large Mac Catalyst window.
    const contentStyle = ownsItsInsets
      ? {
          backgroundColor: !quranHydrated
            ? palette.bg
            : quran.prefs.mushafNightMode
              ? '#101010'
              : '#ffffff',
        }
      : { paddingBottom: insets.bottom, backgroundColor: palette.bg };
    /**
     * Header colours follow the PAGE, not the app theme.
     *
     * On iOS the header is transparent and blurred over whatever is beneath
     * it, and its title is painted in the theme's text colour. Mushaf night
     * mode is independent of the app theme, so a light theme reading a night
     * page put near-black title text over a near-black page — there, but only
     * if you already knew where to look. The mirror case (dark theme, light
     * page) is the same mistake the other way round.
     */
    const pageChrome =
      isIOS && ownsItsInsets && quranHydrated
        ? {
            headerBlurEffect: (quran.prefs.mushafNightMode
              ? 'dark'
              : 'light') as 'dark' | 'light',
            headerTintColor: quran.prefs.mushafNightMode ? '#f2f2f2' : '#1a1a1a',
            headerTitleStyle: {
              color: quran.prefs.mushafNightMode ? '#f2f2f2' : '#1a1a1a',
              writingDirection: isArabic ? 'rtl' : 'ltr',
              // writingDirection is a valid TextStyle prop, but react-navigation
              // types the title style as a narrower Pick<> that omits it.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            headerLargeTitleStyle: {
              color: quran.prefs.mushafNightMode ? '#f2f2f2' : '#1a1a1a',
              writingDirection: isArabic ? 'rtl' : 'ltr',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          }
        : null;
    if (isFullscreen) {
      navigation.setOptions({
        headerShown: false,
        orientation: 'all',
        contentStyle,
      });
      return;
    }
    navigation.setOptions({
      headerShown: true,
      orientation: 'portrait',
      contentStyle,
      ...(pageChrome ?? {}),
      // Mushaf mode: the reader's page-derived surah wins once it has
      // reported one. Translation mode always shows the route's surah.
      title: (isMushaf && readerTitle) || surah.romanized,
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.playbackSettings', 'Recitation')}
            onPress={() => {
              // Unified sheet (v2.7.28): open the ayah panel scrolled to
              // the recitation controls — everything lives in one place.
              if (isMushaf) {
                setAudioSheetSignal(s => s + 1);
              } else {
                const active = playbackRef.current.active;
                setSelectedAyah(
                  active?.surah === surahNumber ? active.ayah : 1,
                );
                setSheetScrollAudio(true);
                setSheetVisible(true);
              }
            }}
            hitSlop={10}
            style={{ paddingHorizontal: 4 }}>
            <Text
              style={{
                color: palette.accentSolid,
                fontSize: 15,
                fontWeight: '700',
              }}>
              {`♪ ${t('quran.audioButton', 'Audio')}`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isMushaf
                ? t('quran.switchToTranslation', 'Switch to translation view')
                : t('quran.switchToMushaf', 'Switch to mushaf view')
            }
            onPress={toggleMushaf}
            hitSlop={10}
            style={{ paddingHorizontal: 4 }}>
            <Text
              style={{
                color: palette.accentSolid,
                fontSize: 15,
                fontWeight: '700',
              }}>
              {isMushaf
                ? t('quran.viewToggleTranslation', 'Tafsir')
                : t('quran.viewToggleMushaf', 'Mushaf')}
            </Text>
          </Pressable>
          {isMushaf ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.enterFullscreen', 'Enter fullscreen')}
              onPress={() => setIsFullscreen(true)}
              hitSlop={10}
              style={{ paddingHorizontal: 4 }}>
              <Text
                style={{
                  color: palette.accentSolid,
                  fontSize: 18,
                  fontWeight: '700',
                }}>
                ⛶
              </Text>
            </Pressable>
          ) : null}
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    navigation,
    surah,
    isArabic,
    isMushaf,
    isFullscreen,
    readerTitle,
    palette.accentSolid,
    palette.bg,
    insets.bottom,
    quran.prefs.mushafNightMode,
    quran.prefs.mushafRenderer,
    quranHydrated,
    t,
    toggleMushaf,
  ]);

  useEffect(() => {
    return () => {
      navigation.setOptions({ headerShown: true, orientation: 'portrait' });
    };
  }, [navigation]);

  // Translation mode owns its own two <Modal>s (ayah sheet + companion-text
  // sheet). Same rule as the reader's: they must be dismissed before the
  // screen is popped, never with it — see `useOverlayDismissGuard`.
  const closeSheets = useCallback(() => {
    setSheetVisible(false);
    setEditionPickerVisible(false);
  }, []);
  useOverlayDismissGuard(
    !isMushaf && (sheetVisible || editionPickerVisible),
    closeSheets,
  );

  // ── Last-read for translation mode (QR-10) ──────────────────────────
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = useRef(
    (info: { viewableItems: Array<{ item: unknown; isViewable: boolean }> }) => {
      const first = info.viewableItems.find(v => v.isViewable);
      if (!first) return;
      const row = first.item as AyahRow;
      if (typeof row?.ayah !== 'number') return;
      setLastRead({
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
  const listRef = useRef<FlatList<AyahRow>>(null);
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

  if (!surah) {
    return (
      <View style={[styles.empty, { backgroundColor: palette.bg }]}>
        <Text style={{ color: palette.muted }}>{t('quran.notFound')}</Text>
      </View>
    );
  }

  if (isMushaf) {
    return (
      <MushafReader
        surahNumber={surahNumber}
        initialPage={initialPage}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        audioSheetSignal={audioSheetSignal}
        onTitleChange={handleReaderTitleChange}
      />
    );
  }

  // ── Translation mode ────────────────────────────────────────────────
  const hideMode = quran.prefs.hideMode;
  // App-wide companion mode (v2.7.40): translation ⇄ tafsir under each ayah.
  const companionMode = quran.prefs.companionMode;
  const tafsirEdition = resolveTafsirEdition(
    quran.prefs.tafsirEditionId,
    settings.language,
  );

  const renderAyah = ({ item }: { item: AyahRow }) => {
    const { ayah, arabic } = item;
    const starred = isStarred(quran, surahNumber, ayah);
    const bookmark = findBookmark(quran, surahNumber, ayah);
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
          {starred ? (
            <Text style={{ color: '#e0a52e', fontSize: 13 }}>★</Text>
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
            {wordIdx >= 0
              ? words.map((w, i) => (
                  <Text
                    key={i}
                    style={
                      i === wordIdx
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
        initialScrollIndex={
          scrollToAyah && rows && scrollToAyah <= rows.length
            ? scrollToAyah - 1
            : undefined
        }
        onScrollToIndexFailed={info => {
          // Dynamic row heights: retry after the list settles.
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: Math.min(info.index, info.highestMeasuredFrameIndex),
              animated: false,
            });
          }, 120);
        }}
        viewabilityConfig={viewabilityConfig.current}
        onViewableItemsChanged={onViewableItemsChanged.current}
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
              fontSize: 12,
              fontWeight: '700',
              marginTop: 4,
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 12 },
  header: {
    padding: 20,
    borderRadius: 14,
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  surahArabic: { fontSize: 32, lineHeight: 62, ...arabicTextStyle('body') },
  surahRomanized: { fontSize: 18, fontWeight: '700' },
  surahMeta: { fontSize: 12 },
  editionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  editionLabel: { fontSize: 12 },
  editionHint: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hideHint: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  ayahCard: { padding: 16, borderRadius: 12, gap: 10, marginTop: 12 },
  ayahMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  bookmarkBar: { width: 18, height: 5, borderRadius: 3 },
  ayahNumber: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  ayahArabic: {
    fontSize: 24,
    // Amiri Quran carries tall stacked diacritics — ~2.2× line height
    // keeps fatha/kasra clusters unclipped (see arabicTextStyle docs).
    lineHeight: 54,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  ayahTranslation: { fontSize: 15, lineHeight: 22 },
  masked: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  skeleton: { height: 14, borderRadius: 7, opacity: 0.5, marginTop: 4 },
  comingSoon: { padding: 24, borderRadius: 12, alignItems: 'center', gap: 8, marginTop: 12 },
  comingSoonText: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
});
