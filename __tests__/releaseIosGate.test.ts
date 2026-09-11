/**
 * The iOS half of release verification, pinned.
 *
 * This gate exists because 2.13.0 archived, failed on upload, and was
 * reported as live on every channel anyway. Then it failed 2.13.1 the
 * other way: it announced "NEVER REACHED App Store Connect, and nothing
 * is building it" while run #550 was RUNNING on the release commit.
 *
 * The cause was one missing query parameter. `/buildRuns` without
 * `sort=-number` returns the OLDEST runs — #436 onwards, complete since
 * spring — so the in-flight branch inspected history and could only ever
 * reach the failure verdict. A gate with one reachable answer is not a
 * gate, and a gate that cries wolf every release is worse than none.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const py = readFileSync(path.join(ROOT, 'scripts', 'xcode-cloud.py'), 'utf8');
const verify = readFileSync(path.join(ROOT, 'scripts', 'verify-release.sh'), 'utf8');

describe('build runs are read newest first', () => {
  it('every buildRuns query sorts', () => {
    // Not stylistic. Unsorted is oldest-first, which is silently wrong
    // for every question this file asks.
    const queries = py.match(/buildRuns\?[^"]*/g) ?? [];
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) expect(q).toContain('sort=-number');
  });
});

describe('"nothing is building it" is reachable only when true', () => {
  it('reports the run it found still going', () => {
    expect(py).toContain('is still going');
    expect(py).toMatch(/executionProgress"\) in \("PENDING", "RUNNING"\)/);
  });

  it('separates "not picked up yet" from "the trigger never fired"', () => {
    // Xcode Cloud creates the run a minute or two after the push, and
    // verification runs seconds after it. Without a grace window the
    // honest answer and the false alarm are the same output.
    expect(py).toContain('TRIGGER_GRACE_MINUTES');
    expect(py).toContain('has not created a run for');
    expect(py).toContain('the push trigger did not fire');
  });

  it('takes the release commit and the CLI forwards it', () => {
    expect(py).toMatch(/def shipped\(version: str, commit: str \| None = None\)/);
    expect(py).toMatch(/shipped\(sys\.argv\[2\], \*sys\.argv\[3:4\]\)/);
  });
});

describe('verify-release.sh asks the question properly', () => {
  it('hands over the tagged commit', () => {
    // -q --verify: a bare rev-parse prints the ref back on an unknown
    // tag and exits 1, so `|| true` would hand "v9.9.9^{commit}" to the
    // tool as a SHA.
    expect(verify).toMatch(/git rev-parse -q --verify "\$TAG\^\{commit\}"/);
    expect(verify).toMatch(/shipped "\$VERSION" \$\{xc_sha:\+"\$xc_sha"\}/);
  });

  it('prints what the tool actually said, not a canned line', () => {
    // "still building" was printed for exit 3 regardless of the reason,
    // hiding which commit — or whether any — was being built.
    expect(verify).not.toContain('still building — re-run this script');
    // Both verdicts echo the tool. They print different marks — ✓ for a
    // finished upload, ⧗ for a run still going — but neither substitutes
    // a canned line for what the tool actually said.
    expect(verify).toMatch(/pass "iOS: \$xc_out"/);
    expect(verify).toMatch(/pend "iOS: \$xc_out"/);
  });

  it('still fails the release on a genuine miss', () => {
    expect(verify).toMatch(/\*\) fail "iOS: \$xc_out" ;;/);
  });
});

describe('the summary line only claims what is true', () => {
  it('does not say "live on every channel" while iOS is mid-build', () => {
    // The exit-3 verdict is a pass, not a completion. Collapsing the two
    // is how 2.13.0 was declared finished with nothing on iPhone or iPad.
    expect(verify).toContain('PENDING=1');
    // The wording is now shared with the CI gate, which pends for the
    // same reason, so it names no single channel. What must hold is that
    // the pending branch exists and does not claim completion.
    const summary = verify.slice(
      verify.indexOf('if [ "$FAILED" = "0" ] && [ "$PENDING" = "1" ]'),
    );
    const branch = summary.slice(0, summary.indexOf('elif'));
    const printed = branch.match(/^\s*echo "(.*)"$/m)?.[1] ?? '';
    expect(printed).toMatch(/still running/);
    expect(printed).not.toMatch(/live on every channel/);
    expect(verify).toMatch(/\$FAILED" = "0" \] && \[ "\$PENDING" = "1"/);
  });

  it('a pending iOS build is still exit 0', () => {
    // release.sh runs this immediately after publishing; a build that has
    // not finished yet must not fail the cut.
    const exits = verify.match(/exit 1/g) ?? [];
    expect(exits).toHaveLength(1);
  });
});

/**
 * iOS BUILDS ONCE PER RELEASE, AND ONLY FROM THE RELEASE.
 *
 * Every run posts its result to GitHub as a commit status named
 * `PrayerApp | Default`, and on a public repository every status is
 * public. Runs #724 to #728 were all COMPLETE/CANCELED — cancelled by the
 * next push, including the prayer-times data cron's — so `main` wore a red
 * X next to five green GitHub Actions checks, describing nothing about the
 * code.
 *
 * The workflow used to be PAUSED between releases to prevent that, with
 * release.sh arming it for a few seconds and a `trap` disarming it on
 * every path out. Since 2026-09-11 the defence is upstream instead:
 * nothing is pushed to `main` except a release, so the workflow can stay
 * enabled and still only ever see release commits.
 *
 * What these pin is what makes THAT safe, because it has two sharp edges.
 * The crons push on their own schedule and are skipped by the start
 * condition rather than by anything in this repo — and that rule has to
 * cover `src/providers/data`, not just `data`, because every bot commit
 * writes a seed file there too. And a run must not be started blindly
 * next to the push's own: two concurrent runs do not race, they both die.
 */
describe('the release is the only thing that builds iOS', () => {
  const releaseSh = readFileSync(
    path.join(__dirname, '..', 'scripts', 'release.sh'),
    'utf8',
  );
  const xc = readFileSync(
    path.join(__dirname, '..', 'scripts', 'xcode-cloud.py'),
    'utf8',
  );

  it('waits for the push trigger instead of starting a run blindly', () => {
    const step = releaseSh.slice(releaseSh.indexOf('step "App Store build"'));
    expect(step).toContain('$XC ensure "$RELEASE_SHA"');
    // The arming is gone with the reason for it. A release that armed the
    // trigger and fell over before disarming was the failure mode this
    // whole arrangement replaced; there is now nothing to leave armed.
    expect(step).not.toContain('$XC resume');
    expect(step).not.toContain('XC_ARMED=1');
    expect(releaseSh).not.toMatch(/trap xc_pause/);
  });

  it('starts a run by hand only when the trigger did not fire', () => {
    const fn = xc.slice(xc.indexOf('def ensure('));
    // The 2026-08-07 incident: pushed, and nothing after thirty minutes.
    // A run started by hand picked up the same commit and succeeded.
    expect(fn).toContain('the push trigger did not fire');
    // And the 2026-08-26 one, which is why it is not started blindly.
    expect(fn).toContain('in_flight()');
    expect(fn).toMatch(/Starting a second would kill both/);
  });

  it('skips the dataset crons by path, seed files included', () => {
    // The crons push to main roughly daily and nobody drives them. The
    // workflow's own start condition is what stops them building, and the
    // `data` matcher alone skipped NOTHING: every bot commit writes
    // src/providers/data/{ifis,habous}Seed.json as well as data/.
    expect(releaseSh).toContain('src/providers/data');
    expect(releaseSh).toContain('DO_NOT_START_IF_ALL_FILES_MATCH');
  });

  it('never dies between arming and disarming', () => {
    // Everything in the App Store step is a warn: the release is already
    // public by then, and Apple refusing to start a run is a retry, not a
    // release to unwind. A `die` in there would skip nothing (the trap
    // still fires) but it would unwind a published release for a
    // recoverable fault.
    const start = releaseSh.indexOf('step "App Store build"');
    const end = releaseSh.indexOf('PHASE 4 — VERIFY', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(releaseSh.slice(start, end)).not.toMatch(/\bdie\b/);
  });

  it('refuses to start a run while the workflow is paused', () => {
    // Otherwise the failure is an HTTP error from inside Apple's API,
    // which reads like the rate limiting it is not.
    expect(xc).toContain('if not workflow_enabled(default_workflow(product())):');
    expect(xc).toContain('the Default workflow is paused');
  });

  it('pauses by isEnabled, because a null start condition is ignored', () => {
    // App Store Connect treats an attribute sent as null as one you did
    // not send: clearing branchStartCondition returns 200 and changes
    // nothing, which is a fine way to believe the trigger is off for a
    // whole release.
    expect(xc).toMatch(/"isEnabled": False/);
    expect(xc).toMatch(/NULL IS NOT A VALUE HERE/);
  });
});
