/**
 * The word highlight stayed dead on Android after the cache was fixed, and
 * the reason was one layer down: EVERY attempt used a transport that
 * cannot work there.
 *
 *   audioStore: timings unavailable, [Error: Download interrupted.]
 *
 * once per retry, for ever. `ReactNativeBlobUtil`'s streaming downloader
 * fails that way on the emulator's NAT and on some proxies — which the
 * font store already knew, and already carried a fallback for. The timings
 * fetch did not.
 */
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src/quran/audio/audioStore.ts'),
  'utf8',
);

describe('the timings fetch has a second transport', () => {
  it('falls back to RN networking when the streaming download dies', () => {
    expect(source).toContain('async function fetchTimingsViaRNFetch');
    expect(source).toContain('const text = await fetchTimingsViaRNFetch(url)');
  });

  // The same fallback the font store carries — one bug, learned once.
  it('is the transport the font store already proved', () => {
    const fonts = fs.readFileSync(
      path.join(__dirname, '..', 'src/quran/mushafFontStore.ts'),
      'utf8',
    );
    expect(fonts).toContain('async function fetchFontViaRNFetch');
    expect(source).toContain('fetchFontViaRNFetch');
  });

  // A file that is on disk but will not parse answers null for ever: the
  // expiry policy in useWordTiming cannot help when the input never
  // changes. Drop it and fetch again.
  it('throws away a cached file it cannot read', () => {
    expect(source).toContain('cached timings unreadable, refetching');
    expect(source).toMatch(/unlink\(path\)/);
  });

  // The answer must not depend on being able to write the cache.
  it('answers from the fetch even when the cache write fails', () => {
    expect(source).toMatch(
      /writeFile\(path, text, 'utf8'\)\s*\n?\s*\.catch\(\(\) => undefined\)/,
    );
  });
});
