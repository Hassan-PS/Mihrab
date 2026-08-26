/**
 * Two devices, one folder, and the three things Hassan described.
 *
 * The pieces below this each have their own tests — the code, the envelope,
 * the peer list, the merge algebra. None of them proves the sentence the
 * feature is actually for: *take the code from A to B, and afterwards a
 * prayer logged on A shows up on B, and the page you reached on B is where
 * you carry on from on A.*
 *
 * So this runs two whole devices in one process. Each has its own secure
 * store, its own AsyncStorage, its own identity and its own peer list; the
 * folder between them is a Map. Everything else — the real snapshot, the
 * real merge, the real crypto — is the shipping code.
 */
type Store = { secure: Map<string, string>; plain: Map<string, string> };

const mockDevices: Record<string, Store> = {
  A: { secure: new Map(), plain: new Map() },
  B: { secure: new Map(), plain: new Map() },
};
let mockActive = 'A';

jest.mock('../src/storage/durableWrite', () => ({
  durableEncryptedGet: jest.fn(
    async (k: string) => mockDevices[mockActive].secure.get(k) ?? null,
  ),
  durableEncryptedSet: jest.fn(async (k: string, v: string) => {
    mockDevices[mockActive].secure.set(k, v);
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockDevices[mockActive].plain.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockDevices[mockActive].plain.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockDevices[mockActive].plain.delete(k);
    }),
  },
}));

jest.mock('../src/sync/secureRandom', () => {
  const actual = jest.requireActual('../src/sync/secureRandom');
  const { randomBytes: nodeBytes } = require('crypto');
  return {
    ...actual,
    randomBytes: jest.fn(async (n: number) => new Uint8Array(nodeBytes(n))),
  };
});

import {
  forgetCachedIdentity,
  getDeviceIdentity,
  myPairingCode,
} from '../src/sync/deviceIdentity';
import { forgetCachedDeviceName, setDeviceName } from '../src/sync/deviceName';
import {
  addPeerByCode,
  forgetCachedPeers,
  listPeers,
  peerIsStale,
} from '../src/sync/peers';
import {
  inviteFileNameFor,
  isSyncFileName,
  syncFileNameFor,
  syncWithFolder,
  SYNC_FILE_PREFIX,
  type SyncFolder,
} from '../src/sync/folderSync';
import { JOURNAL_KEY } from '../src/practice/practiceStore';
import { QURAN_STORAGE_KEY } from '../src/quran/quranState';

/** The shared folder: whatever software the user already trusts to move it. */
function memoryFolder(): SyncFolder & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    list: async () => [...files.keys()],
    read: async (name: string) => {
      const value = files.get(name);
      if (value === undefined) throw new Error(`no such file: ${name}`);
      return value;
    },
    write: async (name: string, contents: string) => {
      files.set(name, contents);
    },
  };
}

/**
 * Run `fn` as one device.
 *
 * Every module-level cache is dropped on the way in and out — identity,
 * peers, device name. Without that the second device inherits the first
 * one's keypair and the test proves nothing at all.
 */
async function as<T>(which: 'A' | 'B', fn: () => Promise<T>): Promise<T> {
  mockActive = which;
  forgetCachedIdentity();
  forgetCachedPeers();
  forgetCachedDeviceName();
  try {
    return await fn();
  } finally {
    forgetCachedIdentity();
    forgetCachedPeers();
    forgetCachedDeviceName();
  }
}

async function publicKeyOf(which: 'A' | 'B'): Promise<Uint8Array> {
  return as(which, async () => (await getDeviceIdentity()).publicKey);
}

function journalOf(which: 'A' | 'B'): Array<Record<string, unknown>> {
  const raw = mockDevices[which].secure.get(JOURNAL_KEY);
  return raw ? JSON.parse(raw) : [];
}

function quranOf(which: 'A' | 'B'): Record<string, unknown> {
  const raw = mockDevices[which].plain.get(QURAN_STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

beforeEach(() => {
  for (const store of Object.values(mockDevices)) {
    store.secure.clear();
    store.plain.clear();
  }
  mockActive = 'A';
  forgetCachedIdentity();
  forgetCachedPeers();
  forgetCachedDeviceName();
});

/** The user's flow: A's code, typed into B, once. */
async function pairBFromA(): Promise<void> {
  const codeOfA = await as('A', () => myPairingCode());
  await as('B', async () => {
    await setDeviceName('Tablet');
    const added = await addPeerByCode(codeOfA);
    expect(added.ok).toBe(true);
  });
  await as('A', () => setDeviceName('Phone'));
}

/** Both codes carried, as someone does when they set two devices up. */
async function pairBothWays(): Promise<void> {
  const codeOfA = await as('A', () => myPairingCode());
  const codeOfB = await as('B', () => myPairingCode());
  await as('B', async () => {
    await setDeviceName('Tablet');
    expect((await addPeerByCode(codeOfA)).ok).toBe(true);
  });
  await as('A', async () => {
    await setDeviceName('Phone');
    expect((await addPeerByCode(codeOfB)).ok).toBe(true);
  });
}

describe('one code, carried once, in one direction', () => {
  it('leaves A knowing B as well, without a second code', async () => {
    const folder = memoryFolder();
    await pairBFromA();

    // A has never heard of B at this point — pairing was one-directional.
    expect(await as('A', () => listPeers())).toEqual([]);

    // B writes first. It has a recipient; A does not yet.
    await as('B', () => syncWithFolder(folder));
    // A reads with an empty peer list, which it must be allowed to do.
    const roundA = await as('A', () => syncWithFolder(folder));

    expect(roundA.learned).toBe(1);
    const peersOfA = await as('A', () => listPeers());
    expect(peersOfA).toHaveLength(1);
    expect(peersOfA[0].via).toBe('announced');
    expect(peersOfA[0].name).toBe('Tablet');
    // And A wrote in the same round, sealed to the device it just learned.
    expect(roundA.wrote).toBe(syncFileNameFor(await publicKeyOf('A')));
    expect(folder.files.has(roundA.wrote as string)).toBe(true);
  });
});

describe('a prayer logged on A', () => {
  it('shows up on B after a round each way', async () => {
    const folder = memoryFolder();
    await pairBFromA();

    mockDevices.A.secure.set(
      JOURNAL_KEY,
      JSON.stringify([
        {
          date: '2026-08-22',
          prayer: 'Fajr',
          status: 'on-time',
          loggedAt: '2026-08-22T03:10:00.000Z',
          note: 'at the masjid',
        },
      ]),
    );

    // B announces itself, A reads that and writes its own file, B reads it.
    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));
    const roundB = await as('B', () => syncWithFolder(folder));

    expect(roundB.read).toBe(1);
    const onB = journalOf('B');
    expect(onB).toHaveLength(1);
    expect(onB[0]).toMatchObject({
      date: '2026-08-22',
      prayer: 'Fajr',
      status: 'on-time',
      note: 'at the masjid',
    });
  });

  it('does not duplicate it when the same file is read again', async () => {
    const folder = memoryFolder();
    await pairBFromA();
    mockDevices.A.secure.set(
      JOURNAL_KEY,
      JSON.stringify([
        {
          date: '2026-08-22',
          prayer: 'Fajr',
          status: 'on-time',
          loggedAt: '2026-08-22T03:10:00.000Z',
        },
      ]),
    );

    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));
    await as('B', () => syncWithFolder(folder));
    await as('B', () => syncWithFolder(folder));
    await as('B', () => syncWithFolder(folder));

    // The merge is idempotent, and this is the test that says so end to end.
    expect(journalOf('B')).toHaveLength(1);
  });
});

describe('where you left off in the Quran', () => {
  it('carries the plain last-read position across', async () => {
    const folder = memoryFolder();
    await pairBFromA();

    mockDevices.B.plain.set(
      QURAN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        lastRead: {
          surah: 12,
          ayah: 40,
          page: 244,
          mode: 'mushaf',
          updatedAt: 1_756_000_000_000,
        },
        bookmarks: [],
        starred: [],
        khatmah: [],
        prefs: {},
      }),
    );

    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));

    // No khatmah involved: someone who just reads, and expects to carry on
    // from the same page on the other device.
    expect(quranOf('A').lastRead).toMatchObject({
      surah: 12,
      ayah: 40,
      page: 244,
    });
  });

  it('carries khatmah progress, and takes the further-through position', async () => {
    const folder = memoryFolder();
    await pairBFromA();

    const plan = {
      id: 'khatmah-1',
      startedAt: 1_755_000_000_000,
      targetDays: 30,
      pagesRead: 0,
      completedAt: null,
    };
    mockDevices.A.plain.set(
      QURAN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        bookmarks: [],
        starred: [],
        khatmah: [
          { ...plan, pagesRead: 40, position: { surah: 2, ayah: 30, page: 40 } },
        ],
        prefs: {},
      }),
    );
    mockDevices.B.plain.set(
      QURAN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        bookmarks: [],
        starred: [],
        khatmah: [
          { ...plan, pagesRead: 96, position: { surah: 5, ayah: 12, page: 96 } },
        ],
        prefs: {},
      }),
    );

    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));
    await as('B', () => syncWithFolder(folder));

    for (const which of ['A', 'B'] as const) {
      const khatmah = quranOf(which).khatmah as Array<Record<string, unknown>>;
      expect(khatmah).toHaveLength(1);
      // Progress is a high-water mark, so both devices land on the further
      // one rather than on whoever synced last.
      expect(khatmah[0].pagesRead).toBe(96);
      expect(khatmah[0].position).toEqual({ surah: 5, ayah: 12, page: 96 });
    }
  });
});

describe('a folder that will not list itself', () => {
  it('still reads a paired device, by asking for its file by name', async () => {
    // Not hypothetical: an Android 16 emulator returns an empty cursor for a
    // directory holding seven files, with both grants held, while happily
    // creating and opening files in it. Every device's filename comes from
    // its public key, so for a device we have already paired with there is
    // nothing to enumerate — we know what to ask for.
    const folder = memoryFolder();
    await pairBothWays();
    mockDevices.B.secure.set(
      JOURNAL_KEY,
      JSON.stringify([
        {
          date: '2026-08-21',
          prayer: 'Isha',
          status: 'on-time',
          loggedAt: '2026-08-21T19:40:00.000Z',
        },
      ]),
    );
    await as('B', () => syncWithFolder(folder));

    // The folder now has B's file and refuses to admit it exists.
    const blind: SyncFolder = { ...folder, list: async () => [] };
    const round = await as('A', () => syncWithFolder(blind));

    expect(round.read).toBe(1);
    expect(journalOf('A')).toHaveLength(1);
  });

  it('still introduces an unknown device, through an invite named after us', async () => {
    // The case that has no name to guess: A has never heard of B, so it
    // cannot ask for B's file. B therefore leaves one named after A, and A
    // knows its own id. This is what makes one code enough on a provider
    // that will not enumerate anything.
    const folder = memoryFolder();
    await pairBFromA();
    await as('B', () => syncWithFolder(folder));

    const blind: SyncFolder = { ...folder, list: async () => [] };
    const round = await as('A', () => syncWithFolder(blind));

    expect(round.learned).toBe(1);
    const peers = await as('A', () => listPeers());
    expect(peers).toHaveLength(1);
    expect(peers[0].via).toBe('announced');
    expect(peers[0].name).toBe('Tablet');
  });

  it('writes the invite under the recipient’s own id', async () => {
    const folder = memoryFolder();
    await pairBFromA();
    await as('B', () => syncWithFolder(folder));

    // Named for A, because A is the one who has to find it without a
    // listing. Naming it for B would be useless: A cannot guess B.
    expect([...folder.files.keys()]).toContain(
      inviteFileNameFor(await publicKeyOf('A')),
    );
  });

  it('stops inviting once the other device has answered', async () => {
    const folder = memoryFolder();
    await pairBFromA();
    await as('B', () => syncWithFolder(folder));
    await as('A', () => syncWithFolder(folder));

    // A has now written a file sealed to B, so when B reads it B knows for
    // certain that A knows B — and there is nothing left to introduce.
    folder.files.delete(inviteFileNameFor(await publicKeyOf('A')));
    await as('B', () => syncWithFolder(folder));

    expect([...folder.files.keys()]).not.toContain(
      inviteFileNameFor(await publicKeyOf('A')),
    );
  });

  it('does not report a paired device that has never written as a problem', async () => {
    const folder = memoryFolder();
    await pairBothWays();
    // B is paired and has written nothing. Asking for its file and being
    // told there is none is the normal first round, not a fault.
    const round = await as('A', () => syncWithFolder(folder));

    expect(round.read).toBe(0);
    expect(round.skipped).toEqual({ notOurs: 0, notForUs: 0, unreadable: 0 });
  });
});

describe('a folder that has stopped carrying files', () => {
  /**
   * The failure this was written for: a Nextcloud folder between a Mac and
   * a phone stopped syncing, and neither app noticed. Nothing in the folder
   * is ever deleted, so the peer's LAST file is still sitting there — still
   * readable, still mergeable — and every round opened it, counted it, and
   * reported a successful sync against a snapshot from the day before.
   *
   * The distinction that makes it visible: `lastSeenAt` keeps advancing
   * (we really are opening a file of theirs), `dataAt` does not (they have
   * not written a new one).
   */
  it('freezes the peer’s record age while re-reading its old file', async () => {
    const folder = memoryFolder();
    await pairBothWays();

    // A writes once, at a knowable time, and then goes quiet — or rather,
    // keeps writing somewhere B can no longer see.
    await as('A', () =>
      syncWithFolder(folder, { now: new Date('2026-08-25T14:29:59.711Z') }),
    );

    // B keeps syncing all the next day and keeps finding A's one old file.
    for (const at of [
      '2026-08-26T09:00:00.000Z',
      '2026-08-26T12:00:00.000Z',
      '2026-08-26T14:45:00.000Z',
    ]) {
      const round = await as('B', () =>
        syncWithFolder(folder, { now: new Date(at) }),
      );
      // It genuinely reads it. That is exactly why "read > 0" was not
      // enough to justify the word "Synced".
      expect(round.read).toBe(1);
    }

    const [a] = await as('B', () => listPeers());
    expect(a.lastSeenAt).toBe('2026-08-26T14:45:00.000Z');
    expect(a.dataAt).toBe('2026-08-25T14:29:59.711Z');
    expect(peerIsStale(a, Date.parse('2026-08-26T14:45:00.000Z'))).toBe(true);
  });

  it('catches the record up the moment the peer writes again', async () => {
    const folder = memoryFolder();
    await pairBothWays();
    await as('A', () =>
      syncWithFolder(folder, { now: new Date('2026-08-25T14:00:00.000Z') }),
    );
    await as('B', () =>
      syncWithFolder(folder, { now: new Date('2026-08-26T14:00:00.000Z') }),
    );

    await as('A', () =>
      syncWithFolder(folder, { now: new Date('2026-08-26T14:30:00.000Z') }),
    );
    await as('B', () =>
      syncWithFolder(folder, { now: new Date('2026-08-26T14:31:00.000Z') }),
    );

    const [a] = await as('B', () => listPeers());
    expect(a.dataAt).toBe('2026-08-26T14:30:00.000Z');
    expect(peerIsStale(a, Date.parse('2026-08-26T14:31:00.000Z'))).toBe(false);
  });
});

describe('the folder is shared with things that are not us', () => {
  it('steps over strangers, junk and half-written files', async () => {
    const folder = memoryFolder();
    await pairBFromA();
    await as('B', () => syncWithFolder(folder));

    folder.files.set('shopping-list.txt', 'milk, dates');
    folder.files.set(`${SYNC_FILE_PREFIX}TRUNCATED.sync.json`, '{"format":');
    folder.files.set(
      `${SYNC_FILE_PREFIX}SOMEONEELSE.sync.json`,
      JSON.stringify({
        format: 'mihrab.envelope',
        version: 1,
        createdAt: '2026-08-22T00:00:00.000Z',
        sender: { pk: 'AAAA' },
        keys: [{ to: 'BBBB', nonce: 'CC', key: 'DD' }],
        nonce: 'EE',
        body: 'FF',
      }),
    );

    const round = await as('A', () => syncWithFolder(folder));

    // The stray text file is not even considered: the name does not match.
    expect(round.skipped.notOurs).toBe(1); // the truncated one
    expect(round.skipped.notForUs).toBe(1); // another pair's file
    expect(round.skipped.unreadable).toBe(0);
    expect(round.read).toBe(1); // B's, which is real
  });

  it('recognises its own file names and nothing else', () => {
    const key = new Uint8Array(32).fill(7);
    const name = syncFileNameFor(key);
    expect(isSyncFileName(name)).toBe(true);
    expect(name).toMatch(/^mihrab-[0-9A-HJKMNP-TV-Z]{12}\.sync\.json$/);
    expect(isSyncFileName('mihrab-backup-2026-08-19.json')).toBe(false);
    expect(isSyncFileName('shopping-list.txt')).toBe(false);
  });

  it('gives two devices different file names', async () => {
    await pairBFromA();
    expect(syncFileNameFor(await publicKeyOf('A'))).not.toBe(
      syncFileNameFor(await publicKeyOf('B')),
    );
  });
});

describe('a device with nothing to send to', () => {
  it('reads but does not write', async () => {
    const folder = memoryFolder();
    // Nobody has been paired at all.
    const round = await as('A', () => syncWithFolder(folder));
    expect(round.wrote).toBeNull();
    expect(round.read).toBe(0);
    expect(folder.files.size).toBe(0);
  });
});
