/**
 * Sync when the app opens — or once an hour, or once a day, or never.
 *
 * ── WHY "ON OPEN" IS THE DEFAULT ──────────────────────────────────────
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
 * The other frequencies are the same mechanism with a longer gap, checked
 * against the STORED stamp so that killing the app is not a way to make
 * "once a day" mean "every launch". None of them is a schedule: nothing
 * wakes this app, so a phone left untouched for a week syncs when it is
 * next picked up, whatever is chosen here.
 *
 * A round is skipped entirely, and silently, when there is no folder or no
 * peer. Auto-sync is not the place to nag: the Sync screen says what is
 * missing, and it says it where the user can act on it.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { ensureSyncFolder, runSyncNow, type SyncRunResult } from './runSync';
import { getSyncSettings, syncFrequencyGapMs } from './syncSettings';

/** Below the rate anyone's record changes, above the rate `active` fires. */
export const AUTO_SYNC_MIN_GAP_MS = 2 * 60 * 1000;

/**
 * How often the app checks whether a timed round has come due while it
 * sits open.
 *
 * Only the timed frequencies need this at all: `open` is answered by the
 * `active` event and `off` by never running. The check itself is a cached
 * read and a subtraction — the round is what costs, and the gap decides
 * whether there is one — and it only runs while the app is in front of
 * someone, so the cost of checking often is close to nothing.
 *
 * Two minutes, which is AUTO_SYNC_MIN_GAP_MS. Nothing can run more often
 * than that floor however fine this is, so it is the finest interval that
 * can ever change an outcome. It was five, which was coarse against an
 * hour and free against a day but a third of the way through the
 * fifteen-minute setting — long enough that "every 15 minutes" would have
 * meant "every 15 to 20".
 */
export const AUTO_SYNC_TICK_MS = 2 * 60 * 1000;

/** What made this call: the app coming forward, or the timer. */
export type AutoSyncTrigger = 'open' | 'tick';

let lastRunAt = 0;
let running = false;

/**
 * Run a round if enough time has passed and the user asked for automatic
 * sync. Returns what happened, or null if it declined to run.
 */
export async function maybeAutoSync(
  options: { now?: number; trigger?: AutoSyncTrigger } = {},
): Promise<SyncRunResult | null> {
  const now = options.now ?? Date.now();
  const trigger = options.trigger ?? 'open';
  if (running) return null;
  if (now - lastRunAt < AUTO_SYNC_MIN_GAP_MS) return null;

  // Claimed SYNCHRONOUSLY, before the first await. Two `active` events can
  // land in the same tick, and a guard set after reading the settings lets
  // both through — which a test caught by hanging two rounds at once.
  running = true;
  try {
    const settings = await getSyncSettings();
    const gap = syncFrequencyGapMs(settings.autoFrequency);
    if (!Number.isFinite(gap)) return null;
    // The timer exists for the timed frequencies. "When the app opens"
    // must mean that and not "every few minutes for as long as it is
    // open", which is what a shared tick would quietly turn it into.
    if (trigger === 'tick' && settings.autoFrequency === 'open') return null;
    // Measured against the stored stamp rather than the in-memory one, so
    // "once a day" survives the app being killed — otherwise every cold
    // start would be a fresh day.
    const last = settings.lastSyncAt ? Date.parse(settings.lastSyncAt) : NaN;
    // `last <= now` lets a clock moved backwards make a round due instead
    // of due in a year.
    if (Number.isFinite(last) && last <= now && now - last < gap) return null;
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
  void maybeAutoSync({ trigger: 'open' });
  const subscription = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state === 'active') void maybeAutoSync({ trigger: 'open' });
    },
  );
  // Backgrounded timers are throttled on one platform and not the other,
  // and a round behind someone's back is not what any of these settings
  // offered. The `active` path covers coming back.
  const timer = setInterval(() => {
    if (AppState.currentState === 'active') {
      void maybeAutoSync({ trigger: 'tick' });
    }
  }, AUTO_SYNC_TICK_MS);
  return () => {
    subscription.remove();
    clearInterval(timer);
  };
}

/** For tests. */
export function resetAutoSyncThrottle(): void {
  lastRunAt = 0;
  running = false;
}
