import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
  TriggerType,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import i18n from '../i18n';
import type { TimingsMap } from '../types/prayer';
import {
  buildPrePrayerReminderEvents,
  buildUpcomingSalahEvents,
} from '../utils/prayerTimes';

const CHANNEL_ID = 'prayer-times';

async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Prayer times',
    importance: AndroidImportance.HIGH,
    vibration: true,
  });
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
  today: TimingsMap;
  tomorrow?: TimingsMap;
}): Promise<void> {
  await notifee.cancelTriggerNotifications();
  if (!params.enabled) {
    return;
  }
  await ensureChannel();
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
        android: {
          channelId: CHANNEL_ID,
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
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: 'default' },
        },
      },
      buildTimestampTrigger(e.at.getTime(), exactAlarms),
    );
  }
}
