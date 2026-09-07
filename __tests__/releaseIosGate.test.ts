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
 * The Xcode Cloud workflow is paused between releases — `isEnabled` false,
 * so a push to `main` starts nothing at all. That is not a build-minutes
 * decision: every run posts its result to GitHub as a commit status named
 * `PrayerApp | Default`, and on a public repository every status is
 * public. Runs #724 to #728 were all COMPLETE/CANCELED — cancelled by the
 * next push, including the prayer-times data cron's — so `main` wore a red
 * X next to five green GitHub Actions checks, describing nothing about the
 * code.
 *
 * So release.sh arms the trigger for the few seconds it takes to start a
 * run on the commit it just tagged, and disarms it again. What these pin
 * is the disarming: the window has to close on EVERY path out of the
 * script, not just the happy one, or an interrupted release leaves the
 * trigger armed and the next unrelated push builds, posts and is
 * cancelled — exactly the state this replaced.
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

  it('arms the trigger, starts a run, and disarms it', () => {
    const step = releaseSh.slice(releaseSh.indexOf('step "App Store build"'));
    expect(step).toContain('$XC resume');
    expect(step).toContain('XC_ARMED=1');
    expect(step).toContain('$XC start');
    // Disarmed in the same step, not left to the end of the script.
    const armed = step.indexOf('XC_ARMED=1');
    const disarmed = step.indexOf('xc_pause');
    expect(disarmed).toBeGreaterThan(armed);
    expect(disarmed - armed).toBeLessThan(1200);
  });

  it('closes the window on every path out, including a die', () => {
    // `die` exits without running cleanup_workbench — it always has — so
    // the pause cannot live at the end of the script.
    expect(releaseSh).toMatch(/trap xc_pause EXIT INT TERM/);
    const fn = releaseSh.slice(releaseSh.indexOf('xc_pause() {'));
    // Idempotent: the trap fires again on a normal exit, after the step
    // already paused, and must not un-pause or report twice.
    expect(fn).toContain('[ "$XC_ARMED" = "1" ] || return 0');
    // A pause that fails is the one thing here that must be loud.
    expect(fn).toContain('STILL ARMED');
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
