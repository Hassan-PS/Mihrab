/**
 * THE ALGEBRA, FUZZED — not fixtures, ten thousand random disagreements.
 *
 * The rules in `merge.ts` are only worth anything if they hold for pairs
 * nobody thought of. Dated removals and dated reading (2026-09-20) added
 * ordering to fields that used to be a plain union, which is exactly the
 * kind of change that passes every example someone writes by hand and
 * fails on the shape they did not imagine.
 *
 * So the properties are checked against generated states:
 *
 *   COMMUTATIVE  merge(a,b) == merge(b,a) in everything that travels
 *   IDEMPOTENT   merge(a,a) == a
 *   ASSOCIATIVE  merge(merge(a,b),c) == merge(a,merge(b,c))
 *   CONVERGENT   three devices gossiping in any order end up equal
 *
 * …and, for the khatmah's pages, against an independent MODEL of what the
 * answer should be: per ayah, the latest dated claim about it, and failing
 * that, whether either side's set covered it. The model is written the
 * obvious slow way on purpose — if the two ever disagree, one of them is
 * the bug and it is not the one with no clever parts in it.
 */
import { mergeKhatmah, mergeQuran } from '../src/sync/merge';
import {
  applyMarks,
  compactMarks,
  contiguousFrom,
  normalizeRanges,
  type AyahMark,
} from '../src/quran/khatmahDone';
import {
  coerceQuranState,
  DEFAULT_QURAN_STATE,
  mergeRemovals,
  pagesThroughAyahs,
  type KhatmahPlan,
  type QuranBookmark,
  type QuranState,
} from '../src/quran/quranState';

/**
 * CANONICAL, the way a stored one is.
 *
 * Every writer goes through `settled` and every read through
 * `coerceQuranState`, so a plan on disk always has its claims resolved,
 * its set normalized and its legacy mirror taken from the contiguous run
 * of that set. A generator that skips this invents states no device can
 * hold, and then "merge(a,a) == a" fails on the invention rather than on
 * the merge — which is what it did the first time this file ran.
 */
function canonical(plan: KhatmahPlan): KhatmahPlan {
  const marks = plan.marks ? compactMarks(plan.marks, AYAHS) : undefined;
  const base = normalizeRanges(plan.done ?? [], AYAHS);
  const done = marks?.length ? applyMarks(base, marks, AYAHS) : base;
  const contiguous = Math.max(0, contiguousFrom(done, 0, AYAHS));
  return {
    ...plan,
    ...(plan.done ? { done } : {}),
    ...(marks?.length ? { marks } : {}),
    ...(plan.done ? { ayahsRead: contiguous, pagesRead: pagesThroughAyahs(contiguous) } : {}),
  };
}

/** Deterministic, so a failure can be re-run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const NOW = Date.now();
const AYAHS = 60;

function randomPlan(r: () => number): KhatmahPlan {
  const ranges: [number, number][] = [];
  for (let i = 1; i <= AYAHS; i += 1 + Math.floor(r() * 8)) {
    if (r() < 0.6) {
      const to = Math.min(AYAHS, i + Math.floor(r() * 10));
      ranges.push([i, to]);
      i = to;
    }
  }
  const marks: AyahMark[] = [];
  const claims = Math.floor(r() * 4);
  for (let i = 0; i < claims; i++) {
    const from = 1 + Math.floor(r() * AYAHS);
    const to = Math.min(AYAHS, from + Math.floor(r() * 12));
    marks.push([from, to, NOW - Math.floor(r() * 10_000), r() < 0.5 ? 0 : 1]);
  }
  const pinned = r() < 0.5;
  return {
    id: 'k1',
    startedAt: 1_000,
    targetDays: 30,
    pagesRead: 0,
    completedAt: null,
    ...(ranges.length > 0 ? { done: ranges } : {}),
    ...(marks.length > 0 ? { marks } : {}),
    ayahsRead: 0,
    ...(r() < 0.8
      ? {
          position: pinned
            ? { surah: 1, ayah: 1 + Math.floor(r() * 7), page: 1 + Math.floor(r() * 600) }
            : null,
          positionAt: NOW - Math.floor(r() * 10_000),
        }
      : {}),
  };
}

/** The slow, obvious answer: per ayah, the last dated word, else the union. */
function modelDone(a: KhatmahPlan, b: KhatmahPlan): number[] {
  const covers = (p: KhatmahPlan, ayah: number) =>
    (p.done ?? []).some(([from, to]) => ayah >= from && ayah <= to);
  const out: number[] = [];
  for (let ayah = 1; ayah <= AYAHS; ayah++) {
    let verdict: 0 | 1 | null = null;
    let at = -1;
    for (const [from, to, when, read] of [...(a.marks ?? []), ...(b.marks ?? [])]) {
      if (ayah < from || ayah > to) continue;
      if (when > at) {
        at = when;
        verdict = read;
      }
    }
    const read = verdict !== null ? verdict === 1 : covers(a, ayah) || covers(b, ayah);
    if (read) out.push(ayah);
  }
  return out;
}

function doneAyahs(plan: KhatmahPlan): number[] {
  const out: number[] = [];
  for (const [from, to] of plan.done ?? []) {
    for (let i = Math.max(1, from); i <= Math.min(AYAHS, to); i++) out.push(i);
  }
  return [...new Set(out)].sort((x, y) => x - y);
}

/** What has to match between the two orders — the day baseline is local. */
function travelling(plan: KhatmahPlan): Record<string, unknown> {
  const rest = { ...plan } as Record<string, unknown>;
  delete rest.dayStartDate;
  delete rest.dayStartPagesRead;
  delete rest.dayStartAyahsRead;
  return rest;
}

describe('the khatmah merge, on a thousand disagreements it has not seen', () => {
  const plans = Array.from({ length: 1_000 }, (_, i) => {
    const r = rng(i + 1);
    return [
      canonical(randomPlan(r)),
      canonical(randomPlan(r)),
      canonical(randomPlan(r)),
    ] as const;
  });

  it('says the same thing whichever device asks', () => {
    for (const [a, b] of plans) {
      expect(travelling(mergeKhatmah([a], [b])[0])).toEqual(
        travelling(mergeKhatmah([b], [a])[0]),
      );
    }
  });

  it('merging a plan with itself returns it', () => {
    for (const [a, b, c] of plans) {
      for (const p of [a, b, c]) expect(mergeKhatmah([p], [p])[0]).toEqual(p);
    }
  });

  it('does not care how the three of them paired up', () => {
    for (const [a, b, c] of plans) {
      const left = mergeKhatmah(mergeKhatmah([a], [b]), [c])[0];
      const right = mergeKhatmah([a], mergeKhatmah([b], [c]))[0];
      expect(doneAyahs(left)).toEqual(doneAyahs(right));
      expect(left.position ?? null).toEqual(right.position ?? null);
    }
  });

  it('and the pages it keeps are the ones the model keeps', () => {
    for (const [a, b] of plans) {
      expect(doneAyahs(mergeKhatmah([a], [b])[0])).toEqual(modelDone(a, b));
    }
  });

  it('the newest word about the pin is the one that holds', () => {
    for (const [a, b] of plans) {
      const merged = mergeKhatmah([a], [b])[0];
      const dated = [a, b].filter(p => (p.positionAt ?? 0) > 0);
      if (dated.length !== 2) continue;
      const [newest, oldest] =
        (a.positionAt ?? 0) >= (b.positionAt ?? 0) ? [a, b] : [b, a];
      if ((newest.positionAt ?? 0) === (oldest.positionAt ?? 0)) continue;
      expect(merged.position ?? null).toEqual(newest.position ?? null);
    }
  });
});

const bookmark = (id: string, at: number): QuranBookmark => ({
  id,
  surah: 2,
  ayah: 255,
  page: 42,
  color: 'emerald',
  createdAt: at,
});

function randomQuran(r: () => number): QuranState {
  const ids = ['b1', 'b2', 'b3'];
  const keys = ['1:1', '2:255', '3:7'];
  // In creation order, which is how the store holds them: `addBookmark`
  // appends and the merge sorts by `createdAt`.
  const bookmarks = ids
    .filter(() => r() < 0.6)
    .map(id => bookmark(id, NOW - Math.floor(r() * 100_000)))
    .sort((x, y) => x.createdAt - y.createdAt);
  const removed = ids
    .filter(() => r() < 0.4)
    .map(id => ({ id, at: NOW - Math.floor(r() * 100_000) }));
  const starred = keys.filter(() => r() < 0.6);
  const starsAt: Record<string, number> = {};
  // Only for stars that are actually on: `coerceQuranState` prunes the
  // rest, so a stamp without its star is not a state any device holds.
  for (const k of starred) starsAt[k] = NOW - Math.floor(r() * 100_000);
  const starsRemoved = keys
    .filter(() => r() < 0.4)
    .map(id => ({ id, at: NOW - Math.floor(r() * 100_000) }));
  const liveStars = starred.filter(
    k => !starsRemoved.some(x => x.id === k && x.at >= (starsAt[k] ?? 0)),
  );
  for (const k of Object.keys(starsAt)) {
    if (!liveStars.includes(k)) delete starsAt[k];
  }
  return {
    ...DEFAULT_QURAN_STATE,
    bookmarks: bookmarks.filter(
      b => !removed.some(x => x.id === b.id && x.at >= b.createdAt),
    ),
    starred: liveStars,
    // `coerceRemovals` folds every stored list through `mergeRemovals`,
    // so a list on disk is deduped, pruned and in one canonical order.
    ...(removed.length > 0 ? { bookmarksRemoved: mergeRemovals(removed, []) } : {}),
    ...(starsRemoved.length > 0 ? { starsRemoved: mergeRemovals(starsRemoved, []) } : {}),
    ...(Object.keys(starsAt).length > 0 ? { starsAt } : {}),
  };
}

describe('bookmarks and stars, on a thousand more', () => {
  const states = Array.from({ length: 1_000 }, (_, i) => {
    const r = rng(10_000 + i);
    return [randomQuran(r), randomQuran(r), randomQuran(r)] as const;
  });

  it('says the same thing whichever device asks', () => {
    for (const [a, b] of states) {
      expect(mergeQuran(a, b)).toEqual(mergeQuran(b, a));
    }
  });

  it('merging a state with itself returns it', () => {
    for (const [a, b, c] of states) {
      for (const s of [a, b, c]) expect(mergeQuran(s, s)).toEqual(s);
    }
  });

  it('does not care how the three of them paired up', () => {
    for (const [a, b, c] of states) {
      expect(mergeQuran(mergeQuran(a, b), c)).toEqual(
        mergeQuran(a, mergeQuran(b, c)),
      );
    }
  });

  it('survives the trip through storage unchanged', () => {
    // The merge is only half the path: every one of these states is
    // written as JSON and read back through `coerceQuranState`, on this
    // device and on the one it syncs with. A field the coercion drops —
    // a stamp, a removal list — is a removal that stops travelling, and
    // nothing above would notice.
    for (const [a, b, c] of states) {
      for (const s of [a, b, c]) {
        expect(coerceQuranState(JSON.parse(JSON.stringify(s)))).toEqual(s);
      }
    }
  });

  it('never hands back something a newer removal buried', () => {
    for (const [a, b] of states) {
      const merged = mergeQuran(a, b);
      for (const bm of merged.bookmarks) {
        const removal = merged.bookmarksRemoved?.find(x => x.id === bm.id);
        if (removal) expect(removal.at).toBeLessThan(bm.updatedAt ?? bm.createdAt);
      }
      for (const key of merged.starred) {
        const removal = merged.starsRemoved?.find(x => x.id === key);
        if (removal) expect(removal.at).toBeLessThan(merged.starsAt?.[key] ?? 0);
      }
    }
  });
});
