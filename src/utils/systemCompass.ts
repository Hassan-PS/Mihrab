/**
 * Opening the device's own compass app, when it has one.
 *
 * ── WHY OFFER A RIVAL AT ALL ──────────────────────────────────────────
 *
 * Because on the question this screen exists to answer, the platform's
 * compass is usually the better instrument, and saying so is cheaper than
 * being wrong. iOS fuses CoreLocation's heading with a calibration state
 * the app cannot see; the vendor compasses on Android are tuned against
 * the specific handset's magnetometer placement. Mihrab's dial is good,
 * but "hold the phone flat, away from the car door, and cross-check
 * against the number below" is honest advice for someone deciding which
 * way to pray in an unfamiliar room.
 *
 * The BEARING is ours and is not in doubt — it is spherical trigonometry
 * on two coordinates. It is the HEADING, the sensor half, that a
 * dedicated compass may read better. So the message hands over the
 * number and lets the other app supply the needle.
 *
 * ── WHY THE BUTTON IS OFTEN ABSENT ────────────────────────────────────
 *
 * Android has never shipped a compass in AOSP and has no intent meaning
 * "show me a compass", so there is nothing generic to ask for; the native
 * module resolves a launch intent against the packages the major vendors
 * actually use, and a Pixel simply has none. iOS has Compass.app but no
 * documented URL scheme, so `compass://` is tried and believed only if
 * the system says it resolves.
 *
 * Everything here therefore reports what it COULD do rather than assuming
 * — a button that opens nothing is worse than no button.
 */
import { Linking, NativeModules, Platform } from 'react-native';

type CompassNative = {
  hasSystemCompass?: () => Promise<boolean>;
  openSystemCompass?: () => Promise<boolean>;
};

const Native = (NativeModules.CompassModule as CompassNative | null) ?? null;

/**
 * Apple's Compass app. Undocumented, so it is probed rather than trusted:
 * `canOpenURL` needs the scheme listed in LSApplicationQueriesSchemes
 * (see Info.plist) and still answers honestly if the app is unavailable,
 * which it is on iPad.
 */
const IOS_COMPASS_URL = 'compass://';

/** Can we offer to open a system compass on this device? */
export async function hasSystemCompass(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      return (await Native?.hasSystemCompass?.()) ?? false;
    }
    if (Platform.OS === 'ios') {
      return await Linking.canOpenURL(IOS_COMPASS_URL);
    }
    return false;
  } catch {
    // Probing must never be the thing that breaks the screen.
    return false;
  }
}

/** Open it. Returns false when there was nothing to open. */
export async function openSystemCompass(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      return (await Native?.openSystemCompass?.()) ?? false;
    }
    if (Platform.OS === 'ios') {
      if (!(await Linking.canOpenURL(IOS_COMPASS_URL))) return false;
      await Linking.openURL(IOS_COMPASS_URL);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
