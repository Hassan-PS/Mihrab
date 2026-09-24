/**
 * JS wrapper around the native `PrayerSilence` module — issue #60.
 *
 * Android puts the phone on Do Not Disturb around the prayers the reader
 * chose, and takes it off again. The whole clockwork is native, because
 * it has to run with the app closed: JS hands over the next few days'
 * windows and the words to print while one is on, and a receiver does
 * the rest from exact alarms.
 *
 * Every call degrades to a no-op on iOS (no app may touch silent mode or
 * Focus there) and on a build without the module, so callers can simply
 * call.
 */
import { NativeModules, Platform } from 'react-native';

/** One stretch of quiet, as the native side takes it. */
export type SilenceWindow = {
  /** Epoch ms. */
  start: number;
  end: number;
  /** The ongoing notification while it is on: "Silenced for Asr". */
  title: string;
  /** Its second line: "Until 16:05". */
  text: string;
};

type PrayerSilenceNative = {
  hasAccess(): Promise<boolean>;
  requestAccess(): Promise<void>;
  setWindows(
    windows: SilenceWindow[],
    endLabel: string,
    channelName: string,
  ): Promise<void>;
  clear(): Promise<void>;
  isActive(): Promise<boolean>;
};

const native: PrayerSilenceNative | undefined =
  Platform.OS === 'android'
    ? (NativeModules as Record<string, PrayerSilenceNative | undefined>)
        .PrayerSilence
    : undefined;

/** Whether this build can silence the phone at all. */
export const prayerSilenceAvailable = native != null;

/** Whether the person has granted Do Not Disturb access. */
export async function hasSilenceAccess(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.hasAccess();
  } catch {
    return false;
  }
}

/** Open the system screen where that access is granted. */
export async function requestSilenceAccess(): Promise<void> {
  if (!native) return;
  try {
    await native.requestAccess();
  } catch (e) {
    console.warn('PrayerSilence.requestAccess:', e);
  }
}

/**
 * Hand the native side the windows to keep, replacing what it had — with
 * the two strings it prints on its own: the notification's "End now"
 * action and the name of its channel in the system's notification
 * settings.
 */
export async function setSilenceWindows(
  windows: SilenceWindow[],
  labels: { endNow: string; channel: string },
): Promise<void> {
  if (!native) return;
  await native.setWindows(windows, labels.endNow, labels.channel);
}

/** Forget every window and end any quiet that is ours. */
export async function clearSilenceWindows(): Promise<void> {
  if (!native) return;
  await native.clear();
}

/** Whether a window of ours is on right now. */
export async function isSilenceActive(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isActive();
  } catch {
    return false;
  }
}
