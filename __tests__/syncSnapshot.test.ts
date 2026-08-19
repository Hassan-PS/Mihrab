/**
 * The snapshot: what leaves the device, and what happens when it comes back.
 *
 * Two things are proved here, and the second is the one that makes a
 * peer-to-peer cycle possible at all.
 *
 *  1. ROUND TRIP. Everything a user has put into the app survives export →
 *     JSON text → import, byte for byte, on a device that has nothing.
 *
 *  2. THE MERGE IS AN ALGEBRA. It is commutative, idempotent and
 *     associative, so any number of devices can sync in any order, in any
 *     pairing, as often as they like, and agree — with no server, no
 *     primary, and no assumption that two phones' clocks match. Those three
 *     properties are the whole design; if one of them breaks, the feature
 *     needs a server to arbitrate and this app does not have one.
 */
import {
  buildSnapshot,
  categoriesIn,
  coerceSelection,
  DEFAULT_SELECTION,
  emptyData,
  everything,
  nothing,
  readSnapshot,
  SNAPSHOT_FORMAT,
  SnapshotError,
  SYNC_CATEGORIES,
  type SnapshotData,
} from '../src/sync/snapshot';
import {
  mergeData,
  mergeDhikr,
  mergeJournal,
  mergeKhatmah,
  mergeQuran,
  mergeSunnah,
} from '../src/sync/merge';
import { DEFAULT_QURAN_STATE } from '../src/quran/quranState';

const NOW = '2026-08-19T06:00:00.000Z';

/** A device with something of everything on it. */
function populated(): SnapshotData {
  return {
    // In the order a merge produces: date, then prayer name. Merging sorts,
    // so that two devices holding the same record hold the same BYTES —
    // see "settles into one order" below.
    prayers: [
      { date: '2026-08-17', prayer: 'Dhuhr', status: 'late', loggedAt: '2026-08-17T13:10:00.000Z', note: 'travelling' },
      { date: '2026-08-17', prayer: 'Fajr', status: 'on-time', loggedAt: '2026-08-17T03:30:00.000Z' },
    ],
    fasting: [
      {
        date: '2026-08-17',
        type: 'voluntary',
        completed: true,
        loggedAt: '2026-08-17T19:00:00.000Z',
      },
    ] as SnapshotData['fasting'],
    dhikr: { '2026-08-17': 3, '2026-08-18': 1 },
    sunnah: {
      '2026-08-17': { fajr: 1, dhuhr: 2, maghrib: 1, isha: 2, witr: true, qiyam: 4 },
    },
    quran: {
      ...DEFAULT_QURAN_STATE,
      lastRead: { surah: 2, ayah: 255, page: 42, mode: 'mushaf', updatedAt: 1_700_000_000_000 },
      bookmarks: [
        { id: 'b1', surah: 2, ayah: 255, page: 42, color: 'amber', createdAt: 1_700_000_000_000 },
      ],
      // Canonical order again: merging sorts these, so the fixture holds the
      // post-merge order and `merge(a, a) === a` stays literally true.
      starred: ['18:10', '2:255'],
      khatmah: [
        { id: 'k1', startedAt: 1_690_000_000_000, targetDays: 30, pagesRead: 120, completedAt: null },
      ],
      prefs: {
        ...DEFAULT_QURAN_STATE.prefs,
        reciterId: 'minshawi',
        companionMode: 'tafsir',
        tafsirEditionId: 'ar-jalalayn',
        hideMode: 'arabic',
      },
    },
    settings: { appearance: 'dark', language: 'sv', quranTranslationEdition: 'en.sahih' },
    location: { manualLatitude: 59.33, manualLongitude: 18.06, manualLocationLabel: 'Stockholm' },
  };
}

/** Export → text → import, exactly as a file would. */
function roundTrip(data: SnapshotData, selection = everything()) {
  const snap = buildSnapshot(data, selection, NOW, { app: 'Mihrab' });
  const text = JSON.stringify(snap);
  return readSnapshot(JSON.parse(text));
}

describe('the data can be extracted and imported back', () => {
  it('survives export → file text → import unchanged', () => {
    const data = populated();
    const back = readSnapshot(JSON.parse(JSON.stringify(buildSnapshot(data, everything(), NOW))));
    expect(back.data.prayers).toEqual(data.prayers);
    expect(back.data.fasting).toEqual(data.fasting);
    expect(back.data.dhikr).toEqual(data.dhikr);
    expect(back.data.sunnah).toEqual(data.sunnah);
    expect(back.data.quran).toEqual(data.quran);
    expect(back.data.settings).toEqual(data.settings);
    expect(back.data.location).toEqual(data.location);
  });

  it('lands whole on a device that had nothing', () => {
    // The migration case: new phone, empty stores, one file.
    const data = populated();
    const fresh = emptyData();
    const merged = mergeData(fresh, roundTrip(data), everything());
    expect(merged).toEqual(data);
  });

  it('keeps the tafsir, reciter and reading preferences', () => {
    // Named explicitly because they are the ones a user would notice
    // missing, and they live three layers deep in the Quran blob.
    const merged = mergeData(emptyData(), roundTrip(populated()), everything());
    expect(merged.quran.prefs.tafsirEditionId).toBe('ar-jalalayn');
    expect(merged.quran.prefs.companionMode).toBe('tafsir');
    expect(merged.quran.prefs.reciterId).toBe('minshawi');
    expect(merged.quran.prefs.hideMode).toBe('arabic');
    expect(merged.settings.quranTranslationEdition).toBe('en.sahih');
  });

  it('keeps khatmah plans and bookmarks', () => {
    const merged = mergeData(emptyData(), roundTrip(populated()), everything());
    expect(merged.quran.khatmah).toHaveLength(1);
    expect(merged.quran.khatmah[0].pagesRead).toBe(120);
    expect(merged.quran.bookmarks[0].id).toBe('b1');
    expect(merged.quran.starred).toEqual(['18:10', '2:255']);
  });

  it('keeps a prayer note, which is the most personal thing in the file', () => {
    const merged = mergeData(emptyData(), roundTrip(populated()), everything());
    expect(merged.prayers.find(p => p.prayer === 'Dhuhr')?.note).toBe('travelling');
  });
});

describe('the user chooses what travels', () => {
  it('carries only the categories that were selected', () => {
    const snap = buildSnapshot(populated(), { ...nothing(), prayers: true, quran: true }, NOW);
    expect(categoriesIn(snap).sort()).toEqual(['prayers', 'quran']);
    expect(snap.data.settings).toBeUndefined();
    expect(snap.data.location).toBeUndefined();
  });

  it('leaves location out by default — coordinates are opt-in', () => {
    expect(DEFAULT_SELECTION.location).toBe(false);
    const snap = buildSnapshot(populated(), DEFAULT_SELECTION, NOW);
    expect(snap.data.location).toBeUndefined();
    // And everything else is there, so the default is useful, not timid.
    expect(categoriesIn(snap)).toEqual(
      SYNC_CATEGORIES.filter(c => c !== 'location'),
    );
  });

  it('an ABSENT category leaves the receiving device alone', () => {
    // Absent and empty must not mean the same thing: an empty `prayers`
    // would be a claim that there are none.
    const mine = populated();
    const snap = buildSnapshot(emptyData(), { ...nothing(), settings: true }, NOW);
    const merged = mergeData(mine, snap, everything());
    expect(merged.prayers).toEqual(mine.prayers);
    expect(merged.quran.bookmarks).toEqual(mine.quran.bookmarks);
  });

  it('the receiving device can refuse a category the sender included', () => {
    // Two gates. The sender chose to send location; the receiver says no.
    const snap = buildSnapshot(populated(), everything(), NOW);
    const merged = mergeData(emptyData(), snap, { ...everything(), location: false });
    expect(merged.location).toEqual({});
    expect(merged.prayers).toHaveLength(2);
  });

  it('coerces a stored selection, filling gaps with the default', () => {
    expect(coerceSelection({ prayers: false, nonsense: 1 })).toEqual({
      ...DEFAULT_SELECTION,
      prayers: false,
    });
    expect(coerceSelection(null)).toEqual(DEFAULT_SELECTION);
  });
});

describe('a snapshot arriving from outside is not trusted', () => {
  it('rejects things that are not snapshots at all', () => {
    for (const bad of [null, 42, 'hello', [], {}, { format: 'other' }]) {
      expect(() => readSnapshot(bad)).toThrow(SnapshotError);
    }
  });

  it('refuses a format from a newer build rather than guessing', () => {
    expect(() =>
      readSnapshot({ format: SNAPSHOT_FORMAT, version: 99, data: {} }),
    ).toThrow(/newer/);
  });

  it('drops junk inside a category instead of the whole file', () => {
    const back = readSnapshot({
      format: SNAPSHOT_FORMAT,
      version: 1,
      createdAt: NOW,
      data: {
        prayers: [
          { date: 'not-a-date', prayer: 'Fajr', status: 'on-time', loggedAt: '' },
          { date: '2026-08-17', prayer: 'Fajr', status: 'on-time', loggedAt: '' },
        ],
        dhikr: { '2026-08-17': 3, 'garbage-key': 9, '2026-08-18': -1 },
      },
    });
    expect(back.data.prayers).toHaveLength(1);
    expect(back.data.dhikr).toEqual({ '2026-08-17': 3 });
  });

  it('range-checks Quran items against the mushaf they index into', () => {
    const back = readSnapshot({
      format: SNAPSHOT_FORMAT,
      version: 1,
      createdAt: NOW,
      data: {
        quran: {
          bookmarks: [
            { id: 'ok', surah: 2, ayah: 255, page: 42, color: 'amber', createdAt: 1 },
            { id: 'bad', surah: 2, ayah: 255, page: 9000, color: 'amber', createdAt: 1 },
            { id: 'nocolor', surah: 1, ayah: 1, page: 1, color: 'chartreuse', createdAt: 1 },
          ],
          khatmah: [{ id: 'k', startedAt: 1, targetDays: 30, pagesRead: 700, completedAt: null }],
          starred: ['2:255', 'not-a-key', 42],
        },
      },
    });
    const q = back.data.quran!;
    expect(q.bookmarks.map(b => b.id)).toEqual(['ok', 'nocolor']);
    // An unknown colour is repaired rather than dropped — the reference is
    // still a real ayah the user marked.
    expect(q.bookmarks[1].color).toBe('emerald');
    expect(q.khatmah[0].pagesRead).toBe(604);
    expect(q.starred).toEqual(['2:255']);
  });
});

describe('the merge is an algebra — this is what makes P2P safe', () => {
  const a = populated();
  const b: SnapshotData = {
    ...emptyData(),
    prayers: [
      // A correction to the same slot, written later.
      { date: '2026-08-17', prayer: 'Dhuhr', status: 'on-time', loggedAt: '2026-08-17T20:00:00.000Z' },
      { date: '2026-08-18', prayer: 'Asr', status: 'on-time', loggedAt: '2026-08-18T16:00:00.000Z' },
    ],
    dhikr: { '2026-08-17': 5, '2026-08-19': 2 },
    sunnah: {
      '2026-08-17': { fajr: 0, dhuhr: 1, maghrib: 1, isha: 0, witr: false, qiyam: 9 },
    },
    quran: {
      ...DEFAULT_QURAN_STATE,
      lastRead: { surah: 3, ayah: 1, page: 50, mode: 'mushaf', updatedAt: 1_800_000_000_000 },
      bookmarks: [{ id: 'b2', surah: 18, ayah: 10, page: 294, color: 'rose', createdAt: 2 }],
      starred: ['36:1'],
      khatmah: [{ id: 'k1', startedAt: 1_690_000_000_000, targetDays: 30, pagesRead: 300, completedAt: null }],
    },
  };

  const snap = (d: SnapshotData) => buildSnapshot(d, everything(), NOW);
  const merge = (x: SnapshotData, y: SnapshotData) =>
    mergeData(x, snap(y), everything());

  it('is COMMUTATIVE — neither device is the primary', () => {
    expect(merge(a, b)).toEqual(merge(b, a));
  });

  it('is IDEMPOTENT — importing the same file twice changes nothing', () => {
    const once = merge(a, b);
    const twice = merge(once, b);
    expect(twice).toEqual(once);
  });

  it('is idempotent against itself, so a sync cycle cannot drift', () => {
    expect(merge(a, a)).toEqual(a);
  });

  it('settles into ONE order, so two devices hold the same bytes', () => {
    // Not cosmetic: an order that depended on who sent first would make two
    // agreeing devices serialise differently, and any future "have we
    // changed since last sync?" check would fire forever.
    const shuffled: SnapshotData = { ...a, prayers: [...a.prayers].reverse() };
    expect(merge(shuffled, a).prayers).toEqual(merge(a, shuffled).prayers);
    expect(merge(shuffled, a).prayers.map(p => p.prayer)).toEqual([
      'Dhuhr',
      'Fajr',
    ]);
  });

  it('is ASSOCIATIVE — A→B→C lands where A→C→B does', () => {
    const c: SnapshotData = {
      ...emptyData(),
      dhikr: { '2026-08-17': 4, '2026-08-20': 7 },
      prayers: [
        { date: '2026-08-20', prayer: 'Isha', status: 'on-time', loggedAt: '2026-08-20T21:00:00.000Z' },
      ],
    };
    expect(merge(merge(a, b), c)).toEqual(merge(merge(a, c), b));
  });

  it('a three-device ring converges — the actual P2P cycle', () => {
    // A→B, B→C, C→A, then round again. Everyone ends up with everyone's.
    const c: SnapshotData = {
      ...emptyData(),
      prayers: [
        { date: '2026-08-21', prayer: 'Fajr', status: 'on-time', loggedAt: '2026-08-21T03:00:00.000Z' },
      ],
    };
    let A = a, B = b, C = c;
    for (let round = 0; round < 2; round++) {
      B = merge(B, A);
      C = merge(C, B);
      A = merge(A, C);
    }
    expect(A).toEqual(B);
    expect(B).toEqual(C);
    // And nothing was lost on the way round.
    expect(A.prayers.some(p => p.date === '2026-08-21')).toBe(true);
    expect(A.prayers.some(p => p.date === '2026-08-18')).toBe(true);
    expect(A.prayers.some(p => p.date === '2026-08-17')).toBe(true);
  });
});

describe('what each merge rule actually decides', () => {
  it('prayers: the entry written later wins the same slot', () => {
    const older = [{ date: '2026-08-17', prayer: 'Dhuhr' as const, status: 'missed' as const, loggedAt: '2026-08-17T12:00:00.000Z' }];
    const newer = [{ date: '2026-08-17', prayer: 'Dhuhr' as const, status: 'on-time' as const, loggedAt: '2026-08-17T20:00:00.000Z' }];
    expect(mergeJournal(older, newer)[0].status).toBe('on-time');
    // And the other way round, which is the same answer.
    expect(mergeJournal(newer, older)[0].status).toBe('on-time');
  });

  it('dhikr: the higher count, never the sum', () => {
    // Summing would double every day on the second sync.
    expect(mergeDhikr({ d: 3 }, { d: 5 })).toEqual({ d: 5 });
    expect(mergeDhikr({ d: 5 }, { d: 3 })).toEqual({ d: 5 });
  });

  it('sunnah: per field, the fuller record', () => {
    const x = { d: { fajr: 1, dhuhr: 0, maghrib: 1, isha: 0, witr: false, qiyam: 2 } };
    const y = { d: { fajr: 0, dhuhr: 2, maghrib: 0, isha: 2, witr: true, qiyam: 0 } };
    expect(mergeSunnah(x, y).d).toEqual({
      fajr: 1, dhuhr: 2, maghrib: 1, isha: 2, witr: true, qiyam: 2,
    });
  });

  it('khatmah: progress only moves forward, and a finish is kept', () => {
    const x = [{ id: 'k', startedAt: 10, targetDays: 30, pagesRead: 500, completedAt: null }];
    const y = [{ id: 'k', startedAt: 10, targetDays: 30, pagesRead: 604, completedAt: 99 }];
    const m = mergeKhatmah(x, y)[0];
    expect(m.pagesRead).toBe(604);
    expect(m.completedAt).toBe(99);
    // Reversed, the same plan — completion is a fact, not a race.
    expect(mergeKhatmah(y, x)[0].completedAt).toBe(99);
  });

  it('quran: bookmarks and stars unite; prefs go with the newer reader', () => {
    const older = {
      ...DEFAULT_QURAN_STATE,
      lastRead: { surah: 1, ayah: 1, page: 1, mode: 'mushaf' as const, updatedAt: 100 },
      prefs: { ...DEFAULT_QURAN_STATE.prefs, reciterId: 'husary' },
      bookmarks: [{ id: 'x', surah: 1, ayah: 1, page: 1, color: 'amber' as const, createdAt: 1 }],
      starred: ['1:1'],
    };
    const newer = {
      ...DEFAULT_QURAN_STATE,
      lastRead: { surah: 2, ayah: 2, page: 2, mode: 'mushaf' as const, updatedAt: 200 },
      prefs: { ...DEFAULT_QURAN_STATE.prefs, reciterId: 'minshawi' },
      bookmarks: [{ id: 'y', surah: 2, ayah: 2, page: 2, color: 'rose' as const, createdAt: 2 }],
      starred: ['2:2'],
    };
    const m = mergeQuran(older, newer);
    expect(m.bookmarks.map(b => b.id).sort()).toEqual(['x', 'y']);
    expect(m.starred).toEqual(['1:1', '2:2']);
    // Prefs are taken whole: a half-and-half blend is a setup neither user chose.
    expect(m.prefs.reciterId).toBe('minshawi');
    expect(m.lastRead?.page).toBe(2);
  });

  it('never deletes — the price of needing no server', () => {
    // A bookmark absent from the incoming side is NOT removed. Documented
    // as a trade, and pinned so nobody "fixes" it into a data-loss bug.
    const mine = populated();
    const theirs = { ...emptyData(), quran: { ...DEFAULT_QURAN_STATE } };
    const merged = mergeData(mine, buildSnapshot(theirs, everything(), NOW), everything());
    expect(merged.quran.bookmarks).toHaveLength(1);
    expect(merged.prayers).toHaveLength(2);
  });
});
