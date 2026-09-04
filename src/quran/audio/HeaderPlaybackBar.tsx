/**
 * The recitation, carried on every screen that is not already showing it.
 *
 * ── WHY IT IS UP HERE ─────────────────────────────────────────────────
 *
 * Playback outlives the page it was started from. Someone begins a surah
 * in Tilawah, goes to look at tomorrow's Fajr, and the recitation is now
 * a thing happening to them with no control in reach — the only way to
 * pause was the notification shade or the walk back to Tilawah. So the
 * transport follows them: pause, stop, and a way back to the player, on
 * one line under the title bar, with the surah named on the other side
 * and its progress along the bottom edge.
 *
 * ── WHY IT IS NOT ON TWO SCREENS ──────────────────────────────────────
 *
 * Tilawah IS the player and the reader carries the MiniPlayer over the
 * page. On either, this bar would be a second set of the same controls a
 * few centimetres from the first.
 *
 * ── WHY THE BAR IS THE SURAH, NOT THE AYAH ────────────────────────────
 *
 * An ayah is six seconds. A hairline that fills and empties every six
 * seconds is a flicker, not a progress bar. The surah is the thing being
 * listened to, so the surah is what the line measures — in ayahs, refined
 * by how far into the current one we are, because nothing knows how long
 * a surah runs until it has been played.
 */
import { useRoute } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { HeaderHeightContext } from '@react-navigation/elements';
import { useProgress } from 'react-native-track-player';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { findSurah } from '../quran';
import {
  CloseIcon,
  PauseIcon,
  PlayIcon,
  TilawahIcon,
} from './PlaybackIcons';
import {
  pausePlayback,
  resumePlayback,
  stopPlayback,
  usePlaybackStatus,
} from './playback';

/**
 * Screens this bar stays off.
 *
 * `QuranListen` IS the player and `QuranSurah` carries the MiniPlayer over
 * the page — on either, this would be a second set of the same controls a
 * few centimetres from the first.
 *
 * `Home` is the root-stack route that hosts the tab navigator, and the
 * tabs draw their own copy INSIDE their headers. Without this the
 * root-stack wrapper would put a second bar above the tab titles, which
 * is both twice and in the wrong place.
 */
const OWN_PLAYER: ReadonlySet<string> = new Set([
  'QuranListen',
  'QuranSurah',
  'Home',
]);

export function HeaderPlaybackBar({
  /**
   * True on the root stack, where iOS draws a transparent header over the
   * top of the screen — the bar has to start below it rather than under
   * it. The tab navigator's headers are opaque on every platform, so
   * there the bar is simply the first thing in the screen.
   */
  underTransparentHeader,
}: {
  underTransparentHeader?: boolean;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const route = useRoute();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { active, playing, loading } = usePlaybackStatus();
  const { position, duration } = useProgress(500);
  // The context rather than `useHeaderHeight()`: the hook throws where no
  // header is mounted, and this component renders on every screen.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  if (!active || OWN_PLAYER.has(route.name)) return null;

  const surah = findSurah(active.surah);
  const withinAyah = duration > 0 ? position / duration : 0;
  const ratio = surah
    ? Math.max(
        0,
        Math.min(1, (active.ayah - 1 + withinAyah) / surah.ayahCount),
      )
    : 0;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: palette.card,
          borderBottomColor: palette.border ?? palette.muted,
          marginTop:
            underTransparentHeader && Platform.OS === 'ios' ? headerHeight : 0,
        },
      ]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            playing ? t('quran.pause', 'Pause') : t('quran.play', 'Play')
          }
          hitSlop={8}
          onPress={() => {
            void (playing ? pausePlayback() : resumePlayback());
          }}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: palette.accentBg },
            pressed && styles.pressed,
          ]}>
          {playing ? (
            <PauseIcon color={String(palette.accentSolid)} size={16} />
          ) : (
            <PlayIcon color={String(palette.accentSolid)} size={16} />
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.stopPlayback', 'Stop playback')}
          hitSlop={8}
          onPress={() => {
            void stopPlayback();
          }}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <CloseIcon color={String(palette.muted)} size={16} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.listenTitle', 'Tilawah')}
          hitSlop={8}
          onPress={() => navigation.navigate('QuranListen')}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <TilawahIcon color={String(palette.accentSolid)} size={16} />
        </Pressable>

        {/* The name goes at the far end, away from the controls: a label
            that sat beside the buttons read as one of them. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.listenTitle', 'Tilawah')}
          onPress={() => navigation.navigate('QuranListen')}
          style={styles.namePress}>
          <Text
            numberOfLines={1}
            style={[styles.name, { color: palette.text }]}>
            {loading
              ? t('quran.buffering', 'Buffering…')
              : `${surah?.romanized ?? ''} ${active.surah}:${active.ayah}`}
          </Text>
        </Pressable>
      </View>

      {/* Along the bottom edge, so the bar has a base line rather than a
          separate stripe under it. */}
      <View style={[styles.track, { backgroundColor: palette.controlBg }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: palette.accentSolid,
              width: `${ratio * 100}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // The controls sit in from the edge by the same measure the cards on
    // the page below do, so the bar reads as part of the chrome rather
    // than as something stuck to the side of the screen.
    paddingStart: 12,
    paddingEnd: 16,
    paddingVertical: 5,
  },
  btn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.55 },
  namePress: { flex: 1, alignItems: 'flex-end', marginStart: 8 },
  name: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 2, width: '100%' },
  fill: { height: '100%' },
});
