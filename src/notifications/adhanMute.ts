/**
 * "Mute next adhan" — the JS half of the Live Activity toggle (Android).
 *
 * The Live Activity action button fires a native broadcast
 * (MihrabLiveActivityActionReceiver) which flips the button label and starts a
 * HeadlessJS task (AdhanMuteHeadlessService → 'AdhanMuteToggle', registered in
 * index.js). This module is that task.
 *
 * On Android the adhan is the notification-channel sound on a pre-scheduled
 * notifee trigger, so muting means re-creating that one trigger on a silent
 * channel; un-muting restores the adhan channel. We also persist the muted
 * prayer so a later full resync (syncPrayerNotifications) keeps it silent.
 */
import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** AsyncStorage key: "<epochMs>-<PrayerName>" of the muted prayer, or empty. */
export const MUTED_NEXT_ADHAN_KEY = 'mihrab.muted_next_adhan';

/** Must match PRAYER_NOTIFICATION_ID_PREFIX in prayerNotifications.ts. */
const PRAYER_NOTIFICATION_ID_PREFIX = 'pt-';
const DEFAULT_CHANNEL = 'prayer-times-default';

export type AdhanMuteTaskData = {
  epoch: number | string;
  name: string;
  muted: boolean | string;
  adhanChannelId?: string;
  defaultChannelId?: string;
  title?: string;
  body?: string;
  adhanSoundId?: string;
};

/** Read the muted-prayer marker. Returns "<epoch>-<name>" or null. */
export async function getMutedNextAdhan(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(MUTED_NEXT_ADHAN_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * HeadlessJS task body. Re-creates the next prayer's at-prayer trigger on the
 * silent (muted) or adhan (un-muted) channel, and persists the choice.
 */
export async function adhanMuteToggleTask(
  data: AdhanMuteTaskData,
): Promise<void> {
  try {
    const epoch = Number(data.epoch);
    const name = String(data.name ?? '');
    const muted = data.muted === true || data.muted === 'true';
    if (!Number.isFinite(epoch) || epoch <= 0 || !name) return;

    const marker = `${epoch}-${name}`;
    await AsyncStorage.setItem(MUTED_NEXT_ADHAN_KEY, muted ? marker : '');

    // Past events can't be changed; the marker alone is enough for any resync.
    if (epoch <= Date.now()) return;

    const channelId = muted
      ? data.defaultChannelId || DEFAULT_CHANNEL
      : data.adhanChannelId || DEFAULT_CHANNEL;

    await notifee.createTriggerNotification(
      {
        id: `${PRAYER_NOTIFICATION_ID_PREFIX}${epoch}-${name}`,
        title: data.title || name,
        body: data.body || '',
        data: {
          kind: 'prayer_time',
          usesAdhan: muted ? '0' : '1',
          adhanSound: muted ? 'default' : data.adhanSoundId || 'default',
        },
        android: {
          channelId,
          smallIcon: 'ic_stat_prayer',
          pressAction: { id: 'default' },
          importance: AndroidImportance.HIGH,
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: epoch,
        alarmManager: { allowWhileIdle: true },
      },
    );
  } catch (e) {
    console.warn('[adhanMute] toggle task failed', e);
  }
}
