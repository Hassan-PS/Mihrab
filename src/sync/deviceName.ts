/**
 * What this device calls itself in someone else's paired list.
 *
 * A list of six-digit fingerprints is technically sufficient and humanly
 * useless: nobody knows which of their devices is 481902. The name is the
 * part that makes "remove this one" a decision the user can actually make,
 * so it travels in the envelope header — in the clear, because it has to be
 * readable before the receiving device has any reason to trust the sender.
 *
 * IT IS A LABEL, NEVER AN IDENTITY. Two devices may claim the same name and
 * nothing breaks; the public key is the identity and the name is decoration
 * on top of it. Nothing anywhere may key off it.
 *
 * The user can change it, and until they do it is the platform's word for
 * what this thing is. "iPad" is a better first guess than "Device 2", and a
 * worse one than what its owner would have typed — which is why the field
 * exists.
 */
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Plaintext, unlike the identity and the peer list.
 *
 * Nothing here is worth the Keychain: it is a display label the user chose,
 * it is already published to every paired device, and keeping it in
 * AsyncStorage means a failed secure read cannot cost the Sync screen its
 * title.
 */
const DEVICE_NAME_KEY = 'mihrab.sync.deviceName.v1';

/** Long enough for "Hassan's old iPad", short enough not to break a row. */
export const MAX_DEVICE_NAME = 40;

/**
 * What this device calls itself, before the user says otherwise.
 *
 * Asked of the OS rather than guessed from the platform: "Hassan's Pixel"
 * is a name someone recognises in a list on another phone, and "Android
 * phone" is not. It arrives as a constant, so there is no bridge round trip.
 *
 * iOS gives less than it looks like it does — since iOS 16, `UIDevice.name`
 * returns the model name to any app without the user-assigned device name
 * entitlement, so this is usually just "iPhone" there. That is still no
 * worse than the guess it replaces, and the field is one tap away.
 */
/**
 * The words iOS hands back when it is naming a model rather than a device.
 *
 * Useless on a Mac, and worse than useless: `UIDevice.name` on Catalyst
 * answers "iPad", so the Homebrew build introduced itself to every device it
 * paired with as an iPad. The Catalyst branch below was written for this and
 * never ran, because a native answer arrived first and looked real.
 */
const IOS_MODEL_WORDS = new Set(['ipad', 'iphone', 'ipod touch', 'ipod']);

export function defaultDeviceName(): string {
  const native = NativeModules.PrayerBuildInfo as
    | { deviceName?: string }
    | undefined;
  const given = native?.deviceName?.trim();
  const modelWord = given ? IOS_MODEL_WORDS.has(given.toLowerCase()) : false;
  // `isMacCatalyst` only exists on the iOS Platform type, so the OS check
  // has to come first for TypeScript as well as for correctness.
  const catalyst = Platform.OS === 'ios' && Platform.isMacCatalyst === true;
  // A real name wins. A model word does not, on the one platform where the
  // model is a different kind of computer from the one in front of you.
  if (given && !(catalyst && modelWord)) {
    return given.slice(0, MAX_DEVICE_NAME);
  }
  // Nothing usable from the platform: an older build of the native module, a
  // device with no name set anywhere, or a Mac being called an iPad.
  if (Platform.OS === 'ios') {
    // Catalyst reports 'ios' with `isMacCatalyst` set — the Homebrew build
    // pairs like any other device and should not claim to be an iPad.
    if (catalyst) return 'Mac';
    if (Platform.isPad) return 'iPad';
    return 'iPhone';
  }
  if (Platform.OS === 'android') return 'Android phone';
  return 'Mihrab';
}

let cached: string | null = null;

/** This device's name, falling back to the platform's guess. */
export async function getDeviceName(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_NAME_KEY);
    const trimmed = stored?.trim();
    cached = trimmed ? trimmed : defaultDeviceName();
  } catch {
    cached = defaultDeviceName();
  }
  return cached;
}

/**
 * Rename this device. An empty name resets it to the platform's guess
 * rather than leaving a blank row on somebody else's screen.
 */
export async function setDeviceName(name: string): Promise<string> {
  const trimmed = name.trim().slice(0, MAX_DEVICE_NAME);
  const next = trimmed || defaultDeviceName();
  cached = next;
  try {
    await AsyncStorage.setItem(DEVICE_NAME_KEY, next);
  } catch {
    // A failed write costs the name on next launch and nothing else. It is
    // not worth failing a rename the user can see took effect.
  }
  return next;
}

/** For tests. */
export function forgetCachedDeviceName(): void {
  cached = null;
}
