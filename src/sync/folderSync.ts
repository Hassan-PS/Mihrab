/**
 * One round of sync through a shared folder.
 *
 * Everything above this is already built and already proved: `snapshot.ts`
 * makes the document, `merge.ts` merges in any order, `envelope.ts` seals it
 * and `peers.ts` says to whom. This is the loop that puts them together, and
 * it is deliberately given a folder rather than finding one — see
 * `SyncFolder` below.
 *
 * ── READ FIRST, THEN WRITE. THE ORDER IS THE DESIGN ───────────────────
 *
 * A round reads every other device's file, merges what it finds, and only
 * then writes its own. That means the file this device leaves behind
 * already contains what it just learned, so a third device that reads only
 * one file still ends up with everything. With the order reversed, a phone
 * that syncs while a tablet is switched off would leave a file missing the
 * tablet's day, and the set would take an extra round to agree.
 *
 * It also means the write goes out to peers learned in the same round: a
 * device that has only just announced itself is a recipient by the time we
 * seal, which is what closes the loop from one code carried one way.
 *
 * ── A DEVICE WITH NO PEERS STILL READS ────────────────────────────────
 *
 * It has to. When the user carries A's code to B, B knows A and A knows
 * nothing — so if A refused to read until it had a peer, the pair could
 * never form and the user would have to carry a second code back. Reading
 * is safe with an empty list because an envelope only opens if it was
 * sealed to this device's key, which the sender could only do having been
 * given this device's code. The write is the half that needs recipients,
 * and it is skipped when there are none.
 *
 * ── NOTHING IS DELETED, EVER ──────────────────────────────────────────
 *
 * Not the other devices' files — they are not ours — and not our own. A
 * device that stops syncing leaves its last file behind, which is a stale
 * record rather than a lost one: reading it again merges the same entries
 * and changes nothing, because the merge is idempotent. Cleaning up would
 * mean deciding when a device is gone rather than merely quiet, and getting
 * that wrong loses data.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────
 *
 * No locking, no ordering, no retry-until-consistent. The merge is
 * commutative, idempotent and associative, so a half-written file fails to
 * parse and is skipped, a file read twice costs nothing, and two devices
 * writing at once cannot corrupt each other — they write different
 * filenames. This is the whole reason the transport can be a folder that
 * somebody else's software synchronises on its own schedule.
 */
import {
  everything,
  buildSnapshot,
  readSnapshot,
  type SyncSelection,
} from './snapshot';
import { applySnapshot, collectData } from './snapshotStore';
import type { MergeSummary } from './merge';
import { encode, KEY_BYTES } from './pairingCode';
import { getDeviceIdentity } from './deviceIdentity';
import { getDeviceName } from './deviceName';
import { listPeers, notePeerSeen, recipientKeys } from './peers';
import { open, seal } from './envelope';

/**
 * The folder, as this module needs it.
 *
 * Three methods, no paths, no permissions, no platform. Android reaches a
 * user-chosen folder through the Storage Access Framework and iOS through a
 * security-scoped bookmark, and neither of those belongs anywhere near the
 * merge logic. Injecting the folder is also what lets the tests run two
 * whole devices against an in-memory one and check that a log written on A
 * arrives on B — which is the behaviour that actually matters and is
 * unreachable if the transport is hard-wired.
 */
export type SyncFolder = {
  /** File names in the folder. Not paths, and order does not matter. */
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, contents: string): Promise<void>;
};

/**
 * `mihrab-XXXXXXXXXXXX.sync.json`.
 *
 * The middle is the first twelve characters of this device's own pairing
 * code, which is public by construction, so the filename gives away nothing
 * the folder's contents do not. Twelve base32 characters is sixty bits —
 * two of your own devices colliding is not a thing that happens.
 *
 * `.json` rather than a private extension because the file IS json; the
 * secret parts are base64 inside it. A file manager that shows it as text
 * is telling the truth, and a file manager that refuses to sync an unknown
 * extension is a real problem this avoids.
 */
export const SYNC_FILE_PREFIX = 'mihrab-';
export const SYNC_FILE_SUFFIX = '.sync.json';

export function syncFileNameFor(publicKey: Uint8Array): string {
  if (publicKey.length !== KEY_BYTES) {
    throw new Error('syncFileNameFor needs a 32-byte public key');
  }
  const flat = encode(publicKey).replace(/-/g, '').slice(4, 16);
  return `${SYNC_FILE_PREFIX}${flat}${SYNC_FILE_SUFFIX}`;
}

export function isSyncFileName(name: string): boolean {
  return name.startsWith(SYNC_FILE_PREFIX) && name.endsWith(SYNC_FILE_SUFFIX);
}

export type SyncSkipped = {
  /** Not one of ours: a stray file, or something half-written. */
  notOurs: number;
  /** Sealed for devices we are not. Someone else's pair sharing a folder. */
  notForUs: number;
  /** Ours by name, addressed to us, and would not open. Worth surfacing. */
  unreadable: number;
};

export type SyncOutcome = {
  /** The file we left behind, or null if there was no one to write for. */
  wrote: string | null;
  /** How many envelopes were opened and merged. */
  read: number;
  /** Devices that announced themselves this round and are now paired. */
  learned: number;
  /** What changed locally, or null if nothing was read. */
  merged: MergeSummary | null;
  skipped: SyncSkipped;
};

/**
 * Read everything addressed to us, merge it, then write our own file.
 *
 * Throws only when the folder itself is unusable — an individual file that
 * cannot be read or parsed is counted and stepped over, because one corrupt
 * file must not stop the other three devices getting through.
 */
export async function syncWithFolder(
  folder: SyncFolder,
  options: { selection?: SyncSelection; now?: Date } = {},
): Promise<SyncOutcome> {
  const me = await getDeviceIdentity();
  const mine = syncFileNameFor(me.publicKey);
  const skipped: SyncSkipped = { notOurs: 0, notForUs: 0, unreadable: 0 };
  let read = 0;
  let learned = 0;
  let merged: MergeSummary | null = null;

  const names = (await folder.list()).filter(
    name => isSyncFileName(name) && name !== mine,
  );

  for (const name of names) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await folder.read(name));
    } catch {
      // Unreadable or half-written. The writer will finish and we will see
      // it next round; there is nothing useful to do now and nothing to
      // tell the user, who did not put this file here by hand.
      skipped.notOurs++;
      continue;
    }

    const result = open({
      envelope: parsed,
      mySecretKey: me.secretKey,
      myPublicKey: me.publicKey,
    });
    if (!result.ok) {
      if (result.reason === 'not-for-us') skipped.notForUs++;
      else if (result.reason === 'undecryptable') skipped.unreadable++;
      else skipped.notOurs++;
      continue;
    }

    // The announcement. A device we already know gets its last-seen and its
    // name; one we do not is added, which is how a pairing made in one
    // direction becomes a pair. See `envelope.ts` for what that does and
    // does not prove.
    const before = (await listPeers()).length;
    await notePeerSeen({
      publicKey: result.senderPublicKey,
      name: result.senderName,
      now: options.now,
    });
    if ((await listPeers()).length > before) learned++;

    let snapshot;
    try {
      snapshot = readSnapshot(JSON.parse(result.json));
    } catch {
      // Decrypted cleanly and is not a snapshot: a version of the app that
      // writes something else, or a genuinely corrupt payload. Either way
      // this is the case worth counting separately — the sender is a device
      // we trust, so silence would hide a real incompatibility.
      skipped.unreadable++;
      continue;
    }

    // Accept every category the file carries. The sending device already
    // made that choice once; asking again on the receiving side would mean
    // a setting that has to agree on two devices to do anything.
    const applied = await applySnapshot(snapshot, everything());
    merged = merged ? mergeSummaries(merged, applied.summary) : applied.summary;
    read++;
  }

  // Recipients are read AFTER the merge, so a device that announced itself
  // in this same round is sealed to rather than waiting for the next one.
  const recipients = await recipientKeys();
  if (recipients.length === 0) {
    return { wrote: null, read, learned, merged, skipped };
  }

  const now = options.now ?? new Date();
  const snapshot = buildSnapshot(
    await collectData(),
    options.selection ?? everything(),
    now.toISOString(),
  );
  const envelope = await seal({
    json: JSON.stringify(snapshot),
    senderSecretKey: me.secretKey,
    senderPublicKey: me.publicKey,
    senderName: await getDeviceName(),
    recipients,
    now,
  });
  await folder.write(mine, JSON.stringify(envelope));

  return { wrote: mine, read, learned, merged, skipped };
}

/**
 * Fold two summaries into one, keeping the first `before` and the last
 * `after` — which is what "this round changed X to Y" means when several
 * files were merged in sequence.
 */
function mergeSummaries(first: MergeSummary, second: MergeSummary): MergeSummary {
  const out = {} as MergeSummary;
  for (const key of Object.keys(second) as Array<keyof MergeSummary>) {
    out[key] = {
      before: first[key]?.before ?? second[key].before,
      after: second[key].after,
    };
  }
  return out;
}
