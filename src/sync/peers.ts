/**
 * The devices this one syncs with: who they are, how they got here, and
 * why the list never leaves the phone it was made on.
 *
 * ── THIS LIST MUST NOT TRAVEL ─────────────────────────────────────────
 *
 * It is the one piece of sync state that is emphatically NOT part of the
 * snapshot, and the reason is not privacy — it is that pairing would become
 * transitive by accident. Snapshots get exported to a file, and files get
 * sent to people: a friend who imports your export to look at the format
 * would silently join your device set, and your next sync would seal a copy
 * of your journal to their key. Pairing is a decision someone makes by
 * carrying a code, once, per device. Nothing else may create it.
 *
 * `syncCompleteness.test.ts` enforces that, and the reason is recorded there
 * alongside the reason the secret key stays.
 *
 * ── TWO WAYS IN, AND THEY ARE NOT THE SAME ────────────────────────────
 *
 * A peer arrives either because the user typed its code here (`via: 'code'`)
 * or because it wrote a file that named itself (`via: 'announced'`). The
 * second is what makes one code produce two-way sync — see `envelope.ts` —
 * and it is a weaker claim: it proves only that the sender had this device's
 * code, which is public by design. The distinction is kept because the
 * screen should be able to say which happened, and because a future LAN
 * transport will want to gate the announced case behind an explicit accept.
 */
import {
  durableEncryptedGet,
  durableEncryptedSet,
} from '../storage/durableWrite';
import { fingerprintOf, getDeviceIdentity } from './deviceIdentity';
import { decode, KEY_BYTES } from './pairingCode';
import { fromBase64, toBase64 } from './secureRandom';

/**
 * Kept beside the secret half, in the Keystore / Keychain rather than
 * AsyncStorage. Not because public keys are secret — they are not — but
 * because a plaintext blob listing someone's devices ends up in Android's
 * automatic cloud backup, and the identity it belongs to does not.
 */
const PEERS_KEY = 'prayerapp.sync.peers.v1';

/**
 * Well past any real household, and low enough to matter.
 *
 * Every peer costs 48 bytes in every file this device writes, and an
 * announcement is unauthenticated: anyone who can write to the shared folder
 * can add rows. Without a ceiling, a folder that turned hostile could grow
 * the header without bound. With one, the damage stops at a list the user
 * can see and prune.
 */
export const MAX_PEERS = 16;

export type PeerVia = 'code' | 'announced';

export type Peer = {
  /** base64 X25519 public key. The identity; everything else is a label. */
  pk: string;
  /** Six digits derived from `pk`, so two screens can be compared. */
  fingerprint: string;
  /** What the device called itself, or what the user renamed it to. */
  name?: string;
  /**
   * The name came from the user on THIS device, not from the peer.
   *
   * Kept apart from `via` because they answer different questions. `via`
   * says how the pairing was made; this says whose word the name is. They
   * were conflated at first, and the result was that a device you paired
   * with by typing its code stayed "Unnamed device" for ever — its own name
   * arrived in every file it sent and was thrown away, because it had been
   * added by code rather than by announcement.
   */
  renamedHere?: boolean;
  addedAt: string;
  /** When a file from it was last opened. Absent until it has sent one. */
  lastSeenAt?: string;
  via: PeerVia;
};

export type AddPeerError = 'bad-code' | 'this-device' | 'too-many';

export type AddPeerResult =
  | { ok: true; peer: Peer; already: boolean }
  | { ok: false; reason: AddPeerError };

/**
 * Read-through cache of the parsed list.
 *
 * Held for the same reason `deviceIdentity` holds its promise: the Sync
 * screen, a folder scan and a seal can all want the list at once, and three
 * concurrent read-modify-writes against one Keychain entry lose rows.
 * Every mutation below goes through `mutate`, which serialises on this.
 */
let cached: Promise<Peer[]> | null = null;
/** The tail of the write chain, so mutations queue instead of racing. */
let chain: Promise<unknown> = Promise.resolve();

function coerce(value: unknown): Peer[] {
  if (!Array.isArray(value)) return [];
  const out: Peer[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.pk !== 'string') continue;
    // A row whose key is not a key can never be sealed to, and keeping it
    // would put a permanently broken entry on the user's screen.
    if (fromBase64(r.pk).length !== KEY_BYTES) continue;
    if (seen.has(r.pk)) continue;
    seen.add(r.pk);
    out.push({
      pk: r.pk,
      fingerprint:
        typeof r.fingerprint === 'string' && r.fingerprint.length === 6
          ? r.fingerprint
          : fingerprintOf(fromBase64(r.pk)),
      ...(typeof r.name === 'string' && r.name ? { name: r.name } : {}),
      ...(r.renamedHere === true ? { renamedHere: true } : {}),
      addedAt:
        typeof r.addedAt === 'string' ? r.addedAt : new Date(0).toISOString(),
      ...(typeof r.lastSeenAt === 'string' ? { lastSeenAt: r.lastSeenAt } : {}),
      via: r.via === 'code' ? 'code' : 'announced',
    });
  }
  return out.slice(0, MAX_PEERS);
}

async function read(): Promise<Peer[]> {
  let raw: string | null = null;
  try {
    raw = await durableEncryptedGet(PEERS_KEY);
  } catch {
    // An unreadable Keychain is a bad moment to throw: the caller is either
    // drawing a screen or sealing a file, and "no peers" degrades to "sync
    // does nothing" rather than to a crash. The write path does NOT do this
    // — see `mutate`.
    return [];
  }
  if (!raw) return [];
  try {
    return coerce(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** The current list. Cheap to call repeatedly. */
export function listPeers(): Promise<Peer[]> {
  if (!cached) cached = read();
  return cached;
}

/**
 * Apply `change` to the list and persist the result, one at a time.
 *
 * Rejects if the write fails, and leaves the cache holding what is actually
 * on disk. Silently keeping an in-memory list that never persisted would
 * mean a device that looked paired until it was restarted.
 */
function mutate<T>(
  change: (peers: Peer[]) => { peers: Peer[]; result: T },
): Promise<T> {
  const run = async (): Promise<T> => {
    const before = await listPeers();
    const { peers, result } = change(before);
    if (peers !== before) {
      await durableEncryptedSet(PEERS_KEY, JSON.stringify(peers));
      cached = Promise.resolve(peers);
    }
    return result;
  };
  const next = chain.then(run, run);
  // Keep the chain alive after a failed write without turning that failure
  // into an unhandled rejection.
  chain = next.catch(() => undefined);
  return next;
}

/**
 * Pair with the device whose code the user typed or scanned.
 *
 * The three refusals are distinct on purpose: a mistyped code is the user's
 * to fix, their own code is a misunderstanding worth naming rather than a
 * silent no-op, and a full list needs a device removed first.
 */
export async function addPeerByCode(
  code: string,
  options: { name?: string; now?: Date } = {},
): Promise<AddPeerResult> {
  const parsed = decode(code);
  if (!parsed.ok) return { ok: false, reason: 'bad-code' };

  const pk = toBase64(parsed.key);
  const me = await getDeviceIdentity();
  if (pk === toBase64(me.publicKey)) {
    return { ok: false, reason: 'this-device' };
  }

  return mutate(peers => {
    const existing = peers.find(p => p.pk === pk);
    if (existing) {
      // Re-entering a code is how someone confirms a pairing they already
      // made — from a device that has only ever heard the announcement, it
      // is also how `announced` becomes `code`.
      const upgraded: Peer = {
        ...existing,
        via: 'code',
        ...(options.name ? { name: options.name, renamedHere: true } : {}),
      };
      return {
        peers: peers.map(p => (p.pk === pk ? upgraded : p)),
        result: { ok: true, peer: upgraded, already: true } as AddPeerResult,
      };
    }
    if (peers.length >= MAX_PEERS) {
      return { peers, result: { ok: false, reason: 'too-many' } };
    }
    const peer: Peer = {
      pk,
      fingerprint: fingerprintOf(parsed.key),
      ...(options.name ? { name: options.name, renamedHere: true } : {}),
      addedAt: (options.now ?? new Date()).toISOString(),
      via: 'code',
    };
    return {
      peers: [...peers, peer],
      result: { ok: true, peer, already: false },
    };
  });
}

/**
 * Record that a file from `publicKey` was opened.
 *
 * This is the other half of the two-way pairing: A learns B here, from the
 * header of the first file B writes. It adds an unknown device rather than
 * ignoring it, which is the deliberate trade the folder transport makes —
 * write access to the folder is the gate, and `envelope.ts` says why. It is
 * also where an already-known peer gets its `lastSeenAt` and its name.
 */
export async function notePeerSeen(input: {
  publicKey: Uint8Array;
  name?: string;
  now?: Date;
}): Promise<Peer | null> {
  if (input.publicKey.length !== KEY_BYTES) return null;
  const pk = toBase64(input.publicKey);
  const me = await getDeviceIdentity();
  if (pk === toBase64(me.publicKey)) return null;
  const at = (input.now ?? new Date()).toISOString();

  return mutate(peers => {
    const existing = peers.find(p => p.pk === pk);
    if (existing) {
      const updated: Peer = {
        ...existing,
        lastSeenAt: at,
        // A device's own name wins unless the user has renamed it here.
        //
        // This used to test `via === 'announced'`, which meant a device
        // added by typing its code never took the name it sent — so the
        // side that did the pairing showed "Unnamed device" while the other
        // side showed the real one. How a pairing was made says nothing
        // about whose word the name is.
        ...(input.name && !existing.renamedHere ? { name: input.name } : {}),
      };
      return {
        peers: peers.map(p => (p.pk === pk ? updated : p)),
        result: updated,
      };
    }
    if (peers.length >= MAX_PEERS) return { peers, result: null };
    const peer: Peer = {
      pk,
      fingerprint: fingerprintOf(input.publicKey),
      ...(input.name ? { name: input.name } : {}),
      addedAt: at,
      lastSeenAt: at,
      via: 'announced',
    };
    return { peers: [...peers, peer], result: peer };
  });
}

/** Rename a peer locally. Never sent anywhere; this device's label for it. */
export function renamePeer(pk: string, name: string): Promise<boolean> {
  const trimmed = name.trim().slice(0, 64);
  return mutate(peers => {
    if (!peers.some(p => p.pk === pk)) return { peers, result: false };
    return {
      peers: peers.map(p => {
        if (p.pk !== pk) return p;
        const rest: Peer = { ...p };
        // Deleted rather than set to undefined: this gets JSON.stringify'd,
        // and `"name": undefined` and no name at all are the same on disk
        // but not the same when compared in a test or a render.
        delete rest.name;
        delete rest.renamedHere;
        // Clearing the name hands the peer back its own: with nothing set
        // here, the next file it sends supplies one again.
        return trimmed ? { ...rest, name: trimmed, renamedHere: true } : rest;
      }),
      result: true,
    };
  });
}

/**
 * Stop syncing with a device.
 *
 * Local only, and honest about it: the other device keeps this one's public
 * key and will go on writing files addressed to it. What changes is that
 * this device stops sealing to it and stops opening what it sends. Removing
 * it on both ends is the user's job, and the screen should say so.
 */
export function forgetPeer(pk: string): Promise<boolean> {
  return mutate(peers => {
    if (!peers.some(p => p.pk === pk)) return { peers, result: false };
    return { peers: peers.filter(p => p.pk !== pk), result: true };
  });
}

/** Every peer, as keys ready to hand to `seal`. */
export async function recipientKeys(): Promise<Uint8Array[]> {
  const peers = await listPeers();
  return peers.map(p => fromBase64(p.pk));
}

/** Whether this device has anywhere to sync to. */
export async function hasPeers(): Promise<boolean> {
  return (await listPeers()).length > 0;
}

/** For tests, and for "unpair everything". */
export function forgetCachedPeers(): void {
  cached = null;
  chain = Promise.resolve();
}
