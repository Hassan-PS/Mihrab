import { useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

  // Mushaf mode renders a dedicated full-page view (no scroll cards,
  // no chrome). Translation mode keeps the scrollable card layout.
  if (isMushaf && ayahs) {
    return (
      <MushafReader
        surahNumber={surahNumber}
        surahArabic={surah.arabic}
        surahRomanized={surah.romanized}
        arabic={ayahs.arabic}
        palette={palette}
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
 * Mushaf-style reader — task #108.
 *
 * Modeled on the Ayah app's mushaf experience: a parchment-styled
 * full-page surface with a decorative surah heading, the Bismillah
 * pre-rendered for surahs that begin with it, and a continuous
 * justified RTL paragraph carrying ornamental ayah markers (﴿N﴾) in
 * eastern-Arabic numerals. No card chrome, no translation overlay —
 * this is the reading-only mode.
 *
 * Surah at-Tawbah (9) is the only surah that does not begin with
 * Bismillah; we suppress the pre-rendered Bismillah for it. Surah
 * al-Fatihah (1) already contains Bismillah as its first ayah, so
 * we suppress the pre-rendered version there too.
 */
function MushafReader({
  surahNumber,
  surahArabic,
  surahRomanized,
  arabic,
  palette,
}: {
  surahNumber: number;
  surahArabic: string;
  surahRomanized: string;
  arabic: ReadonlyArray<string>;
  palette: ReturnType<typeof useAppPalette>['palette'];
}) {
  const joined = useMemo(() => {
    return arabic
      .map((line, i) => {
        const num = String(i + 1).replace(/[0-9]/g, d =>
          String.fromCharCode('٠'.charCodeAt(0) + Number(d)),
        );
        // U+FD3E ornate left, U+FD3F ornate right — the traditional
        // mushaf decorative ayah-end markers used in Madinah print.
        return `${line} ﴿${num}﴾`;
      })
      .join(' ');
  }, [arabic]);

  const showBismillahHeader = surahNumber !== 1 && surahNumber !== 9;
  // Parchment-style background: warm off-white that adapts to dark mode
  // by going to a deep brown. Falls back to palette.bg if the user has
  // OLED on so the screen stays calming.
  const isDark = String(palette.text).toLowerCase() !== '#1a1a1a';
  const parchment = isDark ? '#1c1815' : '#fbf6e9';
  const ink = isDark ? '#e8d8b8' : '#3a2e1a';
  const ornament = isDark ? '#c9a96a' : '#8b6f2a';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: parchment }}
      contentContainerStyle={mushafStyles.scroll}
      contentInsetAdjustmentBehavior="automatic">
      {/* Decorative surah heading banner */}
      <View style={[mushafStyles.heading, { borderColor: ornament }]}>
        <Text style={[mushafStyles.headingArabic, { color: ink }]}>
          {`سُورَةُ ${surahArabic}`}
        </Text>
        <Text style={[mushafStyles.headingRomanized, { color: ornament }]}>
          {surahRomanized}
        </Text>
      </View>

      {showBismillahHeader ? (
        <Text style={[mushafStyles.bismillah, { color: ink }]}>
          بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
        </Text>
      ) : null}

      <Text
        style={[
          mushafStyles.body,
          {
            color: ink,
            fontFamily: Platform.select({
              ios: 'Amiri Quran',
              android: 'Amiri-Regular',
              default: undefined,
            }),
          },
        ]}
        accessibilityLabel="Mushaf page"
        selectable>
        {joined}
      </Text>
    </ScrollView>
  );
}

const mushafStyles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 64 },
  heading: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 18,
    borderTopWidth: 2,
    borderBottomWidth: 2,
  },
  headingArabic: {
    fontSize: 26,
    lineHeight: 40,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  headingRomanized: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  bismillah: {
    fontSize: 30,
    lineHeight: 56,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 16,
  },
  body: {
    fontSize: 28,
    lineHeight: 64,
    writingDirection: 'rtl',
    textAlign: 'justify',
    letterSpacing: 0,
  },
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
