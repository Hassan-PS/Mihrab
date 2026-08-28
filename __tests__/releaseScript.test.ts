/**
 * The release cycle, pinned.
 *
 * `scripts/release.sh` replaced a thirteen-step checklist that was run by
 * hand. Every release incident this project has had came out of that list:
 * an ad-hoc signed macOS build with no entitlements (2.11.0), a tag pushed
 * before `main` landed, release notes Play rejected for length — found
 * after the tag was public — and, for days at a time, fixes merged and
 * shipped to nobody.
 *
 * A list drifts silently. These are the properties that made it dangerous,
 * so they are the ones worth failing a build over.
 */
import { readFileSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const script = readFileSync(path.join(ROOT, 'scripts', 'release.sh'), 'utf8');
const docs = readFileSync(path.join(ROOT, 'docs', 'DISTRIBUTION.md'), 'utf8');

/** Where in the file something appears, or -1. */
const at = (needle: string) => script.indexOf(needle);

describe('everything that can fail happens before anything irreversible', () => {
  // The single property the whole script is built around. If a check ever
  // drifts below the first push, it stops being a check and becomes a
  // post-mortem.
  const FIRST_IRREVERSIBLE = 'git push -q origin main';

  it('has a publish step to be before', () => {
    expect(at(FIRST_IRREVERSIBLE)).toBeGreaterThan(-1);
  });

  it.each([
    ['the test suite', 'npx jest'],
    ['typechecking', 'npx tsc --noEmit'],
    ['the Play release-notes limit', "Play's limit is 500"],
    ['the tag being free', 'already exists on origin'],
    ['the cask postflight', 'no chronod postflight'],
    ['the Xcode Cloud in-flight guard', 'already in flight'],
    ['the published zip being Developer ID signed', 'TeamIdentifier=GAW23HT439'],
    ['the App Group entitlement', 'no App Group entitlement'],
    ['the APK reporting the version it was stamped with', 'wrong versionCode'],
  ])('%s is checked before the first push', (_label, needle) => {
    const where = at(needle);
    expect(where).toBeGreaterThan(-1);
    expect(where).toBeLessThan(at(FIRST_IRREVERSIBLE));
  });

  it('pushes main, then the tag, then the release, then the tap', () => {
    // Each is recoverable only because the one before it succeeded. A tag
    // pushed while main is still local names a commit nobody can fetch,
    // and this project never moves a pushed tag.
    const order = [
      'git push -q origin main',
      'git push -q origin "$TAG"',
      'gh release create',
      'tap push failed',
    ].map(at);
    expect(order.every(i => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('the script is the only procedure', () => {
  it('is executable', () => {
    // A release script nobody can run is a release script nobody runs.
    const mode = statSync(path.join(ROOT, 'scripts', 'release.sh')).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  it('the docs point at it rather than restating it', () => {
    expect(docs).toContain('scripts/release.sh');
    // The two hand-run checklists it replaced. They are what drifted:
    // by the end neither mentioned the Catalyst build, the Homebrew cask,
    // signing, or the release-notes limit.
    expect(docs).not.toMatch(/☐/);
  });

  it('names the manual steps it deliberately does not do', () => {
    // Play upload and App Store submission need a human at a console.
    // Silence about them is how a release gets called finished while two
    // of four channels have not shipped.
    expect(script).toContain('Still yours to do');
    expect(script).toMatch(/Play/);
    expect(script).toMatch(/App Store/);
  });

  it('can answer what is unreleased without cutting anything', () => {
    // The question that went unasked for days at a time.
    expect(script).toContain('--unreleased');
    expect(script).toContain('released to nobody');
  });

  it('builds the two Android flavors as separate gradle invocations', () => {
    // They have different signing config and manifest merges; one run has
    // produced an APK carrying the other flavor's settings.
    expect(script).toMatch(/gradlew -q assemblePlayRelease bundlePlayRelease/);
    expect(script).toMatch(/gradlew -q assembleFdroidRelease/);
  });
});
