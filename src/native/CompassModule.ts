/**
 * Typed wrapper for the native CompassModule, which now exists on BOTH
 * platforms and speaks the same event either side: `CompassHeading` with
 * `{ heading, accuracy }`, heading in degrees clockwise from TRUE north,
 * accuracy in degrees with negative meaning "do not trust this".
 *
 * The one asymmetry is where true north comes from. CoreLocation knows
 * the device's location already and corrects for declination itself, so
 * iOS takes no arguments. Android's SensorManager reports MAGNETIC north
 * and leaves the correction to the caller, so the module has to be told
 * where the user is — hence `startUpdates(latitude, longitude)` there.
 *
 * Passing arguments a native method does not declare is a bridge error
 * rather than a no-op, so the platform branch lives here, once, instead
 * of at every call site.
 */
import { NativeModules, Platform } from 'react-native';

type NativeCompass = {
  startUpdates(latitude?: number, longitude?: number): void;
  stopUpdates(): void;
};

const Native = (NativeModules.CompassModule as NativeCompass | null) ?? null;

export interface CompassModuleInterface {
  /**
   * Start streaming heading updates via the 'CompassHeading' event.
   *
   * @param latitude  used on Android for the magnetic declination; ignored
   *                  on iOS, where CoreLocation has already applied it.
   * @param longitude as above.
   */
  startUpdates(latitude: number, longitude: number): void;
  /** Stop streaming and release the sensors. */
  stopUpdates(): void;
}

export const CompassModule: CompassModuleInterface | null = Native
  ? {
      startUpdates(latitude: number, longitude: number) {
        if (Platform.OS === 'android') {
          Native.startUpdates(latitude, longitude);
        } else {
          Native.startUpdates();
        }
      },
      stopUpdates() {
        Native.stopUpdates();
      },
    }
  : null;

/**
 * The raw module, for `NativeEventEmitter` — it needs the real
 * NativeModule object (with addListener / removeListeners), not the
 * wrapper above.
 */
export const CompassNativeModule = Native;
