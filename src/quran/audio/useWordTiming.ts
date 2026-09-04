/**
 * Word-level highlight tracking — QR-17 (docs/quran-reader-plan.md).
 *
 * Maps the player's live position onto quran-align word segments for
 * the active ayah. Strictly best-effort: if the timing file hasn't
 * downloaded (or the reciter has a gap), the hook returns null and the
 * UI falls back to ayah-level highlighting. Never blocks playback.
 */
import { useEffect, useRef, useState } from 'react';
import { useProgressWhileActive } from './useProgressWhileActive';
import { loadReciterTimings } from './audioStore';
import { findReciter } from './reciters';
import { usePlaybackStatus } from './playback';

type TimingsMap = { [key: string]: number[][] };

/**
 * How many reciters' timings to keep parsed in memory.
 *
 * One entry is a whole quran-align file for one reciter: ~6,200 keys of
 * `number[][]`, megabytes once parsed. This was an unbounded Map, so every
 * reciter tried in a session stayed resident for the life of the process —
 * and trying reciters is exactly what the picker invites. Reported as a
 * suspected memory problem alongside issue #12, and the reporter was right.
 *
 * Two, not one: only one reciter plays at a time, but flipping back to the
 * previous one is common enough that a cache of one would re-read and
 * re-parse the file on every flip. Two makes that free and still bounds the
 * damage at "the reciter you are listening to, and the one before it".
 */
const MAX_CACHED_RECITERS = 2;

/**
 * How long a FAILED lookup is believed for.
 *
 * A null answer has two very different causes, and caching them the same
 * way is what killed the highlight on Android (v2.9, reported from a fresh
 * install). Opening the muṣḥaf starts a 604-file font download over the
 * same ReactNativeBlobUtil transport; the timings fetch queued behind it
 * came back `[Error: Download interrupted.]`, the null was cached FOR THE
 * LIFE OF THE PROCESS, and every later lookup answered from that cache —
 * so the words never lit up again however good the network got, until the
 * app was killed. iOS was fine only because its download happened to win
 * the race.
 *
 * A reciter who publishes no timings at all is a permanent answer and is
 * still cached permanently (`expires: Infinity`); a fetch that FAILED is
 * remembered just long enough to stop a retry per ayah, and no longer.
 */
export const FAILURE_RETRY_MS = 30_000;

type Entry = {
  timings: TimingsMap | null;
  /** Epoch ms after which this answer is re-asked. */
  expires: number;
};

/** Insertion-ordered, oldest first — Map iteration order does the LRU. */
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<TimingsMap | null>>();

function remember(reciterId: string, entry: Entry): void {
  // Re-insert so a hit counts as a use, otherwise the entry ages out while
  // it is the one being played.
  cache.delete(reciterId);
  cache.set(reciterId, entry);
  while (cache.size > MAX_CACHED_RECITERS) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * How long an answer is good for. Pure, so the policy can be read off in a
 * test without a network or a cache.
 *
 * `hasTimings` is what the reciter PUBLISHES; `answered` is whether this
 * lookup came back with any. Null with nothing to fetch is the truth about
 * the reciter; null after a fetch is only the truth about this minute.
 */
export function timingsExpiry(
  hasTimings: boolean,
  answered: boolean,
  now: number,
): number {
  if (answered || !hasTimings) return Infinity;
  return now + FAILURE_RETRY_MS;
}

function entryFor(reciterId: string, timings: TimingsMap | null): Entry {
  return {
    timings,
    expires: timingsExpiry(
      findReciter(reciterId).hasTimings,
      timings != null,
      Date.now(),
    ),
  };
}

function getTimings(reciterId: string): Promise<TimingsMap | null> {
  const hit = cache.get(reciterId);
  if (hit && Date.now() < hit.expires) {
    remember(reciterId, hit);
    return Promise.resolve(hit.timings);
  }
  const pending = inFlight.get(reciterId);
  if (pending) return pending;
  const p = loadReciterTimings(reciterId).then(t => {
    remember(reciterId, entryFor(reciterId, t));
    inFlight.delete(reciterId);
    return t;
  });
  inFlight.set(reciterId, p);
  return p;
}

/** Test seam: drop everything this module is holding. */
export function _resetWordTimingCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}

/**
 * Index (0-based, in Uthmani word order) of the word being recited in
 * the active ayah — or null when unknown/idle.
 */
export function useActiveWordIndex(): {
  surah: number;
  ayah: number;
  wordIndex: number;
} | null {
  const { active, playing, reciterId } = usePlaybackStatus();
  // Four times a second, and only while a human can see the word it
  // lights. The probes that mount this are gated the same way, so this
  // is belt and braces — but the hook is exported, and the next caller
  // should not have to remember.
  const { position } = useProgressWhileActive(250);
  const [timings, setTimings] = useState<TimingsMap | null>(null);
  const wantedReciter = useRef<string>('');

  useEffect(() => {
    if (!playing || !active) return;
    if (wantedReciter.current === reciterId && timings) return;
    wantedReciter.current = reciterId;
    let cancelled = false;
    void getTimings(reciterId).then(t => {
      if (!cancelled) setTimings(t);
    });
    return () => {
      cancelled = true;
    };
  }, [playing, active, reciterId, timings]);

  if (!active || !playing || !timings) return null;
  const segments = timings[`${active.surah}:${active.ayah}`];
  if (!segments || segments.length === 0) return null;
  const ms = position * 1000;
  for (const seg of segments) {
    // seg = [wordStart, wordEnd, startMs, endMs]
    if (ms >= seg[2] && ms < seg[3]) {
      return { surah: active.surah, ayah: active.ayah, wordIndex: seg[0] };
    }
  }
  return null;
}
