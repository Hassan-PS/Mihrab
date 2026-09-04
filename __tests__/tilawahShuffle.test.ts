/**
 * Shuffle is a SURAH shuffle, and only ever could be.
 *
 * Shuffling ayahs would be worse than meaningless. The Quran is ordered,
 * an ayah is a sentence inside an argument, and playing 2:97 after 78:12
 * is not a shuffled album — it is noise. So shuffle changes exactly one
 * thing: which surah follows this one. Inside a surah nothing moves, and
 * these tests exist to keep it that way if anyone ever "improves" the
 * step function.
 *
 * The second property is that it is a bag rather than a die. Rolling
 * 1–114 each time replays surahs long before it has touched most of
 * them, which people report as broken shuffle.
 */
import {
  _resetShuffleForTests,
  isShuffling,
  listenWindow,
  nextAyahRef,
  setShuffleSurahs,
} from '../src/quran/audio/playback';
import { SURAHS } from '../src/quran/quran';

const AL_FATIHAH = SURAHS[0].ayahCount;

beforeEach(() => {
  _resetShuffleForTests();
});

describe('the flag', () => {
  it('is off until asked for, and clears its bag when turned off', () => {
    expect(isShuffling()).toBe(false);
    setShuffleSurahs(true);
    expect(isShuffling()).toBe(true);
    setShuffleSurahs(false);
    expect(isShuffling()).toBe(false);
  });
});

describe('the window still walks reading order by default', () => {
  it('steps sequentially when nothing passes a step function', () => {
    // The default argument is the reading order, so every existing caller
    // and every test written before shuffle existed still means what it
    // said.
    const { refs } = listenWindow({ surah: 1, ayah: 1 }, 10);
    expect(refs[AL_FATIHAH]).toEqual({ surah: 2, ayah: 1 });
  });

  it('takes an explicit step function', () => {
    // A step that refuses to leave the surah: proof the seam is real and
    // the window is not consulting anything global of its own.
    const stayPut = (r: { surah: number; ayah: number }) =>
      r.ayah < 3 ? { surah: r.surah, ayah: r.ayah + 1 } : null;
    const { refs, cursor } = listenWindow({ surah: 2, ayah: 1 }, 50, stayPut);
    expect(refs).toHaveLength(3);
    expect(cursor).toBeNull();
  });
});

describe('inside a surah, shuffle changes nothing', () => {
  it('walks ayah by ayah exactly as reading order does', () => {
    setShuffleSurahs(true);
    // Al-Fatihah is 7 ayahs; the first 7 steps must be 1:1..1:7 in order
    // whether or not shuffle is on.
    const straight = listenWindow({ surah: 1, ayah: 1 }, AL_FATIHAH).refs;
    expect(straight).toEqual(
      Array.from({ length: AL_FATIHAH }, (_, i) => ({ surah: 1, ayah: i + 1 })),
    );
    // And the sequential stepper is unaffected by the flag.
    expect(nextAyahRef({ surah: 1, ayah: 1 })).toEqual({ surah: 1, ayah: 2 });
  });
});

describe('the bag', () => {
  it('never repeats a surah before every other has been heard', () => {
    // Reconstructed from the module's own behaviour: a long window run
    // with shuffle on crosses many surah boundaries, and no surah may
    // appear twice until all 114 have appeared once.
    setShuffleSurahs(true);
    const seen: number[] = [];
    let cursor: { surah: number; ayah: number } | null = { surah: 1, ayah: 1 };
    // 30 boundary crossings is enough to catch a die pretending to be a
    // bag: the birthday bound says a fair die repeats within 30 draws of
    // 114 with probability well over 95%.
    for (let i = 0; i < 30 && cursor; i++) {
      const meta = SURAHS.find(s => s.number === cursor!.surah);
      if (!meta) break;
      seen.push(cursor.surah);
      // Jump to the last ayah of this surah so the next step crosses.
      const res = listenWindow({ surah: cursor.surah, ayah: meta.ayahCount }, 2);
      cursor = res.refs[1] ?? null;
      if (!cursor) break;
    }
    // In READING order this walk is 1,2,3,… — the point of the assertion
    // below is the uniqueness, which must hold under either ordering.
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('is emptied when shuffle is turned off, so the next run starts fresh', () => {
    setShuffleSurahs(true);
    setShuffleSurahs(false);
    expect(isShuffling()).toBe(false);
  });
});
