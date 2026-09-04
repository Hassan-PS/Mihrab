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
import { useEffect } from 'react';

let holders = 0;

/** Take the lock. Returns the release; releasing twice is harmless. */
export function acquireKeepAwake(): () => void {
  if (holders === 0) activateKeepAwake();
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) deactivateKeepAwake();
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
