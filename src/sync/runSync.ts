/**
 * A round of sync, with the reasons it did not happen named.
 *
 * `folderSync.ts` is the algorithm and takes a folder it is handed;
 * `folderAccess.ts` produces one; this decides whether to run at all,
 * records when it last did, and turns every failure into something a screen
 * can say out loud.
 *
 * ── WHY EVERY REFUSAL HAS ITS OWN NAME ────────────────────────────────
 *
 * "Sync failed" is the least useful thing an app can tell someone. Not
 * choosing a folder, revoking the grant in system settings, and a folder
 * that stopped syncing because a device was removed are three different
 * situations with three different fixes, and the user can act on all of
 * them once they are told which one they are in.
 */
import {
  syncWithFolder,
  type SyncFolder,
  type SyncOutcome,
} from './folderSync';
import {
  folderAt,
  folderStillReachable,
  hasFolderPicker,
} from './folderAccess';
import { getSyncSettings, updateSyncSettings } from './syncSettings';
import { hasSecureRandom } from './secureRandom';

export type SyncRunResult =
  | { ok: true; outcome: SyncOutcome; at: string }
  | { ok: false; reason: SyncRunError; detail?: string };

export type SyncRunError =
  /** This build has no folder module — nothing to run against. */
  | 'unsupported'
  /** No secure randomness, so there is no identity and never was one. */
  | 'no-identity'
  /** The user has not chosen a folder yet. */
  | 'no-folder'
  /** They chose one, and it is no longer reachable. */
  | 'folder-gone'
  /** The folder worked and something inside it did not. */
  | 'failed';

/**
 * Run one round, if everything it needs is in place.
 *
 * `folder` is injectable for the same reason it is in `folderSync` — so the
 * decision logic here can be tested without a phone.
 */
export async function runSyncNow(
  options: { folder?: SyncFolder; now?: Date } = {},
): Promise<SyncRunResult> {
  if (!hasSecureRandom()) return { ok: false, reason: 'no-identity' };

  const settings = await getSyncSettings();
  let folder = options.folder;

  if (!folder) {
    if (!hasFolderPicker()) return { ok: false, reason: 'unsupported' };
    if (!settings.folder) return { ok: false, reason: 'no-folder' };
    if (!(await folderStillReachable(settings.folder.handle))) {
      await updateSyncSettings({ lastError: 'folder-gone' });
      return { ok: false, reason: 'folder-gone' };
    }
    folder = folderAt(settings.folder.handle);
  }

  try {
    const outcome = await syncWithFolder(folder, {
      selection: settings.selection,
      now: options.now,
    });
    const at = (options.now ?? new Date()).toISOString();
    // Recorded even when nothing changed: "last checked" is the thing the
    // user wants to see, and a round that found nothing new is a success.
    await updateSyncSettings({ lastSyncAt: at, lastError: null });
    return { ok: true, outcome, at };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await updateSyncSettings({ lastError: detail });
    return { ok: false, reason: 'failed', detail };
  }
}
