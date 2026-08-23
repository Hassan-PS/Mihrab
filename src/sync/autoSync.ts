/**
 * Sync when the app opens, and not more often than that means.
 *
 * ── WHY "ON OPEN" IS THE RIGHT CADENCE ────────────────────────────────
 *
 * The merge is idempotent and order-independent, so there is nothing to
 * gain from being live and quite a lot to lose: a folder watched
 * continuously means a file provider woken continuously, on battery, for a
 * record that changes five times a day. Opening the app is the moment the
 * user is about to look at their data, which is exactly when it should be
 * current — and it is also the moment they would notice if it were not.
 *
 * ── AND WHY IT IS THROTTLED ───────────────────────────────────────────
 *
 * `active` does not mean "the user came back to the app". It fires when a
 * share sheet closes, when a permission dialog is dismissed, when the
 * device unlocks with the app in front — several times a minute in normal
 * use. Each round reads a folder, decrypts, merges and writes, so running
 * on every one of those would be a real cost for no new information. Two
 * minutes is far below the rate anyone's data changes and far above the
 * rate the event fires.
 *
 * A round is skipped entirely, and silently, when there is no folder or no
 * peer. Auto-sync is not the place to nag: the Sync screen says what is
 * missing, and it says it where the user can act on it.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { ensureSyncFolder, runSyncNow, type SyncRunResult } from './runSync';
import { getSyncSettings } from './syncSettings';

/** Below the rate anyone's record changes, above the rate `active` fires. */
export const AUTO_SYNC_MIN_GAP_MS = 2 * 60 * 1000;

let lastRunAt = 0;
let running = false;

/**
 * Run a round if enough time has passed and the user asked for automatic
 * sync. Returns what happened, or null if it declined to run.
 */
export async function maybeAutoSync(
  options: { now?: number } = {},
): Promise<SyncRunResult | null> {
  const now = options.now ?? Date.now();
  if (running) return null;
  if (now - lastRunAt < AUTO_SYNC_MIN_GAP_MS) return null;

  // Claimed SYNCHRONOUSLY, before the first await. Two `active` events can
  // land in the same tick, and a guard set after reading the settings lets
  // both through — which a test caught by hanging two rounds at once.
  running = true;
  try {
    const settings = await getSyncSettings();
    if (!settings.autoOnOpen) return null;
    // Adopt the platform's default folder here too, not only when the Sync
    // screen is opened. On iOS the app has a folder of its own and nothing
    // is asked of the user — but if the default were only adopted by that
    // screen, sync would do nothing at all until they went looking for it,
    // which is the opposite of the point.
    if (!(await ensureSyncFolder())) return null;
    // Stamped before the round rather than after, so a slow or hanging one
    // cannot let the next event queue up behind it. Only stamped when a
    // round actually starts: a decline must not make the app sit idle for
    // two minutes after the user finally chooses a folder.
    lastRunAt = now;
    return await runSyncNow();
  } catch {
    // runSyncNow already records the failure and the screen already shows
    // it. Throwing out of an AppState listener would be an unhandled
    // rejection for something the user did not ask for right now.
    return null;
  } finally {
    running = false;
  }
}

/**
 * Start listening. Returns the unsubscribe, for a `useEffect`.
 *
 * Runs once on mount as well: a cold start IS the app opening, and the
 * `active` event does not fire for it.
 */
export function startAutoSync(): () => void {
  void maybeAutoSync();
  const subscription = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state === 'active') void maybeAutoSync();
    },
  );
  return () => subscription.remove();
}

/** For tests. */
export function resetAutoSyncThrottle(): void {
  lastRunAt = 0;
  running = false;
}
