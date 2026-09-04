/**
 * The Quran download, as the system sees it.
 *
 * ── WHY A NOTIFICATION AT ALL ─────────────────────────────────────────
 *
 * The mushaf is six hundred and four pages and the fonts are a hundred and
 * eighty megabytes; a reciter's Quran is six thousand two hundred and
 * thirty-six files. These are downloads people start and then go and do
 * something else. Until there was a notification, "something else" meant
 * leaving the Quran screen, which cancelled it — so the only way to get
 * the whole book was to sit and watch a progress bar. A notification is
 * what makes the download something the phone is doing rather than
 * something the screen is doing.
 *
 * ── ANDROID ONLY, AND HONESTLY SO ─────────────────────────────────────
 *
 * On Android the notification is a foreground service: it is what tells the
 * system this work is deliberate, and it is why the download survives the
 * app going into the background. iOS has neither a progress notification
 * nor a way for a JavaScript download to continue once the app is
 * suspended, so there is nothing here to show — the in-app progress on the
 * Quran screen is the whole story on that platform, and pretending
 * otherwise with a notification that cannot update would be worse than
 * saying nothing.
 *
 * ── TWO NOTIFICATIONS, NOT ONE ID USED TWICE ──────────────────────────
 *
 * Reported 2026-09-04: the "Downloading the Quran text" bar was still in
 * the shade after the download had finished.
 *
 * The progress bar and the final word used to share an id. Replacing one
 * with the other looks like the tidy thing to do — the bar becomes the
 * result, in place — but the progress notification is not an ordinary
 * notification: it IS the foreground service. Cancelling it asks Android
 * to tear a service down, which has not happened by the time the next line
 * runs, and posting the same id back into that gap hands the new
 * notification the old one's ongoing flag. What is left is a notification
 * that says the download finished and cannot be swiped away, or one that
 * still says it is running and never changes again.
 *
 * So the result gets an id of its own. The bar is cancelled and stays
 * cancelled, and nothing the finished run posts can inherit anything from
 * the service.
 *
 * ── AND ONE THAT OUTLIVED THE PROCESS ─────────────────────────────────
 *
 * The other way to be left with a stuck bar is for the app to die while it
 * is up — a crash, a Force stop, or an `adb install -r` over the top of a
 * running download. Nothing then runs `finishDownloadNotification`, and an
 * ongoing notification with no process behind it cannot even be swiped
 * away. `clearStaleDownloadNotification` is called once at startup for
 * exactly that: if we are only now booting, no download of ours is
 * running, so any bar in the shade is a ghost.
 */
import { Platform } from 'react-native';
import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
} from '@notifee/react-native';
import i18n from '../i18n';

/**
 * The bar. Ongoing, and the foreground service's own notification —
 * cancelling it stops the service, which is why nothing else may share it.
 */
const PROGRESS_ID = 'mihrab.quran.download';
/** The result. An ordinary notification the user can swipe away. */
const DONE_ID = 'mihrab.quran.download.done';
const CHANNEL_ID = 'mihrab.quran.download';

/** Resolves the foreground-service task; see `foregroundServiceTask`. */
let releaseService: (() => void) | null = null;
/** The last percent published, so a 604-page run posts ~100 updates. */
let lastPercent = -1;

function supported(): boolean {
  return Platform.OS === 'android';
}

async function ensureChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: i18n.t('quran.downloadChannelName'),
    description: i18n.t('quran.downloadChannelDesc'),
    // LOW: it is a progress bar, not news. It must appear in the shade and
    // never make a sound — this thing updates a hundred times.
    importance: AndroidImportance.LOW,
  });
}

/**
 * What notifee runs while the service is up.
 *
 * It has to be registered before the first notification is displayed and
 * it has to return a promise that stays pending for as long as the work
 * does — resolving it is what lets the system tear the service down.
 */
export function foregroundServiceTask(): Promise<void> {
  return new Promise<void>(resolve => {
    releaseService = resolve;
  });
}

/**
 * Post or update the bar.
 *
 * `onlyAlertOnce` and the percent guard between them keep this quiet: the
 * shade redraws, nothing buzzes, and a page is a third of a pixel on the
 * bar anyway.
 *
 * `body` comes from the caller because the unit does not: the mushaf
 * counts pages and a recitation counts ayahs, and a bar that says "pages"
 * while it downloads audio is a small lie that is easy to leave in.
 */
export async function publishDownloadProgress(input: {
  done: number;
  total: number;
  label: string;
  body: string;
}): Promise<void> {
  if (!supported()) return;
  const total = Math.max(1, input.total);
  const done = Math.max(0, Math.min(total, input.done));
  const percent = Math.floor((done / total) * 100);
  if (percent === lastPercent && done !== total) return;
  lastPercent = percent;
  try {
    await ensureChannel();
    await notifee.displayNotification({
      id: PROGRESS_ID,
      title: input.label,
      body: input.body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_prayer',
        ongoing: true,
        onlyAlertOnce: true,
        localOnly: true,
        // The service is what keeps the download alive with the app in the
        // background; without it Android is free to freeze the process the
        // moment the user switches away.
        asForegroundService: true,
        // Named here as well as declared in the manifest.
        //
        // The manifest says which types this service MAY take; a
        // startForeground call says which one it IS taking, and Android has
        // been tightening the difference since 14. Downloading a book is
        // dataSync by any reading of Google's list.
        //
        // Honest about what this does today: on the notifee build in this
        // tree the platform still logs the service as untyped, so the
        // manifest entry is what actually authorises it and the download
        // does survive being backgrounded — watched, on a real run, from
        // Isha until it finished. This is the call-site half of the same
        // statement, which is what the platform will eventually want and
        // what the next notifee that forwards it will pass through.
        foregroundServiceTypes: [
          AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        ],
        progress: { max: total, current: done },
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch {
    // A refused POST_NOTIFICATIONS permission must not stop the download.
    // The screen still shows the bar; the shade simply stays empty.
  }
}

/**
 * Take the bar down, whatever state it is in.
 *
 * All three steps, in this order, and none allowed to stop the others: the
 * task's promise is resolved so the service MAY stop, the service is asked
 * to stop, and the notification is cancelled in case it survived either.
 * Called on the way out of a download and again at startup, where there is
 * no download and possibly no service — so every step has to be a no-op
 * when there is nothing to do.
 */
async function tearDownProgress(): Promise<void> {
  lastPercent = -1;
  releaseService?.();
  releaseService = null;
  await notifee.stopForegroundService().catch(() => undefined);
  await notifee.cancelNotification(PROGRESS_ID).catch(() => undefined);
}

/**
 * The last word: what landed, and no ongoing flag.
 *
 * A finished download that leaves its progress notification behind reads
 * as one that stalled, so the bar is taken down first and the result is
 * posted under an id of its own — see the header for why sharing one was
 * the bug. A cancelled run leaves nothing at all, because the user already
 * knows.
 *
 * The four strings are optional because the mushaf's wording was here
 * first and is still the default; a recitation passes its own, which name
 * the reciter.
 */
export async function finishDownloadNotification(input: {
  complete: boolean;
  cancelled: boolean;
  failed: number;
  doneTitle?: string;
  doneBody?: string;
  incompleteTitle?: string;
  incompleteBody?: string;
}): Promise<void> {
  lastPercent = -1;
  if (!supported()) return;
  try {
    await tearDownProgress();
    if (input.cancelled) return;
    await ensureChannel();
    await notifee.displayNotification({
      id: DONE_ID,
      title: input.complete
        ? (input.doneTitle ?? i18n.t('quran.downloadDoneTitle'))
        : (input.incompleteTitle ?? i18n.t('quran.downloadIncompleteTitle')),
      body: input.complete
        ? (input.doneBody ?? i18n.t('quran.downloadDoneBody'))
        : (input.incompleteBody ??
          i18n.t('quran.downloadIncompleteBody', { count: input.failed })),
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_prayer',
        localOnly: true,
        // Swipeable, and gone once tapped. It is a receipt, not a state.
        autoCancel: true,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch {
    // Same as above: the download is what matters, not the report.
  }
}

/**
 * Clear a progress bar left over from a process that is no longer here.
 *
 * Safe to call unconditionally at startup: this module is the only thing
 * that posts PROGRESS_ID, and it has not posted one yet in this process,
 * so anything under that id belongs to a run that cannot resume. An
 * ongoing notification whose process is gone is also one the user cannot
 * dismiss themselves, which is why it has to be us.
 */
export async function clearStaleDownloadNotification(): Promise<void> {
  if (!supported()) return;
  try {
    await tearDownProgress();
  } catch {
    // Nothing here is worth failing a cold start over.
  }
}
