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
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    clearPauseTimer();
    void TrackPlayer.skipToNext().catch(() => undefined);
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    clearPauseTimer();
    void TrackPlayer.skipToPrevious().catch(() => undefined);
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
