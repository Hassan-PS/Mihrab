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
import {
  ADHAN_ACTION_STOP,
  ADHAN_ACTION_SNOOZE,
  ADHAN_CONTROLS_CATEGORY_ID,
} from './adhanActionIds';

/** Ids of snoozed re-fires — deliberately NOT the `pt-` prefix used by the
 *  scheduled day, so a full resync (which cancels obsolete `pt-` triggers)
 *  never wipes a pending snooze. */
const SNOOZE_ID_PREFIX = 'adhan-snooze-';

/** Quick-choice minute presets offered on the snooze action. */
export const SNOOZE_PRESETS = ['5', '10', '15', '30'];
/** Used when the user snoozes without typing/choosing a value. */
const SNOOZE_DEFAULT_MIN = 10;
/** Hard clamp so a fat-fingered "9999" can't schedule days out. */
const SNOOZE_MAX_MIN = 180;

/**
 * Parse the minute count from a notification action's text input (Android
 * RemoteInput or iOS text-input action). Falls back to a sane default and
 * clamps to [1, 180]. Accepts "10", " 10 ", "10 min" → 10.
 */
export function parseSnoozeMinutes(
  input: unknown,
  fallback: number = SNOOZE_DEFAULT_MIN,
): number {
  if (typeof input !== 'string') return fallback;
  const n = parseInt(input.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, SNOOZE_MAX_MIN);
}

/** Android snooze RemoteInput: quick chips + free-form typing. */
function androidSnoozeInput() {
  return {
    allowFreeFormInput: true,
    choices: SNOOZE_PRESETS,
    placeholder: i18n.t('alertCopy.snoozeMinutes', 'Minutes'),
  };
}

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
 * body, channel/sound and data. The re-fire itself carries the Snooze (and,
 * for adhan prayers, Stop) actions so it can be snoozed again.
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
  const usesAdhan = data.usesAdhan === '1';
  const channelId = notification.android?.channelId ?? 'prayer-times-default';
  const iosSound = notification.ios?.sound;

  const actions: Array<{
    title: string;
    pressAction: { id: string };
    input?: ReturnType<typeof androidSnoozeInput>;
  }> = [];
  if (usesAdhan) {
    actions.push({
      title: i18n.t('alertCopy.adhanStopAction', 'Stop adhan'),
      pressAction: { id: ADHAN_ACTION_STOP },
    });
  }
  actions.push({
    title: i18n.t('alertCopy.snoozeAction', 'Snooze'),
    pressAction: { id: ADHAN_ACTION_SNOOZE },
    input: androidSnoozeInput(),
  });

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
