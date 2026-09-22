/**
 * The publish phase — the part that cannot be rehearsed.
 *
 * Every other phase of release.sh can be run with --dry-run. This one
 * only ever runs for real, against a live tag, so its bugs are found in
 * the worst possible place. These tests are the rehearsal it cannot have.
 *
 * They exist because the first review of that phase found a live one:
 * `gh release create file#Label` sets a display LABEL, not the asset
 * name. The asset keeps the file's basename, so uploading gradle's output
 * directly would have published `app-fdroid-release.apk` — and every
 * download URL in existence would 404: the one in the release notes, the
 * one verify-release.sh checks, and the one F-Droid's recipe resolves.
 * The manual 2.13.0 release got this right only because the APK was
 * copied to its published name first.
 */
import { readFileSync } from 'fs';
import path from 'path';

const script = readFileSync(
  path.join(__dirname, '..', 'scripts', 'release.sh'),
  'utf8',
);
const verify = readFileSync(
  path.join(__dirname, '..', 'scripts', 'verify-release.sh'),
  'utf8',
);

describe('assets are published under the names people already have', () => {
  it('never uses the `file#Label` form, which does not rename anything', () => {
    expect(script).not.toMatch(/\$APK#/);
    expect(script).not.toMatch(/\$ZIP#/);
  });

  it('copies the APK to its published name before uploading', () => {
    // gradle emits app-github-release.apk; the world expects
    // Mihrab-vX.Y.Z.apk (Mihrab-vX.Y.Z-fdroid.apk up to 2.25.0, when the
    // Releases APK was still the F-Droid build).
    expect(script).toMatch(/cp "\$APK" "\$STAGE\/Mihrab-v\$VERSION\.apk"/);
    expect(script).toMatch(
      /gh release create[\s\S]*?\$STAGE\/Mihrab-v\$VERSION\.apk/,
    );
  });

  it('asks GitHub what it actually published', () => {
    // Uploading is not the same as having uploaded what you meant.
    expect(script).toContain('gh release view "$TAG"');
    expect(script).toContain('published under the wrong name');
  });

  it('publishes exactly the names verify-release.sh looks for', () => {
    // The two scripts agreeing is the whole point; they disagreed once.
    expect(verify).toContain('Mihrab-v$VERSION.apk');
    expect(verify).toContain('Mihrab-macOS-$VERSION.zip');
    expect(script).toContain('Mihrab-v$VERSION.apk');
    expect(script).toContain('Mihrab-macOS-$VERSION.zip');
  });
});

describe('a run that stops partway can be undone in one line', () => {
  it('the revert covers everything phase 2 writes, including the journal', () => {
    const revert = script.match(/^REVERT="([^"]*)"/m)?.[1] ?? '';
    // COVERAGE, not a literal substring. `git checkout -- docs` undoes
    // every file under it, and naming them one by one is what went stale:
    // the site grew to fourteen pages and the list still said one. So a
    // path counts as covered when it, or a directory above it, is there.
    const paths = revert.replace(/^git checkout -- /, '').trim().split(/\s+/);
    const covers = (f: string) =>
      paths.some(p => f === p || f.startsWith(`${p}/`));
    for (const f of [
      'android/app/build.gradle',
      'ios/PrayerApp.xcodeproj/project.pbxproj',
      'docs/index.html',
      // Every locale page the stamp reaches, not just the English one.
      'docs/sv/index.html',
      'docs/ar/index.html',
      'contrib/fdroid/com.prayer_times.yml',
      // The one that was missing: the entry is appended BEFORE the release
      // commit, so rerunning after a failed publish would add a second
      // entry for the same version.
      'docs/release-log.md',
    ]) {
      expect(covers(f)).toBe(true);
    }
  });

  it('a failed push says how to undo the commit it just made', () => {
    // A MIXED reset: --soft left the stamps staged and $REVERT (which
    // restores from the index) put them straight back (2.25.1).
    expect(script).toMatch(/push to main failed[\s\S]*?git reset -q HEAD~1 && \$REVERT && git pull --rebase/);
    expect(script).not.toMatch(/push to main failed[^\n]*\n[^\n]*\n[^\n]*reset --soft/);
  });
});

describe('the cask cannot be pushed stale', () => {
  it('checks the version and sha actually changed before pushing', () => {
    // The cask's version is whatever SHIPPED last, which need not be this
    // repo's previous version — a release abandoned between the tag and
    // the tap leaves them apart, and then the sed matches nothing.
    expect(script).toMatch(/has "\$NEW_CASK" "version \\"\$VERSION\\""/);
    expect(script).toMatch(/has "\$NEW_CASK" "sha256 \\"\$SHA\\""/);
    const check = script.indexOf('NEW_CASK="$(cat "$TAP")"');
    const push = script.indexOf('git push -q origin HEAD');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(push);
  });

  it('hashes the zip as served, not the local build', () => {
    expect(script).toMatch(/curl -sL -o "\$TMPZIP"/);
    expect(script).toMatch(/SHA=\$\(shasum -a 256 "\$TMPZIP"/);
  });
});

describe('the APK on GitHub is the github flavor, checked as served', () => {
  it('release.sh publishes the github build, not the F-Droid one', () => {
    expect(script).toContain(
      'APK="$ROOT/android/app/build/outputs/apk/github/release/app-github-release.apk"',
    );
    expect(script).toMatch(/assembleGithubRelease[\s\S]*?arm64-v8a,armeabi-v7a/);
    expect(script).toContain('github APK is ARM only');
    expect(script).toContain('github APK carries no Google Play Services');
  });

  it('verify-release.sh inspects the downloaded APK, not the local one', () => {
    expect(verify).toContain('exactly one APK on the release');
    expect(verify).toContain('published APK is ARM only');
    expect(verify).toContain('published APK carries no Google Play Services');
    expect(verify).toContain('published APK is signed with the release key');
  });
});
