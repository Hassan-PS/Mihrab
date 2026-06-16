import { useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
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
import { findSurah, loadSurah, type LoadedSurah } from '../quran/quran';
import {
  defaultEditionForLocale,
  editionMatchesLocale,
  getSurahTranslation,
  QURAN_TRANSLATIONS,
  type QuranTranslationId,
} from '../quran/translations';
import { MushafReader } from '../quran/MushafReader';
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
  const { t, i18n } = useTranslation();
  // For Arabic readers the romanized name + English meaning are
  // redundant noise — the Arabic title above is the canonical one.
  const isArabic = i18n.language === 'ar';
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
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
  // means "follow the active app language"; explicit string overrides —
  // BUT only when the saved edition's locale still matches the current
  // app language. If the user previously picked, say, en.sahih in English
  // mode and later switched the app language to Arabic, we want them to
  // land on the locale-appropriate default (ar.muyassar / Tafsir
  // al-Muyassar) rather than carry the stale English choice forward.
  const activeEdition: QuranTranslationId = useMemo(() => {
    if (
      settings.quranTranslationEdition &&
      editionMatchesLocale(settings.quranTranslationEdition, settings.language)
    ) {
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

  // Mushaf mode renders the page-by-page paginated view via the unified
  // ScrollView-based reader (task #153). The previous platform split
  // (iOS new reader / Android FlatList reader) was redundant since the
  // Arabic-locale blank-page bug also surfaces on Android — same
  // reader works on both.
  if (isMushaf) {
    return (
      <MushafReader
        surahNumber={surahNumber}
        isFullscreen={isFullscreen}
        onExitFullscreen={() => setIsFullscreen(false)}
        onTitleChange={title => navigation.setOptions({ title })}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      contentInsetAdjustmentBehavior="automatic">
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
