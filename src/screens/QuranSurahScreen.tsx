import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { findSurah, loadSurah, type LoadedSurah } from '../quran/quran';
import {
  defaultEditionForLocale,
  getSurahTranslation,
  QURAN_TRANSLATIONS,
  type QuranTranslationId,
} from '../quran/translations';
import {
  easternNumerals,
  findPageForAyah,
  MUSHAF_PAGES,
  MUSHAF_SURAHS,
} from '../quran/pages';
import { mushafPageAsset, MUSHAF_TOTAL_PAGES } from '../quran/mushafImages';
import {
  downloadMushafAssets,
  isMushafDownloaded,
  type MushafDownloadHandle,
  type MushafDownloadProgress,
} from '../quran/mushafDownload';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import type { RootStackParamList } from '../navigation/types';
import { cardEdgeStyle } from '../theme/chrome';

/**
 * Surah reading screen — task #27, expanded under #96 + #97.
 *
 * Two reading modes (gated by `settings.quranReadingMode`):
 *   • `withTranslation` — ayah-by-ayah cards with Arabic + the user's
 *     selected translation edition + ayah number. Default.
 *   • `mushaf` — Arabic-only continuous reading view styled like a
 *     printed mushaf page. Larger Uthmani script, RTL flow with the
 *     traditional ۝ ayah-end markers, no translation.
 *
 * The active translation edition is `settings.quranTranslationEdition`,
 * falling back to `defaultEditionForLocale(language)` when empty.
 *
 * The header gets a translation-picker affordance + mode toggle so
 * switching is one tap away while reading.
 */
export function QuranSurahScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'QuranSurah'>>();
  const { surahNumber } = route.params;
  useAndroidSubScreenBack();

  const surah = findSurah(surahNumber);
  const [ayahs, setAyahs] = useState<{
    arabic: ReadonlyArray<string>;
  } | null>(null);

  // Resolve which translation edition to use. Empty string in settings
  // means "follow the active app language"; explicit string overrides.
  const activeEdition: QuranTranslationId = useMemo(() => {
    if (settings.quranTranslationEdition) {
      return settings.quranTranslationEdition as QuranTranslationId;
    }
    return defaultEditionForLocale(settings.language);
  }, [settings.quranTranslationEdition, settings.language]);

  // Pull the active edition's translation lazily (Metro caches the
  // require). Done in a useMemo so switching editions doesn't re-load
  // for the same one.
  const translationAyahs = useMemo(() => {
    return getSurahTranslation(activeEdition, surahNumber);
  }, [activeEdition, surahNumber]);

  useEffect(() => {
    let cancelled = false;
    void loadSurah(surahNumber).then((loaded: LoadedSurah | null) => {
      if (cancelled) return;
      if (!loaded) return;
      if (loaded.arabic.length === 0) {
        setAyahs(null);
        return;
      }
      setAyahs({ arabic: loaded.arabic });
    });
    return () => {
      cancelled = true;
    };
  }, [surahNumber]);

  const isMushaf = settings.quranReadingMode === 'mushaf';
  const toggleMushaf = () => {
    updateSettings({
      quranReadingMode: isMushaf ? 'withTranslation' : 'mushaf',
    });
  };

  // Fullscreen state — only reachable from mushaf mode (#123). Hides
  // the navigation header + status bar and unlocks orientation so the
  // user can rotate the phone for landscape reading.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = () => setIsFullscreen(s => !s);

  // Set the title + headerRight controls. In mushaf mode we render a
  // text "Translation" label (tap to flip to translation mode) and a
  // fullscreen icon next to it. In translation mode we render a
  // "Mushaf" text label. Header is hidden entirely in fullscreen.
  // — tasks #107, #123.
  useEffect(() => {
    if (!surah) return;
    if (isFullscreen) {
      navigation.setOptions({
        headerShown: false,
        // Allow the user to rotate while reading; reset to portrait
        // when fullscreen exits or the screen unmounts.
        orientation: 'all',
      });
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
                ? t('quran.viewToggleTranslation', 'Translation')
                : t('quran.viewToggleMushaf', 'Mushaf')}
            </Text>
          </Pressable>
          {isMushaf ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.enterFullscreen', 'Enter fullscreen')}
              onPress={toggleFullscreen}
              hitSlop={10}
              style={{ paddingHorizontal: 4 }}>
              <Text
                style={{
                  color: palette.accentSolid,
                  fontSize: 18,
                  fontWeight: '700',
                }}>
                {/* Box-with-arrow glyph for "expand to fullscreen". */}
                ⛶
              </Text>
            </Pressable>
          ) : null}
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, surah, isMushaf, isFullscreen, palette.accentSolid, t]);

  // When the screen unmounts or we leave mushaf mode, ensure header
  // and orientation are restored.
  useEffect(() => {
    return () => {
      navigation.setOptions({
        headerShown: true,
        orientation: 'portrait',
      });
    };
  }, [navigation]);
  // Translation-edition picker modal — task #124. The user opens it by
  // tapping the current-edition row in the surah header, then picks one
  // of the 14 bundled translations from the list.
  const [editionPickerVisible, setEditionPickerVisible] = useState(false);

  if (!surah) {
    return (
      <View style={[styles.empty, { backgroundColor: palette.bg }]}>
        <Text style={{ color: palette.muted }}>{t('quran.notFound')}</Text>
      </View>
    );
  }

  // Mushaf mode renders the page-by-page paginated view directly.
  // It pulls its own ayah text per page (since pages can span surahs)
  // so we don't need the per-surah `ayahs` state for this branch.
  if (isMushaf) {
    return (
      <MushafReader
        surahNumber={surahNumber}
        palette={palette}
        isFullscreen={isFullscreen}
        onExitFullscreen={() => setIsFullscreen(false)}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.scroll}
      contentInsetAdjustmentBehavior="automatic">
      <View
        style={[
          styles.header,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <Text style={[styles.surahArabic, { color: palette.text }]}>
          {surah.arabic}
        </Text>
        <Text style={[styles.surahRomanized, { color: palette.text }]}>
          {surah.romanized}
        </Text>
        <Text style={[styles.surahMeta, { color: palette.muted }]}>
          {surah.english} · {t('quran.ayahCount', { count: surah.ayahCount })}
        </Text>

        {/* Translation-edition picker (shown only in translation mode);
            mode toggle now lives in the navigation header (task #107). */}
        {!isMushaf ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.translationEdition', 'Translation: {{label}}', {
              label: QURAN_TRANSLATIONS.find(e => e.id === activeEdition)?.label ?? activeEdition,
            })}
            onPress={() => setEditionPickerVisible(true)}
            style={styles.editionRow}>
            <Text style={[styles.editionLabel, { color: palette.muted }]}>
              {t('quran.translationEdition', 'Translation: {{label}}', {
                label: QURAN_TRANSLATIONS.find(e => e.id === activeEdition)?.label ?? activeEdition,
              })}
            </Text>
            <Text style={[styles.editionHint, { color: palette.accent }]}>
              {t('quran.tapToPick', 'choose')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {ayahs ? (
        ayahs.arabic.map((ar, i) => (
            <View
              key={i}
              style={[
                styles.ayahCard,
                { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
              ]}>
              <View style={styles.ayahNumberRow}>
                <Text style={[styles.ayahNumber, { color: palette.accent }]}>
                  {i + 1}
                </Text>
              </View>
              <Text
                style={[styles.ayahArabic, { color: palette.text }]}
                accessibilityLabel={ar}>
                {ar}
              </Text>
              {translationAyahs[i] ? (
                <Text style={[styles.ayahTranslation, { color: palette.muted }]}>
                  {translationAyahs[i]}
                </Text>
              ) : null}
            </View>
          ))
      ) : (
        <View
          style={[
            styles.comingSoon,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[styles.comingSoonText, { color: palette.muted }]}>
            {t('quran.comingSoon')}
          </Text>
          <Text style={[styles.comingSoonHint, { color: palette.muted }]}>
            {t(
              'quran.importHint',
              'The full corpus arrives once the Tanzil source files are imported (see Settings → About → Attributions).',
            )}
          </Text>
        </View>
      )}

      {/* Translation-edition picker — task #124. Bottom sheet listing
          all 14 bundled editions; tap one to apply. */}
      <Modal
        visible={editionPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditionPickerVisible(false)}>
        <Pressable
          style={pickerStyles.backdrop}
          onPress={() => setEditionPickerVisible(false)}
        />
        <View
          style={[
            pickerStyles.sheet,
            { backgroundColor: palette.card },
          ]}>
          <Text style={[pickerStyles.title, { color: palette.text }]}>
            {t('quran.pickTranslation', 'Choose translation')}
          </Text>
          <ScrollView style={pickerStyles.list}>
            {QURAN_TRANSLATIONS.map(ed => {
              const selected = ed.id === activeEdition;
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
    </ScrollView>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '80%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
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

/**
 * Mushaf-style page-by-page reader — task #111.
 *
 * Models the standard 604-page Madinah mushaf:
 *   • Each item in the horizontal FlatList is one mushaf page.
 *   • Page header: surah name (left) + Juz/Part number (right),
 *     in the ornamental gold colour Madinah print uses.
 *   • Page body: the ayah range that lives on that page,
 *     justified RTL, with traditional ﴿N﴾ ornamental ayah-end
 *     markers in eastern numerals. Bismillah pre-rendered when the
 *     page begins a new surah other than al-Fatihah / at-Tawbah.
 *   • Page footer: page number inside an ornamental frame.
 *   • Swipe horizontally to flip pages. The reader opens at the
 *     page that contains the surah the user navigated from.
 *
 * Page→ayah mapping is from the bundled `pages.json` asset
 * (alquran.cloud /v1/meta, Tanzil-derived, CC BY 3.0).
 *
 * Bundling a true KFGQPC Madinah mushaf font (one font per page)
 * would yield pixel-perfect rendering at the cost of ~10 MB of
 * fonts, which is a follow-on. For now we render with the bundled
 * Amiri-Quran / Amiri-Regular at a large size on a parchment
 * surface — visually close to the Madinah look the user noted.
 */
function MushafReader({
  surahNumber,
  palette,
  isFullscreen,
  onExitFullscreen,
}: {
  surahNumber: number;
  palette: ReturnType<typeof useAppPalette>['palette'];
  isFullscreen: boolean;
  onExitFullscreen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const initialPage = useMemo(() => findPageForAyah(surahNumber, 1), [surahNumber]);
  const flatListRef = useRef<FlatList<typeof MUSHAF_PAGES[number]>>(null);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Use the default mushaf colours always — task #122. The page PNGs
  // carry the authentic dark ink + colored ayah markers; we render
  // them on a plain white surface (the mushaf's natural paper colour)
  // and apply no tint, so nothing alters the source pixels regardless
  // of whether the user is in app light or dark mode. Header / footer
  // chrome uses a dark gold-on-white tone matching the printed running
  // heads.
  const parchment = '#ffffff';
  const ornament = '#7a5e1f';

  // ── On-demand download state — task #130 ─────────────────────────
  // Track whether the user has completed the one-time mushaf download.
  // The 604 page PNGs live on a GitHub release, not the APK, so the
  // first time the user opens this view they get a download prompt.
  // After download, RN's Image cache serves every page locally.
  const [downloadStatus, setDownloadStatus] = useState<
    'checking' | 'needs_download' | 'downloading' | 'ready'
  >('checking');
  const [progress, setProgress] = useState<MushafDownloadProgress>({
    done: 0,
    total: MUSHAF_TOTAL_PAGES,
    failed: 0,
  });
  const downloadHandleRef = useRef<MushafDownloadHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isMushafDownloaded().then(yes => {
      if (cancelled) return;
      setDownloadStatus(yes ? 'ready' : 'needs_download');
    });
    return () => {
      cancelled = true;
      // Cancel any in-flight download if the user navigates away.
      downloadHandleRef.current?.cancel();
    };
  }, []);

  const startDownload = () => {
    if (downloadStatus === 'downloading') return;
    setDownloadStatus('downloading');
    setProgress({ done: 0, total: MUSHAF_TOTAL_PAGES, failed: 0 });
    const handle = downloadMushafAssets({
      concurrency: 8,
      onProgress: setProgress,
    });
    downloadHandleRef.current = handle;
    void handle.promise.then(completed => {
      downloadHandleRef.current = null;
      if (completed) setDownloadStatus('ready');
      else setDownloadStatus('needs_download');
    });
  };

  const screenWidth = Dimensions.get('window').width;

  // Update the navigation title to reflect the surah on the currently-
  // visible page when the user swipes to a new page (#115).
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item?: typeof MUSHAF_PAGES[number] }> }) => {
      const visible = viewableItems[0]?.item;
      if (!visible) return;
      const surah = MUSHAF_SURAHS.find(s => s.number === visible.start.surah);
      if (surah) {
        navigation.setOptions({ title: surah.englishName });
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  // ── Download-prompt screens — task #130 ──────────────────────────
  // Render dedicated states before the page reader: a quiet checking
  // spinner while we read AsyncStorage, a download prompt the first
  // time, and a progress bar while pages are streaming in.
  if (downloadStatus === 'checking') {
    return (
      <View style={[mushafGateStyles.gate, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.accentSolid} size="large" />
      </View>
    );
  }
  if (downloadStatus === 'needs_download') {
    return (
      <View style={[mushafGateStyles.gate, { backgroundColor: palette.bg }]}>
        <Text style={[mushafGateStyles.title, { color: palette.text }]}>
          {t('quran.mushafDownloadTitle', 'Download the mushaf')}
        </Text>
        <Text style={[mushafGateStyles.body, { color: palette.muted }]}>
          {t(
            'quran.mushafDownloadBody',
            'The Madinah mushaf is around 120 MB. It is not bundled in the app — download it once and the pages stay cached on your device.',
          )}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.mushafDownloadCta', 'Download mushaf (~120 MB)')}
          onPress={startDownload}
          style={[mushafGateStyles.cta, { backgroundColor: palette.accent }]}>
          <Text style={mushafGateStyles.ctaLabel}>
            {t('quran.mushafDownloadCta', 'Download mushaf (~120 MB)')}
          </Text>
        </Pressable>
      </View>
    );
  }
  if (downloadStatus === 'downloading') {
    const pct =
      progress.total > 0
        ? Math.round((progress.done / progress.total) * 100)
        : 0;
    return (
      <View style={[mushafGateStyles.gate, { backgroundColor: palette.bg }]}>
        <Text style={[mushafGateStyles.title, { color: palette.text }]}>
          {t('quran.mushafDownloading', 'Downloading mushaf…')}
        </Text>
        <Text style={[mushafGateStyles.progressLabel, { color: palette.muted }]}>
          {t('quran.mushafDownloadProgress', '{{done}} / {{total}} pages · {{pct}}%', {
            done: progress.done,
            total: progress.total,
            pct,
          })}
        </Text>
        <View
          style={[
            mushafGateStyles.progressTrack,
            { backgroundColor: palette.accentBg },
          ]}>
          <View
            style={[
              mushafGateStyles.progressFill,
              { backgroundColor: palette.accent, width: `${pct}%` },
            ]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel', 'Cancel')}
          onPress={() => {
            downloadHandleRef.current?.cancel();
          }}
          style={mushafGateStyles.cancelBtn}>
          <Text style={[mushafGateStyles.cancelLabel, { color: palette.accent }]}>
            {t('common.cancel', 'Cancel')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: parchment,
        // In fullscreen we hide the system status bar entirely below; this
        // top inset keeps the mushaf page content (Part X header) below
        // the camera notch / system bar on Android where the status bar
        // often stays visible even in immersive mode (#130).
        paddingTop: isFullscreen ? insets.top : 0,
        // Pin the container's direction to LTR — task #149. When the
        // in-app language is Arabic, RN's text-direction inheritance
        // somehow propagates to the horizontal FlatList and flips its
        // children layout, leaving every page off-viewport. The mushaf
        // pages are independent images and don't need RTL flow at the
        // carousel level — only the Arabic content INSIDE each page is
        // RTL, and that is baked into the PNG.
        writingDirection: 'ltr',
      }}>
    {/* Hide the status bar in fullscreen so nothing from the app appears
        next to the system battery / wifi icons. iOS auto-restores when
        the screen unmounts; Android needs the explicit `hidden` prop. */}
    <StatusBar hidden={isFullscreen} animated />
    <FlatList
      // Force remount on language change — task #149. Without this, the
      // FlatList carries scroll/layout state from the previous locale
      // and may render blank if the inherited writing direction shifted.
      key={i18n.language}
      ref={flatListRef}
      data={[...MUSHAF_PAGES]}
      keyExtractor={p => String(p.page)}
      horizontal
      pagingEnabled
      // We previously used `inverted={true}` to mirror the RTL "turn pages
      // from right to left" feel of a real mushaf. On iOS that combines
      // badly with `initialScrollIndex` — the FlatList mounts but doesn't
      // actually scroll to the requested index, so opening any surah
      // other than Al-Fatiha rendered a blank screen (the target page
      // existed but was off-viewport). Verified by user with screenshots
      // for Al-Baqara and Aal-i-Imraan — only the nav chrome was visible
      // (#147).
      //
      // Drop `inverted`, keep the pages in natural 1..604 order, and use
      // `initialScrollIndex` as it was always intended. Swipe direction is
      // now LTR (forward = swipe left), matching how most modern Quran
      // reader apps page through a mushaf even in Arabic UI. The page
      // images themselves still typeset their Arabic content RTL — this
      // change only affects the carousel's gesture direction.
      initialScrollIndex={initialPage - 1}
      getItemLayout={(_, idx) => ({
        length: screenWidth,
        offset: screenWidth * idx,
        index: idx,
      })}
      onScrollToIndexFailed={info => {
        // RN sometimes fires this when the target index hasn't laid out
        // yet (large initial offset like surah 50 at page 528). Retry on
        // the next frame — `getItemLayout` guarantees the offset is
        // computable.
        const offset = info.averageItemLength * info.index;
        flatListRef.current?.scrollToOffset({ offset, animated: false });
        setTimeout(
          () =>
            flatListRef.current?.scrollToIndex({
              index: info.index,
              animated: false,
            }),
          50,
        );
      }}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      showsHorizontalScrollIndicator={false}
      // Belt-and-suspenders LTR pin on the FlatList itself so the
      // horizontal layout direction is independent of whatever the
      // surrounding tree decides for the active locale (#149).
      style={{ flex: 1, backgroundColor: parchment, writingDirection: 'ltr' }}
      contentInsetAdjustmentBehavior="automatic"
      // Performance tuning — task #121:
      //   • windowSize=5 keeps the active page + ~2 on each side mounted
      //     so swipe is instant; pages farther away get unmounted to
      //     keep memory steady.
      //   • removeClippedSubviews lets RN/Android skip rendering pages
      //     that are off-screen.
      //   • initialNumToRender=1 — only the visible page is mounted on
      //     first render so opening the reader is fast.
      //   • maxToRenderPerBatch=2 — RN renders adjacent pages in tight
      //     batches as the user nears the edge of the window.
      windowSize={5}
      removeClippedSubviews
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      renderItem={({ item }) => (
        <MushafPage
          page={item}
          screenWidth={screenWidth}
          parchment={parchment}
          ornament={ornament}
          isFullscreen={isFullscreen}
        />
      )}
    />
    {/* Floating exit-fullscreen affordance — always visible while in
        fullscreen so the user can leave with one tap. Sits on the
        LEFT (opposite side of the right-aligned "Part X" running
        head) at the safe-area top. The previous tap-to-show overlay
        was eating horizontal swipe gestures and blocking the
        page-flipping carousel; removing it lets the parent FlatList
        own the swipe gesture cleanly so the user can flip pages
        like a book. (#134) */}
    {isFullscreen ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('quran.exitFullscreen', 'Exit fullscreen')}
        onPress={onExitFullscreen}
        hitSlop={16}
        style={{
          position: 'absolute',
          top: insets.top + 6,
          left: 12,
          backgroundColor: 'rgba(0,0,0,0.32)',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 18,
        }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
          ✕
        </Text>
      </Pressable>
    ) : null}
    </View>
  );
}

/**
 * One physical page of the mushaf — task #116, bundled locally in #121.
 *
 * Religious-accuracy invariant: rendering the Quran from text + font
 * leaves any number of ways the rendered output could subtly differ
 * from the authoritative print (diacritic substitutions, ligature
 * rendering bugs, font glyph variants). The page is therefore rendered
 * from an authoritative PNG of the official KFGQPC Madinah Mushaf,
 * bundled at full original quality (1014x1628 4-bit colormap PNGs from
 * archive.org's `madinah_mushaf` collection — community mirror of the
 * King Fahd print).
 *
 * All 604 pages are now bundled locally via `mushafPageAsset(page)` —
 * no network dependency, instant load, full quality preserved.
 *
 * Image base aspect ratio is 1014:1628 (the source resolution).
 */
const MUSHAF_IMAGE_ASPECT = 1014 / 1628;

function MushafPage({
  page,
  screenWidth,
  parchment,
  ornament,
  isFullscreen,
}: {
  page: typeof MUSHAF_PAGES[number];
  screenWidth: number;
  parchment: string;
  ornament: string;
  /**
   * Fullscreen drops the page chrome (Part-X header + page-number
   * footer) so the image gets the full vertical real estate, and
   * sizes the image to fit the entire viewport with no reserved
   * room. Page-flipping (horizontal swipe) is handled by the
   * parent FlatList's pagingEnabled — there is no inner scroll
   * here so nothing competes with it. (#134)
   */
  isFullscreen: boolean;
}) {
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  // Fit the largest rect that preserves the source aspect ratio.
  // In fullscreen we get the entire screen; otherwise we reserve
  // room for the header (Part X) and footer (page number) chrome.
  const headerFooterReserve = 80;
  const horizontalPadding = 16;
  const maxWidth = screenWidth - horizontalPadding * 2;
  const maxHeight = isFullscreen
    ? Dimensions.get('window').height
    : Dimensions.get('window').height - headerFooterReserve;
  let imageWidth = maxWidth;
  let imageHeight = imageWidth / MUSHAF_IMAGE_ASPECT;
  if (imageHeight > maxHeight) {
    imageHeight = maxHeight;
    imageWidth = imageHeight * MUSHAF_IMAGE_ASPECT;
  }

  const imageBlock = (
    <View style={mushafPageStyles.imageWrap}>
      <Image
        source={mushafPageAsset(page.page)}
        style={{ width: imageWidth, height: imageHeight }}
        resizeMode="contain"
        accessibilityLabel={`Mushaf page ${page.page}`}
        onLoad={() => setImageReady(true)}
        onError={() => setImageFailed(true)}
        fadeDuration={0}
      />
      {!imageReady && !imageFailed ? (
        <View style={mushafPageStyles.imageOverlay}>
          <ActivityIndicator color={ornament} />
        </View>
      ) : null}
      {imageFailed ? (
        <View style={mushafPageStyles.imageOverlay}>
          <Text style={[mushafPageStyles.errorText, { color: ornament }]}>
            Could not load mushaf page {page.page}.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        mushafPageStyles.page,
        { width: screenWidth, backgroundColor: parchment },
      ]}>
      {/* Header + footer hidden in fullscreen so the page image can
          take the entire viewport — like reading a printed mushaf
          flipped page-by-page. */}
      {isFullscreen ? null : (
        <View style={mushafPageStyles.header}>
          <Text style={[mushafPageStyles.headerText, { color: ornament }]}>
            {`Part ${easternNumerals(page.juz)}`}
          </Text>
        </View>
      )}

      {imageBlock}

      {isFullscreen ? null : (
        <View style={mushafPageStyles.footer}>
          <View
            style={[mushafPageStyles.pageNumberFrame, { borderColor: ornament }]}>
            <Text style={[mushafPageStyles.pageNumber, { color: ornament }]}>
              {easternNumerals(page.page)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const mushafGateStyles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  cta: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaLabel: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  progressLabel: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: '100%',
  },
  cancelBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});

const mushafPageStyles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 6,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '600',
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  footer: { alignItems: 'center', paddingTop: 8 },
  pageNumberFrame: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderRadius: 18,
    alignItems: 'center',
  },
  pageNumber: { fontSize: 13, fontWeight: '700' },
});

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 12 },
  header: {
    padding: 20,
    borderRadius: 14,
    alignItems: 'center',
    gap: 6,
  },
  surahArabic: { fontSize: 32, lineHeight: 48 },
  surahRomanized: { fontSize: 18, fontWeight: '700' },
  surahMeta: { fontSize: 12 },
  controlsRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  controlBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  controlLabel: { fontSize: 13, fontWeight: '600' },
  editionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  editionLabel: { fontSize: 12 },
  editionHint: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  ayahCard: { padding: 16, borderRadius: 12, gap: 10 },
  ayahNumberRow: { alignSelf: 'flex-end' },
  ayahNumber: { fontSize: 13, fontWeight: '700' },
  ayahArabic: {
    fontSize: 24,
    lineHeight: 44,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ayahTranslation: { fontSize: 15, lineHeight: 22 },
  mushafPage: {
    padding: 22,
    borderRadius: 14,
  },
  mushafText: {
    fontSize: 26,
    lineHeight: 56,
    writingDirection: 'rtl',
    textAlign: 'right',
    letterSpacing: 0,
  },
  comingSoon: { padding: 24, borderRadius: 12, alignItems: 'center', gap: 8 },
  comingSoonText: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
  comingSoonHint: { fontSize: 12, textAlign: 'center', lineHeight: 18, opacity: 0.85 },
});
