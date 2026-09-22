/**
 * TWO DEVICES, RANDOM DAYS — the khatmah under sync, fuzzed.
 *
 * Every step one device does one thing a reader does (turns pages,
 * finishes the day, pins a place, un-marks a page, resets today, or
 * just waits), and every few steps the two sync — each merging the
 * other's file and adopting the result, as `applySnapshot` does. After
 * every round the two must agree, a device must never lose reading to a
 * peer that did nothing to that reading, and what they agree on must be
 * what the reader actually said, latest word per ayah.
 */
import {
  __resetQuranStateForTests,
  activeKhatmah,
  ayahsThroughPage,
  finishKhatmahPortion,
  getQuranState,
  isKhatmahPageDone,
  khatmahCreditWindow,
  khatmahCurrentPage,
  khatmahDone,
  khatmahFinishTarget,
  khatmahPaceToday,
  khatmahReachAyah,
  khatmahStartAyah,
  khatmahTracksPage,
  primeQuranState,
  recordKhatmahPageTurn,
  resetKhatmahToday,
  setKhatmahPosition,
  startKhatmah,
  toggleKhatmahPageDone,
  KHATMAH_TOTAL_AYAHS as TOTAL,
  type QuranState,
} from '../src/quran/quranState';
import { ayahAtIndex, ayahIndexOf } from '../src/quran/ayahIndex';
import { findPageForAyah, firstAyahOfPage } from '../src/quran/pages';
import { applyMarks, lastReadAt, normalizeRanges, rangesCover, type AyahRange } from '../src/quran/khatmahDone';
import { mergeQuran } from '../src/sync/merge';

const DAY = 24 * 60 * 60 * 1000;
const ymd = (at: number) => {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
};
const clone = (s: QuranState): QuranState => JSON.parse(JSON.stringify(s));

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Claim = { from: number; to: number; at: number; read: boolean };

/** Latest dated word per ayah, with undated fills beneath. */
function oracle(claims: Claim[], fills: AyahRange[], start: number): AyahRange[] {
  const verdict = new Int8Array(TOTAL + 1); // 0 unspoken, 1 read, -1 unread
  const when = new Float64Array(TOTAL + 1);
  for (const c of claims) {
    for (let i = Math.max(start, c.from); i <= Math.min(TOTAL, c.to); i++) {
      if (c.at >= when[i]) {
        when[i] = c.at;
        verdict[i] = c.read ? 1 : -1;
      }
    }
  }
  for (const [f, t] of fills) {
    for (let i = Math.max(start, f); i <= Math.min(TOTAL, t); i++) {
      if (verdict[i] === 0) verdict[i] = 1;
    }
  }
  const out: [number, number][] = [];
  for (let i = 1; i <= TOTAL; i++) {
    if (verdict[i] !== 1) continue;
    const last = out[out.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else out.push([i, i]);
  }
  return normalizeRanges(out, TOTAL);
}

function run(seed: number, withBackwardOps: boolean, steps: number, dated = true, days = 40): void {
  const random = rng(seed);
  const pick = (n: number) => Math.floor(random() * n);
  jest.useFakeTimers({ now: new Date(2026, 8, 1, 10, 0, 0).getTime(), doNotFake: ['performance'] });
  __resetQuranStateForTests();
  if (dated) startKhatmah(30, undefined, ymd(Date.now() + (days - 1) * DAY));
  else startKhatmah(days);
  const devices: QuranState[] = [clone(getQuranState()), clone(getQuranState())];
  const claims: Claim[] = [];
  const fills: [number, number][] = [];
  let lastClaimAt = 0;
  const stamp = () => {
    // Claims are stamped one past the newest, like `withMarks`.
    lastClaimAt = Math.max(Date.now(), lastClaimAt + 1);
    return lastClaimAt;
  };
  const start = khatmahStartAyah(activeKhatmah(devices[0])!);

  const pickUp = (d: number) => primeQuranState(devices[d]);
  const keep = (d: number) => {
    devices[d] = clone(getQuranState());
  };
  const plan = () => activeKhatmah(getQuranState())!;
  /** The one plan, live or finished. */
  const theOne = (s: QuranState) => s.khatmah[0];

  const sync = (x: number, y: number) => {
    pickUp(x);
    const reachBefore = khatmahReachAyah(theOne(getQuranState()));
    primeQuranState(mergeQuran(getQuranState(), devices[y]));
    keep(x);
    if (!withBackwardOps) {
      // Nothing the peer did could honestly move this device back.
      expect(khatmahReachAyah(theOne(getQuranState()))).toBeGreaterThanOrEqual(reachBefore);
    }
  };

  for (let step = 0; step < steps; step++) {
    const d = pick(2);
    pickUp(d);
    if (!activeKhatmah(getQuranState())) {
      // Read to the end: the book is finished, and both must know it.
      sync(0, 1);
      sync(1, 0);
      expect(theOne(devices[0]).completedAt).not.toBeNull();
      expect(theOne(devices[1]).completedAt).not.toBeNull();
      expect(khatmahDone(theOne(devices[0]))).toEqual(khatmahDone(theOne(devices[1])));
      break;
    }
    jest.setSystemTime(Date.now() + 1_000 + pick(6 * 60 * 60 * 1000));
    // A pin is the reader's word about where they are, and it can stand
    // BEHIND reading another device credited earlier — so it is a
    // backward op too, however far ahead of this device it lands.
    const op = withBackwardOps ? pick(7) : [0, 1, 2, 4][pick(4)];
    if (op <= 1) {
      // Turn a few pages from where the plan says to continue.
      let page = khatmahCurrentPage(plan());
      for (let n = pick(4) + 1; n > 0 && page < 604; n--) {
        if (!khatmahTracksPage(page)) break;
        const window = khatmahCreditWindow(plan());
        const first = firstAyahOfPage(page, 'hafs');
        const from = Math.max(start, window[0], ayahIndexOf(first.surah, first.ayah));
        const to = Math.min(ayahsThroughPage(page, 'hafs'), window[1]);
        // Flipping through ground the log already says is read is not
        // a fresh reading of it (`withMarks`); the oracle agrees.
        const said = applyMarks([], plan().marks ?? [], TOTAL);
        const fresh = to >= from && !rangesCover(said, from, to);
        jest.setSystemTime(Date.now() + 20_000);
        recordKhatmahPageTurn(page, page + 1);
        if (fresh) claims.push({ from, to, at: stamp(), read: true });
        page += 1;
        if (!activeKhatmah(getQuranState())) break; // finished the book
      }
    } else if (op === 2) {
      const target = khatmahFinishTarget(plan());
      const wasDone = khatmahDone(plan());
      finishKhatmahPortion();
      const p = theOne(getQuranState()); // may have just completed
      if (JSON.stringify(khatmahDone(p)) !== JSON.stringify(wasDone)) {
        claims.push({ from: target.from, to: target.to, at: stamp(), read: true });
        fills.push([start, target.to]);
      }
    } else if (op === 3) {
      // Pin a little ahead of the reach — "I am here".
      const reach = khatmahReachAyah(plan());
      const at = Math.min(TOTAL, reach + 1 + pick(40));
      const a = ayahAtIndex(at);
      setKhatmahPosition(a.surah, a.ayah, findPageForAyah(a.surah, a.ayah, 'hafs'));
      const t = stamp();
      claims.push({ from: start, to: at - 1, at: t, read: true });
      claims.push({ from: at, to: TOTAL, at: stamp(), read: false });
      fills.push([start, at - 1]);
    } else if (op === 4) {
      jest.setSystemTime(Date.now() + pick(2) * DAY);
    } else if (op === 5) {
      // Un-mark a done page behind the reader, by hand.
      const p = plan();
      const reachPage = findPageForAyah(ayahAtIndex(Math.max(1, khatmahReachAyah(p))).surah, ayahAtIndex(Math.max(1, khatmahReachAyah(p))).ayah, 'hafs');
      const page = 1 + pick(Math.max(1, reachPage));
      if (isKhatmahPageDone(p, page) && khatmahTracksPage(page)) {
        const first = firstAyahOfPage(page, 'hafs');
        const from = Math.max(start, ayahIndexOf(first.surah, first.ayah));
        const to = ayahsThroughPage(page, 'hafs');
        toggleKhatmahPageDone(page);
        claims.push({ from, to, at: stamp(), read: false });
      }
    } else {
      // Rewind today (rare, and only when there is something to rewind).
      const p = plan();
      const base = p.dayStartDate === ymd(Date.now()) ? (p.dayStartAyahsRead ?? 0) : khatmahReachAyah(p);
      if (base < khatmahReachAyah(p) && random() < 0.3) {
        resetKhatmahToday();
        claims.push({ from: base + 1, to: TOTAL, at: stamp(), read: false });
      }
    }
    keep(d);

    if (step % 5 === 4) {
      sync(0, 1);
      sync(1, 0);
      // Converged: both hold the same reading.
      const a = theOne(devices[0]);
      const b = theOne(devices[1]);
      expect(khatmahDone(a)).toEqual(khatmahDone(b));
      expect(a.marks ?? []).toEqual(b.marks ?? []);
      expect(khatmahReachAyah(a)).toBe(khatmahReachAyah(b));
      expect(khatmahCurrentPage(a)).toBe(khatmahCurrentPage(b));
      // And it is what the reader said, latest word per ayah.
      expect(khatmahDone(a)).toEqual(oracle(claims, fills, start));
      // The day's cut and the pill's target are shared state and agree.
      expect(a.pace).toEqual(b.pace);
      // And today's cut, on each device, was cut from the reading's real
      // frontier: whatever was read past it was read AFTER it was cut. A
      // stale peer's cut — made from a reach the plan had left days ago —
      // must not become "today" anywhere.
      for (const p of [a, b]) {
        const cut = khatmahPaceToday(p);
        const reach = khatmahReachAyah(p);
        if (cut && cut.to < reach && cut.at !== undefined) {
          const readAt = lastReadAt(p.marks, reach);
          if (readAt !== undefined) expect(readAt).toBeGreaterThan(cut.at);
        }
      }
      expect(khatmahFinishTarget(a)).toEqual(khatmahFinishTarget(b));
      // The log is one claim per page plus the denials — never a runaway.
      expect((a.marks ?? []).length).toBeLessThanOrEqual(604 + 64);
      // A file merged with itself is itself.
      pickUp(0);
      primeQuranState(mergeQuran(getQuranState(), devices[0]));
      expect(theOne(getQuranState())).toEqual(a);
    }
  }
  jest.useRealTimers();
}

describe('two devices, random days, a plan paced to a date', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('forward reading only, seed %i', seed => {
    run(seed, false, 160);
  });
  it.each([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22])(
    'with un-marks, rewinds and pins, seed %i',
    seed => {
      run(seed, true, 160);
    },
  );
});

describe('two devices, random days, a date that comes and goes', () => {
  // Twelve days: the run goes on past the date, and the plan must keep
  // its footing there too — nothing crashes, the two still agree.
  it.each([51, 52, 53, 54])('with un-marks, rewinds and pins, seed %i', seed => {
    run(seed, true, 200, true, 12);
  });
});

describe('two devices, random days, a plan of a number of days', () => {
  it.each([31, 32, 33, 34])('forward reading only, seed %i', seed => {
    run(seed, false, 160, false);
  });
  it.each([41, 42, 43, 44, 45, 46])('with un-marks, rewinds and pins, seed %i', seed => {
    run(seed, true, 160, false);
  });
});
