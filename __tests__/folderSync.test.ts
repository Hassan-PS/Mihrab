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
import { addPeerByCode, forgetCachedPeers, listPeers } from '../src/sync/peers';
import {
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
