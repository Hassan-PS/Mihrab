/**
 * Headless playback service — registered in index.js via
 * `TrackPlayer.registerPlaybackService`. Handles lock-screen /
 * notification remote events, and implements the memorization
 * pause-between-repeats (QR-19): when a track finishes naturally and
 * `prefs.repeat.pauseFactor > 0`, playback pauses for
 * `duration × factor` before the next repeat starts — the classic
 * "recite it back in the gap" hifz drill.
 */
import TrackPlayer, { Event } from 'react-native-track-player';
import { getQuranState, hydrateQuranState } from '../quranState';
import { listenNextSurah, listenPreviousSurah } from './playback';

export async function PlaybackService(): Promise<void> {
  let pauseTimer: ReturnType<typeof setTimeout> | null = null;

  const clearPauseTimer = () => {
    if (pauseTimer != null) {
      clearTimeout(pauseTimer);
      pauseTimer = null;
    }
  };

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    clearPauseTimer();
    void TrackPlayer.play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    clearPauseTimer();
    void TrackPlayer.pause();
  });
  /**
   * THE REMOTE ARROWS MOVE BY SURAH, like the app's own big ones.
   *
   * A track here is one ayah, so `skipToNext` — which is what these used
   * to call — moved the lock screen, the notification and the Mac's media
   * keys forward by about six seconds. Al-Baqarah is 286 of those. Nobody
   * reaching for the next-track button on a car stereo or a pair of
   * headphones means "advance six seconds"; they mean the next thing, and
   * the next thing in a recitation is the next surah.
   *
   * These are the same two functions the transport in Tilawah calls, on
   * purpose: the arrow on the lock screen and the arrow in the app are
   * one control in two places, and they were not before. Ayah stepping
   * is still there, in the smaller pair of buttons whose size says what
   * they are for — there is no room for a second pair on a lock screen,
   * and this is the one worth having.
   *
   * `listenPreviousSurah` restarts the current surah when you are past
   * its first ayah and only then steps back, which is what every player
   * does with a track and what a hand reaching for "previous" expects.
   */
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    clearPauseTimer();
    void listenNextSurah().catch(() => undefined);
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    clearPauseTimer();
    void listenPreviousSurah().catch(() => undefined);
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    clearPauseTimer();
    void TrackPlayer.reset();
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, e => {
    void TrackPlayer.seekTo(e.position);
  });
  TrackPlayer.addEventListener(Event.RemoteDuck, e => {
    // autoHandleInterruptions covers most cases; this is the fallback.
    if (e.paused) void TrackPlayer.pause();
  });

  // Pause-between-repeats. PlaybackActiveTrackChanged fires with the
  // outgoing track's final position; a natural end has position ≈
  // duration (skips land well short of it).
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async e => {
    clearPauseTimer();
    await hydrateQuranState();
    const factor = getQuranState().prefs.repeat.pauseFactor;
    if (factor <= 0) return;
    const last = e.lastTrack;
    const lastPos = e.lastPosition ?? 0;
    const lastDuration = last?.duration ?? 0;
    const naturalEnd = lastDuration > 0 && lastPos >= lastDuration - 0.4;
    if (!last || !naturalEnd) return;
    const pauseMs = Math.min(30_000, lastDuration * factor * 1000);
    if (pauseMs < 250) return;
    await TrackPlayer.pause();
    pauseTimer = setTimeout(() => {
      pauseTimer = null;
      void TrackPlayer.play();
    }, pauseMs);
  });
}
