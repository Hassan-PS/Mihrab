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

  useEffect(() => {
    if (surah) {
      navigation.setOptions({ title: surah.romanized });
    }
  }, [navigation, surah]);

  const isMushaf = settings.quranReadingMode === 'mushaf';
  const toggleMushaf = () => {
    updateSettings({
      quranReadingMode: isMushaf ? 'withTranslation' : 'mushaf',
    });
  };
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

        {/* In-reader controls: toggle mode + tap-to-cycle translation
            edition. Settings has the full picker for both. */}
        <View style={styles.controlsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isMushaf
                ? t('quran.mushafMode', 'Mushaf view')
                : t('quran.translationMode', 'With translation')
            }
            accessibilityState={{ selected: !isMushaf }}
            onPress={toggleMushaf}
            style={[
              styles.controlBtn,
              {
                borderColor: palette.border,
                backgroundColor: !isMushaf ? palette.accent : palette.bg,
              },
            ]}>
            <Text
              style={[
                styles.controlLabel,
                { color: !isMushaf ? '#fff' : palette.text },
              ]}>
              {t('quran.translationMode', 'With translation')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.mushafMode', 'Mushaf view')}
            accessibilityState={{ selected: isMushaf }}
            onPress={toggleMushaf}
            style={[
              styles.controlBtn,
              {
                borderColor: palette.border,
                backgroundColor: isMushaf ? palette.accent : palette.bg,
              },
            ]}>
            <Text
              style={[
                styles.controlLabel,
                { color: isMushaf ? '#fff' : palette.text },
              ]}>
              {t('quran.mushafMode', 'Mushaf view')}
            </Text>
          </Pressable>
        </View>
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
        isMushaf ? (
          <MushafPage arabic={ayahs.arabic} palette={palette} />
        ) : (
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
        )
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
 * Mushaf-style continuous reading block — task #97.
 *
 * Joins all ayahs of the surah into a single right-to-left flowing
 * paragraph, separated by the traditional Arabic ayah-end marker (۝)
 * with the ayah number inside it. Uses the bundled Amiri Quran font
 * when available and falls back to the system Arabic typeface. No
 * translation overlay — this view is for continuous recitation.
 */
function MushafPage({
  arabic,
  palette,
}: {
  arabic: ReadonlyArray<string>;
  palette: ReturnType<typeof useAppPalette>['palette'];
}) {
  const joined = useMemo(() => {
    return arabic
      .map((line, i) => {
        // Eastern-Arabic numerals for the ayah marker so it reads
        // visually correct in RTL flow.
        const num = String(i + 1).replace(/[0-9]/g, d =>
          String.fromCharCode('٠'.charCodeAt(0) + Number(d)),
        );
        return `${line} ۝${num}`;
      })
      .join(' ');
  }, [arabic]);
  return (
    <View
      style={[
        styles.mushafPage,
        { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
      ]}>
      <Text
        style={[
          styles.mushafText,
          {
            color: palette.text,
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
    </View>
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
