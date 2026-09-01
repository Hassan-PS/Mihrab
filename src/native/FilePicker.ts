/**
 * One file, chosen by the user, as bytes.
 *
 * ── WHY THIS IS THE `SyncFolder` MODULE ───────────────────────────────
 *
 * The native module is called `SyncFolder` because folder sync is what
 * first needed it. What it actually owns is the app's document access —
 * the one place that presents a system picker and turns what comes back
 * into something JavaScript can hold. Adding a second native module to
 * present a second picker would mean two registrations, two bridges and
 * two files of Kotlin and Swift saying the same thing, so this borrows the
 * one that exists. The name is historical; the seam is right.
 *
 * ── WHY BYTES, AND NOT A PATH ─────────────────────────────────────────
 *
 * A path would be smaller to pass and useless to act on: on Android the
 * picker returns a `content://` document that has no path, and on iOS the
 * copy it hands over lives in a temporary directory that may be swept
 * between the pick and the read. The bytes are the only thing that is
 * true at the moment the user taps, so the bytes are what crosses.
 *
 * base64 is how they cross, because the bridge has no byte-array type.
 */
import { NativeModules } from 'react-native';
import { fromBase64 } from '../sync/secureRandom';

/** What the native side returns for a picked file. */
type PickedFile = { name: string; base64: string };

const Native = NativeModules.SyncFolder as
  | {
      /** Added 2.14. Absent on an older native side — see `hasFilePicker`. */
      pickFile?(): Promise<PickedFile | null>;
    }
  | undefined;

export type PickedBytes = { name: string; bytes: Uint8Array };

export class NoFilePicker extends Error {
  constructor() {
    super('the document module is not linked in this build');
    this.name = 'NoFilePicker';
  }
}

/**
 * Whether this build can ask for a file at all.
 *
 * False on a JS-only test host, and false on a device running an older
 * native side against a newer bundle — which is a real state during a
 * staged rollout, and one the screen shows rather than crashing on.
 */
export function hasFilePicker(): boolean {
  return Boolean(Native?.pickFile);
}

/**
 * Ask the user for a file.
 *
 * Resolves `null` when they back out. Both native modules treat a cancel
 * as a result rather than an error, so there is no separate "cancelled"
 * branch for a caller to forget.
 *
 * Rejects with a native error carrying `code`: `too_large` when the file
 * is far bigger than anything this could be for, `unreadable` when the
 * provider would not open it.
 */
export async function pickFile(): Promise<PickedBytes | null> {
  if (!Native?.pickFile) throw new NoFilePicker();
  const picked = await Native.pickFile();
  if (!picked?.base64) return null;
  return { name: picked.name || 'file', bytes: fromBase64(picked.base64) };
}
