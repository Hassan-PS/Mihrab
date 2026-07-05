/**
 * Playback orchestrator — QR-16/17/19 (docs/quran-reader-plan.md).
 *
 * Thin, typed layer over react-native-track-player:
 *
 *   • Builds per-ayah track queues (one EveryAyah MP3 per ayah, local
 *     file when downloaded, streaming URL otherwise).
 *   • Expands memorization repeats into the queue itself (each-ayah ×N,
 *     whole-range ×M) — no fragile mid-playback queue surgery.
 *   • Mirrors the active (surah, ayah) + playing state into a tiny
 *     external store so UI components subscribe without touching the
 *     player library directly (`usePlaybackStatus`).
 *
 * The player is set up lazily on first play — never at app startup.
 */
import { useSyncExternalStore } from 'react';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
  type Track,
} from 'react-native-track-player';
import { findSurah, SURAHS } from '../quran';
import { getQuranState } from '../quranState';
import { ayahAudioUrl, findReciter } from './reciters';
import { localAudioPathIfAny } from './audioStore';

export type AyahRef = { surah: number; ayah: number };

export type PlaybackStatus = {
  /** Ayah currently loaded (playing or paused). Null when idle. */
  active: AyahRef | null;
  playing: boolean;
  /** Buffering / loading state for spinners. */
  loading: boolean;
  reciterId: string;
};

const IDLE: PlaybackStatus = {
  active: null,
  playing: false,
  loading: false,
  reciterId: 'husary',
};

let status: PlaybackStatus = IDLE;
const listeners = new Set<() => void>();

function setStatus(next: Partial<PlaybackStatus>): void {
  status = { ...status, ...next };
  for (const l of listeners) l();
}

export function getPlaybackStatus(): PlaybackStatus {
  return status;
}

export function usePlaybackStatus(): PlaybackStatus {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getPlaybackStatus,
    getPlaybackStatus,
  );
}

// ── Player bootstrap ─────────────────────────────────────────────────

let setupPromise: Promise<void> | null = null;

async function ensureSetup(): Promise<void> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    try {
      await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
    } catch (e) {
      // "player has already been initialized" — benign on fast reloads.
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('already')) throw e;
    }
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
      ],
      progressUpdateEventInterval: 1,
    });

    // Mirror player state into the status store.
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, e => {
      const ref = e.track ? parseTrackId(String(e.track.id)) : null;
      setStatus({ active: ref });
    });
    TrackPlayer.addEventListener(Event.PlaybackState, e => {
      setStatus({
        playing: e.state === State.Playing,
        loading: e.state === State.Loading || e.state === State.Buffering,
      });
      if (e.state === State.Stopped || e.state === State.None) {
        setStatus({ active: null, playing: false, loading: false });
      }
    });
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      setStatus({ active: null, playing: false, loading: false });
    });
  })();
  return setupPromise;
}

// ── Queue building ───────────────────────────────────────────────────

/** Hard cap so repeat expansion can never build a pathological queue. */
const MAX_QUEUE_TRACKS = 700;

export function trackId(surah: number, ayah: number, index: number): string {
  return `${surah}:${ayah}:${index}`;
}

export function parseTrackId(id: string): AyahRef | null {
  const m = /^(\d+):(\d+):\d+$/.exec(id);
  if (!m) return null;
  return { surah: Number(m[1]), ayah: Number(m[2]) };
}

/** Expand a contiguous ayah range into the ordered play list (no repeats). */
export function expandRange(from: AyahRef, to: AyahRef): AyahRef[] {
  const out: AyahRef[] = [];
  let s = from.surah;
  let a = from.ayah;
  // Guard: inverted ranges play just the starting ayah.
  const end =
    to.surah < from.surah ||
    (to.surah === from.surah && to.ayah < from.ayah)
      ? from
      : to;
  for (;;) {
    out.push({ surah: s, ayah: a });
    if (s === end.surah && a === end.ayah) break;
    const meta = findSurah(s);
    if (!meta) break;
    if (a < meta.ayahCount) {
      a += 1;
    } else if (s < 114) {
      s += 1;
      a = 1;
    } else {
      break;
    }
    if (out.length > 6236) break; // absolute safety
  }
  return out;
}

/**
 * Apply memorization repeats: each ayah ×`eachAyah`, then the whole
 * sequence ×`range`. Trims range repeats first, then ayah repeats, to
 * stay under MAX_QUEUE_TRACKS.
 */
export function applyRepeats(
  refs: AyahRef[],
  eachAyah: number,
  range: number,
): AyahRef[] {
  const each = Math.max(1, Math.min(10, Math.floor(eachAyah)));
  let whole = Math.max(1, Math.min(10, Math.floor(range)));
  let per = each;
  while (refs.length * per * whole > MAX_QUEUE_TRACKS && whole > 1) whole -= 1;
  while (refs.length * per * whole > MAX_QUEUE_TRACKS && per > 1) per -= 1;
  const once: AyahRef[] = [];
  for (const r of refs) {
    for (let i = 0; i < per; i++) once.push(r);
  }
  const out: AyahRef[] = [];
  for (let i = 0; i < whole; i++) out.push(...once);
  return out.slice(0, MAX_QUEUE_TRACKS);
}

async function buildTracks(refs: AyahRef[], reciterId: string): Promise<Track[]> {
  const reciter = findReciter(reciterId);
  // Resolve local paths once per unique ayah.
  const localByKey = new Map<string, string | null>();
  for (const r of refs) {
    const key = `${r.surah}:${r.ayah}`;
    if (!localByKey.has(key)) {
      localByKey.set(
        key,
        await localAudioPathIfAny(reciterId, r.surah, r.ayah),
      );
    }
  }
  return refs.map((r, i) => {
    const local = localByKey.get(`${r.surah}:${r.ayah}`);
    const meta = findSurah(r.surah);
    return {
      id: trackId(r.surah, r.ayah, i),
      url: local ? `file://${local}` : ayahAudioUrl(reciter, r.surah, r.ayah),
      title: `${meta?.romanized ?? 'Surah'} ${r.surah}:${r.ayah}`,
      artist: reciter.name,
    };
  });
}

// ── Public controls ──────────────────────────────────────────────────

/**
 * Play from an ayah to the end of its surah (the standard "play from
 * here" listening flow). Repeat settings apply only via `playRange`.
 */
export async function playFromAyah(surah: number, ayah: number): Promise<void> {
  const meta = findSurah(surah);
  if (!meta) return;
  await playRange(
    { surah, ayah },
    { surah, ayah: meta.ayahCount },
    { useRepeats: false },
  );
}

/** Play an explicit range with (optionally) the memorization repeats. */
export async function playRange(
  from: AyahRef,
  to: AyahRef,
  opts: { useRepeats?: boolean } = {},
): Promise<void> {
  await ensureSetup();
  const prefs = getQuranState().prefs;
  setStatus({ reciterId: prefs.reciterId, loading: true });
  let refs = expandRange(from, to);
  if (opts.useRepeats !== false) {
    refs = applyRepeats(refs, prefs.repeat.eachAyah, prefs.repeat.range);
  }
  const tracks = await buildTracks(refs, prefs.reciterId);
  await TrackPlayer.reset();
  await TrackPlayer.add(tracks);
  await TrackPlayer.setRate(prefs.playbackRate);
  await TrackPlayer.play();
  setStatus({ active: from, playing: true });
}

export async function pausePlayback(): Promise<void> {
  await ensureSetup();
  await TrackPlayer.pause();
}

export async function resumePlayback(): Promise<void> {
  await ensureSetup();
  await TrackPlayer.play();
}

export async function stopPlayback(): Promise<void> {
  if (!setupPromise) return; // never started — nothing to stop
  await TrackPlayer.reset();
  setStatus({ active: null, playing: false, loading: false });
}

export async function skipToNextAyah(): Promise<void> {
  await ensureSetup();
  await TrackPlayer.skipToNext().catch(() => undefined /* end of queue */);
}

export async function skipToPreviousAyah(): Promise<void> {
  await ensureSetup();
  await TrackPlayer.skipToPrevious().catch(() => undefined);
}

export async function setPlaybackRate(rate: number): Promise<void> {
  await ensureSetup();
  await TrackPlayer.setRate(rate);
}

/** Ordered list of surahs — re-exported for pickers. */
export { SURAHS };
