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
import { localAudioPathIfAny, prefetchAyahAudio } from './audioStore';
import { setNowPlayingState } from '../../native/NowPlayingState';

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
  /**
   * Tell the OS what the OS cannot work out for itself.
   *
   * On macOS — and a Mac Catalyst build is macOS here —
   * `MPNowPlayingInfoCenter.playbackState` is required before Control
   * Center will show anything at all, and track-player's iOS half never
   * sets it. This is the one funnel every state change passes through, so
   * publishing from here is the only way the system's answer cannot drift
   * from the app's. No-op on Android, where the media session carries the
   * state already. See src/native/NowPlayingState.ts.
   */
  setNowPlayingState(
    status.active == null ? 'stopped' : status.playing ? 'playing' : 'paused',
  );
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

/**
 * The player's options, applied more than once ON PURPOSE.
 *
 * `capabilities` is what the lock screen, the notification and a pair of
 * headphones are allowed to ask for, and on iOS the library only binds it
 * to `MPRemoteCommandCenter` when there is a CURRENT ITEM to bind it for:
 *
 *     public var remoteCommands: [RemoteCommand] = [] {
 *         didSet { if let item = currentItem { enableRemoteCommands(...) } }
 *     }
 *
 * Setup runs before anything is queued, so that `didSet` fired against an
 * empty player and bound nothing. Applying them again once a track is
 * actually loaded is what makes the command centre real — which is the
 * difference between a lock-screen card with transport buttons and the
 * one this app was drawing: artwork, title, a scrubber, and no way to
 * pause it without unlocking the phone and opening the app.
 *
 * Cheap to repeat and idempotent: the library diffs the set and only
 * touches the commands whose enabled-ness changed.
 */
async function applyPlayerOptions(): Promise<void> {
  await TrackPlayer.updateOptions({
    android: {
      /**
       * Swiping the app away does NOT stop the recitation.
       *
       * It used to, which was defensible while the only way to start
       * audio was "play from here" inside the reader — you were looking
       * at the page, and closing the app meant you were done. It stopped
       * being defensible the moment there was a listening page: someone
       * puts a surah on, locks the phone, clears their recents an hour
       * later out of habit, and the recitation dies mid-ayah. No music
       * player behaves that way, and the notification's own controls are
       * what the person would reach for instead.
       */
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
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
}

/** Whether the command centre has been bound against a real track. */
let optionsBound = false;

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
    await applyPlayerOptions();

    // Mirror player state into the status store.
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, e => {
      const ref = e.track ? parseTrackId(String(e.track.id)) : null;
      setStatus({ active: ref });
      // The first track the player ever loads is the moment iOS will
      // accept the remote commands — see applyPlayerOptions. Once only:
      // after that the binding survives every later track by itself.
      if (ref && !optionsBound) {
        optionsBound = true;
        void applyPlayerOptions().catch(() => {
          optionsBound = false;
        });
      }
      // ONE look at the queue per ayah, shared by both of the jobs below.
      //
      // `getQueue()` hands the whole queue across the bridge — every track,
      // with its url, title, artist and artwork — and a listening queue is
      // up to seven hundred of them. Each job used to fetch its own copy,
      // and the prefetch fetched a third per file it finished, so a long
      // session was serialising a few hundred kilobytes of queue every six
      // seconds to answer "what is next" and "how much is left".
      void snapshotQueue().then(snap => {
        if (!snap) return;
        // Gapless: warm the next few ayahs onto disk (v2.7.28).
        void prefetchUpcoming(snap);
        // Listening: keep a couple of hundred ayahs queued ahead of here,
        // so one surah runs into the next without a gap or a decision.
        void extendListening(snap);
      });
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

// ── Gapless prefetch (v2.7.28) ───────────────────────────────────────
//
// On every track change, warm the next few ayahs onto disk and swap
// their queue entries from remote URL → local file. Entries closer
// than +2 are never touched (ExoPlayer may already be buffering the
// immediate next item; replacing it would cause the very gap we're
// removing). After a short warmup a long session plays entirely from
// disk — no network pause between ayahs.

const PREFETCH_AHEAD = 3;
const inFlightPrefetch = new Set<string>();

/** The queue and where we are in it, as of one moment. */
type QueueSnapshot = { queue: Track[]; idx: number };

async function snapshotQueue(): Promise<QueueSnapshot | null> {
  try {
    const [queue, idx] = await Promise.all([
      TrackPlayer.getQueue(),
      TrackPlayer.getActiveTrackIndex(),
    ]);
    return idx == null ? null : { queue, idx };
  } catch {
    return null;
  }
}

async function prefetchUpcoming({ queue, idx }: QueueSnapshot): Promise<void> {
  try {
    const reciterId = status.reciterId;
    const last = Math.min(idx + PREFETCH_AHEAD, queue.length - 1);
    for (let i = idx + 1; i <= last; i++) {
      const tr = queue[i];
      if (!tr || typeof tr.url !== 'string' || !tr.url.startsWith('http')) {
        continue;
      }
      const ref = parseTrackId(String(tr.id));
      if (!ref) continue;
      const key = `${reciterId}:${ref.surah}:${ref.ayah}`;
      if (inFlightPrefetch.has(key)) continue;
      inFlightPrefetch.add(key);
      void prefetchAyahAudio(reciterId, ref.surah, ref.ayah)
        .then(async path => {
          inFlightPrefetch.delete(key);
          if (!path) return;
          // The swap, by INDEX rather than by scanning a fresh copy of the
          // whole queue. The entry was at `i` when the file was asked for,
          // and nothing moves entries about: a swap is a remove and an add
          // at the same place, a top-up appends, and a rebuild (`listenFrom`)
          // issues ids from a counter that never repeats — so one track
          // fetched by index either IS the entry, or the queue is a
          // different queue and this file waits for its own pass.
          const [idx2, t2] = await Promise.all([
            TrackPlayer.getActiveTrackIndex(),
            TrackPlayer.getTrack(i),
          ]);
          if (idx2 == null || i < idx2 + 2 || !t2) return;
          if (
            t2.id === tr.id &&
            typeof t2.url === 'string' &&
            t2.url.startsWith('http')
          ) {
            await TrackPlayer.remove([i]);
            await TrackPlayer.add({ ...t2, url: `file://${path}` }, i);
          }
        })
        .catch(() => {
          inFlightPrefetch.delete(key);
        });
    }
  } catch {
    /* best effort */
  }
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

/**
 * What the lock screen shows next to the transport.
 *
 * The app's own icon. A media notification with no artwork is a grey
 * rectangle and a line of text, and the phone's own player, the car and
 * the watch all reserve the space whether we fill it or not. There is
 * nothing to picture for a recitation — no cover exists — so the honest
 * thing to put there is the app it is coming from.
 */
const ARTWORK = require('../../../assets/app-icon-rounded.png');

async function buildTracks(
  refs: AyahRef[],
  reciterId: string,
  // Where these tracks start in the queue. Ids have to stay unique across
  // the top-ups a continuous listen appends, or two ayahs share one id and
  // the active-track lookup starts answering with the wrong one.
  indexOffset = 0,
): Promise<Track[]> {
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
      id: trackId(r.surah, r.ayah, indexOffset + i),
      url: local ? `file://${local}` : ayahAudioUrl(reciter, r.surah, r.ayah),
      /**
       * THE SURAH, AND HOW FAR INTO IT — because the bar cannot say so.
       *
       * The system player's progress bar belongs to the TRACK, and a
       * track here is one ayah: six seconds that fill and reset, over and
       * over, saying nothing about the thing being listened to. It is the
       * platform's bar, drawn from the media session's own position and
       * duration, and neither can be overridden on Android — the session
       * reports what the player is actually playing.
       *
       * So the surah's progress goes where this app CAN put it: the
       * title. "Al-Kahf · 5 / 110" answers the question the bar looks
       * like it is answering and is not.
       */
      title: meta
        ? `${meta.romanized} · ${r.ayah} / ${meta.ayahCount}`
        : `${r.surah}:${r.ayah}`,
      artist: reciter.name,
      // The surah on its own, for the surfaces that show an album line.
      album: meta?.romanized ?? undefined,
      artwork: ARTWORK,
    };
  });
}

// ── Listening: past the end of a surah ───────────────────────────────
//
// The reader's flow ends where the surah does: you tapped an ayah, you
// wanted that passage. Listening does not — someone who puts Al-Baqarah on
// expects Āl-ʿImrān after it, the way any album plays into the next.
//
// The whole book is 6,236 tracks and the player is not going to hold that.
// So the queue is a WINDOW that walks forward: a couple of hundred ayahs
// ahead of where you are, topped up as it drains. `listenCursor` is the
// first ayah not yet queued, which is the only state a top-up needs.

/** Ayahs queued ahead while listening. */
const LISTEN_WINDOW = 200;
/** Top the queue up once fewer than this many remain after the active one. */
const LISTEN_REFILL_AT = 60;

let listening = false;
/** The first ayah NOT yet in the queue, or null at the end of the book. */
let listenCursor: AyahRef | null = null;
/** Monotonic, so an appended track can never reuse an id. */
let listenIndex = 0;

/** The ayah after this one, or null at 114:6. */
export function nextAyahRef(ref: AyahRef): AyahRef | null {
  const meta = findSurah(ref.surah);
  if (!meta) return null;
  if (ref.ayah < meta.ayahCount) return { surah: ref.surah, ayah: ref.ayah + 1 };
  if (ref.surah >= 114) return null;
  return { surah: ref.surah + 1, ayah: 1 };
}

/**
 * SHUFFLE IS A SURAH SHUFFLE, AND ONLY EVER COULD BE.
 *
 * Shuffling ayahs would be meaningless — worse than meaningless: the
 * Quran is ordered, an ayah is a sentence in an argument, and playing
 * 2:97 after 78:12 is not a shuffled album, it is noise. So shuffle
 * changes exactly one thing: which surah follows this one. Inside a
 * surah, nothing moves.
 *
 * A bag, not a die. Rolling 1–114 each time replays surahs before it has
 * touched most of them, which people read as broken. Every surah is heard
 * once before any is heard twice, and the bag refills when it empties.
 */
let shuffle = false;
const heard = new Set<number>();

function pickNextSurah(after: number): number {
  heard.add(after);
  if (heard.size >= 114) heard.clear();
  const left: number[] = [];
  for (let n = 1; n <= 114; n++) if (!heard.has(n) && n !== after) left.push(n);
  if (left.length === 0) return after === 114 ? 1 : after + 1;
  return left[Math.floor(Math.random() * left.length)];
}

/** Whether the next surah is the next one, or any other one. */
export function setShuffleSurahs(on: boolean): void {
  shuffle = on;
  if (!on) heard.clear();
}

export function isShuffling(): boolean {
  return shuffle;
}

/** For tests: an empty bag and a known ordering. */
export function _resetShuffleForTests(): void {
  shuffle = false;
  heard.clear();
}

/** The step the listening queue walks with — sequential, or shuffled. */
function nextListenRef(ref: AyahRef): AyahRef | null {
  const meta = findSurah(ref.surah);
  if (!meta) return null;
  if (ref.ayah < meta.ayahCount) return { surah: ref.surah, ayah: ref.ayah + 1 };
  if (!shuffle) return nextAyahRef(ref);
  return { surah: pickNextSurah(ref.surah), ayah: 1 };
}

/** The next `count` ayahs from `start` inclusive, and where to resume. */
export function listenWindow(
  start: AyahRef,
  count: number,
  /** How to step. Defaults to reading order; shuffle passes its own. */
  step: (ref: AyahRef) => AyahRef | null = nextAyahRef,
): { refs: AyahRef[]; cursor: AyahRef | null } {
  const refs: AyahRef[] = [];
  let cur: AyahRef | null = start;
  while (cur && refs.length < count) {
    refs.push(cur);
    cur = step(cur);
  }
  return { refs, cursor: cur };
}

function endListening(): void {
  listening = false;
  listenCursor = null;
  listenIndex = 0;
}

/** Append the next window if the queue is running low. Best effort. */
async function extendListening({ queue, idx }: QueueSnapshot): Promise<void> {
  if (!listening || !listenCursor) return;
  try {
    const remaining = queue.length - (idx + 1);
    if (remaining >= LISTEN_REFILL_AT) return;
    const { refs, cursor } = listenWindow(
      listenCursor,
      LISTEN_WINDOW,
      nextListenRef,
    );
    if (refs.length === 0) {
      listenCursor = null;
      return;
    }
    // Claim the cursor BEFORE the await that builds the tracks: two track
    // changes in quick succession would otherwise both queue the same
    // window and play every ayah twice.
    listenCursor = cursor;
    const tracks = await buildTracks(refs, status.reciterId, listenIndex);
    listenIndex += refs.length;
    await TrackPlayer.add(tracks);
  } catch {
    // A top-up that fails leaves what is queued playing. The next track
    // change tries again.
  }
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
  // A deliberate range replaces a continuous listen. The two cannot both
  // be true of one queue, and the one the user just asked for wins.
  endListening();
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

/**
 * Listen from here to the end of the book.
 *
 * Starts at an ayah — normally the first of a surah, but the listening
 * page also resumes mid-surah — and keeps going: when the queue runs low
 * the next window is appended, surah after surah, to 114:6.
 *
 * The memorisation repeats are deliberately NOT applied. They belong to
 * the range player, where you asked for an ayah five times on purpose;
 * applying them to a continuous listen would turn an evening's recitation
 * into the same page over and over.
 */
export async function listenFrom(
  surah: number,
  ayah: number = 1,
): Promise<void> {
  const meta = findSurah(surah);
  if (!meta) return;
  await ensureSetup();
  const prefs = getQuranState().prefs;
  setStatus({ reciterId: prefs.reciterId, loading: true });
  const start = { surah, ayah: Math.max(1, Math.min(meta.ayahCount, ayah)) };
  const { refs, cursor } = listenWindow(start, LISTEN_WINDOW, nextListenRef);
  const tracks = await buildTracks(refs, prefs.reciterId, 0);
  await TrackPlayer.reset();
  await TrackPlayer.add(tracks);
  await TrackPlayer.setRate(prefs.playbackRate);
  await TrackPlayer.play();
  // Armed only once the queue is really in the player: an `extendListening`
  // that ran against the OLD queue would top up something we are about to
  // reset.
  listening = true;
  listenCursor = cursor;
  listenIndex = refs.length;
  setStatus({ active: start, playing: true });
}

/** Is a continuous listen the thing that is playing? */
export function isListening(): boolean {
  return listening;
}

/**
 * The next surah, and the previous one.
 *
 * The transport's big arrows move by SURAH, not by ayah. An ayah is six
 * seconds: a "next" that advanced by one was a control you had to press
 * two hundred times to leave Al-Baqarah, and the thing people reach for
 * when a recitation is playing is the next surah. Ayah stepping is still
 * there, on its own smaller pair — see the screen.
 *
 * Previous restarts the current surah unless you are already at its
 * beginning, which is what every music player does with a track and what
 * makes the button useful twice: once to start this one again, twice to
 * leave it.
 */
export async function listenNextSurah(): Promise<void> {
  const current = status.active?.surah ?? 0;
  if (current >= 114) return;
  await listenFrom(Math.max(1, current) + (current === 0 ? 0 : 1), 1);
}

export async function listenPreviousSurah(): Promise<void> {
  const current = status.active?.surah ?? 1;
  const ayah = status.active?.ayah ?? 1;
  if (ayah > 1) {
    await listenFrom(current, 1);
    return;
  }
  await listenFrom(Math.max(1, current - 1), 1);
}

export async function stopPlayback(): Promise<void> {
  endListening();
  if (!setupPromise) return; // never started — nothing to stop
  await TrackPlayer.reset();
  setStatus({ active: null, playing: false, loading: false });
}

/** Move within the ayah being recited. */
export async function seekTo(seconds: number): Promise<void> {
  await ensureSetup();
  await TrackPlayer.seekTo(Math.max(0, seconds));
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
