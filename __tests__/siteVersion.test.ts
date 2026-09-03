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
const siteSv = fs.readFileSync(
  path.join(ROOT, 'docs', 'sv', 'index.html'),
  'utf-8',
);
const gradle = fs.readFileSync(
  path.join(ROOT, 'android', 'app', 'build.gradle'),
  'utf-8',
);

const versionName = /versionName\s+"([^"]+)"/.exec(gradle)?.[1];
const versionCode = /versionCode\s+(\d+)/.exec(gradle)?.[1];

describe('F-Droid recipe mirror', () => {
  // Not what F-Droid reads any more — their bot adds versions from the tag
  // — but it IS what verify-release.sh reads, and it had gone three
  // versions stale while still naming a tag that had been deleted.
  const recipe = fs.readFileSync(
    path.join(ROOT, 'contrib', 'fdroid', 'com.prayer_times.yml'),
    'utf-8',
  );

  it('names the shipped version', () => {
    expect(recipe).toContain(`CurrentVersion: ${versionName}`);
    expect(recipe).toContain(`CurrentVersionCode: ${versionCode}`);
  });

  it('has a build entry for it', () => {
    expect(recipe).toMatch(
      new RegExp(`versionName: ${String(versionName).replace(/\./g, '\\.')}\\b`),
    );
    expect(recipe).toMatch(new RegExp(`versionCode: ${versionCode}\\b`));
  });
});

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

  it('names the shipped version in the structured data', () => {
    // Nobody looks at this on the page — search engines do. Stale here is
    // stale in whatever Google shows about the app.
    expect(site).toContain(`"softwareVersion": "${versionName}"`);
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

/**
 * The Swedish page carries the same three stamps, and would go stale the
 * same way — more quietly, because nobody proof-reads a page in a language
 * they do not read to check a number in it.
 */
describe('the Swedish page', () => {
  it('names the shipped version in the hero', () => {
    expect(siteSv).toContain(
      `<span>Version ${versionName} (${versionCode})</span>`,
    );
  });

  it('names the shipped version in the colophon', () => {
    expect(siteSv).toContain(`Mihrab ${versionName} (${versionCode}), byggd av`);
  });

  it('names the shipped version in the structured data', () => {
    expect(siteSv).toContain(`"softwareVersion": "${versionName}"`);
  });

  it('says the same version everywhere it says one', () => {
    const mentioned = new Set(
      Array.from(siteSv.matchAll(/Mihrab (\d+\.\d+\.\d+) \(\d+\)/g), m => m[1]),
    );
    for (const m of siteSv.matchAll(/Version (\d+\.\d+\.\d+) \(\d+\)/g)) {
      mentioned.add(m[1]);
    }
    expect([...mentioned]).toEqual([versionName]);
  });
});
