/**
 * Listening runs past the end of a surah; the reader's playback does not.
 *
 * "Play from here" in the mushaf ends where the surah does, because you
 * tapped an ayah and wanted that passage. Someone who puts a recitation on
 * expects the opposite — Al-Baqarah into Āl-ʿImrān, the way any album
 * plays into the next track.
 *
 * The whole book is 6,236 tracks and the player will not hold that, so the
 * queue is a window that walks forward and is topped up as it drains.
 * `listenCursor` — the first ayah not yet queued — is the only state that
 * top-up needs, and these are the two pure functions it is built from.
 * They are worth pinning precisely: an off-by-one here either repeats an
 * ayah at every window boundary or silently skips one, and both are the
 * kind of thing a listener notices and cannot explain.
 */
import { listenWindow, nextAyahRef } from '../src/quran/audio/playback';
import { SURAHS } from '../src/quran/quran';
import { allAyahRefs, totalAyahCount } from '../src/quran/audio/audioStore';

const AL_FATIHAH = SURAHS[0];
const AN_NAS = SURAHS[113];

describe('the ayah after this one', () => {
  it('steps within a surah', () => {
    expect(nextAyahRef({ surah: 2, ayah: 4 })).toEqual({ surah: 2, ayah: 5 });
  });

  it('crosses into the next surah at the last ayah', () => {
    expect(nextAyahRef({ surah: 1, ayah: AL_FATIHAH.ayahCount })).toEqual({
      surah: 2,
      ayah: 1,
    });
  });

  it('stops at the end of the book', () => {
    // 114:6 is the last ayah there is. A cursor that wrapped to 1:1 would
    // put a listener in an endless loop they never asked for.
    expect(nextAyahRef({ surah: 114, ayah: AN_NAS.ayahCount })).toBeNull();
  });

  it('answers null for a surah that does not exist', () => {
    expect(nextAyahRef({ surah: 200, ayah: 1 })).toBeNull();
  });
});

describe('the window the queue is built from', () => {
  it('starts at the ayah it was given, inclusive', () => {
    const { refs } = listenWindow({ surah: 2, ayah: 10 }, 5);
    expect(refs[0]).toEqual({ surah: 2, ayah: 10 });
    expect(refs).toHaveLength(5);
  });

  it('hands back the first ayah it did NOT queue', () => {
    // The cursor is what the next top-up starts from. If it pointed at the
    // last ayah queued rather than the one after, every window boundary
    // would play one ayah twice.
    const { refs, cursor } = listenWindow({ surah: 1, ayah: 1 }, 3);
    expect(refs).toEqual([
      { surah: 1, ayah: 1 },
      { surah: 1, ayah: 2 },
      { surah: 1, ayah: 3 },
    ]);
    expect(cursor).toEqual({ surah: 1, ayah: 4 });
  });

  it('runs one surah into the next without a gap', () => {
    const { refs } = listenWindow(
      { surah: 1, ayah: AL_FATIHAH.ayahCount - 1 },
      4,
    );
    expect(refs).toEqual([
      { surah: 1, ayah: AL_FATIHAH.ayahCount - 1 },
      { surah: 1, ayah: AL_FATIHAH.ayahCount },
      { surah: 2, ayah: 1 },
      { surah: 2, ayah: 2 },
    ]);
  });

  it('two windows joined are the same as one long one', () => {
    // The property that matters: a listener must not be able to tell where
    // one top-up ended and the next began.
    const first = listenWindow({ surah: 1, ayah: 1 }, 20);
    const second = listenWindow(first.cursor!, 20);
    const straight = listenWindow({ surah: 1, ayah: 1 }, 40);
    expect([...first.refs, ...second.refs]).toEqual(straight.refs);
  });

  it('ends short at the end of the book, with no cursor', () => {
    const { refs, cursor } = listenWindow(
      { surah: 114, ayah: AN_NAS.ayahCount - 1 },
      50,
    );
    expect(refs).toHaveLength(2);
    expect(cursor).toBeNull();
  });

  it('asks for nothing when told to queue nothing', () => {
    expect(listenWindow({ surah: 1, ayah: 1 }, 0).refs).toEqual([]);
  });
});

describe('the book, counted', () => {
  it('is 6,236 ayahs', () => {
    // Computed from the surah table rather than written down, so it cannot
    // drift from what the downloader actually queues.
    expect(totalAyahCount()).toBe(6236);
  });

  it('lists every one of them, in recitation order', () => {
    const refs = allAyahRefs();
    expect(refs).toHaveLength(totalAyahCount());
    expect(refs[0]).toEqual({ surah: 1, ayah: 1 });
    expect(refs[refs.length - 1]).toEqual({
      surah: 114,
      ayah: AN_NAS.ayahCount,
    });
  });

  it('is the same walk the listening window makes', () => {
    // One order, two callers: the download queues the book in the order it
    // is recited, and the player walks it the same way. Two different
    // answers here would mean the download's "6,236 of 6,236" and the
    // player's idea of the last ayah disagreed.
    const walked = listenWindow({ surah: 1, ayah: 1 }, 10_000).refs;
    expect(walked).toEqual(allAyahRefs());
  });
});
