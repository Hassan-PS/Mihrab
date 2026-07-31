/**
 * Mini player — QR-16, restyled in v2.7.27.
 *
 * A floating card (matches the app-wide card chrome: rounded corners,
 * soft shadow in light themes, border in dark) pinned above the bottom
 * edge whenever recitation is active. One row: ayah reference + tappable
 * reciter name (opens the reciter picker), prev / play-pause / next /
 * stop. The play button is the single accent-filled circle — everything
 * else stays quiet (design principle 4). A hairline progress track along
 * the top edge follows the current ayah.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useProgress } from 'react-native-track-player';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { findSurah } from '../quran';
import { findReciter } from './reciters';
import { ReciterPickerSheet } from './ReciterPickerSheet';
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
  const { position, duration } = useProgress(500);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Stopping playback unmounts this card. The reciter picker is an RN
  // <Modal> — an activity-window dialog, not an in-tree view — so it must
  // be hidden BEFORE it is unmounted, or the dismissed-but-never-dropped
  // window keeps swallowing every touch in the app.
  useEffect(() => {
    if (!active) setPickerVisible(false);
  }, [active]);

  if (!active) {
    // One last render with the sheet explicitly hidden, so RN dismisses it
    // the ordinary way; the effect above then drops it on the next commit.
    return pickerVisible ? (
      <ReciterPickerSheet
        visible={false}
        onClose={() => setPickerVisible(false)}
      />
    ) : null;
  }

  const meta = findSurah(active.surah);
  const reciter = findReciter(reciterId);
  const progress =
    duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  const sideBtn = (glyph: string, label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={styles.sideBtn}>
      <Text style={[styles.sideGlyph, { color: palette.text }]}>{glyph}</Text>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
      ]}>
      {/* Ayah progress hairline. */}
      <View style={[styles.track, { backgroundColor: palette.accentBg }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: palette.accentSolid,
              width: `${progress * 100}%`,
            },
          ]}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.info}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: palette.text }]}>
            {`${meta?.romanized ?? ''} ${active.surah}:${active.ayah}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.chooseReciter', 'Choose reciter')}
            hitSlop={6}
            onPress={() => setPickerVisible(true)}>
            <Text
              numberOfLines={1}
              style={[styles.sub, { color: palette.accentSolid }]}>
              {loading ? t('quran.buffering', 'Buffering…') : reciter.name}
            </Text>
          </Pressable>
        </View>

        {sideBtn('⏮︎', t('quran.previousAyah', 'Previous ayah'), () => {
          void skipToPreviousAyah();
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            playing ? t('quran.pause', 'Pause') : t('quran.play', 'Play')
          }
          hitSlop={6}
          onPress={() => {
            void (playing ? pausePlayback() : resumePlayback());
          }}
          style={[styles.playBtn, { backgroundColor: palette.accentSolid }]}>
          {/* U+275A pair for pause — U+23F8 renders as a colored emoji on
              Android even with the FE0E variation selector. */}
          <Text style={styles.playGlyph}>{playing ? '❚❚' : '▶︎'}</Text>
        </Pressable>
        {sideBtn('⏭︎', t('quran.nextAyah', 'Next ayah'), () => {
          void skipToNextAyah();
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.stopPlayback', 'Stop playback')}
          hitSlop={8}
          onPress={() => {
            void stopPlayback();
          }}
          style={styles.sideBtn}>
          <Text style={[styles.closeGlyph, { color: palette.muted }]}>✕</Text>
        </Pressable>
      </View>

      <ReciterPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  track: { height: 3, width: '100%' },
  fill: { height: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  info: { flex: 1, marginEnd: 8 },
  title: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 11, marginTop: 1, fontWeight: '600' },
  sideBtn: { paddingHorizontal: 7, paddingVertical: 6 },
  sideGlyph: { fontSize: 17, fontWeight: '700' },
  closeGlyph: { fontSize: 15, fontWeight: '700' },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  playGlyph: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
