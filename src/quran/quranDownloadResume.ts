/**
 * COMING BACK TO A DOWNLOAD THE NETWORK TOOK AWAY — issue #55.
 *
 * The report: a reciter's download stopped at 85% when its wifi went, the
 * app called it a failure, and the only thing the reciter's row offered
 * afterwards was Delete. Every one of those megabytes was still on disk —
 * these downloads are thousands of small files and a file already there
 * is skipped — so the whole of "resume" is calling the same job again.
 * Nothing was missing but the calling.
 *
 * This file is the half that does it without being asked.
 *
 * ── ON WIFI, AND ONLY ON WIFI ─────────────────────────────────────────
 *
 * A reciter is about a gigabyte. Resuming that on a mobile connection
 * because the phone happened to reconnect is not a favour, and the reader
 * who started it on wifi at home has said nothing about their data plan.
 * So the automatic half waits for an unmetered connection; on anything
 * else the download waits behind a button the reader can press — which
 * exists now, in the reciter's row, on the strip and in Manage downloads.
 *
 * `isConnectionExpensive` is the question that means "this costs money",
 * and it is answered `null` on plenty of devices. A null is not a promise
 * that the connection is free, so the type has to be wifi as well: both,
 * or nothing happens automatically.
 *
 * ── WHY IT LISTENS RATHER THAN POLLS ──────────────────────────────────
 *
 * NetInfo already publishes the transition, and the prayer-times cache
 * uses the same event for its own wifi top-up. Two rules keep this from
 * becoming a loop on a network that connects and drops every few seconds:
 * a run only starts on a TRANSITION into wifi, and a job that stops twice
 * without fetching anything new is left to the button.
 *
 * ── AND ON IOS IT IS STILL WORTH HAVING ───────────────────────────────
 *
 * A JavaScript download cannot continue with the app suspended on iOS, so
 * the run there ends when the app leaves the screen, and what this catches
 * is the reader coming back to the app — the resume happens in front of
 * them rather than in the background, which is the honest most that
 * platform allows.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import {
  hydrateResumableJob,
  quranDownloadState,
  resumableJob,
  resumeQuranDownload,
  subscribeQuranDownload,
} from './quranDownloadManager';

/** Unmetered, and known to be: see the header on the null. */
export function isFreeConnection(state: NetInfoState | null): boolean {
  if (!state?.isConnected) return false;
  if (state.type !== 'wifi' && state.type !== 'ethernet') return false;
  const details = state.details as { isConnectionExpensive?: boolean } | null;
  return details?.isConnectionExpensive !== true;
}

/**
 * How many times one stopped job may be picked up by itself.
 *
 * A connection that flaps — a train, a tunnel, a captive portal that
 * answers and then does not — would otherwise start a run every time it
 * came back, each one grinding to the same halt. Three is enough for a
 * connection that is merely uneven and few enough that a broken one goes
 * quiet and leaves the reader the button.
 */
const MAX_AUTO_RESUMES = 3;

let attempts = 0;
let lastFree = false;
/** How far the job had got when we last picked it up, to spot no progress. */
let lastDone = -1;

/** Start watching. Returns the unsubscribe, for the app root's effect. */
export function startDownloadResumeWatch(): () => void {
  let stopped = false;

  // The note on disk first: a phone that has been in a pocket since the
  // wifi went has no in-memory state at all, and the reader opening the
  // app is exactly who this is for.
  void hydrateResumableJob().then(() => {
    if (stopped) return;
    void NetInfo.fetch().then(state => {
      if (stopped) return;
      lastFree = isFreeConnection(state);
      // Already on wifi when the app opened — the commonest shape of the
      // report, since the download stopped while they were out.
      if (lastFree) tryResume();
    });
  });

  const unsubscribeNet = NetInfo.addEventListener(state => {
    const free = isFreeConnection(state);
    const arrived = free && !lastFree;
    lastFree = free;
    // The transition, not the state: a wifi network that is simply up
    // publishes plenty of events, and none of them is news.
    if (arrived) tryResume();
  });

  /**
   * A job that finishes, or that the reader deals with, resets the count
   * — so a reciter finished on a second attempt does not leave the next
   * download in the session with one attempt left.
   */
  const unsubscribeManager = subscribeQuranDownload(run => {
    if (run.last?.complete || run.last?.cancelled) {
      attempts = 0;
      lastDone = -1;
    }
  });

  return () => {
    stopped = true;
    unsubscribeNet();
    unsubscribeManager();
  };
}

function tryResume(): void {
  const job = resumableJob();
  if (!job) return;
  if (attempts >= MAX_AUTO_RESUMES) return;
  const last = quranDownloadState().last;
  /**
   * NO PROGRESS, NO SECOND GO. A run that came back and fetched nothing
   * new is not waiting for a connection — something else is wrong (files
   * the server no longer has, a captive portal answering everything with
   * a login page) and trying again on every reconnect for ever is how an
   * app eats a battery saying nothing.
   */
  if (last && last.done === lastDone && last.done > 0) return;
  lastDone = last?.done ?? -1;
  attempts += 1;
  resumeQuranDownload();
}

/** For tests. */
export function _resetResumeWatchForTests(): void {
  attempts = 0;
  lastFree = false;
  lastDone = -1;
}
