/**
 * How big is this, before I say yes.
 *
 * The listening page offers to put a reciter's whole Quran on the phone.
 * That is somewhere between a third of a gigabyte and a gigabyte and a
 * half depending on whose voice it is, and the difference is not a detail
 * — it is the whole of the decision the person is making.
 *
 * Nothing in the catalog carries a duration or a size, but every EveryAyah
 * folder ends in its bitrate, so the estimate is read rather than guessed.
 * What it is NOT is a promise: the hours are an average across reciters
 * who differ by a factor of two, which is why every string built on this
 * says "about".
 */
import {
  estimatedReciterBytes,
  reciterBitrateKbps,
} from '../src/quran/audio/audioStore';
import { RECITERS, findReciter } from '../src/quran/audio/reciters';

const MB = 1024 * 1024;

describe('the bitrate, read off the folder', () => {
  it('reads every reciter in the catalog', () => {
    // The parser is only worth having if it works on all 42. A folder that
    // stopped following the convention would silently fall back to 64 and
    // quote the wrong size at someone about to spend a gigabyte.
    for (const r of RECITERS) {
      expect(/_(\d+)kbps$/.test(r.folder)).toBe(true);
      expect(reciterBitrateKbps(r)).toBe(Number(/_(\d+)kbps$/.exec(r.folder)![1]));
    }
  });

  it('falls back to something sane for a folder it cannot read', () => {
    expect(
      reciterBitrateKbps({
        id: 'x',
        name: 'X',
        arabicName: 'X',
        folder: 'no_bitrate_here',
        hasTimings: false,
      }),
    ).toBe(64);
  });
});

describe('the estimate', () => {
  it('scales with the bitrate', () => {
    // 128 kbps is twice 64 kbps for the same hours, and the number people
    // see has to move with the voice they picked.
    const at64 = RECITERS.find(r => reciterBitrateKbps(r) === 64);
    const at128 = RECITERS.find(r => reciterBitrateKbps(r) === 128);
    expect(at64).toBeDefined();
    expect(at128).toBeDefined();
    expect(estimatedReciterBytes(at128!.id)).toBe(
      estimatedReciterBytes(at64!.id) * 2,
    );
  });

  it('lands in the right order of magnitude at each bitrate', () => {
    // Measured against what these folders actually weigh: a whole reading
    // is roughly 1.2-1.4 GB at 128 kbps and about half that at 64. The
    // estimate has to be close enough that nobody is surprised by what
    // lands on the disk — the bitrate is read from the catalog rather than
    // assumed, because the default reciter is a 64 kbps one and hard-coding
    // "husary is 128" is exactly the kind of guess this function exists to
    // stop making.
    const expected: Record<number, [number, number]> = {
      64: [500, 900],
      128: [1000, 1800],
    };
    for (const [kbps, [low, high]] of Object.entries(expected)) {
      const r = RECITERS.find(x => reciterBitrateKbps(x) === Number(kbps));
      expect(r).toBeDefined();
      const mb = estimatedReciterBytes(r!.id) / MB;
      expect(mb).toBeGreaterThan(low);
      expect(mb).toBeLessThan(high);
    }
  });

  it('quotes the default reciter honestly', () => {
    // Whatever the default is, the page opens on it, so its number is the
    // one most people will ever read.
    const fallback = findReciter('husary');
    expect(estimatedReciterBytes(fallback.id)).toBe(
      Math.round((24 * 3600 * reciterBitrateKbps(fallback) * 1000) / 8),
    );
  });

  it('never quotes zero', () => {
    // A "0 MB" download button reads as a bug or as free, and it is
    // neither.
    for (const r of RECITERS) {
      expect(estimatedReciterBytes(r.id)).toBeGreaterThan(100 * MB);
    }
  });

  it('answers for an id it has never heard of', () => {
    // `findReciter` falls back rather than throwing, and so must this —
    // a stale reciterId in stored prefs must not take the screen down.
    expect(estimatedReciterBytes('not-a-reciter')).toBeGreaterThan(0);
  });
});
