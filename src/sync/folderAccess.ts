/**
 * The folder, as the app reaches it: one native module, two platforms.
 *
 * `folderSync.ts` takes a folder with three methods and does not care where
 * it came from. This is where it comes from — the Storage Access Framework
 * on Android, a security-scoped bookmark on iOS — and the seam between them
 * is deliberately this narrow, because the interesting half of sync should
 * never have to know which phone it is on.
 *
 * `handle` is opaque here. It is a `content://` tree URI on one platform and
 * base64 bookmark data on the other, and nothing outside the native modules
 * may look inside it.
 */
import { NativeModules } from 'react-native';
import type { SyncFolder } from './folderSync';
import type { FolderHandle } from './syncSettings';

/** What the native side returns for a folder. */
type FolderPick = { handle: string; label: string; kind?: string };

const Native = NativeModules.SyncFolder as
  | {
      defaultFolder(): Promise<FolderPick | null>;
      pick(): Promise<FolderPick | null>;
      hasAccess(handle: string): Promise<boolean>;
      forget(handle: string): Promise<boolean>;
      list(handle: string): Promise<string[]>;
      read(handle: string, name: string): Promise<string>;
      write(handle: string, name: string, contents: string): Promise<boolean>;
    }
  | undefined;

/** Whether this build can offer folder sync at all. */
export function hasFolderPicker(): boolean {
  return Boolean(Native?.pick);
}

export class NoFolderPicker extends Error {
  constructor() {
    super('the folder module is not linked in this build');
    this.name = 'NoFolderPicker';
  }
}

/**
 * The folder to use when the user has not picked one, or null if this
 * platform has none.
 *
 * iOS has one: the app's own Documents directory, which `Info.plist` makes
 * visible in Files, so there is nothing for the user to do. Android does
 * not — an app's own directory is invisible to other apps from Android 11,
 * so a folder a sync client can also see has to be granted. The difference
 * is a platform fact and the screen shows it rather than hiding it.
 */
export async function defaultSyncFolder(): Promise<FolderHandle | null> {
  if (!Native?.defaultFolder) return null;
  try {
    const found = await Native.defaultFolder();
    if (!found?.handle) return null;
    return {
      handle: found.handle,
      label: found.label || found.handle,
      kind: found.kind === 'app' ? 'app' : 'picked',
    };
  } catch {
    return null;
  }
}

/**
 * Ask the user to choose a folder.
 *
 * Resolves `null` when they back out. Both native modules treat a cancel as
 * a result rather than an error, so this has no separate "cancelled" branch
 * for the caller to forget.
 */
export async function pickSyncFolder(): Promise<FolderHandle | null> {
  if (!Native?.pick) throw new NoFolderPicker();
  const picked = await Native.pick();
  if (!picked?.handle) return null;
  return {
    handle: picked.handle,
    label: picked.label || picked.handle,
    kind: 'picked',
  };
}

/**
 * Whether a folder chosen earlier is still ours.
 *
 * Worth asking before every round rather than assuming: on Android the user
 * can revoke the grant from system settings, and on either platform the
 * folder can be deleted, unmounted, or signed out of. The honest answer is
 * "your folder is gone, choose another", not a stack of failed writes.
 */
export async function folderStillReachable(handle: string): Promise<boolean> {
  if (!Native?.hasAccess) return false;
  try {
    return await Native.hasAccess(handle);
  } catch {
    return false;
  }
}

/** Stop using a folder. The files stay where they are. */
export async function forgetSyncFolder(handle: string): Promise<void> {
  if (!Native?.forget) return;
  try {
    await Native.forget(handle);
  } catch {
    // Already released, or never held. The caller's intent is now true.
  }
}

/** The folder as `syncWithFolder` wants it. */
export function folderAt(handle: string): SyncFolder {
  if (!Native) throw new NoFolderPicker();
  const native = Native;
  return {
    list: () => native.list(handle),
    read: (name: string) => native.read(handle, name),
    write: async (name: string, contents: string) => {
      await native.write(handle, name, contents);
    },
  };
}
