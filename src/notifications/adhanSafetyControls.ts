import notifee, {
  EventType,
  type Event,
  type Notification,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import i18n from '../i18n';
import { loadSettings, saveSettings } from '../settings/storage';

export const ADHAN_CONTROLS_CATEGORY_ID = 'adhan_controls';
export const ADHAN_ACTION_STOP = 'adhan_stop';
export const ADHAN_ACTION_DISABLE = 'adhan_disable';

function isAdhanPrayerNotification(notification?: Notification): boolean {
  const data = notification?.data ?? {};
  return data.kind === 'prayer_time' && data.usesAdhan === '1';
}

async function disableAdhanAndClose(notificationId?: string) {
  if (notificationId) {
    await notifee.cancelNotification(notificationId);
  }
  const settings = await loadSettings();
  if (settings.notificationSound !== 'default') {
    await saveSettings({ ...settings, notificationSound: 'default' });
  }
}

async function handleAdhanAction(event: Event) {
  const { type, detail } = event;
  const notification = detail.notification;
  if (type === EventType.DISMISSED && isAdhanPrayerNotification(notification)) {
    await disableAdhanAndClose();
    return;
  }
  if (type !== EventType.ACTION_PRESS) {
    return;
  }
  const pressId = detail.pressAction?.id;
  if (!isAdhanPrayerNotification(notification)) {
    return;
  }
  if (pressId === ADHAN_ACTION_STOP) {
    if (notification?.id) {
      await notifee.cancelNotification(notification.id);
    }
    return;
  }
  if (pressId === ADHAN_ACTION_DISABLE) {
    await disableAdhanAndClose(notification?.id);
  }
}

let registered = false;

export function registerAdhanSafetyControls() {
  if (registered) {
    return;
  }
  registered = true;

  if (Platform.OS === 'ios') {
    void notifee.setNotificationCategories([
      {
        id: ADHAN_CONTROLS_CATEGORY_ID,
        actions: [
          {
            id: ADHAN_ACTION_STOP,
            title: i18n.t('alertCopy.adhanStopAction'),
            foreground: false,
          },
          {
            id: ADHAN_ACTION_DISABLE,
            title: i18n.t('alertCopy.adhanDisableAction'),
            foreground: false,
            destructive: true,
          },
        ],
      },
    ]);
  }

  notifee.onForegroundEvent(event => {
    void handleAdhanAction(event);
  });

  notifee.onBackgroundEvent(async event => {
    await handleAdhanAction(event);
  });
}
