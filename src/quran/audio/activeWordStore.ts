/**
 * The word being recited, as a store the page lines can subscribe to one
 * at a time.
 *
 * ── WHY NOT A PROP ────────────────────────────────────────────────────
 *
 * `useActiveWordIndex` polls playback four times a second and returns a
 * fresh object each time. Threaded down as a prop it would re-render the
 * reader, the list, every mounted page and every line at that rate, to
 * move a highlight one word along on one of them. The translation view
 * can afford that per card; a muṣḥaf page is ~250 drawn pieces and a
 * spread mounts six of them.
 *
 * So one probe component reads the hook and publishes here, and each
 * LINE subscribes with a selector that answers a single question — "which
 * of my words is being recited, if any" — as a number. React's
 * `useSyncExternalStore` compares the number, and a line whose answer has
 * not changed does not wake. Four ticks a second reach two lines, not
 * ninety.
 */
import { useSyncExternalStore } from 'react';
import type { MushafLine } from '../mushafLayout';

export type ActiveWord = {
  surah: number;
  ayah: number;
  /** 0-based, in Uthmani word order — what the timing data counts in. */
  wordIndex: number;
};

let current: ActiveWord | null = null;
const listeners = new Set<() => void>();

const same = (a: ActiveWord | null, b: ActiveWord | null) =>
  a === b ||
  (a != null &&
    b != null &&
    a.surah === b.surah &&
    a.ayah === b.ayah &&
    a.wordIndex === b.wordIndex);

/** Called by the one probe that reads playback; a no-op when nothing moved. */
export function publishActiveWord(word: ActiveWord | null): void {
  if (same(word, current)) return;
  current = word;
  for (const l of listeners) l();
}

export function getActiveWord(): ActiveWord | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * One number for one word: surah, ayah and QPC position packed together, so
 * a line's answer can be compared as a primitive and a glyph can be
 * matched against it without allocating anything.
 */
export function wordCode(surah: number, ayah: number, position: number): number {
  return surah * 1_000_000 + ayah * 1_000 + position;
}

/**
 * The code of the word being recited on this line, or -1.
 *
 * QPC numbers a line's words from 1 within their ayah and the timing data
 * numbers them from 0, so the recited word is at `wordIndex + 1`. A line
 * that does not carry that word answers -1 — and a band or a basmalah
 * carries no words at all.
 */
export function useActiveWordOn(line: MushafLine): number {
  return useSyncExternalStore(
    subscribe,
    () => activeWordOn(line, current),
    () => -1,
  );
}

export function activeWordOn(line: MushafLine, word: ActiveWord | null): number {
  if (word == null || line.kind !== 'ayah') return -1;
  const position = word.wordIndex + 1;
  for (const w of line.words) {
    if (w.surah === word.surah && w.ayah === word.ayah && w.position === position) {
      return wordCode(w.surah, w.ayah, w.position);
    }
  }
  return -1;
}

/** Test seam. */
export function _resetActiveWordForTests(): void {
  current = null;
  listeners.clear();
}
