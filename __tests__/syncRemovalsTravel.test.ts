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
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  __resetQuranStateForTests,
  activeKhatmah,
  addBookmark,
  clearKhatmahPosition,
  getQuranState,
  isKhatmahPageDone,
  khatmahCurrentPage,
  recordKhatmahPageTurn,
  removeBookmark,
  setKhatmahPosition,
  startKhatmah,
  toggleKhatmahPageDone,
  toggleStar,
} from '../src/quran/quranState';
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

/**
 * Removals are pruned at ninety days (`REMOVAL_TTL_DAYS`), so the clock in
 * these fixtures has to be a real one — an epoch-zero stamp is a removal
 * that expired in 1970.
 */
const NOW = Date.now();
const ago = (minutes: number) => NOW - minutes * 60_000;

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

describe('what the reader actually sees, not just what the merge returns', () => {
  it('"continue" stops being dragged back to the spent pin', () => {
    const pinnedAt40: KhatmahPlan = {
      ...plan,
      position: { surah: 2, ayah: 30, page: 40 },
      positionAt: ago(120),
      done: [[1, 400]],
      ayahsRead: 400,
      pagesRead: 40,
    };
    // The Mac read on past it, which spends the pin.
    const readOn: KhatmahPlan = {
      ...plan,
      position: null,
      positionAt: ago(1),
      done: [[1, 1200]],
      ayahsRead: 1200,
      pagesRead: 96,
    };
    // The page the door opens on is derived from the reading once no pin
    // is set — which is the whole complaint: it was opening page 40.
    for (const merged of both(readOn, pinnedAt40)) {
      expect(khatmahCurrentPage(merged)).toBeGreaterThan(90);
    }
  });
});

describe('a device still on the old build cannot undo any of it', () => {
  /**
   * An older build drops the fields it has never heard of, so its
   * snapshot carries a pin with no stamp and no removal lists at all.
   * The updated device must keep its own removals — the old one will
   * catch up when it is updated, and until then it is the only one that
   * still shows the row.
   */
  const oldBuild: KhatmahPlan = {
    ...plan,
    position: { surah: 2, ayah: 30, page: 40 },
    done: [[1, 400]],
    ayahsRead: 400,
    pagesRead: 40,
  };
  const updated: KhatmahPlan = {
    ...plan,
    position: null,
    positionAt: ago(1),
    done: [[1, 1200]],
    ayahsRead: 1200,
    pagesRead: 96,
  };

  it('the dated clear still wins over an undated pin', () => {
    for (const merged of both(updated, oldBuild)) {
      expect(merged.position ?? null).toBeNull();
    }
  });

  it('and a removal survives a snapshot that carries no removals', () => {
    const mine = quran({
      bookmarks: [],
      bookmarksRemoved: [{ id: 'b1', at: ago(5) }],
      starred: [],
      starsRemoved: [{ id: '2:255', at: ago(5) }],
    });
    const old = quran({ bookmarks: [bookmark({})], starred: ['2:255'] });
    for (const merged of [mergeQuran(mine, old), mergeQuran(old, mine)]) {
      expect(merged.bookmarks).toEqual([]);
      expect(merged.starred).toEqual([]);
    }
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

  it('says it in one claim per stretch the reader last spoke about', () => {
    // Sixty turns and one denial: sixty-one claims, each at its own
    // time — the two turns the denial cut are the parts it left — and
    // never more than the pages read plus the denials.
    expect(compactMarks(withHole, 6236)).toHaveLength(60 + 1);
    expect(compactMarks([...turns, ...turns], 6236)).toHaveLength(60);
  });

  it('compacting twice changes nothing', () => {
    const once = compactMarks(withHole, 6236);
    expect(compactMarks(once, 6236)).toEqual(once);
  });

  it('never weakens an un-mark with its neighbour\'s date', () => {
    // Un-mark page A on Monday and page B beside it on Wednesday; the
    // other device read B on Tuesday. Joining the two denials at Monday's
    // time would hand B back — the failure this mechanism exists to stop.
    const monday = 1_000;
    const tuesday = 2_000;
    const wednesday = 3_000;
    const denials = compactMarks(
      [
        [10, 19, monday, 0],
        [20, 29, wednesday, 0],
      ],
      6236,
    );
    expect(denials).toHaveLength(2);
    const merged = applyMarks(
      [[1, 100]],
      [...denials, [20, 29, tuesday, 1] as AyahMark].sort((x, y) => x[2] - y[2]),
      6236,
    );
    // 20–29 was denied last, on Wednesday, so it stays denied.
    expect(merged).toEqual([[1, 9], [30, 100]]);
  });

  /**
   * A read keeps its own time (2026-09-22). Neighbouring reads used to be
   * joined at the earlier of their times, which backdated every page
   * this device read after a denial the other device made in between —
   * a pin, an un-mark, a rewind — and the denial then beat them on the
   * merge. Joined at the later time they would instead have re-asserted
   * ground claimed days ago over that same denial. Neither time is the
   * read's, so neither is used.
   */
  it('does not join reads made at different times', () => {
    const kept = compactMarks(
      [
        [0, 9, 1_000, 1],
        [10, 19, 5_000, 1],
      ],
      6236,
    );
    expect(kept).toEqual([
      [1, 9, 1_000, 1],
      [10, 19, 5_000, 1],
    ]);
    // Beside a denial the other device made in between, each read is
    // judged at its own time: the first loses to it, the second beats it.
    const merged = applyMarks(
      [],
      [...kept, [0, 19, 3_000, 0] as AyahMark].sort((x, y) => x[2] - y[2]),
      6236,
    );
    expect(merged).toEqual([[10, 19]]);
  });

  it('joins only claims made in the same breath', () => {
    expect(
      compactMarks(
        [
          [0, 9, 1_000, 1],
          [10, 19, 1_000, 1],
          [30, 39, 1_000, 1],
        ],
        6236,
      ),
    ).toEqual([
      [1, 19, 1_000, 1],
      [30, 39, 1_000, 1],
    ]);
  });

  /**
   * The reported case. A pin at 527: read before, denied after. Reading
   * on from 527 is later than the denial and wins — and folded into the
   * pin's reading at the pin's time it would LOSE to the same denial on
   * the device that still holds it at full width.
   */
  it('keeps the reading past a pin at its own time, and the denial at its width', () => {
    const pin: AyahMark[] = [
      [1, 526, 1_000, 1],
      [527, 6236, 1_001, 0],
    ];
    const readOn: AyahMark[] = [
      [527, 540, 2_000, 1],
      [541, 560, 2_001, 1],
    ];
    const compacted = compactMarks([...pin, ...readOn], 6236);
    expect(compacted).toEqual([
      [1, 526, 1_000, 1],
      [527, 6236, 1_001, 0],
      [527, 540, 2_000, 1],
      [541, 560, 2_001, 1],
    ]);
    // Replayed beside the peer's copy of the pin: what was read stays read.
    const both = [...pin, ...compacted].sort((x, y) => x[2] - y[2] || x[0] - y[0]);
    expect(applyMarks([], both, 6236)).toEqual([[1, 560]]);
  });

  it('keeps a denial whole under later reading', () => {
    // Un-mark one page, read it again, read on. The denial used to be
    // trimmed to nothing and vanish — while the peer still held it.
    const once = compactMarks(
      [
        [1, 100, 1_000, 1],
        [50, 59, 2_000, 0],
        [50, 59, 3_000, 1],
        [101, 120, 4_000, 1],
      ],
      6236,
    );
    expect(once).toContainEqual([50, 59, 2_000, 0]);
    expect(once).toContainEqual([50, 59, 3_000, 1]);
    expect(compactMarks(once, 6236)).toEqual(once);
    const peer: AyahMark[] = [
      [1, 100, 1_000, 1],
      [50, 59, 2_000, 0],
    ];
    const both = [...peer, ...once].sort((x, y) => x[2] - y[2] || x[0] - y[0]);
    expect(applyMarks([], both, 6236)).toEqual([[1, 120]]);
  });

  it('a later denial still cuts an earlier one', () => {
    const cut = compactMarks(
      [
        [500, 6236, 1_000, 0],
        [1, 599, 2_000, 1],
        [600, 6236, 2_001, 0],
      ],
      6236,
    );
    expect(cut).toEqual([
      [500, 599, 1_000, 0],
      [1, 599, 2_000, 1],
      [600, 6236, 2_001, 0],
    ]);
    expect(applyMarks([], cut, 6236)).toEqual([[1, 599]]);
  });
});

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

/**
 * AND THE WRITERS, not just the merge.
 *
 * Every test above hands the merge a stamp somebody typed. These drive
 * the real writers instead, because a rule the merge reads correctly is
 * worth nothing if a writer forgets to leave the date — and there are six
 * places that move the pin.
 */
describe('what the app itself writes when the reader takes something away', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  const active = () => activeKhatmah(getQuranState())!;

  it('pinning dates the pin', () => {
    setKhatmahPosition(2, 30, 40);
    expect(active().position).toEqual({ surah: 2, ayah: 30, page: 40 });
    expect(active().positionAt).toBeGreaterThan(0);
  });

  it('clearing it by hand dates the clearing', () => {
    setKhatmahPosition(2, 30, 40);
    const pinnedAt = active().positionAt!;
    clearKhatmahPosition();
    expect(active().position ?? null).toBeNull();
    expect(active().positionAt!).toBeGreaterThan(pinnedAt);
  });

  it('and so does reading past it, which is how the report started', () => {
    setKhatmahPosition(1, 1, 1);
    const pinnedAt = active().positionAt!;
    for (let p = 1; p < 6; p++) recordKhatmahPageTurn(p, p + 1);
    expect(active().position ?? null).toBeNull();
    expect(active().positionAt!).toBeGreaterThan(pinnedAt);
    // The stale copy on the other device cannot put it back.
    const stale = {
      ...active(),
      position: { surah: 1, ayah: 1, page: 1 },
      positionAt: pinnedAt,
    };
    expect(mergeKhatmah([active()], [stale])[0].position ?? null).toBeNull();
  });

  it('a pin that never moved keeps its date, so a mere sync cannot outbid one', () => {
    setKhatmahPosition(2, 30, 40);
    const at = active().positionAt!;
    // Re-pinning the same ayah, or any write that leaves it alone, must
    // not re-stamp: a device that only opened the reader would then talk
    // over a removal made somewhere else.
    setKhatmahPosition(2, 30, 40);
    expect(active().positionAt).toBe(at);
  });

  it('removing a bookmark leaves a dated removal behind', () => {
    addBookmark(2, 255, 42, 'emerald');
    const made = getQuranState().bookmarks[0];
    removeBookmark(made.id);
    const state = getQuranState();
    expect(state.bookmarks).toEqual([]);
    const removal = state.bookmarksRemoved?.find(r => r.id === made.id);
    expect(removal).toBeDefined();
    expect(removal!.at).toBeGreaterThan(made.createdAt);
    // …and the other device's copy does not come back.
    const theirs = { ...DEFAULT_QURAN_STATE, bookmarks: [made] };
    expect(mergeQuran(state, theirs).bookmarks).toEqual([]);
    expect(mergeQuran(theirs, state).bookmarks).toEqual([]);
  });

  it('un-starring does too, and starring again outdates it', () => {
    toggleStar(2, 255);
    const starredAt = getQuranState().starsAt?.['2:255'];
    expect(starredAt).toBeGreaterThan(0);
    toggleStar(2, 255);
    const off = getQuranState();
    expect(off.starred).toEqual([]);
    expect(off.starsRemoved?.[0]?.at).toBeGreaterThan(starredAt!);
    const theirs = { ...DEFAULT_QURAN_STATE, starred: ['2:255'] };
    expect(mergeQuran(off, theirs).starred).toEqual([]);
    toggleStar(2, 255);
    const on = getQuranState();
    expect(on.starred).toEqual(['2:255']);
    expect(mergeQuran(on, off).starred).toEqual(['2:255']);
  });
});

describe('the shape holds as the book is read', () => {
  beforeEach(() => {
    __resetQuranStateForTests();
    startKhatmah(30);
  });

  it('a khatmah of page turns is one claim per page, and re-reading adds none', () => {
    // Reading is a dated claim, one per page turned — at its own time,
    // which is what lets it be ordered against a denial the other device
    // makes (2026-09-22). Bounded by the pages of the book, not by the
    // turns: flipping back through credited ground adds nothing, and the
    // cap (a backstop) is well above a whole book plus its denials.
    for (let p = 1; p < 300; p++) recordKhatmahPageTurn(p, p + 1);
    const afterReading = activeKhatmah(getQuranState())!;
    expect(afterReading.marks!.length).toBe(299);
    for (let p = 1; p < 300; p++) recordKhatmahPageTurn(p, p + 1);
    expect(activeKhatmah(getQuranState())!.marks).toBe(afterReading.marks);

    // Un-mark three scattered pages; each is its own dated denial.
    for (const page of [12, 140, 260]) toggleKhatmahPageDone(page);
    const marks = activeKhatmah(getQuranState())!.marks!;
    expect(marks.filter(m => m[3] === 0)).toHaveLength(3);

    // Read on past them all; the denials stay denied, because nothing
    // this device did afterwards claimed those pages.
    for (let p = 300; p < 400; p++) recordKhatmahPageTurn(p, p + 1);
    const later = activeKhatmah(getQuranState())!;
    for (const page of [12, 140, 260]) {
      expect(isKhatmahPageDone(later, page)).toBe(false);
    }
    // Each denial replaced the read it cut, page for page.
    expect(later.marks!.length).toBe(299 + 100);
  });

  it('and every writer that moves the pin leaves a date on it', () => {
    // Six places set `position`, and one that forgot would put the bug
    // straight back — silently, because the merge would simply see an
    // older stamp. Source-pinned: the value only ever comes from `pinned`.
    const src = readFileSync(
      join(__dirname, '..', 'src', 'quran', 'quranState.ts'),
      'utf8',
    );
    const body = src.slice(src.indexOf('function pinned('));
    const afterHelper = body.slice(body.indexOf('\n}\n'));
    expect(afterHelper).not.toMatch(/\n\s+position:/);
    expect(src.match(/\.\.\.pinned\(/g)?.length).toBeGreaterThanOrEqual(6);
  });
});
