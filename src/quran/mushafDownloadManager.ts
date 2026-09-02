/**
 * The Quran download, owned by the app rather than by a screen.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * The download used to live inside MushafReader: the handle was a ref, and
 * the effect that created it cancelled it on cleanup. Which meant leaving
 * the Quran tab — or turning the phone, or switching to the text reader —
 * threw away however much of a six-hundred-page book had arrived. The only
 * way to finish was to sit and watch it, on a screen that exists to be read
 * rather than watched.
 *
 * A module holds it now. Screens ask what is happening and subscribe to
 * changes; nothing about mounting or unmounting starts or stops anything.
 * The only two things that end a download are finishing and being
 * cancelled, and cancelling is something a person does.
 *
 * ── ONE AT A TIME ─────────────────────────────────────────────────────
 *
 * A second run started while the first is in flight would halve both and
 * confuse the progress. `start` is a no-op while one is running; the
 * caller finds out by reading the state it gets back.
 *
 * There used to be two kinds — the page images, and the per-page fonts
 * that replaced them. The image reader is gone, so the kind is kept only
 * so the state can still say what ran.
 */
import type {
  MushafDownloadHandle,
  MushafDownloadProgress,
} from './mushafDownload';
import { downloadAllPageFonts } from './mushafFontStore';
import {
  finishDownloadNotification,
  publishDownloadProgress,
} from './downloadNotification';
import i18n from '../i18n';

/** The per-page fonts the reader draws with. */
export type MushafDownloadKind = 'fonts';

export type MushafDownloadState = {
  /** What is running, or null when nothing is. */
  running: MushafDownloadKind | null;
  progress: MushafDownloadProgress;
  /**
   * How the last run ended, for a screen that was not mounted when it did.
   * Cleared when the next one starts.
   */
  last: {
    kind: MushafDownloadKind;
    complete: boolean;
    cancelled: boolean;
    failed: number;
  } | null;
};

const EMPTY_PROGRESS: MushafDownloadProgress = { done: 0, total: 0, failed: 0 };

let state: MushafDownloadState = {
  running: null,
  progress: EMPTY_PROGRESS,
  last: null,
};
let handle: MushafDownloadHandle | null = null;
let cancelledByUser = false;

const listeners = new Set<(s: MushafDownloadState) => void>();

function publish(next: MushafDownloadState): void {
  state = next;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // A subscriber that throws must not take the download with it.
    }
  }
}

export function mushafDownloadState(): MushafDownloadState {
  return state;
}

/** Subscribe; returns the unsubscribe, for a `useEffect`. */
export function subscribeMushafDownload(
  listener: (s: MushafDownloadState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function label(): string {
  return i18n.t('quran.downloadingFonts');
}

/**
 * Start one, if none is running. Returns whether this call started it.
 */
export function startMushafDownload(kind: MushafDownloadKind): boolean {
  if (state.running) return false;
  cancelledByUser = false;
  publish({ running: kind, progress: EMPTY_PROGRESS, last: null });

  const onProgress = (progress: MushafDownloadProgress) => {
    publish({ ...state, progress });
    void publishDownloadProgress({
      done: progress.done,
      total: progress.total,
      label: label(),
    });
  };

  handle = downloadAllPageFonts({ onProgress });

  void handle.promise.then(complete => {
    const failed = state.progress.failed;
    handle = null;
    publish({
      running: null,
      progress: state.progress,
      last: { kind, complete, cancelled: cancelledByUser, failed },
    });
    void finishDownloadNotification({
      complete,
      cancelled: cancelledByUser,
      failed,
    });
  });
  return true;
}

/** Stop it. Whatever landed on disk stays there and is usable. */
export function cancelMushafDownload(): void {
  if (!handle) return;
  cancelledByUser = true;
  handle.cancel();
}

/** For tests. */
export function resetMushafDownloadState(): void {
  handle = null;
  cancelledByUser = false;
  listeners.clear();
  state = { running: null, progress: EMPTY_PROGRESS, last: null };
}
