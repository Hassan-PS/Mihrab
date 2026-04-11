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
      // iOS resolves with `canMakePayments`; Android resolves true on success or rejects on error.
      const connected = await initConnection();
      if (!connected) {
        singleInit = null;
        return false;
      }
      return true;
    } catch {
      // Transient failures (e.g. billing not ready at cold start) would otherwise lock us out
      // for the whole session because `singleInit` stayed resolved to false.
      singleInit = null;
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
