/**
 * The website must name the version the app actually ships.
 *
 * Reported live: the site was advertising an old release. It carried the
 * number in two hand-edited places and had drifted from the app on both —
 * and from itself, the hero saying 2.8.3 (231) while the colophon said
 * 2.8.2 (230), neither of which was shipping.
 *
 * A release checklist that asks a human to retype a number in two files is
 * not a mechanism, it is a wish. This is the mechanism: the release cut
 * runs the suite, and a stale site fails it before anything is tagged.
 * `node scripts/sync-version.js` fixes it in one command.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const site = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf-8');
const gradle = fs.readFileSync(
  path.join(ROOT, 'android', 'app', 'build.gradle'),
  'utf-8',
);

const versionName = /versionName\s+"([^"]+)"/.exec(gradle)?.[1];
const versionCode = /versionCode\s+(\d+)/.exec(gradle)?.[1];

describe('website version', () => {
  it('reads a version out of the Android build', () => {
    // The source of truth is the file that cannot lie: it is what ends up
    // in the APK that aapt2 reports.
    expect(versionName).toMatch(/^\d+\.\d+\.\d+$/);
    expect(versionCode).toMatch(/^\d+$/);
  });

  it('names the shipped version in the hero', () => {
    expect(site).toContain(`<span>Version ${versionName} (${versionCode})</span>`);
  });

  it('names the shipped version in the colophon', () => {
    expect(site).toContain(`Mihrab ${versionName} (${versionCode}), built by`);
  });

  it('says the same version everywhere it says one', () => {
    // The two stamps disagreeing is the exact state this was found in.
    const mentioned = new Set(
      Array.from(site.matchAll(/Mihrab (\d+\.\d+\.\d+) \(\d+\)/g), m => m[1]),
    );
    for (const m of site.matchAll(/Version (\d+\.\d+\.\d+) \(\d+\)/g)) {
      mentioned.add(m[1]);
    }
    expect([...mentioned]).toEqual([versionName]);
  });
});
