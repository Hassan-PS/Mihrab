/**
 * A DOWNLOAD THE NETWORK TOOK AWAY — issue #55.
 *
 * The report, in the reporter's words: a reciter was downloading over
 * wifi, they walked out of range at 85%, the app said the download had
 * failed, tapping that message did nothing, and the only thing the
 * reciter's row offered afterwards was Delete — "the only option seems to
 * be to delete the download and start again from 0%".
 *
 * Every one of those megabytes was on the disk the whole time. A
 * recitation is 6,236 separate files and a file already there is skipped,
 * so resuming has always been the same call again; what was missing was
 * any way to make it, and any word for what had happened other than
 * "failed".
 *
 * These pin the three parts of the answer: a run that stops when the
 * files stop arriving rather than grinding through six thousand doomed
 * fetches, an ending that says which of the three it was, and a resume
 * that fetches only what is missing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ayahAudioFilePath,
  downloadAyahs,
  _resetAudioTransportForTests,
} from '../src/quran/audio/audioStore';

const RECITER = 'ar.alafasy';
/** Anything over the store's floor counts as a file it believes in. */
const REAL = 'x'.repeat(2000);
const files: Map<string, string> = require('react-native-blob-util').__files;
const put = (surah: number, ayah: number) =>
  files.set(ayahAudioFilePath(RECITER, surah, ayah), REAL);
const refs = (surah: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ surah, ayah: from + i }));

beforeEach(() => {
  files.clear();
  _resetAudioTransportForTests();
});

/**
 * Every fetch fails in this suite — there is no network behind the mock,
 * which is exactly the condition under test. Three attempts per file with
 * backoff between them makes the stop take a couple of seconds, and that
 * is the point: the version without a brake took the same couple of
 * seconds SIX THOUSAND times.
 */
jest.setTimeout(30000);

describe('a run that stops because the files stopped coming', () => {
  it('gives up early instead of walking the rest of the book', async () => {
    const seen: number[] = [];
    const outcome = await downloadAyahs(RECITER, refs(2, 1, 60), p =>
      seen.push(p.done),
    ).promise;

    expect(outcome.interrupted).toBe(true);
    expect(outcome.complete).toBe(false);
    // Nowhere near the sixty it was given: it stopped as soon as the
    // failures stopped looking like files and started looking like a
    // connection (`GIVE_UP_AFTER_CONSECUTIVE_FAILURES`).
    expect(seen[seen.length - 1]).toBeLessThan(30);
  });

  it('keeps every byte that did arrive', async () => {
    for (const { surah, ayah } of refs(2, 1, 20)) put(surah, ayah);
    await downloadAyahs(RECITER, refs(2, 1, 60), undefined).promise;
    for (const { surah, ayah } of refs(2, 1, 20)) {
      expect(files.has(ayahAudioFilePath(RECITER, surah, ayah))).toBe(true);
    }
  });

  it('is not what a handful of bad files looks like', async () => {
    // Twenty-two there, three that will not come, none of them adjacent.
    // That is a report about three files and nothing to wait for, so the
    // run walks the whole queue and ends without the word "interrupted".
    for (const { surah, ayah } of refs(1, 1, 7)) put(surah, ayah);
    for (const { surah, ayah } of refs(2, 1, 20)) put(surah, ayah);
    files.delete(ayahAudioFilePath(RECITER, 2, 5));
    files.delete(ayahAudioFilePath(RECITER, 2, 12));
    files.delete(ayahAudioFilePath(RECITER, 2, 19));

    let last = { done: 0, total: 0, failed: 0 };
    const outcome = await downloadAyahs(
      RECITER,
      [...refs(1, 1, 7), ...refs(2, 1, 20)],
      p => {
        last = p;
      },
    ).promise;

    expect(outcome.interrupted).toBe(false);
    expect(outcome.complete).toBe(false);
    expect(last.done).toBe(27);
    expect(last.failed).toBe(3);
  });

  it('and a queue with nothing wrong with it still finishes', async () => {
    for (const { surah, ayah } of refs(1, 1, 7)) put(surah, ayah);
    const outcome = await downloadAyahs(RECITER, refs(1, 1, 7), undefined)
      .promise;
    expect(outcome).toEqual({ complete: true, interrupted: false });
  });
});

describe('resuming is the same call, and the disk is the checkpoint', () => {
  it('fetches only what is missing, however it is asked', async () => {
    // The whole of the resume story: 85% on disk means 85% skipped. The
    // three that are missing are the three that reach the network — and
    // they fail here, because there is still no network.
    for (const { surah, ayah } of refs(2, 1, 20)) put(surah, ayah);
    const missing = [4, 9, 14];
    for (const ayah of missing) {
      files.delete(ayahAudioFilePath(RECITER, 2, ayah));
    }

    let last = { done: 0, total: 0, failed: 0 };
    await downloadAyahs(RECITER, refs(2, 1, 20), p => {
      last = p;
    }).promise;

    // Twenty in the queue, seventeen skipped, and only the three that
    // were missing could reach the network — which is why exactly three
    // failed against a mock that has no network at all.
    expect(last).toEqual({ done: 20, total: 20, failed: 3 });
    // And the seventeen are untouched: a resume reads the disk, it does
    // not refetch it.
    for (const { surah, ayah } of refs(2, 1, 20)) {
      if (missing.includes(ayah)) continue;
      expect(files.get(ayahAudioFilePath(RECITER, surah, ayah))).toBe(REAL);
    }
  });

  it('gives the fast transport another go on a new run', async () => {
    // It used to be condemned for the rest of the SESSION on one failure.
    // The commonest reason it fails is the connection going away, so a
    // reader who resumed an hour later was handed the slow path for the
    // rest of the day over a network that no longer existed.
    const store = readFileSync(
      join(__dirname, '..', 'src/quran/audio/audioStore.ts'),
      'utf8',
    );
    expect(store).toMatch(/streamingAudioWorks = true;\s*\n\s*await mkdirDeep/);
  });
});
