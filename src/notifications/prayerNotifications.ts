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
import type { TimingsMap } from '../types/prayer';
import {
  buildPrePrayerReminderEvents,
  buildUpcomingSalahEvents,
} from '../utils/prayerTimes';

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

export async function syncPrayerNotifications(params: {
  enabled: boolean;
  prePrayerReminderMinutes: number;
  notificationSound: NotificationSoundId;
  today: TimingsMap;
  tomorrow?: TimingsMap;
}): Promise<void> {
  await notifee.cancelTriggerNotifications();
  if (!params.enabled) {
    return;
  }
  if (Platform.OS === 'ios') {
    const n = await notifee.getNotificationSettings();
    if (!iosNotificationsAllowed(n.authorizationStatus)) {
      return;
    }
  }
  await ensureChannel(params.notificationSound);
  const sound = getNotificationSoundOption(params.notificationSound);
  const exactAlarms = await canUseExactAlarms();
  const now = new Date();
  const salahEvents = buildUpcomingSalahEvents(
    params.today,
    params.tomorrow,
    now,
  );
  const reminderMinutes = Math.max(0, Math.floor(params.prePrayerReminderMinutes));
  const reminderEvents =
    reminderMinutes > 0
      ? buildPrePrayerReminderEvents(salahEvents, reminderMinutes, now)
      : [];

  for (const e of salahEvents) {
    const notificationId = `pt-${e.at.getTime()}-${e.name}`;
    await notifee.createTriggerNotification(
      {
        id: notificationId,
        title: e.name,
        body: i18n.t('alertCopy.atPrayer'),
        ios: {
          sound: sound.iosSound,
        },
        android: {
          channelId: sound.androidChannelId,
          smallIcon: 'ic_stat_prayer',
          pressAction: { id: 'default' },
        },
      },
      buildTimestampTrigger(e.at.getTime(), exactAlarms),
    );
  }

  for (const e of reminderEvents) {
    const notificationId = `pt-pre-${e.at.getTime()}-${e.name}`;
    await notifee.createTriggerNotification(
      {
        id: notificationId,
        title: e.name,
        body: i18n.t('alertCopy.prePrayer', {
          count: reminderMinutes,
        }),
        ios: {
          sound: sound.iosSound,
        },
        android: {
          channelId: sound.androidChannelId,
          smallIcon: 'ic_stat_prayer',
          pressAction: { id: 'default' },
        },
      },
      buildTimestampTrigger(e.at.getTime(), exactAlarms),
    );
  }
}
