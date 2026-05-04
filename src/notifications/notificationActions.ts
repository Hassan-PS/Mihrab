/**
 * Adhan notification action handlers — task #24.
 *
 * Notifee renders the adhan notification with three inline actions:
 *   • SNOOZE_5 — re-schedules the same notification 5 minutes later.
 *   • SILENT_NEXT — suppresses audio for the NEXT prayer only (one-shot).
 *   • DISMISS — standard dismiss (no handler needed; OS clears the banner).
 *
 * The handlers here encode the side-effect logic. Wiring lives in
 * `index.js`'s top-level `notifee.onBackgroundEvent` registration (which is
 * already required by notifee for actions to fire reliably).
 */

import notifee, { TriggerType } from '@notifee/react-native';
import {
  ADHAN_ACTION_DISABLE,
  ADHAN_ACTION_STOP,
  ADHAN_CONTROLS_CATEGORY_ID,
} from './adhanSafetyControls';

export const ACTION_SNOOZE_5 = 'adhan.snooze.5';
export const ACTION_SILENT_NEXT = 'adhan.silentNext';

/** Re-export existing actions for callers that wire actions in one place. */
export { ADHAN_ACTION_STOP, ADHAN_ACTION_DISABLE, ADHAN_CONTROLS_CATEGORY_ID };

const SILENT_FLAG_KEY_PREFIX = '__silent_next_';

/**
 * In-memory flag for the "silence next adhan" toggle. Persists for the
 * lifetime of the JS runtime — long enough to survive between the user
 * tapping "Silent next" and the next prayer firing on Android. iOS
 * notifications don't re-enter the JS runtime, so this is best-effort.
 */
const silentFlags: Record<string, boolean> = {};

export function markSilentForPrayer(prayerName: string): void {
  silentFlags[`${SILENT_FLAG_KEY_PREFIX}${prayerName}`] = true;
}

export function consumeSilentForPrayer(prayerName: string): boolean {
  const key = `${SILENT_FLAG_KEY_PREFIX}${prayerName}`;
  if (silentFlags[key]) {
    delete silentFlags[key];
    return true;
  }
  return false;
}

/**
 * Schedule a snooze: same notification 5 minutes later, same channel/sound.
 * Re-uses the original notification's id with a `+snooze` suffix so multiple
 * snoozes don't pile up.
 */
export async function snoozeAdhan(
  notificationId: string,
  prayerName: string,
  minutesLater: number = 5,
): Promise<void> {
  const triggerAt = Date.now() + minutesLater * 60_000;
  await notifee.createTriggerNotification(
    {
      id: `${notificationId}+snooze`,
      title: prayerName,
      body: '',
      android: { channelId: 'prayer_default', smallIcon: 'ic_stat_prayer' },
    },
    { type: TriggerType.TIMESTAMP, timestamp: triggerAt },
  );
}

/** Top-level action dispatcher used by `notifee.onBackgroundEvent`. */
export async function handleNotificationAction(
  actionId: string,
  notificationId: string,
  prayerName: string,
): Promise<void> {
  if (actionId === ACTION_SNOOZE_5) {
    await snoozeAdhan(notificationId, prayerName, 5);
    return;
  }
  if (actionId === ACTION_SILENT_NEXT) {
    markSilentForPrayer(prayerName);
    return;
  }
  // STOP / DISABLE actions are handled by the existing adhanSafetyControls
  // module; this dispatcher just surfaces the action identifiers in one place.
}
