/**
 * The reader opens the moment the download starts.
 *
 * Nobody read anything until all 180 MB had landed: the gate held a
 * progress bar in front of the muṣḥaf for as long as six hundred files
 * took. A page needs only its own font, the surface fetches that on
 * demand, and the pages either side are warmed ahead — so once the
 * download has been asked for, the reader opens and carries a strip.
 */
import { readFileSync } from 'fs';
import path from 'path';

const gate = readFileSync(
  path.join(__dirname, '..', 'src', 'quran', 'MushafReader.tsx'),
  'utf8',
);

describe('the gate', () => {
  it('asks once, and opens the reader on the answer', () => {
    expect(gate).toMatch(/setDownloadStatus\('downloading'\);\s*\n\s*setReading\(true\);/);
  });

  it('never shows the blocking progress screen again', () => {
    // The old branch: a title, a bar, a cancel, and nothing to read.
    expect(gate).not.toMatch(/if \(downloadStatus === 'downloading'\) \{/);
    expect(gate).not.toMatch(/quran\.mushafDownloading'/);
  });

  it('keeps the book on a cancelled or failed run — only the strip goes', () => {
    // Both gate screens are skipped once reading has begun; the strip is
    // tied to the download state alone.
    expect(gate).toMatch(/downloadStatus === 'checking' && !reading/);
    expect(gate).toMatch(/downloadStatus === 'needs_download' && !reading/);
    expect(gate).toMatch(/downloadStatus === 'downloading' \? \(/);
  });

  it('says what will happen before it is asked to', () => {
    expect(gate).toMatch(/quran\.mushafDownloadReadHint/);
    expect(gate).toMatch(/quran\.mushafDownloadReadCta/);
  });
});
