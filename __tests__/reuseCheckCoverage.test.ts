/**
 * The reuse check reports on the repository, not on itself — issue #28.
 *
 * It spent its Mondays opening an issue to say that one of its three checks
 * had stopped running. That check is clone traffic, which reads an
 * Administration endpoint a workflow's default token cannot have and cannot
 * be granted: `administration` is not a key the workflow permissions block
 * accepts, and GitHub rejects the whole file with a 422 for trying. So the
 * alert was permanent, unfixable from inside the repo, and weekly — which
 * is the fastest way to teach someone to close this report unread.
 *
 * Coverage now means the checks that can actually run. The traffic reading
 * is still taken and still drives the clone-spike alert when a PAT makes it
 * available; it is simply not something whose absence is news.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const watch = readFileSync(path.join(ROOT, 'scripts', 'mihrab-watch.sh'), 'utf8');
const workflow = readFileSync(
  path.join(ROOT, '.github', 'workflows', 'reuse-check.yml'),
  'utf8',
);

describe('coverage is what can run, not what would be nice', () => {
  it('leaves traffic out of the capability set', () => {
    const caps = watch.slice(watch.indexOf('caps="forks"'));
    expect(caps.slice(0, 200)).not.toContain('caps,traffic');
    expect(caps).toContain('[ "$search_ok" = "1" ] && caps="$caps,codesearch"');
  });

  it('does not compare against a baseline that still names traffic', () => {
    // Baselines written before this change say forks,traffic,codesearch. Left
    // alone they would fire the alert one last time, which is the same bug
    // with an end date.
    const line = /old_caps=\$\(json_get caps "([^"]*)"([^)]*)\)/.exec(watch);
    expect(line).not.toBeNull();
    expect(line![1]).toBe('forks,codesearch');
    expect(line![2]).toContain('traffic');
    expect(watch).toMatch(/old_seen=\$\(json_get caps_seen ""[^)]*traffic/);
  });

  it('still reads the traffic figure, for the spike alert', () => {
    // Dropping it from coverage is not dropping the check: a PAT still
    // brings the clone count back with no further change.
    expect(watch).toContain('gh api "repos/$REPO/traffic/clones"');
    expect(watch).toMatch(/CLONE TRAFFIC: \$clones unique cloners/);
  });

  it('says a coverage loss is a real loss when it does fire', () => {
    // Both remaining checks work on the default token, so if one stops it is
    // an expired PAT or a refusing API — something to act on, not a
    // permission that was never available.
    const at = watch.indexOf('CHECK COVERAGE changed');
    expect(at).toBeGreaterThan(-1);
    const msg = watch.slice(at, at + 500);
    expect(msg).toContain('work on the default GITHUB_TOKEN');
    expect(msg).not.toContain('MIHRAB_WATCH_TOKEN');
  });

  it('the workflow says the same thing as the script', () => {
    expect(workflow.replace(/\n#\s*/g, ' ')).toContain(
      'its absence is not a finding',
    );
  });
});
