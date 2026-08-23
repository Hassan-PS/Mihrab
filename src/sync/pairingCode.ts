/**
 * The pairing code: a device's public key, written so a human can carry it.
 *
 * THE CODE IS THE KEY. Not a token that points at one, not a session id —
 * the 32 bytes themselves. Everything else in the sync design follows from
 * that, so it is worth being explicit about why:
 *
 *   • A public key is not a secret, so the code can live on a screen
 *     permanently, be copied, screenshotted, pasted into a message or read
 *     down a phone line, and none of that weakens anything. A shared secret
 *     could not be treated that way, and a design that shows a secret
 *     forever is a design that will eventually leak one.
 *
 *   • The key never crosses the sync channel, so there is no flight for
 *     anyone to intercept. That is why there is no fingerprint-confirmation
 *     ritual at pairing: it exists to catch substitution in transit, and
 *     here the transit is the user's own hands and clipboard.
 *
 *   • Input and output are the SAME STRING. What this device shows is
 *     exactly what the other device accepts, in both directions. One format,
 *     one parser, one thing to test — rather than a QR encoding and a text
 *     encoding that can drift apart.
 *
 * The QR carries this same string. It is not a second representation of the
 * key; it is a picture of the code.
 */

/**
 * Crockford's base32, and the choice matters more than it looks.
 *
 * It omits I, L, O and U — the first three because they are the characters
 * people confuse with 1 and 0, and U because excluding it keeps accidental
 * obscenities out of generated codes. Decoding then treats O as 0 and both I
 * and L as 1, so a code copied off one screen and typed into another device
 * survives exactly the substitutions people actually make.
 *
 * The alternatives were worse. Base64 is case-sensitive and contains + and /,
 * which is unreadable aloud and unsafe in a filename. Hex is unambiguous but
 * needs 64 characters where this needs 52.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Prefix so a code pasted into a chat is recognisable as one of ours. */
export const CODE_PREFIX = 'MHRB';

/** An X25519 public key. */
export const KEY_BYTES = 32;

/** 32 bytes at 5 bits a character, rounded up. */
const KEY_CHARS = Math.ceil((KEY_BYTES * 8) / 5); // 52

/** Two characters of checksum — ten bits, see `checksum`. */
const CHECK_CHARS = 2;

/** Groups of six, which divides 54 exactly and reads like a licence key. */
const GROUP = 6;

export type PairingCodeError =
  | 'empty'
  | 'bad-characters'
  | 'wrong-length'
  | 'checksum';

export type PairingCodeResult =
  | { ok: true; key: Uint8Array }
  | { ok: false; reason: PairingCodeError };

/**
 * CRC-16/CCITT-FALSE, truncated to the ten bits the two check characters
 * carry.
 *
 * A sum would have been three lines shorter and would not catch a
 * transposition — and transposing two characters is the second most common
 * thing a person does when copying a long string, after mistyping one. The
 * point of the checksum is that a user who slips gets told "this code has a
 * typo in it" instead of "pairing failed", which is the difference between a
 * one-second fix and giving up on the feature.
 */
function checksum(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0x3ff;
}

/** Big-endian bit packing, five bits at a time. */
function toBase32(bytes: Uint8Array, chars: number): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  let i = 0;
  while (out.length < chars) {
    if (bits < 5) {
      buffer = (buffer << 8) | (i < bytes.length ? bytes[i] : 0);
      bits += 8;
      i++;
    }
    bits -= 5;
    out += ALPHABET[(buffer >> bits) & 0x1f];
  }
  return out;
}

function fromBase32(text: string, byteCount: number): Uint8Array {
  const out = new Uint8Array(byteCount);
  let buffer = 0;
  let bits = 0;
  let written = 0;
  for (const ch of text) {
    buffer = (buffer << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (written < byteCount) out[written++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

/**
 * Uppercase, resolve the ambiguous characters, drop everything that is not a
 * symbol, and shed the prefix.
 *
 * Deliberately forgiving. Someone pasting a code will bring hyphens, spaces,
 * a stray newline from a chat app, and possibly the prefix twice; none of
 * that is a reason to refuse them. What it does NOT do is silently repair a
 * character that carries meaning — an unknown letter survives normalisation
 * so that `decode` can report `bad-characters` rather than quietly decoding
 * to the wrong key.
 */
export function normalize(input: string): string {
  const upper = (input ?? '')
    .toUpperCase()
    .replace(/[\s\-_.,:]/g, '')
    .replace(/^(?:MHRB)+/, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return upper;
}

/**
 * `MHRB-A1B2C3-…` — the string this device shows and the other device takes.
 */
export function encode(key: Uint8Array): string {
  if (key.length !== KEY_BYTES) {
    throw new Error(`pairing code needs ${KEY_BYTES} bytes, got ${key.length}`);
  }
  const check = checksum(key);
  // Ten bits as two symbols directly, rather than via a byte array: packing
  // it into bytes first and re-slicing at five bits loses the low two bits,
  // which is a checksum that silently agrees with itself and catches nothing.
  const body =
    toBase32(key, KEY_CHARS) +
    ALPHABET[(check >> 5) & 0x1f] +
    ALPHABET[check & 0x1f];
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += GROUP) {
    groups.push(body.slice(i, i + GROUP));
  }
  return [CODE_PREFIX, ...groups].join('-');
}

/**
 * The other direction, and it reports WHY rather than just failing.
 *
 * Four outcomes, because they need four different sentences on screen: an
 * empty field is not an error yet, an unknown character means this is not a
 * Mihrab code at all, a wrong length means it was truncated in the paste,
 * and a checksum failure means it is one of ours with a typo in it. Collapse
 * those into `false` and the screen can only say "invalid code", which tells
 * a stuck user nothing.
 */
export function decode(input: string): PairingCodeResult {
  const text = normalize(input);
  if (text.length === 0) return { ok: false, reason: 'empty' };
  for (const ch of text) {
    if (ALPHABET.indexOf(ch) < 0) return { ok: false, reason: 'bad-characters' };
  }
  if (text.length !== KEY_CHARS + CHECK_CHARS) {
    return { ok: false, reason: 'wrong-length' };
  }
  const key = fromBase32(text.slice(0, KEY_CHARS), KEY_BYTES);
  const claimed =
    (ALPHABET.indexOf(text[KEY_CHARS]) << 5) |
    ALPHABET.indexOf(text[KEY_CHARS + 1]);
  if (claimed !== checksum(key)) {
    return { ok: false, reason: 'checksum' };
  }
  // ONE KEY, ONE CODE. 52 symbols carry 260 bits and the key is 256, so the
  // final symbol has four spare bits: without this check, sixteen different
  // strings decode to the same key and all of them pass the checksum, since
  // the checksum is computed over the key rather than over the text. Nothing
  // is compromised by that — they are the same key — but it means two codes
  // for one device, and anything that later compares codes as strings would
  // be quietly wrong. Re-encoding and requiring a match makes the mapping
  // bijective, and costs one pass over 54 characters.
  if (encode(key).replace(/-/g, '').slice(CODE_PREFIX.length) !== text) {
    return { ok: false, reason: 'checksum' };
  }
  return { ok: true, key };
}

/** Whether a string is a code this app would accept. */
export function isValid(input: string): boolean {
  return decode(input).ok;
}
