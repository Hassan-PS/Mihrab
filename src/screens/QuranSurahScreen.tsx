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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
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
import {
  getSurahTranslation,
  QURAN_TRANSLATIONS,
} from '../quran/translations';
import { useActiveEdition } from '../quran/useActiveEdition';
import { MushafReader } from '../quran/MushafReader';
import { findPageForAyah } from '../quran/pages';
import {
  findBookmark,
  hydrateQuranState,
  isStarred,
  setLastRead,
  useQuranState,
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
  const playback = usePlaybackStatus();
  // Header closures read playback via a ref so the nav header doesn't
  // rebuild on every ayah change.
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const activeWord = useActiveWordIndex();
  const edition = useActiveEdition();

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
    updateSettings({
      quranReadingMode: isMushaf ? 'withTranslation' : 'mushaf',
    });
  }, [isMushaf, updateSettings]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!surah) return;
    if (isFullscreen) {
      navigation.setOptions({ headerShown: false, orientation: 'all' });
      return;
    }
    navigation.setOptions({
      headerShown: true,
      orientation: 'portrait',
      title: surah.romanized,
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
  }, [navigation, surah, isMushaf, isFullscreen, palette.accentSolid, t, toggleMushaf]);

  useEffect(() => {
    return () => {
      navigation.setOptions({ headerShown: true, orientation: 'portrait' });
    };
  }, [navigation]);

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
        onToggleFullscreen={() => setIsFullscreen(f => !f)}
        audioSheetSignal={audioSheetSignal}
        onTitleChange={title => navigation.setOptions({ title })}
      />
    );
  }

  // ── Translation mode ────────────────────────────────────────────────
  const hideMode = quran.prefs.hideMode;

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
        {translations == null ? (
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
        accessibilityLabel={t('quran.translationEdition', 'Translation: {{label}}', {
          label:
            QURAN_TRANSLATIONS.find(e => e.id === edition)?.label ?? edition,
        })}
        onPress={() => setEditionPickerVisible(true)}
        style={styles.editionRow}>
        <Text style={[styles.editionLabel, { color: palette.muted }]}>
          {t('quran.translationEdition', 'Translation: {{label}}', {
            label:
              QURAN_TRANSLATIONS.find(e => e.id === edition)?.label ?? edition,
          })}
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

      {/* Translation-edition picker (task #124) */}
      <Modal
        visible={editionPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditionPickerVisible(false)}>
        <Pressable
          style={[pickerStyles.backdrop, { backgroundColor: palette.overlay }]}
          accessibilityLabel={t('common.close', 'Close')}
          onPress={() => setEditionPickerVisible(false)}
        />
        <View style={[pickerStyles.sheet, { backgroundColor: palette.card }]}>
          <Text style={[pickerStyles.title, { color: palette.text }]}>
            {t('quran.pickTranslation', 'Choose translation')}
          </Text>
          <ScrollView style={pickerStyles.list}>
            {QURAN_TRANSLATIONS.map(ed => {
              const selected = ed.id === edition;
              return (
                <Pressable
                  key={ed.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    updateSettings({ quranTranslationEdition: ed.id });
                    setEditionPickerVisible(false);
                  }}
                  style={[
                    pickerStyles.row,
                    {
                      backgroundColor: selected
                        ? palette.accentBg
                        : 'transparent',
                    },
                  ]}>
                  <View style={pickerStyles.rowText}>
                    <Text style={[pickerStyles.rowLabel, { color: palette.text }]}>
                      {ed.label}
                    </Text>
                    <Text style={[pickerStyles.rowSub, { color: palette.muted }]}>
                      {ed.language}
                    </Text>
                  </View>
                  {selected ? (
                    <Text style={[pickerStyles.check, { color: palette.accent }]}>
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '80%',
    borderTopStartRadius: 18,
    borderTopEndRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  list: { maxHeight: 480 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 12,
    marginVertical: 2,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  check: { fontSize: 18, fontWeight: '700' },
});

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
