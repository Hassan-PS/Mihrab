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
    expect(verify).toMatch(/git rev-parse "\$TAG\^\{commit\}"/);
    expect(verify).toMatch(/shipped "\$VERSION" \$\{xc_sha:\+"\$xc_sha"\}/);
  });

  it('prints what the tool actually said, not a canned line', () => {
    // "still building" was printed for exit 3 regardless of the reason,
    // hiding which commit — or whether any — was being built.
    expect(verify).not.toContain('still building — re-run this script');
    expect(verify.match(/pass "iOS: \$xc_out"/g) ?? []).toHaveLength(2);
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
    expect(verify).toMatch(/iOS is still building, re-run this when it lands/);
    expect(verify).toMatch(/\$FAILED" = "0" \] && \[ "\$PENDING" = "1"/);
  });

  it('a pending iOS build is still exit 0', () => {
    // release.sh runs this immediately after publishing; a build that has
    // not finished yet must not fail the cut.
    const exits = verify.match(/exit 1/g) ?? [];
    expect(exits).toHaveLength(1);
  });
});
