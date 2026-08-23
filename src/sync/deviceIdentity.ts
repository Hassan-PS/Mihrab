/**
 * This device's identity for sync: one X25519 keypair, generated once.
 *
 * ── THE SECRET HALF NEVER LEAVES ──────────────────────────────────────
 *
 * It lives in `EncryptedStorage`, which is the Android Keystore and the iOS
 * Keychain — the same place the journal's at-rest key lives, and for the same
 * reason. It is not in the export file, it is not in the snapshot, it is not
 * in a backup, and there is no function here that returns it to a caller who
 * did not already have to reach into this module.
 *
 * This is the distinction the whole design turns on: the AT-REST key is
 * device-bound and stays that way, and sharing it across devices would make
 * every device only as strong as the weakest place it had ever been. What
 * travels is the PUBLIC half, and it travels as a pairing code the user can
 * read off a screen.
 *
 * ── WHY THE KEYPAIR IS DERIVED, NOT GENERATED ─────────────────────────
 *
 * `nacl.box.keyPair()` needs tweetnacl's PRNG, which React Native cannot
 * provide without a blocking bridge call on every use. `fromSecretKey` needs
 * none: we ask the platform for 32 secure bytes, hand them over, and get the
 * same keypair with no PRNG involved. See `secureRandom.ts`.
 */
import nacl from 'tweetnacl';
import { durableEncryptedGet, durableEncryptedSet } from '../storage/durableWrite';
import { encode as encodeCode, KEY_BYTES } from './pairingCode';
import { fromBase64, randomBytes, toBase64 } from './secureRandom';

/** Namespaced like the other durable keys — see `durableWrite.ts`. */
const SECRET_KEY = 'prayerapp.sync.secret.v1';

export type DeviceIdentity = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

/**
 * Kept for the lifetime of the process.
 *
 * Not a cache for speed — a Keychain read is fast — but so that two callers
 * racing on first launch cannot each generate a keypair and each write it,
 * leaving the device with an identity that changed between one read and the
 * next. The promise is stored, not the value, so the second caller waits on
 * the first rather than starting a second generation.
 */
let inFlight: Promise<DeviceIdentity> | null = null;

/**
 * This device's identity, generating it on first call.
 *
 * Idempotent and safe to call from anywhere. Throws if the platform cannot
 * produce secure random bytes, which is the one failure that must not be
 * papered over — see `secureRandom.ts`.
 */
export function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (!inFlight) inFlight = load();
  return inFlight;
}

async function load(): Promise<DeviceIdentity> {
  const stored = await durableEncryptedGet(SECRET_KEY);
  if (stored) {
    const secret = fromBase64(stored);
    // A truncated or corrupted value is treated as absent rather than as an
    // error: `fromSecretKey` would happily accept the wrong number of bytes
    // and produce an identity that no peer has ever seen, which looks like
    // "sync silently stopped working" instead of "this device re-paired".
    if (secret.length === nacl.box.secretKeyLength) {
      const pair = nacl.box.keyPair.fromSecretKey(secret);
      return { publicKey: pair.publicKey, secretKey: pair.secretKey };
    }
  }
  const seed = await randomBytes(nacl.box.secretKeyLength);
  const pair = nacl.box.keyPair.fromSecretKey(seed);
  await durableEncryptedSet(SECRET_KEY, toBase64(pair.secretKey));
  return { publicKey: pair.publicKey, secretKey: pair.secretKey };
}

/** For tests, and for a future "unpair this device from everything". */
export function forgetCachedIdentity(): void {
  inFlight = null;
}

/**
 * The code this device shows: its public key, in the shared format.
 *
 * The same string the other device pastes in, and the same string its QR
 * encodes. One representation, two renderings.
 */
export async function myPairingCode(): Promise<string> {
  const { publicKey } = await getDeviceIdentity();
  return encodeCode(publicKey);
}

/**
 * Six digits derived from a public key, for RECOGNISING a device later.
 *
 * Not for pairing — pairing needs the whole key and gets it from the code.
 * This is what goes under an entry in the paired list so that "is this still
 * my tablet?" has an answer a year on, in a form someone can compare across
 * two screens at a glance. Six digits is a million, which is far too weak to
 * authenticate anything and entirely sufficient to tell two of your own
 * devices apart.
 */
export function fingerprintOf(publicKey: Uint8Array): string {
  if (publicKey.length !== KEY_BYTES) return '------';
  const digest = nacl.hash(publicKey);
  let value = 0;
  for (let i = 0; i < 4; i++) value = (value * 256 + digest[i]) % 1000000;
  return String(value).padStart(6, '0');
}

export async function myFingerprint(): Promise<string> {
  const { publicKey } = await getDeviceIdentity();
  return fingerprintOf(publicKey);
}
