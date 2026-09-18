/**
 * The set of what a khatmah has read — issue #54 follow-on.
 *
 * A high-water mark could only say how far; these say which. The
 * properties that matter are the sync ones: union is order-free and
 * idempotent, so two devices that read different parts of the book agree
 * without either losing anything.
 */
import {
  addRange,
  contiguousFrom,
  countRanges,
  countWithin,
  firstMissingFrom,
  normalizeRanges,
  rangesContain,
  rangesCover,
  subtractRange,
  unionRanges,
  type AyahRange,
} from '../src/quran/khatmahDone';

const TOTAL = 6236;
const n = (r: AyahRange[]) => normalizeRanges(r, TOTAL);

describe('the shape is always sorted, disjoint and joined up', () => {
  it('sorts and merges overlaps', () => {
    expect(n([[10, 20], [1, 5], [15, 30]])).toEqual([[1, 5], [10, 30]]);
  });

  it('joins ranges that merely touch — one reading, not two', () => {
    // Left apart, two snapshots of the same progress compare unequal.
    expect(n([[1, 10], [11, 20]])).toEqual([[1, 20]]);
  });

  it('drops what cannot be a range rather than trusting it', () => {
    // Backwards, or not a number at all. A bad range in a synced blob
    // would otherwise mark part of the book read.
    expect(n([[20, 10], [NaN, 5], [5, NaN]] as AyahRange[])).toEqual([]);
  });

  it('but an index merely out of bounds is clamped, not thrown away', () => {
    // The same policy as [-5, 3]: a bad NUMBER inside a real range is
    // worth saving, where a range that cannot exist is not.
    expect(n([[0, 0]])).toEqual([[1, 1]]);
  });

  it('clamps to the book', () => {
    expect(n([[-5, 3]])).toEqual([[1, 3]]);
    expect(n([[6230, 99999]])).toEqual([[6230, TOTAL]]);
  });
});

describe('union is a merge you can run twice', () => {
  const a: AyahRange[] = [[1, 100]];
  const b: AyahRange[] = [[200, 300]];

  it('holds both sides', () => {
    expect(unionRanges(a, b, TOTAL)).toEqual([[1, 100], [200, 300]]);
  });

  it('does not care which device is asked first', () => {
    expect(unionRanges(a, b, TOTAL)).toEqual(unionRanges(b, a, TOTAL));
  });

  it('is idempotent — merging a snapshot with itself returns it', () => {
    expect(unionRanges(a, a, TOTAL)).toEqual(a);
    const patchy: AyahRange[] = [[1, 10], [50, 60], [500, 900]];
    expect(unionRanges(patchy, patchy, TOTAL)).toEqual(patchy);
  });

  it('and loses nothing when one side is behind', () => {
    // The phone read on; the Mac has not heard. Neither forgets.
    const phone: AyahRange[] = [[1, 500]];
    const mac: AyahRange[] = [[1, 200]];
    expect(unionRanges(phone, mac, TOTAL)).toEqual([[1, 500]]);
  });
});

describe('asking what is done', () => {
  const done: AyahRange[] = [[1, 100], [200, 300]];

  it('counts the ayahs, not the ranges', () => {
    expect(countRanges(done)).toBe(100 + 101);
  });

  it('answers for a single ayah', () => {
    expect(rangesContain(done, 50)).toBe(true);
    expect(rangesContain(done, 150)).toBe(false);
    expect(rangesContain(done, 300)).toBe(true);
  });

  it('answers for a whole page — every ayah of it, or it is not done', () => {
    expect(rangesCover(done, 10, 20)).toBe(true);
    expect(rangesCover(done, 95, 105)).toBe(false); // straddles the gap
    expect(rangesCover([[1, 10], [11, 20]], 5, 15)).toBe(true); // joined
  });

  it('counts how much of a portion is done', () => {
    expect(countWithin(done, 50, 250)).toBe(51 + 51);
    expect(countWithin(done, 101, 199)).toBe(0);
  });
});

describe('where to carry on', () => {
  it('is the first ayah not read', () => {
    expect(firstMissingFrom([[1, 100]], 1, TOTAL)).toBe(101);
    expect(firstMissingFrom([[1, 100], [200, 300]], 1, TOTAL)).toBe(101);
  });

  it('skips over what is already done further on', () => {
    expect(firstMissingFrom([[1, 100], [102, 300]], 1, TOTAL)).toBe(101);
  });

  it('is past the end once the book is read', () => {
    expect(firstMissingFrom([[1, TOTAL]], 1, TOTAL)).toBe(TOTAL + 1);
  });

  it('and the contiguous run is what the old fields are written from', () => {
    // A device still reading `ayahsRead` must see what it always saw:
    // progress up to the first gap, never past it.
    expect(contiguousFrom([[1, 100], [200, 300]], 1, TOTAL)).toBe(100);
    expect(contiguousFrom([[50, 100]], 1, TOTAL)).toBe(0);
  });
});

describe('taking a reading back out', () => {
  it('splits a run when the piece removed is in the middle', () => {
    // The thing a high-water mark could never do: unmark one page without
    // losing everything after it.
    expect(subtractRange([[1, 100]], 40, 50, TOTAL)).toEqual([[1, 39], [51, 100]]);
  });

  it('trims an end without touching the rest', () => {
    expect(subtractRange([[1, 100]], 90, 200, TOTAL)).toEqual([[1, 89]]);
    expect(subtractRange([[1, 100]], 1, 10, TOTAL)).toEqual([[11, 100]]);
  });

  it('removes a run entirely when it is covered', () => {
    expect(subtractRange([[1, 100], [200, 300]], 1, 150, TOTAL)).toEqual([[200, 300]]);
  });

  it('and removing what was never there changes nothing', () => {
    expect(subtractRange([[1, 100]], 200, 300, TOTAL)).toEqual([[1, 100]]);
  });

  it('undoes an add exactly', () => {
    const before = normalizeRanges([[1, 100], [300, 400]], TOTAL);
    const after = addRange(before, 150, 160, TOTAL);
    expect(subtractRange(after, 150, 160, TOTAL)).toEqual(before);
  });
});

describe('adding a reading', () => {
  it('extends the run when it continues it', () => {
    expect(addRange([[1, 100]], 101, 110, TOTAL)).toEqual([[1, 110]]);
  });

  it('and stands apart when it does not', () => {
    expect(addRange([[1, 100]], 200, 210, TOTAL)).toEqual([[1, 100], [200, 210]]);
  });

  it('re-reading what is done changes nothing', () => {
    expect(addRange([[1, 100]], 20, 30, TOTAL)).toEqual([[1, 100]]);
  });
});
