/**
 * The word reader: hold a word, slide, lift, hear that one word.
 *
 * The controller (`wordReader.ts`) is tested against fakes of the four
 * things it touches — the player, the audio store, the mockTimings and the
 * recitation — and the hit test against the real page layout.
 */
import { getPageLayout } from '../src/quran/mushafLayout';
import { wordAtPoint } from '../src/quran/mushafHitTest';

const mockPlay = jest.fn<Promise<boolean>, [string, number, number]>(async () => true);
const mockStop = jest.fn(async () => undefined);
jest.mock('../src/native/WordPlayer', () => ({
  wordPlayerAvailable: true,
  WordPlayer: {
    play: (...a: [string, number, number]) => mockPlay(...a),
    stop: () => mockStop(),
  },
}));

const mockState = { onDisk: '/audio/2/3.mp3' as string | null, fetched: null as string | null, playing: false };
const mockPrefetch = jest.fn(async () => mockState.fetched);
jest.mock('../src/quran/audio/audioStore', () => ({
  localAudioPathIfAny: jest.fn(async () => mockState.onDisk),
  prefetchAyahAudio: (...a: unknown[]) => mockPrefetch(...(a as [])),
}));

// 2:3 has three words; word 2 (index 1) is 400–900 ms. 2:4 has no mockTimings.
// The word range is [start, end), as quran-align writes it.
const mockTimings: Record<string, number[][]> = {
  '2:3': [
    [0, 1, 0, 400],
    [1, 2, 400, 900],
    [2, 3, 900, 1500],
  ],
};
jest.mock('../src/quran/audio/useWordTiming', () => ({
  getTimings: jest.fn(async () => mockTimings),
}));

const mockPause = jest.fn(async () => {
  mockState.playing = false;
});
const mockResume = jest.fn(async () => {
  mockState.playing = true;
});
jest.mock('../src/quran/audio/playback', () => ({
  getPlaybackStatus: () => ({ playing: mockState.playing, reciterId: 'husary', active: null }),
  pausePlayback: () => mockPause(),
  resumePlayback: () => mockResume(),
}));

import {
  _resetWordReaderForTests,
  cancel,
  hold,
  isWordReaderBusy,
  onWordReaderSilent,
  release,
  segmentForWord,
  timedReciters,
  wordReaderReciterId,
} from '../src/quran/audio/wordReader';
import { getActiveWord, _resetActiveWordForTests } from '../src/quran/audio/activeWordStore';
import { __resetQuranStateForTests, setQuranPrefs } from '../src/quran/quranState';
import type { MushafWord } from '../src/quran/mushafLayout';

const word = (ayah: number, position: number, isEnd = false): MushafWord => ({
  text: 'x',
  surah: 2,
  ayah,
  position,
  isEnd,
  advance: 1,
});

const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  __resetQuranStateForTests();
  _resetWordReaderForTests();
  _resetActiveWordForTests();
  mockPlay.mockClear();
  mockStop.mockClear();
  mockPause.mockClear();
  mockResume.mockClear();
  mockPrefetch.mockClear();
  mockState.onDisk = '/audio/2/3.mp3';
  mockState.fetched = null;
  mockState.playing = false;
});

describe('who reads the word', () => {
  it('lists only reciters with word timings', () => {
    const list = timedReciters();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every(r => r.hasTimings)).toBe(true);
  });

  it('is the chosen one, else the recitation reciter when timed, else the default — never untimed', () => {
    expect(wordReaderReciterId({ wordReaderReciterId: 'sudais', reciterId: 'husary' })).toBe('sudais');
    expect(wordReaderReciterId({ wordReaderReciterId: '', reciterId: 'sudais' })).toBe('sudais');
    const untimed = timedReciters().length; // any id not timed:
    const untimedId = (require('../src/quran/audio/reciters').RECITERS as { id: string; hasTimings: boolean }[]).find(r => !r.hasTimings)!.id;
    expect(untimed).toBeGreaterThan(0);
    expect(wordReaderReciterId({ wordReaderReciterId: untimedId, reciterId: untimedId })).toBe('husary');
    expect(wordReaderReciterId({ wordReaderReciterId: 'nobody', reciterId: 'husary' })).toBe('husary');
  });
});

describe('the segment for a word', () => {
  it('finds the segment whose half-open word range holds the position', () => {
    expect(segmentForWord(mockTimings['2:3'], 1)).toEqual({ startMs: 0, endMs: 400 });
    expect(segmentForWord(mockTimings['2:3'], 2)).toEqual({ startMs: 400, endMs: 900 });
    expect(segmentForWord(mockTimings['2:3'], 3)).toEqual({ startMs: 900, endMs: 1500 });
    // Two words the aligner could not split share one slice.
    expect(segmentForWord([[0, 2, 0, 1500]], 2)).toEqual({ startMs: 0, endMs: 1500 });
    // A degenerate range still names its one word.
    expect(segmentForWord([[1, 1, 400, 900]], 2)).toEqual({ startMs: 400, endMs: 900 });
  });
  it('is null off the data, and for an empty segment', () => {
    expect(segmentForWord(undefined, 1)).toBeNull();
    expect(segmentForWord(mockTimings['2:3'], 9)).toBeNull();
    expect(segmentForWord([[0, 1, 500, 500]], 1)).toBeNull();
  });
});

describe('hold, slide, lift', () => {
  it('lights the held word, and on release plays exactly its slice, then clears', async () => {
    hold(word(3, 1));
    expect(getActiveWord()).toEqual({ surah: 2, ayah: 3, wordIndex: 0 });
    hold(word(3, 2));
    expect(getActiveWord()).toEqual({ surah: 2, ayah: 3, wordIndex: 1 });
    await release();
    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledWith('/audio/2/3.mp3', 400, 900);
    expect(getActiveWord()).toBeNull();
  });

  it('stays busy — the word stays lit — while the released word loads and plays', async () => {
    let finish: (v: boolean) => void = () => undefined;
    mockPlay.mockImplementationOnce(() => new Promise(r => (finish = r)));
    hold(word(3, 1));
    expect(isWordReaderBusy()).toBe(true);
    const done = release();
    await flush();
    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(isWordReaderBusy()).toBe(true);
    expect(getActiveWord()).toEqual({ surah: 2, ayah: 3, wordIndex: 0 });
    finish(true);
    await done;
    expect(isWordReaderBusy()).toBe(false);
    expect(getActiveWord()).toBeNull();
  });

  it('the medallion is not a word', () => {
    hold(word(3, 4, true));
    expect(getActiveWord()).toBeNull();
  });

  it('pauses a playing recitation for the hold and resumes it after the word', async () => {
    mockState.playing = true;
    hold(word(3, 1));
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockResume).not.toHaveBeenCalled();
    await release();
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('leaves a paused recitation paused', async () => {
    hold(word(3, 1));
    await release();
    expect(mockPause).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('a cancelled hold plays nothing and puts the recitation back', async () => {
    mockState.playing = true;
    hold(word(3, 1));
    cancel();
    await flush();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(getActiveWord()).toBeNull();
  });

  it('fetches the ayah on the hold, so release has it', async () => {
    mockState.onDisk = null;
    mockState.fetched = '/audio/2/3.mp3';
    hold(word(3, 1));
    await flush();
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    await release();
    expect(mockPlay).toHaveBeenCalledWith('/audio/2/3.mp3', 0, 400);
  });

  it('says so when the audio cannot be had, and when the word has no timing', async () => {
    const silent = jest.fn();
    onWordReaderSilent(silent);
    mockState.onDisk = null;
    mockState.fetched = null;
    hold(word(3, 1));
    await release();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(silent).toHaveBeenLastCalledWith('offline');

    mockState.onDisk = '/audio/2/4.mp3';
    hold(word(4, 1));
    await release();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(silent).toHaveBeenLastCalledWith('no-timing');
  });

  it('a new hold during a word cuts it short and does not clear the new hold', async () => {
    let finish: (v: boolean) => void = () => undefined;
    mockPlay.mockImplementationOnce(() => new Promise(r => (finish = r)));
    hold(word(3, 1));
    const first = release();
    await flush();
    hold(word(3, 3));
    expect(mockStop).toHaveBeenCalled();
    finish(false);
    await first;
    // The first release settling must not put out the second hold's word.
    expect(getActiveWord()).toEqual({ surah: 2, ayah: 3, wordIndex: 2 });
  });

  it('is off by default and remembers its reciter', () => {
    const { getQuranState } = require('../src/quran/quranState');
    expect(getQuranState().prefs.wordReader).toBe(false);
    setQuranPrefs({ wordReader: true, wordReaderReciterId: 'sudais' });
    expect(getQuranState().prefs.wordReaderReciterId).toBe('sudais');
  });
});

describe('the word under a point', () => {
  const layout = getPageLayout(2)!;
  const geometry = { width: 360, fontSize: 20, lineHeight: 34, measureEm: 17, framed: true };

  it('answers a word on an ayah line and nothing on a band or in the margin', () => {
    const ayahLine = layout.lines.findIndex(l => l.kind === 'ayah');
    const bandLine = layout.lines.findIndex(l => l.kind !== 'ayah');
    const w = wordAtPoint(layout, 300, ayahLine * 34 + 17, geometry);
    expect(w).not.toBeNull();
    expect(w!.isEnd).toBe(false);
    expect(wordAtPoint(layout, 180, bandLine * 34 + 17, geometry)).toBeNull();
    expect(wordAtPoint(layout, 180, layout.lines.length * 34 + 5, geometry)).toBeNull();
  });

  it('walks right to left: further left is a later word', () => {
    const i = layout.lines.findIndex(l => l.kind === 'ayah');
    const right = wordAtPoint(layout, 340, i * 34 + 10, geometry)!;
    const left = wordAtPoint(layout, 40, i * 34 + 10, geometry)!;
    const line = layout.lines[i] as { kind: 'ayah'; words: MushafWord[] };
    expect(line.words.indexOf(right)).toBeLessThan(line.words.indexOf(left));
  });

  it('never answers the medallion — the word before it instead', () => {
    for (let i = 0; i < layout.lines.length; i++) {
      for (let x = 0; x < 360; x += 4) {
        const w = wordAtPoint(layout, x, i * 34 + 10, geometry);
        if (w) expect(w.isEnd).toBe(false);
      }
    }
  });
});
