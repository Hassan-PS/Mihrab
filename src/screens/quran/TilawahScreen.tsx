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
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProgress } from 'react-native-track-player';
import { useKeepAwake } from '../../quran/keepAwakeLock';
import Svg, { Path } from 'react-native-svg';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useAndroidSubScreenBack } from '../../navigation/useAndroidSubScreenBack';
import type { RootStackParamList } from '../../navigation/types';
import MushafTextPageSurface, {
  mushafLineGeometry,
  mushafPageColumnHeight,
} from '../../quran/MushafTextPageSurface';
import { ActiveWordProbe } from '../../quran/audio/ActiveWordProbe';
import { ayahLineIndex } from '../../quran/mushafFollowScroll';
import { findPageForAyah } from '../../quran/pages';
import { SURAHS, type SurahIndex } from '../../quran/quran';
import {
  isListening,
  listenFrom,
  listenNextSurah,
  listenPreviousSurah,
  setShuffleSurahs,
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

/**
 * How much of the page is on screen at once.
 *
 * ── WHY IT SCROLLS RATHER THAN SHRINKS ────────────────────────────────
 *
 * A muṣḥaf page is fifteen lines, and a fitted page divides whatever
 * height it is handed between them. Handing it a card-sized box was the
 * obvious thing and the wrong one: at 320, then at 430, the lines were
 * still small enough that the harakat stopped resolving and the card
 * became a picture OF a page rather than a page you can follow along in.
 *
 * The reader had already solved this for its own narrow viewport — in
 * landscape it stops fitting the page and gives it a READING ZOOM, then
 * scrolls the column. Same thing here: the type is the size it needs to
 * be, this is simply how much of it fits, and the column follows the
 * recitation the way the reader's does.
 */
/**
 * How much of the page the preview shows: the line being recited, and
 * three more.
 *
 * Not a height in points, because a line's height depends on the page and
 * the width it is drawn at. Four lines is the smallest window that still
 * reads as a muṣḥaf rather than as a ticker — one line is a caption, and
 * a third of a page is the reader, which is one tap away and does it
 * better.
 */
const PREVIEW_LINES = 4;

/**
 * Only until the page has been measured, and for riwayāt with no glyph
 * layout to measure — a Unicode page has no printed lines to count.
 */
const PAGE_VIEWPORT_FALLBACK = 200;

/** How far down the list has to be before the top is worth a shortcut. */
const TO_TOP_AFTER = 700;
/** Movement in one direction before it counts as a direction. */
const SCROLL_HYSTERESIS = 8;

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
 * A bar you can drag, in units of nothing.
 *
 * It takes a ratio and hands one back, because it is used twice for two
 * different things: where you are in the SURAH, and where you are in the
 * ayah being recited. The captions belong to the caller for the same
 * reason — one of them counts ayahs and the other counts seconds.
 *
 * A bare View with a PanResponder rather than a slider dependency, which
 * the app does not carry. While a finger is down the fill follows the
 * FINGER and not the player, or the next progress tick yanks it back to
 * where playback still is and the thumb fights the person holding it.
 */
function Scrubber({
  ratio,
  onSeekRatio,
  palette,
  label,
  minor,
}: {
  ratio: number;
  onSeekRatio: (ratio: number) => void;
  palette: ReturnType<typeof useAppPalette>['palette'];
  label: string;
  /** The ayah bar is thinner: it is the second thing you look at. */
  minor?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const widthRef = useRef(0);
  widthRef.current = width;

  const ratioAt = useCallback((x: number) => {
    const w = widthRef.current;
    if (w <= 0) return 0;
    return Math.max(0, Math.min(1, x / w));
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => setDragging(ratioAt(e.nativeEvent.locationX)),
        onPanResponderMove: e => setDragging(ratioAt(e.nativeEvent.locationX)),
        onPanResponderRelease: e => {
          const at = ratioAt(e.nativeEvent.locationX);
          setDragging(null);
          onSeekRatio(at);
        },
        onPanResponderTerminate: () => setDragging(null),
      }),
    [onSeekRatio, ratioAt],
  );

  const shown = dragging ?? Math.max(0, Math.min(1, ratio));

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      style={minor ? styles.scrubTouchMinor : styles.scrubTouch}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}>
      {/* The EMPTY track is neutral, not a dimmer accent. Both were greens
          before, and at three to five pixels a dark-green track and a
          bright-green fill are two green lines: an untouched bar read as a
          finished one. */}
      <View
        style={[
          minor ? styles.scrubTrackMinor : styles.scrubTrack,
          { backgroundColor: palette.controlBg },
        ]}>
        <View
          style={[
            minor ? styles.scrubTrackMinor : styles.scrubTrack,
            { width: `${shown * 100}%`, backgroundColor: palette.accentSolid },
          ]}
        />
      </View>
      {minor ? null : (
        <View
          style={[
            styles.scrubThumb,
            { left: `${shown * 100}%`, backgroundColor: palette.accentSolid },
          ]}
        />
      )}
    </View>
  );
}

/**
 * Two arrows crossing. The one glyph here that Views cannot draw, so it
 * is the one that gets an SVG — and therefore a resolved hex, since
 * react-native-svg renders nothing at all when handed a PlatformColor.
 */
function ShuffleIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 6h3.5l4 6M3 18h3.5l4-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.5 6H21M14.5 18H21"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M18.5 3.5 21 6l-2.5 2.5M18.5 15.5 21 18l-2.5 2.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * A cup, for "do not let the screen go dark".
 *
 * Drawn rather than set as an emoji. An emoji is somebody else's artwork
 * at somebody else's weight: it lands full-colour in a row of thin
 * monochrome strokes, it changes shape per platform and per Android
 * skin, and it cannot take the accent when the toggle is on — so it
 * always looked like a sticker on the control rather than the control.
 */
function CoffeeIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M8 3v2.5M12 3v2.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** An arrow at a ceiling — back to the top of the list. */
function TopArrowIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20V5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M6 11l6-6 6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Lines on a page, for the muṣḥaf preview toggle. */
function PageIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4h14v16H5z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M8 9h8M8 12.5h8M8 16h5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
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
    // `styles.iconCentre`, not `styles.iconRow`. The row had a fixed
    // width and no justification, so two five-point bars packed against
    // its leading edge inside a twenty-eight-point box — which is why the
    // pause sat visibly left of the circle it was in, but only while
    // playing, since the play triangle fills its own box.
    return (
      <View style={[styles.iconCentre, { width: size, height: size }]}>
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
  // A triangle's mass sits behind its point, so a geometrically centred
  // one reads as too far left. The nudge is the standard correction every
  // play button carries.
  if (kind === 'play') {
    return <View style={{ marginStart: size * 0.12 }}>{triangle}</View>;
  }
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

export function TilawahScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useAndroidSubScreenBack();
  const status = usePlaybackStatus();
  /**
   * The position poller, throttled to almost nothing while this page is
   * under another one.
   *
   * `useProgress` is a timeout loop against the native player for as
   * long as it is mounted, and this page stays mounted when it opens the
   * reader — so it was polling at 400ms, and re-rendering its whole
   * header tree on every tick, behind a screen that has its own poller
   * for the same number. The interval is a dependency of the loop, so
   * changing it restarts the loop at the new pace.
   */
  const focused = useIsFocused();
  const progress = useProgress(focused ? 400 : 60_000);
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

  /**
   * What the card is ABOUT — which is not the same as what is playing.
   *
   * Idle, it is about what pressing play would start, and it says so.
   * "Nothing playing" told the reader what the silence had already told
   * them, and left the biggest text on the screen doing no work; where
   * they left off reading is an answer to a question they might actually
   * have.
   */
  const idle = status.active == null;
  const resume = quran.lastRead;
  const shownSurah =
    SURAHS.find(
      s => s.number === (status.active?.surah ?? resume?.surah ?? 1),
    ) ?? SURAHS[0];
  const shownAyah = status.active?.ayah ?? resume?.ayah ?? 1;

  const togglePlay = useCallback(() => {
    if (status.playing) {
      void pausePlayback();
      return;
    }
    if (status.active) {
      void resumePlayback();
      return;
    }
    // Start where the card said it would. Someone who has been reading
    // gets picked up there; someone who has not gets the opening.
    void listenFrom(shownSurah.number, resume?.ayah ?? 1);
  }, [resume?.ayah, shownSurah.number, status.active, status.playing]);

  // ── Two progressions, one inside the other ──────────────────────────
  //
  // The surah is what a listener is actually in the middle of: an ayah is
  // six seconds and a surah is an hour, and a bar that fills and empties
  // every six seconds tells you nothing about either. So the surah leads
  // and the ayah sits under it, thinner, for the person who wants to
  // scrub back over the line just recited.
  //
  // The surah's own bar is measured in AYAHS, not seconds — nothing knows
  // how long a surah runs until it has been played — refined by how far
  // into the current ayah we are, so it advances smoothly rather than in
  // steps.
  const ayahRatio =
    progress.duration > 0 ? progress.position / progress.duration : 0;
  const surahRatio = idle
    ? 0
    : Math.max(
        0,
        Math.min(1, (shownAyah - 1 + ayahRatio) / shownSurah.ayahCount),
      );

  const seekSurah = useCallback(
    (ratio: number) => {
      // Dragging the surah bar moves to an AYAH, and moving to an ayah
      // means rebuilding the queue from there — which is exactly what
      // starting a listen does.
      const target = Math.max(
        1,
        Math.min(
          shownSurah.ayahCount,
          Math.floor(ratio * shownSurah.ayahCount) + 1,
        ),
      );
      void listenFrom(shownSurah.number, target);
    },
    [shownSurah],
  );

  /**
   * Shuffle is a preference, and the player is where it takes effect.
   *
   * The pref is the record; the playback module holds the live flag,
   * because the queue's own step function is what consults it and that
   * runs long after this screen is gone. Pushed on mount too — a listen
   * resumed from the notification after a restart has to shuffle if that
   * is what the user last chose.
   */
  const shuffleOn = quran.prefs.shuffleSurahs;
  useEffect(() => {
    setShuffleSurahs(shuffleOn);
  }, [shuffleOn]);
  const toggleShuffle = useCallback(() => {
    setQuranPrefs({ shuffleSurahs: !shuffleOn });
  }, [shuffleOn]);

  /**
   * The coffee toggle: don't let the screen go dark while I listen.
   *
   * It shares `keepAwake` with the reader rather than adding a second
   * flag, because it is one question — "keep the screen on while I am in
   * the Qur'an" — and the reader's copy had no visible control anywhere.
   * This gives the preference a home you can see.
   *
   * Released on unmount whatever the preference says: a lock held by a
   * screen that is gone is a flat battery nobody can explain.
   */
  const keepAwake = quran.prefs.keepAwake;
  // Through the counted lock, not the library: the reader holds the same
  // lock, and the two are mounted together whenever this page opens it.
  useKeepAwake(keepAwake);
  const toggleKeepAwake = useCallback(() => {
    setQuranPrefs({ keepAwake: !keepAwake });
  }, [keepAwake]);

  /**
   * The page the recitation is on, drawn the way the reader draws it.
   *
   * Same renderer, same layout engine, same fonts — a smaller box. What
   * it does NOT take from the reader is the paper: a muṣḥaf tone is a
   * reading choice made on a full-screen page, and a white plate glued
   * into the middle of a dark app is a hole in the screen. The tone
   * follows the APP here, which is why night and paper are chosen from
   * the palette rather than read from the muṣḥaf preference.
   */
  const showPage = quran.prefs.tilawahShowPage;
  const [pageWidth, setPageWidth] = useState(0);
  const [pageUnavailable, setPageUnavailable] = useState(false);
  const playingPage = useMemo(
    () =>
      status.active
        ? findPageForAyah(
            status.active.surah,
            status.active.ayah,
            quran.prefs.riwayah,
          )
        : null,
    [status.active, quran.prefs.riwayah],
  );
  // A new page deserves a fresh chance: "unavailable" is about one page's
  // font, not about the feature.
  useEffect(() => setPageUnavailable(false), [playingPage]);
  /**
   * The column at reading zoom, and a four-line window onto it.
   *
   * `mushafPageColumnHeight` with `scrolling` is the reader's own answer
   * for a viewport too short to fit a page: size the type for reading and
   * let the column be as tall as it needs. It only uses the viewport it
   * is handed as a floor, so it is asked with one point — the answer is
   * the page's own height, and the window is measured off the geometry
   * that height produces rather than fixed in advance.
   */
  /**
   * The list, and whether the "back to the top" button is showing.
   *
   * `lastOffset` is a ref rather than state: it changes on every scroll
   * frame and nothing draws from it directly — only the crossing of the
   * two thresholds below turns into a render.
   */
  const listRef = useRef<FlatList<SurahIndex>>(null);
  const lastOffset = useRef(0);
  const [showTop, setShowTop] = useState(false);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastOffset.current;
      // A dead band, so a finger resting on the list does not flicker the
      // button in and out on a pixel of drift.
      if (Math.abs(dy) < SCROLL_HYSTERESIS) return;
      lastOffset.current = y;
      // Deep enough that the top is genuinely far away, and heading back
      // towards it. Scrolling down hides it again: on the way down the
      // reader is looking for a surah and the button is in front of the
      // rows they are reading.
      setShowTop(y > TO_TOP_AFTER && dy < 0);
    },
    [],
  );
  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowTop(false);
  }, []);

  const pageScrollRef = useRef<ScrollView>(null);
  const pageColumnH = useMemo(
    () =>
      playingPage && pageWidth > 0
        ? mushafPageColumnHeight({
            page: playingPage,
            riwayah: quran.prefs.riwayah,
            textWidth: pageWidth,
            viewportHeight: 1,
            scrolling: true,
          })
        : PAGE_VIEWPORT_FALLBACK,
    [playingPage, pageWidth, quran.prefs.riwayah],
  );
  const lineGeometry = useMemo(
    () =>
      playingPage && pageWidth > 0
        ? mushafLineGeometry({
            page: playingPage,
            textWidth: pageWidth,
            columnHeight: pageColumnH,
          })
        : null,
    [playingPage, pageWidth, pageColumnH],
  );
  const pageViewportH = lineGeometry
    ? Math.round(lineGeometry.top + lineGeometry.pitch * PREVIEW_LINES)
    : PAGE_VIEWPORT_FALLBACK;

  /**
   * The recited line goes to the TOP of the window, so the three under it
   * are the ones coming next. The clamp is what handles the foot of the
   * page: with fewer than three lines left the window stops moving and
   * the recited line arrives at the bottom of it with its predecessors
   * above — the only honest thing four lines can show there.
   */
  useEffect(() => {
    if (!showPage || !playingPage || !status.active || pageWidth <= 0) return;
    if (!lineGeometry) return;
    const index = ayahLineIndex(
      playingPage,
      status.active.surah,
      status.active.ayah,
    );
    if (index == null) return;
    const y = lineGeometry.top + index * lineGeometry.pitch;
    pageScrollRef.current?.scrollTo({
      y: Math.max(0, Math.min(y, Math.max(0, pageColumnH - pageViewportH))),
      animated: true,
    });
  }, [
    showPage,
    playingPage,
    pageWidth,
    pageColumnH,
    pageViewportH,
    lineGeometry,
    status.active,
  ]);

  const openInReader = useCallback(() => {
    if (!status.active) return;
    navigation.navigate('QuranSurah', {
      surahNumber: status.active.surah,
      initialPage: playingPage ?? undefined,
      scrollToAyah: status.active.ayah,
    });
  }, [navigation, playingPage, status.active]);

  const seekAyah = useCallback(
    (ratio: number) => {
      if (progress.duration > 0) void seekTo(ratio * progress.duration);
    },
    [progress.duration],
  );

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
      {/* The word, and what it means.

          "Tilawah" is the right name — it names Qur'anic recitation, and
          it belongs to the same vocabulary as Tasbih and Duas in the tab
          bar. But a name that half the audience has to look up is a name
          that fails half the audience, so it never appears without this
          line under it. One sentence, said once, at the top of the page it
          titles. */}
      <Text style={[styles.pageBlurb, { color: palette.muted }]}>
        {t('quran.tilawahBlurb', {
          defaultValue:
            'Recitation of the Quran — it keeps playing with the screen off, and works offline once downloaded.',
        })}
      </Text>

      {/* ── The player ────────────────────────────────────────────── */}
      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, borderColor: palette.border ?? palette.muted },
        ]}>
        <Text style={[styles.nowLabel, { color: palette.muted }]}>
          {idle
            ? resume
              ? t('quran.tilawahContinue', {
                  defaultValue: 'Carry on from your reading',
                })
              : t('quran.tilawahBegin', { defaultValue: 'Begin with' })
            : isListening()
              ? t('quran.listenContinuous', { defaultValue: 'Playing through' })
              : t('quran.listenNowPlaying', { defaultValue: 'Now playing' })}
        </Text>
        <Text style={[styles.nowSurah, { color: palette.text }]} numberOfLines={1}>
          {shownSurah.romanized}
        </Text>
        <Text style={[styles.nowAyah, { color: palette.muted }]}>
          {idle
            ? `${shownSurah.arabic} · ${shownSurah.english}`
            : `${shownSurah.arabic} · ${shownSurah.number}:${shownAyah}`}
        </Text>

        {/* The reciter is a CHOICE, and has to look like one.

            It used to be a label and a coloured name on a bare row — which
            reads as a statistic about the app rather than a control, and
            nobody taps a statistic. It is a filled row with a chevron now,
            the same shape as every other "opens a picker" row in the app. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.listenReciter', {
            defaultValue: 'Reciter',
          })}
          accessibilityHint={reciter.name}
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [
            styles.reciterRow,
            { backgroundColor: palette.controlBg },
            pressed && styles.pressed,
          ]}>
          <View style={styles.reciterText}>
            <Text style={[styles.reciterLabel, { color: palette.muted }]}>
              {t('quran.listenReciter', { defaultValue: 'Reciter' })}
            </Text>
            <Text
              style={[styles.reciterName, { color: palette.text }]}
              numberOfLines={1}>
              {reciter.name}
            </Text>
          </View>
          <Text style={[styles.reciterChevron, { color: palette.accentSolid }]}>
            ›
          </Text>
        </Pressable>

        {/* Where you are in the SURAH — the thing you are in the middle of. */}
        <Scrubber
          ratio={surahRatio}
          onSeekRatio={seekSurah}
          palette={palette}
          label={t('quran.tilawahSurahSeek', {
            defaultValue: 'Move through the surah',
          })}
        />
        <Text style={[styles.scrubCaption, { color: palette.muted }]}>
          {idle
            ? t('quran.listenSurahMeta', {
                defaultValue: '{{count}} ayahs',
                count: shownSurah.ayahCount,
              })
            : t('quran.tilawahAyahOf', {
                defaultValue: 'Ayah {{done}} of {{total}}',
                done: shownAyah,
                total: shownSurah.ayahCount,
              })}
        </Text>

        {/* And where you are in the ayah, for scrubbing back over a line. */}
        <Scrubber
          minor
          ratio={ayahRatio}
          onSeekRatio={seekAyah}
          palette={palette}
          label={t('quran.listenSeek', { defaultValue: 'Seek within the ayah' })}
        />
        <View style={styles.scrubTimes}>
          <Text style={[styles.scrubTime, { color: palette.muted }]}>
            {formatClock(progress.position)}
          </Text>
          <Text style={[styles.scrubTime, { color: palette.muted }]}>
            {formatClock(progress.duration)}
          </Text>
        </View>

        {/* THE BIG ARROWS MOVE BY SURAH.

            They moved by ayah, which meant a "next" you had to press two
            hundred and eighty-five times to leave Al-Baqarah. An ayah is
            six seconds; the thing someone reaches for while a recitation
            plays is the next surah. Ayah stepping did not go away — it
            went to its own smaller pair below, where its size says what
            it is for. */}
        <View style={styles.transport}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: shuffleOn }}
            accessibilityLabel={t('quran.tilawahShuffle', {
              defaultValue: 'Shuffle surahs',
            })}
            hitSlop={12}
            onPress={toggleShuffle}
            style={({ pressed }) => [
              styles.transportBtn,
              pressed && styles.pressed,
            ]}>
            <ShuffleIcon
              color={
                shuffleOn
                  ? String(palette.accentSolid)
                  : String(palette.mutedSolid)
              }
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.tilawahPrevSurah', {
              defaultValue: 'Previous surah',
            })}
            hitSlop={12}
            onPress={() => void listenPreviousSurah()}
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
            accessibilityLabel={t('quran.tilawahNextSurah', {
              defaultValue: 'Next surah',
            })}
            hitSlop={12}
            onPress={() => void listenNextSurah()}
            style={({ pressed }) => [styles.transportBtn, pressed && styles.pressed]}>
            <TransportIcon kind="next" color={palette.text} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.stop', { defaultValue: 'Stop' })}
            hitSlop={12}
            onPress={() => void stopPlayback()}
            style={({ pressed }) => [styles.transportBtn, pressed && styles.pressed]}>
            <TransportIcon kind="stop" color={palette.muted} size={18} />
          </Pressable>
        </View>

        {/* And the ayah, for the line you want to hear again. */}
        <View style={styles.ayahStep}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.listenPrevious', {
              defaultValue: 'Previous ayah',
            })}
            onPress={() => void skipToPreviousAyah()}
            style={({ pressed }) => [
              styles.ayahStepBtn,
              { backgroundColor: palette.controlBg },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.ayahStepText, { color: palette.text }]}>
              {`‹  ${t('quran.tilawahAyahWord', { defaultValue: 'Ayah' })}`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.listenNext', {
              defaultValue: 'Next ayah',
            })}
            onPress={() => void skipToNextAyah()}
            style={({ pressed }) => [
              styles.ayahStepBtn,
              { backgroundColor: palette.controlBg },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.ayahStepText, { color: palette.text }]}>
              {`${t('quran.tilawahAyahWord', { defaultValue: 'Ayah' })}  ›`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: showPage }}
            accessibilityLabel={t('quran.tilawahShowPage', {
              defaultValue: 'Show the page',
            })}
            onPress={() => setQuranPrefs({ tilawahShowPage: !showPage })}
            style={({ pressed }) => [
              styles.coffeeBtn,
              {
                backgroundColor: showPage
                  ? palette.accentBg
                  : palette.controlBg,
              },
              pressed && styles.pressed,
            ]}>
            <PageIcon
              color={
                showPage
                  ? String(palette.accentSolid)
                  : String(palette.mutedSolid)
              }
            />
          </Pressable>
          {/* On the secondary row rather than the transport: it is not a
              playback control, it is about the phone. */}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: keepAwake }}
            accessibilityLabel={t('quran.tilawahKeepAwake', {
              defaultValue: 'Keep the screen on',
            })}
            onPress={toggleKeepAwake}
            style={({ pressed }) => [
              styles.coffeeBtn,
              {
                backgroundColor: keepAwake
                  ? palette.accentBg
                  : palette.controlBg,
              },
              pressed && styles.pressed,
            ]}>
            <CoffeeIcon
              color={
                keepAwake
                  ? String(palette.accentSolid)
                  : String(palette.mutedSolid)
              }
            />
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

      {/* ── The page it is on ─────────────────────────────────────── */}
      {showPage && playingPage && !pageUnavailable ? (
        <View
          style={[
            styles.card,
            styles.pageCard,
            { backgroundColor: palette.card, borderColor: palette.border ?? palette.muted },
          ]}
          onLayout={e => setPageWidth(e.nativeEvent.layout.width - 24)}>
          <View style={styles.pageHead}>
            <Text style={[styles.nowLabel, { color: palette.muted }]}>
              {t('quran.pageShort', {
                defaultValue: 'p. {{page}}',
                page: playingPage,
              })}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={openInReader}
              hitSlop={8}
              style={({ pressed }) => [pressed && styles.pressed]}>
              <Text style={[styles.pageOpen, { color: palette.accentSolid }]}>
                {`${t('quran.openInReader', 'Open in the reader')} ›`}
              </Text>
            </Pressable>
          </View>
          {pageWidth > 0 ? (
            <ScrollView
              ref={pageScrollRef}
              style={{ height: pageViewportH }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled>
              <MushafTextPageSurface
                page={playingPage}
                width={pageWidth}
                height={pageColumnH}
                riwayah={quran.prefs.riwayah}
                // The APP's tone, not the mushaf's — see the note above.
                tone={palette.isDark ? 'night' : 'paper'}
                accentColor={String(palette.accentSolid)}
                playing={status.active}
                // The reader keeps its neighbours mounted, so their fonts
                // load as pages do. This preview mounts ONE page, so
                // without this every page turn in the recitation was a
                // spinner while the next page's font was fetched — the
                // reciter had moved on and the preview had not.
                prefetchRadius={1}
                onUnavailable={() => setPageUnavailable(true)}
              />
            </ScrollView>
          ) : null}
        </View>
      ) : null}

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
        ref={listRef}
        data={SURAHS}
        keyExtractor={s => String(s.number)}
        renderItem={renderSurah}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        initialNumToRender={10}
        windowSize={7}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
      {/* Back to the player.
          
          The page is the transport and then a hundred and fourteen rows
          under it, so someone who has scrolled down to find a surah is a
          long way from the controls they started at. The button appears
          when they turn round and head back — going DOWN they are looking
          for something and it would be in the way; going up they have
          already decided where they are going, and this is the short way
          there. */}
      {showTop ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.backToTop', 'Back to the top')}
          onPress={scrollToTop}
          style={({ pressed }) => [
            styles.toTop,
            {
              // The accent tint, not the card colour: the rows under it
              // ARE the card colour, so a card-coloured circle floating
              // over them read as part of whichever row it landed on.
              backgroundColor: palette.accentBg,
              borderColor: palette.accentSolid,
            },
            pressed && styles.pressed,
          ]}>
          <TopArrowIcon color={String(palette.accentSolid)} />
        </Pressable>
      ) : null}
      {/* Publishes the recited word so the preview's lines can light it —
          the same probe the reader mounts. Without it the page shows the
          ayah's wash and nothing inside it moves, which is exactly what
          "the highlight does not work here" looked like. */}
      {showPage && focused && status.active && status.playing ? (
        <ActiveWordProbe />
      ) : null}
      <ReciterPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toTop: {
    position: 'absolute',
    end: 18,
    bottom: 24,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Enough to read as floating over the list rather than as a row in it.
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  root: { flex: 1 },
  list: { padding: 16, gap: 8 },
  headerWrap: { gap: 12, marginBottom: 8 },
  pageBlurb: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 6,
  },
  nowLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  nowSurah: { fontSize: 24, fontWeight: '700' },
  nowAyah: { fontSize: 13 },
  // A filled row with a chevron: the shape every other picker in the app
  // uses, so this one reads as a control rather than a readout.
  reciterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  reciterText: { flex: 1 },
  reciterLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  reciterName: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  reciterChevron: { fontSize: 22, fontWeight: '700' },

  // A thin track needs a tall touch target; the bar is 4pt, the finger is not.
  scrubTouch: { height: 28, justifyContent: 'center' },
  scrubTrack: { height: 5, borderRadius: 2.5, overflow: 'hidden' },
  // The ayah's bar is the second thing you look at, and says so.
  scrubTouchMinor: { height: 18, justifyContent: 'center' },
  scrubTrackMinor: { height: 3, borderRadius: 1.5, overflow: 'hidden' },
  scrubThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginStart: -6,
  },
  scrubCaption: { fontSize: 12, fontWeight: '600', marginTop: -2 },
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
  // Same row, justified. See the pause branch of TransportIcon.
  iconCentre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  ayahStep: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 2,
    marginBottom: 2,
  },
  ayahStepBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    minWidth: 92,
    alignItems: 'center',
  },
  ayahStepText: { fontSize: 13, fontWeight: '600' },
  coffeeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageCard: { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  pageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageOpen: { fontSize: 13, fontWeight: '700' },
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
