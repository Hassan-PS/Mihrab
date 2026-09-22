/**
 * TWO DEVICES, ONE KHATMAH — the phone reads, the other device is idle
 * and stale, and syncing must never move the phone backwards.
 *
 * Reported 2026-09-22: "progress on my phone is reset on sync to whatever
 * outdated point is on the other device". The other device's record, read
 * off it: the plan back at the ayah a "continue from here" pin had been
 * set on the evening before, its log holding the pin's two claims and
 * nothing the phone had read since — twenty pages, gone on both devices
 * after every round. Walked through here with the shipping writers and
 * the shipping merge; the cause and the rule are in `compactMarks`.
 */
import {
  __resetQuranStateForTests,
  activeKhatmah,
  getQuranState,
  khatmahCurrentPage,
  khatmahDay,
  khatmahReachAyah,
  khatmahFinishTarget,
  finishKhatmahPortion,
  primeQuranState,
  recordKhatmahPageTurn,
  recordReading,
  setKhatmahPosition,
  startKhatmah,
  toggleKhatmahPageDone,
  isKhatmahPageDone,
  type QuranState,
} from '../src/quran/quranState';
import { ayahAtIndex } from '../src/quran/ayahIndex';
import { findPageForAyah } from '../src/quran/pages';
import { mergeQuran } from '../src/sync/merge';

const DAY = 24 * 60 * 60 * 1000;
const ymd = (at: number) => {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
};
/** What a peer holds: the snapshot as it was sealed, a copy by value. */
const snapshotOf = (s: QuranState): QuranState => JSON.parse(JSON.stringify(s));

/** Turn pages `from` … `to - 1`, half a minute apart, as a reader does. */
function readPages(from: number, to: number) {
  for (let p = from; p < to; p++) {
    jest.setSystemTime(Date.now() + 30_000);
    recordReading({ surah: 2, ayah: 1, page: p + 1, mode: 'mushaf' });
    recordKhatmahPageTurn(p, p + 1);
  }
}

/** The phone merges the peer's file and adopts the result — `applySnapshot`. */
function syncFrom(peer: QuranState): void {
  primeQuranState(mergeQuran(getQuranState(), peer));
}

describe('a stale device syncing with the phone', () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date(2026, 8, 17, 10, 0, 0).getTime(),
      doNotFake: ['performance'],
    });
    __resetQuranStateForTests();
  });
  afterEach(() => jest.useRealTimers());

  it('never moves the phone back, day after day', () => {
    startKhatmah(30, undefined, ymd(Date.now() + 54 * DAY));
    readPages(1, 6);
    const stale = snapshotOf(getQuranState());

    for (let day = 0; day < 4; day++) {
      jest.setSystemTime(Date.now() + DAY);
      const page = khatmahCurrentPage(activeKhatmah(getQuranState())!);
      readPages(page, page + 11);
      finishKhatmahPortion();
      const before = activeKhatmah(getQuranState())!;
      const was = {
        reach: khatmahReachAyah(before),
        page: khatmahCurrentPage(before),
        day: khatmahDay(before),
        target: khatmahFinishTarget(before),
      };

      syncFrom(stale);
      const after = activeKhatmah(getQuranState())!;
      expect(khatmahReachAyah(after)).toBe(was.reach);
      expect(khatmahCurrentPage(after)).toBe(was.page);
      expect(khatmahDay(after)).toEqual(was.day);
      expect(khatmahFinishTarget(after)).toEqual(was.target);

      // And the round trip: the stale device merges the phone's file,
      // writes its own, and the phone merges that.
      const theirs = mergeQuran(stale, snapshotOf(getQuranState()));
      syncFrom(theirs);
      const again = activeKhatmah(getQuranState())!;
      expect(khatmahReachAyah(again)).toBe(was.reach);
      expect(khatmahCurrentPage(again)).toBe(was.page);
    }
  });

  /**
   * The reported case. A pin says "read before here, unread after"; the
   * peer syncs and holds both claims; the phone reads on past the pin.
   */
  it('keeps what the phone read past a pin the peer still holds', () => {
    startKhatmah(60, undefined, ymd(Date.now() + 55 * DAY));
    for (let d = 0; d < 4; d++) {
      readPages(khatmahCurrentPage(activeKhatmah(getQuranState())!), 1 + 20 * (d + 1));
      jest.setSystemTime(Date.now() + DAY);
    }
    const at = ayahAtIndex(527);
    setKhatmahPosition(at.surah, at.ayah, findPageForAyah(at.surah, at.ayah, 'hafs'));
    const peer = snapshotOf(getQuranState());
    expect(activeKhatmah(peer)!.marks).toEqual([
      [1, 526, expect.any(Number), 1],
      [527, 6236, expect.any(Number), 0],
    ]);

    readPages(84, 105);
    const phone = activeKhatmah(getQuranState())!;
    const reach = khatmahReachAyah(phone);
    expect(reach).toBeGreaterThan(600);
    // The reading past the pin is its own dated claim, later than the
    // denial it beat — not folded into the pin's reading at the pin's
    // time. Three claims, and the denial at its full width.
    expect(phone.marks).toHaveLength(3);
    expect(phone.marks).toContainEqual([527, 6236, expect.any(Number), 0]);

    syncFrom(peer);
    expect(khatmahReachAyah(activeKhatmah(getQuranState())!)).toBe(reach);
    expect(khatmahCurrentPage(activeKhatmah(getQuranState())!)).toBe(105);

    // The peer's side of the same round, then back again — stable.
    const theirs = mergeQuran(peer, snapshotOf(getQuranState()));
    expect(khatmahReachAyah(activeKhatmah(theirs)!)).toBe(reach);
    syncFrom(theirs);
    expect(khatmahReachAyah(activeKhatmah(getQuranState())!)).toBe(reach);
    expect(activeKhatmah(getQuranState())!.marks).toHaveLength(3);
  });

  /**
   * The peer may still run the OLD compaction — a Mac a release behind —
   * and fold the phone's reading down to the pin's time on its side. Its
   * file then says the run was read at T; the phone's own claim at T+2
   * is still in the phone's log, and that is what keeps the pages.
   */
  it('outlives a peer that compacts the old way', () => {
    startKhatmah(60, undefined, ymd(Date.now() + 55 * DAY));
    readPages(1, 60);
    const at = ayahAtIndex(527);
    setKhatmahPosition(at.surah, at.ayah, findPageForAyah(at.surah, at.ayah, 'hafs'));
    const pinAt = activeKhatmah(getQuranState())!.marks![0][2];
    readPages(84, 105);
    const reach = khatmahReachAyah(activeKhatmah(getQuranState())!);

    // What the old compaction made of the phone's file on the peer.
    const oldWay = snapshotOf(getQuranState());
    oldWay.khatmah[0].marks = [
      [1, reach, pinAt, 1],
      [reach + 1, 6236, pinAt + 1, 0],
    ];
    syncFrom(oldWay);
    expect(khatmahReachAyah(activeKhatmah(getQuranState())!)).toBe(reach);
    readPages(105, 110);
    const further = khatmahReachAyah(activeKhatmah(getQuranState())!);
    expect(further).toBeGreaterThan(reach);
    syncFrom(oldWay);
    expect(khatmahReachAyah(activeKhatmah(getQuranState())!)).toBe(further);
  });

  it('keeps a page un-marked, read again, and read again through the peer\'s old denial', () => {
    startKhatmah(30);
    readPages(1, 41);
    toggleKhatmahPageDone(20); // un-mark page 20 by hand
    const peer = snapshotOf(getQuranState());
    expect(isKhatmahPageDone(activeKhatmah(peer)!, 20)).toBe(false);

    // Read page 20 again: the denial is consumed entirely on this device.
    jest.setSystemTime(Date.now() + 60_000);
    recordKhatmahPageTurn(20, 21);
    expect(isKhatmahPageDone(activeKhatmah(getQuranState())!, 20)).toBe(true);
    readPages(41, 50);

    // The peer still holds the denial; the re-read must outlive it.
    syncFrom(peer);
    expect(isKhatmahPageDone(activeKhatmah(getQuranState())!, 20)).toBe(true);
    const theirs = mergeQuran(peer, snapshotOf(getQuranState()));
    expect(isKhatmahPageDone(activeKhatmah(theirs)!, 20)).toBe(true);
    syncFrom(theirs);
    expect(isKhatmahPageDone(activeKhatmah(getQuranState())!, 20)).toBe(true);
  });
});
