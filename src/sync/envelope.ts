/**
 * The sealed container a snapshot travels in, and the announcement that
 * makes a one-way pairing into a two-way one.
 *
 * ── HYBRID, NOT ONE BOX PER DEVICE ────────────────────────────────────
 *
 * The payload is encrypted ONCE with a fresh symmetric key, and only that
 * 32-byte key is boxed separately for each recipient. Sealing the whole
 * snapshot per recipient would work and is simpler to describe, but a year
 * of journal with notes runs to hundreds of kilobytes and tweetnacl is
 * JavaScript: three devices would mean encrypting a megabyte and a half on
 * the main thread every time anything changed. This way the payload is
 * encrypted once whatever the number of devices, and adding a fourth phone
 * costs 48 bytes.
 *
 * ── THE HEADER IS DELIBERATELY IN THE CLEAR ───────────────────────────
 *
 * `sender` is readable by anyone holding the file, and that is what makes
 * the pairing flow work at all.
 *
 * Pairing is one-directional: the user carries A's code to B, so B learns A
 * but A has never heard of B. For both devices to sync — which is what
 * anyone actually means by pairing — A has to learn B's key somehow. It
 * arrives here: B's first file names B, and A picks it up when it next
 * reads the folder.
 *
 * WHAT THAT DOES AND DOES NOT PROVE. That the sender could seal to A's key
 * proves only that they had A's code, and A's code is public by design —
 * it sits on a screen and is meant to be copied. So the header is not
 * authentication, and for the folder transport it does not need to be:
 * write access to the folder is the gate, and anyone through that gate can
 * do worse than announce themselves. A LAN or relay transport has no such
 * gate, and when either is built the announcement will need an explicit
 * accept on A rather than a notice.
 */
import nacl from 'tweetnacl';
import {
  fromBase64,
  randomBytes,
  toBase64,
  utf8Decode,
  utf8Encode,
} from './secureRandom';

export const ENVELOPE_FORMAT = 'mihrab.envelope';
export const ENVELOPE_VERSION = 1;

/** Who sent this, in the clear, so an unknown device can introduce itself. */
export type EnvelopeSender = {
  /** base64 X25519 public key. */
  pk: string;
  /** The name its owner gave it. Free text, never trusted for anything. */
  name?: string;
};

/** The content key, boxed to one recipient. */
export type SealedKey = {
  /** base64 public key of the device this one is for. */
  to: string;
  nonce: string;
  key: string;
};

export type Envelope = {
  format: typeof ENVELOPE_FORMAT;
  version: number;
  createdAt: string;
  sender: EnvelopeSender;
  keys: SealedKey[];
  /** The payload, secretbox'd under the content key. */
  nonce: string;
  body: string;
};

export type OpenResult =
  | { ok: true; senderPublicKey: Uint8Array; senderName?: string; json: string }
  | { ok: false; reason: OpenError };

export type OpenError =
  | 'not-an-envelope'
  | 'unsupported-version'
  | 'not-for-us'
  | 'undecryptable'
  | 'from-ourselves';

/**
 * Seal `json` for every recipient, from `me`.
 *
 * Recipients are the paired devices. The sender is NOT added to the
 * recipient list: a device has no reason to open its own file, and the
 * reader skips files it sent anyway — see `open`.
 */
export async function seal(input: {
  json: string;
  senderSecretKey: Uint8Array;
  senderPublicKey: Uint8Array;
  senderName?: string;
  recipients: Uint8Array[];
  now?: Date;
}): Promise<Envelope> {
  const contentKey = await randomBytes(nacl.secretbox.keyLength);
  const bodyNonce = await randomBytes(nacl.secretbox.nonceLength);
  const body = nacl.secretbox(
    utf8Encode(input.json),
    bodyNonce,
    contentKey,
  );

  const keys: SealedKey[] = [];
  for (const recipient of input.recipients) {
    if (recipient.length !== nacl.box.publicKeyLength) continue;
    const nonce = await randomBytes(nacl.box.nonceLength);
    const sealed = nacl.box(
      contentKey,
      nonce,
      recipient,
      input.senderSecretKey,
    );
    keys.push({
      to: toBase64(recipient),
      nonce: toBase64(nonce),
      key: toBase64(sealed),
    });
  }

  return {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    createdAt: (input.now ?? new Date()).toISOString(),
    sender: {
      pk: toBase64(input.senderPublicKey),
      ...(input.senderName ? { name: input.senderName } : {}),
    },
    keys,
    nonce: toBase64(bodyNonce),
    body: toBase64(body),
  };
}

/**
 * Open an envelope addressed to us, or say why we cannot.
 *
 * Every failure is named rather than collapsed into null, because they mean
 * different things to the caller reading a folder: a file that is not an
 * envelope is somebody else's, one that is not for us belongs to a device we
 * have not paired with, and one we cannot decrypt is either corrupt or was
 * sealed by a device claiming a key it does not hold. The first two are
 * routine and silent; the third is worth surfacing.
 */
export function open(input: {
  envelope: unknown;
  mySecretKey: Uint8Array;
  myPublicKey: Uint8Array;
}): OpenResult {
  const e = input.envelope as Envelope | null;
  if (
    !e ||
    typeof e !== 'object' ||
    e.format !== ENVELOPE_FORMAT ||
    typeof e.body !== 'string' ||
    typeof e.nonce !== 'string' ||
    !Array.isArray(e.keys) ||
    !e.sender ||
    typeof e.sender.pk !== 'string'
  ) {
    return { ok: false, reason: 'not-an-envelope' };
  }
  if (e.version !== ENVELOPE_VERSION) {
    return { ok: false, reason: 'unsupported-version' };
  }

  const senderPublicKey = fromBase64(e.sender.pk);
  const mine = toBase64(input.myPublicKey);
  // Our own file, seen while reading the folder we just wrote to.
  if (e.sender.pk === mine) return { ok: false, reason: 'from-ourselves' };

  const forUs = e.keys.find(k => k?.to === mine);
  if (!forUs) return { ok: false, reason: 'not-for-us' };

  const contentKey = nacl.box.open(
    fromBase64(forUs.key),
    fromBase64(forUs.nonce),
    senderPublicKey,
    input.mySecretKey,
  );
  if (!contentKey) return { ok: false, reason: 'undecryptable' };

  const plain = nacl.secretbox.open(
    fromBase64(e.body),
    fromBase64(e.nonce),
    contentKey,
  );
  if (!plain) return { ok: false, reason: 'undecryptable' };

  return {
    ok: true,
    senderPublicKey,
    senderName: e.sender.name,
    json: utf8Decode(plain),
  };
}
