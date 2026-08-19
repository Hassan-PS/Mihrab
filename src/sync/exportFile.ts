/**
 * The snapshot as a file the user can actually hold.
 *
 * A FILE, NOT A MESSAGE BODY. The old shell put the whole backup into
 * `Share.share({message})`, which several targets truncate and most turn
 * into an un-savable blob of text — and a journal with notes runs to
 * hundreds of kilobytes. Writing a real `.json` and sharing its URL means
 * the share sheet offers Files, Drive, and email-as-attachment, and what
 * lands there is the thing this app can read back.
 *
 * No new dependency: `react-native-blob-util` already carries every mushaf
 * page and recitation on disk, and `react-native-share` already ships the
 * month table and the ayah cards. Both are F-Droid-clean and in use.
 *
 * ── WHAT IS AND IS NOT PROTECTED ──────────────────────────────────────
 *
 * The file is plain JSON. It has to be: the at-rest key is bound to the
 * Android Keystore / iOS Keychain and cannot leave the device, so anything
 * this file carried in that form would be unreadable everywhere else. That
 * makes the file exactly as private as wherever the user puts it, and the
 * screen says so rather than implying a protection that is not there.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import RNShare from 'react-native-share';
import { Platform } from 'react-native';
import { buildSnapshot, readSnapshot, type Snapshot, type SyncSelection } from './snapshot';
import { collectData } from './snapshotStore';

/**
 * `mihrab-backup-2026-08-19.json`.
 *
 * Dated, not timestamped: a user exporting twice in one day almost always
 * means to replace yesterday's, and a folder of second-resolution filenames
 * is a folder nobody can choose from. `.json` rather than a private
 * extension so every file manager and mail client already knows to keep it
 * as text rather than mangling it.
 */
export function exportFileName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `mihrab-backup-${y}-${m}-${d}.json`;
}

function exportDir(): string {
  // Cache, not Documents: this file exists to be handed to the share sheet
  // and is the user's to keep once they choose where. Leaving copies in
  // Documents would quietly accumulate their whole record in a directory
  // they never asked for.
  return `${ReactNativeBlobUtil.fs.dirs.CacheDir}/exports`;
}

export type ExportResult = {
  path: string;
  fileName: string;
  bytes: number;
  snapshot: Snapshot;
};

/**
 * Read every selected store, write the snapshot to a file, return where.
 *
 * Pretty-printed on purpose. It roughly doubles the size of something that
 * is small anyway, and it means a user who opens the file — the only way
 * anyone can check what they are about to hand to a cloud drive — can read
 * it instead of meeting one endless line.
 */
export async function writeExportFile(
  selection: SyncSelection,
  now: Date = new Date(),
): Promise<ExportResult> {
  const data = await collectData();
  const snapshot = buildSnapshot(data, selection, now.toISOString(), {
    app: 'Mihrab',
    platform: Platform.OS,
  });
  const text = JSON.stringify(snapshot, null, 2);
  const dir = exportDir();
  if (!(await ReactNativeBlobUtil.fs.isDir(dir))) {
    await ReactNativeBlobUtil.fs.mkdir(dir);
  }
  const fileName = exportFileName(now);
  const path = `${dir}/${fileName}`;
  // Overwrite rather than append — blob-util's writeFile appends on some
  // paths, and a file that grew a second copy of the record every export
  // would still parse, which is the worst kind of wrong.
  if (await ReactNativeBlobUtil.fs.exists(path)) {
    await ReactNativeBlobUtil.fs.unlink(path);
  }
  await ReactNativeBlobUtil.fs.writeFile(path, text, 'utf8');
  return { path, fileName, bytes: text.length, snapshot };
}

/** Hand a written export to the share sheet. Resolves false if cancelled. */
export async function shareExportFile(result: ExportResult): Promise<boolean> {
  try {
    await RNShare.open({
      url: result.path.startsWith('file://')
        ? result.path
        : `file://${result.path}`,
      type: 'application/json',
      filename: result.fileName,
      failOnCancel: false,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a snapshot back from a path or a content URI.
 *
 * Android hands a `content://` URI when a file arrives from a picker or a
 * "share to" intent, and blob-util resolves those as readily as a plain
 * path — which is what lets import work without adding a picker dependency
 * the F-Droid build would have to vet.
 */
export async function readSnapshotFile(uri: string): Promise<Snapshot> {
  const path = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  const text = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
  return readSnapshot(JSON.parse(text as unknown as string));
}

/** Delete an export we wrote once the share sheet is done with it. */
export async function discardExportFile(path: string): Promise<void> {
  try {
    if (await ReactNativeBlobUtil.fs.exists(path)) {
      await ReactNativeBlobUtil.fs.unlink(path);
    }
  } catch {
    // A leftover in the cache directory is the OS's problem to reclaim.
  }
}
