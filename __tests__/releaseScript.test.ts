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

describe('every variable it reads is one something sets', () => {
  /**
   * 2.19.0: the Xcode Cloud check read `$RELEASE_SHA`, and nothing in the
   * file ever assigned it. Under `set -u` that is fatal inside the command
   * substitution it sat in — so the check reported "Xcode Cloud has no run
   * for this release" about a run that was right there, and fell through to
   * the local build. Every release since that line was written went the
   * local way for a reason nobody had read.
   *
   * `bash -n` is no help: the syntax is perfect. Only running the line
   * finds it, and that line runs once per release, in the half of the
   * script that nothing but a real release reaches.
   */
  const SCRIPTS = [
    'release.sh',
    'verify-release.sh',
    'build-catalyst.sh',
    'build-ios-appstore.sh',
  ];

  /** Set by the shell or the environment, not by the script. */
  const ENVIRONMENT = new Set([
    'HOME', 'PATH', 'PWD', 'TMPDIR', 'USER', 'SHELL', 'LANG', 'LC_ALL',
    'IFS', 'PS1', 'PS4', 'BASH_SOURCE', 'BASH_VERSION', 'FUNCNAME',
    'RANDOM', 'SECONDS', 'PPID', 'UID', 'EUID', 'OSTYPE', 'HOSTNAME',
    'LINENO', 'PIPESTATUS', 'SHLVL', 'TERM', 'COLUMNS',
  ]);

  const NAME = '[A-Za-z_][A-Za-z0-9_]*';

  /** Names this file assigns, anywhere, by any of the usual means. */
  function assignedIn(code: string): Set<string> {
    const out = new Set<string>();
    const add = (n: string) => out.add(n);
    for (const m of code.matchAll(
      new RegExp(`(?:^|[\\s;(&|{])(?:export |local |readonly |declare )?(${NAME})(?:\\[[^\\]]*\\])?\\+?=`, 'gm'),
    )) add(m[1]);
    for (const m of code.matchAll(new RegExp(`\\bfor\\s+(${NAME})\\s+in\\b`, 'g'))) add(m[1]);
    // for ((i = 0; i < n; i++))
    for (const m of code.matchAll(new RegExp(`\\bfor\\s*\\(\\(\\s*(${NAME})\\s*=`, 'g'))) add(m[1]);
    // read, past its flags and their arguments — `read -r -d '' fw`
    for (const m of code.matchAll(
      new RegExp(`\\bread\\s+(?:(?:-[A-Za-z]+|'[^']*'|"[^"]*")\\s+)*(${NAME}(?:\\s+${NAME})*)`, 'g'),
    )) for (const n of m[1].split(/\s+/)) add(n);
    return out;
  }

  /** Names this file reads without a `${x:-default}` to fall back on. */
  function readUnguarded(code: string): Map<string, number> {
    const out = new Map<string, number>();
    code.split('\n').forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      for (const m of line.matchAll(new RegExp(`\\$\\{(${NAME})([^}]*)\\}`, 'g'))) {
        if (/^:?[-+=?]/.test(m[2])) continue; // has a default, or errors on purpose
        if (!out.has(m[1])) out.set(m[1], i + 1);
      }
      for (const m of line.matchAll(new RegExp(`\\$(${NAME})`, 'g')))
        if (!out.has(m[1])) out.set(m[1], i + 1);
    });
    return out;
  }

  it.each(SCRIPTS)('%s', name => {
    const code = readFileSync(path.join(ROOT, 'scripts', name), 'utf8');
    if (!/set -[a-z]*u/.test(code)) return; // not under `set -u`: not this test's business
    const assigned = assignedIn(code);
    const unset = [...readUnguarded(code)]
      .filter(([n]) => !assigned.has(n) && !ENVIRONMENT.has(n))
      .map(([n, line]) => `${name}:${line} $${n}`);
    expect(unset).toEqual([]);
  });
});
