import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Request Android location permission for automatic prayer times.
 *
 * The key subtlety (Android 12+): the system prompt offers a
 * **Precise / Approximate** toggle. A user who picks "Approximate" grants
 * `ACCESS_COARSE_LOCATION` but DENIES `ACCESS_FINE_LOCATION`. Approximate
 * location is entirely sufficient for prayer times (they're identical across
 * a city) and is exactly the Wi-Fi/cell positioning the user wants when GPS
 * is unavailable indoors — so we must NOT treat a coarse-only grant as a
 * refusal.
 *
 * We therefore request BOTH permissions and accept if EITHER is granted.
 * The old code requested FINE only and bailed on anything but a full grant,
 * which locked "Approximate location" users out of automatic mode entirely.
 *
 * Returns:
 *   • 'granted'          — fine or coarse granted; automatic location can run.
 *   • 'denied'           — user denied this time (can re-ask later).
 *   • 'never_ask_again'  — user picked "Don't allow" / permanently denied.
 * Non-Android platforms always return 'granted' (iOS is handled by the
 * geolocation library's own when-in-use prompt).
 */
export type LocationPermissionResult = 'granted' | 'denied' | 'never_ask_again';

export async function requestAndroidLocationPermission(): Promise<LocationPermissionResult> {
  if (Platform.OS !== 'android') return 'granted';
  try {
    const res = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const fine = res[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const coarse = res[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
    const G = PermissionsAndroid.RESULTS.GRANTED;
    const NEVER = PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    if (fine === G || coarse === G) return 'granted';
    if (fine === NEVER || coarse === NEVER) return 'never_ask_again';
    return 'denied';
  } catch {
    // Treat an unexpected failure as a soft denial rather than crashing the
    // location flow; the caller keeps any cached location on screen.
    return 'denied';
  }
}
