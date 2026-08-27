/**
 * A change to the record schedules a sync. Every change, from anywhere.
 *
 * Auto-sync used to run when the app came forward and on a timer while it
 * stayed open, which misses the two moments most worth catching: logging a
 * prayer from the notification, and logging one from a widget. Both happen
 * with the app closed, both are exactly the edit someone wants on their
 * other device, and both used to sit on disk until the app was next opened.
 *
 * ── HOOKED AT THE STORE, NOT AT THE CALLERS ───────────────────────────
 *
 * Twelve places write these four keys today — two screens, three
 * notification paths, the practice store, the widget queues, and the merge
 * itself — and the thirteenth would have been added without a sync. So the
 * signal comes from `durableEncryptedSet`, which every one of them goes
 * through, and the decision about which keys count lives here.
 *
 * ── WHAT IS NOT A CHANGE ──────────────────────────────────────────────
 *
 * Prayer times are computed, not recorded: a new day's schedule, a
 * refreshed provider window, a widget payload. None of it is anything the
 * user did, none of it differs between two devices that agree on a
 * location, and syncing on it would mean a round every time a day rolled
 * over on a phone in a drawer. Only the four stores that hold what someone
 * has actually done are listed below.
 *
 * ── AND A MERGE MUST NOT TRIGGER A MERGE ──────────────────────────────
 *
 * `applySnapshot` writes all four keys. Without the suppression below,
 * every round would end by scheduling another one, for ever, across every
 * paired device — each one's write waking the next. That is the whole
 * reason this is a suppressible signal rather than a plain listener.
 */
import { onDurableWrite } from '../storage/durableWrite';
import { runSyncNow, syncIsReady } from './runSync';

/**
 * The four stores that hold what the user has done.
 *
 * Written as literals rather than imported from `practiceStore`, which
 * would make the storage layer depend on the practice layer to decide
 * whether to call the sync layer. `recordChanged.test.ts` asserts they
 * still match the exported constants, which is the part that could rot.
 */
const RECORD_KEYS = new Set([
  'prayerapp.journal.v1',
  'prayerapp.fasting.v1',
  'prayerapp.dhikr.v1',
  'prayerapp.sunnah.v1',
]);

/**
 * Long enough to be one round per edit session, short enough that a
 * notification action is still syncing while the phone is awake.
 *
 * "Mark all on time" writes five entries; the Log screen writes on every
 * tap. Three seconds turns a burst into one round. It is also short enough
 * that a headless task can wait for it — see `flushRecordSync`, which the
 * notification paths call so the work finishes before their process is
 * allowed to die.
 */
export const RECORD_SYNC_DEBOUNCE_MS = 3_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Promise<void> | null = null;
let suppressed = 0;

/** For tests. */
export function resetRecordSync(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pending = null;
  suppressed = 0;
}

async function runRound(): Promise<void> {
  try {
    if (await syncIsReady()) await runSyncNow();
  } catch {
    // The round records its own failure and the Sync screen says so. A
    // throw here would be an unhandled rejection from a timer nobody is
    // awaiting, which is a crash rather than a message.
  } finally {
    pending = null;
  }
}

/**
 * Note that a store was written. Cheap and synchronous for every key that
 * is not part of the record, which is most of them.
 */
export function noteRecordWrite(key: string): void {
  if (suppressed > 0) return;
  if (!RECORD_KEYS.has(key)) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    pending = runRound();
  }, RECORD_SYNC_DEBOUNCE_MS);
}

/**
 * Run any scheduled round NOW and wait for it.
 *
 * For the headless paths. A notification action's process is allowed to
 * die the moment its task resolves, so a round sitting on a three-second
 * timer would simply never happen — which is the case this whole module
 * exists for. Resolves immediately when there is nothing pending.
 */
export async function flushRecordSync(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    pending = runRound();
  }
  if (pending) await pending;
}

/**
 * SUBSCRIBED ON IMPORT, and never unsubscribed.
 *
 * The dependency points this way round on purpose — see `onDurableWrite`.
 * It means something has to import this module for the signal to exist at
 * all, which `index.js` does for the app and the notification handlers do
 * for themselves, since they are the paths that run with the app closed.
 */
onDurableWrite(noteRecordWrite);

/**
 * Run `fn` with the signal off — for `applySnapshot`, which writes every
 * one of these keys and must not answer a round with another round.
 *
 * Counted rather than boolean so nesting cannot switch it back on early,
 * and restored in `finally` so a failed merge does not leave the app
 * unable to sync until it restarts.
 */
export async function whileApplyingSnapshot<T>(
  fn: () => Promise<T>,
): Promise<T> {
  suppressed++;
  try {
    return await fn();
  } finally {
    suppressed--;
  }
}
