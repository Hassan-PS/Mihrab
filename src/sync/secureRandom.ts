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

/**
 * UTF-8, written out for the same reason base64 is.
 *
 * Hermes has no `TextDecoder` — `new TextDecoder()` throws
 * "Property 'TextDecoder' doesn't exist" at runtime, which is exactly the
 * kind of failure that survives every unit test (node has both) and then
 * appears the first time a real device opens an envelope. `TextEncoder` is
 * present in some React Native versions and absent in others, so neither is
 * relied on.
 *
 * Only UTF-8, and only what a JSON payload contains: no BOM handling, no
 * alternative encodings, no streaming. Lone surrogates are encoded as U+FFFD
 * rather than throwing, because a snapshot that fails to seal is worse than
 * one that carries a replacement character in a note.
 */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/**
 * Bytes back to a string.
 *
 * Malformed sequences become U+FFFD, the same as every browser decoder does,
 * rather than throwing: by the time this runs the payload has already been
 * authenticated by `secretbox`, so bad bytes mean a bug rather than an
 * attacker, and losing one character beats losing the whole snapshot.
 */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i++];
    let code: number;
    let extra: number;
    if (byte < 0x80) {
      out += String.fromCharCode(byte);
      continue;
    } else if (byte >= 0xc2 && byte <= 0xdf) {
      code = byte & 0x1f;
      extra = 1;
    } else if (byte >= 0xe0 && byte <= 0xef) {
      code = byte & 0x0f;
      extra = 2;
    } else if (byte >= 0xf0 && byte <= 0xf4) {
      code = byte & 0x07;
      extra = 3;
    } else {
      out += '�';
      continue;
    }
    if (i + extra > bytes.length) {
      out += '�';
      break;
    }
    let valid = true;
    for (let k = 0; k < extra; k++) {
      const cont = bytes[i + k];
      if ((cont & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      code = (code << 6) | (cont & 0x3f);
    }
    if (!valid) {
      out += '�';
      continue;
    }
    i += extra;
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      out += '�';
    } else if (code >= 0x10000) {
      const shifted = code - 0x10000;
      out += String.fromCharCode(
        0xd800 + (shifted >> 10),
        0xdc00 + (shifted & 0x3ff),
      );
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}
