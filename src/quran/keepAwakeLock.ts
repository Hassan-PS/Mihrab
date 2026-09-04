/**
 * One counted lock over a library that only knows on and off.
 *
 * `@sayem314/react-native-keep-awake` exposes `activateKeepAwake()` and
 * `deactivateKeepAwake()` — a global flag, not a counter. That was fine
 * while the reader was the only screen that wanted the screen kept on.
 * Tilāwah wants it too now (the coffee toggle), and the two are mounted
 * together whenever Tilāwah opens the reader: Tilāwah underneath, still
 * on screen when the reader pops. The reader's unmount then called
 * `deactivate`, and the screen went dark under a page whose toggle was
 * still lit — a lock held by a screen that is gone is one bug, and a lock
 * dropped by a screen that is gone is the other one.
 *
 * So every holder goes through here. The native flag follows the COUNT:
 * on when the first holder arrives, off when the last one leaves.
 */
import {
  activateKeepAwake,
  deactivateKeepAwake,
} from '@sayem314/react-native-keep-awake';
import { NativeModules } from 'react-native';
import { useEffect } from 'react';

/**
 * WHAT THE LOCK ACTUALLY PULLS, which is not the same on every platform.
 *
 * The library's iOS half sets `UIApplication.isIdleTimerDisabled`, which
 * is exactly right on an iPhone and is ignored outright by macOS — a Mac
 * Catalyst build kept the toggle lit and the display slept on the Energy
 * Saver schedule anyway. Checked rather than assumed: with the coffee
 * cup on, `pmset -g assertions` listed nothing owned by Mihrab.
 *
 * `MihrabKeepAwake` is the app's own module and speaks both: the idle
 * timer on iOS, and on Catalyst a real `ProcessInfo` activity assertion,
 * which is the thing macOS listens to. When it is present it wins; the
 * library stays as the Android path (a `FLAG_KEEP_SCREEN_ON` on the
 * window, which is correct there) and as the fallback for any build
 * without the module.
 */
type NativeKeepAwake = { activate(): void; deactivate(): void };

const native = (NativeModules as { MihrabKeepAwake?: NativeKeepAwake })
  .MihrabKeepAwake;

function setAwake(on: boolean): void {
  if (native) {
    if (on) native.activate();
    else native.deactivate();
    return;
  }
  if (on) activateKeepAwake();
  else deactivateKeepAwake();
}

let holders = 0;

/** Take the lock. Returns the release; releasing twice is harmless. */
export function acquireKeepAwake(): () => void {
  if (holders === 0) setAwake(true);
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) setAwake(false);
  };
}

/** Hold the lock while `wanted` is true and the caller is mounted. */
export function useKeepAwake(wanted: boolean): void {
  useEffect(() => {
    if (!wanted) return undefined;
    return acquireKeepAwake();
  }, [wanted]);
}

/** How many screens hold it right now — for the tests. */
export function _keepAwakeHolders(): number {
  return holders;
}
