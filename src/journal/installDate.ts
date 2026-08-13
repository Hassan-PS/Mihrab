/**
 * When this app first existed on this phone.
 *
 * Needed by exactly one feature — the backfill button, which fills the
 * journal from the install date to yesterday — and it has to be honest,
 * because every day it names becomes a claim in the user's own record.
 *
 * Three sources, best first:
 *
 * 1. Android's package manager, which knows the real first-install time
 *    even for someone who has had the app for a year and is only now
 *    updating to the version with this button.
 * 2. A stamp this module writes on first run. Exact for anyone installing
 *    from here on; on iOS and on existing Android installs it is the day
 *    they first opened THIS version, which under-reaches rather than
 *    over-reaches.
 * 3. The earliest day already in the journal, when that is older still —
 *    restoring a backup onto a new phone makes the package's install date
 *    younger than the record it contains.
 *
 * Under-reaching is the deliberate direction of every fallback here. A
 * button that offers to fill fewer days than it might is a small
 * disappointment; one that invents months the user never had the app is a
 * false record, and this app's whole claim is that the record is theirs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { dayKeyOf } from './backfill';

/** AsyncStorage key holding the ISO day this build first ran. */
export const FIRST_SEEN_KEY = 'mihrab.first_seen_day';

type BuildInfoNative = { firstInstallTime?: number };

/** Android only: the package manager's first-install time, in ms. */
function nativeInstallMs(): number | null {
  if (Platform.OS !== 'android') return null;
  const mod = NativeModules.PrayerBuildInfo as BuildInfoNative | undefined;
  const ms = mod?.firstInstallTime;
  return typeof ms === 'number' && ms > 0 ? ms : null;
}

/**
 * Record today as the first-seen day if nothing is recorded yet. Called
 * once at startup; cheap and idempotent.
 */
export async function recordFirstSeen(now: Date = new Date()): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(FIRST_SEEN_KEY);
    if (existing) return;
    await AsyncStorage.setItem(FIRST_SEEN_KEY, dayKeyOf(now));
  } catch {
    // A missing stamp costs the backfill button some reach; it is not worth
    // an error path of its own.
  }
}

/** The stamp, or null. */
export async function readFirstSeen(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(FIRST_SEEN_KEY);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Pick the earliest defensible day. Exported for its own sake so the
 * precedence can be tested without touching storage or native modules.
 */
export function earliestKnownDay(params: {
  nativeInstallMs?: number | null;
  firstSeen?: string | null;
  earliestEntry?: string | null;
  now?: Date;
}): string {
  const candidates: string[] = [];
  if (params.nativeInstallMs) {
    candidates.push(dayKeyOf(new Date(params.nativeInstallMs)));
  }
  if (params.firstSeen) candidates.push(params.firstSeen);
  if (params.earliestEntry) candidates.push(params.earliestEntry);
  if (!candidates.length) return dayKeyOf(params.now ?? new Date());
  return candidates.reduce((a, b) => (a < b ? a : b));
}

/**
 * The day the backfill button should offer to fill from.
 *
 * `earliestEntry` is the oldest day already in the journal, when there is
 * one — see source 3 above.
 */
export async function installedOnDay(
  earliestEntry?: string | null,
  now: Date = new Date(),
): Promise<string> {
  return earliestKnownDay({
    nativeInstallMs: nativeInstallMs(),
    firstSeen: await readFirstSeen(),
    earliestEntry: earliestEntry ?? null,
    now,
  });
}
