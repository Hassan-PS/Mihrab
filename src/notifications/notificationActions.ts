/**
 * Snooze rescheduling for the adhan / prayer alerts.
 *
 * A prayer notification carries a "Snooze" action (Android RemoteInput with
 * quick choices + free-form typing; iOS text-input category action). When the
 * user snoozes, the press is caught in `adhanSafetyControls` and routed here to
 * re-fire the SAME prayer alert after the chosen number of minutes.
 *
 * Self-contained on purpose (its own AlarmManager trigger + action rebuild) so
 * it never imports `prayerNotifications` / `adhanSafetyControls` — that keeps
 * the module graph acyclic (see `adhanActionIds.ts`).
 */
import notifee, {
  AlarmType,
  AndroidStyle,
  TriggerType,
  type Notification,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import i18n from '../i18n';
import { ADHAN_CONTROLS_CATEGORY_ID } from './adhanActionIds';
import { prayerAlertActions } from './prayerAlertActions';

/** Ids of snoozed re-fires — deliberately NOT the `pt-` prefix used by the
 *  scheduled day, so a full resync (which cancels obsolete `pt-` triggers)
 *  never wipes a pending snooze. */
const SNOOZE_ID_PREFIX = 'adhan-snooze-';

// The presets, the chip labels and the parser all live in
// `prayerAlertActions` now, beside the buttons they describe. Re-exported
// here because `adhanSafetyControls` has imported the parser from this
// module since before that file existed.
export {
  SNOOZE_PRESETS,
  parseSnoozeMinutes,
  snoozeChoiceLabel,
} from './prayerAlertActions';

/** AlarmManager-backed timestamp trigger so the snooze is punctual even under
 *  aggressive OEM battery managers (mirrors prayerNotifications). */
function snoozeTrigger(timestamp: number) {
  const trigger: {
    type: typeof TriggerType.TIMESTAMP;
    timestamp: number;
    alarmManager?: { type: AlarmType };
  } = { type: TriggerType.TIMESTAMP, timestamp };
  if (Platform.OS === 'android') {
    trigger.alarmManager = { type: AlarmType.SET_AND_ALLOW_WHILE_IDLE };
  }
  return trigger;
}

/**
 * Re-fire a prayer alert `minutes` from now, reusing the original's title,
 * body, channel/sound and data.
 *
 * The re-fire carries the SAME buttons as the alert it replaces. It used to
 * build its own shorter set and lose the log actions, so snoozing a prayer
 * quietly cost you the ability to log it from the notification — the one
 * thing a person who has just asked to be reminded is most likely to want
 * when the reminder arrives.
 */
export async function snoozePrayerNotification(
  notification: Notification | undefined,
  minutes: number,
): Promise<void> {
  if (!notification) return;
  const at = Date.now() + minutes * 60_000;
  const title = notification.title ?? '';
  const body = notification.body ?? i18n.t('alertCopy.atPrayer', 'Prayer time');
  const data = (notification.data ?? {}) as Record<string, string>;
  const channelId = notification.android?.channelId ?? 'prayer-times-default';
  const iosSound = notification.ios?.sound;
  // The prayer name travels in the payload; without it there is nothing to
  // log, so the re-fire falls back to a snooze-only button.
  const prayer = typeof data.prayer === 'string' ? data.prayer : '';
  const actions = prayerAlertActions(prayer);

  await notifee.createTriggerNotification(
    {
      id: `${SNOOZE_ID_PREFIX}${at}`,
      title,
      body,
      data,
      ios: {
        ...(iosSound ? { sound: iosSound } : {}),
        // Real prayers carry the Stop + Snooze category; harmless on plain ones.
        categoryId: ADHAN_CONTROLS_CATEGORY_ID,
      },
      android: {
        channelId,
        smallIcon: 'ic_stat_prayer',
        pressAction: { id: 'default' },
        style: { type: AndroidStyle.BIGTEXT, text: body },
        actions,
        // A snoozed alert shouldn't linger for hours if the user ignores it.
        timeoutAfter: 60 * 60_000,
      },
    },
    snoozeTrigger(at),
  );
}
