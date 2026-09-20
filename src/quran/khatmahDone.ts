/**
 * WHICH of the book a khatmah has read, rather than HOW FAR it has got.
 *
 * Progress was a high-water mark: one number, the furthest point reached.
 * That shape can only move forward contiguously, and the cost is written
 * into `khatmahTracksPage` — "skip five pages on purpose and read on, and
 * the plan will count those five, because a high-water mark is the only
 * shape progress has here". It also cannot hold the opposite case: today's
 * portion read out of order, a few pages here and a few there, is real
 * reading that the number has nowhere to put.
 *
 * So progress is a SET of what has been read. A page read is a page done,
 * whatever brought the reader to it, and a page not read stays not done
 * however far past it they have been.
 *
 * ── IN AYAHS, NOT PAGES ───────────────────────────────────────────────
 *
 * A page is a fact about one printed muṣḥaf: page 300 of a Warsh print is
 * not page 300 of a Ḥafṣ one. `ayahsRead` is authoritative for exactly
 * that reason, and it is what lets a reader switch riwayah without losing
 * their place. The set keeps the same promise: it holds AYAH INDEXES
 * (1…6236, the `ayahIndex` ordering), and whether a PAGE is done is asked
 * of the riwayah on screen — every ayah of that page, in that print.
 *
 * ── AS RANGES ─────────────────────────────────────────────────────────
 *
 * Inclusive `[from, to]` pairs, sorted and disjoint, never touching (two
 * ranges that meet are one range). Reading is overwhelmingly contiguous,
 * so a whole khatmah is normally one pair and a patchy one is a handful —
 * cheaper than six thousand booleans in a blob that syncs, and readable
 * when someone opens the file.
 *
 * UNION IS THE MERGE. Two devices that each read part of the book have
 * both read those parts; `unionRanges` is commutative, associative and
 * idempotent, so merging is order-free and a snapshot merged with itself
 * is itself — the properties the whole sync cycle rests on.
 */

/** Inclusive, 1-based ayah indexes. */
export type AyahRange = readonly [number, number];

const clampIndex = (n: number, total: number) =>
  Math.max(1, Math.min(total, Math.trunc(n)));

/**
 * Sorted, disjoint, non-touching — the shape every function here both
 * expects and returns. Anything malformed is dropped rather than trusted:
 * a bad range in a synced blob would otherwise mark the book read.
 */
export function normalizeRanges(
  input: readonly AyahRange[],
  total: number,
): AyahRange[] {
  const clean: AyahRange[] = [];
  for (const r of input) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const [a, b] = r;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const from = clampIndex(a, total);
    const to = clampIndex(b, total);
    if (to < from) continue;
    clean.push([from, to]);
  }
  clean.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: AyahRange[] = [];
  for (const [from, to] of clean) {
    const last = out[out.length - 1];
    // `from <= last[1] + 1` merges touching ranges too: [1,10] and [11,20]
    // are one reading, and leaving them apart would make two snapshots of
    // the same progress compare unequal.
    if (last && from <= last[1] + 1) {
      if (to > last[1]) out[out.length - 1] = [last[0], to];
    } else {
      out.push([from, to]);
    }
  }
  return out;
}

export function unionRanges(
  a: readonly AyahRange[],
  b: readonly AyahRange[],
  total: number,
): AyahRange[] {
  return normalizeRanges([...a, ...b], total);
}

export function addRange(
  ranges: readonly AyahRange[],
  from: number,
  to: number,
  total: number,
): AyahRange[] {
  return normalizeRanges([...ranges, [from, to]], total);
}

/**
 * Take a reading back out — a page marked done by hand and then unmarked.
 *
 * A range removed from the middle of a run splits it in two, which is the
 * whole reason the set can express this at all: a high-water mark could
 * only ever be wound back to a point, taking everything after it with it.
 */
export function subtractRange(
  ranges: readonly AyahRange[],
  from: number,
  to: number,
  total: number,
): AyahRange[] {
  if (to < from) return normalizeRanges(ranges, total);
  const out: AyahRange[] = [];
  for (const [f, t] of ranges) {
    if (t < from || f > to) {
      out.push([f, t]);
      continue;
    }
    if (f < from) out.push([f, from - 1]);
    if (t > to) out.push([to + 1, t]);
  }
  return normalizeRanges(out, total);
}

/**
 * Same coverage, range for range. Every operation here builds a new
 * array, so identity says nothing — and a writer that compared by
 * identity would persist and re-render on every page turn that changed
 * nothing, which is most of them.
 */
export function rangesEqual(
  a: readonly AyahRange[],
  b: readonly AyahRange[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

/** How many ayahs the set holds. */
export function countRanges(ranges: readonly AyahRange[]): number {
  let n = 0;
  for (const [from, to] of ranges) n += to - from + 1;
  return n;
}

export function rangesContain(
  ranges: readonly AyahRange[],
  index: number,
): boolean {
  for (const [from, to] of ranges) {
    if (index < from) return false; // sorted: nothing further can hold it
    if (index <= to) return true;
  }
  return false;
}

/** Is every ayah of `[from, to]` done? */
export function rangesCover(
  ranges: readonly AyahRange[],
  from: number,
  to: number,
): boolean {
  let at = from;
  for (const [f, t] of ranges) {
    if (f > at) return false;
    if (t >= at) at = t + 1;
    if (at > to) return true;
  }
  return at > to;
}

/** How many of `[from, to]` are done — today's portion, in ayahs. */
export function countWithin(
  ranges: readonly AyahRange[],
  from: number,
  to: number,
): number {
  let n = 0;
  for (const [f, t] of ranges) {
    if (f > to) break;
    const lo = Math.max(f, from);
    const hi = Math.min(t, to);
    if (hi >= lo) n += hi - lo + 1;
  }
  return n;
}

/**
 * A DATED CLAIM ABOUT A STRETCH OF AYAHS — `[from, to, at, read]`.
 *
 * ── WHY THE SET ALONE CANNOT CARRY AN UN-MARK ─────────────────────────
 *
 * `done` is merged by UNION, which is what makes two devices reading
 * different parts keep both. A union only grows, so it cannot express
 * "this page is NOT read": un-mark page 11 here, and the other device's
 * set still covers it, and the next merge puts it straight back. This
 * repo has diagnosed that shape three times now — `removedPeers` ("a
 * button that undid itself within two minutes"), `coerceSunnahLog`, and
 * the khatmah's own `abandonedAt` — and the answer has been the same
 * every time: an absence loses, so send a dated fact instead.
 *
 * So every claim a reader makes BY HAND is logged with the time they
 * made it, and reading that crosses one logs a claim of its own. The
 * marks are unioned like everything else and then replayed over the
 * union in time order, so the last thing the reader actually said about
 * a page is what the page says — whichever device they said it on.
 *
 * PAGE TURNS LOG TOO, since 2026-09-20 — they used to not, on the
 * reasoning that the union already carries them. It does, but undated:
 * the union says WHETHER a page was read and never WHEN, so a claim from
 * the other device always sounded newer than reading that in fact came
 * after it. Un-mark a stretch on the phone on Monday, read it on the Mac
 * on Tuesday, sync: Monday's denial replayed over Tuesday's reading and
 * the progress fell back to the first gap — every round, until the claim
 * aged out. That is the "khatmah dragged back to its old point" report,
 * and dating the reading is what orders the two against each other.
 *
 * The log stays small because it is COMPACTED rather than appended to
 * for ever: see `compactMarks`.
 */
export type AyahMark = readonly [
  from: number,
  to: number,
  at: number,
  read: 0 | 1,
];

const markKey = (m: AyahMark) => `${m[0]}:${m[1]}:${m[2]}:${m[3]}`;

/** Both devices' claims, each kept once, oldest first. */
export function mergeMarks(
  a: readonly AyahMark[] = [],
  b: readonly AyahMark[] = [],
): AyahMark[] {
  const byKey = new Map<string, AyahMark>();
  for (const m of [...a, ...b]) byKey.set(markKey(m), m);
  return [...byKey.values()].sort((x, y) => x[2] - y[2] || x[0] - y[0]);
}

/**
 * Replay claims over a set, oldest first.
 *
 * Idempotent on purpose: `addRange` and `subtractRange` both are, so
 * replaying marks that are already reflected in the set changes nothing.
 * That is what lets the local copy stay resolved and the merge replay the
 * whole log again without a special case.
 */
export function applyMarks(
  base: readonly AyahRange[],
  marks: readonly AyahMark[],
  total: number,
): AyahRange[] {
  let out = normalizeRanges(base, total);
  for (const [from, to, , read] of marks) {
    out = read === 1
      ? addRange(out, from, to, total)
      : subtractRange(out, from, to, total);
  }
  return out;
}

/**
 * THE CLAIM LOG, RESOLVED — the same answer in as few claims as possible.
 *
 * Dating page turns would otherwise mean a claim per turn, and a log that
 * grows by twenty entries a day both fills the sealed file and pushes the
 * un-marks — the claims that actually need to survive — off the end of
 * the cap. So the log is resolved instead of trimmed: later claims cut
 * earlier ones out of the regions they cover, which leaves one dated
 * interval per stretch the reader has actually spoken about differently.
 * A khatmah read front to back with one page un-marked in it compacts to
 * three claims and stays there.
 *
 * TWO RULES MAKE IT SAFE:
 *
 *   • Coverage never changes. Every ayah some claim spoke about is still
 *     spoken about afterwards, with the same verdict — so replaying the
 *     compacted log over any set gives what the full log gave.
 *
 *   • Neighbours that agree are joined at the EARLIER time, never the
 *     later one. Joining at the later time would let a page turn made
 *     today re-assert "read" over ground claimed days ago, and quietly
 *     undo an un-mark another device made in between — the bug this file
 *     exists to prevent, arriving through the compaction instead. The
 *     earlier time can only ever lose to a claim it truly predates.
 *
 *   • …and only READING is joined that way. An un-mark is the claim that
 *     cannot be re-made by carrying on reading, so weakening its date by
 *     a neighbour's is exactly the failure this whole mechanism exists to
 *     stop: un-mark one page on Monday and the next on Wednesday, and a
 *     join at Monday's time hands Tuesday's reading on the other device
 *     the second page back. Denials keep their own dates unless two of
 *     them were made in the same breath, and there are never many —
 *     un-marking is a thing a reader does by hand.
 */
export function compactMarks(
  marks: readonly AyahMark[],
  total: number,
): AyahMark[] {
  // Oldest first, so a later claim can cut the ones under it.
  const ordered = [...marks].sort((x, y) => x[2] - y[2] || x[0] - y[0]);
  let resolved: AyahMark[] = [];
  for (const m of ordered) {
    const [from, to] = m;
    if (to < from) continue;
    const next: AyahMark[] = [];
    for (const held of resolved) {
      // The parts of an older claim this one does not cover survive, as
      // their own intervals, still carrying their own date.
      if (held[0] < from) next.push([held[0], Math.min(held[1], from - 1), held[2], held[3]]);
      if (held[1] > to) next.push([Math.max(held[0], to + 1), held[1], held[2], held[3]]);
    }
    next.push([Math.max(0, from), Math.min(total, to), m[2], m[3]]);
    resolved = next;
  }
  resolved.sort((x, y) => x[0] - y[0] || x[2] - y[2]);
  const joined: AyahMark[] = [];
  for (const m of resolved) {
    const last = joined[joined.length - 1];
    const touching = last && last[3] === m[3] && m[0] <= last[1] + 1;
    const mayJoin = touching && (m[3] === 1 || last[2] === m[2]);
    if (last && mayJoin) {
      joined[joined.length - 1] = [
        last[0],
        Math.max(last[1], m[1]),
        Math.min(last[2], m[2]),
        m[3],
      ];
      continue;
    }
    joined.push(m);
  }
  return joined.sort((x, y) => x[2] - y[2] || x[0] - y[0]);
}


/**
 * The furthest ayah covered — how far the reader has actually got,
 * whatever they left behind them. `contiguousFrom` answers the other
 * question, and a plan needs both: one is progress, this is reach.
 */
export function highestCovered(ranges: readonly AyahRange[]): number {
  return ranges.length > 0 ? ranges[ranges.length - 1][1] : 0;
}

/**
 * The first ayah at or after `from` that is NOT done — where the reader
 * is asked to carry on. `total + 1` when everything from there is read.
 */
export function firstMissingFrom(
  ranges: readonly AyahRange[],
  from: number,
  total: number,
): number {
  let at = Math.max(1, from);
  for (const [f, t] of ranges) {
    if (f > at) return at;
    if (t >= at) at = t + 1;
    if (at > total) return total + 1;
  }
  return at;
}

/**
 * The contiguous run from `from` — what the legacy high-water fields are
 * written from, so a device still reading `ayahsRead` sees exactly what
 * it saw before: progress up to the first gap.
 */
export function contiguousFrom(
  ranges: readonly AyahRange[],
  from: number,
  total: number,
): number {
  return firstMissingFrom(ranges, from, total) - 1;
}
