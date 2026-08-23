/**
 * The Quran download, as the system sees it.
 *
 * ── WHY A NOTIFICATION AT ALL ─────────────────────────────────────────
 *
 * The mushaf is six hundred and four pages and the fonts are a hundred and
 * eighty megabytes: this is a download people start and then go and do
 * something else. Until now "something else" meant leaving the Quran
 * screen, which cancelled it — so the only way to get the whole book was to
 * sit and watch a progress bar. A notification is what makes the download
 * something the phone is doing rather than something the screen is doing.
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
 */
import { Platform } from 'react-native';
import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
} from '@notifee/react-native';
import i18n from '../i18n';

const NOTIFICATION_ID = 'mihrab.quran.download';
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
 */
export async function publishDownloadProgress(input: {
  done: number;
  total: number;
  label: string;
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
      id: NOTIFICATION_ID,
      title: input.label,
      body: i18n.t('quran.downloadProgress', { done, total }),
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
 * The last word: what landed, and no ongoing flag.
 *
 * A finished download that leaves its progress notification behind reads
 * as one that stalled, so the bar is replaced rather than updated — and a
 * cancelled one leaves nothing at all, because the user already knows.
 */
export async function finishDownloadNotification(input: {
  complete: boolean;
  cancelled: boolean;
  failed: number;
}): Promise<void> {
  lastPercent = -1;
  if (!supported()) return;
  try {
    releaseService?.();
    releaseService = null;
    await notifee.stopForegroundService().catch(() => undefined);
    await notifee.cancelNotification(NOTIFICATION_ID).catch(() => undefined);
    if (input.cancelled) return;
    await ensureChannel();
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: input.complete
        ? i18n.t('quran.downloadDoneTitle')
        : i18n.t('quran.downloadIncompleteTitle'),
      body: input.complete
        ? i18n.t('quran.downloadDoneBody')
        : i18n.t('quran.downloadIncompleteBody', { count: input.failed }),
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_prayer',
        localOnly: true,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch {
    // Same as above: the download is what matters, not the report.
  }
}
