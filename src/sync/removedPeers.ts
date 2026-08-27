/**
 * Devices the user has removed, so the removal reaches the others.
 *
 * Forgetting a peer used to be a purely local act, and it did not survive
 * contact with the folder. The removed device's file was still there,
 * still sealed to us, still readable — so the next round opened it and
 * `notePeerSeen` added the device straight back. Removing a device was a
 * button that undid itself within two minutes, and on every OTHER device
 * it did nothing at all.
 *
 * So a removal is now a fact with a date on it, kept here, announced in
 * this device's sealed file, and honoured by whoever reads it.
 *
 * ── WHY IT IS SAFE TO LET A PEER REMOVE A PEER ────────────────────────
 *
 * `peers.ts` is emphatic that the peer LIST must never travel: a list that
 * travels makes pairing transitive by accident, and a snapshot that gets
 * exported and shared would silently enrol a stranger's device. Removals
 * are the opposite operation and carry none of that risk — the worst a
 * forged one can do is unpair devices that can be paired again with a
 * code, and it cannot create a pairing that nobody asked for.
 *
 * They still travel only in the SEALED body of a sync envelope, never in
 * an export: `exportFile` builds a plain snapshot, and this rides beside
 * one rather than inside it. A backup someone mails to a friend cannot
 * unpair the friend's phones.
 *
 * ── AND WHY THEY EXPIRE ───────────────────────────────────────────────
 *
 * A removal has to outlive every device's next sync — a tablet switched
 * off for a month must still learn about it when it comes back — and it
 * must not be kept for ever, or the list grows with every device the user
 * ever owned and every file this app writes carries them all. Ninety days
 * is the same answer, for the same reason, as the sunnah tombstones.
 */
import {
  durableEncryptedGet,
  durableEncryptedSet,
} from '../storage/durableWrite';
import { KEY_BYTES } from './pairingCode';
import { fromBase64 } from './secureRandom';

/** Beside the peer list, and for the same reason: not in a cloud backup. */
const REMOVED_KEY = 'prayerapp.sync.removed.v1';

/** Long enough for a device that has been in a drawer since. */
export const REMOVAL_TTL_DAYS = 90;
const TTL_MS = REMOVAL_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Well past any real household's turnover, and low enough to bound what
 * every sealed file has to carry.
 */
export const MAX_REMOVALS = 32;

export type PeerRemoval = {
  /** base64 X25519 public key of the device that was removed. */
  pk: string;
  /** When it was removed, ISO. */
  at: string;
};

let cached: Promise<PeerRemoval[]> | null = null;
let chain: Promise<unknown> = Promise.resolve();

/** For tests. */
export function forgetCachedRemovals(): void {
  cached = null;
}

function coerce(value: unknown, now: number): PeerRemoval[] {
  if (!Array.isArray(value)) return [];
  const out: PeerRemoval[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.pk !== 'string' || typeof r.at !== 'string') continue;
    // A row whose key is not a key can never match a peer, and keeping it
    // would put a permanently inert entry in every file we write.
    try {
      if (fromBase64(r.pk).length !== KEY_BYTES) continue;
    } catch {
      continue;
    }
    const at = Date.parse(r.at);
    if (!Number.isFinite(at) || now - at > TTL_MS) continue;
    if (seen.has(r.pk)) continue;
    seen.add(r.pk);
    out.push({ pk: r.pk, at: r.at });
  }
  // Newest first, so the cap drops the ones closest to expiring anyway.
  out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return out.slice(0, MAX_REMOVALS);
}

async function read(now: number): Promise<PeerRemoval[]> {
  let raw: string | null = null;
  try {
    raw = await durableEncryptedGet(REMOVED_KEY);
  } catch {
    // Same trade as the peer list: an unreadable Keychain degrades to "no
    // removals", which loses the announcement rather than the app.
    return [];
  }
  if (!raw) return [];
  try {
    return coerce(JSON.parse(raw), now);
  } catch {
    return [];
  }
}

/** Every removal still worth announcing, expired ones dropped. */
export function listRemovals(now: number = Date.now()): Promise<PeerRemoval[]> {
  if (!cached) cached = read(now);
  return cached;
}

function mutate<T>(
  change: (rows: PeerRemoval[]) => { rows: PeerRemoval[]; result: T },
): Promise<T> {
  const run = async (): Promise<T> => {
    const before = await listRemovals();
    const { rows, result } = change(before);
    if (rows !== before) {
      await durableEncryptedSet(REMOVED_KEY, JSON.stringify(rows));
      cached = Promise.resolve(rows);
    }
    return result;
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

/** Record that this device removed `pk`, so the others hear about it. */
export function noteRemoval(pk: string, now: Date = new Date()): Promise<void> {
  const at = now.toISOString();
  return mutate(rows => ({
    rows: [{ pk, at }, ...rows.filter(r => r.pk !== pk)].slice(0, MAX_REMOVALS),
    result: undefined,
  }));
}

/**
 * Forget that `pk` was ever removed — because the user has just paired it
 * again by typing its code.
 *
 * Without this, re-pairing a device would be undone by our own standing
 * announcement on the very next round, which is a worse bug than the one
 * this module fixes.
 */
export function clearRemoval(pk: string): Promise<boolean> {
  return mutate(rows => {
    if (!rows.some(r => r.pk === pk)) return { rows, result: false };
    return { rows: rows.filter(r => r.pk !== pk), result: true };
  });
}

/** Whether `pk` is a device the user has removed and not re-paired. */
export async function isRemoved(
  pk: string,
  now: number = Date.now(),
): Promise<boolean> {
  return (await listRemovals(now)).some(r => r.pk === pk);
}
