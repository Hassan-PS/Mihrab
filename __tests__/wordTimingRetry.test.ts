/**
 * The word highlight came back dead on Android, and the cache was why.
 *
 * Opening the muṣḥaf starts a 604-file font download over the same
 * transport the timings are fetched on. The timings fetch lost the race —
 * `audioStore: timings unavailable, [Error: Download interrupted.]`, twice
 * in one logcat — and the null it returned was cached for the life of the
 * process. From then on every lookup answered from the cache, so the words
 * never lit up again however good the network got.
 */
import {
  FAILURE_RETRY_MS,
  timingsExpiry,
} from '../src/quran/audio/useWordTiming';

const NOW = 1_700_000_000_000;

describe('how long a timings answer is believed', () => {
  it('keeps a successful fetch for the life of the process', () => {
    expect(timingsExpiry(true, true, NOW)).toBe(Infinity);
  });

  // Nothing to fetch: the answer cannot change without a new build.
  it('keeps "this reciter publishes none" for ever', () => {
    expect(timingsExpiry(false, false, NOW)).toBe(Infinity);
  });

  // A FAILED fetch is only the truth about this minute. Long enough that
  // an ayah change does not re-ask, short enough that the highlight comes
  // back on its own once the download has stopped hogging the transport.
  it('re-asks after a failure', () => {
    expect(timingsExpiry(true, false, NOW)).toBe(NOW + FAILURE_RETRY_MS);
    expect(FAILURE_RETRY_MS).toBeGreaterThanOrEqual(10_000);
    expect(FAILURE_RETRY_MS).toBeLessThanOrEqual(120_000);
  });
});
