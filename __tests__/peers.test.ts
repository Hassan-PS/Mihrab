/**
 * The paired-device list: the two ways a device gets in, the ways it does
 * not, and what happens when the Keychain will not co-operate.
 */
import nacl from 'tweetnacl';

const mockStore = new Map<string, string>();
let mockWriteFails = false;
let mockReadFails = false;

jest.mock('../src/storage/durableWrite', () => ({
  durableEncryptedGet: jest.fn(async (k: string) => {
    if (mockReadFails) throw new Error('keychain locked');
    return mockStore.get(k) ?? null;
  }),
  durableEncryptedSet: jest.fn(async (k: string, v: string) => {
    if (mockWriteFails) throw new Error('keychain locked');
    mockStore.set(k, v);
  }),
}));

jest.mock('../src/sync/secureRandom', () => {
  const actual = jest.requireActual('../src/sync/secureRandom');
  const { randomBytes: nodeBytes } = require('crypto');
  return {
    ...actual,
    randomBytes: jest.fn(async (n: number) => new Uint8Array(nodeBytes(n))),
  };
});

import { randomBytes as nodeRandomBytes } from 'crypto';
import {
  forgetCachedIdentity,
  getDeviceIdentity,
  myPairingCode,
} from '../src/sync/deviceIdentity';
import { encode } from '../src/sync/pairingCode';
import { toBase64 } from '../src/sync/secureRandom';
import {
  addPeerByCode,
  forgetCachedPeers,
  forgetPeer,
  hasPeers,
  listPeers,
  MAX_PEERS,
  notePeerSeen,
  recipientKeys,
  renamePeer,
} from '../src/sync/peers';

const PEERS_KEY = 'prayerapp.sync.peers.v1';

/** Another device's public key, and the code its screen would show. */
function otherDevice() {
  const pair = nacl.box.keyPair.fromSecretKey(
    new Uint8Array(nodeRandomBytes(nacl.box.secretKeyLength)),
  );
  return { publicKey: pair.publicKey, code: encode(pair.publicKey) };
}

beforeEach(() => {
  mockStore.clear();
  mockWriteFails = false;
  mockReadFails = false;
  forgetCachedIdentity();
  forgetCachedPeers();
});

describe('pairing by code', () => {
  it('adds the device and writes it down', async () => {
    const other = otherDevice();
    const result = await addPeerByCode(other.code, {
      name: 'Tablet',
      now: new Date('2026-08-23T10:00:00.000Z'),
    });

    expect(result).toMatchObject({ ok: true, already: false });
    if (!result.ok) return;
    expect(result.peer.pk).toBe(toBase64(other.publicKey));
    expect(result.peer.via).toBe('code');
    expect(result.peer.name).toBe('Tablet');
    expect(result.peer.fingerprint).toMatch(/^\d{6}$/);
    expect(result.peer.addedAt).toBe('2026-08-23T10:00:00.000Z');

    // On disk, not just in memory — the difference between a device that is
    // paired and one that looks paired until the app restarts.
    forgetCachedPeers();
    const reread = await listPeers();
    expect(reread).toHaveLength(1);
    expect(reread[0].pk).toBe(toBase64(other.publicKey));
  });

  it('accepts the same code twice without making a second row', async () => {
    const other = otherDevice();
    await addPeerByCode(other.code);
    const again = await addPeerByCode(other.code);

    expect(again).toMatchObject({ ok: true, already: true });
    expect(await listPeers()).toHaveLength(1);
  });

  it('refuses this device’s own code and says which mistake it was', async () => {
    const mine = await myPairingCode();
    expect(await addPeerByCode(mine)).toEqual({
      ok: false,
      reason: 'this-device',
    });
    expect(await listPeers()).toHaveLength(0);
  });

  it('refuses a code that does not decode', async () => {
    expect(await addPeerByCode('MHRB-NOPE')).toEqual({
      ok: false,
      reason: 'bad-code',
    });
  });

  it('stops at the ceiling instead of growing every file it writes', async () => {
    for (let i = 0; i < MAX_PEERS; i++) {
      const added = await addPeerByCode(otherDevice().code);
      expect(added.ok).toBe(true);
    }
    expect(await addPeerByCode(otherDevice().code)).toEqual({
      ok: false,
      reason: 'too-many',
    });
    expect(await listPeers()).toHaveLength(MAX_PEERS);
  });
});

describe('the announcement, which is how one code syncs both ways', () => {
  it('learns a device it has never heard of from the file it sent', async () => {
    const other = otherDevice();
    const peer = await notePeerSeen({
      publicKey: other.publicKey,
      name: 'Phone',
      now: new Date('2026-08-23T11:00:00.000Z'),
    });

    expect(peer).toMatchObject({
      pk: toBase64(other.publicKey),
      name: 'Phone',
      via: 'announced',
      lastSeenAt: '2026-08-23T11:00:00.000Z',
    });
    expect(await hasPeers()).toBe(true);
  });

  it('moves a known device to last-seen without duplicating it', async () => {
    const other = otherDevice();
    await addPeerByCode(other.code, { now: new Date('2026-08-01T00:00:00Z') });
    await notePeerSeen({
      publicKey: other.publicKey,
      now: new Date('2026-08-23T12:00:00.000Z'),
    });

    const peers = await listPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].addedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(peers[0].lastSeenAt).toBe('2026-08-23T12:00:00.000Z');
    expect(peers[0].via).toBe('code');
  });

  it('upgrades an announced device when its code is later typed in', async () => {
    const other = otherDevice();
    await notePeerSeen({ publicKey: other.publicKey, name: 'Unknown' });
    const added = await addPeerByCode(other.code, { name: 'My iPad' });

    expect(added).toMatchObject({ ok: true, already: true });
    const peers = await listPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].via).toBe('code');
    expect(peers[0].name).toBe('My iPad');
  });

  it('does not let a device overwrite a name the user chose here', async () => {
    const other = otherDevice();
    await addPeerByCode(other.code, { name: "Hassan's iPad" });
    await notePeerSeen({ publicKey: other.publicKey, name: 'iPad' });

    expect((await listPeers())[0].name).toBe("Hassan's iPad");
  });

  it('takes the name of a device that was added by typing its code', async () => {
    const other = otherDevice();
    // The side that did the pairing used to show "Unnamed device" for ever
    // while the other side showed the real name — because the name was only
    // accepted from a peer that had announced itself. How the pairing was
    // made says nothing about whose word the name is.
    await addPeerByCode(other.code);
    expect((await listPeers())[0].name).toBeUndefined();

    await notePeerSeen({ publicKey: other.publicKey, name: 'Hassan’s iPhone' });
    expect((await listPeers())[0].name).toBe('Hassan’s iPhone');
  });

  it('lets a device rename itself later, until the user overrules it', async () => {
    const other = otherDevice();
    await addPeerByCode(other.code);
    await notePeerSeen({ publicKey: other.publicKey, name: 'Old name' });
    await notePeerSeen({ publicKey: other.publicKey, name: 'New name' });
    expect((await listPeers())[0].name).toBe('New name');

    await renamePeer(toBase64(other.publicKey), 'Mine');
    await notePeerSeen({ publicKey: other.publicKey, name: 'Theirs' });
    expect((await listPeers())[0].name).toBe('Mine');
  });

  it('hands the peer back its own name when the user clears theirs', async () => {
    const other = otherDevice();
    await addPeerByCode(other.code, { name: 'Mine' });
    const pk = toBase64(other.publicKey);

    await renamePeer(pk, '   ');
    await notePeerSeen({ publicKey: other.publicKey, name: 'Theirs' });
    // Clearing is not "call it nothing for ever" — it is "I have no opinion".
    expect((await listPeers())[0].name).toBe('Theirs');
  });

  it('ignores an envelope that names this very device', async () => {
    const me = await getDeviceIdentity();
    expect(await notePeerSeen({ publicKey: me.publicKey })).toBeNull();
    expect(await listPeers()).toHaveLength(0);
  });

  it('ignores a key of the wrong length', async () => {
    expect(await notePeerSeen({ publicKey: new Uint8Array(8) })).toBeNull();
    expect(await listPeers()).toHaveLength(0);
  });

  it('refuses to grow past the ceiling from announcements alone', async () => {
    for (let i = 0; i < MAX_PEERS; i++) {
      await notePeerSeen({ publicKey: otherDevice().publicKey });
    }
    expect(await notePeerSeen({ publicKey: otherDevice().publicKey })).toBeNull();
    expect(await listPeers()).toHaveLength(MAX_PEERS);
  });
});

describe('editing the list', () => {
  it('renames a peer, and clears the name when given nothing', async () => {
    const other = otherDevice();
    await addPeerByCode(other.code, { name: 'Old' });
    const pk = toBase64(other.publicKey);

    expect(await renamePeer(pk, '  New name  ')).toBe(true);
    expect((await listPeers())[0].name).toBe('New name');

    expect(await renamePeer(pk, '   ')).toBe(true);
    expect((await listPeers())[0].name).toBeUndefined();
  });

  it('says so when asked to rename or forget something absent', async () => {
    expect(await renamePeer('not-a-peer', 'x')).toBe(false);
    expect(await forgetPeer('not-a-peer')).toBe(false);
  });

  it('forgets a peer and stops offering it as a recipient', async () => {
    const keep = otherDevice();
    const drop = otherDevice();
    await addPeerByCode(keep.code);
    await addPeerByCode(drop.code);

    expect(await forgetPeer(toBase64(drop.publicKey))).toBe(true);
    const keys = await recipientKeys();
    expect(keys).toHaveLength(1);
    expect(toBase64(keys[0])).toBe(toBase64(keep.publicKey));
    expect(keys[0].length).toBe(nacl.box.publicKeyLength);
  });
});

describe('when storage misbehaves', () => {
  it('reads a corrupt blob as no peers rather than throwing at a screen', async () => {
    mockStore.set(PEERS_KEY, 'not json at all');
    expect(await listPeers()).toEqual([]);
  });

  it('drops rows whose key is not a key, and keeps the rest', async () => {
    const good = otherDevice();
    mockStore.set(
      PEERS_KEY,
      JSON.stringify([
        { pk: 'AAAA', via: 'code', addedAt: '2026-01-01T00:00:00.000Z' },
        { nothing: true },
        {
          pk: toBase64(good.publicKey),
          via: 'code',
          addedAt: '2026-01-01T00:00:00.000Z',
        },
        // A duplicate of the same device, which two writes could produce.
        {
          pk: toBase64(good.publicKey),
          via: 'announced',
          addedAt: '2026-02-01T00:00:00.000Z',
        },
      ]),
    );

    const peers = await listPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].pk).toBe(toBase64(good.publicKey));
    // Missing from the stored row, so it is derived rather than left blank.
    expect(peers[0].fingerprint).toMatch(/^\d{6}$/);
  });

  it('survives a Keychain that cannot be read', async () => {
    mockReadFails = true;
    expect(await listPeers()).toEqual([]);
    expect(await hasPeers()).toBe(false);
  });

  it('does not pretend a failed write happened', async () => {
    const other = otherDevice();
    // Make the identity first: generating one writes the secret half, and a
    // failure there is a different failure — "this device cannot do sync at
    // all" rather than "this pairing did not save".
    await getDeviceIdentity();
    mockWriteFails = true;

    await expect(addPeerByCode(other.code)).rejects.toThrow('keychain locked');
    // The cache must still say what disk says, or the device looks paired
    // until it is restarted and then quietly is not.
    expect(await listPeers()).toEqual([]);

    mockWriteFails = false;
    expect((await addPeerByCode(other.code)).ok).toBe(true);
    expect(await listPeers()).toHaveLength(1);
  });
});

describe('concurrency', () => {
  it('does not lose rows when three pairings land at once', async () => {
    const devices = [otherDevice(), otherDevice(), otherDevice()];
    // Read-modify-write against a single Keychain entry: without the queue
    // in `mutate`, the last write wins and two of these disappear.
    await Promise.all(devices.map(d => addPeerByCode(d.code)));

    const peers = await listPeers();
    expect(peers).toHaveLength(3);
    forgetCachedPeers();
    expect(await listPeers()).toHaveLength(3);
  });

  it('mixes announcements and pairings without duplicating a device', async () => {
    const other = otherDevice();
    await Promise.all([
      addPeerByCode(other.code),
      notePeerSeen({ publicKey: other.publicKey }),
      notePeerSeen({ publicKey: other.publicKey }),
    ]);
    expect(await listPeers()).toHaveLength(1);
  });
});
