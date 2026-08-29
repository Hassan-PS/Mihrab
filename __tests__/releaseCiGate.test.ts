/**
 * The release cycle asks GitHub whether CI passed. Pinned, because it
 * spent five releases not asking.
 *
 * `release.sh` ran `jest` and `tsc` on this machine and called that
 * tested. CI is a different question — clean Linux checkout, fresh
 * install, none of this machine's caches or build artefacts — and it is
 * the copy everyone else reads to decide whether the tree is healthy.
 *
 * Nobody read it. From 2.13.1 onward every release commit went red for
 * one reason: `release.sh` writes `_(unfilled)_` into the journal and a
 * test asserted the marker never appears. Four failure mails arrived and
 * none was connected to the release that sent it, because the cycle that
 * caused them never mentioned CI existed. A permanently red main teaches
 * people to stop opening CI at all, which costs more than the failure.
 *
 * Two gates, deliberately asking different questions:
 *   • preflight  — is main already red? Do not stack a release on it.
 *   • post-release — did the tag's own commit pass? F-Droid builds from
 *     the tag, and main going green afterwards does not fix the tag.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const release = readFileSync(path.join(ROOT, 'scripts', 'release.sh'), 'utf8');
const verify = readFileSync(path.join(ROOT, 'scripts', 'verify-release.sh'), 'utf8');

describe('preflight refuses to release on top of a red main', () => {
  it('asks GitHub for the CI workflow on main', () => {
    expect(release).toMatch(/gh run list --workflow=ci\.yml --branch main/);
  });

  it('reads a completed run, because in-flight is not a verdict', () => {
    // The newest run on main is usually the one still going on the
    // commit being released from. Reading it would block every release
    // for the length of a CI run, and a gate that always cries wolf is
    // worse than no gate.
    expect(release).toMatch(/--workflow=ci\.yml --branch main --status completed/);
  });

  it('dies on any conclusion that is not success', () => {
    const gate = release.slice(release.indexOf('CI ON MAIN IS NOT ALREADY RED'));
    const branch = gate.slice(0, gate.indexOf('esac'));
    // Not a list of known-bad conclusions: cancelled, timed_out and
    // action_required are all "not a pass" and all must block.
    expect(branch).toMatch(/case "\$CI_CONCLUSION" in/);
    expect(branch).toMatch(/\s\*\)/);
    expect(branch).toContain('die "CI on main last concluded');
  });

  it('treats a repo with no completed runs as fine, not as broken', () => {
    // A fresh clone, or the first release after adding the workflow.
    const gate = release.slice(release.indexOf('CI ON MAIN IS NOT ALREADY RED'));
    expect(gate.slice(0, gate.indexOf('esac'))).toMatch(/""\|success\)/);
  });

  it('runs before anything is pushed, tagged or published', () => {
    const gate = release.indexOf('CI ON MAIN IS NOT ALREADY RED');
    expect(gate).toBeGreaterThan(-1);
    for (const irreversible of ['git push -q origin main', 'git tag -a', 'gh release create']) {
      expect(release.indexOf(irreversible)).toBeGreaterThan(gate);
    }
  });
});

describe('verification asks about the commit that was actually released', () => {
  it('queries the tag’s commit, not the branch', () => {
    // main moving on afterwards does not make the tag green, and the tag
    // is what F-Droid builds and what anyone bisecting checks out.
    expect(verify).toMatch(/gh run list --workflow=ci\.yml --commit "\$CI_SHA"/);
  });

  it('resolves the tag with -q --verify', () => {
    // A bare `rev-parse "$TAG^{commit}" || true` prints the argument
    // back on an unknown ref and exits 1, so the `|| true` hands the
    // literal string "v9.9.9^{commit}" onward as if it were a SHA. Found
    // by running the check against a tag that does not exist.
    expect(verify).toMatch(/rev-parse -q --verify "\$TAG\^\{commit\}"/);
  });

  it('has all three outcomes reachable', () => {
    const gate = verify.slice(verify.indexOf('CI IS GREEN ON THE COMMIT THAT WAS RELEASED'));
    expect(gate).toContain('pass "CI: green on');
    expect(gate).toMatch(/fail "CI: \$CI_CONCLUSION on the released commit/);
    expect(gate).toMatch(/pend "CI: \$CI_STATUS on/);
  });

  it('does not call an unfinished run a pass', () => {
    // The distinction 2.13.0 was shipped without: a ✓ next to "still
    // building" reads as done. Every unfinished state goes through
    // pend(), so PENDING is set in exactly one place and a caller
    // cannot print a ✓ and mark the run pending in the same breath.
    expect(verify).toMatch(/^pend\(\) \{ echo "⧗ \$1"; PENDING=1; \}$/m);
    const assignments = verify.match(/^\s*.*PENDING=1/gm) ?? [];
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toContain('pend()');
  });

  it('holds the summary back while anything is unfinished', () => {
    expect(verify).toMatch(/FAILED" = "0" \] && \[ "\$PENDING" = "1"/);
    expect(verify).not.toContain('ALL CHECKS PASSED — release $TAG is live on every channel ──"\n  ');
  });
});
