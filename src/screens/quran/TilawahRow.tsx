/**
 * The way into Tilāwah, as a row under the khatmah — with the transport.
 *
 * It was a pill in the title bar; the tabs have no title bar now, and a
 * pill floating at the top of a page with nothing beside it read as a
 * stray. A row is what the page is made of, and a row can carry more
 * than a word: what pressing play would start (the surah playing, or the
 * one the reader left off in), play/pause, and the next surah — the
 * three things a listener reaches the player screen for. Tapping the
 * row itself still opens that screen.
 *
 * It reads the same store the screen does, so the two never disagree
 * about what is playing, and starts a listen the same way (`listenFrom`
 * where the reader left off), so the first press here and the first
 * press there do the same thing.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Rect } from 'react-native-svg';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { PauseIcon, PlayIcon, TilawahIcon } from '../../quran/audio/PlaybackIcons';
import {
  listenFrom,
  listenNextSurah,
  pausePlayback,
  resumePlayback,
  SURAHS,
  usePlaybackStatus,
} from '../../quran/audio/playback';
import { useQuranState } from '../../quran/quranState';
import { cardEdgeStyle } from '../../theme/chrome';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

function NextIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 5.5v13l9-6.5z" fill={color} />
      <Rect x="16.5" y="5.5" width="2.5" height="13" rx="1" fill={color} />
    </Svg>
  );
}

export function TilawahRow() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const status = usePlaybackStatus();
  const quran = useQuranState();

  // What the row is about: what is playing, else what play would start.
  const resume = quran.lastRead;
  const shown =
    SURAHS.find(s => s.number === (status.active?.surah ?? resume?.surah ?? 1)) ?? SURAHS[0];
  const ayah = status.active?.ayah ?? null;
  const label = t('quran.listenTitle', 'Tilawah');
  const subtitle = ayah
    ? `${shown.romanized} · ${ayah}`
    : shown.romanized;

  const togglePlay = () => {
    if (status.playing) {
      void pausePlayback();
      return;
    }
    if (status.active) {
      void resumePlayback();
      return;
    }
    void listenFrom(shown.number, resume?.ayah ?? 1);
  };

  return (
    <View
      style={[styles.row, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} — ${t('quran.tilawahDoorSub', 'Listen to the Quran')}`}
        onPress={() => navigation.navigate('QuranListen')}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
        <View style={[styles.mark, { backgroundColor: palette.accentBg }]}>
          <TilawahIcon color={palette.accentSolid} size={18} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.sub, { color: palette.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          status.playing
            ? t('quran.pause', 'Pause')
            : t('quran.play', 'Play')
        }
        hitSlop={8}
        onPress={togglePlay}
        style={({ pressed }) => [
          styles.play,
          { backgroundColor: palette.accentSolid },
          pressed && styles.pressed,
        ]}>
        {status.loading ? (
          <ActivityIndicator size="small" color={String(palette.onAccent)} />
        ) : status.playing ? (
          <PauseIcon color={String(palette.onAccent)} size={18} />
        ) : (
          <PlayIcon color={String(palette.onAccent)} size={18} />
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('quran.tilawahNextSurah', { defaultValue: 'Next surah' })}
        hitSlop={8}
        onPress={() => void listenNextSurah()}
        style={({ pressed }) => [styles.next, pressed && styles.pressed]}>
        <NextIcon color={String(palette.text)} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingStart: SPACING.md,
    paddingEnd: SPACING.sm,
    gap: SPACING.sm,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minWidth: 0 },
  mark: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  sub: { fontSize: TYPE.footnote.fontSize, marginTop: 1 },
  play: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  next: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
