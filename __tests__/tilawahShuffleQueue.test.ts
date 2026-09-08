/**
 * "Shuffle doesn't shuffle" — the queue, not the flag.
 *
 * tilawahShuffle.test.ts pins the step function. These pin what a listener
 * hears: the flag was consulted only when the queue was EXTENDED, and a
 * listen starts with two hundred ayahs already queued in reading order —
 * so toggling shuffle changed nothing until ayah 201, and the big "next"
 * arrow walked to N+1 regardless. Both are exercised here against the
 * TrackPlayer mock.
 */
import TrackPlayer from 'react-native-track-player';
import {
  _resetShuffleForTests,
  isShuffling,
  listenFrom,
  listenNextSurah,
  parseTrackId,
  setShuffleSurahs,
  stopPlayback,
} from '../src/quran/audio/playback';
import { setQuranPrefs } from '../src/quran/quranState';

jest.mock('../src/quran/audio/audioStore', () => ({
  localAudioPathIfAny: jest.fn(async () => null),
  prefetchAyahAudio: jest.fn(async () => null),
}));
jest.mock('../src/native/NowPlayingState', () => ({
  setNowPlayingState: jest.fn(),
}));

const tp = TrackPlayer as unknown as Record<string, jest.Mock>;
const flush = () => new Promise(r => setTimeout(r, 0));
const ids = (tracks: Array<{ id: string }>) =>
  tracks.map(t => parseTrackId(String(t.id))!);

/** The last `add` call's tracks. */
const lastAdded = () => tp.add.mock.calls[tp.add.mock.calls.length - 1][0] as Array<{ id: string }>;

beforeEach(async () => {
  jest.clearAllMocks();
  _resetShuffleForTests();
  setQuranPrefs({ shuffleSurahs: false });
  await stopPlayback();
  jest.clearAllMocks();
  // The bag's draw, made deterministic: the LAST candidate — surah 114
  // from anywhere below it — so a test can tell a shuffled step from a
  // sequential one without a probability.
  jest.spyOn(Math, 'random').mockReturnValue(0.9999);
});

afterEach(() => {
  (Math.random as jest.Mock).mockRestore?.();
});

describe('turning shuffle on mid-listen', () => {
  it('drops what was queued past this surah and re-queues with the new step', async () => {
    await listenFrom(1, 1);
    const queued = lastAdded();
    // Reading order to begin with: Al-Fatihah runs into Al-Baqarah.
    expect(ids(queued)[7]).toEqual({ surah: 2, ayah: 1 });

    // Playback is at 1:4 with that queue in the player.
    tp.getQueue.mockResolvedValueOnce(queued);
    tp.getActiveTrackIndex.mockResolvedValueOnce(3);
    setShuffleSurahs(true);
    await flush();
    await flush();

    // Everything after 1:7 (indices 7..199) is gone…
    const removed = tp.remove.mock.calls[0][0] as number[];
    expect(removed[0]).toBe(7);
    expect(removed[removed.length - 1]).toBe(queued.length - 1);
    // …and what replaces it starts at another surah, not at 2:1.
    const refill = ids(lastAdded());
    expect(refill[0]).toEqual({ surah: 114, ayah: 1 });
  });

  it('leaves the surah being recited whole', async () => {
    await listenFrom(2, 1);
    const queued = lastAdded(); // 200 ayahs of Al-Baqarah, nothing else
    tp.getQueue.mockResolvedValueOnce(queued);
    tp.getActiveTrackIndex.mockResolvedValueOnce(10);
    setShuffleSurahs(true);
    await flush();
    await flush();
    // Nothing to cut: the whole window is one surah…
    expect(tp.remove).not.toHaveBeenCalled();
    // …and the top-up continues it from 2:201, in order.
    expect(ids(lastAdded())[0]).toEqual({ surah: 2, ayah: 201 });
  });

  it('turning it off reshapes back to reading order', async () => {
    // The preference is the record (a listen reads it on start); the
    // screen writes it and mirrors it into the flag.
    setQuranPrefs({ shuffleSurahs: true });
    setShuffleSurahs(true);
    await listenFrom(1, 1);
    const queued = lastAdded();
    expect(ids(queued)[7]).toEqual({ surah: 114, ayah: 1 }); // shuffled
    tp.getQueue.mockResolvedValueOnce(queued);
    tp.getActiveTrackIndex.mockResolvedValueOnce(0);
    setQuranPrefs({ shuffleSurahs: false });
    setShuffleSurahs(false);
    await flush();
    await flush();
    expect(ids(lastAdded())[0]).toEqual({ surah: 2, ayah: 1 });
  });
});

describe('the next-surah arrow', () => {
  it('draws from the bag while shuffling', async () => {
    setQuranPrefs({ shuffleSurahs: true });
    setShuffleSurahs(true);
    await listenFrom(1, 1);
    await listenNextSurah();
    // Not N+1. (Not 114 either: the first window already drew it and its
    // neighbours into the bag — a surah queued counts as heard.)
    const first = ids(lastAdded())[0];
    expect(first.ayah).toBe(1);
    expect(first.surah).not.toBe(2);
    expect(first.surah).not.toBe(1);
  });

  it('still walks to N+1 when not', async () => {
    await listenFrom(1, 1);
    await listenNextSurah();
    expect(ids(lastAdded())[0]).toEqual({ surah: 2, ayah: 1 });
  });
});

describe('a listen started without the screen', () => {
  it('takes the flag from the preference', async () => {
    setQuranPrefs({ shuffleSurahs: true });
    await listenFrom(1, 1);
    expect(isShuffling()).toBe(true);
    expect(ids(lastAdded())[7]).toEqual({ surah: 114, ayah: 1 });
  });
});
