import notifee, {
  EventType,
  type Event,
  type Notification,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import i18n from '../i18n';
import { loadSettings, saveSettings } from '../settings/storage';
import { AdhanPlayer } from '../native/AdhanPlayer';
import {
  ADHAN_CONTROLS_CATEGORY_ID,
  ADHAN_ACTION_STOP,
  ADHAN_ACTION_DISABLE,
  ADHAN_ACTION_SNOOZE,
} from './adhanActionIds';
import {
  parseSnoozeMinutes,
  snoozePrayerNotification,
} from './notificationActions';
import { handleEndOfDayLogEvent } from './endOfDayLog';
import { JOURNAL_LOG_ACTION_ID, handlePrayerLogEvent } from './prayerLogAction';

// Re-exported for back-compat with existing importers.
export { ADHAN_CONTROLS_CATEGORY_ID, ADHAN_ACTION_STOP, ADHAN_ACTION_DISABLE };

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

  // Snooze works for ANY prayer alert (adhan or plain), so it's handled before
  // the adhan-only guard below. Read the minutes from the action's text input
  // (Android RemoteInput / iOS text-input action); clamp + default inside.
  if (
    type === EventType.ACTION_PRESS &&
    detail.pressAction?.id === ADHAN_ACTION_SNOOZE
  ) {
    const minutes = parseSnoozeMinutes(detail.input);
    void AdhanPlayer.stop();
    if (notification?.id) {
      await notifee.cancelNotification(notification.id).catch(() => {});
    }
    await snoozePrayerNotification(notification, minutes);
    return;
  }

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
          {
            // Text-input action: iOS shows an inline field so the user can type
            // any number of minutes (there are no quick chips on iOS).
            id: ADHAN_ACTION_SNOOZE,
            title: i18n.t('alertCopy.snoozeAction', 'Snooze'),
            foreground: false,
            input: {
              buttonText: i18n.t('alertCopy.snoozeAction', 'Snooze'),
              placeholderText: i18n.t('alertCopy.snoozeMinutes', 'Minutes'),
            },
          },
          {
            // Same button Android has. The id is bare — a category's actions
            // are declared once for every notification that uses it, so the
            // prayer cannot be encoded here and is read from the payload
            // instead (see prayerForPress). `foreground: false` because the
            // whole point is to record it without opening the app.
            id: JOURNAL_LOG_ACTION_ID,
            title: i18n.t('journal.logActionTitle', 'Log prayer'),
            foreground: false,
          },
        ],
      },
    ]);
  }

  // notifee allows ONE background handler per app, so every feature that
  // needs to act on a notification press has to be dispatched from here.
  // The two journal actions must work with the app closed — that is the
  // entire point of a button on a notification — so they are answered first
  // and short-circuit when they own the event.
  //
  // Both handlers are registered on the FOREGROUND path as well. A press
  // that arrives while the app is open would otherwise fall through to the
  // adhan handler and be dropped, which is how "Log prayer" came to do
  // nothing but flash a row: the only code listening for it lived in the
  // Log screen, and the Log screen is not what you are looking at when you
  // press a button on a notification.
  const handleJournalActions = async (event: Event): Promise<boolean> =>
    (await handleEndOfDayLogEvent(event)) ||
    (await handlePrayerLogEvent(event));

  notifee.onForegroundEvent(event => {
    void handleJournalActions(event).then(handled => {
      if (!handled) void handleAdhanAction(event, true);
    });
  });

  notifee.onBackgroundEvent(async event => {
    if (await handleJournalActions(event)) return;
    await handleAdhanAction(event, false);
  });
}
