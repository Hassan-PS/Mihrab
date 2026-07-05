/**
 * Word-level highlight tracking — QR-17 (docs/quran-reader-plan.md).
 *
 * Maps the player's live position onto quran-align word segments for
 * the active ayah. Strictly best-effort: if the timing file hasn't
 * downloaded (or the reciter has a gap), the hook returns null and the
 * UI falls back to ayah-level highlighting. Never blocks playback.
 */
import { useEffect, useRef, useState } from 'react';
import { useProgress } from 'react-native-track-player';
import { loadReciterTimings } from './audioStore';
import { usePlaybackStatus } from './playback';

type TimingsMap = { [key: string]: number[][] };

const cache = new Map<string, TimingsMap | null>();
const inFlight = new Map<string, Promise<TimingsMap | null>>();

function getTimings(reciterId: string): Promise<TimingsMap | null> {
  if (cache.has(reciterId)) {
    return Promise.resolve(cache.get(reciterId) ?? null);
  }
  const pending = inFlight.get(reciterId);
  if (pending) return pending;
  const p = loadReciterTimings(reciterId).then(t => {
    cache.set(reciterId, t);
    inFlight.delete(reciterId);
    return t;
  });
  inFlight.set(reciterId, p);
  return p;
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
  const { position } = useProgress(250);
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
