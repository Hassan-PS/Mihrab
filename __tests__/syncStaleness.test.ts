/**
 * A folder that has stopped carrying files must not look like sync.
 *
 * Reported 2026-08-26: a Mac and a Pixel both wrote their own snapshot
 * within three seconds of each other, and each held a copy of the OTHER's
 * from the previous afternoon. The Nextcloud folder between them had
 * stopped. From inside the app that was invisible — every round opened the
 * peer's (stale) file, counted it as read, merged it, and said "Synced",
 * while four logged prayers sat in a file that never moved.
 *
 * These are the two facts the app had and was throwing away: when the
 * peer's record was BUILT, as opposed to when we last opened it.
 */
import nacl from 'tweetnacl';

const mockStore = new Map<string, string>();

jest.mock('../src/storage/durableWrite', () => ({
  durableEncryptedGet: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  durableEncryptedSet: jest.fn(async (k: string, v: string) => {
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
import { forgetCachedIdentity } from '../src/sync/deviceIdentity';
import {
  forgetCachedPeers,
  listPeers,
  notePeerSeen,
  peerIsStale,
  PEER_STALE_MS,
  type Peer,
} from '../src/sync/peers';
import { reportForRound } from '../src/sync/roundReport';
import type { SyncRunResult } from '../src/sync/runSync';

function otherDevice(): Uint8Array {
  return nacl.box.keyPair.fromSecretKey(
    new Uint8Array(nodeRandomBytes(nacl.box.secretKeyLength)),
  ).publicKey;
}

beforeEach(() => {
  mockStore.clear();
  forgetCachedIdentity();
  forgetCachedPeers();
});

describe('what a peer row knows about its own freshness', () => {
  it('records when the snapshot was built, not when we read it', async () => {
    const them = otherDevice();
    // Their record is a day old; we are reading it right now, as we do
    // every round, because nothing in the folder is ever deleted.
    await notePeerSeen({
      publicKey: them,
      name: 'Pixel',
      now: new Date('2026-08-26T14:45:00.000Z'),
      dataAt: '2026-08-25T14:29:59.711Z',
    });

    const [peer] = await listPeers();
    expect(peer.lastSeenAt).toBe('2026-08-26T14:45:00.000Z');
    expect(peer.dataAt).toBe('2026-08-25T14:29:59.711Z');
  });

  it('does not let a stale re-read age a record that is current', async () => {
    const them = otherDevice();
    await notePeerSeen({
      publicKey: them,
      now: new Date('2026-08-26T14:00:00.000Z'),
      dataAt: '2026-08-26T13:59:00.000Z',
    });
    // The same device also leaves an invite behind, carrying an older
    // snapshot. Reading it second must not make the peer look older.
    await notePeerSeen({
      publicKey: them,
      now: new Date('2026-08-26T14:00:01.000Z'),
      dataAt: '2026-08-20T09:00:00.000Z',
    });

    const [peer] = await listPeers();
    expect(peer.dataAt).toBe('2026-08-26T13:59:00.000Z');
  });

  it('refuses a record from the future', async () => {
    const them = otherDevice();
    // Their clock is a week fast. "Last synced next Tuesday" is worse than
    // useless, and it would suppress the staleness warning for ever.
    await notePeerSeen({
      publicKey: them,
      now: new Date('2026-08-26T14:00:00.000Z'),
      dataAt: '2026-09-02T14:00:00.000Z',
    });

    const [peer] = await listPeers();
    expect(peer.dataAt).toBe('2026-08-26T14:00:00.000Z');
  });

  it('leaves a peer undated when the payload carried no snapshot', async () => {
    const them = otherDevice();
    await notePeerSeen({
      publicKey: them,
      now: new Date('2026-08-26T14:00:00.000Z'),
    });

    const [peer] = await listPeers();
    expect(peer.lastSeenAt).toBe('2026-08-26T14:00:00.000Z');
    expect(peer.dataAt).toBeUndefined();
    // Undated is not stale: it is no evidence, which is a different thing.
    expect(peerIsStale(peer, Date.parse('2026-09-30T00:00:00.000Z'))).toBe(
      false,
    );
  });

  it('survives a round trip through storage', async () => {
    const them = otherDevice();
    await notePeerSeen({
      publicKey: them,
      now: new Date('2026-08-26T14:00:00.000Z'),
      dataAt: '2026-08-25T14:00:00.000Z',
    });

    forgetCachedPeers();
    const [peer] = await listPeers();
    expect(peer.dataAt).toBe('2026-08-25T14:00:00.000Z');
  });
});

const NOW = Date.parse('2026-08-26T14:45:00.000Z');

function peerRow(over: Partial<Peer> = {}): Peer {
  return {
    pk: 'aaaa',
    fingerprint: '123456',
    addedAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-26T14:45:00.000Z',
    via: 'code',
    ...over,
  };
}

const readOne: SyncRunResult = {
  ok: true,
  at: '2026-08-26T14:45:00.000Z',
  outcome: {
    wrote: 'mihrab-AAAA.sync.json',
    read: 1,
    learned: 0,
    merged: null,
    skipped: { notOurs: 0, notForUs: 0, unreadable: 0 },
  },
};

const readNone: SyncRunResult = {
  ...readOne,
  outcome: { ...readOne.outcome, read: 0 },
};

describe('what the app says about a round', () => {
  it('does not call it Synced when every record is a day old', () => {
    const report = reportForRound(
      readOne,
      [peerRow({ name: 'Pixel', dataAt: '2026-08-25T14:29:59.711Z' })],
      { now: NOW, formatWhen: iso => iso },
    );

    expect(report.title).toBe('sync.syncQuietTitle');
    expect(report.body).toBe('sync.syncStale');
    // Named, so the user can tell "that tablet is in a drawer" from "the
    // folder is broken" — which the app cannot tell apart.
    expect(report.vars).toEqual({
      device: 'Pixel',
      when: '2026-08-25T14:29:59.711Z',
    });
  });

  it('names the LEAST stale device, not the worst one', () => {
    const report = reportForRound(
      readOne,
      [
        peerRow({ pk: 'a', name: 'Old tablet', dataAt: '2026-06-01T00:00:00.000Z' }),
        peerRow({ pk: 'b', name: 'Pixel', dataAt: '2026-08-25T14:00:00.000Z' }),
      ],
      { now: NOW, formatWhen: iso => iso },
    );

    expect(report.vars?.device).toBe('Pixel');
  });

  it('falls back to a name for a device that never sent one', () => {
    const report = reportForRound(
      readOne,
      [peerRow({ dataAt: '2026-08-01T00:00:00.000Z' })],
      { now: NOW, formatWhen: iso => iso, unnamedDevice: 'Unnamed device' },
    );

    expect(report.vars?.device).toBe('Unnamed device');
  });

  it('still says Synced while one device is current', () => {
    const report = reportForRound(
      readOne,
      [
        peerRow({ pk: 'a', name: 'Old tablet', dataAt: '2026-06-01T00:00:00.000Z' }),
        peerRow({ pk: 'b', name: 'Pixel', dataAt: '2026-08-26T14:44:00.000Z' }),
      ],
      { now: NOW },
    );

    expect(report.title).toBe('sync.syncDoneTitle');
  });

  it('does not warn about a peer just under the threshold', () => {
    const report = reportForRound(
      readOne,
      [peerRow({ dataAt: new Date(NOW - PEER_STALE_MS + 1000).toISOString() })],
      { now: NOW },
    );

    expect(report.title).toBe('sync.syncDoneTitle');
  });

  it('says nothing about staleness for a peer paired by an older build', () => {
    // No `dataAt` at all: it is not evidence of freshness OR of staleness,
    // so the old wording stands rather than a warning we cannot support.
    const report = reportForRound(readOne, [peerRow()], { now: NOW });
    expect(report.title).toBe('sync.syncDoneTitle');
  });

  it('keeps the two quiet cases apart when nothing was opened', () => {
    expect(
      reportForRound(readNone, [peerRow({ lastSeenAt: undefined })], { now: NOW })
        .body,
    ).toBe('sync.syncNothingArrived');

    expect(reportForRound(readNone, [peerRow()], { now: NOW }).body).toBe(
      'sync.syncNothing',
    );
  });

  it('names each failure rather than saying sync failed', () => {
    expect(reportForRound({ ok: false, reason: 'folder-gone' }, []).body).toBe(
      'sync.errorFolderGone',
    );
    expect(reportForRound({ ok: false, reason: 'no-folder' }, []).body).toBe(
      'sync.folderHelp',
    );
    expect(reportForRound({ ok: false, reason: 'no-identity' }, []).body).toBe(
      'sync.errorUnsupported',
    );
    expect(
      reportForRound({ ok: false, reason: 'failed', detail: 'EACCES' }, []),
    ).toMatchObject({ body: 'sync.syncFailedBody', vars: { detail: 'EACCES' } });
  });
});
