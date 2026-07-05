/**
 * Mini player bar — QR-16 (docs/quran-reader-plan.md).
 *
 * Compact playback strip pinned above the bottom edge of the Quran
 * screens whenever recitation is active. Ayah reference + reciter,
 * prev / play-pause / next / stop. Deliberately quiet (design
 * principle 4): one row, no artwork, tabular numerals.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { findSurah } from '../quran';
import { findReciter } from './reciters';
import {
  pausePlayback,
  resumePlayback,
  skipToNextAyah,
  skipToPreviousAyah,
  stopPlayback,
  usePlaybackStatus,
} from './playback';

export function MiniPlayer() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { active, playing, loading, reciterId } = usePlaybackStatus();

  if (!active) return null;

  const meta = findSurah(active.surah);
  const reciter = findReciter(reciterId);

  const btn = (glyph: string, label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={styles.btn}>
      <Text style={[styles.btnGlyph, { color: palette.accentSolid }]}>
        {glyph}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: palette.card, borderColor: palette.border },
      ]}>
      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: palette.text }]}>
          {`${meta?.romanized ?? ''} ${active.surah}:${active.ayah}`}
        </Text>
        <Text numberOfLines={1} style={[styles.sub, { color: palette.muted }]}>
          {loading ? t('quran.buffering', 'Buffering…') : reciter.name}
        </Text>
      </View>
      {btn('⏮︎', t('quran.previousAyah', 'Previous ayah'), () => {
        void skipToPreviousAyah();
      })}
      {btn(
        playing ? '⏸︎' : '▶︎',
        playing ? t('quran.pause', 'Pause') : t('quran.play', 'Play'),
        () => {
          void (playing ? pausePlayback() : resumePlayback());
        },
      )}
      {btn('⏭︎', t('quran.nextAyah', 'Next ayah'), () => {
        void skipToNextAyah();
      })}
      {btn('✕', t('quran.stopPlayback', 'Stop playback'), () => {
        void stopPlayback();
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  info: { flex: 1, marginEnd: 8 },
  title: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 11, marginTop: 1 },
  btn: { paddingHorizontal: 8, paddingVertical: 6 },
  btnGlyph: { fontSize: 18, fontWeight: '700' },
});
