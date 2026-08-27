/**
 * The round trip through real storage — the thing Hassan asked to be sure of.
 *
 * `syncSnapshot.test.ts` proves the format and the merge algebra with plain
 * objects. This proves the part that could still be wrong afterwards: that
 * the values actually come OUT of the seven stores, survive being written to
 * a file as text, and go back IN to a device that has nothing — landing in
 * the same keys, decrypted, in a shape the app's own readers accept.
 *
 * The encrypted stores are the reason this matters. Their key lives in the
 * Android Keystore / iOS Keychain and cannot leave the device, so a byte
 * copy of the ciphertext restores nothing anywhere. Export has to go through
 * the plaintext values, and this is where that is checked.
 */
const mockStore = new Map<string, string>();

jest.mock('../src/storage/durableWrite', () => ({
  // The store announces writes; `recordChanged` subscribes on import.
  // A mock without it makes every module that saves anything fail to load.
  onDurableWrite: jest.fn(() => () => {}),
  durableEncryptedGet: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  durableEncryptedSet: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockStore.delete(k);
    }),
  },
}));

import {
  applySnapshot,
  collectData,
  writeData,
  LOCATION_KEY,
  SETTINGS_KEY,
} from '../src/sync/snapshotStore';
import {
  buildSnapshot,
  everything,
  nothing,
  readSnapshot,
  type SnapshotData,
} from '../src/sync/snapshot';
import {
  DHIKR_KEY,
  FASTING_KEY,
  JOURNAL_KEY,
  SUNNAH_KEY,
} from '../src/practice/practiceStore';
import { QURAN_STORAGE_KEY, DEFAULT_QURAN_STATE } from '../src/quran/quranState';

const NOW = '2026-08-19T06:00:00.000Z';

/** Seed every store the way a used phone would have them. */
function seedUsedPhone() {
  mockStore.set(
    JOURNAL_KEY,
    JSON.stringify([
      { date: '2026-08-17', prayer: 'Fajr', status: 'on-time', loggedAt: '2026-08-17T03:30:00.000Z', note: 'at the masjid' },
    ]),
  );
  mockStore.set(
    FASTING_KEY,
    JSON.stringify([
      { date: '2026-08-17', type: 'voluntary', completed: true, loggedAt: '2026-08-17T19:00:00.000Z' },
    ]),
  );
  mockStore.set(DHIKR_KEY, JSON.stringify({ '2026-08-17': 3 }));
  mockStore.set(
    SUNNAH_KEY,
    JSON.stringify({
      '2026-08-17': { fajr: 1, dhuhr: 2, maghrib: 1, isha: 2, witr: true, qiyam: 4 },
    }),
  );
  mockStore.set(
    QURAN_STORAGE_KEY,
    JSON.stringify({
      ...DEFAULT_QURAN_STATE,
      lastRead: { surah: 2, ayah: 255, page: 42, mode: 'mushaf', updatedAt: 1700 },
      bookmarks: [{ id: 'b1', surah: 2, ayah: 255, page: 42, color: 'amber', createdAt: 1 }],
      starred: ['2:255'],
      khatmah: [{ id: 'k1', startedAt: 100, targetDays: 30, pagesRead: 120, completedAt: null }],
      prefs: {
        ...DEFAULT_QURAN_STATE.prefs,
        reciterId: 'minshawi',
        companionMode: 'tafsir',
        tafsirEditionId: 'ar-jalalayn',
      },
    }),
  );
  mockStore.set(
    SETTINGS_KEY,
    JSON.stringify({ appearance: 'dark', language: 'sv', calculationMethod: 3 }),
  );
  mockStore.set(
    LOCATION_KEY,
    JSON.stringify({ manualLatitude: 59.33, manualLongitude: 18.06 }),
  );
}

beforeEach(() => mockStore.clear());

describe('collecting from the real stores', () => {
  it('reads all seven, decrypted', async () => {
    seedUsedPhone();
    const d = await collectData();
    expect(d.prayers).toHaveLength(1);
    expect(d.prayers[0].note).toBe('at the masjid');
    expect(d.fasting).toHaveLength(1);
    expect(d.dhikr).toEqual({ '2026-08-17': 3 });
    expect(d.sunnah['2026-08-17'].qiyam).toBe(4);
    expect(d.quran.prefs.tafsirEditionId).toBe('ar-jalalayn');
    expect(d.settings.language).toBe('sv');
    expect(d.location.manualLatitude).toBe(59.33);
  });

  it('returns a usable empty shape on a phone with nothing', async () => {
    const d = await collectData();
    expect(d.prayers).toEqual([]);
    expect(d.quran).toEqual(DEFAULT_QURAN_STATE);
    expect(d.settings).toEqual({});
  });

  it('one unreadable store does not cost the other six', async () => {
    // Somebody whose Keychain entry was lost in a device migration should
    // still get their bookmarks out.
    seedUsedPhone();
    mockStore.set(JOURNAL_KEY, '{ this is not json');
    const d = await collectData();
    expect(d.prayers).toEqual([]);
    expect(d.quran.bookmarks).toHaveLength(1);
    expect(d.settings.language).toBe('sv');
  });
});

describe('export → file → import, onto a device that has nothing', () => {
  it('lands every category back in its own store', async () => {
    seedUsedPhone();
    const source = await collectData();

    // Exactly what the export button writes and the import button reads.
    const fileText = JSON.stringify(
      buildSnapshot(source, everything(), NOW, { app: 'Mihrab' }),
    );

    // A brand-new phone.
    mockStore.clear();
    const snapshot = readSnapshot(JSON.parse(fileText));
    const result = await applySnapshot(snapshot, everything());

    const restored = await collectData();
    expect(restored).toEqual(source);

    // And it landed in the real keys, not somewhere invented.
    expect(mockStore.has(JOURNAL_KEY)).toBe(true);
    expect(mockStore.has(SUNNAH_KEY)).toBe(true);
    expect(mockStore.has(QURAN_STORAGE_KEY)).toBe(true);
    expect(mockStore.has(SETTINGS_KEY)).toBe(true);
    expect(result.summary.prayers).toEqual({ before: 0, after: 1 });
    expect(result.summary.bookmarks).toEqual({ before: 0, after: 1 });
  });

  it('importing the same file twice leaves the same phone', async () => {
    seedUsedPhone();
    const fileText = JSON.stringify(
      buildSnapshot(await collectData(), everything(), NOW),
    );
    mockStore.clear();

    await applySnapshot(readSnapshot(JSON.parse(fileText)), everything());
    const once = await collectData();
    await applySnapshot(readSnapshot(JSON.parse(fileText)), everything());
    const twice = await collectData();
    expect(twice).toEqual(once);
  });

  it('merges into a phone that already has its own record', async () => {
    // The real sync case: neither side is empty and nothing may be lost.
    seedUsedPhone();
    const fromOtherPhone = JSON.stringify(
      buildSnapshot(await collectData(), everything(), NOW),
    );

    mockStore.clear();
    mockStore.set(
      JOURNAL_KEY,
      JSON.stringify([
        { date: '2026-08-18', prayer: 'Isha', status: 'on-time', loggedAt: '2026-08-18T21:00:00.000Z' },
      ]),
    );
    mockStore.set(DHIKR_KEY, JSON.stringify({ '2026-08-17': 9 }));

    await applySnapshot(readSnapshot(JSON.parse(fromOtherPhone)), everything());
    const d = await collectData();
    expect(d.prayers).toHaveLength(2);
    expect(d.prayers.map(p => p.date).sort()).toEqual(['2026-08-17', '2026-08-18']);
    // The local higher count survives the incoming lower one.
    expect(d.dhikr['2026-08-17']).toBe(9);
  });
});

describe('the user choice is honoured on both sides', () => {
  it('a category left out of the file is not written at all', async () => {
    seedUsedPhone();
    const partial = JSON.stringify(
      buildSnapshot(await collectData(), { ...nothing(), quran: true }, NOW),
    );
    mockStore.clear();
    const result = await applySnapshot(
      readSnapshot(JSON.parse(partial)),
      everything(),
    );
    expect(mockStore.has(QURAN_STORAGE_KEY)).toBe(true);
    // No empty journal written over the top of nothing.
    expect(mockStore.has(JOURNAL_KEY)).toBe(false);
    expect(result.applied.prayers).toBe(false);
    expect(result.applied.quran).toBe(true);
  });

  it('a category the receiving phone refuses is not written', async () => {
    seedUsedPhone();
    const all = JSON.stringify(buildSnapshot(await collectData(), everything(), NOW));
    mockStore.clear();
    await applySnapshot(readSnapshot(JSON.parse(all)), {
      ...everything(),
      location: false,
      settings: false,
    });
    expect(mockStore.has(LOCATION_KEY)).toBe(false);
    expect(mockStore.has(SETTINGS_KEY)).toBe(false);
    expect(mockStore.has(JOURNAL_KEY)).toBe(true);
  });

  it('never carries device-local state across', async () => {
    // The install date in particular: the Log's "fill in earlier days"
    // button uses it as the earliest day it may offer, so importing another
    // phone's would let this one claim days it never saw.
    seedUsedPhone();
    mockStore.set('mihrab.first_seen_day', '2020-01-01');
    mockStore.set('prayer_times_cache.v2', '{"caches":{}}');
    mockStore.set('mihrab.featureTour.v1', '1');
    const text = JSON.stringify(buildSnapshot(await collectData(), everything(), NOW));
    expect(text).not.toContain('first_seen');
    expect(text).not.toContain('2020-01-01');
    expect(text).not.toContain('prayer_times_cache');
    expect(text).not.toContain('featureTour');
  });
});

describe('writeData', () => {
  it('touches only the categories it was told to', async () => {
    const data: SnapshotData = {
      prayers: [],
      fasting: [],
      dhikr: {},
      sunnah: {},
      quran: DEFAULT_QURAN_STATE,
      settings: { a: 1 },
      location: { b: 2 },
    };
    await writeData(data, { ...nothing(), settings: true });
    expect(mockStore.has(SETTINGS_KEY)).toBe(true);
    expect(mockStore.has(LOCATION_KEY)).toBe(false);
    expect(mockStore.has(JOURNAL_KEY)).toBe(false);
  });
});
