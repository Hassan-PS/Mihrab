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
 * Both downloads pull from the same release and write to the same disk, so
 * a second one started while the first runs would halve both and confuse
 * the progress. `start` is a no-op while one is in flight; the caller finds
 * out by reading the state it gets back.
 */
import {
  downloadMushafAssets,
  type MushafDownloadHandle,
  type MushafDownloadProgress,
} from './mushafDownload';
import { downloadAllPageFonts } from './mushafFontStore';
import {
  finishDownloadNotification,
  publishDownloadProgress,
} from './downloadNotification';
import i18n from '../i18n';

/** The page images, or the per-page fonts the text reader draws with. */
export type MushafDownloadKind = 'images' | 'fonts';

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

function label(kind: MushafDownloadKind): string {
  return kind === 'fonts'
    ? i18n.t('quran.downloadingFonts')
    : i18n.t('quran.downloadingPages');
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
      label: label(kind),
    });
  };

  handle =
    kind === 'fonts'
      ? downloadAllPageFonts({ onProgress })
      : downloadMushafAssets({ concurrency: 8, onProgress });

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
