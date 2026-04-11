import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
  TriggerType,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import type { TimingsMap } from '../types/prayer';
import { buildUpcomingSalahEvents } from '../utils/prayerTimes';

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

export async function syncPrayerNotifications(params: {
  enabled: boolean;
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
  const events = buildUpcomingSalahEvents(
    params.today,
    params.tomorrow,
    now,
  );
  for (const e of events) {
    const notificationId = `pt-${e.at.getTime()}-${e.name}`;
    const trigger = {
      type: TriggerType.TIMESTAMP as const,
      timestamp: e.at.getTime(),
    };
    if (Platform.OS === 'android' && exactAlarms) {
      Object.assign(trigger, {
        alarmManager: {
          type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE,
        },
      });
    }
    await notifee.createTriggerNotification(
      {
        id: notificationId,
        title: e.name,
        body: 'Prayer time',
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: 'default' },
        },
      },
      trigger,
    );
  }
}
