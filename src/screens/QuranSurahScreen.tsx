/**
 * The surah route — one route, two readers.
 *
 * `settings.quranReadingMode` says which one is on screen, and the header
 * of each carries the toggle to the other. This screen hydrates what both
 * need, finds the surah, and renders one of them; everything either reader
 * knows about the navigator — header controls, orientation, fullscreen,
 * content colour, the Mac's back gesture — lives with that reader.
 *
 * It used to be all one component, 980 lines switching on `isMushaf` in
 * a shared header effect, content style, sheet guard and render. Each
 * muṣḥaf concern was a branch inside something the translation reader also
 * ran, and each platform edge case landed here as another one.
 */
import { useCallback, useEffect } from 'react';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { findSurah } from '../quran/quran';
import { hydrateRiwayahData } from '../quran/riwayahData';
import { hydrateQuranState } from '../quran/quranState';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import type { RootStackParamList } from '../navigation/types';
import { MushafSurahScreen } from './quran/MushafSurahScreen';
import { TranslationSurahScreen } from './quran/TranslationSurahScreen';

export function QuranSurahScreen() {
  useBreakpoint();
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();
  const route = useRoute<RouteProp<RootStackParamList, 'QuranSurah'>>();
  const { surahNumber, initialPage, scrollToAyah } = route.params;
  useAndroidSubScreenBack();

  const surah = findSurah(surahNumber);

  useEffect(() => {
    void hydrateQuranState();
    // The muṣḥaf a reader may have added is on disk, not in the bundle
    // (`riwayahStore.ts`). Read it here so the toggle and the reader both
    // know what this device has before the first page is drawn.
    void hydrateRiwayahData();
  }, []);

  const isMushaf = settings.quranReadingMode === 'mushaf';
  const toggleMode = useCallback(() => {
    updateSettings({
      quranReadingMode: isMushaf ? 'withTranslation' : 'mushaf',
    });
  }, [isMushaf, updateSettings]);

  if (!surah) {
    return (
      <View style={[styles.empty, { backgroundColor: palette.bg }]}>
        <Text style={{ color: palette.muted }}>{t('quran.notFound')}</Text>
      </View>
    );
  }

  return isMushaf ? (
    <MushafSurahScreen
      surah={surah}
      surahNumber={surahNumber}
      initialPage={initialPage}
      onToggleMode={toggleMode}
    />
  ) : (
    <TranslationSurahScreen
      surah={surah}
      surahNumber={surahNumber}
      scrollToAyah={scrollToAyah}
      onToggleMode={toggleMode}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
