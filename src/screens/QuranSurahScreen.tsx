import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Dimensions,
  FlatList,
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

  const isDark = String(palette.text).toLowerCase() !== '#1a1a1a';
  const parchment = isDark ? '#1c1815' : '#fbf6e9';
  const ink = isDark ? '#e8d8b8' : '#3a2e1a';
  const ornament = isDark ? '#c9a96a' : '#8b6f2a';

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
          ink={ink}
          ornament={ornament}
        />
      )}
    />
  );
}

/**
 * One physical page of the mushaf. Renders the ayah range from
 * `page.start` to (page+1).start exclusive across one or more surah
 * data files, joined into a single justified RTL paragraph.
 */
function MushafPage({
  page,
  screenWidth,
  parchment,
  ink,
  ornament,
}: {
  page: typeof MUSHAF_PAGES[number];
  screenWidth: number;
  parchment: string;
  ink: string;
  ornament: string;
}) {
  // Collect every ayah on this page, walking surahs as needed when
  // the page spans a surah boundary. Each ayah gets the traditional
  // ﴿N﴾ ayah-end marker in eastern numerals.
  const [body, setBody] = useState<string>('');
  const [headerSurah, setHeaderSurah] = useState<{ name: string; english: string } | null>(null);
  const [showBismillahPrefix, setShowBismillahPrefix] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const startSurah = page.start.surah;
      const endSurah = page.end?.surah ?? page.start.surah;
      const endAyahExclusive = page.end?.ayah ?? Number.MAX_SAFE_INTEGER;
      const parts: string[] = [];
      for (let s = startSurah; s <= endSurah; s++) {
        const loaded = await loadSurah(s);
        if (!loaded) continue;
        const ayahFrom = s === startSurah ? page.start.ayah : 1;
        const ayahToExclusive =
          s === endSurah ? endAyahExclusive : loaded.arabic.length + 1;
        for (let a = ayahFrom; a < ayahToExclusive; a++) {
          const text = loaded.arabic[a - 1];
          if (!text) continue;
          parts.push(`${text} ﴿${easternNumerals(a)}﴾`);
        }
      }
      if (cancelled) return;
      setBody(parts.join(' '));
      const surah = MUSHAF_SURAHS.find(s => s.number === page.start.surah);
      setHeaderSurah(
        surah
          ? { name: surah.name, english: surah.englishName }
          : null,
      );
      // Bismillah is pre-rendered only when this page is the very first
      // page of a new surah (not Fatihah, not Tawbah, and not just a
      // continuation page within the same surah).
      const startsNewSurah =
        page.start.ayah === 1 && page.start.surah !== 1 && page.start.surah !== 9;
      setShowBismillahPrefix(startsNewSurah);
    })().catch(e => console.warn('MushafPage load failed', e));
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <View
      style={[
        mushafPageStyles.page,
        { width: screenWidth, backgroundColor: parchment },
      ]}>
      {/* Header: surah name (left) + Juz number (right) — like the
          Madinah print's running heads. */}
      <View style={mushafPageStyles.header}>
        <Text style={[mushafPageStyles.headerText, { color: ornament }]}>
          {headerSurah?.english ?? ''}
        </Text>
        <Text style={[mushafPageStyles.headerText, { color: ornament }]}>
          {`Part ${easternNumerals(page.juz)}`}
        </Text>
      </View>

      <ScrollView
        style={mushafPageStyles.bodyScroll}
        contentContainerStyle={mushafPageStyles.bodyContent}>
        {showBismillahPrefix ? (
          <Text style={[mushafPageStyles.bismillah, { color: ink }]}>
            بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
          </Text>
        ) : null}
        <Text
          style={[
            mushafPageStyles.body,
            {
              color: ink,
              // Bundled in this build (#115): AmiriQuran.ttf in
              // android/app/src/main/assets/fonts and registered in
              // ios Info.plist UIAppFonts. iOS resolves by family
              // name "Amiri Quran"; Android by file basename.
              fontFamily: Platform.select({
                ios: 'Amiri Quran',
                android: 'AmiriQuran',
                default: undefined,
              }),
            },
          ]}
          accessibilityLabel={`Mushaf page ${page.page}`}
          selectable>
          {body}
        </Text>
      </ScrollView>

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
  page: { flex: 1, paddingHorizontal: 22, paddingVertical: 14 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  bodyScroll: { flex: 1 },
  bodyContent: { paddingBottom: 12 },
  bismillah: {
    fontSize: 26,
    lineHeight: 50,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 12,
  },
  body: {
    fontSize: 24,
    lineHeight: 56,
    writingDirection: 'rtl',
    textAlign: 'justify',
    letterSpacing: 0,
  },
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
