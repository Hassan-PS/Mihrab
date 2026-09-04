/**
 * The Quran's downloads, owned by the app rather than by a screen.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * The mushaf download used to live inside MushafReader: the handle was a
 * ref, and the effect that created it cancelled it on cleanup. Which meant
 * leaving the Quran tab — or turning the phone, or switching to the text
 * reader — threw away however much of a six-hundred-page book had arrived.
 * The only way to finish was to sit and watch it, on a screen that exists
 * to be read rather than watched.
 *
 * A module holds it now. Screens ask what is happening and subscribe to
 * changes; nothing about mounting or unmounting starts or stops anything.
 * The only two things that end a download are finishing and being
 * cancelled, and cancelling is something a person does.
 *
 * ── WHY IT OWNS THE RECITATIONS TOO ───────────────────────────────────
 *
 * Because the per-surah audio download had exactly the bug described
 * above, still: its handle lived in RecitationControls' component state
 * and died with the sheet. That was survivable for one surah of eighty
 * ayahs. A reciter's whole Quran is 6,236 files and over a gigabyte, and a
 * download that size cannot belong to a screen.
 *
 * ── ONE AT A TIME, ACROSS BOTH KINDS ──────────────────────────────────
 *
 * A second run started while the first is in flight would halve both and
 * confuse the progress — and that is as true of fonts against a recitation
 * as of fonts against fonts. They share one pipe, one disk and, on
 * Android, one foreground service: the notification IS the service, so two
 * downloads would either fight over one bar or need two services to say
 * one thing.
 *
 * So `start` is a no-op while anything is running, and the caller finds
 * out by reading the state it gets back. The alternative — a real queue,
 * with the second job waiting — was considered and is not worth it: these
 * are downloads people start deliberately, one at a time, and being told
 * "something is already downloading" is a better answer than silently
 * joining a queue whose progress bar is about something else.
 */
import type {
  MushafDownloadHandle,
  MushafDownloadProgress,
} from './mushafDownload';
import { downloadAllPageFonts } from './mushafFontStore';
import { downloadReciterAudio, totalAyahCount } from './audio/audioStore';
import { findReciter } from './audio/reciters';
import {
  finishDownloadNotification,
  publishDownloadProgress,
} from './downloadNotification';
import i18n from '../i18n';

/**
 * What is being fetched.
 *
 * `fonts` is the mushaf's own per-page faces — the book's text. `audio`
 * carries the reciter, because "a download is running" is not enough for a
 * screen that lists forty-two voices and has to say which one.
 */
export type QuranDownloadJob =
  | { kind: 'fonts' }
  | { kind: 'audio'; reciterId: string };

export type QuranDownloadState = {
  /** What is running, or null when nothing is. */
  running: QuranDownloadJob | null;
  progress: MushafDownloadProgress;
  /**
   * How the last run ended, for a screen that was not mounted when it did.
   * Cleared when the next one starts.
   */
  last: {
    job: QuranDownloadJob;
    complete: boolean;
    cancelled: boolean;
    failed: number;
  } | null;
};

const EMPTY_PROGRESS: MushafDownloadProgress = { done: 0, total: 0, failed: 0 };

let state: QuranDownloadState = {
  running: null,
  progress: EMPTY_PROGRESS,
  last: null,
};
let handle: MushafDownloadHandle | null = null;
let cancelledByUser = false;

const listeners = new Set<(s: QuranDownloadState) => void>();

function publish(next: QuranDownloadState): void {
  state = next;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // A subscriber that throws must not take the download with it.
    }
  }
}

export function quranDownloadState(): QuranDownloadState {
  return state;
}

/** Subscribe; returns the unsubscribe, for a `useEffect`. */
export function subscribeQuranDownload(
  listener: (s: QuranDownloadState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Is this exact job the one running? */
export function isJobRunning(job: QuranDownloadJob): boolean {
  const running = state.running;
  if (!running || running.kind !== job.kind) return false;
  if (running.kind === 'audio' && job.kind === 'audio') {
    return running.reciterId === job.reciterId;
  }
  return true;
}

/** The reciter's name as the shade should say it. */
function reciterLabel(reciterId: string): string {
  return findReciter(reciterId).name;
}

/**
 * The four strings the shade needs, in the units this job actually counts.
 *
 * The mushaf counts pages and a recitation counts ayahs. The notification
 * takes them as text rather than deciding for itself, so neither has to
 * know about the other.
 */
function notificationText(job: QuranDownloadJob) {
  if (job.kind === 'audio') {
    const name = reciterLabel(job.reciterId);
    return {
      // `downloadingReciter`, not `downloadingAudio`. The latter already
      // existed for the per-surah download inside the ayah sheet
      // ("Downloading… 40/86"), and adding a second entry under the same
      // key silently overrode it — JSON keeps the last one, so that sheet
      // had started announcing a reciter's name where a count belonged.
      label: i18n.t('quran.downloadingReciter', { name }),
      body: (done: number, total: number) =>
        i18n.t('quran.downloadProgressAyahs', { done, total }),
      doneTitle: i18n.t('quran.audioDownloadDoneTitle', { name }),
      doneBody: i18n.t('quran.audioDownloadDoneBody', { name }),
      incompleteTitle: i18n.t('quran.audioDownloadIncompleteTitle'),
      incompleteBody: (failed: number) =>
        i18n.t('quran.audioDownloadIncompleteBody', { count: failed }),
    };
  }
  return {
    label: i18n.t('quran.downloadingFonts'),
    body: (done: number, total: number) =>
      i18n.t('quran.downloadProgress', { done, total }),
    doneTitle: i18n.t('quran.downloadDoneTitle'),
    doneBody: i18n.t('quran.downloadDoneBody'),
    incompleteTitle: i18n.t('quran.downloadIncompleteTitle'),
    incompleteBody: (failed: number) =>
      i18n.t('quran.downloadIncompleteBody', { count: failed }),
  };
}

function begin(job: QuranDownloadJob): MushafDownloadHandle {
  const text = notificationText(job);
  const onProgress = (progress: MushafDownloadProgress) => {
    publish({ ...state, progress });
    void publishDownloadProgress({
      done: progress.done,
      total: progress.total,
      label: text.label,
      body: text.body(progress.done, progress.total),
    });
  };
  if (job.kind === 'audio') {
    return downloadReciterAudio(job.reciterId, onProgress);
  }
  return downloadAllPageFonts({ onProgress });
}

/**
 * Start one, if nothing is running. Returns whether this call started it.
 */
export function startQuranDownload(job: QuranDownloadJob): boolean {
  if (state.running) return false;
  cancelledByUser = false;
  publish({
    running: job,
    // The total is known before the first file lands, and a bar that
    // starts at "0 of 0" and jumps to "1 of 6236" reads as a stall.
    progress:
      job.kind === 'audio'
        ? { done: 0, total: totalAyahCount(), failed: 0 }
        : EMPTY_PROGRESS,
    last: null,
  });

  handle = begin(job);

  void handle.promise.then(complete => {
    const failed = state.progress.failed;
    const text = notificationText(job);
    handle = null;
    publish({
      running: null,
      progress: state.progress,
      last: { job, complete, cancelled: cancelledByUser, failed },
    });
    void finishDownloadNotification({
      complete,
      cancelled: cancelledByUser,
      failed,
      doneTitle: text.doneTitle,
      doneBody: text.doneBody,
      incompleteTitle: text.incompleteTitle,
      incompleteBody: text.incompleteBody(failed),
    });
  });
  return true;
}

/** Stop it. Whatever landed on disk stays there and is usable. */
export function cancelQuranDownload(): void {
  if (!handle) return;
  cancelledByUser = true;
  handle.cancel();
}

/** For tests. */
export function resetQuranDownloadState(): void {
  handle = null;
  cancelledByUser = false;
  listeners.clear();
  state = { running: null, progress: EMPTY_PROGRESS, last: null };
}
