/**
 * When this app first existed on this phone.
 *
 * Needed by exactly one feature — the backfill button, which fills the
 * journal from the install date to yesterday — and it has to be honest,
 * because every day it names becomes a claim in the user's own record.
 *
 * Three sources, best first:
 *
 * 1. The platform's own install date. Android reads it from the package
 *    manager's `firstInstallTime`; iOS from the creation date of the app
 *    container's Documents directory, which is made once and survives every
 *    update. Both are the FIRST install, never the last update — an update
 *    date would offer a year-old user a single day to fill, which is this
 *    feature failing exactly the people it is for.
 * 2. A stamp this module writes on first run, for the case where the
 *    platform will not say.
 * 3. The earliest day already in the journal, when that is older still —
 *    restoring a backup onto a new phone makes the container younger than
 *    the record it holds.
 *
 * ── The stamp is a floor, not a date ──────────────────────────────────
 *
 * Source 2 is worth being careful about, because for anyone who already
 * had the app it records the day they UPDATED to this version, and that is
 * exactly the wrong answer. It is therefore only consulted when the
 * platform gave nothing, and even then it can only make the range smaller,
 * never larger — the maximum of nothing is still nothing.
 *
 * Under-reaching is the deliberate direction of every fallback. A button
 * that offers fewer days than it might is a small disappointment; one that
 * invents months the user never had the app is a false record, and this
 * app's whole claim is that the record is theirs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { dayKeyOf, isDayKey } from './backfill';

/** AsyncStorage key holding the ISO day this build first ran. */
export const FIRST_SEEN_KEY = 'mihrab.first_seen_day';

type BuildInfoNative = { firstInstallTime?: number };

/** The platform's own first-install time in ms, or null when it will not
 *  say. Both platforms expose it through the same native module name. */
function nativeInstallMs(): number | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  const mod = NativeModules.PrayerBuildInfo as BuildInfoNative | undefined;
  const ms = mod?.firstInstallTime;
  // A future timestamp means a wrong clock, not a future install. Refuse it
  // rather than let it decide how far back this app may claim anything.
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  return ms > Date.now() ? null : ms;
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
  const now = params.now ?? new Date();
  const today = dayKeyOf(now);
  const candidates: string[] = [];

  // The platform's install date, when it gave one.
  if (params.nativeInstallMs && params.nativeInstallMs <= now.getTime()) {
    candidates.push(dayKeyOf(new Date(params.nativeInstallMs)));
  }
  // The first-run stamp. Only when the platform said nothing: for an
  // existing user this is the day they updated, and preferring it over a
  // real install date is the bug this ordering exists to prevent.
  if (!candidates.length && isDayKey(params.firstSeen)) {
    candidates.push(params.firstSeen);
  }
  // A record older than either means the journal was restored from a
  // backup. It is evidence of the user's own making, so it counts.
  if (isDayKey(params.earliestEntry)) candidates.push(params.earliestEntry);

  if (!candidates.length) return today;
  const earliest = candidates.reduce((a, b) => (a < b ? a : b));
  // Never past today, whatever a wrong clock or a corrupt value says.
  return earliest > today ? today : earliest;
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
