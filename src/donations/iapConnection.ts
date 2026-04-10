import { initConnection } from 'react-native-iap';

let singleInit: Promise<boolean> | null = null;

/**
 * Single shared init attempt so parallel callers don't multiply native rejections
 * (which can surface as "Uncaught (in promise)" on emulators / devices without billing).
 * Always resolves to boolean; never throws.
 */
export function ensureIapReady(): Promise<boolean> {
  if (singleInit) {
    return singleInit;
  }
  singleInit = (async () => {
    try {
      await initConnection();
      return true;
    } catch {
      return false;
    }
  })();
  return singleInit;
}

/** Call after `endConnection` so the next `ensureIapReady()` can connect again. */
export function resetIapInitAfterDisconnect(): void {
  singleInit = null;
}

/** @deprecated Use resetIapInitAfterDisconnect */
export function resetIapInitForTests(): void {
  singleInit = null;
}
