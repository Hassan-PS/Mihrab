/**
 * Deadlines for the Quran content sources.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────
 *
 * The prayer-times providers all reach the network through one hardened
 * helper (`src/utils/fetchWithRetry.ts`): timeout, retry policy, jittered
 * backoff, `Retry-After`, circuit breaker. The Quran content sources —
 * recitation MP3s, word timings, page fonts, tafsir, reader-supplied
 * riwayah datasets — grew up separately and never adopted it. Each one
 * hand-rolled its own retry loop, or none at all, and between them they
 * left every request without a deadline.
 *
 * That is worse than it sounds, because of how the transport is chosen.
 * The audio and font stores condemn `ReactNativeBlobUtil`'s streaming
 * downloader for the rest of the session on its first failure and fall
 * back to RN's own `fetch` — and the fallback was the one path with no
 * timeout at all. So the very networks that break the streaming transport
 * (a captive portal, a corporate proxy, a connection that is accepted and
 * then stalls) are exactly the networks that routed every subsequent
 * request onto a promise that can never settle. A reader on hotel wifi
 * got a spinner with no end and no error.
 *
 * Two rules follow, and this file holds both so a sixth content source
 * cannot quietly invent a third answer:
 *
 *   1. Every request has a deadline, named here rather than spelled as a
 *      number at the call site.
 *   2. A deadline is not a retry. These sources already carry their own
 *      attempt loops; adding `fetchWithRetry`'s would multiply them (three
 *      attempts becoming twelve) and turn one stalled ayah into four
 *      minutes. `fetchContentOnce` therefore fixes `maxAttempts: 1` and
 *      leaves the retrying to the caller that already does it.
 *
 * `__tests__/quranContentDeadlines.test.ts` fails if a file under
 * `src/quran/` calls `fetch(` or a blob-util `.fetch('GET', …)` without
 * going through one of these.
 */
import { fetchWithRetry } from '../utils/fetchWithRetry';

/**
 * How long each kind of content may take before it is a failure.
 *
 * Sized by what is on the wire and who is waiting, not by one blanket
 * number: a reader watching an ayah action sheet should be told the
 * tafsir is unavailable in a few seconds, while a 1.4 MB timings file on
 * a slow connection deserves a minute before anyone gives up on it.
 */
/**
 * HOW A DOWNLOAD ENDED — issue #55.
 *
 * A queue of six thousand files has three endings, not two, and the app
 * used to have a word for only one of them. `complete` is every file on
 * disk. The other two both leave files missing, and they are nothing
 * alike:
 *
 *   • a handful of files would not come — a 404, a corrupt body, a
 *     stretch of bad luck — and the rest of the book arrived. There is
 *     something to report and nothing to wait for.
 *
 *   • the files stopped arriving ALTOGETHER, which is what a connection
 *     going away looks like from inside a queue. Nothing is wrong with
 *     the download; the network is gone, and it will be back.
 *
 * Telling the second one "failed" is the report in issue #55: a reader
 * whose wifi dropped at 85% was shown a failure, and the only button
 * their reciter had left was Delete. Every byte was still on disk.
 *
 * So a run says which ending it had, and `interrupted` is the one that
 * means "come back to this" — see `quranDownloadManager`, which is what
 * comes back to it.
 */
export type DownloadOutcome = {
  /** Every file in the queue is on disk. */
  complete: boolean;
  /** It gave up early because the files had stopped arriving at all. */
  interrupted: boolean;
};

/**
 * Consecutive failures that mean the network, not the file.
 *
 * One file failing is a file; four workers each failing three times in a
 * row, on files that have nothing in common but the minute they were
 * tried in, is the connection. The number is small enough that a reader
 * whose wifi drops stops within seconds rather than grinding through six
 * thousand doomed fetches — each of which costs up to three attempts and
 * a 60-second deadline — and large enough that a few scattered bad files
 * never stop a run that is otherwise working.
 */
export const GIVE_UP_AFTER_CONSECUTIVE_FAILURES = 8;

export const CONTENT_DEADLINES = {
  /** One ayah's MP3 — tens of kilobytes. Matches the streaming watchdog it stands in for. */
  ayahAudio: 60_000,
  /**
   * The gapless prefetch, which runs ahead of the listener and is pure
   * optimisation. It gives up sooner than a download someone asked for:
   * a prefetch still in flight when the ayah arrives has already lost.
   */
  ayahPrefetch: 30_000,
  /** A reciter's word-timing JSON — ~1.4 MB. */
  timings: 60_000,
  /** One page font — ~300 KB. */
  pageFont: 60_000,
  /**
   * Tafsir for one ayah — a few kilobytes, fetched while the reader looks
   * at an open sheet. Best-effort by design: it must fail fast and quietly
   * rather than hold the sheet.
   */
  tafsir: 8_000,
  /** A riwayah dataset from a link someone pasted; up to 48 MB. */
  riwayah: 30_000,
} as const;

export type ContentDeadline = keyof typeof CONTENT_DEADLINES;

/**
 * One attempt, with a deadline. No retry, on purpose — see rule 2 above.
 *
 * Delegates to `fetchWithRetry` rather than building a second
 * `AbortController` dance, so there is exactly one implementation of "a
 * fetch that cannot hang" in the app, and a caller's own `signal` is
 * still composed with the timeout.
 */
export function fetchContentOnce(
  input: RequestInfo,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  return fetchWithRetry(input, init, { maxAttempts: 1, timeoutMs });
}

/** A `ReactNativeBlobUtil` download task: a promise that can be cancelled. */
type CancellableTask<T> = Promise<T> & {
  cancel?: (callback: () => void) => void;
};

/**
 * Put a deadline on a `ReactNativeBlobUtil` download.
 *
 * The library's own `timeout` config cannot be used: on Android it makes
 * every download fail instantly with "Download interrupted" (learned by
 * the font store, then by the audio store, and noted at both call sites).
 * So the deadline is a race in JS, and the loser is cancelled so the
 * native side stops holding the socket.
 *
 * Extracted from the three copies the audio store had grown, and given to
 * the two streaming downloads — the fonts and the reciter timings — that
 * never had one at all.
 */
export async function withDownloadDeadline<T>(
  task: CancellableTask<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => {
          try {
            task.cancel?.(() => undefined);
          } catch {
            // A task that is already settled has nothing to cancel, and
            // the rejection below is the answer either way.
          }
          reject(new Error(`${label}: timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (watchdog != null) clearTimeout(watchdog);
  }
}
