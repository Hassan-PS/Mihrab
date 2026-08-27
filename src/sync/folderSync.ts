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
import { fromBase64, toBase64 } from './secureRandom';
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

/**
 * `mihrab-XXXXXXXXXXXX.invite.json` — named after the RECIPIENT, not the
 * sender, and that is the whole point.
 *
 * ── WHY AN INVITE FILE EXISTS AT ALL ──────────────────────────────────
 *
 * Pairing is one-directional: the user carries A's code to B, so B knows A
 * and A has never heard of B. B announces itself by leaving a file, and A
 * used to find that file by listing the folder — which works right up until
 * it doesn't. An Android 16 emulator returns an empty cursor for a directory
 * holding seven files, and on such a provider the pair could never form: A
 * has no name to ask for, because not knowing B's key is exactly the problem
 * being solved.
 *
 * Naming the invite after A fixes that. A knows its OWN id, so it can ask
 * for `mihrab-<A>.invite.json` by name, every round, without enumerating
 * anything. Listing is now needed for nothing at all.
 *
 * ── THE COLLISION, AND WHY IT HEALS ───────────────────────────────────
 *
 * Two devices inviting A at the same time write the same filename and one
 * overwrites the other. Nothing is lost: an invite is rewritten every round
 * until the sender has actually heard back from A, so the loser's invite
 * reappears on the next pass and is picked up then.
 */
export const INVITE_FILE_SUFFIX = '.invite.json';

export function inviteFileNameFor(publicKey: Uint8Array): string {
  if (publicKey.length !== KEY_BYTES) {
    throw new Error('inviteFileNameFor needs a 32-byte public key');
  }
  const flat = encode(publicKey).replace(/-/g, '').slice(4, 16);
  return `${SYNC_FILE_PREFIX}${flat}${INVITE_FILE_SUFFIX}`;
}

export type SyncSkipped = {
  /** Not one of ours: a stray file, or something half-written. */
  notOurs: number;
  /** Sealed for devices we are not. Someone else's pair sharing a folder. */
  notForUs: number;
  /** Ours by name, addressed to us, and would not open. Worth surfacing. */
  unreadable: number;
  /**
   * Opened, understood, and already merged in an earlier round.
   *
   * The normal case for a peer that has not written since we last looked —
   * and the permanent case for one that never will again. Counted rather
   * than silent because "we read three files and learned nothing from any
   * of them" is the difference between a healthy quiet folder and a dead
   * one, and the Sync screen should be able to tell the user which.
   */
  alreadySeen: number;
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
  const known = await listPeers();
  const skipped: SyncSkipped = {
    notOurs: 0,
    notForUs: 0,
    unreadable: 0,
    alreadySeen: 0,
  };
  let read = 0;
  let learned = 0;
  let merged: MergeSummary | null = null;
  /**
   * Senders already heard from this round.
   *
   * A device can leave two readable files: its own, and an invite addressed
   * to us while it is still waiting to be acknowledged. Both carry the same
   * snapshot, so merging the second is harmless — the merge is idempotent —
   * but it is a second decrypt and a second pass over every store for
   * nothing, and it would report two files read where the user has one
   * other device.
   */
  const heard = new Set<string>();

  const listed = (await folder.list()).filter(
    name => isSyncFileName(name) && name !== mine,
  );

  // ASK FOR KNOWN DEVICES BY NAME, don't only take what the listing gives.
  //
  // Every device's filename is derived from its public key, so for a device
  // already paired we know exactly what to ask for. That matters because
  // directory listing is the one part of the Storage Access Framework a
  // provider is allowed to be useless at: one Android build returns an empty
  // cursor for a folder it will happily create and open files in. Enumerating
  // is then only needed for devices we have NOT met — the announcement case.
  const derived = known
    .map(peer => syncFileNameFor(fromBase64(peer.pk)))
    .filter(name => name !== mine && !listed.includes(name));

  // The one file addressed to us by name rather than by ours: a device we
  // have never heard of, introducing itself. Read on every round, because
  // that is the only way a pair forms from a single code — see
  // `inviteFileNameFor`.
  const invite = inviteFileNameFor(me.publicKey);
  if (!listed.includes(invite) && !derived.includes(invite)) {
    derived.push(invite);
  }

  for (const name of [...listed, ...derived]) {
    // A derived name is a guess: the device may never have written yet, and
    // its absence is the normal case rather than something to report.
    const guessed = !listed.includes(name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await folder.read(name));
    } catch {
      // Unreadable or half-written. The writer will finish and we will see
      // it next round; there is nothing useful to do now and nothing to
      // tell the user, who did not put this file here by hand.
      if (!guessed) skipped.notOurs++;
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

    const from = toBase64(result.senderPublicKey);
    if (heard.has(from)) continue;
    heard.add(from);

    // PARSED BEFORE THE PEER IS RECORDED, for the sake of one field.
    //
    // `notePeerSeen` wants the snapshot's `createdAt` so the peer can carry
    // how old its RECORD is and not merely when we last opened one of its
    // files — see `dataAt` on `Peer`, and the reason it had to exist. A
    // payload that will not parse still records the peer, because a device
    // that sealed to our key is a real device whether or not this build can
    // read what it sent.
    let snapshot;
    try {
      snapshot = readSnapshot(JSON.parse(result.json));
    } catch {
      snapshot = null;
    }

    // WHAT WE ALREADY MERGED FROM THIS SENDER, read BEFORE noting them —
    // `notePeerSeen` is about to move the stamp forward.
    const knownAt = (await listPeers()).find(p => p.pk === from)?.dataAt;

    // The announcement. A device we already know gets its last-seen and its
    // name; one we do not is added, which is how a pairing made in one
    // direction becomes a pair. See `envelope.ts` for what that does and
    // does not prove.
    const before = (await listPeers()).length;
    await notePeerSeen({
      publicKey: result.senderPublicKey,
      name: result.senderName,
      now: options.now,
      ...(snapshot ? { dataAt: snapshot.createdAt } : {}),
    });
    if ((await listPeers()).length > before) learned++;

    if (!snapshot) {
      // Decrypted cleanly and is not a snapshot: a version of the app that
      // writes something else, or a genuinely corrupt payload. Either way
      // this is the case worth counting separately — the sender is a device
      // we trust, so silence would hide a real incompatibility.
      skipped.unreadable++;
      continue;
    }

    // ── A SNAPSHOT WE HAVE ALREADY MERGED IS NOT MERGED AGAIN ───────────
    //
    // Re-merging is harmless in a vacuum — the merge is idempotent against
    // ITSELF. It is not harmless against a local record that has changed
    // since, and this is the failure that took two attempts to see.
    //
    // Nothing in the shared folder is ever deleted, so a device that stops
    // writing leaves its last file there for ever. Reported 2026-08-27: a
    // Mac's sync identity was replaced, orphaning `mihrab-ASWPFJBG07HZ`, a
    // file frozen at 15:18 the previous day and written by a build old
    // enough that its sunnah days carried no timestamps. Every round, the
    // phone opened that corpse, and every round the undated rule in
    // `mergeSunnah` re-asserted the counts it held — so a sunnah cleared on
    // the phone came back, for ever, from a device that no longer existed.
    //
    // The general statement is the one that matters: a file we have already
    // read carries NO new information, and no-new-information must never
    // outrank something the user has since done. So compare the snapshot's
    // own build time against the newest we have merged from this sender and
    // step over anything at or behind it. It costs nothing when peers are
    // healthy — a live device stamps every round it writes — and it makes a
    // dead device's file inert instead of eternally loud.
    //
    // `<=` rather than `===` so an older INVITE, which a peer leaves beside
    // its snapshot until it is acknowledged, cannot drag the record back
    // either. The price is a peer whose clock is set backwards: its files
    // are ignored until the clock passes the stamp we recorded. That is a
    // machine with a broken clock going quiet, against a dead machine
    // silently undoing live edits, and it is not a close call.
    if (knownAt && Date.parse(snapshot.createdAt) <= Date.parse(knownAt)) {
      skipped.alreadySeen++;
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
  const body = JSON.stringify(envelope);
  await folder.write(mine, body);

  // AND AN INVITE FOR ANYONE WHO HAS NEVER ANSWERED.
  //
  // A peer with no `lastSeenAt` has never had a file of theirs opened here,
  // which means either they have not synced yet or they do not know about
  // this device at all. The second is the case that needs help, and the
  // first costs one extra write of a file that is already in hand.
  //
  // It stops by itself: the moment a file from that peer is opened, they
  // demonstrably know us — they sealed it to our key — and `lastSeenAt` is
  // set, so no further invite is written.
  const strangers = (await listPeers()).filter(peer => !peer.lastSeenAt);
  for (const stranger of strangers) {
    try {
      await folder.write(inviteFileNameFor(fromBase64(stranger.pk)), body);
    } catch {
      // An invite that cannot be written costs the automatic introduction,
      // not the sync. The user can still carry the second code by hand.
    }
  }

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
