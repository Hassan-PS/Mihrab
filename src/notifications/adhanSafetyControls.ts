import notifee, {
  EventType,
  type Event,
  type Notification,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import i18n from '../i18n';
import { loadSettings, saveSettings } from '../settings/storage';
import { AdhanPlayer } from '../native/AdhanPlayer';

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

async function handleAdhanAction(event: Event, foreground: boolean) {
  const { type, detail } = event;
  const notification = detail.notification;
  if (!isAdhanPrayerNotification(notification)) {
    return;
  }

  // iOS only: play the FULL adhan when the user taps the notification (which
  // foregrounds the app) or when it's delivered while the app is already open.
  // iOS caps the notification's own sound at 30s, so this is how the complete
  // adhan plays. Foreground-only (no background audio) keeps it App Store-safe.
  if (
    foreground &&
    Platform.OS === 'ios' &&
    (type === EventType.PRESS || type === EventType.DELIVERED)
  ) {
    const soundId = notification?.data?.adhanSound;
    if (typeof soundId === 'string' && soundId !== 'default') {
      void AdhanPlayer.play(soundId);
    }
    return;
  }

  if (type === EventType.DISMISSED) {
    // Stop the in-app adhan + clear the banner; don't disable the preference.
    void AdhanPlayer.stop();
    if (notification?.id) {
      await notifee.cancelNotification(notification.id);
    }
    return;
  }
  if (type !== EventType.ACTION_PRESS) {
    return;
  }
  const pressId = detail.pressAction?.id;
  if (pressId === ADHAN_ACTION_STOP) {
    void AdhanPlayer.stop();
    if (notification?.id) {
      await notifee.cancelNotification(notification.id);
    }
    return;
  }
  if (pressId === ADHAN_ACTION_DISABLE) {
    void AdhanPlayer.stop();
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
        // Only the Stop action remains in the iOS category — the
        // Disable action was removed in v2.0.15 to keep the
        // notification simple. The disable-until-next-prayer
        // affordance lives in Settings instead, where it belongs.
        actions: [
          {
            id: ADHAN_ACTION_STOP,
            title: i18n.t('alertCopy.adhanStopAction'),
            foreground: false,
          },
        ],
      },
    ]);
  }

  notifee.onForegroundEvent(event => {
    void handleAdhanAction(event, true);
  });

  notifee.onBackgroundEvent(async event => {
    await handleAdhanAction(event, false);
  });
}
