/**
 * JS wrapper around the `CustomAdhan` native module — the user's own adhan
 * recording.
 *
 * The native side does the whole import in one call: it opens the system
 * document picker, copies what comes back into the app's own storage, and — on
 * iOS — decodes and rewrites it as a CAF short enough for a notification
 * sound. That is deliberate. Handing a picked URI back to JS and copying it
 * from here would mean holding a permission grant across a bridge hop, and on
 * iOS it would mean doing an audio conversion in JavaScript, which is not a
 * thing.
 *
 * Every method degrades to "there is no custom adhan" when the module is
 * missing, so a build without it behaves like a user who never imported one.
 */

import { NativeModules, Platform } from 'react-native';
import {
  registerCustomAdhan,
  type CustomAdhanSound,
} from '../notifications/notificationSounds';

type CustomAdhanNative = {
  pick(): Promise<CustomAdhanSound | null>;
  current(): Promise<CustomAdhanSound | null>;
  remove(): Promise<boolean>;
  ensureChannel(channelName: string): Promise<string | null>;
  ensureAlarmChannel(
    channelId: string,
    channelName: string,
    soundResName: string | null,
  ): Promise<string | null>;
  deleteChannel(channelId: string): Promise<null>;
};

const native: CustomAdhanNative | undefined = (
  NativeModules as Record<string, CustomAdhanNative | undefined>
).CustomAdhan;

/** Is importing a recording possible on this build at all? */
export const CUSTOM_ADHAN_SUPPORTED =
  Boolean(native) && (Platform.OS === 'android' || Platform.OS === 'ios');

function normalise(value: unknown): CustomAdhanSound | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== 'string' || typeof raw.token !== 'string')
    return null;
  return {
    name: raw.name,
    token: raw.token,
    channelId: typeof raw.channelId === 'string' ? raw.channelId : undefined,
    soundName: typeof raw.soundName === 'string' ? raw.soundName : undefined,
    path: typeof raw.path === 'string' ? raw.path : undefined,
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 0,
    trimmed: raw.trimmed === true,
  };
}

/**
 * Open the picker and import whatever the user chooses.
 *
 * Resolves null when they cancel — which is not an error and should not be
 * reported as one. Rejects only when the import itself failed, so the caller
 * can say why.
 */
export async function pickCustomAdhan(): Promise<CustomAdhanSound | null> {
  if (!native) return null;
  return normalise(await native.pick());
}

/** The recording currently imported, or null. */
export async function getCustomAdhan(): Promise<CustomAdhanSound | null> {
  if (!native) return null;
  try {
    return normalise(await native.current());
  } catch {
    return null;
  }
}

/** Forget the imported recording and drop the channel built for it. */
export async function removeCustomAdhan(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.remove();
  } catch {
    return false;
  }
}

/**
 * Make sure the Android notification channel for the imported recording
 * exists, and return its id. Resolves null on iOS, which needs no channel, and
 * on Android versions too old to have them.
 */
export async function ensureCustomAdhanChannel(
  channelName: string,
): Promise<string | null> {
  if (!native) return null;
  try {
    return await native.ensureChannel(channelName);
  } catch {
    // An unsupported platform version or a missing file. The caller falls
    // back to a bundled adhan rather than scheduling something silent.
    return null;
  }
}

/**
 * Make sure the ALARM-stream channel for a sound exists, and return its id.
 *
 * `soundResName` is a bundled `res/raw` name, or null to use the imported
 * recording. Resolves null wherever an alarm channel cannot be made — iOS,
 * and Android before 8 — and the caller then stays on the ordinary channel
 * rather than scheduling against one that does not exist.
 */
export async function ensureAlarmAdhanChannel(
  channelId: string,
  channelName: string,
  soundResName: string | null,
): Promise<string | null> {
  if (!native || Platform.OS !== 'android') return null;
  try {
    return await native.ensureAlarmChannel(channelId, channelName, soundResName);
  } catch {
    return null;
  }
}

/** Drop a channel this module made, so Android's notification settings do
 *  not accumulate dead entries when the setting goes back off. */
export async function deleteAdhanChannel(channelId: string): Promise<void> {
  if (!native || Platform.OS !== 'android') return;
  try {
    await native.deleteChannel(channelId);
  } catch {
    // Deleting a channel that was never created is not a failure.
  }
}

/**
 * Read what is on disk and tell the notification layer about it.
 *
 * Call this before anything that has to address the custom sound — scheduling,
 * previewing, or drawing the picker. The file can disappear between launches
 * (a reinstall drops it) while the setting that selects it survives, so the
 * registration is re-derived from the filesystem rather than persisted
 * alongside the choice.
 */
export async function syncCustomAdhan(): Promise<CustomAdhanSound | null> {
  const sound = await getCustomAdhan();
  registerCustomAdhan(sound);
  return sound;
}
