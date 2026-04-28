/**
 * Typed wrapper for the iOS native CompassModule.
 *
 * The module is only present on iOS; callers must guard with
 * `if (CompassModule)` before calling any method.
 */
import { NativeModules } from 'react-native';

export interface CompassModuleInterface {
  /** Start streaming heading updates via the 'CompassHeading' NativeEventEmitter event. */
  startUpdates(): void;
  /** Stop streaming heading updates and release sensor resources. */
  stopUpdates(): void;
}

export const CompassModule =
  NativeModules.CompassModule as CompassModuleInterface | null ?? null;
