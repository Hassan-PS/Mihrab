/**
 * The sealed envelope: who can open it, who cannot, and what survives the
 * trip through a JSON file on disk.
 *
 * Every test here goes through the real tweetnacl. Only the platform's
 * randomness is substituted, because there is no native module under jest —
 * and it is substituted with node's CSPRNG rather than a counter, so a nonce
 * that got reused would show up as a passing test that should not pass.
 */
import { randomBytes as nodeRandomBytes } from 'crypto';
import nacl from 'tweetnacl';

jest.mock('../src/sync/secureRandom', () => {
  const actual = jest.requireActual('../src/sync/secureRandom');
  // Required inside the factory, not closed over: jest hoists this above the
  // imports and refuses any out-of-scope reference.
  const { randomBytes: nodeBytes } = require('crypto');
  return {
    ...actual,
    randomBytes: jest.fn(async (n: number) => new Uint8Array(nodeBytes(n))),
  };
});

import {
  ENVELOPE_FORMAT,
  ENVELOPE_VERSION,
  open,
  seal,
  type Envelope,
} from '../src/sync/envelope';
import { fromBase64, toBase64 } from '../src/sync/secureRandom';

/**
 * A device, made the way the app makes one: 32 bytes from the CSPRNG handed
 * to `fromSecretKey`, never `nacl.box.keyPair()` — see `secureRandom.ts` for
 * why the PRNG is left unset.
 */
function device() {
  const pair = nacl.box.keyPair.fromSecretKey(
    new Uint8Array(nodeRandomBytes(nacl.box.secretKeyLength)),
  );
  return { publicKey: pair.publicKey, secretKey: pair.secretKey };
}

const PAYLOAD = JSON.stringify({
  format: 'mihrab.snapshot',
  data: { journal: [{ date: '2026-08-20', prayer: 'fajr' }] },
});

/** The file as it actually travels: stringified and parsed back. */
function throughDisk(envelope: Envelope): unknown {
  return JSON.parse(JSON.stringify(envelope));
}

describe('the round trip', () => {
  it('hands the payload back to the recipient it was sealed for', async () => {
    const a = device();
    const b = device();

    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      senderName: "Hassan's phone",
      recipients: [b.publicKey],
    });

    const result = open({
      envelope: throughDisk(envelope),
      mySecretKey: b.secretKey,
      myPublicKey: b.publicKey,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.json).toBe(PAYLOAD);
    expect(toBase64(result.senderPublicKey)).toBe(toBase64(a.publicKey));
    expect(result.senderName).toBe("Hassan's phone");
  });

  it('carries no name when the sender gave none', async () => {
    const a = device();
    const b = device();
    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
    });
    expect(envelope.sender.name).toBeUndefined();

    const result = open({
      envelope,
      mySecretKey: b.secretKey,
      myPublicKey: b.publicKey,
    });
    expect(result.ok && result.senderName).toBeUndefined();
  });

  it('carries a payload that is not ASCII', async () => {
    const a = device();
    const b = device();
    // The journal has notes, and the app ships in thirteen languages. This
    // is the case that broke on a real device: Hermes has no TextDecoder,
    // and node does, so the round trip passed here and threw there.
    const arabic = JSON.stringify({
      note: 'صلاة الفجر في المسجد 🕌',
      surah: '晨礼',
      city: 'Göteborg',
    });
    const envelope = await seal({
      json: arabic,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
    });

    const result = open({
      envelope: throughDisk(envelope),
      mySecretKey: b.secretKey,
      myPublicKey: b.publicKey,
    });
    expect(result.ok && result.json).toBe(arabic);
  });

  it('never repeats a nonce, so sealing the same data twice differs', async () => {
    const a = device();
    const b = device();
    const args = {
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
    };
    const first = await seal(args);
    const second = await seal(args);

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.body).not.toBe(second.body);
    expect(first.keys[0].nonce).not.toBe(second.keys[0].nonce);
  });
});

describe('the announcement in the clear', () => {
  it('names the sender without needing any key to read it', async () => {
    const a = device();
    const b = device();
    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      senderName: 'Tablet',
      recipients: [b.publicKey],
    });

    // This is the whole point of the header: A has never heard of B, so when
    // B writes the first file back, A must be able to learn who it is from
    // before it can decrypt anything.
    const raw = throughDisk(envelope) as Envelope;
    expect(raw.sender.pk).toBe(toBase64(a.publicKey));
    expect(raw.sender.name).toBe('Tablet');
  });

  it('does not let a claimed key open anything it does not hold', async () => {
    const a = device();
    const b = device();
    const impostor = device();

    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
    });
    // Rewriting the header is trivial — it is plaintext. It buys nothing:
    // the boxed content key was sealed with A's secret half, and claiming
    // to be the impostor makes it undecryptable rather than readable.
    const forged = { ...(throughDisk(envelope) as Envelope) };
    forged.sender = { pk: toBase64(impostor.publicKey), name: 'A, honestly' };

    const result = open({
      envelope: forged,
      mySecretKey: b.secretKey,
      myPublicKey: b.publicKey,
    });
    expect(result).toEqual({ ok: false, reason: 'undecryptable' });
  });
});

describe('who cannot open it', () => {
  it('turns away a device that was not a recipient', async () => {
    const a = device();
    const b = device();
    const stranger = device();

    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
    });

    const result = open({
      envelope,
      mySecretKey: stranger.secretKey,
      myPublicKey: stranger.publicKey,
    });
    expect(result).toEqual({ ok: false, reason: 'not-for-us' });
  });

  it('skips the file this very device wrote', async () => {
    const a = device();
    const b = device();
    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
    });

    // A reading the folder it just wrote to. Cheap to detect and worth
    // detecting: without it, every scan reports one undecryptable file.
    const result = open({
      envelope,
      mySecretKey: a.secretKey,
      myPublicKey: a.publicKey,
    });
    expect(result).toEqual({ ok: false, reason: 'from-ourselves' });
  });

  it('refuses a tampered body rather than returning half of it', async () => {
    const a = device();
    const b = device();
    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
    });

    const bytes = fromBase64(envelope.body);
    bytes[bytes.length - 1] ^= 0x01;
    const tampered = { ...envelope, body: toBase64(bytes) };

    const result = open({
      envelope: tampered,
      mySecretKey: b.secretKey,
      myPublicKey: b.publicKey,
    });
    expect(result).toEqual({ ok: false, reason: 'undecryptable' });
  });

  it('refuses a tampered content key', async () => {
    const a = device();
    const b = device();
    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
    });

    const bytes = fromBase64(envelope.keys[0].key);
    bytes[0] ^= 0xff;
    const tampered = {
      ...envelope,
      keys: [{ ...envelope.keys[0], key: toBase64(bytes) }],
    };

    const result = open({
      envelope: tampered,
      mySecretKey: b.secretKey,
      myPublicKey: b.publicKey,
    });
    expect(result).toEqual({ ok: false, reason: 'undecryptable' });
  });
});

describe('files that are not ours', () => {
  const b = device();
  const openAs = (envelope: unknown) =>
    open({ envelope, mySecretKey: b.secretKey, myPublicKey: b.publicKey });

  it.each([
    ['null', null],
    ['a string', 'MHRB-ABCDEF'],
    ['an unrelated document', { format: 'mihrab.snapshot', data: {} }],
    ['a header with no body', { format: ENVELOPE_FORMAT, sender: { pk: 'x' } }],
    [
      'a header with no sender',
      { format: ENVELOPE_FORMAT, body: 'x', nonce: 'y', keys: [] },
    ],
  ])('reads %s as somebody else’s file, quietly', (_label, value) => {
    expect(openAs(value)).toEqual({ ok: false, reason: 'not-an-envelope' });
  });

  it('names a future version rather than failing to decrypt it', async () => {
    const a = device();
    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
    });

    // An older app meeting a newer one must say "I can't read this yet",
    // not "this is corrupt" — the two lead the user to different actions.
    const result = openAs({ ...envelope, version: ENVELOPE_VERSION + 1 });
    expect(result).toEqual({ ok: false, reason: 'unsupported-version' });
  });
});

describe('more than two devices', () => {
  it('encrypts the payload once and boxes only the key per device', async () => {
    const a = device();
    const others = [device(), device(), device()];

    const one = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [others[0].publicKey],
    });
    const three = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: others.map(d => d.publicKey),
    });

    expect(one.keys).toHaveLength(1);
    expect(three.keys).toHaveLength(3);
    // The cost of a third device is one sealed key, not a third copy of a
    // year of journal — which is the entire reason for the hybrid scheme.
    const perDevice =
      fromBase64(three.keys[0].key).length +
      fromBase64(three.keys[0].nonce).length;
    expect(perDevice).toBeLessThan(100);
    expect(fromBase64(three.body).length).toBe(fromBase64(one.body).length);
  });

  it('lets every recipient open the same file', async () => {
    const a = device();
    const others = [device(), device(), device()];
    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: others.map(d => d.publicKey),
    });

    for (const d of others) {
      const result = open({
        envelope: throughDisk(envelope),
        mySecretKey: d.secretKey,
        myPublicKey: d.publicKey,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.json).toBe(PAYLOAD);
    }
  });

  it('drops a recipient whose key is the wrong length instead of throwing', async () => {
    const a = device();
    const b = device();
    // A truncated entry in the peer list must not stop the other devices
    // being sent to — the alternative is one bad row breaking all sync.
    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [new Uint8Array(8), b.publicKey],
    });

    expect(envelope.keys).toHaveLength(1);
    expect(envelope.keys[0].to).toBe(toBase64(b.publicKey));
  });
});

describe('the shape on disk', () => {
  it('is plain JSON with a format and a timestamp', async () => {
    const a = device();
    const b = device();
    const envelope = await seal({
      json: PAYLOAD,
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      recipients: [b.publicKey],
      now: new Date('2026-08-23T09:15:00.000Z'),
    });

    expect(envelope.format).toBe('mihrab.envelope');
    expect(envelope.version).toBe(1);
    expect(envelope.createdAt).toBe('2026-08-23T09:15:00.000Z');
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
  });

  it('leaves nothing of the payload readable in the file', async () => {
    const a = device();
    const b = device();
    const envelope = await seal({
      json: JSON.stringify({ note: 'missed fajr, overslept' }),
      senderSecretKey: a.secretKey,
      senderPublicKey: a.publicKey,
      senderName: 'Phone',
      recipients: [b.publicKey],
    });

    const onDisk = JSON.stringify(envelope);
    expect(onDisk).not.toContain('overslept');
    expect(onDisk).not.toContain('note');
    // The two things that ARE readable, on purpose.
    expect(onDisk).toContain('Phone');
    expect(onDisk).toContain(toBase64(a.publicKey));
  });
});
