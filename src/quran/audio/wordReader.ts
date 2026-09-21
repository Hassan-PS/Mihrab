/**
 * THE WORD READER — hold a word, hear it.
 *
 * A finger held on the Ḥafṣ page picks the word under it; sliding picks
 * another; lifting reads the one it is on, alone, and stops. That is the
 * whole feature. This module is its state, and the reader surfaces call
 * three things into it: `hold` when the finger lands (and again for every
 * word it slides onto), `release` when it lifts, `cancel` when the
 * gesture is taken away by something else.
 *
 * WHAT A HOLD DOES, besides lighting the word:
 *
 *   • Pauses the recitation, if one is playing, and remembers that it did.
 *     Two voices at once is not a feature. The recitation resumes when the
 *     word has been heard — or when the hold ends without one.
 *   • Fetches the ayah's audio for the word reader's reciter, so the word
 *     can be played the moment the finger lifts rather than after a round
 *     trip. Sliding onto a new ayah fetches that one; the fetch already in
 *     flight is left to finish, since it fills a file that stays useful.
 *   • Loads the reciter's timings, once.
 *
 * WHAT A RELEASE DOES: waits for the audio and the timings (usually both
 * are already here), finds the segment that carries this word, plays it
 * with the `WordPlayer`, keeps the word lit until it is heard. A word with
 * no segment — a pause mark, an ayah the alignment skipped — plays
 * nothing. Offline with nothing on disk: nothing plays, and `onSilent`
 * says why, once per hold.
 *
 * The lit word rides the same store the recitation's word highlight uses
 * (`activeWordStore`), so the page lights it exactly as it lights a
 * recited word — and there is no second highlight to keep in step with the
 * first. The two never collide: the recitation is paused for as long as
 * the hold lasts.
 */
import type { MushafWord } from '../mushafLayout';
import { publishActiveWord } from './activeWordStore';
import { localAudioPathIfAny, prefetchAyahAudio } from './audioStore';
import { getPlaybackStatus, pausePlayback, resumePlayback } from './playback';
import { DEFAULT_RECITER_ID, findReciter, RECITERS, type Reciter } from './reciters';
import { getTimings } from './useWordTiming';
import { WordPlayer } from '../../native/WordPlayer';
import { getQuranState, subscribeQuranState } from '../quranState';
import { useSyncExternalStore } from 'react';

/**
 * Is the word reader on? A boolean out of the store, so a page surface
 * that asks re-renders when the switch moves and not on every page turn.
 */
export function useWordReaderEnabled(): boolean {
  return useSyncExternalStore(
    subscribeQuranState,
    () => getQuranState().prefs.wordReader,
    () => false,
  );
}

/** A quran-align segment: [firstWordIndex, lastWordIndex, startMs, endMs]. */
type Segment = number[];

/** Why a release played nothing. */
export type WordReaderSilence = 'offline' | 'no-timing';

/** The reciters who can read one word: those with word timings. */
export function timedReciters(): Reciter[] {
  return RECITERS.filter(r => r.hasTimings);
}

/**
 * Who reads the word. The chosen one when it is chosen and timed; else
 * the recitation's reciter when timed; else the default. Never untimed.
 */
export function wordReaderReciterId(
  prefs: { wordReaderReciterId: string; reciterId: string } = getQuranState().prefs,
): string {
  for (const id of [prefs.wordReaderReciterId, prefs.reciterId, DEFAULT_RECITER_ID]) {
    if (id && findReciter(id).id === id && findReciter(id).hasTimings) return id;
  }
  return timedReciters()[0]?.id ?? DEFAULT_RECITER_ID;
}

/** The segment carrying `position` (1-based, as the layout counts). */
export function segmentForWord(
  segments: readonly Segment[] | undefined,
  position: number,
): { startMs: number; endMs: number } | null {
  if (!segments) return null;
  const index = position - 1;
  for (const seg of segments) {
    if (seg.length < 4) continue;
    // quran-align's word range is [start, end): `[0, 1, …]` is word 0
    // alone, and `[3, 5, …]` two words the aligner could not tell apart.
    // A degenerate `[n, n, …]` is read as word n, so a range written the
    // other way round by hand still lands.
    const end = seg[1] > seg[0] ? seg[1] : seg[0] + 1;
    if (index >= seg[0] && index < end && seg[3] > seg[2]) {
      return { startMs: seg[2], endMs: seg[3] };
    }
  }
  return null;
}

type Held = {
  word: MushafWord;
  reciterId: string;
  /** Resolves to the ayah file on disk, or null when it cannot be had. */
  audio: Promise<string | null>;
};

let held: Held | null = null;
/** A released word still being fetched or read: it stays lit meanwhile. */
let reading = false;
/** The recitation was playing when the hold began, and was paused by us. */
let pausedRecitation = false;
/** Distinguishes the release in flight from one that was superseded. */
let generation = 0;
let onSilentListener: ((why: WordReaderSilence) => void) | null = null;

/** The reader surface's chance to say why nothing played. */
export function onWordReaderSilent(fn: ((why: WordReaderSilence) => void) | null): void {
  onSilentListener = fn;
}

function fetchAyah(reciterId: string, word: MushafWord): Promise<string | null> {
  return localAudioPathIfAny(reciterId, word.surah, word.ayah)
    .then(local => local ?? prefetchAyahAudio(reciterId, word.surah, word.ayah))
    .catch(() => null);
}

/** Is the reader mid-hold or mid-word? */
export function isWordReaderBusy(): boolean {
  return held != null || reading;
}

/**
 * The finger is on `word` — landed there, or slid there. Idempotent for
 * the same word; a different word relights and, on a new ayah, refetches.
 */
export function hold(word: MushafWord): void {
  if (word.isEnd) return;
  const reciterId = held?.reciterId ?? wordReaderReciterId();
  if (!held) {
    generation += 1;
    void WordPlayer.stop();
    const status = getPlaybackStatus();
    if (status.playing) {
      pausedRecitation = true;
      void pausePlayback();
    }
    void getTimings(reciterId);
    held = { word, reciterId, audio: fetchAyah(reciterId, word) };
  } else {
    const same = held.word.surah === word.surah && held.word.ayah === word.ayah;
    if (same && held.word.position === word.position) return;
    held = {
      word,
      reciterId,
      audio: same ? held.audio : fetchAyah(reciterId, word),
    };
  }
  publishActiveWord({ surah: word.surah, ayah: word.ayah, wordIndex: word.position - 1 });
}

function settle(): void {
  publishActiveWord(null);
  if (pausedRecitation) {
    pausedRecitation = false;
    void resumePlayback();
  }
}

/** The finger lifted: read the word it was on. */
export async function release(): Promise<void> {
  const current = held;
  held = null;
  if (!current) return;
  const mine = ++generation;
  const { word, reciterId } = current;
  reading = true;
  try {
    const [path, timings] = await Promise.all([current.audio, getTimings(reciterId)]);
    if (mine !== generation) return; // a new hold took over meanwhile
    const segment = segmentForWord(timings?.[`${word.surah}:${word.ayah}`], word.position);
    if (!path) {
      onSilentListener?.('offline');
      return;
    }
    if (!segment) {
      onSilentListener?.('no-timing');
      return;
    }
    await WordPlayer.play(path, segment.startMs, segment.endMs);
  } finally {
    if (mine === generation) {
      reading = false;
      settle();
    }
  }
}

/** The gesture was taken away (a scroll won, the page unmounted): nothing plays. */
export function cancel(): void {
  if (!held && !reading) return;
  held = null;
  reading = false;
  generation += 1;
  void WordPlayer.stop();
  settle();
}

export function _resetWordReaderForTests(): void {
  held = null;
  reading = false;
  pausedRecitation = false;
  generation += 1;
  onSilentListener = null;
}
