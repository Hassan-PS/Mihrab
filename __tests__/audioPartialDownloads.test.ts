/**
 * Downloaded audio that will not play offline — issue #30.
 *
 * The report is "downloaded audio will not play offline". The playback
 * code prefers the file on disk whenever it exists, so the interesting
 * question is not how a track is chosen; it is what "downloaded" was
 * allowed to mean.
 *
 * Two answers, and this file pins both.
 *
 * A SURAH COULD BE PARTLY THERE AND LOOK UNTOUCHED. The row asked a
 * boolean question — `isSurahDownloaded` — so 284 ayahs of 286 rendered
 * as "Download this surah", and half a surah left behind by an online
 * listen rendered the same. Nothing ever said there was a gap, and in
 * aeroplane mode the gap is where the recitation stops.
 *
 * AND A FILE COULD BE ANYTHING OVER A KILOBYTE. A captive portal answers
 * every request with 200 and a login page; the login page landed in the
 * audio folder under an ayah's name and passed every check this store
 * had. It is silent when played, and indistinguishable from real audio
 * weeks later.
 */
import {
  base64Prefix,
  deleteSurahAudio,
  downloadAyahs,
  looksLikeMp3,
  parseAyahFileName,
  surahAudioStatus,
  ayahAudioFilePath,
  _resetAudioTransportForTests,
} from '../src/quran/audio/audioStore';

const RECITER = 'ar.alafasy';
/** Anything over MIN_AUDIO_BYTES counts as a file the store believes in. */
const REAL = 'x'.repeat(2000);

const files: Map<string, string> = require('react-native-blob-util').__files;

beforeEach(() => {
  files.clear();
  // The store condemns its streaming transport for the rest of a session
  // on the first failure, and one test here provokes exactly that. Reset
  // so the file does not depend on the order jest runs it in.
  _resetAudioTransportForTests();
});

const put = (surah: number, ayah: number, body = REAL) =>
  files.set(ayahAudioFilePath(RECITER, surah, ayah), body);

describe('what an audio file has to look like', () => {
  it('accepts an ID3 tag and a frame sync', () => {
    expect(looksLikeMp3([0x49, 0x44, 0x33, 0x04])).toBe(true); // "ID3"
    expect(looksLikeMp3([0xff, 0xfb, 0x90, 0x00])).toBe(true); // MPEG1 L3
    expect(looksLikeMp3([0xff, 0xf3, 0x00, 0x00])).toBe(true); // MPEG2 L3
  });

  it('rejects the login page a captive portal returns with a 200', () => {
    // "<!DOCTYPE" — several kilobytes of it, which the old size check
    // waved through and the player has nothing to do with.
    expect(looksLikeMp3([0x3c, 0x21, 0x44, 0x4f])).toBe(false);
    // A JSON error body, the other common shape.
    expect(looksLikeMp3([0x7b, 0x22, 0x65, 0x72])).toBe(false);
    expect(looksLikeMp3([])).toBe(false);
    expect(looksLikeMp3([0xff])).toBe(false);
  });

  it('reads the first bytes without decoding the whole file', () => {
    // "ID3" is SUQz in base64; the fourth byte comes from the next quad.
    expect(base64Prefix('SUQzBAAA', 3)).toEqual([0x49, 0x44, 0x33]);
    expect(base64Prefix('//uQAA==', 2)).toEqual([0xff, 0xfb]);
    expect(base64Prefix('', 4)).toEqual([]);
  });
});

describe('reading a file name back', () => {
  it('is an ayah, or it is not', () => {
    expect(parseAyahFileName('002255.mp3')).toEqual({ surah: 2, ayah: 255 });
    expect(parseAyahFileName('114006.mp3')).toEqual({ surah: 114, ayah: 6 });
  });

  it('is not fooled by what else lands in that folder', () => {
    // A half-written download, and a surah number that is not one.
    expect(parseAyahFileName('002255.mp3.part')).toBeNull();
    expect(parseAyahFileName('000001.mp3')).toBeNull();
    expect(parseAyahFileName('115001.mp3')).toBeNull();
    expect(parseAyahFileName('alafasy.timings.json')).toBeNull();
  });
});

describe('how much of a surah is actually on disk', () => {
  it('says none when there is none', async () => {
    const s = await surahAudioStatus(RECITER, 1);
    expect(s).toEqual({ surah: 1, total: 7, have: 0, missing: [1, 2, 3, 4, 5, 6, 7] });
  });

  it('says which ayahs are missing, not just that some are', async () => {
    // The state the old boolean could not express, and the one that
    // stops a recitation partway through in aeroplane mode.
    for (const a of [1, 2, 3, 5, 6, 7]) put(1, a);
    const s = await surahAudioStatus(RECITER, 1);
    expect(s.have).toBe(6);
    expect(s.missing).toEqual([4]);
  });

  it('says complete only when every ayah is there', async () => {
    for (let a = 1; a <= 7; a++) put(1, a);
    const s = await surahAudioStatus(RECITER, 1);
    expect(s.missing).toEqual([]);
    expect(s.have).toBe(s.total);
  });

  it('does not count a file too small to be audio', async () => {
    for (let a = 1; a <= 7; a++) put(1, a);
    files.set(ayahAudioFilePath(RECITER, 1, 3), 'tiny');
    const s = await surahAudioStatus(RECITER, 1);
    expect(s.missing).toEqual([3]);
  });

  it('counts this surah and not the one beside it', async () => {
    for (let a = 1; a <= 7; a++) put(1, a);
    for (let a = 1; a <= 10; a++) put(2, a);
    expect((await surahAudioStatus(RECITER, 1)).have).toBe(7);
    expect((await surahAudioStatus(RECITER, 2)).have).toBe(10);
  });
});

describe('repairing a gap', () => {
  it('queues the gap, not the surah', async () => {
    // A progress bar counting to 286 when four files are missing tells
    // somebody to expect a long wait.
    for (let a = 1; a <= 7; a++) put(1, a);
    files.delete(ayahAudioFilePath(RECITER, 1, 4));
    const { missing } = await surahAudioStatus(RECITER, 1);
    const seen: number[] = [];
    const handle = downloadAyahs(
      RECITER,
      missing.map(ayah => ({ surah: 1, ayah })),
      p => seen.push(p.total),
    );
    await handle.promise;
    expect(seen.every(total => total === 1)).toBe(true);
  });

  it('never reaches the network for an ayah already on disk', async () => {
    // One of #30's own conditions. Every ayah is there, so nothing should
    // be fetched FOR AUDIO — which is not the same as fetching nothing:
    // see the next test.
    for (let a = 1; a <= 7; a++) put(1, a);
    const blob = require('react-native-blob-util').default;
    blob.config.mockClear();
    const handle = downloadAyahs(
      RECITER,
      [1, 2, 3, 4, 5, 6, 7].map(ayah => ({ surah: 1, ayah })),
      undefined,
    );
    await handle.promise;
    const fetchedPaths = blob.config.mock.calls.map(
      (c: [{ path?: string }]) => String(c[0]?.path ?? ''),
    );
    expect(fetchedPaths.filter((p: string) => p.includes('.mp3'))).toEqual([]);
  });

  it('brings the word timings down with the audio', async () => {
    // The other half of "plays start to finish in aeroplane mode WITH THE
    // TEXT SYNCHRONISED". Timings used to be fetched the first time the
    // highlight needed them, which is during ONLINE playback — so a
    // reader who downloaded a surah and went straight to a plane had
    // every MP3 and no word timing.
    for (let a = 1; a <= 7; a++) put(1, a);
    const blob = require('react-native-blob-util').default;
    blob.config.mockClear();
    await downloadAyahs(RECITER, [{ surah: 1, ayah: 1 }], undefined).promise;
    const fetchedPaths = blob.config.mock.calls.map(
      (c: [{ path?: string }]) => String(c[0]?.path ?? ''),
    );
    expect(fetchedPaths.some((p: string) => p.includes('timings'))).toBe(true);
  });
});

describe('clearing one surah', () => {
  it('takes that surah and leaves the rest', async () => {
    for (let a = 1; a <= 7; a++) put(1, a);
    for (let a = 1; a <= 10; a++) put(2, a);
    const removed = await deleteSurahAudio(RECITER, 1);
    expect(removed).toBe(7);
    expect((await surahAudioStatus(RECITER, 1)).have).toBe(0);
    expect((await surahAudioStatus(RECITER, 2)).have).toBe(10);
  });

  it('says how many went, so nothing claims a deletion it did not make', async () => {
    expect(await deleteSurahAudio(RECITER, 1)).toBe(0);
  });
});

describe('the row that reports it', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src/quran/audio/RecitationControls.tsx'),
    'utf-8',
  );

  it('asks how much is there rather than whether it is there', () => {
    expect(src).toMatch(/surahAudioStatus\(/);
    expect(src).not.toMatch(/isSurahDownloaded/);
  });

  it('downloads the missing ayahs rather than the whole surah', () => {
    expect(src).toMatch(/status\.missing\.map\(ayah => \(\{ surah: surahNumber, ayah \}\)\)/);
  });

  it('re-reads the folder when a run ends, however it ended', () => {
    // A run that failed four ayahs should leave the row saying four are
    // missing — not claiming success, and not claiming nothing happened.
    const after = src.slice(src.indexOf('void handle.promise.then'));
    expect(after.slice(0, 200)).toMatch(/refreshStatus\.current\(\)/);
  });

  it('offers to delete this surah once anything is on disk', () => {
    expect(src).toMatch(/deleteSurahAudio\(prefs\.reciterId, surahNumber\)/);
  });
});

describe('why playback stopped', () => {
  const read = (rel: string) =>
    require('fs').readFileSync(require('path').join(__dirname, '..', rel), 'utf-8');
  const PLAYBACK = read('src/quran/audio/playback.ts');
  const PLAYER = read('src/quran/audio/MiniPlayer.tsx');

  it('starts with nothing to report', () => {
    const { getPlaybackStatus } = require('../src/quran/audio/playback');
    expect(getPlaybackStatus().gap).toBeNull();
  });

  it('listens for the failure at all', () => {
    // Before this there was no PlaybackError listener: a track that could
    // not be loaded stopped the player and said nothing.
    expect(PLAYBACK).toMatch(/addEventListener\(Event\.PlaybackError/);
  });

  it('blames the download only when the file is genuinely absent', () => {
    // A file that IS on disk and still failed is a broken file or a busy
    // device, and telling somebody to connect would be wrong.
    const handler = PLAYBACK.slice(
      PLAYBACK.indexOf('addEventListener(Event.PlaybackError'),
    ).slice(0, 700);
    expect(handler).toMatch(/localAudioPathIfAny\(/);
    expect(handler).toMatch(/if \(!local\) setStatus\(\{ gap: ref/);
  });

  it('clears itself the moment playback starts again', () => {
    // The message must never outlive the condition it describes.
    const starts = PLAYBACK.match(/setStatus\(\{ reciterId: prefs\.reciterId, loading: true[^}]*\}\)/g) ?? [];
    expect(starts.length).toBeGreaterThan(0);
    for (const start of starts) expect(start).toMatch(/gap: null/);
  });

  it('names the ayah on screen rather than in a log', () => {
    expect(PLAYER).toMatch(/quran\.audioGap/);
    expect(PLAYER).toMatch(/surah: findSurah\(gap\.surah\)\?\.romanized/);
    expect(PLAYER).toMatch(/ayah: gap\.ayah/);
  });
});
