/**
 * WHAT THE READER TOOK AWAY HAS TO TRAVEL (reported 2026-09-20).
 *
 * "Progressing a khitma is dragged back by its old point when syncing
 * between two devices, which is also the reason that a removed khatmah
 * marker comes back on sync." Two symptoms, one shape — and this repo has
 * now met that shape five times: the peer that un-removed itself
 * (`removedPeers.ts`), the cleared sunnah day, the abandoned khatmah plan,
 * the un-marked page, and these.
 *
 * A union and a max can only ever say MORE. An absence says nothing at
 * all, so the device that still has the row wins by default and the
 * removal undoes itself on the next round. Everything below is the same
 * answer applied to the places that still lacked it: the removal is a
 * fact with a date on it, and the merge reads dates.
 */
import {
  mergeFasting,
  mergeKhatmah,
  mergeQuran,
} from '../src/sync/merge';
import { applyMarks, compactMarks, type AyahMark } from '../src/quran/khatmahDone';
import {
  DEFAULT_QURAN_STATE,
  mergeRemovals,
  type KhatmahPlan,
  type QuranBookmark,
  type QuranState,
} from '../src/quran/quranState';
import {
  coerceFastEntries,
  deleteFastEntry,
  findFastEntry,
  liveFasts,
  type FastEntry,
} from '../src/fasting/fasting';

const plan: KhatmahPlan = {
  id: 'k1',
  startedAt: 1_000,
  targetDays: 30,
  pagesRead: 0,
  completedAt: null,
};

const both = (a: KhatmahPlan, b: KhatmahPlan) => [
  mergeKhatmah([a], [b])[0],
  mergeKhatmah([b], [a])[0],
];

describe('the khatmah pin, which is a thing you can take off', () => {
  const pinned: KhatmahPlan = {
    ...plan,
    position: { surah: 4, ayah: 1, page: 77 },
    positionAt: 5_000,
    done: [[0, 600]],
    ayahsRead: 600,
    pagesRead: 77,
  };
  // Read past it, so the pin was spent — the way this arrives without
  // anyone pressing anything.
  const spent: KhatmahPlan = {
    ...plan,
    position: null,
    positionAt: 9_000,
    done: [[0, 800]],
    ayahsRead: 800,
    pagesRead: 90,
  };

  it('stays off, whichever device is asked first', () => {
    for (const merged of both(spent, pinned)) {
      expect(merged.position ?? null).toBeNull();
      expect(merged.positionAt).toBe(9_000);
    }
  });

  it('and the reading it was dragged back to is not lost either', () => {
    for (const merged of both(spent, pinned)) {
      expect(merged.ayahsRead).toBe(800);
    }
  });

  it('a newer pin still wins — this is a date, not a preference for null', () => {
    const later: KhatmahPlan = {
      ...plan,
      position: { surah: 9, ayah: 1, page: 200 },
      positionAt: 12_000,
    };
    for (const merged of both(spent, later)) {
      expect(merged.position?.page).toBe(200);
    }
  });

  it('two plans from before the stamp keep the old rule', () => {
    // Neither side can express a removal, so "furthest wins" is the only
    // honest reading: a pin made on an un-updated device must survive.
    const old = { ...plan, position: { surah: 2, ayah: 5, page: 5 } };
    for (const merged of both({ ...plan }, old)) {
      expect(merged.position?.page).toBe(5);
    }
  });

  it('invents no key for a pair that never pinned anything', () => {
    const merged = mergeKhatmah([plan], [plan])[0];
    expect('position' in merged).toBe(false);
    expect('positionAt' in merged).toBe(false);
    expect(merged).toEqual(plan);
  });
});

describe("the day's baseline belongs to the device whose day it is", () => {
  const mac: KhatmahPlan = {
    ...plan,
    dayStartDate: '2026-09-20',
    dayStartPagesRead: 88,
    dayStartAyahsRead: 790,
  };
  const stalePhone: KhatmahPlan = {
    ...plan,
    dayStartDate: '2026-09-10',
    dayStartPagesRead: 70,
    dayStartAyahsRead: 600,
  };

  it('keeps its own, and answers the same question both ways round', () => {
    const merged = mergeKhatmah([mac], [stalePhone])[0];
    expect(merged.dayStartDate).toBe('2026-09-20');
    expect(merged.dayStartPagesRead).toBe(88);
    expect(merged.dayStartAyahsRead).toBe(790);
    const other = mergeKhatmah([stalePhone], [mac])[0];
    expect(other.dayStartDate).toBe('2026-09-10');
  });

  it('and a device with no day of its own does not inherit one', () => {
    const merged = mergeKhatmah([plan], [stalePhone])[0];
    expect('dayStartDate' in merged).toBe(false);
    expect('dayStartPagesRead' in merged).toBe(false);
  });
});

describe('reading is dated, so an old un-mark cannot erase it', () => {
  const unmarked: KhatmahPlan = {
    ...plan,
    done: [[1, 100], [151, 300]],
    marks: [[101, 150, 5_000, 0]],
    ayahsRead: 100,
    pagesRead: 10,
  };
  // The other device read those very ayahs afterwards, by turning pages.
  const readLater: KhatmahPlan = {
    ...plan,
    done: [[1, 300]],
    marks: [[101, 150, 9_000, 1]],
    ayahsRead: 300,
    pagesRead: 30,
  };

  it('the later reading holds, and the progress does not fall back', () => {
    for (const merged of both(unmarked, readLater)) {
      expect(merged.done).toEqual([[1, 300]]);
      expect(merged.ayahsRead).toBe(300);
    }
  });

  it('an un-mark made after the reading still wins', () => {
    const denied: KhatmahPlan = {
      ...plan,
      done: [[1, 100], [151, 300]],
      marks: [[101, 150, 12_000, 0]],
      ayahsRead: 100,
      pagesRead: 10,
    };
    for (const merged of both(readLater, denied)) {
      expect(merged.done).toEqual([[1, 100], [151, 300]]);
      expect(merged.ayahsRead).toBe(100);
    }
  });
});

describe('the claim log is resolved, not appended to for ever', () => {
  const turns: AyahMark[] = Array.from(
    { length: 60 },
    (_, i) => [i * 10, i * 10 + 9, 1_000 + i, 1] as AyahMark,
  );
  const withHole: AyahMark[] = [...turns, [55, 60, 2_000, 0]];

  it('keeps the verdict it had', () => {
    expect(applyMarks([], compactMarks(withHole, 6236), 6236)).toEqual(
      applyMarks([], withHole, 6236),
    );
  });

  it('and says it in a handful of claims instead of sixty-one', () => {
    expect(compactMarks(withHole, 6236).length).toBeLessThan(5);
  });

  it('compacting twice changes nothing', () => {
    const once = compactMarks(withHole, 6236);
    expect(compactMarks(once, 6236)).toEqual(once);
  });

  it('joins neighbours at the EARLIER time, never the later one', () => {
    // Joining at the later time would let today's page turn re-assert
    // ground claimed days ago and quietly undo another device's un-mark.
    const joined = compactMarks(
      [
        [0, 9, 1_000, 1],
        [10, 19, 5_000, 1],
      ],
      6236,
    );
    expect(joined).toEqual([[0, 19, 1_000, 1]]);
  });
});

/**
 * Removals are pruned at ninety days (`REMOVAL_TTL_DAYS`), so the clock in
 * these fixtures has to be a real one — an epoch-zero stamp is a removal
 * that expired in 1970.
 */
const NOW = Date.now();
const ago = (minutes: number) => NOW - minutes * 60_000;

const quran = (over: Partial<QuranState>): QuranState => ({
  ...DEFAULT_QURAN_STATE,
  ...over,
});

const bookmark = (over: Partial<QuranBookmark>): QuranBookmark => ({
  id: 'b1',
  surah: 2,
  ayah: 255,
  page: 42,
  color: 'emerald',
  createdAt: ago(60),
  ...over,
});

describe('a deleted bookmark stays deleted', () => {
  const mine = quran({ bookmarks: [], bookmarksRemoved: [{ id: 'b1', at: ago(10) }] });
  const theirs = quran({ bookmarks: [bookmark({})] });

  it('the other device does not hand it back', () => {
    expect(mergeQuran(mine, theirs).bookmarks).toEqual([]);
    expect(mergeQuran(theirs, mine).bookmarks).toEqual([]);
  });

  it('but one edited after the removal survives — a date, not a blacklist', () => {
    const edited = quran({ bookmarks: [bookmark({ updatedAt: ago(1) })] });
    expect(mergeQuran(mine, edited).bookmarks).toHaveLength(1);
  });

  it('merging a state with itself returns it', () => {
    expect(mergeQuran(mine, mine)).toEqual(mine);
    expect(mergeQuran(theirs, theirs)).toEqual(theirs);
  });

  it('and a pair that removed nothing gains no key', () => {
    const merged = mergeQuran(theirs, theirs);
    expect('bookmarksRemoved' in merged).toBe(false);
    expect('starsRemoved' in merged).toBe(false);
    expect('starsAt' in merged).toBe(false);
  });

  it('removals older than the window are dropped', () => {
    const ancient = Date.now() - 91 * 24 * 60 * 60 * 1000;
    expect(mergeRemovals([{ id: 'b1', at: ancient }], [])).toEqual([]);
  });

  it('a row removed, re-made and removed again keeps the LATER removal', () => {
    expect(
      mergeRemovals([{ id: 'b1', at: ago(30) }], [{ id: 'b1', at: ago(1) }]),
    ).toEqual([{ id: 'b1', at: ago(1) }]);
  });
});

describe('a bookmark that gave way does not come back either', () => {
  it('one ayah keeps one bookmark, after the sync as well as before', () => {
    // Re-bookmarking an ayah keeps the row's identity, so the common case
    // needs no tombstone. The case that does is a pin that GAVE WAY to a
    // following bookmark arriving on its ayah: a different id, dropped —
    // and on the other device still sitting there, ready to come back as
    // a second mark on one place (the shape issue #54 was about).
    const gaveWay = bookmark({ id: 'old', createdAt: ago(120) });
    const kept = bookmark({ id: 'following', createdAt: ago(200), updatedAt: ago(1) });
    const mine = quran({
      bookmarks: [kept],
      bookmarksRemoved: [{ id: 'old', at: ago(1) }],
    });
    const theirs = quran({ bookmarks: [gaveWay, kept] });
    for (const merged of [mergeQuran(mine, theirs), mergeQuran(theirs, mine)]) {
      expect(merged.bookmarks.map(b => b.id)).toEqual(['following']);
    }
  });
});

describe('an un-starred ayah stays un-starred', () => {
  const mine = quran({ starred: [], starsRemoved: [{ id: '2:255', at: ago(10) }] });
  const theirs = quran({ starred: ['2:255'] });

  it('the union does not put it back', () => {
    expect(mergeQuran(mine, theirs).starred).toEqual([]);
    expect(mergeQuran(theirs, mine).starred).toEqual([]);
  });

  it('and starring it again beats the removal, because that is dated too', () => {
    const again = quran({ starred: ['2:255'], starsAt: { '2:255': ago(1) } });
    for (const merged of [mergeQuran(mine, again), mergeQuran(again, mine)]) {
      expect(merged.starred).toEqual(['2:255']);
      expect(merged.starsAt?.['2:255']).toBe(ago(1));
    }
  });

  it('a stamp is not kept for a star that is gone', () => {
    const merged = mergeQuran(mine, quran({ starred: ['2:255'], starsAt: { '2:255': ago(30) } }));
    expect(merged.starred).toEqual([]);
    expect(merged.starsAt?.['2:255']).toBeUndefined();
  });
});

describe('a deleted fast stays deleted', () => {
  const kept: FastEntry = {
    date: '2026-09-18',
    type: 'voluntary',
    completed: true,
    loggedAt: '2026-09-18T10:00:00.000Z',
  };

  it('the delete is a write, and the write travels', () => {
    const cleared = deleteFastEntry([kept], '2026-09-18');
    expect(cleared[0].cleared).toBe(true);
    const merged = mergeFasting(cleared, [kept]);
    expect(merged).toHaveLength(1);
    expect(merged[0].cleared).toBe(true);
    expect(mergeFasting([kept], cleared)[0].cleared).toBe(true);
  });

  it('and nothing the reader looks at counts it', () => {
    const cleared = deleteFastEntry([kept], '2026-09-18');
    expect(liveFasts(cleared)).toEqual([]);
    expect(findFastEntry(cleared, '2026-09-18')).toBeUndefined();
  });

  it('logging the day again afterwards wins, as the newest word', () => {
    const cleared = deleteFastEntry([kept], '2026-09-18');
    const again: FastEntry = { ...kept, loggedAt: new Date(Date.now() + 1000).toISOString() };
    expect(mergeFasting(cleared, [again])[0].cleared).toBeUndefined();
  });

  it('and the tombstone is dropped once it is older than the window', () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      coerceFastEntries([{ ...kept, loggedAt: old, cleared: true }]),
    ).toEqual([]);
    // A live row of the same age is NOT a tombstone and is kept.
    expect(coerceFastEntries([{ ...kept, loggedAt: old }])).toHaveLength(1);
  });
});
