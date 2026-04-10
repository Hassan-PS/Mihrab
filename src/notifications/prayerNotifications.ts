import notifee, {
  AlarmType,
  AndroidImportance,
  TriggerType,
} from '@notifee/react-native';
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
  const now = new Date();
  const events = buildUpcomingSalahEvents(
    params.today,
    params.tomorrow,
    now,
  );
  for (const e of events) {
    const notificationId = `pt-${e.at.getTime()}-${e.name}`;
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
      {
        type: TriggerType.TIMESTAMP,
        timestamp: e.at.getTime(),
        alarmManager: {
          type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE,
        },
      },
    );
  }
}
