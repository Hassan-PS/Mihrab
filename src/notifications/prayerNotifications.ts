import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
  AuthorizationStatus,
  TriggerType,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import i18n from '../i18n';
import {
  getNotificationSoundOption,
  NOTIFICATION_SOUND_OPTIONS,
  type NotificationSoundId,
} from './notificationSounds';
import {
  ADHAN_ACTION_DISABLE,
  ADHAN_ACTION_STOP,
  ADHAN_CONTROLS_CATEGORY_ID,
} from './adhanSafetyControls';
import type { TimingsMap } from '../types/prayer';
import {
  buildPrePrayerReminderEvents,
  buildUpcomingSalahEvents,
} from '../utils/prayerTimes';

/** Prefix used for all prayer-time and pre-prayer trigger notification IDs.
 *  Used to identify "ours" vs other notifications (e.g. the adhan preview)
 *  in the diff-based cancellation pass.
 */
const PRAYER_NOTIFICATION_ID_PREFIX = 'pt-';

const PREVIEW_NOTIFICATION_ID = 'adhan_preview';
let _previewCancelTimeout: ReturnType<typeof setTimeout> | null = null;

async function ensureChannel(selectedSound: NotificationSoundId) {
  if (Platform.OS !== 'android') {
    return;
  }
  const selected = getNotificationSoundOption(selectedSound);
  for (const option of NOTIFICATION_SOUND_OPTIONS) {
    await notifee.createChannel({
      id: option.androidChannelId,
      name:
        option.id === selected.id
          ? `Prayer times (${i18n.t(option.labelKey)})`
          : 'Prayer times',
      importance: AndroidImportance.HIGH,
      vibration: true,
      ...(option.androidSound ? { sound: option.androidSound } : {}),
    });
  }
}

function iosNotificationsAllowed(status: AuthorizationStatus): boolean {
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

/** Re-check exact-alarm permission. Android can revoke SCHEDULE_EXACT_ALARM
 *  at runtime; this MUST be called close to scheduling, not just at boot.
 */
async function canUseExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const settings = await notifee.getNotificationSettings();
  return settings.android.alarm === AndroidNotificationSetting.ENABLED;
}

function buildTimestampTrigger(
  timestamp: number,
  exactAlarms: boolean,
): {
  type: typeof TriggerType.TIMESTAMP;
  timestamp: number;
  alarmManager?: { type: AlarmType };
} {
  const trigger = {
    type: TriggerType.TIMESTAMP as const,
    timestamp,
  };
  if (Platform.OS === 'android' && exactAlarms) {
    Object.assign(trigger, {
      alarmManager: {
        type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE,
      },
    });
  }
  return trigger;
}

/**
 * Clamp the pre-prayer reminder offset to a sane range.
 *
 * Defense-in-depth: settings.coercePrePrayerReminderMinutes already restricts
 * input to a discrete option list, but corrupted AsyncStorage, type-bypass
 * paths, or future callers might pass negative numbers, NaN, Infinity, or
 * absurdly large values. Negative reminders would fire AFTER the prayer
 * (the bug called out in task #3); huge values would create reminders many
 * hours before. Clamp to [0, 60] and reject non-finite input.
 *
 * @returns an integer in [0, 60]. Returns 0 for any invalid input.
 */
export function clampPrePrayerReminderMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const n = Math.floor(value);
  if (n <= 0) return 0;
  if (n >= 60) return 60;
  return n;
}

/**
 * Cancel any existing prayer-time / pre-prayer trigger notifications whose
 * IDs are NOT in `keepIds`. Preserves unrelated notifications (e.g. the
 * adhan preview).
 *
 * This replaces the previous `cancelTriggerNotifications()` bulk call. The
 * bulk call created a window where ALL prayer notifications vanished
 * between cancel and recreate; if the app was killed in that gap, prayer
 * alerts silently disappeared. The diff-based approach only cancels truly
 * obsolete IDs and lets `createTriggerNotification` replace existing IDs
 * atomically (notifee's documented behavior).
 */
async function cancelOwnedPrayerNotifications(keepIds: string[]): Promise<void> {
  const keep = new Set(keepIds);
  let existing;
  try {
    existing = await notifee.getTriggerNotifications();
  } catch {
    // Older notifee versions / flaky native module — fall back to bulk cancel
    // so we at least don't leak orphan notifications. Better than skipping.
    await notifee.cancelTriggerNotifications().catch(() => {});
    return;
  }
  for (const t of existing) {
    const id = t.notification?.id;
    if (typeof id !== 'string') continue;
    if (id === PREVIEW_NOTIFICATION_ID) continue; // never cancel the preview
    if (!id.startsWith(PRAYER_NOTIFICATION_ID_PREFIX)) continue; // only ours
    if (keep.has(id)) continue;
    await notifee.cancelTriggerNotification(id).catch(() => {});
  }
}

/** Play a short preview of the given adhan/notification sound. */
export async function previewAdhanSound(
  soundId: NotificationSoundId,
): Promise<void> {
  // Cancel any in-flight preview
  if (_previewCancelTimeout !== null) {
    clearTimeout(_previewCancelTimeout);
    _previewCancelTimeout = null;
  }
  await notifee.cancelNotification(PREVIEW_NOTIFICATION_ID).catch(() => {});

  await ensureChannel(soundId);
  const option = getNotificationSoundOption(soundId);

  await notifee.displayNotification({
    id: PREVIEW_NOTIFICATION_ID,
    title: i18n.t('settings.adhanPreviewTitle'),
    body: i18n.t('settings.adhanPreviewBody', { defaultValue: '' }),
    ios: { sound: option.iosSound },
    android: {
      channelId: option.androidChannelId,
      smallIcon: 'ic_stat_prayer',
      pressAction: { id: 'default' },
    },
  });

  // Auto-cancel after 30 s (adhan recordings are ~30–60 s; this clears the banner)
  _previewCancelTimeout = setTimeout(() => {
    _previewCancelTimeout = null;
    notifee.cancelNotification(PREVIEW_NOTIFICATION_ID).catch(() => {});
  }, 30000);
}

/** Cancel any in-flight adhan preview notification. */
export async function stopAdhanPreview(): Promise<void> {
  if (_previewCancelTimeout !== null) {
    clearTimeout(_previewCancelTimeout);
    _previewCancelTimeout = null;
  }
  await notifee.cancelNotification(PREVIEW_NOTIFICATION_ID).catch(() => {});
}

/**
 * Result of a sync attempt. Exposed so callers (HomeScreen) can react —
 * e.g. show an "exact-alarm permission revoked" banner when
 * `status === 'scheduled'` and `exactAlarms === false` on Android.
 */
export type SyncPrayerNotificationsResult =
  | { status: 'disabled' }
  | { status: 'ios-permission-denied' }
  | {
      status: 'scheduled';
      scheduledCount: number;
      exactAlarms: boolean;
      reminderMinutes: number;
    };

export async function syncPrayerNotifications(params: {
  enabled: boolean;
  prePrayerReminderMinutes: number;
  notificationSound: NotificationSoundId;
  today: TimingsMap;
  tomorrow?: TimingsMap;
}): Promise<SyncPrayerNotificationsResult> {
  if (!params.enabled) {
    await cancelOwnedPrayerNotifications([]);
    return { status: 'disabled' };
  }
  if (Platform.OS === 'ios') {
    const n = await notifee.getNotificationSettings();
    if (!iosNotificationsAllowed(n.authorizationStatus)) {
      await cancelOwnedPrayerNotifications([]);
      return { status: 'ios-permission-denied' };
    }
  }
  await ensureChannel(params.notificationSound);
  const prayerTimeSound = getNotificationSoundOption(params.notificationSound);
  const reminderSound = getNotificationSoundOption('default');
  const exactAlarms = await canUseExactAlarms();
  const now = new Date();
  const salahEvents = buildUpcomingSalahEvents(
    params.today,
    params.tomorrow,
    now,
  );
  const reminderMinutes = clampPrePrayerReminderMinutes(
    params.prePrayerReminderMinutes,
  );
  const reminderEvents =
    reminderMinutes > 0
      ? buildPrePrayerReminderEvents(salahEvents, reminderMinutes, now)
      : [];

  // Compute desired ID set BEFORE cancelling, so we know which existing
  // notifications to keep. createTriggerNotification with the same ID
  // replaces atomically (no cancel/recreate gap).
  const desiredIds = new Set<string>();
  for (const e of salahEvents) {
    desiredIds.add(`${PRAYER_NOTIFICATION_ID_PREFIX}${e.at.getTime()}-${e.name}`);
  }
  for (const e of reminderEvents) {
    desiredIds.add(
      `${PRAYER_NOTIFICATION_ID_PREFIX}pre-${e.at.getTime()}-${e.name}`,
    );
  }
  await cancelOwnedPrayerNotifications([...desiredIds]);

  for (const e of salahEvents) {
    const notificationId = `${PRAYER_NOTIFICATION_ID_PREFIX}${e.at.getTime()}-${e.name}`;
    const usesAdhan = prayerTimeSound.id !== 'default';
    await notifee.createTriggerNotification(
      {
        id: notificationId,
        title: e.name,
        body: i18n.t('alertCopy.atPrayer'),
        data: {
          kind: 'prayer_time',
          usesAdhan: usesAdhan ? '1' : '0',
        },
        ios: {
          sound: prayerTimeSound.iosSound,
          ...(usesAdhan ? { categoryId: ADHAN_CONTROLS_CATEGORY_ID } : {}),
        },
        android: {
          channelId: prayerTimeSound.androidChannelId,
          smallIcon: 'ic_stat_prayer',
          pressAction: { id: 'default' },
          ...(usesAdhan
            ? {
                actions: [
                  {
                    title: i18n.t('alertCopy.adhanStopAction'),
                    pressAction: { id: ADHAN_ACTION_STOP },
                  },
                  {
                    title: i18n.t('alertCopy.adhanDisableAction'),
                    pressAction: { id: ADHAN_ACTION_DISABLE },
                  },
                ],
              }
            : {}),
        },
      },
      buildTimestampTrigger(e.at.getTime(), exactAlarms),
    );
  }

  for (const e of reminderEvents) {
    const notificationId = `${PRAYER_NOTIFICATION_ID_PREFIX}pre-${e.at.getTime()}-${e.name}`;
    await notifee.createTriggerNotification(
      {
        id: notificationId,
        title: e.name,
        body: i18n.t('alertCopy.prePrayer', {
          count: reminderMinutes,
        }),
        ios: {
          sound: reminderSound.iosSound,
        },
        android: {
          channelId: reminderSound.androidChannelId,
          smallIcon: 'ic_stat_prayer',
          pressAction: { id: 'default' },
        },
      },
      buildTimestampTrigger(e.at.getTime(), exactAlarms),
    );
  }

  return {
    status: 'scheduled',
    scheduledCount: salahEvents.length + reminderEvents.length,
    exactAlarms,
    reminderMinutes,
  };
}
