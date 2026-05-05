// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import type { RootStackParamList } from '../navigation/types';
import { findPageForAyah } from '../quran/pages';
import { SURAHS, type SurahIndex } from '../quran/quran';
import { cardEdgeStyle } from '../theme/chrome';

/**
 * Quran index screen — task #27.
 *
 * Lists all 114 surahs (number, romanized + Arabic name, ayah count,
 * Meccan/Medinan badge). Tap to push the surah reading screen.
 *
 * The MVP ships full text only for Surah al-Fatiha; the rest of the index
 * still renders so users see the planned scope and the navigation deep-link
 * is ready when the data PR populates the bundle.
 */
export function QuranScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useAndroidSubScreenBack();
  // Arabic readers don't need the Latin transliteration of the surah
  // name or its English meaning — the Arabic name (right column) is
  // already the canonical name they recognise. Hide both for the
  // Arabic locale so the row is calm rather than redundant.
  const isArabic = i18n.language === 'ar';

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <FlatList<SurahIndex>
        data={[...SURAHS]}
        keyExtractor={s => String(s.number)}
        contentContainerStyle={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => {
          const startPage = findPageForAyah(item.number, 1);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.number}. ${item.romanized} — ${t('quran.pageLabel', { page: startPage })}`}
              onPress={() =>
                navigation.navigate('QuranSurah', { surahNumber: item.number })
              }
              style={[
                styles.row,
                { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
              ]}>
              <View
                style={[
                  styles.numberBadge,
                  { backgroundColor: palette.accentBg },
                ]}>
                <Text style={[styles.numberText, { color: palette.accent }]}>
                  {item.number}
                </Text>
              </View>
              <View style={styles.rowText}>
                {!isArabic ? (
                  <Text style={[styles.romanized, { color: palette.text }]}>
                    {item.romanized}
                  </Text>
                ) : null}
                <Text style={[styles.english, { color: palette.muted }]}>
                  {isArabic ? '' : `${item.english} · `}
                  {t('quran.ayahCount', { count: item.ayahCount })} ·{' '}
                  {item.type === 'meccan'
                    ? t('quran.meccan')
                    : t('quran.medinan')}
                </Text>
                <Text style={[styles.pageHint, { color: palette.muted }]}>
                  {t('quran.pageLabel', { page: startPage })}
                </Text>
              </View>
              <Text style={[styles.arabic, { color: palette.text }]}>
                {item.arabic}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  numberBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { fontSize: 14, fontWeight: '700' },
  rowText: { flex: 1 },
  romanized: { fontSize: 16, fontWeight: '600' },
  english: { fontSize: 12, marginTop: 2 },
  pageHint: { fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
  arabic: { fontSize: 22 },
});
