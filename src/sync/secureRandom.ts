/**
 * Random bytes good enough to build an identity out of.
 *
 * React Native ships no WebCrypto. There is no `crypto.getRandomValues` in
 * Hermes, and `Math.random` is a PRNG seeded from things that are frequently
 * guessable — so a keypair built on it is not a weak keypair, it is a public
 * one. This module is the only source of randomness the sync code may use,
 * and it goes to the platform for every byte: `SecureRandom` on Android,
 * `SecRandomCopyBytes` on iOS and Catalyst.
 *
 * ── WHY EVERYTHING HERE IS ASYNC, AND WHY THAT IS THE POINT ───────────
 *
 * `nacl.setPRNG` wants a SYNCHRONOUS function, which would mean a blocking
 * call across the React Native bridge on every operation. It is avoidable:
 * `nacl.box.keyPair()` needs the PRNG, but `keyPair.fromSecretKey(sk)` does
 * not, and a nonce is just bytes. So every place in the sync code that needs
 * randomness asks for it here first and hands nacl the result.
 *
 * The PRNG is therefore deliberately LEFT UNSET. If some future code path
 * calls a nacl function that needs it, tweetnacl throws "no PRNG" — a loud
 * failure at the moment of the mistake, rather than a keypair that looks
 * exactly like a good one and is not.
 */
import { NativeModules } from 'react-native';

const Native = NativeModules.SecureRandom as
  | { bytes(count: number): Promise<string> }
  | undefined;

/**
 * Base64 → bytes, written out rather than imported.
 *
 * `atob` is not reliably present across React Native versions and Hermes,
 * `Buffer` is not global, and adding a package for twelve lines would mean
 * another entry in node_modules and another `scanignore` line in the F-Droid
 * recipe. The bridge has no byte-array type, so base64 is how the platform
 * value gets here; this is the other half of that.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function fromBase64(input: string): Uint8Array {
  const text = input.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let written = 0;
  for (const ch of text) {
    const value = B64.indexOf(ch);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, written);
}

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2];
    out += B64[((a & 0x03) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 0x0f) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 0x3f] : '=';
  }
  return out;
}

/** Raised rather than falling back to anything weaker. */
export class NoSecureRandom extends Error {
  constructor(cause: string) {
    super(`secure random unavailable: ${cause}`);
    this.name = 'NoSecureRandom';
  }
}

/**
 * `count` bytes from the platform CSPRNG.
 *
 * THROWS rather than degrading. Every caller of this is building or sealing
 * an identity, and there is no such thing as a partial answer: bytes that
 * are not random are worse than no bytes at all, because the caller cannot
 * tell the difference and the user certainly cannot. A thrown error becomes
 * "sync could not be set up on this device", which is honest and rare.
 */
export async function randomBytes(count: number): Promise<Uint8Array> {
  if (!Number.isInteger(count) || count <= 0) {
    throw new NoSecureRandom(`asked for ${count} bytes`);
  }
  if (!Native?.bytes) {
    throw new NoSecureRandom('the native module is not linked');
  }
  const encoded = await Native.bytes(count);
  const bytes = fromBase64(encoded);
  if (bytes.length !== count) {
    throw new NoSecureRandom(
      `platform returned ${bytes.length} bytes, expected ${count}`,
    );
  }
  return bytes;
}

/** Whether this device can do sync at all. */
export function hasSecureRandom(): boolean {
  return Boolean(Native?.bytes);
}
