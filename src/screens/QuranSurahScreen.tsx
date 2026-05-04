import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

  // Set the title and a headerRight Mushaf/Translation toggle so the
  // mode switch lives opposite the title text in the navigation bar
  // — task #107.
  useEffect(() => {
    if (!surah) return;
    navigation.setOptions({
      title: surah.romanized,
      headerRight: () => (
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
              color: String(palette.accent),
              fontSize: 15,
              fontWeight: '700',
            }}>
            {isMushaf
              ? t('quran.viewToggleTranslation', 'Aa')
              : t('quran.viewToggleMushaf', '۝')}
          </Text>
        </Pressable>
      ),
    });
    // We intentionally re-run when the mode flips so headerRight is
    // rebuilt with the right label. The toggle handler is referentially
    // stable enough for our needs — the dep list captures the values
    // it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, surah, isMushaf, palette.accent, t]);
  const cycleEdition = () => {
    // Open the translation picker via a quick cycle: rotate to the next
    // bundled edition. A full Settings entry exists for granular choice;
    // this row is a fast tap-to-switch from inside the reader.
    const idx = QURAN_TRANSLATIONS.findIndex(e => e.id === activeEdition);
    const next = QURAN_TRANSLATIONS[(idx + 1) % QURAN_TRANSLATIONS.length];
    updateSettings({ quranTranslationEdition: next.id });
  };

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
    return <MushafReader surahNumber={surahNumber} palette={palette} />;
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
            onPress={cycleEdition}
            style={styles.editionRow}>
            <Text style={[styles.editionLabel, { color: palette.muted }]}>
              {t('quran.translationEdition', 'Translation: {{label}}', {
                label: QURAN_TRANSLATIONS.find(e => e.id === activeEdition)?.label ?? activeEdition,
              })}
            </Text>
            <Text style={[styles.editionHint, { color: palette.accent }]}>
              {t('quran.tapToCycle', 'tap to switch')}
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
    </ScrollView>
  );
}

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
}: {
  surahNumber: number;
  palette: ReturnType<typeof useAppPalette>['palette'];
}) {
  const initialPage = useMemo(() => findPageForAyah(surahNumber, 1), [surahNumber]);
  const flatListRef = useRef<FlatList<typeof MUSHAF_PAGES[number]>>(null);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // The KFGQPC mushaf PNGs have a transparent background and dark ink.
  // If we put them over a dark surface the ink merges in and the text
  // becomes unreadable (#117). Background is therefore:
  //   • Light mode: warm cream — the authentic paper colour, easy on
  //     the eyes.
  //   • Dark mode: pure black, with the image tinted to a warm white
  //     so the dark ink renders as light ink against the black page.
  const isDark = String(palette.text).toLowerCase() !== '#1a1a1a';
  const parchment = isDark ? '#000000' : '#fbf6e9';
  const ornament = isDark ? '#c9a96a' : '#8b6f2a';
  const inkTint = isDark ? '#f0e6c8' : undefined;

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

  return (
    <FlatList
      ref={flatListRef}
      data={[...MUSHAF_PAGES]}
      keyExtractor={p => String(p.page)}
      horizontal
      pagingEnabled
      // RTL layout: pages flow right-to-left like a real mushaf.
      // FlatList honors the RTL writingDirection when inverted.
      inverted
      initialScrollIndex={initialPage - 1}
      getItemLayout={(_, idx) => ({
        length: screenWidth,
        offset: screenWidth * idx,
        index: idx,
      })}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: parchment }}
      contentInsetAdjustmentBehavior="automatic"
      renderItem={({ item }) => (
        <MushafPage
          page={item}
          screenWidth={screenWidth}
          parchment={parchment}
          ornament={ornament}
          inkTint={inkTint}
        />
      )}
    />
  );
}

/**
 * One physical page of the mushaf — task #116.
 *
 * Religious-accuracy invariant: rendering the Quran from text + font
 * leaves any number of ways the rendered output could subtly differ
 * from the authoritative print (diacritic substitutions, ligature
 * rendering bugs, font glyph variants). To eliminate that risk this
 * page is rendered from an authoritative PNG of the official
 * KFGQPC Madinah Mushaf, hosted on archive.org's `madinah_mushaf`
 * collection (community mirror of the King Fahd print).
 *
 * The image is loaded over the network on first view and cached by
 * RN's native image loader; subsequent views are instant and offline.
 * A future task will bundle all 604 pages directly so first-view is
 * also offline.
 *
 * Image base aspect ratio is 1014:1628 (the source resolution).
 */
const MUSHAF_IMAGE_ASPECT = 1014 / 1628;
const mushafPageImageUrl = (page: number): string =>
  `https://archive.org/download/madinah_mushaf/page${page}.png`;

function MushafPage({
  page,
  screenWidth,
  parchment,
  ornament,
  inkTint,
}: {
  page: typeof MUSHAF_PAGES[number];
  screenWidth: number;
  parchment: string;
  ornament: string;
  /** When set, applied as the Image's tintColor so dark-mode renders
   *  the dark KFGQPC ink as a warm-light color against a black page. */
  inkTint?: string;
}) {
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  // Compute the largest image rect that fits the screen while
  // preserving the source aspect ratio.
  const headerFooterReserve = 80; // px reserved for header + footer
  const horizontalPadding = 16;
  const maxWidth = screenWidth - horizontalPadding * 2;
  const maxHeight = Dimensions.get('window').height - headerFooterReserve;
  let imageWidth = maxWidth;
  let imageHeight = imageWidth / MUSHAF_IMAGE_ASPECT;
  if (imageHeight > maxHeight) {
    imageHeight = maxHeight;
    imageWidth = imageHeight * MUSHAF_IMAGE_ASPECT;
  }

  return (
    <View
      style={[
        mushafPageStyles.page,
        { width: screenWidth, backgroundColor: parchment },
      ]}>
      {/* Header: Juz number on the right (matches the Madinah print's
          running heads). The surah name is visible on the page image
          itself, so we don't repeat it here. */}
      <View style={mushafPageStyles.header}>
        <Text style={[mushafPageStyles.headerText, { color: ornament }]}>
          {`Part ${easternNumerals(page.juz)}`}
        </Text>
      </View>

      <View style={mushafPageStyles.imageWrap}>
        <Image
          source={{ uri: mushafPageImageUrl(page.page) }}
          style={[
            { width: imageWidth, height: imageHeight },
            // tintColor flattens the image to a single color while
            // preserving alpha — gives us readable warm-white ink on
            // pure black in dark mode. Light mode renders the original
            // colored ayah markers + dark ink as-is.
            inkTint ? { tintColor: inkTint } : null,
          ]}
          resizeMode="contain"
          accessibilityLabel={`Mushaf page ${page.page}`}
          onLoad={() => setImageReady(true)}
          onError={() => setImageFailed(true)}
        />
        {!imageReady && !imageFailed ? (
          <View style={mushafPageStyles.imageOverlay}>
            <ActivityIndicator color={ornament} />
          </View>
        ) : null}
        {imageFailed ? (
          <View style={mushafPageStyles.imageOverlay}>
            <Text style={[mushafPageStyles.errorText, { color: ornament }]}>
              Mushaf page unavailable offline. Connect to load page {page.page}.
            </Text>
          </View>
        ) : null}
      </View>

      {/* Footer: page number in an ornamental frame. */}
      <View style={mushafPageStyles.footer}>
        <View
          style={[
            mushafPageStyles.pageNumberFrame,
            { borderColor: ornament },
          ]}>
          <Text style={[mushafPageStyles.pageNumber, { color: ornament }]}>
            {easternNumerals(page.page)}
          </Text>
        </View>
      </View>
    </View>
  );
}

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
