/**
 * Secure storage abstraction — task #16.
 *
 * Wraps `react-native-encrypted-storage`, which uses platform-native APIs:
 *   • iOS: Keychain Services (kSecClassGenericPassword), encrypted at rest
 *     with a per-app key tied to the user's passcode/biometrics.
 *   • Android: EncryptedSharedPreferences from androidx.security.crypto, with
 *     keys backed by the Android Keystore.
 *
 * What goes in here, and why:
 *   Coordinates (lat/lng) are PII. They reveal home, work, mosque, and
 *   travel patterns. AsyncStorage is plaintext on disk — on a rooted/
 *   jailbroken device, anyone with file access can read it. We move ALL
 *   coordinate-bearing fields into this encrypted store, and explicitly
 *   strip them from the AsyncStorage blob.
 *
 * What does NOT go in here:
 *   Theme, language, sound choice, widget color — these aren't sensitive
 *   and going through Keychain on every settings-screen render would add
 *   ~10 ms per read on Android. AsyncStorage stays the home for those.
 *
 * F-Droid compatibility:
 *   `react-native-encrypted-storage` is MIT-licensed, Apache-2.0 deps only,
 *   no Google Play Services, no proprietary code. F-Droid build keeps working.
 */

import EncryptedStorage from 'react-native-encrypted-storage';
import { coerceLocationPresets } from './locationPresets';
import type { LocationPreset } from './types';

/** Single key under which we store the JSON-encoded sensitive settings blob. */
const SECURE_KEY = 'prayerapp.location.v1';

export type SecureSettings = {
  /** Manual coordinates entered by the user. */
  manualLatitude?: number;
  manualLongitude?: number;
  /** Place-name label for the manual coordinate (city, country). */
  manualLocationLabel?: string;
  /** Last GPS-resolved coordinates (used for offline + month view). */
  lastFetchedLatitude?: number;
  lastFetchedLongitude?: number;
  /** User-saved location presets — task #18. PII (coordinates), encrypted at rest. */
  locationPresets?: LocationPreset[];
};

/** The set of fields that this module owns. Used by the migration to know
 *  what to strip from the plaintext store. Exported so storage.ts and the
 *  regression tests share one source of truth. */
export const SECURE_FIELD_NAMES: ReadonlyArray<keyof SecureSettings> = [
  'manualLatitude',
  'manualLongitude',
  'manualLocationLabel',
  'lastFetchedLatitude',
  'lastFetchedLongitude',
  'locationPresets',
];

export async function loadSecureSettings(): Promise<SecureSettings> {
  try {
    const raw = await EncryptedStorage.getItem(SECURE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<SecureSettings>;
    return sanitize(parsed);
  } catch (e) {
    // Encrypted storage failure is rare but possible if the user's secure
    // enclave is locked or the keychain item was deleted. Return an empty
    // object — the caller falls back to defaults rather than leaking a
    // stale plaintext copy.
    console.warn('secureStorage.loadSecureSettings failed:', e);
    return {};
  }
}

export async function saveSecureSettings(s: SecureSettings): Promise<void> {
  try {
    await EncryptedStorage.setItem(SECURE_KEY, JSON.stringify(sanitize(s)));
  } catch (e) {
    // Don't silently swallow — caller will surface a "couldn't save" hint.
    console.error('secureStorage.saveSecureSettings failed:', e);
    throw e;
  }
}

export async function clearSecureSettings(): Promise<void> {
  try {
    await EncryptedStorage.removeItem(SECURE_KEY);
  } catch (e) {
    console.warn('secureStorage.clearSecureSettings failed:', e);
  }
}

/** Drop unrecognised keys and coerce types. */
function sanitize(input: Partial<SecureSettings>): SecureSettings {
  const out: SecureSettings = {};
  if (typeof input.manualLatitude === 'number')
    out.manualLatitude = input.manualLatitude;
  if (typeof input.manualLongitude === 'number')
    out.manualLongitude = input.manualLongitude;
  if (typeof input.manualLocationLabel === 'string')
    out.manualLocationLabel = input.manualLocationLabel;
  if (typeof input.lastFetchedLatitude === 'number')
    out.lastFetchedLatitude = input.lastFetchedLatitude;
  if (typeof input.lastFetchedLongitude === 'number')
    out.lastFetchedLongitude = input.lastFetchedLongitude;
  if (input.locationPresets !== undefined) {
    out.locationPresets = coerceLocationPresets(input.locationPresets);
  }
  return out;
}

/** Extract just the sensitive fields from a full settings blob. */
export function extractSecureFields(
  settings: Record<string, unknown>,
): SecureSettings {
  return sanitize(settings as Partial<SecureSettings>);
}

/** Return a copy of settings with all sensitive fields removed. The caller
 *  passes this stripped blob to AsyncStorage. */
export function stripSecureFields<T extends Record<string, unknown>>(
  settings: T,
): T {
  const out = { ...settings };
  for (const k of SECURE_FIELD_NAMES) {
    delete out[k];
  }
  return out;
}

/** True if the input contains any of the sensitive fields — used by the
 *  migration to detect a pre-task-#16 plaintext blob. */
export function hasSecureFields(input: Record<string, unknown>): boolean {
  for (const k of SECURE_FIELD_NAMES) {
    if (input[k] !== undefined) return true;
  }
  return false;
}
