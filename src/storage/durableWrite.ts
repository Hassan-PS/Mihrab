/**
 * Durable EncryptedStorage write helper — task #82 hardening.
 *
 * The user's standing rule: settings, dua bookmarks, journal entries,
 * and fasting logs must never silently disappear. The native module
 * occasionally fails (Keychain locked, OS background-throttle, transient
 * I/O hiccup) — naively `.catch(e => console.warn(e))` swallows the
 * failure and the user's "I prayed Fajr" tap evaporates.
 *
 * This helper:
 *   • Retries up to N times with exponential backoff
 *   • Surfaces a final `error` to the caller so the screen can show
 *     a "couldn't save" banner instead of pretending success
 *   • Stays sync-ergonomic: the caller awaits a Promise that resolves
 *     when the write hits disk or rejects when retries are exhausted
 *
 * Storage keys to protect (and the screens that own them):
 *   • `prayerapp.location.v1`  — secureStorage.ts
 *   • `prayerapp.journal.v1`   — JournalScreen.tsx
 *   • `prayerapp.fasting.v1`   — FastingScreen.tsx
 */

import EncryptedStorage from 'react-native-encrypted-storage';

const DEFAULT_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 120;

/** Sleep helper. */
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Write a value to EncryptedStorage with retry-on-failure. Resolves when
 * the write succeeds; rejects with the last error after all attempts
 * fail. The caller is responsible for surfacing that error to the user.
 */
export async function durableEncryptedSet(
  key: string,
  value: string,
  options: { attempts?: number } = {},
): Promise<void> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await EncryptedStorage.setItem(key, value);
      return;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        // Exponential backoff: 120ms, 240ms, 480ms ...
        await sleep(BASE_BACKOFF_MS * Math.pow(2, i));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Failed to persist ${key} after ${attempts} attempts`);
}

/**
 * Same retry semantics for reads. Distinguishes "key absent" (returns
 * null on first try) from "I/O failed". Absent keys are not retried —
 * a missing key is a valid "first launch" state.
 */
export async function durableEncryptedGet(
  key: string,
  options: { attempts?: number } = {},
): Promise<string | null> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await EncryptedStorage.getItem(key);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, i));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Failed to read ${key} after ${attempts} attempts`);
}
