/**
 * Listening — the Quran as something you put on, not something you read.
 *
 * ── WHY IT IS NOT THE READER ──────────────────────────────────────────
 *
 * The reader already plays audio, and for a long time that was the only
 * way to hear anything: open the mushaf, tap an ayah, "play from here".
 * That flow is about the passage in front of you, and it ends where the
 * surah does, because you asked for that surah.
 *
 * Listening is a different act. Someone puts a recitation on in the car,
 * or at night with the screen off, and expects what any player does — one
 * surah into the next, controls on the lock screen, and no need for the
 * app to be open or even alive. Building that into the reader would have
 * meant a page that is sometimes a book and sometimes a stereo. So it is
 * its own page, and the pieces underneath — the queue, the store, the
 * downloaded files — are shared rather than duplicated.
 *
 * ── THE FILES ARE THE SAME FILES ──────────────────────────────────────
 *
 * This page's download writes into `<Documents>/quran/audio/{reciter}/`,
 * which is exactly where the reader's prefetch writes and exactly where
 * its player looks. Downloading a reciter to listen to on a flight makes
 * the mushaf's play-from-here work offline in the same act, and someone
 * who has been reading with recitation for a month finds this download
 * already part-done. One folder, one answer to "do I have this".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useProgress } from 'react-native-track-player';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useAndroidSubScreenBack } from '../../navigation/useAndroidSubScreenBack';
import { SURAHS, type SurahIndex } from '../../quran/quran';
import {
  isListening,
  listenFrom,
  pausePlayback,
  resumePlayback,
  seekTo,
  setPlaybackRate,
  skipToNextAyah,
  skipToPreviousAyah,
  stopPlayback,
  usePlaybackStatus,
} from '../../quran/audio/playback';
import { findReciter } from '../../quran/audio/reciters';
import { ReciterPickerSheet } from '../../quran/audio/ReciterPickerSheet';
import {
  deleteReciterAudio,
  estimatedReciterBytes,
  reciterAudioStats,
  totalAyahCount,
  type ReciterAudioStats,
} from '../../quran/audio/audioStore';
import {
  cancelQuranDownload,
  isJobRunning,
  quranDownloadState,
  startQuranDownload,
  subscribeQuranDownload,
  type QuranDownloadState,
} from '../../quran/quranDownloadManager';
import { setQuranPrefs, useQuranState } from '../../quran/quranState';

/** Playback speeds, matching the reader's own chips. */
const RATES = [0.75, 1, 1.25, 1.5, 2] as const;

/**
 * Sleep-timer choices, in minutes. `0` is off; `-1` is "when this surah
 * ends", which is the one people actually want at night — a recitation cut
 * off mid-ayah by a clock is worse than one that runs four minutes long.
 */
const SLEEP_CHOICES = [0, 15, 30, 60, -1] as const;
const SLEEP_END_OF_SURAH = -1;

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The scrubber.
 *
 * A bare View with a PanResponder rather than a slider dependency — the
 * app does not carry one, and this is a track, a fill and a thumb. While a
 * finger is down the fill follows the FINGER and not the player, or the
 * next progress tick would yank it back to where playback still is and the
 * thumb would fight the person holding it.
 */
function Scrubber({
  position,
  duration,
  onSeek,
  palette,
  label,
}: {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  palette: ReturnType<typeof useAppPalette>['palette'];
  label: string;
}) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const widthRef = useRef(0);
  const durationRef = useRef(0);
  widthRef.current = width;
  durationRef.current = duration;

  const secondsAt = useCallback((x: number) => {
    const w = widthRef.current;
    if (w <= 0 || durationRef.current <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, x / w));
    return ratio * durationRef.current;
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => {
          setDragging(secondsAt(e.nativeEvent.locationX));
        },
        onPanResponderMove: e => {
          setDragging(secondsAt(e.nativeEvent.locationX));
        },
        onPanResponderRelease: e => {
          const at = secondsAt(e.nativeEvent.locationX);
          setDragging(null);
          onSeek(at);
        },
        onPanResponderTerminate: () => setDragging(null),
      }),
    [onSeek, secondsAt],
  );

  const shown = dragging ?? position;
  const ratio = duration > 0 ? Math.max(0, Math.min(1, shown / duration)) : 0;

  return (
    <View style={styles.scrubWrap}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        style={styles.scrubTouch}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}>
        <View style={[styles.scrubTrack, { backgroundColor: palette.accentBg }]}>
          <View
            style={[
              styles.scrubFill,
              {
                width: `${ratio * 100}%`,
                backgroundColor: palette.accentSolid,
              },
            ]}
          />
        </View>
        <View
          style={[
            styles.scrubThumb,
            {
              left: `${ratio * 100}%`,
              backgroundColor: palette.accentSolid,
            },
          ]}
        />
      </View>
      <View style={styles.scrubTimes}>
        <Text style={[styles.scrubTime, { color: palette.muted }]}>
          {formatClock(shown)}
        </Text>
        <Text style={[styles.scrubTime, { color: palette.muted }]}>
          {formatClock(duration)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Play / pause / skip / stop, drawn rather than typed.
 *
 * Views with borders and backgrounds, not SVG — two bars, a triangle and a
 * square do not need a drawing library, and a View takes the palette's
 * semantic `ColorValue` directly, where `react-native-svg` would have
 * needed the resolved hex (see `textSolid`).
 */
function TransportIcon({
  kind,
  color,
  size = 26,
}: {
  kind: 'play' | 'pause' | 'next' | 'prev' | 'stop';
  color: ColorValue;
  size?: number;
}) {
  // Simple filled glyphs built from views: two bars, a triangle, a square.
  // An SVG would be five more imports for shapes this plain.
  if (kind === 'pause') {
    return (
      <View style={[styles.iconRow, { width: size, height: size }]}>
        <View style={[styles.bar, { backgroundColor: color, height: size }]} />
        <View style={[styles.bar, { backgroundColor: color, height: size }]} />
      </View>
    );
  }
  if (kind === 'stop') {
    return (
      <View
        style={{
          width: size * 0.72,
          height: size * 0.72,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    );
  }
  const triangle = (
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: size * 0.42,
        borderBottomWidth: size * 0.42,
        // rtl-safe: the 0x0-with-transparent-borders triangle hack. This
        // is a play button, and a play button points the same way in every
        // language — transport controls are not mirrored for RTL on either
        // platform. Mirroring it would give Arabic readers a rewind glyph.
        borderLeftWidth: size * 0.68, // rtl-safe: triangle hack, see above
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color, // rtl-safe: triangle hack, see above
      }}
    />
  );
  if (kind === 'play') return triangle;
  // Skip: a triangle with a bar, mirrored for previous.
  return (
    <View
      style={[
        styles.iconRow,
        kind === 'prev' ? styles.mirrored : null,
        { width: size, height: size, alignItems: 'center' },
      ]}>
      <View
        style={{
          width: 0,
          height: 0,
          borderTopWidth: size * 0.32,
          borderBottomWidth: size * 0.32,
          // rtl-safe: same triangle hack, same reason. `prev` is this
          // glyph under `styles.mirrored`, so the pair is defined once and
          // flipped deliberately rather than by the layout direction.
          borderLeftWidth: size * 0.5, // rtl-safe: triangle hack, see above
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: color, // rtl-safe: triangle hack, see above
        }}
      />
      <View
        style={{
          width: 3,
          height: size * 0.64,
          backgroundColor: color,
          marginStart: 2,
        }}
      />
    </View>
  );
}

export function QuranListenScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  useAndroidSubScreenBack();
  const status = usePlaybackStatus();
  const progress = useProgress(400);
  const quran = useQuranState();
  const reciterId = quran.prefs.reciterId;
  const reciter = findReciter(reciterId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [download, setDownload] = useState<QuranDownloadState>(
    quranDownloadState,
  );
  const [stats, setStats] = useState<ReciterAudioStats | null>(null);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);

  useEffect(() => subscribeQuranDownload(setDownload), []);

  /**
   * What this reciter has on disk.
   *
   * Re-read when the reciter changes and whenever a download stops
   * running — the moment it ends is the moment the number is wrong, and a
   * screen that keeps saying "4,102 of 6,236" after the run completed is
   * the kind of thing people report as the download not working.
   */
  const refreshStats = useCallback(() => {
    let alive = true;
    void reciterAudioStats(reciterId).then(s => {
      if (alive) setStats(s);
    });
    return () => {
      alive = false;
    };
  }, [reciterId]);

  useEffect(refreshStats, [refreshStats, download.running]);

  // ── The sleep timer ─────────────────────────────────────────────────
  //
  // A wall-clock deadline rather than a countdown in state: the screen can
  // be closed, and a timer that only exists while a component is mounted
  // is not a sleep timer. The pause itself is a `setTimeout`, which lives
  // as long as the JS context does — the same context the playback service
  // runs in, so it survives the screen and the app being backgrounded.
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSleep = useCallback(() => {
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = null;
    setSleepEndsAt(null);
  }, []);

  const chooseSleep = useCallback(
    (choice: number) => {
      setSleepMinutes(choice);
      clearSleep();
      if (choice === 0) return;
      if (choice === SLEEP_END_OF_SURAH) return; // handled on track change
      const at = Date.now() + choice * 60_000;
      setSleepEndsAt(at);
      sleepTimer.current = setTimeout(() => {
        void pausePlayback();
        clearSleep();
        setSleepMinutes(0);
      }, choice * 60_000);
    },
    [clearSleep],
  );

  // End-of-surah: watch the active ayah and stop when the surah turns over.
  const surahAtArm = useRef<number | null>(null);
  useEffect(() => {
    if (sleepMinutes !== SLEEP_END_OF_SURAH) {
      surahAtArm.current = null;
      return;
    }
    const current = status.active?.surah ?? null;
    if (surahAtArm.current == null) {
      surahAtArm.current = current;
      return;
    }
    if (current != null && current !== surahAtArm.current) {
      void pausePlayback();
      setSleepMinutes(0);
      surahAtArm.current = null;
    }
  }, [sleepMinutes, status.active?.surah]);

  useEffect(() => () => clearSleep(), [clearSleep]);

  // ── Playing ─────────────────────────────────────────────────────────

  const activeSurah = status.active
    ? SURAHS.find(s => s.number === status.active?.surah)
    : undefined;

  const togglePlay = useCallback(() => {
    if (status.playing) {
      void pausePlayback();
      return;
    }
    if (status.active) {
      void resumePlayback();
      return;
    }
    // Nothing loaded: start at the top of the book. Al-Fatihah is the
    // right answer to "just play something".
    void listenFrom(1, 1);
  }, [status.active, status.playing]);

  const onSurah = useCallback((surah: number) => {
    void listenFrom(surah, 1);
  }, []);

  const setRate = useCallback((rate: number) => {
    setQuranPrefs({ playbackRate: rate });
    void setPlaybackRate(rate);
  }, []);

  // ── The download ────────────────────────────────────────────────────

  const job = useMemo(
    () => ({ kind: 'audio' as const, reciterId }),
    [reciterId],
  );
  const runningThis = isJobRunning(job);
  const runningOther = download.running != null && !runningThis;
  const total = totalAyahCount();
  const onDisk = stats?.files ?? 0;
  const complete = stats?.complete ?? false;

  const startDownload = useCallback(() => {
    startQuranDownload(job);
  }, [job]);

  const removeDownload = useCallback(() => {
    void deleteReciterAudio(reciterId).then(refreshStats);
  }, [reciterId, refreshStats]);

  // ── Rows ────────────────────────────────────────────────────────────

  const renderSurah = useCallback(
    ({ item }: { item: SurahIndex }) => {
      const isActive = status.active?.surah === item.number;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.romanized}
          onPress={() => onSurah(item.number)}
          style={({ pressed }) => [
            styles.surahRow,
            {
              backgroundColor: isActive ? palette.accentBg : palette.card,
              borderColor: palette.border ?? palette.muted,
            },
            pressed && styles.pressed,
          ]}>
          <Text
            style={[
              styles.surahNumber,
              { color: isActive ? palette.accentSolid : palette.muted },
            ]}>
            {item.number}
          </Text>
          <View style={styles.surahNames}>
            <Text
              numberOfLines={1}
              style={[
                styles.surahRoman,
                { color: isActive ? palette.accentSolid : palette.text },
              ]}>
              {item.romanized}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.surahMeta, { color: palette.muted }]}>
              {t('quran.listenSurahMeta', {
                defaultValue: '{{count}} ayahs',
                count: item.ayahCount,
              })}
            </Text>
          </View>
          <Text style={[styles.surahArabic, { color: palette.text }]}>
            {item.arabic}
          </Text>
        </Pressable>
      );
    },
    [onSurah, palette, status.active?.surah, t],
  );

  const header = (
    <View style={styles.headerWrap}>
      {/* ── Now playing ───────────────────────────────────────────── */}
      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, borderColor: palette.border ?? palette.muted },
        ]}>
        <Text style={[styles.nowLabel, { color: palette.muted }]}>
          {isListening()
            ? t('quran.listenContinuous', { defaultValue: 'Playing through' })
            : t('quran.listenNowPlaying', { defaultValue: 'Now playing' })}
        </Text>
        <Text style={[styles.nowSurah, { color: palette.text }]} numberOfLines={1}>
          {activeSurah
            ? activeSurah.romanized
            : t('quran.listenIdle', { defaultValue: 'Nothing playing' })}
        </Text>
        {activeSurah && status.active ? (
          <Text style={[styles.nowAyah, { color: palette.muted }]}>
            {`${activeSurah.arabic} · ${status.active.surah}:${status.active.ayah}`}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.reciterRow, pressed && styles.pressed]}>
          <Text style={[styles.reciterLabel, { color: palette.muted }]}>
            {t('quran.listenReciter', { defaultValue: 'Reciter' })}
          </Text>
          <Text
            style={[styles.reciterName, { color: palette.accentSolid }]}
            numberOfLines={1}>
            {reciter.name}
          </Text>
        </Pressable>

        <Scrubber
          position={progress.position}
          duration={progress.duration}
          onSeek={s => void seekTo(s)}
          palette={palette}
          label={t('quran.listenSeek', { defaultValue: 'Seek within the ayah' })}
        />

        <View style={styles.transport}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.listenPrevious', {
              defaultValue: 'Previous ayah',
            })}
            hitSlop={12}
            onPress={() => void skipToPreviousAyah()}
            style={({ pressed }) => [styles.transportBtn, pressed && styles.pressed]}>
            <TransportIcon kind="prev" color={palette.text} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              status.playing
                ? t('common.pause', { defaultValue: 'Pause' })
                : t('common.play', { defaultValue: 'Play' })
            }
            onPress={togglePlay}
            style={({ pressed }) => [
              styles.playBtn,
              { backgroundColor: palette.accentSolid },
              pressed && styles.pressed,
            ]}>
            {status.loading ? (
              <ActivityIndicator size="small" color={palette.onAccent} />
            ) : (
              <TransportIcon
                kind={status.playing ? 'pause' : 'play'}
                color={palette.onAccent}
                size={28}
              />
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.listenNext', {
              defaultValue: 'Next ayah',
            })}
            hitSlop={12}
            onPress={() => void skipToNextAyah()}
            style={({ pressed }) => [styles.transportBtn, pressed && styles.pressed]}>
            <TransportIcon kind="next" color={palette.text} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.stop', { defaultValue: 'Stop' })}
            hitSlop={12}
            onPress={() => void stopPlayback()}
            style={({ pressed }) => [styles.transportBtn, pressed && styles.pressed]}>
            <TransportIcon kind="stop" color={palette.muted} size={20} />
          </Pressable>
        </View>

        {/* Speed */}
        <Text style={[styles.groupLabel, { color: palette.muted }]}>
          {t('quran.listenSpeed', { defaultValue: 'Speed' })}
        </Text>
        <View style={styles.chipRow}>
          {RATES.map(rate => {
            const on = Math.abs(quran.prefs.playbackRate - rate) < 0.01;
            return (
              <Pressable
                key={rate}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${rate}×`}
                onPress={() => setRate(rate)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? palette.accentBg : palette.controlBg,
                    borderColor: on ? palette.accentSolid : 'transparent',
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: on ? palette.accentSolid : palette.text },
                  ]}>
                  {`${rate}×`}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Sleep timer */}
        <Text style={[styles.groupLabel, { color: palette.muted }]}>
          {t('quran.listenSleep', { defaultValue: 'Sleep timer' })}
        </Text>
        <View style={styles.chipRow}>
          {SLEEP_CHOICES.map(choice => {
            const on = sleepMinutes === choice;
            const label =
              choice === 0
                ? t('quran.listenSleepOff', { defaultValue: 'Off' })
                : choice === SLEEP_END_OF_SURAH
                  ? t('quran.listenSleepSurah', {
                      defaultValue: 'End of surah',
                    })
                  : t('quran.listenSleepMinutes', {
                      defaultValue: '{{count}} min',
                      count: choice,
                    });
            return (
              <Pressable
                key={choice}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={label}
                onPress={() => chooseSleep(choice)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? palette.accentBg : palette.controlBg,
                    borderColor: on ? palette.accentSolid : 'transparent',
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: on ? palette.accentSolid : palette.text },
                  ]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {sleepEndsAt != null ? (
          <Text style={[styles.hint, { color: palette.muted }]}>
            {t('quran.listenSleepArmed', {
              defaultValue: 'Pauses in about {{count}} min',
              count: Math.max(
                1,
                Math.round((sleepEndsAt - Date.now()) / 60_000),
              ),
            })}
          </Text>
        ) : null}
      </View>

      {/* ── Offline ───────────────────────────────────────────────── */}
      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, borderColor: palette.border ?? palette.muted },
        ]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          {t('quran.listenDownloadTitle', {
            defaultValue: 'Keep {{name}} on this device',
            name: reciter.name,
          })}
        </Text>
        <Text style={[styles.cardBody, { color: palette.muted }]}>
          {t('quran.listenDownloadBody', {
            defaultValue:
              'The whole Quran in this voice, about {{size}}. The reader plays the same files, so this works there too.',
            size: formatBytes(estimatedReciterBytes(reciterId)),
          })}
        </Text>

        {runningThis ? (
          <>
            <View
              style={[styles.progressTrack, { backgroundColor: palette.accentBg }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: palette.accentSolid,
                    width: `${
                      download.progress.total > 0
                        ? Math.round(
                            (download.progress.done / download.progress.total) *
                              100,
                          )
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.hint, { color: palette.muted }]}>
              {t('quran.downloadProgressAyahs', {
                done: download.progress.done,
                total: download.progress.total,
              })}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => cancelQuranDownload()}
              style={({ pressed }) => [
                styles.action,
                { borderColor: palette.border ?? palette.muted },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.actionText, { color: palette.text }]}>
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.hint, { color: palette.muted }]}>
              {complete
                ? t('quran.listenDownloadComplete', {
                    defaultValue: 'Complete · {{size}}',
                    size: formatBytes(stats?.bytes ?? 0),
                  })
                : t('quran.listenDownloadPartial', {
                    defaultValue:
                      '{{done}} of {{total}} ayahs here · {{size}}',
                    done: onDisk,
                    total,
                    size: formatBytes(stats?.bytes ?? 0),
                  })}
            </Text>
            <View style={styles.actionRow}>
              {complete ? null : (
                <Pressable
                  accessibilityRole="button"
                  disabled={runningOther}
                  onPress={startDownload}
                  style={({ pressed }) => [
                    styles.action,
                    {
                      backgroundColor: runningOther
                        ? palette.controlBg
                        : palette.accentBg,
                      borderColor: runningOther
                        ? 'transparent'
                        : palette.accentSolid,
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.actionText,
                      {
                        color: runningOther ? palette.muted : palette.accentSolid,
                      },
                    ]}>
                    {onDisk > 0
                      ? t('quran.listenDownloadResume', {
                          defaultValue: 'Continue downloading',
                        })
                      : t('quran.listenDownloadStart', {
                          defaultValue: 'Download',
                        })}
                  </Text>
                </Pressable>
              )}
              {onDisk > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={removeDownload}
                  style={({ pressed }) => [
                    styles.action,
                    { borderColor: palette.border ?? palette.muted },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.actionText, { color: palette.text }]}>
                    {t('common.delete', { defaultValue: 'Delete' })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {runningOther ? (
              <Text style={[styles.hint, { color: palette.muted }]}>
                {t('quran.listenDownloadBusy', {
                  defaultValue:
                    'Something else is downloading. One at a time, so neither is halved.',
                })}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <Text style={[styles.listLabel, { color: palette.muted }]}>
        {t('quran.listenPickSurah', { defaultValue: 'Start from' })}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <FlatList<SurahIndex>
        data={SURAHS}
        keyExtractor={s => String(s.number)}
        renderItem={renderSurah}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        initialNumToRender={10}
        windowSize={7}
      />
      <ReciterPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 8 },
  headerWrap: { gap: 12, marginBottom: 8 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 6,
  },
  nowLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  nowSurah: { fontSize: 24, fontWeight: '700' },
  nowAyah: { fontSize: 13 },
  reciterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  reciterLabel: { fontSize: 13 },
  reciterName: { fontSize: 15, fontWeight: '600', flexShrink: 1, marginStart: 12 },

  scrubWrap: { marginTop: 4 },
  // A thin track needs a tall touch target; the bar is 4pt, the finger is not.
  scrubTouch: { height: 28, justifyContent: 'center' },
  scrubTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  scrubFill: { height: 4 },
  scrubThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginStart: -6,
  },
  scrubTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  scrubTime: { fontSize: 11, fontVariant: ['tabular-nums'] },

  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  transportBtn: { padding: 8 },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mirrored: { transform: [{ scaleX: -1 }] },
  bar: { width: 5, borderRadius: 1.5 },

  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontWeight: '600' },

  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 12, marginTop: 6 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: { height: 6 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  actionText: { fontSize: 14, fontWeight: '600' },

  listLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 6,
  },
  surahRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  surahNumber: {
    fontSize: 13,
    fontWeight: '700',
    minWidth: 28,
    fontVariant: ['tabular-nums'],
  },
  surahNames: { flex: 1 },
  surahRoman: { fontSize: 15, fontWeight: '600' },
  surahMeta: { fontSize: 12, marginTop: 1 },
  surahArabic: { fontSize: 17 },
  pressed: { opacity: 0.6 },
});
